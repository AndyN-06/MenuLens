"""
MenuLens FastAPI Backend
"""
from contextlib import asynccontextmanager
from io import BytesIO
import asyncio
import uuid
import logging
import traceback
from typing import Optional

import json as _json

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .ocr import extract_text_from_image
from .llm import parse_menu_text, health_check_ollama, summarize_taste_profile
from .scoring import score_dishes
from sqlalchemy import text
from .database import get_db, engine
from .models import User, TasteProfile, RestaurantVisit, Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _warmup_ocr():
    """Initialize the EasyOCR singleton before the first request arrives."""
    try:
        from .ocr import _get_reader
        logger.info("Pre-warming EasyOCR reader...")
        _get_reader()
        logger.info("EasyOCR reader ready.")
    except Exception as e:
        logger.warning(f"OCR warmup failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Idempotent column migrations — safe to run on every startup
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"
        ))
        conn.execute(text(
            "ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS top_dishes JSONB"
        ))
        conn.execute(text(
            "ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS avg_score_threshold FLOAT"
        ))
        conn.commit()
    loop = asyncio.get_event_loop()
    asyncio.ensure_future(loop.run_in_executor(None, _warmup_ocr))
    yield


app = FastAPI(title="MenuLens API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class TasteProfileCreate(BaseModel):
    cuisine_affinities: dict[str, float] = {}
    flavor_tags: list[str] = []
    disliked_tags: list[str] = []
    dietary_restrictions: list[str] = []
    rated_dishes: list[dict] = []


class TasteProfilePatch(BaseModel):
    cuisine_affinities: Optional[dict[str, float]] = None
    flavor_tags: Optional[list[str]] = None
    disliked_tags: Optional[list[str]] = None
    dietary_restrictions: Optional[list[str]] = None
    rated_dishes: Optional[list[dict]] = None


class LoginRequest(BaseModel):
    username: str


class VisitCreate(BaseModel):
    restaurant_name: str
    cuisine_type: Optional[str] = None
    restaurant_rating: Optional[int] = None
    favorite_dish: Optional[str] = None
    dish_rating: Optional[int] = None
    source: str = "manual"


class RankRequest(BaseModel):
    dishes: list[dict]
    restaurant_name: str
    cuisine_type: str
    user_id: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")


def _profile_to_dict(p: TasteProfile) -> dict:
    return {
        "id": str(p.id),
        "user_id": str(p.user_id),
        "cuisine_affinities": p.cuisine_affinities or {},
        "flavor_tags": p.flavor_tags or [],
        "disliked_tags": p.disliked_tags or [],
        "dietary_restrictions": p.dietary_restrictions or [],
        "rated_dishes": p.rated_dishes or [],
        "top_dishes": p.top_dishes or [],
        "avg_score_threshold": p.avg_score_threshold if p.avg_score_threshold is not None else 5.0,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _visit_to_dict(v: RestaurantVisit) -> dict:
    return {
        "id": str(v.id),
        "user_id": str(v.user_id),
        "restaurant_name": v.restaurant_name,
        "cuisine_type": v.cuisine_type,
        "restaurant_rating": v.restaurant_rating,
        "favorite_dish": v.favorite_dish,
        "dish_rating": v.dish_rating,
        "source": v.source,
        "visited_at": v.visited_at.isoformat() if v.visited_at else None,
    }


def recompute_profile(db: Session, user_id: uuid.UUID) -> TasteProfile:
    """Re-derive TasteProfile fields from all RestaurantVisit rows for this user."""
    visits = (
        db.query(RestaurantVisit)
        .filter(RestaurantVisit.user_id == user_id)
        .all()
    )

    # cuisine_affinities: mean restaurant_rating per cuisine, normalised to 0–1
    cuisine_ratings: dict[str, list[float]] = {}
    for v in visits:
        if v.cuisine_type and v.restaurant_rating is not None:
            cuisine_ratings.setdefault(v.cuisine_type, []).append(float(v.restaurant_rating))
    cuisine_affinities = {
        c: round(sum(rs) / len(rs) / 10.0, 3)
        for c, rs in cuisine_ratings.items()
    }

    # top_dishes: favorite_dish where dish_rating >= 7
    top_dishes = [
        v.favorite_dish for v in visits
        if v.favorite_dish and v.dish_rating is not None and v.dish_rating >= 7
    ]

    # avg_score_threshold: mean of all dish_ratings (or 5.0 default)
    dish_ratings = [float(v.dish_rating) for v in visits if v.dish_rating is not None]
    avg_score_threshold = round(sum(dish_ratings) / len(dish_ratings), 2) if dish_ratings else 5.0

    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if profile:
        profile.cuisine_affinities = cuisine_affinities
        profile.top_dishes = top_dishes
        profile.avg_score_threshold = avg_score_threshold
    else:
        profile = TasteProfile(
            id=uuid.uuid4(),
            user_id=user_id,
            cuisine_affinities=cuisine_affinities,
            top_dishes=top_dishes,
            avg_score_threshold=avg_score_threshold,
            flavor_tags=[],
            disliked_tags=[],
            dietary_restrictions=[],
            rated_dishes=[],
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return profile


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "menulens-backend"}


@app.get("/health/llm")
async def health_llm():
    result = health_check_ollama()
    if result["status"] == "error":
        raise HTTPException(status_code=503, detail=result)
    if result["status"] == "model_not_pulled":
        raise HTTPException(status_code=424, detail=result)
    return result


# ── OCR — debug endpoint ──────────────────────────────────────────────────────

@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        image_data = await file.read()
        logger.info(f"[OCR] processing {file.filename} ({len(image_data):,} bytes)")
        raw_text = extract_text_from_image(image_data)
        lines = [l for l in raw_text.splitlines() if l.strip()]
        logger.info(f"[OCR] extracted {len(lines)} lines from {file.filename}")
        return {"filename": file.filename, "text": raw_text, "char_count": len(raw_text)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ── Parse — debug endpoint ────────────────────────────────────────────────────

@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        image_data = await file.read()
        raw_text = extract_text_from_image(image_data)
        parsed = parse_menu_text(raw_text)
        return {
            "filename": file.filename,
            "dish_count": len(parsed.get("dishes", [])),
            **parsed,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ── Users / Auth ──────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = User(id=uuid.uuid4(), username=username)
        db.add(user)
        db.commit()
        db.refresh(user)

    has_profile = (
        db.query(TasteProfile).filter(TasteProfile.user_id == user.id).first()
        is not None
    )
    return {"user_id": str(user.id), "username": user.username, "has_profile": has_profile}


@app.post("/api/users")
def create_user(db: Session = Depends(get_db)):
    user = User(id=uuid.uuid4())
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"user_id": str(user.id)}


# ── Profile ───────────────────────────────────────────────────────────────────

@app.get("/api/profile/{user_id}")
def get_profile(user_id: str, db: Session = Depends(get_db)):
    uid = _parse_uuid(user_id)
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _profile_to_dict(profile)


@app.post("/api/profile/{user_id}")
def create_or_replace_profile(
    user_id: str,
    payload: TasteProfileCreate,
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
    if profile:
        profile.cuisine_affinities = payload.cuisine_affinities
        profile.flavor_tags = payload.flavor_tags
        profile.disliked_tags = payload.disliked_tags
        profile.dietary_restrictions = payload.dietary_restrictions
        profile.rated_dishes = payload.rated_dishes
    else:
        profile = TasteProfile(
            id=uuid.uuid4(),
            user_id=uid,
            cuisine_affinities=payload.cuisine_affinities,
            flavor_tags=payload.flavor_tags,
            disliked_tags=payload.disliked_tags,
            dietary_restrictions=payload.dietary_restrictions,
            rated_dishes=payload.rated_dishes,
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return _profile_to_dict(profile)


@app.patch("/api/profile/{user_id}")
def patch_profile(
    user_id: str,
    payload: TasteProfilePatch,
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if payload.cuisine_affinities is not None:
        merged = dict(profile.cuisine_affinities or {})
        merged.update(payload.cuisine_affinities)
        profile.cuisine_affinities = merged

    if payload.flavor_tags is not None:
        profile.flavor_tags = payload.flavor_tags

    if payload.disliked_tags is not None:
        profile.disliked_tags = payload.disliked_tags

    if payload.dietary_restrictions is not None:
        profile.dietary_restrictions = payload.dietary_restrictions

    if payload.rated_dishes is not None:
        existing = list(profile.rated_dishes or [])
        existing.extend(payload.rated_dishes)
        profile.rated_dishes = existing

    db.commit()
    db.refresh(profile)
    return _profile_to_dict(profile)


@app.post("/api/profile/{user_id}/recompute")
def recompute_endpoint(user_id: str, db: Session = Depends(get_db)):
    uid = _parse_uuid(user_id)
    profile = recompute_profile(db, uid)
    return _profile_to_dict(profile)


# ── Restaurant Visits ─────────────────────────────────────────────────────────

@app.get("/api/visits/{user_id}")
def get_visits(user_id: str, db: Session = Depends(get_db)):
    uid = _parse_uuid(user_id)
    visits = (
        db.query(RestaurantVisit)
        .filter(RestaurantVisit.user_id == uid)
        .order_by(RestaurantVisit.visited_at.desc())
        .all()
    )
    return [_visit_to_dict(v) for v in visits]


@app.post("/api/visits/{user_id}")
def create_visit(
    user_id: str,
    payload: VisitCreate,
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    visit = RestaurantVisit(
        id=uuid.uuid4(),
        user_id=uid,
        restaurant_name=payload.restaurant_name,
        cuisine_type=payload.cuisine_type,
        restaurant_rating=payload.restaurant_rating,
        favorite_dish=payload.favorite_dish,
        dish_rating=payload.dish_rating,
        source=payload.source,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    # Recompute profile after every new visit
    recompute_profile(db, uid)

    return _visit_to_dict(visit)


@app.delete("/api/visits/{user_id}/{visit_id}", status_code=204)
def delete_visit(user_id: str, visit_id: str, db: Session = Depends(get_db)):
    uid = _parse_uuid(user_id)
    vid = _parse_uuid(visit_id)
    visit = (
        db.query(RestaurantVisit)
        .filter(RestaurantVisit.user_id == uid, RestaurantVisit.id == vid)
        .first()
    )
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    # Recompute profile with this visit removed
    recompute_profile(db, uid)


# ── Recommend — instant formula scoring ──────────────────────────────────────

@app.post("/api/recommend/rank")
def rank_endpoint(payload: RankRequest, db: Session = Depends(get_db)):
    """Apply formula-based scoring to a pre-parsed dish list."""
    if payload.user_id:
        try:
            uid = uuid.UUID(payload.user_id)
            profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
            if profile:
                scored = score_dishes(
                    payload.dishes,
                    _profile_to_dict(profile),
                    payload.cuisine_type,
                )
                return {
                    "ranked": True,
                    "restaurant_name": payload.restaurant_name,
                    "cuisine_type": payload.cuisine_type,
                    "dish_count": len(scored),
                    "dishes": scored,
                }
        except Exception as e:
            logger.warning(f"Ranking failed: {e}")

    return {
        "ranked": False,
        "restaurant_name": payload.restaurant_name,
        "cuisine_type": payload.cuisine_type,
        "dish_count": len(payload.dishes),
        "dishes": payload.dishes,
    }


# ── Recommend — non-streaming (legacy) ───────────────────────────────────────

@app.post("/api/recommend")
async def recommend_endpoint(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        image_data = await file.read()
        raw_text = extract_text_from_image(image_data)
        parsed = parse_menu_text(raw_text)
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    dishes = parsed.get("dishes", [])
    restaurant_name = parsed.get("restaurant_name", "")
    cuisine_type = parsed.get("cuisine_type", "")

    if user_id:
        try:
            uid = uuid.UUID(user_id)
            profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
            if profile:
                scored = score_dishes(dishes, _profile_to_dict(profile), cuisine_type)
                return {
                    "filename": file.filename,
                    "dish_count": len(scored),
                    "ranked": True,
                    "restaurant_name": restaurant_name,
                    "cuisine_type": cuisine_type,
                    "dishes": scored,
                }
        except Exception as e:
            logger.warning(f"Ranked path failed: {e}")

    return {
        "filename": file.filename,
        "dish_count": len(dishes),
        "ranked": False,
        "restaurant_name": restaurant_name,
        "cuisine_type": cuisine_type,
        "dishes": dishes,
    }


# ── Streaming recommend — live logs via SSE ───────────────────────────────────

class _SSELogHandler(logging.Handler):
    """Forwards log records to an asyncio queue so they can be streamed as SSE."""

    def __init__(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue):
        super().__init__()
        self._loop = loop
        self._queue = queue

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            self._loop.call_soon_threadsafe(
                self._queue.put_nowait,
                {"type": "log", "message": msg},
            )
        except Exception:
            pass


@app.post("/api/recommend/stream")
async def recommend_stream(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await file.read()
    filename = file.filename

    async def generate():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        handler = _SSELogHandler(loop, queue)
        handler.setFormatter(logging.Formatter("%(message)s"))

        watched = [
            logging.getLogger("app.ocr"),
            logging.getLogger("app.llm"),
            logging.getLogger("app.main"),
        ]
        for lg in watched:
            lg.addHandler(handler)

        def _sse(obj: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, obj)

        def run():
            try:
                # ── OCR ──────────────────────────────────────────────────────
                _sse({"type": "log", "message": f"[OCR] Processing {filename}..."})
                raw_text = extract_text_from_image(image_data)
                lines = [l for l in raw_text.splitlines() if l.strip()]
                _sse({"type": "log", "message": f"[OCR] Extracted {len(lines)} lines"})
                for i, line in enumerate(lines, 1):
                    _sse({"type": "log", "message": f"[OCR]  {i:>3}: {line}"})

                # ── LLM parse ────────────────────────────────────────────────
                _sse({"type": "log", "message": "[LLM] Parsing menu..."})
                parsed = parse_menu_text(raw_text)
                dishes = parsed.get("dishes", [])
                restaurant_name = parsed.get("restaurant_name", "")
                cuisine_type = parsed.get("cuisine_type", "")
                _sse({"type": "log", "message": f"[LLM] Found {len(dishes)} dishes | restaurant='{restaurant_name}' cuisine='{cuisine_type}'"})

                # Send parsed event — frontend will show confirmation UI then call /api/recommend/rank
                _sse({"type": "parsed", "data": {
                    "filename": filename,
                    "restaurant_name": restaurant_name,
                    "cuisine_type": cuisine_type,
                    "dish_count": len(dishes),
                    "dishes": dishes,
                }})

            except Exception as exc:
                logger.error(traceback.format_exc())
                _sse({"type": "error", "message": str(exc)})
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        future = loop.run_in_executor(None, run)

        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=20)
                except asyncio.TimeoutError:
                    yield "data: {\"type\":\"heartbeat\"}\n\n"
                    continue
                if item is None:
                    break
                yield f"data: {_json.dumps(item)}\n\n"
        finally:
            for lg in watched:
                lg.removeHandler(handler)
            await future

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Excel import ──────────────────────────────────────────────────────────────

@app.post("/api/import/excel")
async def import_excel(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    data = await file.read()
    try:
        wb = openpyxl.load_workbook(BytesIO(data))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel file: {e}")

    ws = wb.active
    imported = 0

    for row in ws.iter_rows(min_row=1, values_only=True):
        # Columns: A=name, B=cuisine, C=restaurant_rating, D=fav_dish, E=dish_rating
        name = row[0] if len(row) > 0 else None
        cuisine = row[1] if len(row) > 1 else None
        rating = row[2] if len(row) > 2 else None
        fav_dish = row[3] if len(row) > 3 else None
        dish_rating = row[4] if len(row) > 4 else None

        # Skip header row if col C is non-numeric
        if rating is not None and not isinstance(rating, (int, float)):
            continue
        if not name or not str(name).strip():
            continue

        visit = RestaurantVisit(
            id=uuid.uuid4(),
            user_id=uid,
            restaurant_name=str(name).strip(),
            cuisine_type=str(cuisine).strip() if cuisine else None,
            restaurant_rating=int(rating) if rating is not None else None,
            favorite_dish=str(fav_dish).strip() if fav_dish else None,
            dish_rating=int(dish_rating) if dish_rating is not None else None,
            source="import",
        )
        db.add(visit)
        imported += 1

    db.commit()

    if imported > 0:
        recompute_profile(db, uid)

    return {"imported": imported}
