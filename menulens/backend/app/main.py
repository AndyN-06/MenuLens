"""
MenuLens FastAPI Backend
"""
from contextlib import asynccontextmanager
from io import BytesIO
import asyncio
import json as _json
import uuid
import logging
import traceback
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from .llm import (
    parse_menu_image,
    parse_menu_pdf,
    health_check_anthropic,
    summarize_taste_profile,
    _get_client,
    _extract_json,
    ANTHROPIC_MODEL,
)
from .scoring import score_dishes
from .database import get_db, engine, SessionLocal
from .models import (
    Base, User, TasteProfile, RestaurantVisit,
    Restaurant, Menu, Dish, DishRating,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _is_image(content_type: str) -> bool:
    return bool(content_type and content_type.startswith("image/"))


def _is_pdf(content_type: str) -> bool:
    return content_type == "application/pdf"


async def _parse_upload(file: UploadFile) -> tuple[bytes, dict]:
    """Read the upload and dispatch to the correct parser. Returns (raw_bytes, parsed)."""
    ct = file.content_type or ""
    if not (_is_image(ct) or _is_pdf(ct)):
        raise HTTPException(status_code=400, detail="File must be an image or PDF")
    data = await file.read()
    parsed = parse_menu_pdf(data) if _is_pdf(ct) else parse_menu_image(data)
    return data, parsed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all ORM-defined tables (new tables are created idempotently)
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        # ── Existing-table column additions ──────────────────────────────────
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
        conn.execute(text(
            "ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS cuisine_profiles JSONB"
        ))
        conn.execute(text(
            "ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS liked_ingredients JSONB"
        ))
        conn.execute(text(
            "ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS disliked_ingredients JSONB"
        ))

        # ── restaurant_visits: add FK columns, make restaurant_name nullable ─
        conn.execute(text(
            "ALTER TABLE restaurant_visits "
            "ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id)"
        ))
        conn.execute(text(
            "ALTER TABLE restaurant_visits "
            "ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id)"
        ))
        conn.execute(text(
            "ALTER TABLE restaurant_visits "
            "ALTER COLUMN restaurant_name DROP NOT NULL"
        ))

        # ── GIN index on restaurants.name for fast prefix search ─────────────
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_restaurants_name "
            "ON restaurants (name)"
        ))

        # ── dish_ratings.rating: widen SMALLINT → FLOAT for decimal ratings ──
        conn.execute(text(
            "ALTER TABLE dish_ratings "
            "ALTER COLUMN rating TYPE FLOAT USING rating::float"
        ))

        conn.commit()
    yield


app = FastAPI(title="MenuLens API", version="4.0.0", lifespan=lifespan)

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
    restaurant_id: Optional[str] = None
    restaurant_name: Optional[str] = None   # fallback if no restaurant_id
    cuisine_type: Optional[str] = None
    restaurant_rating: Optional[int] = None
    menu_id: Optional[str] = None
    source: str = "manual"


class RestaurantCreate(BaseModel):
    name: str
    cuisine_type: Optional[str] = None
    city: Optional[str] = None


class DishRatingCreate(BaseModel):
    dish_id:   Optional[str] = None   # UUID of a known dish
    dish_name: Optional[str] = None   # fallback when dish not in DB yet
    rating:    float                  # 1.00–10.00, up to 2 decimal places


class DishRatingsPayload(BaseModel):
    ratings:       list[DishRatingCreate]
    restaurant_id: Optional[str] = None  # context for name-based lookups


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
        "cuisine_profiles": p.cuisine_profiles or {},
        "liked_ingredients": p.liked_ingredients or {},
        "disliked_ingredients": p.disliked_ingredients or {},
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
        "restaurant_id": str(v.restaurant_id) if v.restaurant_id else None,
        "menu_id": str(v.menu_id) if v.menu_id else None,
        "restaurant_name": v.restaurant_name,
        "cuisine_type": v.cuisine_type,
        "restaurant_rating": v.restaurant_rating,
        "favorite_dish": v.favorite_dish,   # legacy
        "dish_rating": v.dish_rating,        # legacy
        "source": v.source,
        "visited_at": v.visited_at.isoformat() if v.visited_at else None,
        "dish_ratings": [
            {
                "dish_rating_id": str(dr.id),
                "dish_id": str(dr.dish_id),
                "dish_name": dr.dish.dish_name if dr.dish else None,
                "rating": dr.rating,
            }
            for dr in (v.dish_ratings or [])
        ],
    }


