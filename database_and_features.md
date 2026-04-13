# MenuLens — Database Schema & Feature Overhaul

## Overview

This document covers three things together because they are tightly coupled:

1. **Database schema overhaul** — the current schema cannot support the scoring algorithm described in `SCORING_ALGORITHM.md` or the new features below. This spec replaces the current `restaurant_visits` and `taste_profiles` tables and adds several new ones.
2. **Cached menu feature** — when a restaurant has already been scanned, users are offered the existing menu instead of re-scanning. They can verify it or trigger a rescan.
3. **Restaurant search-first flow** — the app flow changes from "scan then name" to "search or create restaurant, then scan". Restaurants are a first-class global entity with autocomplete.
4. **Meal history from scanned dishes** — users select dishes from the actual scanned menu when logging a visit, eliminating free-text entry and name variation.

Read this document alongside `menu_scan.md` (the Claude Vision pipeline) and `SCORING_ALGORITHM.md` (the scoring design). This document does not repeat their content.

---

## What NOT to Change

- `menu_scan.md` pipeline — `parse_menu_image()` and everything in that spec is unchanged
- `scoring.py` — the formula logic is not changed here; the schema changes make it possible to implement the full scoring algorithm from `SCORING_ALGORITHM.md` in a future pass
- `index.css` — untouched
- The onboarding flow in the frontend — the cuisine affinity survey is unchanged
- All existing API endpoint signatures that are not explicitly listed below

---

## Part 1 — Database Schema

### 1A — New and Modified Tables

The following replaces the current `restaurant_visits` and `taste_profiles` schema entirely. Run migrations as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` where possible; see section 1C for tables that must be created fresh.

---

#### `restaurants` (new)

The canonical global record for a restaurant. Shared across all users. Created the first time any user searches and selects or creates a restaurant.

```sql
CREATE TABLE restaurants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    cuisine_type    VARCHAR(100),
    address         VARCHAR(300),
    city            VARCHAR(100),
    created_at      TIMESTAMP DEFAULT now(),
    updated_at      TIMESTAMP
);

CREATE INDEX ix_restaurants_name ON restaurants USING gin(to_tsvector('english', name));
```

The GIN index on `name` enables efficient full-text prefix search for the autocomplete endpoint. `cuisine_type` is set at creation and can be updated if the menu scan infers a different value.

---

#### `menus` (new)

Stores the most recent scanned menu for a restaurant. One active menu per restaurant at a time. Multiple users share the same menu record — they do not each get their own copy.

```sql
CREATE TABLE menus (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
    scanned_by      UUID REFERENCES users(id),   -- user who last scanned
    scanned_at      TIMESTAMP DEFAULT now(),
    verified        BOOLEAN DEFAULT FALSE,        -- true once a user has confirmed this menu is correct
    verified_by     UUID REFERENCES users(id),
    verified_at     TIMESTAMP,
    dish_count      INTEGER DEFAULT 0,
    raw_response    JSONB,                        -- full Claude API response, for debugging
    UNIQUE (restaurant_id)                        -- one active menu per restaurant
);
```

`verified` is set to `true` when a user reviews the menu and confirms it is correct. It resets to `false` if a rescan replaces the menu. The frontend uses this flag to decide whether to show the "Is this menu still correct?" prompt.

---

#### `dishes` (new)

Stores every dish extracted from a menu scan. Dishes are owned by a `menu` record, not a restaurant directly, so they are automatically replaced when the menu is rescanned.

```sql
CREATE TABLE dishes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id         UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
    dish_name       VARCHAR(300) NOT NULL,
    description     TEXT,
    price           VARCHAR(50),
    section         VARCHAR(100),
    -- Flavor vector fields (populated by background job, not during scan)
    flavor_vector   JSONB,       -- {"umami": 7, "salty": 6, "sweet": 5, ...}
    base_ingredients JSONB,      -- ["rice noodles", "egg", "tamarind"]
    flavor_source   VARCHAR(20) DEFAULT 'none',   -- none | lookup | llm | user_verified
    flavor_confidence FLOAT DEFAULT 0.0,
    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX ix_dishes_menu_id       ON dishes(menu_id);
