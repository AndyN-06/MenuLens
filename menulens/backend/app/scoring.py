"""Formula-based dish scoring — no LLM calls."""
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)


def _fuzzy_match(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def score_dishes(dishes: list[dict], profile: dict, cuisine_type: str) -> list[dict]:
    """Score and rank dishes using a simple formula.

    Score = cuisine_affinity_base + 0.15 if dish name fuzzy-matches a top dish.
    match_level thresholds are derived from avg_score_threshold / 10.
    """
    affinities = profile.get("cuisine_affinities") or {}
    top_dishes = profile.get("top_dishes") or []
    avg_threshold = profile.get("avg_score_threshold") or 5.0

    base = affinities.get(cuisine_type, 0.5)
    threshold = avg_threshold / 10.0  # normalise to 0–1

    scored = []
    for dish in dishes:
        name = dish.get("dish_name", "")
        bonus = 0.0
        for td in top_dishes:
            if _fuzzy_match(name, str(td)) > 0.6:
                bonus = 0.15
                break

        score = min(1.0, base + bonus)

        # Derive match_level from threshold
        great_cutoff = min(threshold + 0.15, 0.85)
        if score >= great_cutoff:
            match_level = "great"
        elif score >= threshold:
            match_level = "good"
        else:
            match_level = "skip"

        scored.append({**dish, "score": round(score, 3), "match_level": match_level})

    # Assign rank by descending score (preserving original order for equal scores)
    order = sorted(range(len(scored)), key=lambda i: -scored[i]["score"])
    for rank, idx in enumerate(order, start=1):
        scored[idx]["rank"] = rank

    logger.info(
        f"[scoring] {len(scored)} dishes | cuisine='{cuisine_type}' "
        f"base={base:.2f} threshold={threshold:.2f}"
    )
    return scored