def _dish_to_dict(d: Dish) -> dict:
    return {
        "id": str(d.id),
        "menu_id": str(d.menu_id),
        "restaurant_id": str(d.restaurant_id),
        "dish_name": d.dish_name,
        "description": d.description or "",
        "price": d.price or "",
        "section": d.section or "",
        "flavor_vector": d.flavor_vector,
        "base_ingredients": d.base_ingredients or [],
        "flavor_source": d.flavor_source,
        "flavor_confidence": d.flavor_confidence,
    }


def _upsert_menu(
    db: Session,
    restaurant_id: uuid.UUID,
    parsed: dict,
    scanned_by: uuid.UUID | None,
) -> Menu:
    """Replace the existing menu for a restaurant with freshly scanned dishes.

    Existing DishRatings are snapshotted, deleted, then re-created pointing at
    the best fuzzy-matched dish in the new menu (threshold 0.70).  Unmatched
    ratings land on a stub dish so no data is lost.
    """
    from difflib import SequenceMatcher

    FUZZY_THRESHOLD = 0.70

    existing = db.query(Menu).filter(Menu.restaurant_id == restaurant_id).first()

    # ── Phase 1: snapshot rating rows as plain dicts, then DELETE them ───────
    # We must remove ratings before dishes (FK: dish_ratings.dish_id → dishes).
    # We use raw SQL throughout this phase so zero ORM-tracked DishRating objects
    # ever enter the session — which would cause SQLAlchemy to emit
    # "UPDATE dish_ratings SET dish_id=NULL" when the parent Dish is deleted.
    rating_snapshots: list[dict] = []  # plain dicts; no ORM objects
    if existing:
        old_dish_ids = [str(d.id) for d in existing.dishes]
        if old_dish_ids:
            dish_name_by_id = {str(d.id): d.dish_name for d in existing.dishes}
            rows = db.execute(
                text(
                    "SELECT id, user_id, dish_id, restaurant_id, visit_id, "
                    "       rating, notes, rated_at "
                    "FROM dish_ratings "
                    "WHERE dish_id = ANY(CAST(:ids AS uuid[]))"
                ),
                {"ids": old_dish_ids},
            ).fetchall()
            for row in rows:
                rating_snapshots.append({
                    "id":            row.id,
                    "user_id":       row.user_id,
                    "dish_id":       None,          # will be filled in Phase 4
                    "restaurant_id": row.restaurant_id,
                    "visit_id":      row.visit_id,
                    "rating":        row.rating,
                    "notes":         row.notes,
                    "rated_at":      row.rated_at,
                    "old_dish_name": dish_name_by_id.get(str(row.dish_id), ""),
                })
            db.execute(
                text("DELETE FROM dish_ratings WHERE dish_id = ANY(CAST(:ids AS uuid[]))"),
                {"ids": old_dish_ids},
            )
            db.flush()

    # ── Phase 2: delete old menu (cascade deletes dishes; ratings are gone) ──
    if existing:
        db.delete(existing)
        db.flush()

    # ── Phase 3: create the new menu + dishes ───────────────────────────────
    new_menu = Menu(
        id=uuid.uuid4(),
        restaurant_id=restaurant_id,
        scanned_by=scanned_by,
        verified=False,
        dish_count=len(parsed.get("dishes", [])),
        raw_response=parsed,
    )
    db.add(new_menu)
    db.flush()

    new_dishes: dict[str, Dish] = {}
    for d in parsed.get("dishes", []):
        dish_name = d.get("dish_name", "")
        dish = Dish(
            id=uuid.uuid4(),
            menu_id=new_menu.id,
            restaurant_id=restaurant_id,
            dish_name=dish_name,
            description=d.get("description", ""),
            price=d.get("price", ""),
            section=d.get("section", ""),
        )
        db.add(dish)
        db.flush()
        new_dishes[dish_name] = dish

    # ── Phase 4: re-insert ratings pointing at matched new dishes ───────────
    for snap in rating_snapshots:
        best_ratio, best_dish = 0.0, None
        for new_name, new_dish in new_dishes.items():
            ratio = SequenceMatcher(
                None, snap["old_dish_name"].lower(), new_name.lower()
            ).ratio()
            if ratio > best_ratio:
                best_ratio, best_dish = ratio, new_dish

        if best_ratio < FUZZY_THRESHOLD or best_dish is None:
            stub = Dish(
                id=uuid.uuid4(),
                menu_id=new_menu.id,
                restaurant_id=restaurant_id,
                dish_name=snap["old_dish_name"],
            )
            db.add(stub)
            db.flush()
            best_dish = stub

        db.execute(
            text(
                "INSERT INTO dish_ratings "
                "  (id, user_id, dish_id, restaurant_id, visit_id, rating, notes, rated_at) "
                "VALUES "
                "  (:id, :user_id, :dish_id, :restaurant_id, :visit_id, :rating, :notes, :rated_at)"
            ),
            {**snap, "dish_id": best_dish.id},
        )
    if rating_snapshots:
        db.flush()

    # Update restaurant cuisine_type if scan inferred one and it wasn't set
    if parsed.get("cuisine_type"):
        restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
        if restaurant and not restaurant.cuisine_type:
            restaurant.cuisine_type = parsed["cuisine_type"]

    db.commit()
    db.refresh(new_menu)
    return new_menu


