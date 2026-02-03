from sqlalchemy import Column, Integer, String, Enum, DateTime, Text, Boolean
from sqlalchemy.sql import func
import enum
from core.database import Base


class FeedbackType(str, enum.Enum):
    FEATURE_REQUEST = "feature_request"
    BUG_REPORT = "bug_report"


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    feedback_type = Column(Enum(FeedbackType), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    is_resolved = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
