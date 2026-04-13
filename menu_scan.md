# MenuLens — Claude Vision Menu Scan Refactor

## Overview

This document specifies the complete replacement of the existing OCR + Ollama pipeline with a single Claude Vision API call. The goal is to collapse five sequential steps (EasyOCR, OCR cleaning, chunking, dish extraction, JSON retry loop) into one API call that reads the menu image directly and returns structured JSON.

The entire change is contained to `llm.py`, `ocr.py`, `requirements.txt`, `Dockerfile`, and `docker-compose.yml`. The scoring pipeline (`scoring.py`), all API endpoints in `main.py`, and the frontend are **not changed** except where `main.py` references the deleted functions by name.

---

## What NOT to Change

- `scoring.py` — untouched
- `models.py` — untouched
- `database.py` — untouched
- `index.css` — untouched
- All frontend files — untouched
- All existing API endpoint signatures in `main.py` — untouched
- `summarize_taste_profile()` in `llm.py` — untouched
- The `/api/recommend/rank` endpoint logic — untouched
- The `/api/import/excel` endpoint — untouched

---

## Files to Delete

### `backend/app/ocr.py`

Delete this file entirely. It is replaced by the Claude Vision call inside `llm.py`. Nothing should import from `ocr.py` after this change — update all import sites in `main.py`.

---

## Files to Modify

### 1. `backend/requirements.txt`

Remove:
```
# easyocr is installed from local source (EasyOCR/) in the Dockerfile
```

Add:
```
anthropic>=0.25.0
```

Final `requirements.txt` should be:
```
fastapi==0.109.2
uvicorn[standard]==0.27.1
python-multipart==0.0.9
requests==2.31.0
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
alembic==1.13.1
openpyxl==3.1.2
anthropic>=0.25.0
```

---

### 2. `backend/Dockerfile`

Replace the entire file with:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY menulens/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY menulens/backend/app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

Removed:
- The `apt-get` block installing `libgl1` and `libglib2.0-0` (OpenCV system deps)
- The `COPY EasyOCR/` and `RUN pip install /easyocr_src/` block
- The `RUN python -c "import easyocr..."` model pre-download step

The resulting image is dramatically smaller — PyTorch and torchvision are no longer in the dependency tree.

---

### 3. `docker-compose.yml`

Remove the `ollama` service entirely:

```yaml
# DELETE this entire service block:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
```

Remove `ollama_data` from the `volumes` section at the bottom.

Remove the ollama dependency and env vars from the `backend` service:

```yaml
# REMOVE from backend.depends_on:
      ollama:
        condition: service_started

# REMOVE from backend.environment:
      - OLLAMA_URL=http://ollama:11434
      - OLLAMA_MODEL=phi3:mini
```

Add `ANTHROPIC_API_KEY` to `backend.environment`:

```yaml
    environment:
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=postgresql://menulens:menulens@db:5432/menulens
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

The `ANTHROPIC_API_KEY` is read from the host environment at `docker-compose up` time. Add a `.env` file to the project root (already in `.gitignore`) with:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Final `docker-compose.yml` services block should have only `db` and `backend`.

---

### 4. `backend/app/llm.py`

This is the most significant change. Replace the file with the version below.

**What is removed:**
- All Ollama-related code: `_call_ollama()`, `_call_ollama_for_json()`, `OLLAMA_URL`, `MODEL`, `OLLAMA_TIMEOUT`, `_CHUNK_LINES`, `_MAX_JSON_RETRIES`
- `_clean_ocr_text()` — no longer needed; Claude reads the image directly
- `_chunk_text()` — no longer needed; Claude's context window handles full menus
- `_extract_dishes_from_chunk()` — replaced by the single vision call
- `rank_dishes()` — scoring is handled by `scoring.py`; LLM ranking is no longer used
- `parse_and_rank_menu()` legacy back-compat function
- `health_check_ollama()` — replaced by `health_check_anthropic()`

**What is kept:**
- `_extract_json()` and all its recovery helpers (`_sanitize_json_text`, `_recover_truncated`, `_salvage_objects`) — kept as a safety net for the Claude response
- `summarize_taste_profile()` — unchanged

**New `llm.py`:**

```python
import os
import re
import json
import base64
import logging

import anthropic

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")
ANTHROPIC_MAX_TOKENS = int(os.getenv("ANTHROPIC_MAX_TOKENS", "4096"))

