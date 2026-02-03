from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, nullslast
from typing import List, Optional
from decimal import Decimal
from datetime import date, datetime

from core.database import get_db
from api.v1.endpoints.auth import get_current_user
from models.user import User
from models.finance import Transaction, TransactionItem, Ledger, LedgerGroup, ParentLedgerGroup, EntryType
from pydantic import BaseModel

router = APIRouter()


class TrialBalanceItem(BaseModel):
    ledger_id: int
    ledger_name: str
    ledger_group_name: str
    parent_group_name: str
    # Opening balance (single figure - either debit or credit)
    opening_debit: Decimal
    opening_credit: Decimal
    # Net transactions (period) - single figure
    period_debit: Decimal
    period_credit: Decimal
    # Closing balance (single figure - either debit or credit)
    closing_debit: Decimal
    closing_credit: Decimal

    class Config:
        from_attributes = True


class TrialBalanceResponse(BaseModel):
    start_date: date
    end_date: date
    items: List[TrialBalanceItem]
    # Opening totals (single figures)
    total_opening_debit: Decimal
    total_opening_credit: Decimal
    # Period totals (single figures)
    total_period_debit: Decimal
    total_period_credit: Decimal
    # Closing totals (single figures)
    total_closing_debit: Decimal
    total_closing_credit: Decimal
    is_balanced: bool


