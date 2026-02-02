from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
from models.finance import TransactionType, EntryType, LedgerGroupCategory


# Parent Ledger Group Schemas
class ParentLedgerGroupBase(BaseModel):
    name: str
    sort_order: Optional[int] = None


class ParentLedgerGroupCreate(ParentLedgerGroupBase):
    pass


class ParentLedgerGroupResponse(ParentLedgerGroupBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Ledger Group Schemas
class LedgerGroupBase(BaseModel):
    name: str
    parent_ledger_group_id: int
    category: LedgerGroupCategory


class LedgerGroupCreate(LedgerGroupBase):
    pass


class LedgerGroupResponse(LedgerGroupBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LedgerGroupWithParent(LedgerGroupResponse):
    parent_ledger_group: ParentLedgerGroupResponse

    class Config:
        from_attributes = True


# Spending Type Schemas
class SpendingTypeBase(BaseModel):
    name: str


class SpendingTypeCreate(SpendingTypeBase):
    pass


class SpendingTypeResponse(SpendingTypeBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Ledger Schemas
class LedgerBase(BaseModel):
    name: str
    ledger_group_id: int
    spending_type_id: Optional[int] = None


class LedgerCreate(LedgerBase):
    pass


class LedgerResponse(LedgerBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LedgerWithGroup(LedgerResponse):
    ledger_group: LedgerGroupResponse
    spending_type: Optional[SpendingTypeResponse] = None

    class Config:
        from_attributes = True


# Transaction Schemas
class TransactionItemBase(BaseModel):
    ledger_id: int
    entry_type: EntryType
    amount: Decimal


class TransactionItemCreate(TransactionItemBase):
    pass


class TransactionItemResponse(TransactionItemBase):
    id: int
    transaction_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    transaction_date: date
    reference: Optional[str] = None
    transaction_type: TransactionType
    total_amount: Decimal


class TransactionCreate(TransactionBase):
    items: list[TransactionItemCreate]


class TransactionResponse(TransactionBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TransactionWithItems(TransactionResponse):
    items: list[TransactionItemResponse]

    class Config:
        from_attributes = True
