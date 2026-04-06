import uuid
from sqlalchemy import Column, DateTime, Float, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    profile = relationship("TasteProfile", back_populates="user", uselist=False)
    visits = relationship("RestaurantVisit", back_populates="user")


class TasteProfile(Base):
    __tablename__ = "taste_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    cuisine_affinities = Column(JSONB)        # {"Thai": 0.9, "French": 0.4}
    flavor_tags = Column(JSONB)               # ["spicy", "umami"]
    disliked_tags = Column(JSONB)             # ["heavy cream"]
    dietary_restrictions = Column(JSONB)      # ["no shellfish"]
    rated_dishes = Column(JSONB)              # legacy
    top_dishes = Column(JSONB)                # ["Pad Thai", "Salmon Sashimi"]
    avg_score_threshold = Column(Float)       # e.g. 7.5  (mean dish_rating across visits)
    updated_at = Column(DateTime, onupdate=func.now())
    user = relationship("User", back_populates="profile")


class RestaurantVisit(Base):
    __tablename__ = "restaurant_visits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    restaurant_name = Column(String(200), nullable=False)
    cuisine_type = Column(String(100), nullable=True)
    restaurant_rating = Column(SmallInteger, nullable=True)   # 1-10
    favorite_dish = Column(String(200), nullable=True)
    dish_rating = Column(SmallInteger, nullable=True)         # 1-10
    source = Column(String(50), default="manual")             # manual | survey | import
    visited_at = Column(DateTime, server_default=func.now())
    user = relationship("User", back_populates="visits")
