"""Formula-based dish scoring — no LLM calls."""
import math
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)


def _fuzzy_match(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _cosine_similarity(a: dict, b: dict) -> float:
    keys = set(a) & set(b)
    if not keys:
        return 0.5
    dot = sum(a[k] * b[k] for k in keys)
    mag_a = sum(a[k] ** 2 for k in keys) ** 0.5
    mag_b = sum(b[k] ** 2 for k in keys) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.5
    # Normalize to 0-1 range (cosine returns -1 to 1)
    return (dot / (mag_a * mag_b) + 1) / 2


def score_dishes(
    dishes: list[dict],
    profile: dict,
    cuisine_type: str,
    community_favorites: list[str] | None = None,
) -> list[dict]:
    """Score and rank dishes using a content-based filtering approach.

    Step 1 — Hard filter: dietary restrictions (score = 0, match_level = skip)
    Step 2 — Flavor similarity via cosine similarity (weight 0.70)
              Falls back to cuisine affinity when flavor_confidence == 0.
    Step 3 — Ingredient score via tanh of liked/disliked overlap (weight 0.30)
    Step 4 — Final score = flavor * 0.70 + ingredient * 0.30
              + personal top-dish bonus (0.05)
              + community favorite bonus (0.10)

    Match levels are derived from avg_score_threshold (the user's own mean rating).
    """
    affinities           = profile.get("cuisine_affinities") or {}
    cuisine_profiles     = profile.get("cuisine_profiles") or {}
    liked_ingredients    = profile.get("liked_ingredients") or {}
    disliked_ingredients = profile.get("disliked_ingredients") or {}
    dietary_restrictions = [r.lower() for r in (profile.get("dietary_restrictions") or [])]
    top_dishes           = profile.get("top_dishes") or []
    avg_threshold        = profile.get("avg_score_threshold") or 5.0
    threshold            = avg_threshold / 10.0

    cf_list       = [str(f) for f in (community_favorites or [])]
    cuisine_lower = cuisine_type.lower()

    scored = []
    for dish in dishes:
        name              = dish.get("dish_name", "")
        section           = (dish.get("section") or "mains").lower()
        description       = (dish.get("description") or "").lower()
        flavor_vector     = dish.get("flavor_vector")
        # restaurant-specific "ingredients" overrides global "base_ingredients"
        ingredients       = dish.get("ingredients") or dish.get("base_ingredients") or []
        flavor_confidence = float(dish.get("flavor_confidence") or 0.0)

        # Step 1 — Hard filter: dietary restrictions
        if any(r in description for r in dietary_restrictions):
            scored.append({
                **dish,
                "score": 0.0,
                "match_level": "skip",
                "rank": None,
                "community_pick": False,
            })
            continue

        # Step 2 — Flavor similarity (weight 0.70)
        # Resolve preference vector via fallback hierarchy
        pref_vector = None

        # Tier 1: cuisine + section — use if the user has rated enough dishes in
        # this combination (profile key exists only after recompute_profile builds it
        # from actual ratings, so its presence is the rating-count gate)
        if cuisine_profiles.get(cuisine_lower, {}).get(section):
            pref_vector = cuisine_profiles[cuisine_lower][section]

        # Tier 2: cuisine-only (average all sections)
        if pref_vector is None and cuisine_profiles.get(cuisine_lower):
            all_sections = cuisine_profiles[cuisine_lower]
            keys = set(k for sv in all_sections.values() for k in sv)
            pref_vector = {
                k: sum(sv.get(k, 0) for sv in all_sections.values()) / len(all_sections)
                for k in keys
            }

        # Tier 3: global average across all cuisines
        if pref_vector is None and cuisine_profiles:
            all_vectors = [sv for cv in cuisine_profiles.values() for sv in cv.values()]
            keys = set(k for v in all_vectors for k in v)
            pref_vector = {
                k: sum(v.get(k, 0) for v in all_vectors) / len(all_vectors)
                for k in keys
            }

        cuisine_base = affinities.get(cuisine_type, 0.5)

        if flavor_vector and pref_vector and flavor_confidence > 0:
            raw_flavor   = _cosine_similarity(flavor_vector, pref_vector)
            flavor_score = raw_flavor * flavor_confidence + cuisine_base * (1 - flavor_confidence)
        else:
            flavor_score = cuisine_base

        # Step 3 — Ingredient score (weight 0.30), bounded -1.0 to +1.0 via tanh
        if ingredients and (liked_ingredients or disliked_ingredients):
            boost   = sum(liked_ingredients.get(ing, 0)    for ing in ingredients)
            penalty = sum(disliked_ingredients.get(ing, 0) for ing in ingredients)
            ingredient_score = math.tanh(boost - penalty)
        else:
            ingredient_score = 0.0

        # Step 4 — Final score; clamp to 0 before bonuses so strong dislike
        # can't produce a negative base (tanh range is -1..+1)
        score = max(0.0, flavor_score * 0.70 + ingredient_score * 0.30)

        # Personal top-dish bonus (+0.05)
        for td in top_dishes:
            if _fuzzy_match(name, str(td)) > 0.6:
                score = min(1.0, score + 0.05)
                break

        # Community favorite bonus (+0.10) and flag
        is_community_pick = any(_fuzzy_match(name, cf) > 0.6 for cf in cf_list)
        if is_community_pick:
            score = min(1.0, score + 0.10)

        score = round(score, 3)

        # Match level derived from user's personal threshold
        great_cutoff = min(threshold + 0.15, 0.85)
        if score >= great_cutoff:
            match_level = "great"
        elif score >= threshold:
            match_level = "good"
        else:
            match_level = "good" if is_community_pick else "skip"

        scored.append({
            **dish,
            "score": score,
            "match_level": match_level,
            "community_pick": is_community_pick,
        })

    # Assign rank by descending score
    order = sorted(range(len(scored)), key=lambda i: -scored[i]["score"])
    for rank, idx in enumerate(order, start=1):
        scored[idx]["rank"] = rank

    logger.info(
        f"[scoring] {len(scored)} dishes | cuisine='{cuisine_type}' "
        f"threshold={threshold:.2f}"
    )
    return scored
