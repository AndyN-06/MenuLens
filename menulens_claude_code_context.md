# MenuLens — Claude Code Context Document
## Slice 3 & 4: Taste Profile + Personalized Ranking

---

## Project Snapshot

MenuLens is a full-stack web app that lets users upload a restaurant menu photo and receive personalized dish recommendations based on their taste profile. It uses OCR to extract menu text, an LLM to parse it into structured dishes, and a second LLM call to rank those dishes against the user's stored preferences.

| | |
|---|---|
| **Stack** | FastAPI (Python 3.11) · PostgreSQL · React 18 · Vite · Ollama (Mistral 7B local) |
| **Repo layout** | `menulens/backend/` (FastAPI app) · `menulens/frontend/` (React/Vite app) |
| **Slices done** | Slice 1 — OCR pipeline (EasyOCR → raw text) · Slice 2 — LLM parse (raw text → dish JSON) |
| **Slices to build** | Slice 3 — Taste profile (onboarding + Postgres) · Slice 4 — Ranked dish recommendations |

---

## Current File Structure

The following files already exist. Do not recreate them — only add to or modify them as specified.

```
menulens/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          # FastAPI app. Endpoints: GET /health, GET /health/llm,
│       │                    # POST /api/ocr, POST /api/parse
│       ├── ocr.py           # EasyOCR wrapper (singleton reader, extract_text_from_image())
│       └── llm.py           # Ollama client (_call_ollama, _extract_json,
│                            # parse_menu_text, health_check_ollama)
└── frontend/
    ├── index.html
    ├── package.json         # deps: react, react-dom | devDeps: vite, @vitejs/plugin-react
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx          # Stage machine: idle | ocr | parsing | done | error
        ├── index.css        # Full design system (dark editorial theme)
        └── components/
            ├── Uploader.jsx    # Drag/drop, stage-aware labels, reset button
            ├── OcrResult.jsx   # Collapsible raw OCR detail view
            └── DishCards.jsx   # Dishes grouped by section (name/price/description)
```

---

## Design System Reference

All new components must use these CSS variables from `index.css`. Do not introduce new color values or fonts.

```css
--bg: #0d0d0d              /* page background */
--surface: #161616         /* card/panel background */
--surface-2: #1f1f1f       /* hover state background */
--border: #2a2a2a          /* default border */
--border-hover: #3d3d3d    /* hover border */
--text: #f0ece4            /* primary text */
--text-muted: #6b6560      /* secondary/hint text */
--text-dim: #9e9790        /* tertiary text */
--accent: #e8c97a          /* gold accent — CTAs, highlights */
--accent-dim: rgba(232, 201, 122, 0.12)
--green: #7ec98a           /* success / high confidence */
--amber: #e8c97a           /* warning / medium confidence */
--red: #e07a7a             /* error / low confidence */
--radius: 10px
--radius-lg: 16px

/* Fonts */
'DM Serif Display'  — headings and display text
'Outfit'            — body text, UI labels (weight: 300/400/500/600)
'DM Mono'           — code, prices, confidence scores, metadata
```

---

---

# SLICE 3 — Taste Profile Onboarding + Persistence

## Goal

A user can express their food preferences through an onboarding flow and have those preferences persisted in PostgreSQL. The taste profile will be used in Slice 4 to personalize dish rankings.

---

## 3A — Database Setup

### Extend docker-compose.yml

Add a `postgres` service. The backend service should depend on it.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: menulens
      POSTGRES_PASSWORD: menulens
      POSTGRES_DB: menulens
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    depends_on: [db]
    environment:
      - DATABASE_URL=postgresql://menulens:menulens@db:5432/menulens

volumes:
  pgdata:
```

### Add to requirements.txt

```
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
alembic==1.13.1
```

### Create backend/app/database.py

SQLAlchemy engine + session factory + Base. Read `DATABASE_URL` from env with a local fallback for development without Docker.

```python
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://menulens:menulens@localhost:5432/menulens")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 3B — Data Models

