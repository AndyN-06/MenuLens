import os
import json
import re
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "mistral")

OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "600"))

# Max lines of cleaned menu text sent to the JSON-extraction call in one chunk.
# Keeps each prompt well inside the context window even for large menus.
_CHUNK_LINES = int(os.getenv("MENU_CHUNK_LINES", "60"))

# How many times to retry a failed JSON extraction by sending the broken
# output back to the LLM with a correction prompt.
_MAX_JSON_RETRIES = int(os.getenv("LLM_JSON_RETRIES", "2"))


# ---------------------------------------------------------------------------
# Low-level Ollama call
# ---------------------------------------------------------------------------

def _call_ollama(prompt: str, system_prompt: str = "") -> str:
    logger.info(f"[LLM] model={MODEL}  ctx={os.getenv('OLLAMA_NUM_CTX', '8192')}")
    logger.debug(f"[LLM] system:\n{system_prompt}")
    logger.debug(f"[LLM] user:\n{prompt}")

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        # Unload after every call so no KV-cache state bleeds into the next
        # request (the main cause of garbled JSON on repeated uploads).
        "keep_alive": 0,
        "options": {
            "temperature": 0.1,
            "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "-1")),
            # An explicit context window prevents silent truncation on large
            # menus. 8 192 tokens comfortably fits a 60-line cleaned chunk.
            "num_ctx": int(os.getenv("OLLAMA_NUM_CTX", "8192")),
        },
    }
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json=payload,
        timeout=OLLAMA_TIMEOUT,
    )
    response.raise_for_status()
    result = response.json()["response"]
    logger.debug(f"[LLM] response:\n{result}")
    return result


# ---------------------------------------------------------------------------
# JSON extraction helpers (unchanged from previous version)
# ---------------------------------------------------------------------------

def _sanitize_json_text(text: str) -> str:
    """Remove stray bare numeric tokens the LLM sometimes inserts mid-object."""
    text = re.sub(r"(?m)^[ \t]*-?\d+(\.\d+)?,?[ \t]*$\n?", "", text)
    return text


def _extract_json(text: str):
    """Try every recovery strategy in order; raise ValueError only if all fail."""
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = _sanitize_json_text(text).strip()

    for start_char in ("{", "["):
        idx = text.find(start_char)
        if idx == -1:
            continue
        candidate = text[idx:]

        # 1. Strict parse
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

        # 2. Strip trailing commas
        fixed = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 3. ast.literal_eval (single-quoted dicts)
        try:
            import ast
            return ast.literal_eval(candidate)
        except (ValueError, SyntaxError):
            pass

        # 4. Truncation recovery
        recovered = _recover_truncated(candidate)
        if recovered is not None:
            logger.warning("_extract_json: recovered truncated JSON")
            return recovered

    # 5. Salvage individual objects
    salvaged = _salvage_objects(text)
    if salvaged:
        logger.warning(f"_extract_json: salvaged {len(salvaged)} objects")
        return salvaged

    raise ValueError(f"No valid JSON in LLM output: {text[:200]!r}")


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
# Core: JSON call with retry + correction loop
# ---------------------------------------------------------------------------