def _enrich_dish_flavors(menu_id: uuid.UUID):
    """Background job: generate flavor vectors for dishes that don't have them yet.

    Uses a single Claude API call for all dishes in the menu.
    Writes results back to the dishes table with flavor_source='llm', confidence=0.7.
    Does not block the scan response.
    """
    import json as _stdlib_json

    db = SessionLocal()
    try:
        dishes = db.query(Dish).filter(
            Dish.menu_id == menu_id,
            Dish.flavor_source == "none",
        ).all()

        if not dishes:
            return

        dish_list = [
            {"id": str(d.id), "dish_name": d.dish_name, "description": d.description or ""}
            for d in dishes
        ]

        response = _get_client().messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": (
                    "For each dish below, estimate its flavor profile and main ingredients.\n"
                    "Return ONLY a JSON array where each element has:\n"
                    '  "id": (the dish id provided)\n'
                    '  "flavor_vector": {"umami": 0-10, "salty": 0-10, "sweet": 0-10, '
                    '"bitter": 0-10, "sour": 0-10, "spicy": 0-10, "richness": 0-10}\n'
                    '  "base_ingredients": ["ingredient1", "ingredient2", ...]\n\n'
                    f"Dishes:\n{_stdlib_json.dumps(dish_list, indent=2)}"
                ),
            }],
        )

        results = _extract_json(response.content[0].text)
        if not isinstance(results, list):
            return

        result_map = {r["id"]: r for r in results if "id" in r}
        for dish in dishes:
            r = result_map.get(str(dish.id))
            if not r:
                continue
            dish.flavor_vector     = r.get("flavor_vector")
            dish.base_ingredients  = r.get("base_ingredients", [])
            dish.flavor_source     = "llm"
            dish.flavor_confidence = 0.7

        db.commit()
        logger.info(
            f"[enrich] flavor vectors written for {len(result_map)} dishes in menu {menu_id}"
        )

    except Exception as exc:
        logger.error(f"[enrich] flavor enrichment failed for menu {menu_id}: {exc}")
    finally:
        db.close()