### Create backend/app/models.py

Define two SQLAlchemy models. Use UUID primary keys (`server_default=text("gen_random_uuid()")`).

**Model 1: User**
```python
class User(Base):
    __tablename__ = "users"
    id         = Column(UUID, primary_key=True, server_default=text("gen_random_uuid()"))
    created_at = Column(DateTime, server_default=func.now())
    # No auth in MVP — users identified by UUID stored in localStorage
```

**Model 2: TasteProfile**
```python
class TasteProfile(Base):
    __tablename__ = "taste_profiles"
    id                   = Column(UUID, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id              = Column(UUID, ForeignKey("users.id"), unique=True, nullable=False)
    cuisine_affinities   = Column(JSONB)   # e.g. {"Thai": 0.9, "French": 0.4}
    flavor_tags          = Column(JSONB)   # e.g. ["spicy", "umami", "herbaceous"]
    disliked_tags        = Column(JSONB)   # e.g. ["heavy cream", "overly sweet"]
    dietary_restrictions = Column(JSONB)   # e.g. ["no shellfish", "vegetarian"]
    rated_dishes         = Column(JSONB)   # e.g. [{name, cuisine, tags, score}]
    updated_at           = Column(DateTime, onupdate=func.now())
```

Call `Base.metadata.create_all(bind=engine)` in a FastAPI `startup` event in `main.py` to auto-create tables.

---

## 3C — API Endpoints

Add all of the following to `backend/app/main.py`.

### POST /api/users
Create a new anonymous user. Returns `{ user_id }`. The frontend stores this UUID in localStorage to identify the session across requests.

### GET /api/profile/{user_id}
Fetch the taste profile for a user. Returns the full TasteProfile object, or 404 if not yet created.

### POST /api/profile/{user_id}
Create or fully replace a taste profile. Accepts the onboarding payload (schema below). Returns the saved profile.

### PATCH /api/profile/{user_id}
Partial update — used post-onboarding when a user rates a dish. Merges new `rated_dishes` entries and recomputes `cuisine_affinities` incrementally. Does not overwrite fields that are not included in the request body.

### Onboarding payload schema (Pydantic)

```python
class TasteProfileCreate(BaseModel):
    cuisine_affinities:   dict[str, float]  # cuisine name → 0.0–1.0 score
    flavor_tags:          list[str]
    disliked_tags:        list[str]
    dietary_restrictions: list[str]
    rated_dishes:         list[dict] = []   # optional at creation
```

---

## 3D — Frontend: Onboarding Flow

### New file: frontend/src/components/Onboarding.jsx

A multi-step form that collects taste preferences. Show this when no `user_id` exists in localStorage. On completion:
1. Call `POST /api/users` to create a user
2. Call `POST /api/profile/{user_id}` with the collected preferences
3. Store `user_id` in localStorage
4. Transition to the main upload view

**Step 1 — Cuisine Ratings (required)**
Show 10–12 cuisine cards: Thai, Japanese, Italian, Mexican, Indian, French, Korean, Mediterranean, American, Chinese, Middle Eastern, Vietnamese. User rates each on a 1–5 scale or skips. Convert ratings to 0.0–1.0 affinity scores before submitting.

**Step 2 — Flavor Preferences (required)**
Multi-select tag grid. Options: Spicy, Umami, Herbaceous, Smoky, Sour/Bright, Sweet, Rich/Fatty, Light/Clean, Earthy, Fermented. User selects all that appeal to them.

**Step 3 — Dislikes & Restrictions (optional)**
Two inputs: (1) multi-select for common dislikes (Heavy cream, Overly sweet, Fishy, Gamey, Very oily) and (2) a free-text dietary restrictions field.

### Design requirements for Onboarding

