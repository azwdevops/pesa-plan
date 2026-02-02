from sqlalchemy import Column, Integer, String, ForeignKey, Enum, Boolean, Numeric, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
import enum
from core.database import Base


# Enums
class TransactionType(str, enum.Enum):
    MONEY_RECEIVED = "MONEY_RECEIVED"
    MONEY_PAID = "MONEY_PAID"
    JOURNAL = "JOURNAL"


class EntryType(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class LedgerGroupCategory(str, enum.Enum):
    INCOMES = "incomes"
    EXPENSES = "expenses"
    BANK_ACCOUNTS = "bank_accounts"
    CASH_ACCOUNTS = "cash_accounts"
    BANK_CHARGES = "bank_charges"
    OTHER = "other"


# Models
class ParentLedgerGroup(Base):
    __tablename__ = "parent_ledger_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    sort_order = Column(Integer, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ledger_groups = relationship("LedgerGroup", back_populates="parent_ledger_group", cascade="all, delete-orphan")


class LedgerGroup(Base):
    __tablename__ = "ledger_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    parent_ledger_group_id = Column(Integer, ForeignKey("parent_ledger_groups.id"), nullable=False, index=True)
    category = Column(Enum(LedgerGroupCategory), nullable=False, default=LedgerGroupCategory.OTHER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    parent_ledger_group = relationship("ParentLedgerGroup", back_populates="ledger_groups")
    ledgers = relationship("Ledger", back_populates="ledger_group", cascade="all, delete-orphan")


class SpendingType(Base):
    __tablename__ = "spending_types"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ledgers = relationship("Ledger", back_populates="spending_type")


class Ledger(Base):
    __tablename__ = "ledgers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    ledger_group_id = Column(Integer, ForeignKey("ledger_groups.id"), nullable=False, index=True)
    spending_type_id = Column(
        Integer, ForeignKey("spending_types.id"), nullable=True, index=True
    )  # Only applicable for expenses
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ledger_group = relationship("LedgerGroup", back_populates="ledgers")
    spending_type = relationship("SpendingType", back_populates="ledgers")
    transaction_items = relationship("TransactionItem", back_populates="ledger", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    transaction_date = Column(Date, nullable=False, index=True)
    reference = Column(String, nullable=True)  # Voucher number, invoice number, etc.
    transaction_type = Column(Enum(TransactionType), nullable=False)
    total_amount = Column(Numeric(15, 2), nullable=False)  # For quick reference and validation
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    items = relationship("TransactionItem", back_populates="transaction", cascade="all, delete-orphan")


class TransactionItem(Base):
    __tablename__ = "transaction_items"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False, index=True)
    entry_type = Column(Enum(EntryType), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    transaction = relationship("Transaction", back_populates="items")
    ledger = relationship("Ledger", back_populates="transaction_items")