CREATE INDEX ix_dishes_restaurant_id ON dishes(restaurant_id);
```

`flavor_vector`, `base_ingredients`, `flavor_source`, and `flavor_confidence` are not populated during a menu scan. They are filled in by a background job after the scan completes (see Part 3 — Background Flavor Enrichment). During a scan they default to `null`/`none`/`0.0`. The scoring pipeline falls back to cuisine-level affinity when `flavor_confidence` is 0.

`ON DELETE CASCADE` means that when a menu is replaced by a rescan, all its dishes are deleted and replaced with the new set.

---

#### `dish_ratings` (new)

Replaces `favorite_dish` + `dish_rating` fields on `restaurant_visits`. Each row is a single user rating of a single dish from a specific visit.

```sql
CREATE TABLE dish_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    dish_id         UUID NOT NULL REFERENCES dishes(id),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
    visit_id        UUID REFERENCES restaurant_visits(id),
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 10),
    notes           TEXT,
    rated_at        TIMESTAMP DEFAULT now()
);

CREATE INDEX ix_dish_ratings_user_id ON dish_ratings(user_id);
CREATE INDEX ix_dish_ratings_dish_id ON dish_ratings(dish_id);
```

`visit_id` links back to `restaurant_visits` so ratings are grouped by visit. A visit can have multiple dish ratings. `dish_id` is a foreign key into `dishes`, which means ratings are always tied to a real menu entry — no free text.

---

#### `restaurant_visits` (modified)

Keep the existing table but remove `favorite_dish` and `dish_rating` — those are now in `dish_ratings`. Add `restaurant_id` as a proper foreign key replacing the `restaurant_name` string.

```sql
-- Add:
ALTER TABLE restaurant_visits ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE restaurant_visits ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id);

-- Remove (after migrating any existing data):
-- restaurant_name VARCHAR(200)  →  kept for backward compat during migration, nullable afterward
-- favorite_dish VARCHAR(200)    →  removed, data moved to dish_ratings
-- dish_rating SMALLINT          →  removed, data moved to dish_ratings
```

`menu_id` records which version of the menu was active when the user visited, so that if the menu is later rescanned the visit history still references the dishes the user actually saw.

The existing `restaurant_name` column can be kept nullable during a migration period and populated from `restaurants.name` via a backfill query.

---

#### `taste_profiles` (modified)

The current schema stores `cuisine_affinities` as a flat `{cuisine: score}` map. The scoring algorithm requires per-cuisine × per-section vectors. Extend the table to support both — the flat map for the onboarding survey output, and the richer structure for the scoring engine.

```sql
ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS cuisine_profiles JSONB;
-- Structure: {"korean": {"mains": {"umami": 6, "spicy": 9, ...}, "desserts": {...}}, ...}

ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS liked_ingredients JSONB;
-- Structure: {"egg": 0.8, "tamarind": 0.6}  (frequency map, 0.0–1.0)

ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS disliked_ingredients JSONB;
-- Structure: {"cilantro": 0.9, "cream": 0.4}
```

`cuisine_affinities` (existing flat map) is kept as a fallback for the cold-start case and for users who have not yet accumulated enough per-section ratings to use the richer `cuisine_profiles`. The `recompute_profile()` function should populate both.

---

### 1B — SQLAlchemy Models

Replace or extend the models in `backend/app/models.py`. The `User` model is unchanged.

```python
class Restaurant(Base):
    __tablename__ = "restaurants"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(String(200), nullable=False)
    cuisine_type = Column(String(100), nullable=True)
    address      = Column(String(300), nullable=True)
    city         = Column(String(100), nullable=True)
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, onupdate=func.now())

    menu   = relationship("Menu", back_populates="restaurant", uselist=False)
    visits = relationship("RestaurantVisit", back_populates="restaurant")
    dishes = relationship("Dish", back_populates="restaurant")


class Menu(Base):
    __tablename__ = "menus"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), unique=True, nullable=False)
    scanned_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    scanned_at    = Column(DateTime, server_default=func.now())
    verified      = Column(Boolean, default=False)
    verified_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at   = Column(DateTime, nullable=True)
    dish_count    = Column(Integer, default=0)
    raw_response  = Column(JSONB, nullable=True)

    restaurant = relationship("Restaurant", back_populates="menu")
    dishes     = relationship("Dish", back_populates="menu", cascade="all, delete-orphan")


