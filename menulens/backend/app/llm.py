"""
LLM module — Claude Vision replaces the previous OCR + Ollama pipeline.

A single API call to claude-opus-4-5 reads the menu image directly and
returns structured JSON. No OCR step, no chunking, no retry loops for
cleaning text.
"""

import os
import re
import json
import base64
import logging

import anthropic

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None

ANTHROPIC_MODEL      = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")
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
        logger.info(f"[llm] resized image {w}x{h} -> {new_w}x{new_h}")
        return buf.getvalue()

    except Exception as exc:
        logger.warning(f"[llm] image resize skipped ({exc}), using original")
        return image_data


# ---------------------------------------------------------------------------
# JSON extraction helpers — kept as a safety net for Claude output
# ---------------------------------------------------------------------------

def _sanitize_json_text(text: str) -> str:
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

    Returns: {restaurant_name, cuisine_type, dishes: list[dict]}
    """
    _EMPTY = {"restaurant_name": "", "cuisine_type": "", "dishes": []}

    image_data = _resize_if_needed(image_data)
    media_type = _detect_media_type(image_data)
    b64 = base64.standard_b64encode(image_data).decode("utf-8")

    logger.info(
        f"[llm] parse_menu_image: model={ANTHROPIC_MODEL} "
        f"media_type={media_type} image_size={len(image_data):,}B"
    )

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
            f"[llm] parse_menu_image done -- {len(merged['dishes'])} dishes, "
            f"restaurant='{merged['restaurant_name']}', cuisine='{merged['cuisine_type']}'"
        )
        return merged

    return _EMPTY


def parse_menu_pdf(pdf_data: bytes) -> dict:
    """Extract structured dish data from a menu PDF using Claude's document API.

    Returns: {restaurant_name, cuisine_type, dishes: list[dict]}
    """
    _EMPTY = {"restaurant_name": "", "cuisine_type": "", "dishes": []}

    b64 = base64.standard_b64encode(pdf_data).decode("utf-8")

    logger.info(
        f"[llm] parse_menu_pdf: model={ANTHROPIC_MODEL} "
        f"pdf_size={len(pdf_data):,}B"
    )

    try:
        response = _get_client().messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=ANTHROPIC_MAX_TOKENS,
            system=_EXTRACT_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
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
            f"[llm] parse_menu_pdf done -- {len(merged['dishes'])} dishes, "
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
    loved = sorted(
        [c for c, s in affinities.items() if s >= 0.7],
        key=lambda c: -affinities[c],
    )
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