def recompute_profile(db: Session, user_id: uuid.UUID) -> TasteProfile:
    """Re-derive TasteProfile fields from RestaurantVisit and DishRating rows."""
    visits           = db.query(RestaurantVisit).filter(RestaurantVisit.user_id == user_id).all()
    dish_ratings_rows = db.query(DishRating).filter(DishRating.user_id == user_id).all()

    # cuisine_affinities: mean restaurant_rating per cuisine, normalised to 0-1
    cuisine_ratings: dict[str, list[float]] = {}
    for v in visits:
        cuisine = v.cuisine_type or (v.restaurant.cuisine_type if v.restaurant else None)
        if cuisine and v.restaurant_rating is not None:
            cuisine_ratings.setdefault(cuisine, []).append(float(v.restaurant_rating))
    cuisine_affinities = {
        c: round(sum(rs) / len(rs) / 10.0, 3)
        for c, rs in cuisine_ratings.items()
    }

    # top_dishes and avg_score_threshold from dish_ratings (new) + legacy visit fields
    top_dishes   = []
    all_ratings  = []
    for dr in dish_ratings_rows:
        all_ratings.append(float(dr.rating))
        if dr.rating >= 7 and dr.dish and dr.dish.dish_name:
            top_dishes.append(dr.dish.dish_name)
    # also include legacy favorite_dish from old visits
    for v in visits:
        if v.favorite_dish and v.dish_rating is not None:
            if v.dish_rating >= 7:
                top_dishes.append(v.favorite_dish)
            all_ratings.append(float(v.dish_rating))
    avg_score_threshold = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 5.0

    # liked/disliked ingredients from dish_ratings joined with dish.base_ingredients
    liked_ingredients:    dict[str, float] = {}
    disliked_ingredients: dict[str, float] = {}
    for dr in dish_ratings_rows:
        if not dr.dish or not dr.dish.base_ingredients:
            continue
        ingredients = dr.dish.base_ingredients or []
        if dr.rating >= 7:
            for ing in ingredients:
                liked_ingredients[ing] = liked_ingredients.get(ing, 0) + 1
        elif dr.rating <= 4:
            for ing in ingredients:
                disliked_ingredients[ing] = disliked_ingredients.get(ing, 0) + 1

    max_liked    = max(liked_ingredients.values(), default=1)
    max_disliked = max(disliked_ingredients.values(), default=1)
    liked_ingredients    = {k: round(v / max_liked,    3) for k, v in liked_ingredients.items()}
    disliked_ingredients = {k: round(v / max_disliked, 3) for k, v in disliked_ingredients.items()}

    # cuisine_profiles: per cuisine x section, built from dish_ratings with flavor vectors
    cuisine_profiles: dict = {}
    for dr in dish_ratings_rows:
        if not dr.dish or not dr.dish.flavor_vector or dr.dish.flavor_confidence == 0:
            continue
        cuisine = (
            dr.dish.restaurant.cuisine_type if dr.dish.restaurant else None
        ) or "unknown"
        section   = (dr.dish.section or "mains").lower()
        direction = 1 if dr.rating >= 7 else (-1 if dr.rating <= 4 else 0)
        if direction == 0:
            continue
        fv = dr.dish.flavor_vector
        cuisine_profiles.setdefault(cuisine, {}).setdefault(section, {})
        current = cuisine_profiles[cuisine][section]
        lr = 0.1
        for flavor, value in fv.items():
            current[flavor] = current.get(flavor, value) + direction * lr * (value - current.get(flavor, value))

    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if profile:
        profile.cuisine_affinities   = cuisine_affinities
        profile.cuisine_profiles     = cuisine_profiles
        profile.liked_ingredients    = liked_ingredients
        profile.disliked_ingredients = disliked_ingredients
        profile.top_dishes           = top_dishes
        profile.avg_score_threshold  = avg_score_threshold
    else:
        profile = TasteProfile(
            id=uuid.uuid4(),
            user_id=user_id,
            cuisine_affinities=cuisine_affinities,
            cuisine_profiles=cuisine_profiles,
            liked_ingredients=liked_ingredients,
            disliked_ingredients=disliked_ingredients,
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
    result = health_check_anthropic()
    if result["status"] == "error":
        raise HTTPException(status_code=503, detail=result)
    return result


# ── OCR/Parse — debug endpoints ───────────────────────────────────────────────

@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    try:
        data, parsed = await _parse_upload(file)
        logger.info(f"[OCR] processing {file.filename} ({len(data):,} bytes)")
        lines = [d.get("dish_name", "") for d in parsed.get("dishes", [])]
        text  = "\n".join(lines)
        return {"filename": file.filename, "text": text, "char_count": len(text)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...)):
    try:
        _, parsed = await _parse_upload(file)
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


# ── Restaurants ───────────────────────────────────────────────────────────────

@app.get("/api/restaurants/search")
def search_restaurants(q: str, limit: int = 10, db: Session = Depends(get_db)):
    if not q or len(q.strip()) < 2:
        return []
    results = (
        db.query(Restaurant)
        .filter(Restaurant.name.ilike(f"%{q.strip()}%"))
        .order_by(Restaurant.name)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "cuisine_type": r.cuisine_type,
            "city": r.city,
            "has_menu": r.menu is not None and (r.menu.dish_count or 0) > 0,
            "menu_verified": r.menu.verified if r.menu else False,
            "menu_dish_count": r.menu.dish_count if r.menu else 0,
            "menu_scanned_at": r.menu.scanned_at.isoformat() if r.menu else None,
        }
        for r in results
    ]