class Dish(Base):
    __tablename__ = "dishes"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_id           = Column(UUID(as_uuid=True), ForeignKey("menus.id"), nullable=False)
    restaurant_id     = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    dish_name         = Column(String(300), nullable=False)
    description       = Column(Text, nullable=True)
    price             = Column(String(50), nullable=True)
    section           = Column(String(100), nullable=True)
    flavor_vector     = Column(JSONB, nullable=True)
    base_ingredients  = Column(JSONB, nullable=True)
    flavor_source     = Column(String(20), default="none")
    flavor_confidence = Column(Float, default=0.0)
    created_at        = Column(DateTime, server_default=func.now())

    menu       = relationship("Menu", back_populates="dishes")
    restaurant = relationship("Restaurant", back_populates="dishes")
    ratings    = relationship("DishRating", back_populates="dish")


class DishRating(Base):
    __tablename__ = "dish_ratings"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    dish_id       = Column(UUID(as_uuid=True), ForeignKey("dishes.id"), nullable=False)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    visit_id      = Column(UUID(as_uuid=True), ForeignKey("restaurant_visits.id"), nullable=True)
    rating        = Column(SmallInteger, nullable=False)
    notes         = Column(Text, nullable=True)
    rated_at      = Column(DateTime, server_default=func.now())

    dish  = relationship("Dish", back_populates="ratings")
    visit = relationship("RestaurantVisit", back_populates="dish_ratings")


class RestaurantVisit(Base):
    __tablename__ = "restaurant_visits"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    restaurant_id     = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=True)
    menu_id           = Column(UUID(as_uuid=True), ForeignKey("menus.id"), nullable=True)
    restaurant_name   = Column(String(200), nullable=True)   # kept for migration backcompat
    cuisine_type      = Column(String(100), nullable=True)
    restaurant_rating = Column(SmallInteger, nullable=True)
    source            = Column(String(50), default="manual")
    visited_at        = Column(DateTime, server_default=func.now())

    user        = relationship("User", back_populates="visits")
    restaurant  = relationship("Restaurant", back_populates="visits")
    dish_ratings = relationship("DishRating", back_populates="visit")


class TasteProfile(Base):
    __tablename__ = "taste_profiles"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id               = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    cuisine_affinities    = Column(JSONB)    # flat map: {"Thai": 0.9} — cold start / fallback
    cuisine_profiles      = Column(JSONB)    # rich map: {"thai": {"mains": {"umami": 7, ...}}}
    liked_ingredients     = Column(JSONB)    # frequency map: {"egg": 0.8}
    disliked_ingredients  = Column(JSONB)    # frequency map: {"cilantro": 0.9}
    flavor_tags           = Column(JSONB)    # ["spicy", "umami"] — from onboarding survey
    disliked_tags         = Column(JSONB)
    dietary_restrictions  = Column(JSONB)
    rated_dishes          = Column(JSONB)    # legacy, kept for backcompat
    top_dishes            = Column(JSONB)    # dish names rated >= 7, derived
    avg_score_threshold   = Column(Float)
    updated_at            = Column(DateTime, onupdate=func.now())

    user = relationship("User", back_populates="profile")
```

---

### 1C — Migration Strategy

Run these in order on startup in the `lifespan` handler in `main.py`, same pattern as existing column migrations:

```python
# New tables — idempotent
conn.execute(text("CREATE TABLE IF NOT EXISTS restaurants (...)"))
conn.execute(text("CREATE TABLE IF NOT EXISTS menus (...)"))
conn.execute(text("CREATE TABLE IF NOT EXISTS dishes (...)"))
conn.execute(text("CREATE TABLE IF NOT EXISTS dish_ratings (...)"))

# Column additions to existing tables
conn.execute(text("ALTER TABLE restaurant_visits ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id)"))
conn.execute(text("ALTER TABLE restaurant_visits ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id)"))
conn.execute(text("ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS cuisine_profiles JSONB"))
conn.execute(text("ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS liked_ingredients JSONB"))
conn.execute(text("ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS disliked_ingredients JSONB"))
```

Do not drop `restaurant_name`, `favorite_dish`, or `dish_rating` from `restaurant_visits` in this pass. Leave them nullable. A separate cleanup migration can remove them after confirming all data is moved.

---

## Part 2 — API Endpoints

### 2A — Restaurant Search & Autocomplete

#### `GET /api/restaurants/search?q={query}&limit={n}`

Returns restaurants whose names match the query prefix. Used for the autocomplete dropdown as the user types. No auth required.

```python
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
            "has_menu": r.menu is not None,
            "menu_verified": r.menu.verified if r.menu else False,
            "menu_dish_count": r.menu.dish_count if r.menu else 0,
            "menu_scanned_at": r.menu.scanned_at.isoformat() if r.menu else None,
        }
        for r in results
    ]