# Maximum long-edge pixel dimension before resizing.
# Keeps image token cost predictable without affecting text legibility.
_MAX_IMAGE_PX = int(os.getenv("MENU_MAX_IMAGE_PX", "1600"))


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _detect_media_type(image_data: bytes) -> str:
    if image_data[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if image_data[:2] == b'\xff\xd8':
        return "image/jpeg"
    if image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
        return "image/webp"
    if image_data[:4] == b'GIF8':
        return "image/gif"
    return "image/jpeg"  # safe fallback


def _resize_if_needed(image_data: bytes) -> bytes:
    """Downscale to _MAX_IMAGE_PX on the long edge if the image is larger.

    This keeps API image token costs predictable. Menu text is legible at
    1600px; higher resolutions add cost with no practical benefit.
    Requires Pillow. Falls back to original bytes if Pillow is unavailable.
    """
    try:
        from PIL import Image
        from io import BytesIO

        img = Image.open(BytesIO(image_data))
        w, h = img.size
        long_edge = max(w, h)

        if long_edge <= _MAX_IMAGE_PX:
            return image_data

        scale = _MAX_IMAGE_PX / long_edge
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        buf = BytesIO()
        fmt = img.format or "JPEG"
        img.save(buf, format=fmt)
        logger.info(f"[llm] resized image {w}x{h} → {new_w}x{new_h}")
        return buf.getvalue()

    except Exception as exc:
        logger.warning(f"[llm] image resize skipped ({exc}), using original")
        return image_data


# ---------------------------------------------------------------------------
# JSON extraction helpers (unchanged — kept as safety net for Claude output)
# ---------------------------------------------------------------------------

def _sanitize_json_text(text: str) -> str:
    text = re.sub(r"(?m)^[ \t]*-?\d+(\.\d+)?,?[ \t]*$\n?", "", text)
    return text


def _extract_json(text: str):
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = _sanitize_json_text(text).strip()

    for start_char in ("{", "["):
        idx = text.find(start_char)
        if idx == -1:
            continue
        candidate = text[idx:]

        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

        fixed = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        try:
            import ast
            return ast.literal_eval(candidate)
        except (ValueError, SyntaxError):
            pass

        recovered = _recover_truncated(candidate)
        if recovered is not None:
            logger.warning("_extract_json: recovered truncated JSON")
            return recovered

    salvaged = _salvage_objects(text)
    if salvaged:
        logger.warning(f"_extract_json: salvaged {len(salvaged)} objects")
        return salvaged

    raise ValueError(f"No valid JSON in response: {text[:200]!r}")


def _recover_truncated(text: str):
    stack, in_string, escape_next = [], False, False
    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if in_string:
            if ch == '\\':
                escape_next = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in ('{', '['):
            stack.append(ch)
        elif ch == '}' and stack and stack[-1] == '{':
            stack.pop()
        elif ch == ']' and stack and stack[-1] == '[':
            stack.pop()

    closer = {'[': ']', '{': '}'}
    closing = ''.join(closer[c] for c in reversed(stack))
    prefix = '"' if in_string else ''
    candidate = re.sub(r",\s*([}\]])", r"\1", text.rstrip() + prefix + closing)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _salvage_objects(text: str) -> list[dict]:
    objects, depth, start = [], 0, None
    in_string, escape_next = False, False
    for i, ch in enumerate(text):
        if escape_next:
            escape_next = False
            continue
        if in_string:
            if ch == '\\':
                escape_next = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start:i + 1]
                for attempt in (candidate, re.sub(r",\s*([}\]])", r"\1", candidate)):
                    try:
                        obj = json.loads(attempt)
                        if isinstance(obj, dict):
                            objects.append(obj)
                        break
                    except json.JSONDecodeError:
                        pass
                start = None
    return objects


# ---------------------------------------------------------------------------
# Core: single Claude Vision call
# ---------------------------------------------------------------------------

_EXTRACT_SYSTEM = (
    "You are a menu parser. Extract every dish from the provided restaurant menu image. "
    "Return ONLY a JSON object, no explanation, no markdown fences."
)

_EXTRACT_PROMPT = (
    "Extract all dishes from this restaurant menu image. "
    "Return ONLY a JSON object with these fields:\n"
    '- "restaurant_name" (string): the restaurant name if visible, else ""\n'
    '- "cuisine_type" (string): the cuisine type if determinable, else ""\n'
    '- "dishes" (array): every dish on the menu, each with:\n'
    '    "dish_name" (string): the dish name\n'
    '    "description" (string): full description as printed; use "" if none\n'
    '    "price" (string): price as printed e.g. "$12.50"; use "" if not shown\n'
    '    "section" (string): menu section header e.g. "Appetizers"; use "" if unknown\n\n'
    "Include every dish. Return the JSON object only."
)