@app.post("/api/restaurants", status_code=201)
def create_restaurant(payload: RestaurantCreate, db: Session = Depends(get_db)):
    restaurant = Restaurant(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        cuisine_type=payload.cuisine_type,
        city=payload.city,
    )
    db.add(restaurant)
    db.commit()
    db.refresh(restaurant)
    return {"id": str(restaurant.id), "name": restaurant.name}


@app.get("/api/restaurants/{restaurant_id}/menu")
def get_restaurant_menu(restaurant_id: str, db: Session = Depends(get_db)):
    rid  = _parse_uuid(restaurant_id)
    menu = db.query(Menu).filter(Menu.restaurant_id == rid).first()
    if not menu:
        raise HTTPException(status_code=404, detail="No menu scanned for this restaurant")
    dishes = db.query(Dish).filter(Dish.menu_id == menu.id).all()
    return {
        "menu_id": str(menu.id),
        "restaurant_id": str(menu.restaurant_id),
        "scanned_at": menu.scanned_at.isoformat(),
        "verified": menu.verified,
        "dish_count": menu.dish_count,
        "dishes": [_dish_to_dict(d) for d in dishes],
    }


@app.post("/api/restaurants/{restaurant_id}/menu/verify")
def verify_menu(
    restaurant_id: str,
    user_id: str = Form(...),
    db: Session = Depends(get_db),
):
    rid  = _parse_uuid(restaurant_id)
    uid  = _parse_uuid(user_id)
    menu = db.query(Menu).filter(Menu.restaurant_id == rid).first()
    if not menu:
        raise HTTPException(status_code=404, detail="No menu found")
    menu.verified    = True
    menu.verified_by = uid
    db.commit()
    return {"verified": True}


# ── Profile ───────────────────────────────────────────────────────────────────