```

The `has_menu` and `menu_verified` fields tell the frontend whether to offer the cached menu path or require a new scan.

#### `POST /api/restaurants`

Creates a new restaurant record. Called when the user types a name that doesn't match any existing restaurant and proceeds anyway.

```python
class RestaurantCreate(BaseModel):
    name: str
    cuisine_type: Optional[str] = None
    city: Optional[str] = None

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
```

#### `GET /api/restaurants/{restaurant_id}/menu`

Returns the current menu for a restaurant including all its dishes. Used when loading a cached menu. Returns 404 if no menu has been scanned yet.

```python
@app.get("/api/restaurants/{restaurant_id}/menu")
def get_restaurant_menu(restaurant_id: str, db: Session = Depends(get_db)):
    rid = _parse_uuid(restaurant_id)
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
```

#### `POST /api/restaurants/{restaurant_id}/menu/verify`

Called when a user reviews the cached menu and confirms it is correct.

```python
@app.post("/api/restaurants/{restaurant_id}/menu/verify")
def verify_menu(restaurant_id: str, user_id: str = Form(...), db: Session = Depends(get_db)):
    rid = _parse_uuid(restaurant_id)
    uid = _parse_uuid(user_id)
    menu = db.query(Menu).filter(Menu.restaurant_id == rid).first()
    if not menu:
        raise HTTPException(status_code=404, detail="No menu found")
    menu.verified = True
    menu.verified_by = uid
    menu.verified_at = func.now()
    db.commit()
    return {"verified": True}
```

---

### 2B — Menu Scan with Restaurant Context

The existing `POST /api/recommend/stream` endpoint is modified to accept a `restaurant_id` form field. When provided, it stores the scan result into the `menus` and `dishes` tables rather than returning a transient response.

```python
# Add to the form parameters:
restaurant_id: Optional[str] = Form(None)
```

Inside `run()`, after `parsed` is returned from `parse_menu_image()`, add:

```python
if restaurant_id:
    rid = uuid.UUID(restaurant_id)
    _upsert_menu(db, rid, parsed, scanned_by=uid)
```

Where `_upsert_menu` is a new helper:

```python
def _upsert_menu(db: Session, restaurant_id: uuid.UUID, parsed: dict, scanned_by: uuid.UUID | None):
    """Replace the existing menu for a restaurant with freshly scanned dishes."""
    # Delete old menu (cascades to dishes)
    existing = db.query(Menu).filter(Menu.restaurant_id == restaurant_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    menu = Menu(
        id=uuid.uuid4(),
        restaurant_id=restaurant_id,
        scanned_by=scanned_by,
        verified=False,        # reset verification on every rescan
        dish_count=len(parsed.get("dishes", [])),
        raw_response=parsed,
    )
    db.add(menu)
    db.flush()

    for d in parsed.get("dishes", []):
        dish = Dish(
            id=uuid.uuid4(),
            menu_id=menu.id,
            restaurant_id=restaurant_id,
            dish_name=d.get("dish_name", ""),
            description=d.get("description", ""),
            price=d.get("price", ""),
            section=d.get("section", ""),
        )
        db.add(dish)

    # Update restaurant cuisine_type if scan inferred one
    if parsed.get("cuisine_type"):
        restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
        if restaurant and not restaurant.cuisine_type:
            restaurant.cuisine_type = parsed["cuisine_type"]

    db.commit()
```

The `parsed` SSE event sent to the frontend should include the `menu_id` of the newly created menu so the frontend can reference it when the user logs dishes:

```python
_sse({"type": "parsed", "data": {
    ...existing fields...,
    "menu_id": str(menu.id) if restaurant_id else None,
}})
```

---

### 2C — Dish Ratings & Meal History

#### `POST /api/visits/{user_id}`

Modified to accept `restaurant_id` (UUID) instead of or alongside `restaurant_name`, and no longer accepts `favorite_dish`/`dish_rating` directly.

```python
class VisitCreate(BaseModel):
    restaurant_id: Optional[str] = None
    restaurant_name: Optional[str] = None   # fallback if no restaurant_id
    cuisine_type: Optional[str] = None
    restaurant_rating: Optional[int] = None
    menu_id: Optional[str] = None
    source: str = "manual"
```

The `restaurant_name` field is kept as a fallback only for the Excel import path.

#### `POST /api/visits/{user_id}/{visit_id}/dishes`

New endpoint. Called after a visit is created to submit dish ratings. The user selects dishes from the restaurant's scanned menu and rates each.

```python
class DishRatingCreate(BaseModel):
    dish_id: str
    rating: int   # 1–10

class DishRatingsPayload(BaseModel):
    ratings: list[DishRatingCreate]

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
        RestaurantVisit.user_id == uid
    ).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    for r in payload.ratings:
        did = _parse_uuid(r.dish_id)
        dish = db.query(Dish).filter(Dish.id == did).first()
        if not dish:
            continue
        rating = DishRating(
            id=uuid.uuid4(),
            user_id=uid,
            dish_id=did,
            restaurant_id=dish.restaurant_id,
            visit_id=vid,
            rating=r.rating,
        )
        db.add(rating)

    db.commit()
    recompute_profile(db, uid)
    return {"rated": len(payload.ratings)}