- Match the existing dark editorial design system exactly — CSS variables only, no hardcoded colors
- Progress indicator showing "Step X of 3"
- Cuisine cards: flag emoji + cuisine name + 5-star rating control
- Flavor tags: pill-shaped toggles, accent color when selected
- Back/Next navigation; final step has a "Build My Profile" CTA button styled with `--accent`
- Animate step transitions with a subtle fade/slide (CSS only)

### Update App.jsx

Add an `"onboarding"` stage to the existing stage machine. On app load, check localStorage for `user_id`. If absent, render `<Onboarding />` instead of `<Uploader />`. On onboarding completion, set stage to `"idle"` and proceed to the normal upload flow.

---

## 3E — Profile Summary Helper

### New function in backend/app/llm.py: summarize_taste_profile(profile)

Takes a TasteProfile dict and returns a compact natural-language string for use in LLM prompts. This implements the hybrid design decision: profile lives in DB, but is summarized into prompt context at inference time.

```python
def summarize_taste_profile(profile: dict) -> str:
    # Build deterministically from structured fields — NO LLM call here.
    # Example output:
    # "This user loves bold Thai and Japanese flavors, especially spicy and
    #  umami-forward dishes. They prefer light, herbaceous preparations and
    #  avoid heavy cream and overly sweet dishes.
    #  Dietary restrictions: no shellfish."
    ...
```

Keep this function purely template-based (string formatting). Reserve LLM calls for the ranking step in Slice 4.

---

---

# SLICE 4 — Personalized Dish Ranking

## Goal

After menu upload → OCR → parse, use the user's stored taste profile to rank the parsed dishes with personalized reasoning. This is the core value proposition of the app.

---

## 4A — LLM Ranking Function

### New function in backend/app/llm.py: rank_dishes(dishes, taste_summary)

LLM Call #2 in the pipeline. Takes the structured dish list from `parse_menu_text()` and the natural-language taste summary from `summarize_taste_profile()`. Returns all dishes ranked with scores and reasoning.

```python
def rank_dishes(dishes: list[dict], taste_summary: str) -> list[dict]:
    # Returns list of:
    # {
    #   dish_name:   str,
    #   description: str,
    #   price:       str,
    #   section:     str,
    #   rank:        int,    # 1 = best match
    #   score:       float,  # 0.0–1.0 match score
    #   reasoning:   str,    # 1–2 sentence personal explanation
    #   match_level: str     # "great" | "good" | "skip"
    # }
```

### Prompt design

**System prompt:**
```
You are a personal dining assistant. Given a user's taste profile and a list of
menu items, rank the dishes from best to worst match for this specific user.
Return only a JSON array. No explanation outside the JSON.
```

**User prompt:**
```
User taste profile:
{taste_summary}

Menu items:
{json.dumps(dishes, indent=2)}

For each dish return: dish_name, rank (1=best), score (0.0–1.0), reasoning
(1–2 sentences addressing this specific user's preferences), match_level
("great" if score >= 0.75, "good" if >= 0.5, "skip" otherwise).
Preserve all original fields. Return ALL dishes ranked, not just top picks.
```

Re-use `_extract_json()` and the same normalization pattern from `parse_menu_text()` for robust output handling.

---

## 4B — New API Endpoint

### POST /api/recommend

Orchestrates the full pipeline for a logged-in user. Accepts an image upload + `user_id`, runs OCR → parse → fetch profile → summarize → rank. Returns the final ranked dish list.

```
# Request: multipart/form-data
file:    UploadFile
user_id: str  (Form field)

# Response:
{
  filename:     str,
  dish_count:   int,
  ranked:       bool,
  taste_summary: str,   # the profile summary used (useful for debugging)
  dishes: [
    {
      dish_name, description, price, section,
      rank, score, reasoning, match_level    # only present if ranked=true
    }
  ]
}
```

If `user_id` is missing or profile not found, fall back to unranked dish list (same as Slice 2 behavior) with `ranked: false`. Do not error — degrade gracefully.

---

## 4C — Frontend: Ranked Dish Display