def parse_menu_image(image_data: bytes) -> dict:
    """Extract structured dish data from a menu image using Claude Vision.

    Replaces the previous pipeline of:
      EasyOCR → _clean_ocr_text → _chunk_text → _extract_dishes_from_chunk (×N)

    Returns: {restaurant_name, cuisine_type, dishes: list[dict]}
    """
    _EMPTY = {"restaurant_name": "", "cuisine_type": "", "dishes": []}

    image_data = _resize_if_needed(image_data)
    media_type = _detect_media_type(image_data)
    b64 = base64.standard_b64encode(image_data).decode("utf-8")

    logger.info(f"[llm] parse_menu_image: model={ANTHROPIC_MODEL} media_type={media_type} "
                f"image_size={len(image_data):,}B")

    try:
        response = _get_client().messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=ANTHROPIC_MAX_TOKENS,
            system=_EXTRACT_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": _EXTRACT_PROMPT,
                    },
                ],
            }],
        )
    except anthropic.APIError as exc:
        logger.error(f"[llm] Anthropic API error: {exc}")
        raise

    raw = response.content[0].text
    logger.debug(f"[llm] raw response:\n{raw[:500]}")

    try:
        result = _extract_json(raw)
    except ValueError as exc:
        logger.error(f"[llm] JSON extraction failed: {exc}")
        return _EMPTY

    if isinstance(result, list):
        return {"restaurant_name": "", "cuisine_type": "", "dishes": result}

    if isinstance(result, dict):
        dishes = result.get("dishes", [])
        merged = {
            "restaurant_name": str(result.get("restaurant_name") or ""),
            "cuisine_type": str(result.get("cuisine_type") or ""),
            "dishes": dishes if isinstance(dishes, list) else [],
        }
        logger.info(
            f"[llm] parse_menu_image done — {len(merged['dishes'])} dishes, "
            f"restaurant='{merged['restaurant_name']}', cuisine='{merged['cuisine_type']}'"
        )
        return merged

    return _EMPTY


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def health_check_anthropic() -> dict:
    """Verify the Anthropic API key is valid and the target model is reachable."""
    try:
        _get_client().messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=16,
            messages=[{"role": "user", "content": "ping"}],
        )
        return {"status": "ok", "model": ANTHROPIC_MODEL}
    except anthropic.AuthenticationError:
        return {"status": "error", "detail": "Invalid ANTHROPIC_API_KEY"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Taste profile summary (unchanged)
# ---------------------------------------------------------------------------

def summarize_taste_profile(profile: dict) -> str:
    parts = []
    affinities = profile.get("cuisine_affinities") or {}
    loved = sorted([c for c, s in affinities.items() if s >= 0.7], key=lambda c: -affinities[c])
    if loved:
        parts.append(f"Loves {', '.join(loved)} cuisine{'s' if len(loved) > 1 else ''}.")
    top_dishes = profile.get("top_dishes") or []
    if top_dishes:
        parts.append(f"Top dishes: {', '.join(str(d) for d in top_dishes[:5])}.")
    avg_threshold = profile.get("avg_score_threshold")
    if avg_threshold is not None:
        parts.append(f"Avg dish rating: {avg_threshold:.1f}/10.")
    restrictions = profile.get("dietary_restrictions") or []
    if restrictions:
        parts.append(f"Dietary restrictions: {', '.join(restrictions)}.")
    return " ".join(parts) if parts else "No taste profile available."
```

---

### 5. `backend/app/main.py`

Four targeted changes only. Do not restructure any endpoint logic.

#### 5a. Update imports at the top of the file

Remove:
```python
from .ocr import extract_text_from_image
from .llm import parse_menu_text, health_check_ollama, summarize_taste_profile
```

Add:
```python
from .llm import parse_menu_image, health_check_anthropic, summarize_taste_profile
```

#### 5b. Remove `_warmup_ocr()`

Delete the entire `_warmup_ocr()` function and the `asyncio.ensure_future(...)` line that calls it inside the `lifespan` handler. The Claude client has no warmup cost.

#### 5c. Update `GET /health/llm`

```python
@app.get("/health/llm")
async def health_llm():
    result = health_check_anthropic()
    if result["status"] == "error":
        raise HTTPException(status_code=503, detail=result)
    return result
```

#### 5d. Replace all calls to `extract_text_from_image` + `parse_menu_text`

There are three sites in `main.py` where these are called together:

**`POST /api/ocr`** — this endpoint exists for debugging. Update it to call `parse_menu_image` and return the raw dish list as a text representation, or simply return a message that raw OCR text is no longer separately available. The simplest approach is:

```python
@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        image_data = await file.read()
        logger.info(f"[OCR] processing {file.filename} ({len(image_data):,} bytes)")
        parsed = parse_menu_image(image_data)
        # Return dish names as plain text for backward compat with debug tooling
        lines = [d.get("dish_name", "") for d in parsed.get("dishes", [])]
        text = "\n".join(lines)
        return {"filename": file.filename, "text": text, "char_count": len(text)}
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
```

**`POST /api/parse`** — update to use `parse_menu_image`:

```python
@app.post("/api/parse")
async def parse_endpoint(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        image_data = await file.read()
        parsed = parse_menu_image(image_data)
        return {
            "filename": file.filename,
            "dish_count": len(parsed.get("dishes", [])),
            **parsed,
        }
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
```

**`POST /api/recommend`** (legacy non-streaming endpoint) — replace the OCR + parse block:

```python
# Before:
image_data = await file.read()
raw_text = extract_text_from_image(image_data)
parsed = parse_menu_text(raw_text)

# After:
image_data = await file.read()
parsed = parse_menu_image(image_data)
```

**`POST /api/recommend/stream`** — this is the primary endpoint. Inside the `run()` function, replace:

```python
# Before (inside run()):
_sse({"type": "log", "message": f"[OCR] Processing {filename}..."})
raw_text = extract_text_from_image(image_data)
lines = [l for l in raw_text.splitlines() if l.strip()]
_sse({"type": "log", "message": f"[OCR] Extracted {len(lines)} lines"})
for i, line in enumerate(lines, 1):
    _sse({"type": "log", "message": f"[OCR]  {i:>3}: {line}"})
_sse({"type": "debug_ocr", "text": raw_text})
_sse({"type": "debug_llm_input", "text": first_llm_input})
_sse({"type": "log", "message": "[LLM] Parsing menu..."})
parsed = parse_menu_text(raw_text)
```

```python
# After (inside run()):
_sse({"type": "log", "message": f"[Claude] Analyzing {filename}..."})
parsed = parse_menu_image(image_data)
```

Also remove the `first_llm_input` string construction block immediately above the LLM parse call — it no longer applies.

The `parsed` variable and everything after it in `run()` is unchanged.

Also remove `app.ocr` from the `watched` loggers list in `generate()` since `ocr.py` no longer exists:

```python
# Before:
watched = [
    logging.getLogger("app.ocr"),
    logging.getLogger("app.llm"),
    logging.getLogger("app.main"),
]

# After:
watched = [
    logging.getLogger("app.llm"),
    logging.getLogger("app.main"),
]
```

---

## Optional: Add Pillow for Image Resizing

The `_resize_if_needed()` function in `llm.py` requires Pillow. If you want the resize behavior (recommended for keeping API costs predictable on high-res uploads), add it to `requirements.txt`:

```
Pillow>=10.0.0
```

If Pillow is not installed, `_resize_if_needed()` logs a warning and passes the original bytes through unchanged — it will not crash.

---

## Environment Variables Reference

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Anthropic API key — must be set in env or `.env` file |
| `ANTHROPIC_MODEL` | `claude-opus-4-5` | Claude model to use for menu parsing |
| `ANTHROPIC_MAX_TOKENS` | `4096` | Max tokens in Claude response |
| `MENU_MAX_IMAGE_PX` | `1600` | Long-edge pixel cap before resizing (requires Pillow) |

All Ollama-related env vars (`OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT`, `OLLAMA_NUM_CTX`, `OLLAMA_NUM_PREDICT`, `MENU_CHUNK_LINES`, `LLM_JSON_RETRIES`) are no longer used and can be removed from any `.env` files.

---

## New Pipeline Summary

```
POST /api/recommend/stream
  │
  ├── image_data = await file.read()
  │
  ├── parse_menu_image(image_data)          ← single Claude Vision API call
  │     _resize_if_needed()                 ← cap to 1600px long edge
  │     _detect_media_type()                ← sniff bytes for JPEG/PNG/WEBP
  │     anthropic.messages.create()         ← image + extraction prompt
  │     _extract_json()                     ← safety net parser
  │     → {restaurant_name, cuisine_type, dishes}
  │
  └── SSE: "parsed" event → frontend calls /api/recommend/rank
        score_dishes()                      ← scoring.py, no LLM
        → ranked dish list
```

Total LLM calls per menu scan: **1**

---

## Testing Checklist

- [ ] `docker-compose up` starts cleanly with only `db` and `backend` services
- [ ] `GET /health/llm` returns `{"status": "ok", "model": "claude-opus-4-5"}`
- [ ] `POST /api/parse` with a menu image returns a parsed dish list
- [ ] `POST /api/recommend/stream` emits a `parsed` SSE event with `dishes` array
- [ ] `POST /api/recommend/rank` returns scored dishes after `parsed` event
- [ ] High-resolution image upload (> 1600px) is resized before API call (check logs)
- [ ] Invalid API key returns 503 from `/health/llm`, not an unhandled exception
- [ ] Full pipeline (upload → ranked results on screen) completes successfully