```

#### `GET /api/visits/{user_id}/{visit_id}/dishes`

Returns the dishes rated in a specific visit, joined with dish details. Used to populate the meal history detail view.

---

### 2D — Updated `recompute_profile()`

The existing `recompute_profile()` function reads from `restaurant_visits.dish_rating` and `restaurant_visits.favorite_dish`. These fields are being deprecated. Update it to read from `dish_ratings` instead, and populate the new `cuisine_profiles`, `liked_ingredients`, and `disliked_ingredients` fields on `taste_profiles`.

```python
def recompute_profile(db: Session, user_id: uuid.UUID) -> TasteProfile:
    visits = db.query(RestaurantVisit).filter(RestaurantVisit.user_id == user_id).all()
    dish_ratings_rows = db.query(DishRating).filter(DishRating.user_id == user_id).all()

    # --- cuisine_affinities (flat, for cold start fallback) ---
    cuisine_ratings: dict[str, list[float]] = {}
    for v in visits:
        cuisine = v.cuisine_type or (v.restaurant.cuisine_type if v.restaurant else None)
        if cuisine and v.restaurant_rating is not None:
            cuisine_ratings.setdefault(cuisine, []).append(float(v.restaurant_rating))
    cuisine_affinities = {
        c: round(sum(rs) / len(rs) / 10.0, 3)
        for c, rs in cuisine_ratings.items()
    }

    # --- top_dishes and avg_score_threshold (from dish_ratings) ---
    top_dishes = []
    all_ratings = []
    for dr in dish_ratings_rows:
        all_ratings.append(float(dr.rating))
        if dr.rating >= 7 and dr.dish and dr.dish.dish_name:
            top_dishes.append(dr.dish.dish_name)
    avg_score_threshold = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 5.0

    # --- liked/disliked ingredients (from dish_ratings joined with dish.base_ingredients) ---
    liked_ingredients: dict[str, float] = {}
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

    # Normalize ingredient frequencies to 0–1
    max_liked = max(liked_ingredients.values(), default=1)
    max_disliked = max(disliked_ingredients.values(), default=1)
    liked_ingredients = {k: round(v / max_liked, 3) for k, v in liked_ingredients.items()}
    disliked_ingredients = {k: round(v / max_disliked, 3) for k, v in disliked_ingredients.items()}

    # --- cuisine_profiles (per cuisine × section, for full scoring algorithm) ---
    # Only computed when flavor_vectors are available on dishes.
    # Skipped silently for dishes with flavor_confidence == 0.
    cuisine_profiles: dict = {}
    for dr in dish_ratings_rows:
        if not dr.dish or not dr.dish.flavor_vector or dr.dish.flavor_confidence == 0:
            continue
        cuisine = (
            dr.dish.restaurant.cuisine_type
            if dr.dish.restaurant else None
        ) or "unknown"
        section = (dr.dish.section or "mains").lower()
        direction = 1 if dr.rating >= 7 else (-1 if dr.rating <= 4 else 0)
        if direction == 0:
            continue
        fv = dr.dish.flavor_vector
        cuisine_profiles.setdefault(cuisine, {}).setdefault(section, {})
        current = cuisine_profiles[cuisine][section]
        lr = 0.1
        for flavor, value in fv.items():
            current[flavor] = current.get(flavor, value) + direction * lr * (value - current.get(flavor, value))

    # Upsert profile
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if profile:
        profile.cuisine_affinities = cuisine_affinities
        profile.top_dishes = top_dishes
        profile.avg_score_threshold = avg_score_threshold
        profile.liked_ingredients = liked_ingredients
        profile.disliked_ingredients = disliked_ingredients
        profile.cuisine_profiles = cuisine_profiles
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
```

---

## Part 3 — Background Flavor Enrichment

This is the mechanism described in `SCORING_ALGORITHM.md` under "Flavor Vector Sourcing". It is explicitly kept **out of the scan critical path**. Dishes get their flavor vectors filled in after the scan, asynchronously.

### How it works

After `_upsert_menu()` commits new dishes to the database, a background task is queued to generate flavor vectors for any dishes that have `flavor_source = 'none'`. This uses a single Claude API call per batch of dishes, not one call per dish.

```python
# In main.py, after _upsert_menu() in the streaming endpoint:
if restaurant_id:
    asyncio.ensure_future(
        loop.run_in_executor(None, _enrich_dish_flavors, menu.id)
    )
