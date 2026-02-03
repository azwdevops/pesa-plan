from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.feedback import FeedbackType


class FeedbackCreate(BaseModel):
    feedback_type: FeedbackType
    title: str
    description: str


class FeedbackUpdate(BaseModel):
    is_resolved: bool


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    feedback_type: FeedbackType
    title: str
    description: str
    is_resolved: Optional[bool] = False
    created_at: datetime

    class Config:
        from_attributes = True

