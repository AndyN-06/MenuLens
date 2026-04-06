import os
import json
import re
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "mistral")

# Large models on CPU can take >2 min for a full menu parse. 600 s gives headroom.
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "600"))


def _call_ollama(prompt: str, system_prompt: str = "") -> str:
    logger.info(f"[LLM] model: {MODEL}")
    logger.info(f"[LLM] system prompt:\n{system_prompt}")
    logger.info(f"[LLM] user prompt:\n{prompt}")

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        # keep_alive: 0 — unload the model from GPU/CPU memory after each call
        # so the KV cache is fully cleared between requests. This prevents the
        # context overflow that causes garbled JSON on repeated menu uploads.
        "keep_alive": 0,
        "options": {
            "temperature": 0.1,
            "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "-1")),
            # Explicit context window. Default is often 2048 which a large menu
            # prompt can exceed, causing the model to wrap its KV buffer and
            # emit corrupted tokens on subsequent calls.
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
    logger.info(f"[LLM] response:\n{result}")
    return result


def _sanitize_json_text(text: str) -> str:
    """Remove stray bare tokens (e.g. `0,`) that the LLM sometimes inserts
    between valid JSON key-value pairs, breaking the object structure.

    Matches lines that contain only an optional number/word and a comma (or
    nothing) — but NOT lines that look like a real JSON property or value.
    """
    # Remove lines that are just a bare scalar (number, bare word, or empty)
    # followed by an optional comma — e.g. "0," or "42" on their own line.
    # We preserve lines that start with `"` (JSON keys/string values) or
    # structural chars like `{`, `}`, `[`, `]`.
    text = re.sub(r"(?m)^[ \t]*-?\d+(\.\d+)?,?[ \t]*$\n?", "", text)
    return text


def _extract_json(text: str):
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # Remove stray bare tokens the LLM occasionally inserts mid-object
    text = _sanitize_json_text(text)

    # Find the first JSON array or object
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

        # 2. Strip trailing commas before ] or }
        fixed = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 3. ast.literal_eval — handles Python-style single-quoted dicts
        try:
            import ast
            return ast.literal_eval(candidate)
        except (ValueError, SyntaxError):
            pass

        # 4. Truncation recovery — close open brackets and re-parse
        recovered = _recover_truncated(candidate)
        if recovered is not None:
            logger.warning("_extract_json: recovered truncated JSON output")
            return recovered

    # 5. Salvage: extract every complete {...} object individually
    salvaged = _salvage_objects(text)
    if salvaged:
        logger.warning(f"_extract_json: salvaged {len(salvaged)} objects from broken output")
        return salvaged

    logger.error(f"_extract_json: could not parse LLM output:\n{text[:500]}")
    raise ValueError(f"No valid JSON in LLM output: {text[:200]!r}")


def _recover_truncated(text: str):
    """Close a truncated JSON structure and attempt to parse it.

    Walks the text to build an opening-bracket stack, then appends the matching
    closing chars. Handles strings cut off mid-value by closing the quote first.
    """
    stack = []
    in_string = False
    escape_next = False

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

    # If we're inside an unfinished string, close it before the brackets
    prefix = '"' if in_string else ''
    candidate = text.rstrip() + prefix + closing
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _salvage_objects(text: str) -> list[dict]:
    """Walk text char-by-char and collect every well-formed JSON object {…}."""
    objects = []
    depth = 0
    start = None
    in_string = False
    escape_next = False

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


def _clean_ocr_text(raw_text: str) -> str:
    """Step 1: Ask the LLM to clean noisy OCR output into readable menu text.

    Returns a plain-text string with corrected spelling, merged split words,
    and logical line groupings — but no JSON yet.
    """
    system_prompt = (
        "You are an OCR correction assistant. Your only job is to clean up noisy OCR text "
        "from a restaurant menu photo into clean, readable plain text. "
        "Fix spelling errors, merge broken words, remove stray characters, and preserve "
        "the original menu structure (sections, dish names, descriptions, prices). "
        "Return ONLY the cleaned plain text. Do not add commentary or JSON."
    )
    user_prompt = (
        "Clean up the following raw OCR text from a restaurant menu. "
        "Fix any OCR errors, merge split words, and make it readable. "
        "Keep all dish names, descriptions, prices, and section headers. "
        "Return only the corrected plain text:\n\n"
        f"{raw_text}"
    )
    cleaned = _call_ollama(user_prompt, system_prompt)
    logger.info(f"[LLM] cleaned OCR text:\n{cleaned}")
    return cleaned.strip()


def parse_menu_text(raw_text: str) -> dict:
    """Extract dishes, restaurant name, and cuisine type from menu OCR text.

    Uses two sequential LLM calls for more reliable JSON output:
      1. Clean the raw OCR text into readable plain text.
      2. Parse the cleaned text into the structured JSON format.

    Returns a dict: {restaurant_name, cuisine_type, dishes: list[dict]}
    Each dish has: dish_name, description, price, section.
    """
    # Step 1: clean noisy OCR output into readable text
    cleaned_text = _clean_ocr_text(raw_text)

    # Step 2: parse the clean text into structured JSON
    system_prompt = (
        "You are a menu parser. Extract restaurant info and all dishes from the given menu text. "
        "Return ONLY a JSON object, no extra text."
    )
    user_prompt = (
        "Parse this menu text into a JSON object with these fields:\n"
        '- "restaurant_name" (string): the restaurant name if visible, else ""\n'
        '- "cuisine_type" (string): cuisine type (e.g. Italian, Japanese); infer if not explicit\n'
        '- "dishes" (array): each item has dish_name, description, price, section '
        "(all strings; use \"\" if unknown)\n\n"
        f"Menu text:\n{cleaned_text}\n\n"
        "Return a JSON object only:"
    )
    raw = _call_ollama(user_prompt, system_prompt)
    result = _extract_json(raw)

    # Normalise: if LLM returned a bare list, wrap it
    if isinstance(result, list):
        return {"restaurant_name": "", "cuisine_type": "", "dishes": result}

    if isinstance(result, dict):
        dishes = result.get("dishes", [])
        if not isinstance(dishes, list):
            dishes = []
        return {
            "restaurant_name": str(result.get("restaurant_name") or ""),
            "cuisine_type": str(result.get("cuisine_type") or ""),
            "dishes": dishes,
        }

    return {"restaurant_name": "", "cuisine_type": "", "dishes": []}


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
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def summarize_taste_profile(profile: dict) -> str:
    """Human-readable one-paragraph summary of a taste profile (for logging/display)."""
    parts = []

    affinities = profile.get("cuisine_affinities") or {}
    loved = sorted(
        [c for c, s in affinities.items() if s >= 0.7],
        key=lambda c: -affinities[c],
    )
    if loved:
        cuisines = ", ".join(loved)
        parts.append(f"Loves {cuisines} cuisine{'s' if len(loved) > 1 else ''}.")

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


# ── Legacy functions kept for any direct callers ──────────────────────────────

def parse_and_rank_menu(raw_text: str, taste_summary: str) -> list[dict]:
    """Kept for backwards-compat. Prefer parse_menu_text + score_dishes."""
    system_prompt = (
        "You are a personal dining assistant and menu parser. "
        "Given raw menu text and a user's taste profile, extract every dish "
        "from the menu and rank them by how well they match this user. "
        "Return ONLY a JSON array, no explanation outside the JSON."
    )
    user_prompt = (
        f"User taste profile:\n{taste_summary}\n\n"
        f"Menu text (JSON-encoded string): {json.dumps(raw_text)}\n\n"
        "Extract every dish and rank them for this specific user. "
        "Each element must have: dish_name (str), description (str), price (str), section (str), "
        "rank (int, 1=best match), score (float 0.0–1.0), "
        'match_level ("great" if score>=0.75, "good" if >=0.5, "skip" otherwise). '
        "Return ALL dishes. Return a JSON array only:"
    )
    raw = _call_ollama(user_prompt, system_prompt)
    try:
        result = _extract_json(raw)
        if isinstance(result, dict):
            result = result.get("dishes", [result])
        if not isinstance(result, list):
            result = []
        for dish in result:
            score = dish.get("score", 0.0)
            if dish.get("match_level") not in ("great", "good", "skip"):
                dish["match_level"] = "great" if score >= 0.75 else "good" if score >= 0.5 else "skip"
        return result
    except Exception as e:
        logger.warning(f"parse_and_rank_menu failed ({e}), falling back to parse-only.")
        return parse_menu_text(raw_text).get("dishes", [])


def rank_dishes(dishes: list[dict], taste_summary: str) -> list[dict]:
    system_prompt = (
        "You are a personal dining assistant. Given a user's taste profile and a list of "
        "menu items, rank the dishes from best to worst match for this specific user. "
        "Return only a JSON array. No explanation outside the JSON."
    )
    user_prompt = (
        f"User taste profile:\n{taste_summary}\n\n"
        f"Menu items:\n{json.dumps(dishes, indent=2)}\n\n"
        "For each dish return: dish_name, rank (1=best), score (0.0-1.0), "
        'match_level ("great" if score >= 0.75, "good" if >= 0.5, "skip" otherwise). '
        "Preserve all original fields (description, price, section). "
        "Return ALL dishes ranked. Return a JSON array only:"
    )
    raw = _call_ollama(user_prompt, system_prompt)
    try:
        ranked = _extract_json(raw)
        if not isinstance(ranked, list):
            ranked = [ranked]
        for dish in ranked:
            score = dish.get("score", 0.0)
            if dish.get("match_level") not in ("great", "good", "skip"):
                dish["match_level"] = "great" if score >= 0.75 else "good" if score >= 0.5 else "skip"
        return ranked
    except Exception as e:
        logger.warning(f"rank_dishes failed ({e}). Returning unranked.")
        return dishes