```

```python
def _enrich_dish_flavors(menu_id: uuid.UUID):
    """Background job: generate flavor vectors for dishes that don't have them yet.

    Uses a single Claude API call for all dishes in the menu.
    Writes results back to the dishes table with flavor_source='llm', confidence=0.7.
    Does not block the scan response.
    """
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
                    f"Dishes:\n{json.dumps(dish_list, indent=2)}"
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
            dish.flavor_vector = r.get("flavor_vector")
            dish.base_ingredients = r.get("base_ingredients", [])
            dish.flavor_source = "llm"
            dish.flavor_confidence = 0.7

        db.commit()
        logger.info(f"[enrich] flavor vectors written for {len(result_map)} dishes in menu {menu_id}")

    except Exception as exc:
        logger.error(f"[enrich] flavor enrichment failed for menu {menu_id}: {exc}")
    finally:
        db.close()
```

This is the **second and only other LLM call** in the pipeline, and it happens asynchronously after the user has already received their recommendations. The first scan gets scored on cuisine affinity alone. Subsequent visits to the same restaurant benefit from the flavor vectors.

---

## Part 4 — Frontend Flow Changes

### 4A — New App Flow

The app flow changes from:
```
[Upload menu image] → [Name the restaurant] → [See results]
```

To:
```
[Search for restaurant] → [Found?]
    ├── Yes, has verified menu  → [See recommendations immediately]
    ├── Yes, has unverified menu → [Review menu → Confirm or Rescan] → [See recommendations]
    ├── Yes, no menu yet         → [Scan menu] → [See recommendations]
    └── No match                 → [Create restaurant] → [Scan menu] → [See recommendations]
```

### 4B — New component: `RestaurantSearch.jsx`

Replaces the current restaurant name text field shown after a scan. This is now the **first screen** after login.

Behavior:
- Text input with debounced calls to `GET /api/restaurants/search?q=` as the user types (trigger after 2+ characters)
- Results appear as a dropdown list below the input, showing restaurant name, city, and a "Has menu" badge if applicable
- Selecting a result stores `restaurant_id` in component state and proceeds based on `has_menu` / `menu_verified`
- A "Add new restaurant" option appears at the bottom of the dropdown when the user's query doesn't match any result, or after typing a full name

State transitions from this component:
```
onSelectExisting(restaurant) →
    if restaurant.has_menu && restaurant.menu_verified  → go to "loading recommendations"
    if restaurant.has_menu && !restaurant.menu_verified → go to "verify menu"
    if !restaurant.has_menu                             → go to "scan menu"