@router.get("/trial-balance", response_model=TrialBalanceResponse)
async def get_trial_balance(
    start_date: date = Query(..., description="Start date for the trial balance"),
    end_date: date = Query(..., description="End date for the trial balance"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get trial balance for a date range.
    Efficiently calculates debit and credit totals per ledger using SQL aggregations.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before or equal to end date",
        )

    # Get all active ledgers for the user (to ensure all ledgers appear in report)
    # Order by parent group sort_order, then by name for consistency
    all_ledgers = (
        db.query(
            Ledger.id,
            Ledger.name,
            LedgerGroup.name.label("ledger_group_name"),
            ParentLedgerGroup.name.label("parent_group_name"),
        )
        .join(LedgerGroup, LedgerGroup.id == Ledger.ledger_group_id)
        .join(ParentLedgerGroup, ParentLedgerGroup.id == LedgerGroup.parent_ledger_group_id)
        .filter(Ledger.user_id == current_user.id)
        .filter(Ledger.is_active == True)
        .order_by(nullslast(ParentLedgerGroup.sort_order), ParentLedgerGroup.name, LedgerGroup.name, Ledger.name)
        .all()
    )

    # Efficient query 1: Calculate opening balances (all transactions before start_date)
    opening_query = (
        db.query(
            TransactionItem.ledger_id,
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.DEBIT, TransactionItem.amount),
                    else_=0
                )
            ).label("opening_debit"),
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.CREDIT, TransactionItem.amount),
                    else_=0
                )
            ).label("opening_credit"),
        )
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.transaction_date < start_date)
        .group_by(TransactionItem.ledger_id)
    )
    opening_results = {row.ledger_id: row for row in opening_query.all()}

    # Efficient query 2: Calculate period transactions (between start_date and end_date)
    period_query = (
        db.query(
            TransactionItem.ledger_id,
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.DEBIT, TransactionItem.amount),
                    else_=0
                )
            ).label("period_debit"),
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.CREDIT, TransactionItem.amount),
                    else_=0
                )
            ).label("period_credit"),
        )
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .filter(
            and_(
                Transaction.transaction_date >= start_date,
                Transaction.transaction_date <= end_date,
            )
        )
        .group_by(TransactionItem.ledger_id)
    )
    period_results = {row.ledger_id: row for row in period_query.all()}

    # Helper function to determine if a parent group is asset/expense type (debit normal)
    # or liability/capital/income type (credit normal)
    def is_debit_normal_group(parent_group_name: str) -> bool:
        """Returns True if the group normally has debit balances (assets/expenses)."""
        parent_lower = parent_group_name.lower()
        # Assets and expenses have debit normal balances
        return (
            "asset" in parent_lower
            or "expenditure" in parent_lower
            or "expense" in parent_lower
        )

    # Build trial balance items
    items = []
    total_opening_debit = Decimal("0")
    total_opening_credit = Decimal("0")
    total_period_debit = Decimal("0")
    total_period_credit = Decimal("0")
    total_closing_debit = Decimal("0")
    total_closing_credit = Decimal("0")

    for ledger in all_ledgers:
        # Get opening balances (default to 0 if no transactions)
        opening_row = opening_results.get(ledger.id)
        opening_debit_raw = Decimal(str(opening_row.opening_debit if opening_row else 0))
        opening_credit_raw = Decimal(str(opening_row.opening_credit if opening_row else 0))

        # Get period transactions (default to 0 if no transactions)
        period_row = period_results.get(ledger.id)
        period_debit_raw = Decimal(str(period_row.period_debit if period_row else 0))
        period_credit_raw = Decimal(str(period_row.period_credit if period_row else 0))

        # Determine balance calculation based on parent group
        is_debit_normal = is_debit_normal_group(ledger.parent_group_name)

        # Calculate opening balance: for debit-normal (assets/expenses): debit - credit
        # for credit-normal (liabilities/capital/incomes): credit - debit
        if is_debit_normal:
            opening_balance = opening_debit_raw - opening_credit_raw
        else:
            opening_balance = opening_credit_raw - opening_debit_raw

        # Period transactions: show actual debit and credit values (not net)
        period_debit = period_debit_raw
        period_credit = period_credit_raw

        # Calculate closing balance (opening balance + net period transactions)
        if is_debit_normal:
            period_net = period_debit_raw - period_credit_raw
        else:
            period_net = period_credit_raw - period_debit_raw
        
        closing_balance = opening_balance + period_net

        # Convert opening and closing to single debit/credit representation
        # For debit-normal: positive = debit, negative = credit
        # For credit-normal: positive = credit, negative = debit
        if is_debit_normal:
            opening_debit = opening_balance if opening_balance >= 0 else Decimal("0")
            opening_credit = -opening_balance if opening_balance < 0 else Decimal("0")
            closing_debit = closing_balance if closing_balance >= 0 else Decimal("0")
            closing_credit = -closing_balance if closing_balance < 0 else Decimal("0")
        else:
            # For credit-normal: positive = credit, negative = debit
            opening_credit = opening_balance if opening_balance >= 0 else Decimal("0")
            opening_debit = -opening_balance if opening_balance < 0 else Decimal("0")
            closing_credit = closing_balance if closing_balance >= 0 else Decimal("0")
            closing_debit = -closing_balance if closing_balance < 0 else Decimal("0")

        # Only include ledgers that have transactions (opening or period)
        if opening_debit_raw > 0 or opening_credit_raw > 0 or period_debit_raw > 0 or period_credit_raw > 0:
            items.append(
                TrialBalanceItem(
                    ledger_id=ledger.id,
                    ledger_name=ledger.name,
                    ledger_group_name=ledger.ledger_group_name,
                    parent_group_name=ledger.parent_group_name,
                    opening_debit=opening_debit,
                    opening_credit=opening_credit,
                    period_debit=period_debit,
                    period_credit=period_credit,
                    closing_debit=closing_debit,
                    closing_credit=closing_credit,
                )
            )

            total_opening_debit += opening_debit
            total_opening_credit += opening_credit
            total_period_debit += period_debit
            total_period_credit += period_credit
            total_closing_debit += closing_debit
            total_closing_credit += closing_credit

    # Trial balance should balance: total closing debits = total closing credits
    is_balanced = total_closing_debit == total_closing_credit

    return TrialBalanceResponse(
        start_date=start_date,
        end_date=end_date,
        items=items,
        total_opening_debit=total_opening_debit,
        total_opening_credit=total_opening_credit,
        total_period_debit=total_period_debit,
        total_period_credit=total_period_credit,
        total_closing_debit=total_closing_debit,
        total_closing_credit=total_closing_credit,
        is_balanced=is_balanced,
    )


class LedgerEntry(BaseModel):
    transaction_id: int
    transaction_date: date
    reference: Optional[str]
    transaction_type: str
    entry_type: str
    amount: Decimal
    running_balance: Decimal

    class Config:
        from_attributes = True


