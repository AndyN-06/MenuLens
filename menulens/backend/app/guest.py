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

# Seeded dishes carry hand-written flavor data rather than `flavor_source="none"`,
# which is the marker `_enrich_dish_flavors` scans for — so seeding never kicks
# off a background Anthropic call.  The confidence matches what that enrichment
# writes (0.7) so seeded dishes score on the same footing as scanned ones.
SEED_FLAVOR_SOURCE = "seed"
SEED_FLAVOR_CONFIDENCE = 0.7


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
#
# Every dish carries a `flavor_vector` (the same seven axes `_enrich_dish_flavors`
# generates) and `ingredients`.  Both are load-bearing rather than decorative:
# `recompute_profile` builds `cuisine_profiles` out of the flavor vectors of
# rated dishes, and the liked/disliked ingredient maps out of their ingredient
# lists.  Without them a guest's profile carries no per-dish signal at all, every
# `pref_vector` tier in `score_dishes` misses, and the flavor term collapses to a
# single per-cuisine constant — which is what made every dish on a menu come back
# with the same score.
#
# Ingredient names are a deliberately controlled vocabulary: the profile matches
# ingredients by exact string, so "chili" everywhere rather than a mix of
# "chile"/"chilli", or the signal never accumulates across restaurants.


def _dish(name, description, price, section, vector, ingredients):
    """Build a dish spec.  `vector` is the seven flavor axes in a fixed order,
    which keeps the menus below readable as tables."""
    umami, salty, sweet, bitter, sour, spicy, richness = vector
    return {
        "name": name,
        "description": description,
        "price": price,
        "section": section,
        "flavor_vector": {
            "umami": umami, "salty": salty, "sweet": sweet, "bitter": bitter,
            "sour": sour, "spicy": spicy, "richness": richness,
        },
        "ingredients": ingredients,
    }