onCreateNew(name) → POST /api/restaurants → go to "scan menu"
```

### 4C — New component: `MenuVerification.jsx`

Shown when a restaurant has a cached but unverified menu, or when the user wants to review the menu before getting recommendations.

Displays:
- Scanned date ("Menu scanned 3 days ago")
- Full dish list grouped by section, read-only
- Two actions: "Looks correct — show recommendations" and "Rescan menu"

On "Looks correct":
- Calls `POST /api/restaurants/{restaurant_id}/menu/verify`
- Proceeds to recommendations using the existing `menu_id`

On "Rescan menu":
- Navigates to the camera/upload view with `restaurant_id` already set
- After scan completes, the new menu replaces the old one and the user sees fresh results

### 4D — Updated meal history entry flow

After a visit to a restaurant, the user can log what they ate. The current flow has a free-text "favorite dish" field. Replace this with a dish picker.

New flow:
1. User taps "Log a visit" from the meal history panel or after scanning
2. Selects the restaurant (pre-filled if coming from a scan)
3. Selects their overall restaurant rating (1–10)
4. Dish picker: shows the restaurant's scanned dish list grouped by section; user taps dishes they ordered and rates each one (1–10)
5. Submits — calls `POST /api/visits/{user_id}` then `POST /api/visits/{user_id}/{visit_id}/dishes`

The dish picker should make individual dish rating optional — a user might want to log a visit without rating every dish. At minimum they select which dishes they had; rating is encouraged but skippable.

If the restaurant has no scanned menu yet, fall back to the old free-text field with a note that it won't contribute to flavor-based recommendations.

---

## Part 5 — Updated `scoring.py`

The existing `scoring.py` uses the simple formula (cuisine affinity base + personal/community bonuses). This needs to be updated to use the full scoring algorithm from `SCORING_ALGORITHM.md` when flavor vectors are available.

The update is backward compatible — when `flavor_confidence == 0` the function falls back to the existing cuisine affinity base score, so the app still works during the period before background enrichment has run.

```python
def score_dishes(
    dishes: list[dict],
    profile: dict,
    cuisine_type: str,
    community_favorites: list[str] | None = None,
) -> list[dict]:
    affinities = profile.get("cuisine_affinities") or {}
    cuisine_profiles = profile.get("cuisine_profiles") or {}
    liked_ingredients = profile.get("liked_ingredients") or {}
    disliked_ingredients = profile.get("disliked_ingredients") or {}
    dietary_restrictions = [r.lower() for r in (profile.get("dietary_restrictions") or [])]
    top_dishes = profile.get("top_dishes") or []
    avg_threshold = profile.get("avg_score_threshold") or 5.0
    threshold = avg_threshold / 10.0

    cf_list = [str(f) for f in (community_favorites or [])]
    cuisine_lower = cuisine_type.lower()

    scored = []
    for dish in dishes:
        name = dish.get("dish_name", "")
        section = (dish.get("section") or "mains").lower()
        description = (dish.get("description") or "").lower()
        flavor_vector = dish.get("flavor_vector")
        base_ingredients = dish.get("base_ingredients") or []
        flavor_confidence = float(dish.get("flavor_confidence") or 0.0)

        # Step 1 — Hard filter: dietary restrictions
        restriction_hit = any(r in description for r in dietary_restrictions)
        if restriction_hit:
            scored.append({**dish, "score": 0.0, "match_level": "skip", "rank": None, "community_pick": False})
            continue

        # Step 2 — Flavor similarity (weight 0.70)
        # Resolve preference vector via fallback hierarchy
        pref_vector = None
        if cuisine_profiles.get(cuisine_lower, {}).get(section):
            ratings_count = len([d for d in dishes if (d.get("section") or "mains").lower() == section])
            if ratings_count >= 3:
                pref_vector = cuisine_profiles[cuisine_lower][section]
        if pref_vector is None and cuisine_profiles.get(cuisine_lower):
            # Average all sections for this cuisine
            all_sections = cuisine_profiles[cuisine_lower]
            keys = set(k for sv in all_sections.values() for k in sv)
            pref_vector = {
                k: sum(sv.get(k, 0) for sv in all_sections.values()) / len(all_sections)
                for k in keys
            }
        if pref_vector is None and cuisine_profiles:
            # Global average across all cuisines
            all_vectors = [sv for cv in cuisine_profiles.values() for sv in cv.values()]
            keys = set(k for v in all_vectors for k in v)
            pref_vector = {
                k: sum(v.get(k, 0) for v in all_vectors) / len(all_vectors)
                for k in keys
            }

        cuisine_base = affinities.get(cuisine_type, 0.5)

        if flavor_vector and pref_vector and flavor_confidence > 0:
            raw_flavor = _cosine_similarity(flavor_vector, pref_vector)
            flavor_score = raw_flavor * flavor_confidence + cuisine_base * (1 - flavor_confidence)
        else:
            flavor_score = cuisine_base

        # Step 3 — Ingredient score (weight 0.30)
        if base_ingredients and (liked_ingredients or disliked_ingredients):
            boost = sum(liked_ingredients.get(ing, 0) for ing in base_ingredients)
            penalty = sum(disliked_ingredients.get(ing, 0) for ing in base_ingredients)
            import math
            ingredient_score = math.tanh(boost - penalty)
        else:
            ingredient_score = 0.0

        # Step 4 — Final score
        score = flavor_score * 0.70 + ingredient_score * 0.30

        # Personal top-dish bonus
        for td in top_dishes:
            if _fuzzy_match(name, str(td)) > 0.6:
                score = min(1.0, score + 0.05)
                break

        # Community favorite bonus and flag
        is_community_pick = any(_fuzzy_match(name, cf) > 0.6 for cf in cf_list)
        if is_community_pick:
            score = min(1.0, score + 0.10)

        score = round(score, 3)

        # Match level from personal threshold
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

    order = sorted(range(len(scored)), key=lambda i: -scored[i]["score"])
    for rank, idx in enumerate(order, start=1):
        scored[idx]["rank"] = rank

    return scored