def _call_ollama_for_json(
    user_prompt: str,
    system_prompt: str,
    context_label: str = "json call",
) -> object:
    """Call Ollama and guarantee a parsed JSON result.

    On each failure the broken output is sent back to the LLM verbatim with
    an explicit correction request — far more reliable than a blind retry
    because the model can see exactly what it did wrong.

    Raises ValueError only after all retries are exhausted.
    """
    last_error: Exception | None = None
    last_raw: str = ""

    for attempt in range(1 + _MAX_JSON_RETRIES):
        if attempt == 0:
            prompt = user_prompt
        else:
            # Correction prompt: show the model what it returned and why it failed
            prompt = (
                f"Your previous response could not be parsed as JSON.\n"
                f"Error: {last_error}\n\n"
                f"Broken output was:\n{last_raw[:1000]}\n\n"
                "Fix it and return ONLY valid JSON — no explanation, no markdown fences:"
            )
            logger.warning(
                f"[LLM] {context_label}: JSON parse failed "
                f"(attempt {attempt}/{_MAX_JSON_RETRIES}), sending correction prompt."
            )

        try:
            raw = _call_ollama(prompt, system_prompt)
            last_raw = raw
            result = _extract_json(raw)
            if attempt > 0:
                logger.info(f"[LLM] {context_label}: correction succeeded on attempt {attempt + 1}.")
            return result
        except ValueError as exc:
            last_error = exc
            last_raw = last_raw or ""

    logger.error(f"[LLM] {context_label}: all {1 + _MAX_JSON_RETRIES} attempts failed.")
    raise ValueError(
        f"{context_label} failed after {1 + _MAX_JSON_RETRIES} attempts. "
        f"Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# OCR cleaning (plain text — no JSON risk)
# ---------------------------------------------------------------------------

def _clean_ocr_text(raw_text: str) -> str:
    """Ask the LLM to fix OCR noise. Returns plain text so there is no JSON to break."""
    system_prompt = (
        "You are an OCR correction assistant. Fix garbled characters, merge broken words, "
        "and return clean readable menu text preserving all sections, dish names, "
        "descriptions, and prices. Return ONLY the corrected plain text."
    )
    user_prompt = (
        "Clean up this raw OCR menu text. Fix errors, merge split words, keep all dish "
        "names, prices, and section headers. Return only the corrected plain text:\n\n"
        f"{raw_text}"
    )
    try:
        cleaned = _call_ollama(user_prompt, system_prompt)
        return cleaned.strip()
    except Exception as exc:
        logger.warning(f"_clean_ocr_text failed ({exc}), using raw text.")
        return raw_text


# ---------------------------------------------------------------------------
# Chunked extraction — prevents token-limit truncation on large menus
# ---------------------------------------------------------------------------

_EXTRACT_SYSTEM = (
    "You are a menu parser. Extract every dish from the given menu text. "
    "Return ONLY a JSON object, no extra text."
)


def _extract_dishes_from_chunk(
    chunk: str,
    restaurant_name: str = "",
    cuisine_type: str = "",
) -> dict:
    """Extract structured data from one chunk of cleaned menu text."""
    user_prompt = (
        "Parse this menu section into a JSON object with these fields:\n"
        '- "restaurant_name" (string): restaurant name if visible, else '
        f'"{restaurant_name}"\n'
        '- "cuisine_type" (string): cuisine type if visible, else '
        f'"{cuisine_type}"\n'
        '- "dishes" (array): each item must have:\n'
        '    dish_name (string): the dish name\n'
        '    description (string): the FULL description from the menu including '
        'ingredients, preparation method, allergens, or any other printed details — '
        'copy it verbatim; use "" only if nothing is printed\n'
        '    price (string): price as printed, e.g. "$12.50"; use "" if not shown\n'
        '    section (string): menu section header e.g. "Appetizers"; use "" if unknown\n\n'
        f"Menu text:\n{chunk}\n\n"
        "Return a JSON object only:"
    )
    result = _call_ollama_for_json(user_prompt, _EXTRACT_SYSTEM, context_label="extract_chunk")

    if isinstance(result, list):
        return {"restaurant_name": restaurant_name, "cuisine_type": cuisine_type, "dishes": result}
    if isinstance(result, dict):
        dishes = result.get("dishes", [])
        return {
            "restaurant_name": str(result.get("restaurant_name") or restaurant_name),
            "cuisine_type": str(result.get("cuisine_type") or cuisine_type),
            "dishes": dishes if isinstance(dishes, list) else [],
        }
    return {"restaurant_name": restaurant_name, "cuisine_type": cuisine_type, "dishes": []}


def _chunk_text(text: str, max_lines: int) -> list[str]:
    """Split text into chunks of at most max_lines lines, breaking on blank lines."""
    lines = text.splitlines()
    chunks, current = [], []

    for line in lines:
        current.append(line)
        if len(current) >= max_lines and not line.strip():
            # Break at a natural blank-line boundary
            chunks.append("\n".join(current))
            current = []

    if current:
        chunks.append("\n".join(current))

    return chunks or [text]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_menu_text(raw_text: str) -> dict:
    """Extract dishes, restaurant name, and cuisine type from menu OCR text.

    Pipeline:
      1. Clean raw OCR text into readable plain text (no JSON risk).
      2. Split into ≤_CHUNK_LINES-line chunks so no single call risks
         hitting the context window limit.
      3. Extract structured JSON from each chunk with a retry+correction loop.
      4. Merge all chunks into a single result dict.

    Returns: {restaurant_name, cuisine_type, dishes: list[dict]}
    """
    _EMPTY = {"restaurant_name": "", "cuisine_type": "", "dishes": []}

    # Step 1: clean OCR noise
    cleaned_text = _clean_ocr_text(raw_text)

    # Step 2: split into safe-sized chunks
    chunks = _chunk_text(cleaned_text, _CHUNK_LINES)
    logger.info(f"[parse_menu_text] {len(chunks)} chunk(s) from {len(cleaned_text.splitlines())} lines")

    # Step 3 + 4: extract and merge
    merged: dict = _EMPTY.copy()
    merged["dishes"] = []

    for i, chunk in enumerate(chunks):
        try:
            part = _extract_dishes_from_chunk(
                chunk,
                restaurant_name=merged["restaurant_name"],
                cuisine_type=merged["cuisine_type"],
            )
        except ValueError as exc:
            # One chunk failed all retries — log and skip rather than abort
            logger.error(f"[parse_menu_text] chunk {i + 1}/{len(chunks)} failed: {exc}")
            continue

        # Keep the first non-empty restaurant/cuisine we see
        if not merged["restaurant_name"] and part["restaurant_name"]:
            merged["restaurant_name"] = part["restaurant_name"]
        if not merged["cuisine_type"] and part["cuisine_type"]:
            merged["cuisine_type"] = part["cuisine_type"]

        merged["dishes"].extend(part["dishes"])

    logger.info(
        f"[parse_menu_text] done — {len(merged['dishes'])} dishes, "
        f"restaurant='{merged['restaurant_name']}', cuisine='{merged['cuisine_type']}'"
    )
    return merged


def rank_dishes(dishes: list[dict], taste_summary: str) -> list[dict]:
    """Rank a list of already-parsed dishes against a taste profile.

    Uses the retry+correction loop so a single bad JSON response doesn't
    surface as an error.
    """
    system_prompt = (
        "You are a personal dining assistant. Rank the provided menu items "
        "from best to worst match for this user. Return only a JSON array."
    )
    user_prompt = (
        f"User taste profile:\n{taste_summary}\n\n"
        f"Menu items:\n{json.dumps(dishes, indent=2)}\n\n"
        "For each dish return: dish_name, rank (1=best), score (0.0-1.0), "
        'match_level ("great" if score>=0.75, "good" if >=0.5, "skip" otherwise). '
        "Preserve all original fields. Return ALL dishes. Return a JSON array only:"
    )
    try:
        ranked = _call_ollama_for_json(user_prompt, system_prompt, context_label="rank_dishes")
        if not isinstance(ranked, list):
            ranked = [ranked]
        for dish in ranked:
            score = dish.get("score", 0.0)
            if dish.get("match_level") not in ("great", "good", "skip"):
                dish["match_level"] = "great" if score >= 0.75 else "good" if score >= 0.5 else "skip"
        return ranked
    except ValueError as exc:
        logger.warning(f"rank_dishes: all retries failed ({exc}). Returning dishes unranked.")
        return dishes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def health_check_ollama() -> dict:
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        response.raise_for_status()
        models = [m["name"] for m in response.json().get("models", [])]
        model_ready = any(m == MODEL or m.startswith(f"{MODEL}:") for m in models)
        return {
            "status": "ok" if model_ready else "model_not_pulled",
            "model": MODEL,
            "model_ready": model_ready,
            "available_models": models,
            "pull_command": f"docker exec <ollama-container> ollama pull {MODEL}" if not model_ready else None,
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


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


# ---------------------------------------------------------------------------
# Legacy back-compat
# ---------------------------------------------------------------------------

def parse_and_rank_menu(raw_text: str, taste_summary: str) -> list[dict]:
    """Kept for backwards-compat. Prefer parse_menu_text + score_dishes."""
    dishes = parse_menu_text(raw_text).get("dishes", [])
    return rank_dishes(dishes, taste_summary) if dishes else []