#                                                      umami salty sweet bitter sour spicy rich
SEED_RESTAURANTS = [
    {
        "name": "Kaito Omakase",
        "cuisine_type": "Japanese",
        "city": "New York",
        "dishes": [
            _dish("Black Cod Saikyo Miso", "Three-day miso cure, charred edges, pickled ginger.", "$42", "Signatures",
                  (9, 7, 6, 1, 1, 0, 8), ["black cod", "miso", "mirin", "ginger"]),
            _dish("Yellowtail Jalapeno", "Thin-sliced hamachi, yuzu soy, micro cilantro.", "$28", "Signatures",
                  (7, 6, 2, 1, 5, 5, 4), ["yellowtail", "jalapeno", "yuzu", "soy sauce", "cilantro"]),
            _dish("Crispy Rice Spicy Tuna", "Fried sushi rice, spicy tuna, jalapeno.", "$26", "Signatures",
                  (8, 6, 3, 0, 2, 6, 7), ["tuna", "rice", "jalapeno", "chili", "mayonnaise"]),
            _dish("Toro Tartare", "Fatty tuna, dashi soy, chive.", "$38", "Raw bar",
                  (9, 6, 2, 0, 2, 1, 9), ["tuna", "dashi", "soy sauce", "chive"]),
            _dish("Chutoro Nigiri", "Medium fatty tuna, aged shari.", "$14", "Nigiri",
                  (8, 4, 3, 0, 2, 0, 8), ["tuna", "rice", "wasabi"]),
            _dish("Uni Handroll", "Santa Barbara uni, warm nori.", "$22", "Handrolls",
                  (9, 5, 2, 2, 1, 0, 8), ["uni", "nori", "rice"]),
            _dish("Wagyu Tataki", "A5 wagyu, ponzu, crisp garlic.", "$46", "Robata",
                  (9, 6, 2, 1, 4, 1, 9), ["beef", "ponzu", "garlic"]),
            _dish("Shiitake Salad", "Warm mushrooms, baby spinach, sesame.", "$18", "Salads",
                  (6, 4, 2, 4, 3, 0, 3), ["shiitake", "spinach", "sesame"]),
            _dish("Miso Soup", "Dashi, wakame, silken tofu.", "$8", "Sides",
                  (7, 6, 1, 1, 0, 0, 2), ["miso", "dashi", "tofu", "seaweed"]),
            _dish("Yuzu Sorbet", "Citrus, shiso, candied peel.", "$12", "Dessert",
                  (0, 0, 7, 2, 8, 0, 1), ["yuzu", "shiso", "sugar"]),
        ],
    },
    {
        "name": "The Copper Skillet",
        "cuisine_type": "American",
        "city": "Austin",
        "dishes": [
            _dish("Smash Burger", "Double patty, aged cheddar, house sauce, seeded bun.", "$17", "Mains",
                  (8, 7, 3, 1, 2, 1, 8), ["beef", "cheddar", "bun", "onion"]),
            _dish("Hot Honey Chicken", "Buttermilk brined, chili honey, pickles.", "$19", "Mains",
                  (7, 7, 6, 0, 3, 7, 7), ["chicken", "honey", "chili", "pickle", "buttermilk"]),
            _dish("Dry-Aged Ribeye", "45-day age, bone marrow butter.", "$58", "Mains",
                  (9, 6, 1, 1, 0, 0, 9), ["beef", "butter", "bone marrow"]),
            _dish("Brisket Poutine", "Duck fat fries, cheese curds, smoked gravy.", "$16", "Starters",
                  (9, 8, 2, 0, 1, 1, 9), ["beef", "potato", "cheese curds", "gravy"]),
            _dish("Charred Corn Ribs", "Cotija, lime, aleppo.", "$12", "Starters",
                  (5, 5, 6, 3, 4, 4, 4), ["corn", "cotija", "lime", "chili"]),
            _dish("Blue Cheese Wedge", "Iceberg, bacon, buttermilk blue dressing.", "$14", "Salads",
                  (5, 7, 1, 6, 3, 0, 8), ["blue cheese", "lettuce", "bacon", "buttermilk"]),
            _dish("Truffle Fries", "Parmesan, parsley, black truffle.", "$11", "Sides",
                  (7, 7, 1, 2, 0, 0, 8), ["potato", "parmesan", "truffle", "parsley"]),
            _dish("Bourbon Pecan Pie", "Brown butter crust, vanilla cream.", "$10", "Dessert",
                  (1, 2, 9, 2, 0, 0, 9), ["pecan", "butter", "sugar", "cream"]),
        ],
    },
    {
        "name": "Trattoria Rossi",
        "cuisine_type": "Italian",
        "city": "New York",
        "dishes": [
            _dish("Cacio e Pepe", "Tonnarelli, pecorino romano, cracked pepper.", "$24", "Pasta",
                  (7, 8, 1, 3, 1, 3, 7), ["pecorino", "pasta", "black pepper"]),
            _dish("Rigatoni all'Amatriciana", "Guanciale, San Marzano, pecorino.", "$26", "Pasta",
                  (8, 7, 3, 1, 4, 4, 7), ["guanciale", "tomato", "pecorino", "pasta"]),
            _dish("Tagliatelle al Ragu", "Six-hour beef and pork ragu.", "$28", "Pasta",
                  (9, 6, 3, 1, 2, 1, 8), ["beef", "pork", "tomato", "pasta"]),
            _dish("Burrata e Prosciutto", "Puglian burrata, 24-month prosciutto, focaccia.", "$21", "Antipasti",
                  (7, 7, 2, 1, 2, 0, 8), ["burrata", "prosciutto", "focaccia"]),
            _dish("Vitello Tonnato", "Sliced veal, tuna caper sauce.", "$23", "Antipasti",
                  (7, 6, 1, 2, 4, 0, 6), ["veal", "tuna", "caper"]),
            _dish("Branzino al Forno", "Whole roasted, lemon, salmoriglio.", "$42", "Secondi",
                  (6, 5, 1, 2, 5, 0, 4), ["branzino", "lemon", "olive oil", "oregano"]),
            _dish("Pollo alla Diavola", "Chili-roasted half chicken.", "$32", "Secondi",
                  (6, 6, 1, 2, 3, 7, 6), ["chicken", "chili", "lemon"]),
            _dish("Tiramisu", "Espresso-soaked savoiardi, mascarpone.", "$13", "Dolci",
                  (1, 1, 8, 5, 1, 0, 8), ["mascarpone", "espresso", "cocoa", "sugar"]),
        ],
    },
    {
        "name": "Mesa Verde Cantina",
        "cuisine_type": "Mexican",
        "city": "Los Angeles",
        "dishes": [
            _dish("Birria Tacos", "Braised short rib, consomme, white onion.", "$18", "Tacos",
                  (9, 7, 2, 2, 3, 6, 8), ["beef", "chili", "onion", "tortilla"]),
            _dish("Al Pastor", "Trompo pork, grilled pineapple, cilantro.", "$15", "Tacos",
                  (8, 6, 5, 1, 4, 5, 6), ["pork", "pineapple", "chili", "cilantro", "tortilla"]),
            _dish("Baja Fish Taco", "Beer-battered cod, chipotle crema, cabbage.", "$16", "Tacos",
                  (6, 6, 2, 1, 5, 4, 6), ["cod", "cabbage", "chipotle", "crema", "tortilla"]),
            _dish("Carnitas Plate", "Michoacan-style pork, tortillas, salsa verde.", "$24", "Platos",
                  (8, 6, 2, 1, 4, 3, 8), ["pork", "tortilla", "salsa verde", "lime"]),
            _dish("Elote", "Grilled corn, cotija, chili lime.", "$9", "Antojitos",
                  (5, 6, 6, 2, 4, 4, 6), ["corn", "cotija", "chili", "lime", "mayonnaise"]),
            _dish("Guacamole y Chips", "Hand-mashed, serrano, lime.", "$13", "Antojitos",
                  (3, 5, 1, 2, 5, 4, 6), ["avocado", "serrano", "lime", "cilantro"]),
            _dish("Pozole Rojo", "Hominy, pork shoulder, guajillo broth.", "$17", "Soups",
                  (8, 7, 2, 2, 3, 6, 6), ["pork", "hominy", "chili", "onion"]),
            _dish("Churros", "Cinnamon sugar, chocolate de olla.", "$10", "Postres",
                  (0, 2, 9, 3, 0, 1, 8), ["sugar", "cinnamon", "chocolate", "butter"]),
        ],
    },
    {
        "name": "Lamphu Thai House",
        "cuisine_type": "Thai",
        "city": "Portland",
        "dishes": [
            _dish("Pad Krapow Moo", "Minced pork, holy basil, chili, crispy egg.", "$18", "Mains",
                  (8, 8, 3, 2, 2, 9, 5), ["pork", "chili", "basil", "fish sauce", "garlic"]),
            _dish("Green Curry Chicken", "Coconut, thai eggplant, sweet basil.", "$19", "Mains",
                  (7, 6, 5, 2, 3, 7, 8), ["chicken", "coconut milk", "chili", "basil"]),
            _dish("Khao Soi", "Northern curry noodle, pickled mustard, shallot.", "$20", "Noodles",
                  (9, 6, 4, 2, 4, 6, 9), ["chicken", "coconut milk", "curry paste", "noodle", "shallot"]),
            _dish("Pad Thai", "Tamarind, shrimp, peanut, chive.", "$17", "Noodles",
                  (7, 6, 6, 1, 5, 3, 6), ["noodle", "shrimp", "peanut", "tamarind", "egg"]),
            _dish("Som Tum", "Green papaya, long bean, dried shrimp.", "$14", "Salads",
                  (6, 7, 4, 2, 8, 8, 2), ["papaya", "chili", "lime", "fish sauce", "peanut"]),
            _dish("Larb Gai", "Minced chicken, toasted rice powder, mint.", "$16", "Salads",
                  (7, 7, 2, 2, 7, 8, 3), ["chicken", "chili", "lime", "mint", "shallot"]),
            _dish("Tom Kha Gai", "Galangal coconut broth, straw mushroom.", "$13", "Soups",
                  (7, 6, 4, 2, 6, 4, 7), ["chicken", "coconut milk", "galangal", "lime", "mushroom"]),
            _dish("Mango Sticky Rice", "Coconut cream, toasted mung bean.", "$11", "Dessert",
                  (1, 2, 9, 0, 2, 0, 6), ["mango", "coconut milk", "rice", "sugar"]),
        ],
    },
    {
        "name": "Banchan & Bone",
        "cuisine_type": "Korean",
        "city": "Los Angeles",
        "dishes": [
            _dish("Galbi Short Rib", "Pear-marinated, charcoal grilled, ssam leaves.", "$38", "Mains",
                  (9, 7, 5, 1, 2, 2, 8), ["beef", "soy sauce", "garlic", "pear", "sesame"]),
            _dish("Dolsot Bibimbap", "Stone bowl, crisped rice, market vegetables.", "$21", "Mains",
                  (8, 6, 3, 2, 3, 5, 6), ["rice", "beef", "egg", "gochujang", "spinach"]),
            _dish("Kimchi Jjigae", "Aged kimchi, pork belly, silken tofu.", "$19", "Soups",
                  (9, 8, 2, 2, 7, 8, 6), ["kimchi", "pork", "tofu", "gochugaru"]),
            _dish("Soondubu", "Uncurdled tofu, clam broth, cracked egg.", "$18", "Soups",
                  (8, 7, 1, 1, 3, 8, 6), ["tofu", "gochugaru", "egg", "clam"]),
            _dish("Yangnyeom Wings", "Double-fried, gochujang glaze, sesame.", "$17", "Starters",
                  (7, 6, 6, 1, 3, 7, 7), ["chicken", "gochujang", "garlic", "honey"]),
            _dish("Haemul Pajeon", "Seafood scallion pancake, soy vinegar.", "$19", "Starters",
                  (7, 6, 2, 1, 2, 2, 7), ["squid", "scallion", "egg", "flour"]),
            _dish("Japchae", "Sweet potato noodle, sesame, beef.", "$16", "Sides",
                  (6, 6, 5, 1, 1, 0, 5), ["noodle", "beef", "sesame", "spinach", "soy sauce"]),
            _dish("Hotteok", "Griddled sweet pancake, brown sugar, peanut.", "$9", "Dessert",
                  (0, 2, 9, 1, 0, 0, 7), ["sugar", "cinnamon", "flour", "peanut"]),
        ],
    },
    {
        "name": "Saffron Local",
        "cuisine_type": "Indian",
        "city": "Chicago",
        "dishes": [
            _dish("Butter Chicken", "Tandoor chicken, fenugreek tomato cream.", "$22", "Mains",
                  (7, 6, 5, 1, 4, 4, 9), ["chicken", "tomato", "cream", "butter", "garam masala"]),
            _dish("Lamb Rogan Josh", "Kashmiri chili, yogurt, whole spice.", "$26", "Mains",
                  (8, 6, 2, 3, 4, 6, 8), ["lamb", "yogurt", "chili", "garam masala"]),
            _dish("Chana Masala", "Chickpea, ginger, amchur.", "$17", "Mains",
                  (6, 6, 2, 3, 5, 6, 4), ["chickpea", "tomato", "onion", "cumin"]),
            _dish("Saag Paneer", "Mustard greens, house paneer, cream.", "$19", "Mains",
                  (6, 5, 2, 5, 2, 3, 8), ["spinach", "paneer", "cream", "garlic"]),
            _dish("Tandoori Prawns", "Ajwain, chili, charred lemon.", "$24", "Starters",
                  (7, 6, 2, 2, 5, 6, 5), ["prawn", "yogurt", "chili", "lemon"]),
            _dish("Samosa Chaat", "Crushed samosa, tamarind, yogurt, sev.", "$13", "Starters",
                  (6, 7, 4, 2, 7, 6, 6), ["potato", "chickpea", "tamarind", "yogurt", "cumin"]),
            _dish("Garlic Naan", "Tandoor-blistered, cultured butter.", "$6", "Sides",
                  (4, 5, 2, 1, 1, 0, 6), ["flour", "garlic", "butter"]),
            _dish("Gulab Jamun", "Cardamom syrup, rose.", "$8", "Dessert",
                  (0, 1, 10, 1, 0, 0, 8), ["sugar", "milk", "cardamom"]),
        ],
    },
    {
        "name": "Olive & Ash",
        "cuisine_type": "Mediterranean",
        "city": "Seattle",
        "dishes": [
            _dish("Lamb Souvlaki", "Oregano marinade, grilled flatbread, tzatziki.", "$25", "Mains",
                  (7, 6, 2, 2, 5, 2, 7), ["lamb", "lemon", "oregano", "yogurt"]),
            _dish("Chicken Shawarma", "Spit-roasted, garlic toum, pickled turnip.", "$21", "Mains",
                  (7, 6, 2, 2, 5, 4, 6), ["chicken", "garlic", "lemon", "cumin", "yogurt"]),
            _dish("Charred Octopus", "Gigante beans, aleppo, lemon oil.", "$26", "Starters",
                  (8, 6, 2, 3, 5, 2, 5), ["octopus", "olive oil", "lemon", "oregano"]),
            _dish("Whipped Feta", "Barrel feta, hot honey, chili crisp.", "$14", "Starters",
                  (6, 8, 2, 2, 5, 3, 7), ["feta", "olive oil", "chili", "lemon"]),
            _dish("Falafel Plate", "Herb-heavy, tahini, pickled onion.", "$18", "Starters",
                  (5, 5, 1, 3, 4, 3, 6), ["chickpea", "parsley", "garlic", "tahini"]),
            _dish("Horiatiki Salad", "No lettuce, barrel feta, oregano.", "$15", "Salads",
                  (4, 6, 3, 3, 6, 0, 4), ["tomato", "feta", "cucumber", "olive oil", "onion"]),
            _dish("Lemon Potatoes", "Slow-roasted, oregano, pan drippings.", "$9", "Sides",
                  (3, 5, 1, 2, 6, 0, 5), ["potato", "lemon", "olive oil", "oregano"]),
            _dish("Baklava", "Walnut, orange blossom honey.", "$9", "Dessert",
                  (0, 1, 10, 2, 1, 0, 8), ["honey", "walnut", "butter", "sugar"]),
        ],
    },
]

