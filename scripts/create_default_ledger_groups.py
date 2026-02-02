#!/usr/bin/env python3
"""
Create default parent ledger groups and ledger groups.
These are universal and shared by all users.
Run this script once to initialize the system.
"""

import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from sqlalchemy.orm import Session
from core.database import SessionLocal
from models.finance import ParentLedgerGroup, LedgerGroup, LedgerGroupCategory


def create_default_ledger_groups(db: Session):
    """Create default parent ledger groups and ledger groups."""
    print("Creating default ledger groups...")
    print("-" * 60)

    # Create Parent Ledger Groups with sort order
    # Sort order: Fixed Assets (1), Current Assets (2), Current Liabilities (3),
    # Long Term Liabilities (4), Capital & Reserves (5), Income (6), Expenditure (7)
    parent_groups_data = [
        {"name": "Fixed Assets", "sort_order": 1},
        {"name": "Current Assets", "sort_order": 2},
        {"name": "Current Liabilities", "sort_order": 3},
        {"name": "Long Term Liabilities", "sort_order": 4},
        {"name": "Capital & Reserves", "sort_order": 5},
        {"name": "Income", "sort_order": 6},
        {"name": "Expenditure", "sort_order": 7},
    ]

    parent_groups = {}
    for group_data in parent_groups_data:
        existing = db.query(ParentLedgerGroup).filter(ParentLedgerGroup.name == group_data["name"]).first()

        if not existing:
            new_group = ParentLedgerGroup(
                name=group_data["name"],
                sort_order=group_data["sort_order"],
            )
            db.add(new_group)
            db.flush()  # Flush to get the ID
            parent_groups[group_data["name"]] = new_group
            print(f"✓ Created parent group: {group_data['name']} (sort_order: {group_data['sort_order']})")
        else:
            # Update sort_order if it doesn't exist (None) or is different
            if existing.sort_order is None or existing.sort_order != group_data["sort_order"]:
                existing.sort_order = group_data["sort_order"]
                print(f"✓ Updated parent group: {group_data['name']} with sort_order: {group_data['sort_order']}")
            else:
                print(f"⊘ Already exists: {group_data['name']} (sort_order: {existing.sort_order})")
            parent_groups[group_data["name"]] = existing

    db.commit()

    # Create Ledger Groups
    ledger_groups_data = [
        {
            "name": "Bank Accounts",
            "parent_name": "Current Assets",
            "category": LedgerGroupCategory.BANK_ACCOUNTS,
        },
        {
            "name": "Cash Accounts",
            "parent_name": "Current Assets",
            "category": LedgerGroupCategory.CASH_ACCOUNTS,
        },
        {
            "name": "Incomes",
            "parent_name": "Income",
            "category": LedgerGroupCategory.INCOMES,
        },
        {
            "name": "Expenditure",
            "parent_name": "Expenditure",
            "category": LedgerGroupCategory.EXPENSES,
        },
        {
            "name": "Finance Costs",
            "parent_name": "Expenditure",
            "category": LedgerGroupCategory.BANK_CHARGES,
        },
    ]

    print("\nCreating ledger groups...")
    print("-" * 60)

    for group_data in ledger_groups_data:
        parent_group = parent_groups.get(group_data["parent_name"])
        if not parent_group:
            print(f"✗ Error: Parent group '{group_data['parent_name']}' not found")
            continue

        existing = db.query(LedgerGroup).filter(LedgerGroup.name == group_data["name"]).first()

        if not existing:
            new_group = LedgerGroup(
                name=group_data["name"],
                parent_ledger_group_id=parent_group.id,
                category=group_data["category"],
            )
            db.add(new_group)
            print(
                f"✓ Created ledger group: {group_data['name']} (under {group_data['parent_name']}, category: {group_data['category'].value})"
            )
        else:
            # Update existing group with category if it doesn't have one
            if not existing.category or existing.category == LedgerGroupCategory.OTHER:
                existing.category = group_data["category"]
                print(f"✓ Updated ledger group: {group_data['name']} with category: {group_data['category'].value}")
            else:
                print(f"⊘ Already exists: {group_data['name']}")

    db.commit()
    print("\n✓ Default ledger groups created successfully!")


def main():
    """Main function."""
    db = SessionLocal()

    try:
        create_default_ledger_groups(db)
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
