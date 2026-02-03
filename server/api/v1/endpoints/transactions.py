from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from core.database import get_db
from api.v1.endpoints.auth import get_current_user
from models.user import User
from models.finance import Transaction, TransactionItem, TransactionType, EntryType, Ledger
from schemas.finance import (
    TransactionCreate,
    TransactionResponse,
    TransactionWithItems,
    TransactionUpdate,
)

router = APIRouter()


@router.post(
    "/",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new transaction with double-entry accounting validation."""
    # Validate that items exist and belong to user
    ledger_ids = [item.ledger_id for item in transaction_data.items]
    ledgers = (
        db.query(Ledger)
        .filter(Ledger.id.in_(ledger_ids))
        .filter(Ledger.user_id == current_user.id)
        .filter(Ledger.is_active == True)
        .all()
    )

    if len(ledgers) != len(set(ledger_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more ledgers not found or do not belong to user",
        )

    # Validate double-entry: total debits must equal total credits
    total_debits = sum(
        Decimal(str(item.amount))
        for item in transaction_data.items
        if item.entry_type == EntryType.DEBIT
    )
    total_credits = sum(
        Decimal(str(item.amount))
        for item in transaction_data.items
        if item.entry_type == EntryType.CREDIT
    )

    if total_debits != total_credits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Double-entry validation failed: Debits ({total_debits}) must equal Credits ({total_credits})",
        )

    # Calculate total_amount automatically: use debit total (or credit total, they're equal)
    # This represents the transaction value, not the sum of all entries
    calculated_total = total_debits

    # Create transaction
    new_transaction = Transaction(
        user_id=current_user.id,
        transaction_date=transaction_data.transaction_date,
        reference=transaction_data.reference,
        transaction_type=transaction_data.transaction_type,
        total_amount=calculated_total,
    )

    db.add(new_transaction)
    db.flush()  # Flush to get the transaction ID

    # Create transaction items
    for item_data in transaction_data.items:
        new_item = TransactionItem(
            transaction_id=new_transaction.id,
            ledger_id=item_data.ledger_id,
            entry_type=item_data.entry_type,
            amount=item_data.amount,
        )
        db.add(new_item)

    db.commit()
    db.refresh(new_transaction)

    return new_transaction


@router.get("/", response_model=List[TransactionResponse])
async def get_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    transaction_type: TransactionType = None,
    limit: int = 100,
    offset: int = 0,
):
    """Get all transactions for the current user."""
    query = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
    )

    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)

    transactions = (
        query.order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return transactions


@router.get("/{transaction_id}", response_model=TransactionWithItems)
async def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific transaction by ID with its items."""
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    return transaction


@router.put("/{transaction_id}", response_model=TransactionWithItems)
async def update_transaction(
    transaction_id: int,
    transaction_data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing transaction with double-entry accounting validation."""
    # Get the transaction
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    # If items are being updated, validate them
    if transaction_data.items is not None:
        # Validate that items exist and belong to user
        ledger_ids = [item.ledger_id for item in transaction_data.items]
        ledgers = (
            db.query(Ledger)
            .filter(Ledger.id.in_(ledger_ids))
            .filter(Ledger.user_id == current_user.id)
            .filter(Ledger.is_active == True)
            .all()
        )

        if len(ledgers) != len(set(ledger_ids)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more ledgers not found or do not belong to user",
            )

        # Validate double-entry: total debits must equal total credits
        total_debits = sum(
            Decimal(str(item.amount))
            for item in transaction_data.items
            if item.entry_type == EntryType.DEBIT
        )
        total_credits = sum(
            Decimal(str(item.amount))
            for item in transaction_data.items
            if item.entry_type == EntryType.CREDIT
        )

        if total_debits != total_credits:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Double-entry validation failed: Debits ({total_debits}) must equal Credits ({total_credits})",
            )

        # Calculate total_amount automatically
        calculated_total = total_debits

        # Delete existing items
        db.query(TransactionItem).filter(
            TransactionItem.transaction_id == transaction_id
        ).delete()

        # Create new items
        for item_data in transaction_data.items:
            new_item = TransactionItem(
                transaction_id=transaction.id,
                ledger_id=item_data.ledger_id,
                entry_type=item_data.entry_type,
                amount=item_data.amount,
            )
            db.add(new_item)

        transaction.total_amount = calculated_total

    # Update transaction fields
    if transaction_data.transaction_date is not None:
        transaction.transaction_date = transaction_data.transaction_date
    if transaction_data.reference is not None:
        transaction.reference = transaction_data.reference
    if transaction_data.transaction_type is not None:
        transaction.transaction_type = transaction_data.transaction_type

    db.commit()
    db.refresh(transaction)

    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a transaction and its items."""
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    # Delete transaction items (cascade should handle this, but being explicit)
    db.query(TransactionItem).filter(
        TransactionItem.transaction_id == transaction_id
    ).delete()

    # Delete transaction
    db.delete(transaction)
    db.commit()

    return None