# Visits the guest lands with.  `months_ago` spreads them across the Stats
# chart's six-month window.
#
# The ratings describe one coherent diner — umami-forward, seeks out heat and
# acidity, cool on bitter/heavy-cream dishes and on desserts — because
# `recompute_profile` derives the whole taste profile from exactly these numbers.
# Three properties matter for the recommendations to have any spread:
#
#   * Range.  `recompute_profile` only learns from ratings >= 7 (positive) and
#     <= 4 (negative); 5s and 6s are deliberately inert.  Ratings here run 3.2
#     to 9.8 so both directions fire and the mean lands near 7.2, which is the
#     `avg_score_threshold` the good/great cutoffs key off.
#   * Coverage.  Eight cuisines, each rated across several sections, so
#     `cuisine_profiles` is populated broadly enough that tier 1 and tier 2 of
#     the `pref_vector` lookup resolve instead of falling through to the global
#     average.
#   * Contrast within a cuisine.  Each restaurant has both loved and disliked
#     dishes, so a cuisine's learned vector points somewhere specific rather
#     than at the average of its whole menu.
SEED_VISITS = [
    {
        "restaurant": "Kaito Omakase", "months_ago": 0, "days_ago": 3, "restaurant_rating": 9,
        "ratings": [("Black Cod Saikyo Miso", 9.8), ("Crispy Rice Spicy Tuna", 9.4), ("Yellowtail Jalapeno", 8.6)],
    },
    {
        "restaurant": "Lamphu Thai House", "months_ago": 0, "days_ago": 6, "restaurant_rating": 10,
        "ratings": [("Pad Krapow Moo", 9.7), ("Som Tum", 9.3), ("Larb Gai", 9.0)],
    },
    {
        "restaurant": "The Copper Skillet", "months_ago": 0, "days_ago": 11, "restaurant_rating": 8,
        "ratings": [("Hot Honey Chicken", 9.1), ("Smash Burger", 8.2), ("Blue Cheese Wedge", 3.2)],
    },
    {
        "restaurant": "Trattoria Rossi", "months_ago": 1, "days_ago": 2, "restaurant_rating": 9,
        "ratings": [("Cacio e Pepe", 9.2), ("Burrata e Prosciutto", 8.8), ("Vitello Tonnato", 7.0)],
    },
    {
        "restaurant": "Banchan & Bone", "months_ago": 1, "days_ago": 9, "restaurant_rating": 9,
        "ratings": [("Kimchi Jjigae", 9.4), ("Galbi Short Rib", 9.1), ("Yangnyeom Wings", 8.6)],
    },
    {
        "restaurant": "Mesa Verde Cantina", "months_ago": 1, "days_ago": 18, "restaurant_rating": 9,
        "ratings": [("Birria Tacos", 9.5), ("Al Pastor", 8.7), ("Elote", 8.0)],
    },
    {
        "restaurant": "Olive & Ash", "months_ago": 1, "days_ago": 25, "restaurant_rating": 7,
        "ratings": [("Charred Octopus", 8.3), ("Whipped Feta", 7.9), ("Horiatiki Salad", 6.6)],
    },
    {
        "restaurant": "Kaito Omakase", "months_ago": 2, "days_ago": 6, "restaurant_rating": 9,
        "ratings": [("Wagyu Tataki", 9.2), ("Uni Handroll", 8.8), ("Shiitake Salad", 5.6)],
    },
    {
        "restaurant": "Saffron Local", "months_ago": 2, "days_ago": 11, "restaurant_rating": 8,
        "ratings": [("Lamb Rogan Josh", 8.8), ("Tandoori Prawns", 8.4), ("Samosa Chaat", 8.2)],
    },
    {
        "restaurant": "Lamphu Thai House", "months_ago": 2, "days_ago": 19, "restaurant_rating": 9,
        "ratings": [("Khao Soi", 9.4), ("Tom Kha Gai", 8.2), ("Mango Sticky Rice", 6.0)],
    },
    {
        "restaurant": "Banchan & Bone", "months_ago": 3, "days_ago": 3, "restaurant_rating": 8,
        "ratings": [("Soondubu", 8.8), ("Dolsot Bibimbap", 8.0), ("Japchae", 6.2)],
    },
    {
        "restaurant": "The Copper Skillet", "months_ago": 3, "days_ago": 9, "restaurant_rating": 7,
        "ratings": [("Brisket Poutine", 8.4), ("Truffle Fries", 7.4), ("Bourbon Pecan Pie", 5.4)],
    },
    {
        "restaurant": "Olive & Ash", "months_ago": 3, "days_ago": 16, "restaurant_rating": 6,
        "ratings": [("Chicken Shawarma", 7.0), ("Lemon Potatoes", 5.8), ("Falafel Plate", 5.2), ("Baklava", 3.6)],
    },
    {
        "restaurant": "Mesa Verde Cantina", "months_ago": 3, "days_ago": 22, "restaurant_rating": 8,
        "ratings": [("Carnitas Plate", 8.6), ("Guacamole y Chips", 7.8), ("Churros", 5.0)],
    },
    {
        "restaurant": "Saffron Local", "months_ago": 4, "days_ago": 2, "restaurant_rating": 7,
        "ratings": [("Chana Masala", 7.6), ("Butter Chicken", 6.4), ("Saag Paneer", 3.9), ("Gulab Jamun", 3.4)],
    },
    {
        "restaurant": "Lamphu Thai House", "months_ago": 4, "days_ago": 8, "restaurant_rating": 8,
        "ratings": [("Green Curry Chicken", 8.5), ("Pad Thai", 6.8)],
    },
    {
        "restaurant": "Trattoria Rossi", "months_ago": 4, "days_ago": 14, "restaurant_rating": 8,
        "ratings": [("Rigatoni all'Amatriciana", 8.9), ("Pollo alla Diavola", 8.1), ("Tiramisu", 3.8)],
    },
    {
        "restaurant": "Kaito Omakase", "months_ago": 4, "days_ago": 21, "restaurant_rating": 8,
        "ratings": [("Toro Tartare", 9.0), ("Chutoro Nigiri", 8.4), ("Miso Soup", 7.2), ("Yuzu Sorbet", 6.8)],
    },
    {
        "restaurant": "Mesa Verde Cantina", "months_ago": 5, "days_ago": 4, "restaurant_rating": 7,
        "ratings": [("Pozole Rojo", 7.8), ("Baja Fish Taco", 7.4)],
    },
    {
        "restaurant": "The Copper Skillet", "months_ago": 5, "days_ago": 12, "restaurant_rating": 6,
        "ratings": [("Dry-Aged Ribeye", 8.0), ("Charred Corn Ribs", 6.6)],
    },
    {
        "restaurant": "Banchan & Bone", "months_ago": 5, "days_ago": 20, "restaurant_rating": 7,
        "ratings": [("Haemul Pajeon", 7.2), ("Hotteok", 4.0)],
    },
]