def _cosine_similarity(a: dict, b: dict) -> float:
    keys = set(a) & set(b)
    if not keys:
        return 0.5
    dot = sum(a[k] * b[k] for k in keys)
    mag_a = sum(a[k] ** 2 for k in keys) ** 0.5
    mag_b = sum(b[k] ** 2 for k in keys) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.5
    # Normalize to 0–1 range (cosine returns -1 to 1)
    return (dot / (mag_a * mag_b) + 1) / 2
```

---

## Part 6 — Excel Import Update

The existing `/api/import/excel` endpoint creates `RestaurantVisit` rows from spreadsheet data. It currently sets `favorite_dish` and `dish_rating` directly on the visit. After this schema change those fields are gone.

Update the import to:
1. Look up or create a `Restaurant` record by name for each row
2. Create a `RestaurantVisit` with `restaurant_id` set
3. If `favorite_dish` is in the spreadsheet, create a placeholder `Dish` record attached to a stub `Menu` (source `import`) and a corresponding `DishRating`

This ensures imported history participates in profile recomputation correctly. The stub menu dishes will have `flavor_source='none'` and will be enriched by the background job like any other dish.

---

## Testing Checklist

### Schema & Models
- [ ] All five tables (`restaurants`, `menus`, `dishes`, `dish_ratings`, modified `restaurant_visits`) created cleanly on fresh `docker-compose up`
- [ ] `menus` enforces the `UNIQUE (restaurant_id)` constraint — second scan replaces first
- [ ] `dishes` cascade-deletes when a `menu` is deleted

### Restaurant Search
- [ ] `GET /api/restaurants/search?q=thai` returns matching restaurants with `has_menu` field
- [ ] `POST /api/restaurants` creates a new record and returns its UUID
- [ ] Search returns empty array (not 404) for queries with no matches

### Menu Scan & Caching
- [ ] `POST /api/recommend/stream` with `restaurant_id` writes to `menus` and `dishes` tables
- [ ] Re-scanning the same restaurant replaces the menu and resets `verified` to false
- [ ] `GET /api/restaurants/{id}/menu` returns the cached dish list
- [ ] `POST /api/restaurants/{id}/menu/verify` sets `verified=true`

### Meal History
- [ ] `POST /api/visits/{user_id}` accepts `restaurant_id` and creates a visit
- [ ] `POST /api/visits/{user_id}/{visit_id}/dishes` creates `dish_ratings` rows
- [ ] `recompute_profile()` reads from `dish_ratings`, not `restaurant_visits.dish_rating`
- [ ] Profile `liked_ingredients` populates after rating dishes whose flavor vectors are set

### Scoring
- [ ] Dishes with `flavor_confidence=0` fall back to cuisine affinity base score
- [ ] Dishes with flavor vectors score via cosine similarity
- [ ] Dietary restriction in description produces `score=0.0` and `match_level="skip"`

### Background Enrichment
- [ ] After a scan, `_enrich_dish_flavors` runs and writes `flavor_vector` to dishes
- [ ] Enrichment does not block the SSE `parsed` event
- [ ] Second scan of same restaurant triggers a new enrichment pass for the new dishes
