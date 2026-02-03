from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from api.v1.endpoints.auth import get_current_user
from models.user import User
from models.feedback import Feedback, FeedbackType
from schemas.feedback import FeedbackCreate, FeedbackResponse, FeedbackUpdate

router = APIRouter()


@router.post(
    "/",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_feedback(
    feedback_data: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a feature request or bug report."""
    # Validate title and description
    if not feedback_data.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title is required",
        )

    if not feedback_data.description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required",
        )

    # Create feedback
    new_feedback = Feedback(
        user_id=current_user.id,
        feedback_type=feedback_data.feedback_type,
        title=feedback_data.title,
        description=feedback_data.description,
        is_resolved=False,
    )

    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)

    return new_feedback


@router.get("/", response_model=List[FeedbackResponse])
async def get_feedback(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    feedback_type: Optional[FeedbackType] = None,
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: 'pending', 'resolved', or 'all'"),
):
    """Get all feedback submitted by the current user."""
    from sqlalchemy import or_
    
    query = db.query(Feedback).filter(Feedback.user_id == current_user.id)

    if feedback_type:
        query = query.filter(Feedback.feedback_type == feedback_type)

    # Filter by status
    if status_filter == "pending":
        query = query.filter(or_(Feedback.is_resolved == False, Feedback.is_resolved.is_(None)))
    elif status_filter == "resolved":
        query = query.filter(Feedback.is_resolved == True)
    # If status_filter is "all" or None, show all

    feedback_list = query.order_by(Feedback.created_at.desc()).all()
    
    # Ensure is_resolved is always a boolean (default to False if None)
    for feedback in feedback_list:
        if feedback.is_resolved is None:
            feedback.is_resolved = False

    return feedback_list


@router.put("/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: int,
    feedback_update: FeedbackUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update feedback status (mark as resolved/unresolved)."""
    feedback = (
        db.query(Feedback)
        .filter(Feedback.id == feedback_id)
        .filter(Feedback.user_id == current_user.id)
        .first()
    )

    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found",
        )

    feedback.is_resolved = feedback_update.is_resolved
    db.commit()
    db.refresh(feedback)

    return feedback