### Update frontend/src/components/DishCards.jsx

When dishes contain `rank`/`score`/`reasoning` fields (`ranked=true`), switch to the enhanced ranked view. When not (`ranked=false` or no profile), fall back to the existing flat card view unchanged.

**Ranked view requirements:**
- Sort dishes by `rank` (rank=1 first) before rendering
- Match level badge on each card: "Great Match" (green `--green`), "Good Match" (amber `--amber`), "Skip" (muted `--text-muted`)
- `reasoning` text below the dish description — italic, `--text-dim` color
- Score displayed as percentage (e.g. "92% match") using `--accent` color
- "Great Match" dishes get a subtle left border in `--accent` color
- Group into sections: "Great Matches" → "Good Matches" → "Others"

### Update App.jsx

Replace the current two-stage pipeline (ocr → parsing) with a single-stage pipeline when `user_id` exists in localStorage:

```
# New flow when user is onboarded:
stages: idle → uploading → done | error

# Single fetch to POST /api/recommend
# (OCR + parse + rank all happen server-side)
# Show loading label: "Analyzing menu..."
```

If no `user_id` in localStorage, fall back to the old OCR → parse chain and show unranked DishCards.

---

---

## Testing Checklist

Verify each of these manually before considering a slice complete.

### Slice 3
- [ ] `POST /api/users` returns a valid UUID
- [ ] `POST /api/profile/{user_id}` with valid payload returns 200 and persists to DB
- [ ] `GET /api/profile/{user_id}` returns the saved profile
- [ ] `PATCH /api/profile/{user_id}` merges `rated_dishes` without overwriting existing ones
- [ ] Onboarding flow completes end-to-end and stores `user_id` in localStorage
- [ ] Refreshing the page skips onboarding (user_id already in localStorage)
- [ ] `summarize_taste_profile()` produces a readable, accurate summary string

### Slice 4
- [ ] `POST /api/recommend` returns ranked dishes for a user with a complete profile
- [ ] Dishes are ordered rank=1 first in the response
- [ ] `match_level` values are correctly computed from score thresholds
- [ ] Missing `user_id` returns unranked dishes with `ranked: false`
- [ ] Frontend shows "Great Match" badge in green on high-scoring dishes
- [ ] Reasoning text is visible and personalized (references specific user preferences)
- [ ] Full pipeline (upload → ranked results) completes in under 60s on local Ollama

---

## Known Gotchas & Implementation Notes

**Ollama JSON handling**
Mistral occasionally wraps JSON in markdown fences or adds a preamble sentence. The existing `_extract_json()` in `llm.py` handles this — use it for `rank_dishes()` output too. Do not write a new parser.

**LLM temperature**
Keep `temperature=0.1` for both LLM calls. Higher temperature causes inconsistent JSON structure. This is already set in `_call_ollama()` — do not change it.

**UUID extension in Postgres**
`gen_random_uuid()` requires the `pgcrypto` extension. Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to a startup script, or alternatively generate UUIDs in Python with `uuid.uuid4()` and pass them in rather than using a DB default.

**CORS**
The backend already has CORS configured for `localhost:5173` and `localhost:3000`. No changes needed for local development.

**No authentication in MVP**
Users are identified by a UUID in localStorage. No login/password system. This is intentional — focus is the recommendation pipeline.

**rank_dishes() must return ALL dishes**
Not just top picks. The frontend handles filtering/grouping by `match_level`. If the LLM truncates a long list, log a warning but do not error — display whatever was returned.

---

## What NOT to Change

- `ocr.py` — the EasyOCR singleton is working correctly
- `index.css` — only add new rules, never modify existing ones
- `_call_ollama()` and `_extract_json()` in `llm.py` — add new functions around them, don't touch these
- `vite.config.js` and `package.json` — dependencies are correct
- Existing `/api/ocr` and `/api/parse` endpoints — keep them for debugging even after `/api/recommend` is added
