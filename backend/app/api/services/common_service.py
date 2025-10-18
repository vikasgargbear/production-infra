"""
Common Service - Shared functionality across all modules
Reduces code duplication and ensures consistency
"""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class CommonService:
    """Shared business logic used across multiple modules"""

    @staticmethod
    def get_active_employees(db: Session, org_id: UUID) -> List[Dict]:
        """
        Get list of active employees for an organization
        Used by: Sales Orders, Invoices, Purchases, etc. for "Created By" dropdown

        Args:
            db: Database session
            org_id: Organization ID

        Returns:
            List of dicts with employee details
        """
        try:
            result = db.execute(text("""
                SELECT
                    user_id,
                    full_name,
                    email,
                    role_id,
                    is_active
                FROM master.org_users
                WHERE org_id = :org_id AND is_active = true
                ORDER BY full_name
            """), {"org_id": org_id})

            return [dict(row._mapping) for row in result]

        except Exception as e:
            logger.error(f"Error fetching employees for org {org_id}: {e}")
            return []

    @staticmethod
    def get_default_branch(db: Session, org_id: UUID) -> Optional[Dict]:
        """
        Get default branch for an organization
        Used by: All modules that need branch_id

        Args:
            db: Database session
            org_id: Organization ID

        Returns:
            Dict with branch details or None
        """
        try:
            result = db.execute(text("""
                SELECT
                    branch_id,
                    branch_name,
                    branch_code,
                    state,
                    is_default
                FROM master.org_branches
                WHERE org_id = :org_id AND is_default = true
                LIMIT 1
            """), {"org_id": org_id})

            row = result.fetchone()
            return dict(row._mapping) if row else None

        except Exception as e:
            logger.error(f"Error fetching default branch for org {org_id}: {e}")
            return None

    @staticmethod
    def get_payment_methods(db: Session, org_id: UUID) -> List[Dict]:
        """
        Get active payment methods for an organization
        Used by: Invoices, Payments, Sales, etc.

        Args:
            db: Database session
            org_id: Organization ID

        Returns:
            List of payment methods
        """
        try:
            result = db.execute(text("""
                SELECT
                    payment_method_id,
                    method_code,
                    method_name,
                    method_type,
                    is_active
                FROM financial.payment_methods
                WHERE org_id = :org_id AND is_active = true
                ORDER BY method_name
            """), {"org_id": org_id})

            return [dict(row._mapping) for row in result]

        except Exception as e:
            logger.error(f"Error fetching payment methods for org {org_id}: {e}")
            return []

    @staticmethod
    def get_bank_accounts(db: Session, org_id: UUID) -> List[Dict]:
        """
        Get active bank accounts for an organization
        Used by: Invoices, Payments, etc.

        Args:
            db: Database session
            org_id: Organization ID

        Returns:
            List of bank accounts
        """
        try:
            result = db.execute(text("""
                SELECT
                    bank_account_id,
                    account_name,
                    account_number,
                    bank_name,
                    ifsc_code,
                    is_default,
                    is_active
                FROM financial.bank_accounts
                WHERE org_id = :org_id AND is_active = true
                ORDER BY is_default DESC, account_name
            """), {"org_id": org_id})

            return [dict(row._mapping) for row in result]

        except Exception as e:
            logger.error(f"Error fetching bank accounts for org {org_id}: {e}")
            return []

    @staticmethod
    def validate_customer_exists(
        db: Session,
        customer_id: int,
        org_id: UUID
    ) -> bool:
        """
        Check if customer exists and belongs to organization
        Used by: Sales Orders, Invoices, Quotations, etc.

        Args:
            db: Database session
            customer_id: Customer ID
            org_id: Organization ID

        Returns:
            bool: True if customer exists and belongs to org
        """
        try:
            exists = db.execute(text("""
                SELECT 1
                FROM parties.customers
                WHERE customer_id = :customer_id
                  AND org_id = :org_id
                LIMIT 1
            """), {"customer_id": customer_id, "org_id": org_id}).scalar()

            return exists is not None

        except Exception as e:
            logger.error(f"Error validating customer {customer_id}: {e}")
            return False

    @staticmethod
    def validate_product_exists(
        db: Session,
        product_id: int,
        org_id: UUID
    ) -> bool:
        """
        Check if product exists and belongs to organization
        Used by: Sales, Purchase, Inventory, etc.

        Args:
            db: Database session
            product_id: Product ID
            org_id: Organization ID

        Returns:
            bool: True if product exists and belongs to org
        """
        try:
            exists = db.execute(text("""
                SELECT 1
                FROM inventory.products
                WHERE product_id = :product_id
                  AND org_id = :org_id
                LIMIT 1
            """), {"product_id": product_id, "org_id": org_id}).scalar()

            return exists is not None

        except Exception as e:
            logger.error(f"Error validating product {product_id}: {e}")
            return False

    @staticmethod
    def get_organization_settings(db: Session, org_id: UUID) -> Optional[Dict]:
        """
        Get organization settings/configuration
        Used by: All modules that need org-level configuration

        Args:
            db: Database session
            org_id: Organization ID

        Returns:
            Dict with organization settings or None
        """
        try:
            result = db.execute(text("""
                SELECT
                    org_id,
                    company_name,
                    gst_number,
                    pan_number,
                    state_name,
                    country,
                    currency_code,
                    fiscal_year_start,
                    is_active
                FROM master.organizations
                WHERE org_id = :org_id
                LIMIT 1
            """), {"org_id": org_id})

            row = result.fetchone()
            return dict(row._mapping) if row else None

        except Exception as e:
            logger.error(f"Error fetching organization settings for {org_id}: {e}")
            return None
