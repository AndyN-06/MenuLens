"""
Guest accounts.

A guest is a real `User` row with no password, created on demand so someone can
explore the app without signing up.  Each guest gets their own account seeded
with sample visits, dish ratings and a taste profile, so the Stats, Profile and
My List screens have something in them.

Guests are identified by a reserved username prefix (`guest_`) — `/api/register`
refuses that prefix, so the namespace stays clean.  There is no `is_guest`
column because the project has no migration tooling; `Base.metadata.create_all`
would not add one to the deployed database.

Stale guests are purged after GUEST_TTL_DAYS.  The purge deletes only rows the
guest owns (ratings, visits, profile, user).  Restaurants, menus and dishes are
shared across all users and are left alone.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import (
    User, TasteProfile, RestaurantVisit, Restaurant, Menu, Dish, DishRating,
)

logger = logging.getLogger(__name__)

GUEST_PREFIX = "guest_"
GUEST_TTL_DAYS = 7
GUEST_SCAN_LIMIT = 1


def is_guest_username(username: str | None) -> bool:
    return bool(username) and username.startswith(GUEST_PREFIX)


# ── Seed fixtures ─────────────────────────────────────────────────────────────
# Deliberately invented restaurants: seeding an invented menu under a real
# business's name would put made-up data in front of every user who searches
# for it.  These names are plausible but fictional.
#
# Each seeded restaurant gets a full menu rather than stub dishes, so a guest
# can hit "Get recommendations" on one and see the real ranking flow without
# spending an Anthropic call on a scan.

SEED_RESTAURANTS = [
    {
        "name": "Kaito Omakase",
        "cuisine_type": "Japanese",
        "city": "New York",
        "dishes": [
            ("Black Cod Saikyo Miso", "Three-day miso cure, charred edges, pickled ginger.", "$42", "Signatures"),
            ("Yellowtail Jalapeno", "Thin-sliced hamachi, yuzu soy, micro cilantro.", "$28", "Signatures"),
            ("Crispy Rice Spicy Tuna", "Fried sushi rice, spicy tuna, jalapeno.", "$26", "Signatures"),
            ("Toro Tartare", "Fatty tuna, dashi soy, chive.", "$38", "Raw bar"),
            ("Chutoro Nigiri", "Medium fatty tuna, aged shari.", "$14", "Nigiri"),
            ("Uni Handroll", "Santa Barbara uni, warm nori.", "$22", "Handrolls"),
            ("Wagyu Tataki", "A5 wagyu, ponzu, crisp garlic.", "$46", "Robata"),
            ("Shiitake Salad", "Warm mushrooms, baby spinach, sesame.", "$18", "Salads"),
            ("Miso Soup", "Dashi, wakame, silken tofu.", "$8", "Sides"),
            ("Yuzu Sorbet", "Citrus, shiso, candied peel.", "$12", "Dessert"),
        ],
    },
    {
        "name": "The Copper Skillet",
        "cuisine_type": "American",
        "city": "Austin",
        "dishes": [
            ("Smash Burger", "Double patty, aged cheddar, house sauce, seeded bun.", "$17", "Mains"),
            ("Hot Honey Chicken", "Buttermilk brined, chili honey, pickles.", "$19", "Mains"),
            ("Dry-Aged Ribeye", "45-day age, bone marrow butter.", "$58", "Mains"),
            ("Brisket Poutine", "Duck fat fries, cheese curds, smoked gravy.", "$16", "Starters"),
            ("Charred Corn Ribs", "Cotija, lime, aleppo.", "$12", "Starters"),
            ("Blue Cheese Wedge", "Iceberg, bacon, buttermilk blue dressing.", "$14", "Salads"),
            ("Truffle Fries", "Parmesan, parsley, black truffle.", "$11", "Sides"),
            ("Bourbon Pecan Pie", "Brown butter crust, vanilla cream.", "$10", "Dessert"),
        ],
    },
    {
        "name": "Trattoria Rossi",
        "cuisine_type": "Italian",
        "city": "New York",
        "dishes": [
            ("Cacio e Pepe", "Tonnarelli, pecorino romano, cracked pepper.", "$24", "Pasta"),
            ("Rigatoni all'Amatriciana", "Guanciale, San Marzano, pecorino.", "$26", "Pasta"),
            ("Tagliatelle al Ragu", "Six-hour beef and pork ragu.", "$28", "Pasta"),
            ("Burrata e Prosciutto", "Puglian burrata, 24-month prosciutto, focaccia.", "$21", "Antipasti"),
            ("Vitello Tonnato", "Sliced veal, tuna caper sauce.", "$23", "Antipasti"),
            ("Branzino al Forno", "Whole roasted, lemon, salmoriglio.", "$42", "Secondi"),
            ("Pollo alla Diavola", "Chili-roasted half chicken.", "$32", "Secondi"),
            ("Tiramisu", "Espresso-soaked savoiardi, mascarpone.", "$13", "Dolci"),
        ],
    },
    {
        "name": "Mesa Verde Cantina",
        "cuisine_type": "Mexican",
        "city": "Los Angeles",
        "dishes": [
            ("Birria Tacos", "Braised short rib, consomme, white onion.", "$18", "Tacos"),
            ("Al Pastor", "Trompo pork, grilled pineapple, cilantro.", "$15", "Tacos"),
            ("Baja Fish Taco", "Beer-battered cod, chipotle crema, cabbage.", "$16", "Tacos"),
            ("Carnitas Plate", "Michoacan-style pork, tortillas, salsa verde.", "$24", "Platos"),
            ("Elote", "Grilled corn, cotija, chili lime.", "$9", "Antojitos"),
            ("Guacamole y Chips", "Hand-mashed, serrano, lime.", "$13", "Antojitos"),
            ("Pozole Rojo", "Hominy, pork shoulder, guajillo broth.", "$17", "Soups"),
            ("Churros", "Cinnamon sugar, chocolate de olla.", "$10", "Postres"),
        ],
    },
]

# Visits the guest lands with. `months_ago` spreads them across the Stats
# chart's six-month window; ratings are consistent with the seeded taste
# profile below (umami-forward, likes heat, dislikes blue cheese).
SEED_VISITS = [
    {
        "restaurant": "Kaito Omakase", "months_ago": 0, "days_ago": 3, "restaurant_rating": 9,
        "ratings": [("Black Cod Saikyo Miso", 9.8), ("Crispy Rice Spicy Tuna", 9.4), ("Yellowtail Jalapeno", 8.6)],
    },
    {
        "restaurant": "The Copper Skillet", "months_ago": 0, "days_ago": 11, "restaurant_rating": 8,
        "ratings": [("Hot Honey Chicken", 9.1), ("Smash Burger", 8.2), ("Blue Cheese Wedge", 3.5)],
    },
    {
        "restaurant": "Trattoria Rossi", "months_ago": 1, "days_ago": 2, "restaurant_rating": 9,
        "ratings": [("Cacio e Pepe", 9.2), ("Burrata e Prosciutto", 8.8)],
    },
    {
        "restaurant": "Mesa Verde Cantina", "months_ago": 1, "days_ago": 18, "restaurant_rating": 9,
        "ratings": [("Birria Tacos", 9.5), ("Al Pastor", 8.7), ("Elote", 8.0)],
    },
    {
        "restaurant": "Kaito Omakase", "months_ago": 2, "days_ago": 6, "restaurant_rating": 8,
        "ratings": [("Wagyu Tataki", 9.0), ("Shiitake Salad", 6.4)],
    },
    {
        "restaurant": "The Copper Skillet", "months_ago": 3, "days_ago": 9, "restaurant_rating": 7,
        "ratings": [("Brisket Poutine", 8.4)],
    },
    {
        "restaurant": "Trattoria Rossi", "months_ago": 4, "days_ago": 14, "restaurant_rating": 8,
        "ratings": [("Rigatoni all'Amatriciana", 8.9), ("Tiramisu", 7.6)],
    },
    {
        "restaurant": "Mesa Verde Cantina", "months_ago": 5, "days_ago": 4, "restaurant_rating": 7,
        "ratings": [("Pozole Rojo", 7.8)],
    },
]

SEED_PROFILE = {
    "cuisine_affinities": {
        "Japanese": 0.93, "Mexican": 0.86, "Italian": 0.81,
        "American": 0.72, "Thai": 0.64, "Korean": 0.58,
    },
    "liked_ingredients": {
        "miso": 0.9, "chili": 0.85, "yuzu": 0.8, "guanciale": 0.7,
        "short rib": 0.7, "pecorino": 0.65, "tuna": 0.6,
    },
    "disliked_ingredients": {"blue cheese": 0.9, "cilantro stems": 0.5},
    "flavor_tags": ["umami", "spicy", "acidic", "smoky"],
    "disliked_tags": ["bitter", "overly creamy"],
    "dietary_restrictions": [],
    "top_dishes": [
        "Black Cod Saikyo Miso", "Birria Tacos", "Crispy Rice Spicy Tuna",
        "Cacio e Pepe", "Hot Honey Chicken", "Wagyu Tataki",
    ],
    "avg_score_threshold": 7.5,
}


# ── Seeding ───────────────────────────────────────────────────────────────────

def _get_or_create_restaurant(db: Session, spec: dict) -> tuple[Restaurant, list[Dish]]:
    """Find the restaurant by name, creating it and its menu if absent.

    If it already exists with a menu — a real user may have scanned one — the
    existing dishes are reused rather than overwritten.
    """
    restaurant = db.query(Restaurant).filter(Restaurant.name == spec["name"]).first()

    if restaurant is None:
        restaurant = Restaurant(
            id=uuid.uuid4(),
            name=spec["name"],
            cuisine_type=spec["cuisine_type"],
            city=spec["city"],
        )
        db.add(restaurant)
        db.flush()

    menu = db.query(Menu).filter(Menu.restaurant_id == restaurant.id).first()
    if menu is not None:
        dishes = db.query(Dish).filter(Dish.menu_id == menu.id).all()
        if dishes:
            return restaurant, dishes

    if menu is None:
        menu = Menu(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            scanned_by=None,
            verified=True,
            dish_count=len(spec["dishes"]),
        )
        db.add(menu)
        db.flush()

    dishes = []
    for name, description, price, section in spec["dishes"]:
        dish = Dish(
            id=uuid.uuid4(),
            menu_id=menu.id,
            restaurant_id=restaurant.id,
            dish_name=name,
            description=description,
            price=price,
            section=section,
        )
        db.add(dish)
        dishes.append(dish)
    menu.dish_count = len(dishes)
    db.flush()
    return restaurant, dishes


def seed_guest_data(db: Session, user: User) -> None:
    """Populate a fresh guest account with sample visits, ratings and a profile."""
    context: dict[str, tuple[Restaurant, dict[str, Dish]]] = {}
    for spec in SEED_RESTAURANTS:
        restaurant, dishes = _get_or_create_restaurant(db, spec)
        context[spec["name"]] = (restaurant, {d.dish_name: d for d in dishes})

    now = datetime.utcnow()
    for entry in SEED_VISITS:
        restaurant, dish_by_name = context[entry["restaurant"]]
        visited_at = now - timedelta(days=entry["months_ago"] * 30 + entry["days_ago"])

        visit = RestaurantVisit(
            id=uuid.uuid4(),
            user_id=user.id,
            restaurant_id=restaurant.id,
            restaurant_name=restaurant.name,
            cuisine_type=restaurant.cuisine_type,
            restaurant_rating=entry["restaurant_rating"],
            source="sample",
            visited_at=visited_at,
        )
        db.add(visit)
        db.flush()

        for dish_name, rating in entry["ratings"]:
            dish = dish_by_name.get(dish_name)
            if dish is None:
                # The restaurant pre-existed with a different menu; fall back to
                # any dish it has so the rating still lands somewhere real.
                dish = next(iter(dish_by_name.values()), None)
            if dish is None:
                continue
            db.add(DishRating(
                id=uuid.uuid4(),
                user_id=user.id,
                dish_id=dish.id,
                restaurant_id=restaurant.id,
                visit_id=visit.id,
                rating=rating,
                rated_at=visited_at,
            ))

    db.add(TasteProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        cuisine_affinities=SEED_PROFILE["cuisine_affinities"],
        cuisine_profiles={},
        liked_ingredients=SEED_PROFILE["liked_ingredients"],
        disliked_ingredients=SEED_PROFILE["disliked_ingredients"],
        flavor_tags=SEED_PROFILE["flavor_tags"],
        disliked_tags=SEED_PROFILE["disliked_tags"],
        dietary_restrictions=SEED_PROFILE["dietary_restrictions"],
        rated_dishes=[],
        top_dishes=SEED_PROFILE["top_dishes"],
        avg_score_threshold=SEED_PROFILE["avg_score_threshold"],
    ))
    db.flush()


def create_guest_user(db: Session) -> User:
    """Create a seeded guest account and return it (caller commits)."""
    for _ in range(5):
        username = f"{GUEST_PREFIX}{uuid.uuid4().hex[:8]}"
        if not db.query(User).filter(User.username == username).first():
            break
    else:
        raise RuntimeError("Could not allocate a unique guest username")

    user = User(id=uuid.uuid4(), username=username, password_hash=None)
    db.add(user)
    db.flush()
    seed_guest_data(db, user)
    return user


# ── Cleanup ───────────────────────────────────────────────────────────────────

def purge_stale_guests(db: Session) -> int:
    """Delete guest accounts older than GUEST_TTL_DAYS and the rows they own.

    Menus and dishes are shared, so a purged guest's scans are kept and merely
    disowned. Returns the number of guests removed.
    """
    cutoff = datetime.utcnow() - timedelta(days=GUEST_TTL_DAYS)
    stale = (
        db.query(User)
        .filter(User.username.like(f"{GUEST_PREFIX}%"), User.created_at < cutoff)
        .limit(100)
        .all()
    )
    if not stale:
        return 0

    ids = [str(u.id) for u in stale]
    params = {"ids": ids}
    db.execute(text("UPDATE menus SET scanned_by = NULL WHERE scanned_by = ANY(CAST(:ids AS uuid[]))"), params)
    db.execute(text("UPDATE menus SET verified_by = NULL WHERE verified_by = ANY(CAST(:ids AS uuid[]))"), params)
    db.execute(text("DELETE FROM dish_ratings WHERE user_id = ANY(CAST(:ids AS uuid[]))"), params)
    db.execute(text("DELETE FROM restaurant_visits WHERE user_id = ANY(CAST(:ids AS uuid[]))"), params)
    db.execute(text("DELETE FROM taste_profiles WHERE user_id = ANY(CAST(:ids AS uuid[]))"), params)
    db.execute(text("DELETE FROM users WHERE id = ANY(CAST(:ids AS uuid[]))"), params)
    db.flush()
    logger.info("[guest] purged %d stale guest account(s)", len(stale))
    return len(stale)
