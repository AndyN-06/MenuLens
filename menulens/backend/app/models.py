import uuid
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username   = Column(String(100), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    profile = relationship("TasteProfile", back_populates="user", uselist=False)
    visits  = relationship("RestaurantVisit", back_populates="user")


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
    __table_args__ = (UniqueConstraint("restaurant_id", name="uq_menus_restaurant_id"),)

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
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
    restaurant_name   = Column(String(200), nullable=True)   # kept for migration back-compat
    cuisine_type      = Column(String(100), nullable=True)
    restaurant_rating = Column(SmallInteger, nullable=True)
    favorite_dish     = Column(String(200), nullable=True)   # deprecated, kept for back-compat
    dish_rating       = Column(SmallInteger, nullable=True)  # deprecated, kept for back-compat
    source            = Column(String(50), default="manual")
    visited_at        = Column(DateTime, server_default=func.now())

    user        = relationship("User", back_populates="visits")
    restaurant  = relationship("Restaurant", back_populates="visits")
    dish_ratings = relationship("DishRating", back_populates="visit")


class TasteProfile(Base):
    __tablename__ = "taste_profiles"

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id              = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    cuisine_affinities   = Column(JSONB)   # flat map: {"Thai": 0.9} — cold start / fallback
    cuisine_profiles     = Column(JSONB)   # rich map: {"thai": {"mains": {"umami": 7, ...}}}
    liked_ingredients    = Column(JSONB)   # frequency map: {"egg": 0.8}
    disliked_ingredients = Column(JSONB)   # frequency map: {"cilantro": 0.9}
    flavor_tags          = Column(JSONB)   # ["spicy", "umami"] — from onboarding survey
    disliked_tags        = Column(JSONB)
    dietary_restrictions = Column(JSONB)
    rated_dishes         = Column(JSONB)   # legacy, kept for back-compat
    top_dishes           = Column(JSONB)   # dish names rated >= 7, derived
    avg_score_threshold  = Column(Float)
    updated_at           = Column(DateTime, onupdate=func.now())

    user = relationship("User", back_populates="profile")