@app.get("/api/profile/{user_id}")
def get_profile(user_id: str, db: Session = Depends(get_db)):
    uid     = _parse_uuid(user_id)
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
    uid  = _parse_uuid(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
    if profile:
        profile.cuisine_affinities  = payload.cuisine_affinities
        profile.flavor_tags         = payload.flavor_tags
        profile.disliked_tags       = payload.disliked_tags
        profile.dietary_restrictions = payload.dietary_restrictions
        profile.rated_dishes        = payload.rated_dishes
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
    uid     = _parse_uuid(user_id)
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
    uid     = _parse_uuid(user_id)
    profile = recompute_profile(db, uid)
    return _profile_to_dict(profile)


# ── Restaurant Visits ─────────────────────────────────────────────────────────

@app.get("/api/visits/{user_id}")
def get_visits(user_id: str, db: Session = Depends(get_db)):
    uid    = _parse_uuid(user_id)
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
    uid  = _parse_uuid(user_id)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    rid = _parse_uuid(payload.restaurant_id) if payload.restaurant_id else None
    mid = _parse_uuid(payload.menu_id)       if payload.menu_id       else None

    # Resolve restaurant_name from Restaurant record if not supplied
    resolved_name = payload.restaurant_name
    if rid and not resolved_name:
        r = db.query(Restaurant).filter(Restaurant.id == rid).first()
        if r:
            resolved_name = r.name

    visit = RestaurantVisit(
        id=uuid.uuid4(),
        user_id=uid,
        restaurant_id=rid,
        menu_id=mid,
        restaurant_name=resolved_name,
        cuisine_type=payload.cuisine_type,
        restaurant_rating=payload.restaurant_rating,
        source=payload.source,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    recompute_profile(db, uid)

    return _visit_to_dict(visit)


@app.post("/api/visits/{user_id}/{visit_id}/dishes")
def rate_dishes(
    user_id: str,
    visit_id: str,
    payload: DishRatingsPayload,
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    vid = _parse_uuid(visit_id)

    visit = db.query(RestaurantVisit).filter(
        RestaurantVisit.id == vid,
        RestaurantVisit.user_id == uid,
    ).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    # Resolve restaurant context (payload overrides, then fall back to visit FK)
    rid: uuid.UUID | None = None
    if payload.restaurant_id:
        rid = _parse_uuid(payload.restaurant_id)
    elif visit.restaurant_id:
        rid = visit.restaurant_id

    # Pre-fetch the restaurant's menu so we can create stub dishes for free-text names
    menu: Menu | None = (
        db.query(Menu).filter(Menu.restaurant_id == rid).first() if rid else None
    )

    saved = 0
    for r in payload.ratings:
        dish: Dish | None = None

        if r.dish_id:
            # Prefer direct dish_id lookup
            dish = db.query(Dish).filter(Dish.id == _parse_uuid(r.dish_id)).first()

        elif r.dish_name and rid:
            name_clean = r.dish_name.strip()
            # 1. Exact case-insensitive match
            dish = (
                db.query(Dish)
                .filter(
                    Dish.restaurant_id == rid,
                    text("lower(dish_name) = lower(:n)"),
                )
                .params(n=name_clean)
                .first()
            )
            # 2. Partial match
            if not dish:
                dish = (
                    db.query(Dish)
                    .filter(
                        Dish.restaurant_id == rid,
                        Dish.dish_name.ilike(f"%{name_clean}%"),
                    )
                    .first()
                )
            # 3. Create a stub dish so the rating is still stored.
            #    If the restaurant has no menu yet, create a stub menu first.
            if not dish and rid:
                if not menu:
                    menu = Menu(
                        id=uuid.uuid4(),
                        restaurant_id=rid,
                        scanned_by=None,
                        verified=False,
                        dish_count=0,
                    )
                    db.add(menu)
                    db.flush()
                dish = Dish(
                    id=uuid.uuid4(),
                    menu_id=menu.id,
                    restaurant_id=rid,
                    dish_name=name_clean,
                )
                db.add(dish)
                db.flush()

        if not dish:
            continue

        clamped = round(max(1.0, min(10.0, float(r.rating))), 2)
        db.add(DishRating(
            id=uuid.uuid4(),
            user_id=uid,
            dish_id=dish.id,
            restaurant_id=dish.restaurant_id,
            visit_id=vid,
            rating=clamped,
        ))
        saved += 1

    db.commit()
    recompute_profile(db, uid)
    return {"rated": saved}


@app.get("/api/visits/{user_id}/{visit_id}/dishes")
def get_visit_dishes(
    user_id: str,
    visit_id: str,
    db: Session = Depends(get_db),
):
    uid = _parse_uuid(user_id)
    vid = _parse_uuid(visit_id)

    visit = db.query(RestaurantVisit).filter(
        RestaurantVisit.id == vid,
        RestaurantVisit.user_id == uid,
    ).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    ratings = db.query(DishRating).filter(DishRating.visit_id == vid).all()
    return [
        {
            "dish_rating_id": str(dr.id),
            "rating": dr.rating,
            "notes": dr.notes,
            "rated_at": dr.rated_at.isoformat() if dr.rated_at else None,
            "dish": _dish_to_dict(dr.dish) if dr.dish else None,
        }
        for dr in ratings
    ]


@app.delete("/api/visits/{user_id}/{visit_id}", status_code=204)
def delete_visit(user_id: str, visit_id: str, db: Session = Depends(get_db)):
    uid   = _parse_uuid(user_id)
    vid   = _parse_uuid(visit_id)
    visit = (
        db.query(RestaurantVisit)
        .filter(RestaurantVisit.user_id == uid, RestaurantVisit.id == vid)
        .first()
    )
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    recompute_profile(db, uid)


# ── Recommend — formula scoring ───────────────────────────────────────────────

def _get_community_favorites(
    db: Session,
    restaurant_name: str,
    exclude_user_id: uuid.UUID | None = None,
    min_dish_rating: float = 7.0,
    fuzzy_threshold: float = 0.70,
) -> list[str]:
    """Return dish names rated highly by other users at the same restaurant."""
    from difflib import SequenceMatcher

    name_lower = restaurant_name.lower()
    favorites: list[str] = []

    # New path: DishRating -> Dish -> Restaurant
    dr_query = (
        db.query(DishRating, Dish, Restaurant)
        .join(Dish, DishRating.dish_id == Dish.id)
        .join(Restaurant, DishRating.restaurant_id == Restaurant.id)
        .filter(DishRating.rating >= min_dish_rating)
    )
    if exclude_user_id:
        dr_query = dr_query.filter(DishRating.user_id != exclude_user_id)
    for dr, dish, restaurant in dr_query.all():
        ratio = SequenceMatcher(None, (restaurant.name or "").lower(), name_lower).ratio()
        if ratio >= fuzzy_threshold:
            favorites.append(dish.dish_name)

    # Legacy path: RestaurantVisit.favorite_dish (backward compat)
    legacy_query = (
        db.query(RestaurantVisit.restaurant_name, RestaurantVisit.favorite_dish)
        .filter(
            RestaurantVisit.dish_rating >= min_dish_rating,
            RestaurantVisit.favorite_dish.isnot(None),
        )
    )
    if exclude_user_id:
        legacy_query = legacy_query.filter(RestaurantVisit.user_id != exclude_user_id)
    for row_name, dish in legacy_query.all():
        ratio = SequenceMatcher(None, (row_name or "").lower(), name_lower).ratio()
        if ratio >= fuzzy_threshold and dish:
            favorites.append(dish)

    logger.info(f"[rank] community favorites for '{restaurant_name}': {favorites or 'none'}")
    return favorites


@app.post("/api/recommend/rank")
def rank_endpoint(payload: RankRequest, db: Session = Depends(get_db)):
    """Apply formula-based scoring to a pre-parsed dish list."""
    uid: uuid.UUID | None = None
    if payload.user_id:
        try:
            uid = uuid.UUID(payload.user_id)
        except ValueError:
            pass

    community_favorites = _get_community_favorites(
        db, payload.restaurant_name, exclude_user_id=uid
    )

    if uid:
        try:
            profile = db.query(TasteProfile).filter(TasteProfile.user_id == uid).first()
            if profile:
                scored = score_dishes(
                    payload.dishes,
                    _profile_to_dict(profile),
                    payload.cuisine_type,
                    community_favorites=community_favorites,
                )
                return {
                    "ranked": True,
                    "restaurant_name": payload.restaurant_name,
                    "cuisine_type": payload.cuisine_type,
                    "dish_count": len(scored),
                    "dishes": scored,
                    "community_count": len(community_favorites),
                }
        except Exception as e:
            logger.warning(f"Ranking failed: {e}")

    # No profile — still apply community picks if any
    if community_favorites:
        from difflib import SequenceMatcher
        dishes_out = []
        for dish in payload.dishes:
            name    = dish.get("dish_name", "")
            is_pick = any(
                SequenceMatcher(None, name.lower(), cf.lower()).ratio() > 0.6
                for cf in community_favorites
            )
            dishes_out.append({**dish, "community_pick": is_pick})
    else:
        dishes_out = payload.dishes

    return {
        "ranked": False,
        "restaurant_name": payload.restaurant_name,
        "cuisine_type": payload.cuisine_type,
        "dish_count": len(dishes_out),
        "dishes": dishes_out,
        "community_count": len(community_favorites),
    }


# ── Recommend — non-streaming (legacy) ───────────────────────────────────────

@app.post("/api/recommend")
async def recommend_endpoint(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    try:
        _, parsed = await _parse_upload(file)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    dishes          = parsed.get("dishes", [])
    restaurant_name = parsed.get("restaurant_name", "")
    cuisine_type    = parsed.get("cuisine_type", "")

    if user_id:
        try:
            uid     = uuid.UUID(user_id)
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
        self._loop  = loop
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
    restaurant_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    ct = file.content_type or ""
    if not (_is_image(ct) or _is_pdf(ct)):
        raise HTTPException(status_code=400, detail="File must be an image or PDF")

    image_data = await file.read()
    filename   = file.filename
    is_pdf     = _is_pdf(ct)

    async def generate():
        loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        handler = _SSELogHandler(loop, queue)
        handler.setFormatter(logging.Formatter("%(message)s"))

        watched = [
            logging.getLogger("app.llm"),
            logging.getLogger("app.main"),
        ]
        for lg in watched:
            lg.addHandler(handler)

        def _sse(obj: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, obj)

        def run():
            try:
                uid: uuid.UUID | None = None
                if user_id:
                    try:
                        uid = uuid.UUID(user_id)
                    except ValueError:
                        pass

                _sse({"type": "log", "message": f"[Claude] Analyzing {filename}..."})
                parsed          = parse_menu_pdf(image_data) if is_pdf else parse_menu_image(image_data)
                dishes          = parsed.get("dishes", [])
                restaurant_name = parsed.get("restaurant_name", "")
                cuisine_type    = parsed.get("cuisine_type", "")
                _sse({
                    "type": "log",
                    "message": (
                        f"[Claude] Found {len(dishes)} dishes | "
                        f"restaurant='{restaurant_name}' cuisine='{cuisine_type}'"
                    ),
                })

                # Persist menu if a restaurant_id was provided
                new_menu = None
                if restaurant_id:
                    rid      = uuid.UUID(restaurant_id)
                    new_menu = _upsert_menu(db, rid, parsed, scanned_by=uid)
                    # Fire background flavor enrichment (non-blocking)
                    loop.run_in_executor(None, _enrich_dish_flavors, new_menu.id)

                _sse({"type": "parsed", "data": {
                    "filename": filename,
                    "restaurant_name": restaurant_name,
                    "cuisine_type": cuisine_type,
                    "dish_count": len(dishes),
                    "dishes": dishes,
                    "menu_id": str(new_menu.id) if new_menu else None,
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
    uid  = _parse_uuid(user_id)
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

    ws       = wb.active
    imported = 0

    for row in ws.iter_rows(min_row=1, values_only=True):
        # Columns: A=name, B=cuisine, C=restaurant_rating, D=fav_dish, E=dish_rating
        name       = row[0] if len(row) > 0 else None
        cuisine    = row[1] if len(row) > 1 else None
        rating     = row[2] if len(row) > 2 else None
        fav_dish   = row[3] if len(row) > 3 else None
        dish_rtg   = row[4] if len(row) > 4 else None

        if rating is not None and not isinstance(rating, (int, float)):
            continue
        if not name or not str(name).strip():
            continue

        rest_name = str(name).strip()

        # Look up or create a Restaurant record
        restaurant = (
            db.query(Restaurant)
            .filter(Restaurant.name.ilike(rest_name))
            .first()
        )
        if not restaurant:
            restaurant = Restaurant(
                id=uuid.uuid4(),
                name=rest_name,
                cuisine_type=str(cuisine).strip() if cuisine else None,
            )
            db.add(restaurant)
            db.flush()

        visit = RestaurantVisit(
            id=uuid.uuid4(),
            user_id=uid,
            restaurant_id=restaurant.id,
            restaurant_name=rest_name,
            cuisine_type=str(cuisine).strip() if cuisine else None,
            restaurant_rating=int(rating) if rating is not None else None,
            favorite_dish=str(fav_dish).strip() if fav_dish else None,
            dish_rating=int(dish_rtg) if dish_rtg is not None else None,
            source="import",
        )
        db.add(visit)
        db.flush()

        # If a favorite dish is present, create a stub Dish + DishRating so the
        # data participates in flavor-based profile recomputation.
        if fav_dish and dish_rtg is not None:
            stub_menu = Menu(
                id=uuid.uuid4(),
                restaurant_id=restaurant.id,
                scanned_by=None,
                verified=False,
                dish_count=1,
                raw_response=None,
            )
            # Only one menu per restaurant — skip if one already exists
            existing_menu = (
                db.query(Menu)
                .filter(Menu.restaurant_id == restaurant.id)
                .first()
            )
            target_menu = existing_menu if existing_menu else stub_menu
            if not existing_menu:
                db.add(stub_menu)
                db.flush()

            stub_dish = Dish(
                id=uuid.uuid4(),
                menu_id=target_menu.id,
                restaurant_id=restaurant.id,
                dish_name=str(fav_dish).strip(),
                flavor_source="none",
            )
            db.add(stub_dish)
            db.flush()

            db.add(DishRating(
                id=uuid.uuid4(),
                user_id=uid,
                dish_id=stub_dish.id,
                restaurant_id=restaurant.id,
                visit_id=visit.id,
                rating=int(dish_rtg),
            ))

        imported += 1

    db.commit()

    if imported > 0:
        recompute_profile(db, uid)

    return {"imported": imported}