# Survey-style fields only.  Everything a rating can imply — cuisine affinities,
# cuisine_profiles, liked/disliked ingredients, top dishes, the score threshold —
# is left to `recompute_profile` so the guest's profile is derived by the same
# code path as a real user's, and can never drift out of sync with SEED_VISITS.
SEED_PROFILE = {
    "flavor_tags": ["umami", "spicy", "acidic", "smoky"],
    "disliked_tags": ["bitter", "overly creamy"],
    "dietary_restrictions": [],
}


# ── Seeding ───────────────────────────────────────────────────────────────────

def _apply_flavor(dish: Dish, spec: dict) -> None:
    dish.flavor_vector     = spec["flavor_vector"]
    dish.base_ingredients  = spec["ingredients"]
    dish.flavor_source     = SEED_FLAVOR_SOURCE
    dish.flavor_confidence = SEED_FLAVOR_CONFIDENCE


def _get_or_create_restaurant(db: Session, spec: dict) -> tuple[Restaurant, list[Dish]]:
    """Find the restaurant by name, creating it and its menu if absent.

    If it already exists with a menu — a real user may have scanned one, or an
    earlier release seeded it — the existing dishes are reused rather than
    overwritten.  Seeded rows from before dishes carried flavor data get
    backfilled in place, since without a vector they contribute nothing to the
    profile.  A dish that already has a vector is left alone, so a real LLM
    enrichment is never clobbered.
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
            spec_by_name = {d["name"]: d for d in spec["dishes"]}
            for dish in dishes:
                dish_spec = spec_by_name.get(dish.dish_name)
                if dish_spec is not None and not dish.flavor_vector:
                    _apply_flavor(dish, dish_spec)
            db.flush()
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
    for dish_spec in spec["dishes"]:
        dish = Dish(
            id=uuid.uuid4(),
            menu_id=menu.id,
            restaurant_id=restaurant.id,
            dish_name=dish_spec["name"],
            description=dish_spec["description"],
            price=dish_spec["price"],
            section=dish_spec["section"],
        )
        _apply_flavor(dish, dish_spec)
        db.add(dish)
        dishes.append(dish)
    menu.dish_count = len(dishes)
    db.flush()
    return restaurant, dishes


def seed_guest_data(db: Session, user: User) -> None:
    """Populate a fresh guest account with sample visits, ratings and a profile.

    The profile written here holds only the survey-style fields; the derived
    ones are filled in by `recompute_profile`, which the caller runs once the
    ratings are in place.
    """
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
        cuisine_affinities={},
        cuisine_profiles={},
        liked_ingredients={},
        disliked_ingredients={},
        flavor_tags=SEED_PROFILE["flavor_tags"],
        disliked_tags=SEED_PROFILE["disliked_tags"],
        dietary_restrictions=SEED_PROFILE["dietary_restrictions"],
        rated_dishes=[],
        top_dishes=[],
        avg_score_threshold=None,
    ))
    db.flush()


def create_guest_user(db: Session) -> User:
    """Create a seeded guest account and return it.

    The caller commits, and must run `recompute_profile` for the new user to
    turn the seeded ratings into a usable taste profile — `seed_guest_data`
    deliberately leaves the derived profile fields empty.
    """
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