class LedgerReportResponse(BaseModel):
    ledger_id: int
    ledger_name: str
    ledger_group_name: str
    parent_group_name: str
    start_date: date
    end_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    entries: List[LedgerEntry]
    total_debit: Decimal
    total_credit: Decimal


@router.get("/ledger", response_model=LedgerReportResponse)
async def get_ledger_report(
    ledger_id: int = Query(..., description="Ledger ID for the report"),
    start_date: date = Query(..., description="Start date for the ledger report"),
    end_date: date = Query(..., description="End date for the ledger report"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get ledger report for a specific ledger within a date range.
    Shows all transactions affecting the ledger with running balance.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before or equal to end date",
        )

    # Verify ledger exists and belongs to user
    ledger = (
        db.query(Ledger)
        .join(LedgerGroup, LedgerGroup.id == Ledger.ledger_group_id)
        .join(ParentLedgerGroup, ParentLedgerGroup.id == LedgerGroup.parent_ledger_group_id)
        .filter(Ledger.id == ledger_id)
        .filter(Ledger.user_id == current_user.id)
        .filter(Ledger.is_active == True)
        .first()
    )

    if not ledger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ledger not found or does not belong to user",
        )

    # Calculate opening balance (all transactions before start_date)
    opening_query = (
        db.query(
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.DEBIT, TransactionItem.amount),
                    else_=0
                )
            ).label("opening_debit"),
            func.sum(
                case(
                    (TransactionItem.entry_type == EntryType.CREDIT, TransactionItem.amount),
                    else_=0
                )
            ).label("opening_credit"),
        )
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(Transaction.user_id == current_user.id)
        .filter(TransactionItem.ledger_id == ledger_id)
        .filter(Transaction.transaction_date < start_date)
    )
    opening_result = opening_query.first()
    opening_debit = Decimal(str(opening_result.opening_debit if opening_result.opening_debit else 0))
    opening_credit = Decimal(str(opening_result.opening_credit if opening_result.opening_credit else 0))
    opening_balance = opening_debit - opening_credit

    # Get all transaction items for this ledger in the date range
    entries_query = (
        db.query(
            Transaction.id.label("transaction_id"),
            Transaction.transaction_date,
            Transaction.reference,
            Transaction.transaction_type,
            TransactionItem.entry_type,
            TransactionItem.amount,
        )
        .join(TransactionItem, TransactionItem.transaction_id == Transaction.id)
        .filter(Transaction.user_id == current_user.id)
        .filter(TransactionItem.ledger_id == ledger_id)
        .filter(
            and_(
                Transaction.transaction_date >= start_date,
                Transaction.transaction_date <= end_date,
            )
        )
        .order_by(Transaction.transaction_date, Transaction.id)
        .all()
    )

    # Build entries with running balance
    entries = []
    running_balance = opening_balance
    total_debit = Decimal("0")
    total_credit = Decimal("0")

    for row in entries_query:
        amount = Decimal(str(row.amount))
        if row.entry_type == EntryType.DEBIT:
            running_balance += amount
            total_debit += amount
        else:
            running_balance -= amount
            total_credit += amount

        entries.append(
            LedgerEntry(
                transaction_id=row.transaction_id,
                transaction_date=row.transaction_date,
                reference=row.reference,
                transaction_type=row.transaction_type.value if hasattr(row.transaction_type, 'value') else str(row.transaction_type),
                entry_type=row.entry_type.value if hasattr(row.entry_type, 'value') else str(row.entry_type),
                amount=amount,
                running_balance=running_balance,
            )
        )

    closing_balance = running_balance

    return LedgerReportResponse(
        ledger_id=ledger.id,
        ledger_name=ledger.name,
        ledger_group_name=ledger.ledger_group.name,
        parent_group_name=ledger.ledger_group.parent_ledger_group.name,
        start_date=start_date,
        end_date=end_date,
        opening_balance=opening_balance,
        closing_balance=closing_balance,
        entries=entries,
        total_debit=total_debit,
        total_credit=total_credit,
    )

