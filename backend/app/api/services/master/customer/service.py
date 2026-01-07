"""
Customer service layer for business logic
Handles GST validation, credit management, and ledger calculations
"""
from __future__ import annotations

from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta
from decimal import Decimal
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import re

from ....schemas.master.customer import (
    CustomerLedgerEntry, CustomerLedgerResponse, OutstandingInvoice,
    CustomerOutstandingResponse, PaymentRecord,
    PaymentResponse, CustomerCreate, CustomerResponse
)
from ...compliance.gst_service import GSTService
from ...document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

# Constants
DEFAULT_LEDGER_DAYS = 365  # Default date range for ledger queries
DEFAULT_CREDIT_LIMIT = Decimal("0.00")
DEFAULT_CREDIT_DAYS = 0
CUSTOMER_TYPES = ["retail", "wholesale", "hospital", "clinic", "pharmacy"]
PAYMENT_MODES = ["cash", "cheque", "bank_transfer", "upi", "card"]


class CustomerService:
    """Service class for customer-related business logic"""
    
    # --- Helper Methods ---
    
    @staticmethod
    def _get_customer_org_id(db: Session, customer_id: int) -> Optional[UUID]:
        """Get org_id for a customer - reduces duplicate subqueries"""
        result = db.execute(text(
            "SELECT org_id FROM parties.customers WHERE customer_id = :id"
        ), {"id": customer_id}).scalar()
        return UUID(str(result)) if result else None
    
    @staticmethod
    def customer_exists(db: Session, customer_id: int) -> bool:
        """Check if a customer exists."""
        count = db.execute(text(
            "SELECT COUNT(*) FROM parties.customers WHERE customer_id = :id"
        ), {"id": customer_id}).scalar()
        return count > 0
    
    @staticmethod
    def _get_default_user_id(db: Session, org_id: UUID) -> Optional[int]:
        """Get default active user for an org"""
        result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true 
            LIMIT 1
        """), {"org_id": str(org_id)}).scalar()
        return result
    
    @staticmethod
    def _get_default_branch_id(db: Session, org_id: UUID) -> Optional[int]:
        """Get default branch for an org"""
        result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id 
            LIMIT 1
        """), {"org_id": str(org_id)}).scalar()
        return result
    
    @staticmethod
    def _get_default_payment_method_id(db: Session, org_id: UUID, method_code: str = "cash") -> int:
        """Get payment method ID, with fallback"""
        result = db.execute(text("""
            SELECT payment_method_id FROM financial.payment_methods 
            WHERE org_id = :org_id AND LOWER(method_code) = LOWER(:method_code) 
            LIMIT 1
        """), {"org_id": str(org_id), "method_code": method_code}).scalar()
        
        if not result:
            # Try to get any cash method as fallback
            result = db.execute(text("""
                SELECT payment_method_id FROM financial.payment_methods 
                WHERE org_id = :org_id 
                LIMIT 1
            """), {"org_id": str(org_id)}).scalar()
        
        return result  # Return None if not found - caller handles
    
    # --- Validation Methods ---
    
    @staticmethod
    def validate_customer_data(customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate customer data including GSTIN and PAN.
        Uses GSTService for GSTIN validation.
        """
        errors = []
        validated_data = customer_data.copy()
        
        # Validate GSTIN using GSTService
        gst_number = customer_data.get("gst_number") or customer_data.get("gstin")
        if gst_number:
            if not GSTService.validate_gstin(gst_number):
                errors.append("Invalid GSTIN format")
            else:
                # Extract and store state code
                state_code = GSTService.extract_state_code(gst_number)
                if state_code:
                    validated_data["gst_state_code"] = state_code
                    validated_data["gst_state_name"] = GSTService.get_state_name(state_code)
        
        # Validate PAN format
        pan = customer_data.get("pan_number")
        if pan and not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", pan):
            errors.append("Invalid PAN format")
        
        # Validate phone numbers
        phone = customer_data.get("primary_phone")
        if phone and not re.match(r"^[0-9]{10}$", phone):
            errors.append("Invalid phone number format (must be 10 digits)")
        
        # Validate customer type
        customer_type = customer_data.get("customer_type")
        if customer_type and customer_type not in CUSTOMER_TYPES:
            errors.append(f"Invalid customer type. Must be one of: {', '.join(CUSTOMER_TYPES)}")
        
        # Validate credit limit and days
        if customer_data.get("credit_limit") and customer_data["credit_limit"] < 0:
            errors.append("Credit limit cannot be negative")
        
        if customer_data.get("credit_days") and (customer_data["credit_days"] < 0 or customer_data["credit_days"] > 365):
            errors.append("Credit days must be between 0 and 365")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "data": validated_data
        }
    
    @staticmethod
    def check_duplicate_customer(
        db: Session, 
        org_id: UUID,
        gst_number: Optional[str] = None,
        primary_phone: Optional[str] = None,
        customer_name: Optional[str] = None,
        exclude_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Check for duplicate customers by GSTIN, phone, or name"""
        duplicates = []
        
        # Check GSTIN duplicate
        if gst_number:
            query = """
                SELECT customer_id, customer_name, gst_number 
                FROM parties.customers 
                WHERE org_id = :org_id AND gst_number = :gst_number
            """
            params = {"org_id": str(org_id), "gst_number": gst_number}
            if exclude_id:
                query += " AND customer_id != :exclude_id"
                params["exclude_id"] = exclude_id
            
            result = db.execute(text(query), params).fetchone()
            if result:
                duplicates.append({
                    "field": "gst_number",
                    "customer_id": result.customer_id,
                    "customer_name": result.customer_name,
                    "message": f"GSTIN already exists for customer: {result.customer_name}"
                })
        
        # Check phone duplicate
        if primary_phone:
            query = """
                SELECT customer_id, customer_name, primary_phone 
                FROM parties.customers 
                WHERE org_id = :org_id AND primary_phone = :phone
            """
            params = {"org_id": str(org_id), "phone": primary_phone}
            if exclude_id:
                query += " AND customer_id != :exclude_id"
                params["exclude_id"] = exclude_id
            
            result = db.execute(text(query), params).fetchone()
            if result:
                duplicates.append({
                    "field": "primary_phone",
                    "customer_id": result.customer_id,
                    "customer_name": result.customer_name,
                    "message": f"Phone number already exists for customer: {result.customer_name}"
                })
        
        return {
            "has_duplicates": len(duplicates) > 0,
            "duplicates": duplicates
        }
    
    # --- CRUD Methods ---
    
    @staticmethod
    def generate_customer_code(db: Session, customer_name: str) -> str:
        """Generate unique customer code"""
        # Get first 3 letters of customer name
        prefix = ''.join(filter(str.isalpha, customer_name.upper()))[:3]
        if not prefix:
            prefix = "CUS"
        
        # Get the next sequence number
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM parties.customers
            WHERE customer_code LIKE :prefix || '%'
        """), {"prefix": prefix})
        
        next_num = result.scalar() or 1
        return f"{prefix}{next_num:04d}"
    
    @staticmethod
    def get_customer(
        db: Session, 
        customer_id: int,
        org_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Get customer by ID with full details including outstanding"""
        result = db.execute(text("""
            SELECT c.*,
                   COALESCE(
                       (SELECT SUM(outstanding_amount) 
                        FROM financial.customer_outstanding 
                        WHERE customer_id = c.customer_id AND org_id = c.org_id AND status != 'closed'),
                       0
                   ) as current_outstanding
            FROM parties.customers c
            WHERE c.customer_id = :customer_id AND c.org_id = :org_id
        """), {"customer_id": customer_id, "org_id": str(org_id)})
        
        row = result.fetchone()
        if not row:
            return None
        
        return dict(row._mapping)
    
    @staticmethod
    def create_customer(
        db: Session, 
        customer_data: Dict[str, Any],
        org_id: UUID,
        user_id: int
    ) -> Dict[str, Any]:
        """Create a new customer with validation"""
        # Validate data using centralized validation
        validation = CustomerService.validate_customer_data(customer_data)
        if not validation["valid"]:
            raise ValueError(f"Validation failed: {', '.join(validation['errors'])}")
        
        # Use validated data with enriched fields (e.g., gst_state_code)
        data = validation["data"]
        
        # Check for duplicates
        duplicate_check = CustomerService.check_duplicate_customer(
            db, org_id,
            gst_number=data.get("gst_number"),
            primary_phone=data.get("primary_phone")
        )
        if duplicate_check["has_duplicates"]:
            raise ValueError(duplicate_check["duplicates"][0]["message"])
        
        # Generate customer code if not provided
        customer_code = data.get("customer_code")
        if not customer_code:
            customer_code = CustomerService.generate_customer_code(db, data["customer_name"])
        
        # Insert customer
        result = db.execute(text("""
            INSERT INTO parties.customers (
                org_id, customer_code, customer_name, customer_type,
                primary_phone, secondary_phone, primary_email,
                contact_person_name, contact_person_phone, contact_person_email,
                address_line1, address_line2, area, city, state, pincode,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                credit_limit, credit_days, credit_rating, payment_terms,
                discount_percent, business_type, is_active,
                internal_notes, created_at, updated_at, created_by, updated_by
            ) VALUES (
                :org_id, :customer_code, :customer_name, :customer_type,
                :primary_phone, :secondary_phone, :primary_email,
                :contact_person_name, :contact_person_phone, :contact_person_email,
                :address_line1, :address_line2, :area, :city, :state, :pincode,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :credit_limit, :credit_days, :credit_rating, :payment_terms,
                :discount_percent, :business_type, :is_active,
                :internal_notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :user_id, :user_id
            )
            RETURNING customer_id
        """), {
            "org_id": str(org_id),
            "customer_code": customer_code,
            "customer_name": data["customer_name"],
            "customer_type": data.get("customer_type", "retail"),
            "primary_phone": data["primary_phone"],
            "secondary_phone": data.get("secondary_phone"),
            "primary_email": data.get("primary_email"),
            "contact_person_name": data.get("contact_person_name"),
            "contact_person_phone": data.get("contact_person_phone"),
            "contact_person_email": data.get("contact_person_email"),
            "address_line1": data.get("address_line1"),
            "address_line2": data.get("address_line2"),
            "area": data.get("area"),
            "city": data.get("city"),
            "state": data.get("state"),
            "pincode": data.get("pincode"),
            "gst_number": data.get("gst_number"),
            "pan_number": data.get("pan_number"),
            "drug_license_number": data.get("drug_license_number"),
            "drug_license_validity": data.get("drug_license_validity"),
            "credit_limit": data.get("credit_limit", DEFAULT_CREDIT_LIMIT),
            "credit_days": data.get("credit_days", DEFAULT_CREDIT_DAYS),
            "credit_rating": data.get("credit_rating", "NEW"),
            "payment_terms": data.get("payment_terms", "CASH"),
            "discount_percent": data.get("discount_percent", Decimal("0.00")),
            "business_type": data.get("business_type", "retail_pharmacy"),
            "is_active": data.get("is_active", True),
            "internal_notes": data.get("internal_notes"),
            "user_id": user_id
        })
        
        customer_id = result.scalar()
        db.commit()
        
        logger.info(f"Created customer {customer_code} (ID: {customer_id}) for org {org_id}")
        
        return {
            "customer_id": customer_id,
            "customer_code": customer_code,
            "customer_name": data["customer_name"],
            "message": "Customer created successfully"
        }
    
    @staticmethod
    def update_customer(
        db: Session,
        customer_id: int,
        update_data: Dict[str, Any],
        org_id: UUID,
        user_id: int
    ) -> Dict[str, Any]:
        """Update customer with validation"""
        # Check customer exists
        existing = CustomerService.get_customer(db, customer_id, org_id)
        if not existing:
            raise ValueError(f"Customer {customer_id} not found")
        
        # Validate update data
        validation = CustomerService.validate_customer_data(update_data)
        if not validation["valid"]:
            raise ValueError(f"Validation failed: {', '.join(validation['errors'])}")
        
        data = validation["data"]
        
        # Check for duplicates (excluding current customer)
        if data.get("gst_number") or data.get("primary_phone"):
            duplicate_check = CustomerService.check_duplicate_customer(
                db, org_id,
                gst_number=data.get("gst_number"),
                primary_phone=data.get("primary_phone"),
                exclude_id=customer_id
            )
            if duplicate_check["has_duplicates"]:
                raise ValueError(duplicate_check["duplicates"][0]["message"])
        
        # Build dynamic update query
        update_fields = []
        params = {"customer_id": customer_id, "org_id": str(org_id), "user_id": user_id}
        
        updatable_fields = [
            "customer_name", "customer_type", "primary_phone", "secondary_phone",
            "primary_email", "contact_person_name", "contact_person_phone",
            "address_line1", "address_line2", "area", "city", "state", "pincode",
            "gst_number", "pan_number", "drug_license_number", "drug_license_validity",
            "credit_limit", "credit_days", "credit_rating", "payment_terms",
            "discount_percent", "business_type", "is_active", "internal_notes"
        ]
        
        for field in updatable_fields:
            if field in data and data[field] is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = data[field]
        
        if not update_fields:
            return {"message": "No fields to update", "customer_id": customer_id}
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        update_fields.append("updated_by = :user_id")
        
        query = f"""
            UPDATE parties.customers 
            SET {', '.join(update_fields)}
            WHERE customer_id = :customer_id AND org_id = :org_id
        """
        
        db.execute(text(query), params)
        db.commit()
        
        logger.info(f"Updated customer {customer_id} for org {org_id}")
        
        return {
            "customer_id": customer_id,
            "message": "Customer updated successfully"
        }
    
    @staticmethod
    def validate_credit_limit(db: Session, customer_id: int, order_amount: Decimal, org_id: "UUID" = None) -> Dict[str, Any]:
        """Check if customer has sufficient credit limit"""
        # Get customer details with outstanding
        # For now, just get customer credit info without calculating outstanding
        # TODO: Fix when we know the actual sales.orders column names
        if org_id:
            result = db.execute(text("""
                SELECT 
                    c.credit_limit,
                    c.credit_days,
                    0 as outstanding
                FROM parties.customers c
                WHERE c.customer_id = :customer_id AND c.org_id = :org_id
            """), {"customer_id": customer_id, "org_id": org_id})
        else:
            result = db.execute(text("""
                SELECT 
                    c.credit_limit,
                    c.credit_days,
                    0 as outstanding
                FROM parties.customers c
                WHERE c.customer_id = :customer_id
            """), {"customer_id": customer_id})
        
        row = result.fetchone()
        if not row:
            return {"valid": False, "message": "Customer not found"}
        
        credit_limit = row.credit_limit
        outstanding = row.outstanding
        available_credit = credit_limit - outstanding
        
        if order_amount > available_credit:
            return {
                "valid": False,
                "message": f"Insufficient credit limit. Available: ₹{available_credit:.2f}",
                "credit_limit": credit_limit,
                "outstanding": outstanding,
                "available": available_credit
            }
        
        return {
            "valid": True,
            "credit_limit": credit_limit,
            "outstanding": outstanding,
            "available": available_credit
        }
    
    @staticmethod
    def get_customer_statistics(db: Session, customer_id: int) -> Dict[str, Any]:
        """Get customer business statistics"""
        # Total business
        business_result = db.execute(text("""
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(final_amount), 0) as total_business,
                MAX(order_date) as last_order_date
            FROM sales.orders
            WHERE customer_id = :customer_id
                AND order_status NOT IN ('cancelled', 'draft')
        """), {"customer_id": customer_id})
        
        business = business_result.fetchone()
        
        # Outstanding amount
        outstanding_result = db.execute(text("""
            SELECT COALESCE(SUM(final_amount), 0) as outstanding
            FROM sales.orders
            WHERE customer_id = :customer_id
                AND order_status NOT IN ('cancelled', 'draft')
                AND final_amount > 0
        """), {"customer_id": customer_id})
        
        outstanding = outstanding_result.scalar() or Decimal("0.00")
        
        return {
            "total_orders": business.total_orders or 0,
            "total_business": business.total_business or Decimal("0.00"),
            "last_order_date": business.last_order_date,
            "outstanding_amount": outstanding
        }
    
    @staticmethod
    def get_customers_statistics_batch(db: Session, customer_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """Get customer business statistics for multiple customers in one query"""
        if not customer_ids:
            return {}
        
        # Get all statistics in one query
        result = db.execute(text("""
            SELECT 
                c.customer_id,
                COUNT(DISTINCT o.order_id) as total_orders,
                COALESCE(SUM(o.final_amount), 0) as total_business,
                MAX(o.order_date) as last_order_date,
                COALESCE(SUM(CASE 
                    WHEN o.order_status NOT IN ('cancelled', 'draft') 
                    AND final_amount > 0 
                    THEN o.final_amount 
                    ELSE 0 
                END), 0) as outstanding_amount
            FROM parties.customers c
            LEFT JOIN sales.orders o ON c.customer_id = o.customer_id 
                AND o.order_status NOT IN ('cancelled', 'draft')
            WHERE c.customer_id = ANY(:customer_ids)
            GROUP BY c.customer_id
        """), {"customer_ids": customer_ids})
        
        stats_by_customer = {}
        for row in result:
            stats_by_customer[row.customer_id] = {
                "total_orders": row.total_orders or 0,
                "total_business": row.total_business or Decimal("0.00"),
                "last_order_date": row.last_order_date,
                "outstanding_amount": row.outstanding_amount or Decimal("0.00")
            }
        
        # Fill in missing customers with default values
        for customer_id in customer_ids:
            if customer_id not in stats_by_customer:
                stats_by_customer[customer_id] = {
                    "total_orders": 0,
                    "total_business": Decimal("0.00"),
                    "last_order_date": None,
                    "outstanding_amount": Decimal("0.00")
                }
        
        return stats_by_customer
    
    @staticmethod
    def get_customer_ledger(
        db: Session, 
        customer_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> CustomerLedgerResponse:
        """Get customer ledger with all transactions"""
        # Set date range (use constant instead of hardcoded value)
        if not from_date:
            from_date = date.today() - timedelta(days=DEFAULT_LEDGER_DAYS)
        if not to_date:
            to_date = date.today()
        
        # Get customer details
        customer = db.execute(text("""
            SELECT customer_id, customer_name, org_id FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id}).fetchone()
        
        if not customer:
            raise ValueError(f"Customer {customer_id} not found")
        
        # Get org_id from customer
        org_id = customer.org_id

        # Get opening balance (before from_date)
        opening_result = db.execute(text("""
            SELECT
                COALESCE(SUM(CASE
                    WHEN t.type = 'invoice' THEN t.amount
                    WHEN t.type = 'payment' THEN -t.amount
                    WHEN t.type = 'credit_note' THEN -t.amount
                    WHEN t.type = 'debit_note' THEN t.amount
                END), 0) as opening_balance
            FROM (
                -- Invoices
                SELECT
                    'invoice' as type,
                    order_date as date,
                    final_amount as amount
                FROM sales.orders
                WHERE customer_id = :customer_id
                    AND org_id = :org_id
                    AND order_date < :from_date
                    AND order_status NOT IN ('cancelled', 'draft')

                UNION ALL

                -- Payments
                SELECT
                    'payment' as type,
                    payment_date as date,
                    payment_amount as amount
                FROM financial.payments
                WHERE party_type = 'customer' AND party_id = :customer_id
                    AND org_id = :org_id
                    AND payment_date < :from_date
            ) t
        """), {
            "customer_id": customer_id,
            "org_id": str(org_id),
            "from_date": from_date
        })
        
        opening_balance = opening_result.scalar() or Decimal("0.00")
        
        # Get transactions in date range
        transactions_result = db.execute(text("""
            SELECT * FROM (
                -- Invoices
                SELECT
                    'invoice' as transaction_type,
                    order_date as transaction_date,
                    order_number as reference_number,
                    'Sales Invoice' as description,
                    final_amount as debit_amount,
                    0 as credit_amount
                FROM sales.orders
                WHERE customer_id = :customer_id
                    AND org_id = :org_id
                    AND order_date BETWEEN :from_date AND :to_date
                    AND order_status NOT IN ('cancelled', 'draft')

                UNION ALL

                -- Payments
                SELECT
                    'payment' as transaction_type,
                    payment_date as transaction_date,
                    payment_reference as reference_number,
                    'Payment Received' as description,
                    0 as debit_amount,
                    payment_amount as credit_amount
                FROM financial.payments
                WHERE party_type = 'customer' AND party_id = :customer_id
                    AND org_id = :org_id
                    AND payment_date BETWEEN :from_date AND :to_date
            ) t
            ORDER BY transaction_date, transaction_type
        """), {
            "customer_id": customer_id,
            "org_id": str(org_id),
            "from_date": from_date,
            "to_date": to_date
        })
        
        # Build ledger entries with running balance
        entries = []
        running_balance = opening_balance
        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")
        
        for row in transactions_result:
            debit = Decimal(str(row.debit_amount))
            credit = Decimal(str(row.credit_amount))
            running_balance += debit - credit
            total_debit += debit
            total_credit += credit
            
            entries.append(CustomerLedgerEntry(
                transaction_date=row.transaction_date,
                transaction_type=row.transaction_type,
                reference_number=row.reference_number,
                description=row.description,
                debit_amount=debit,
                credit_amount=credit,
                running_balance=running_balance
            ))
        
        return CustomerLedgerResponse(
            customer_id=customer.customer_id,
            customer_name=customer.customer_name,
            opening_balance=opening_balance,
            total_debit=total_debit,
            total_credit=total_credit,
            closing_balance=running_balance,
            entries=entries
        )
    
    @staticmethod
    def get_outstanding_invoices(db: Session, customer_id: int) -> CustomerOutstandingResponse:
        """Get all outstanding invoices for a customer"""
        # Get customer details
        customer_result = db.execute(text("""
            SELECT
                customer_id,
                customer_name,
                credit_limit,
                credit_days,
                org_id
            FROM parties.customers
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        
        customer = customer_result.fetchone()
        if not customer:
            raise ValueError(f"Customer {customer_id} not found")

        org_id = customer.org_id

        # Get outstanding invoices
        invoices_result = db.execute(text("""
            SELECT
                order_id,
                order_number,
                order_date,
                final_amount as invoice_amount,
                paid_amount,
                final_amount as outstanding_amount,
                CURRENT_DATE - order_date as days_since_invoice
            FROM sales.orders
            WHERE customer_id = :customer_id
                AND org_id = :org_id
                AND order_status NOT IN ('cancelled', 'draft')
                AND final_amount > 0
            ORDER BY order_date
        """), {"customer_id": customer_id, "org_id": str(org_id)})
        
        invoices = []
        total_outstanding = Decimal("0.00")
        overdue_amount = Decimal("0.00")
        
        for row in invoices_result:
            days_overdue = max(0, row.days_since_invoice - customer.credit_days)
            outstanding = Decimal(str(row.outstanding_amount))
            
            invoices.append(OutstandingInvoice(
                order_id=row.order_id,
                order_number=row.order_number,
                order_date=row.order_date,
                invoice_amount=Decimal(str(row.invoice_amount)),
                paid_amount=Decimal("0"),
                outstanding_amount=outstanding,
                days_overdue=days_overdue
            ))
            
            total_outstanding += outstanding
            if days_overdue > 0:
                overdue_amount += outstanding
        
        return CustomerOutstandingResponse(
            customer_id=customer.customer_id,
            customer_name=customer.customer_name,
            credit_limit=Decimal(str(customer.credit_limit)),
            credit_days=customer.credit_days,
            total_outstanding=total_outstanding,
            available_credit=Decimal(str(customer.credit_limit)) - total_outstanding,
            overdue_amount=overdue_amount,
            invoices=invoices
        )
    
    @staticmethod
    def record_payment(db: Session, payment_data: PaymentRecord) -> PaymentResponse:
        """Record customer payment and allocate to invoices"""
        # Get customer org_id first using helper method
        org_id = CustomerService._get_customer_org_id(db, payment_data.customer_id)
        if not org_id:
            raise ValueError(f"Customer {payment_data.customer_id} not found")
        
        # Get customer name
        customer_name = db.execute(text(
            "SELECT customer_name FROM parties.customers WHERE customer_id = :id"
        ), {"id": payment_data.customer_id}).scalar()
        
        # Generate payment reference using DocumentNumberService if not provided
        if not payment_data.reference_number:
            payment_data.reference_number = DocumentNumberService.generate_number(
                db, "payment", str(org_id)
            )
        
        # Get defaults using helper methods (eliminates hardcoded values)
        branch_id = CustomerService._get_default_branch_id(db, org_id)
        user_id = CustomerService._get_default_user_id(db, org_id)
        payment_method_id = CustomerService._get_default_payment_method_id(
            db, org_id, payment_data.payment_mode
        )
        
        # Create payment record with resolved values (no subqueries)
        db.execute(text("""
            INSERT INTO financial.payments (
                org_id, branch_id, payment_type, party_type, party_id, party_name,
                payment_number, payment_date, payment_amount, 
                payment_method_id, reference_number, narration,
                payment_status, created_at, created_by
            ) VALUES (
                :org_id, :branch_id, 'receipt', 'customer', :customer_id, :customer_name,
                :reference, :payment_date, :amount,
                :payment_method_id, :reference, :notes,
                'cleared', CURRENT_TIMESTAMP, :user_id
            )
        """), {
            "org_id": str(org_id),
            "branch_id": branch_id,
            "customer_id": payment_data.customer_id,
            "customer_name": customer_name,
            "payment_date": payment_data.payment_date,
            "amount": payment_data.amount,
            "payment_method_id": payment_method_id,
            "reference": payment_data.reference_number,
            "notes": payment_data.notes,
            "user_id": user_id
        })
        
        # Get the created payment ID and org_id from financial.payments
        payment_result = db.execute(text("""
            SELECT payment_id, org_id FROM financial.payments
            WHERE payment_number = :ref
            ORDER BY created_at DESC LIMIT 1
        """), {"ref": payment_data.reference_number}).fetchone()

        payment_id = payment_result.payment_id
        org_id = payment_result.org_id
        
        # Check if specific allocations are provided
        has_allocations = hasattr(payment_data, 'allocate_to_invoices') and payment_data.allocate_to_invoices and len(payment_data.allocate_to_invoices) > 0
        
        if has_allocations:
            # Manual allocation to specific invoices
            remaining_amount = payment_data.amount
            
            for invoice_id in payment_data.allocate_to_invoices:
                if remaining_amount <= 0:
                    break
                    
                # Get invoice outstanding amount
                invoice_result = db.execute(text("""
                    SELECT outstanding_amount, document_number
                    FROM financial.customer_outstanding
                    WHERE document_type = 'INVOICE'
                    AND document_id = :invoice_id
                    AND org_id = :org_id
                """), {"invoice_id": invoice_id, "org_id": str(org_id)}).first()
                
                if invoice_result and invoice_result.outstanding_amount > 0:
                    # Allocate min of remaining payment or invoice outstanding
                    allocation_amount = min(remaining_amount, invoice_result.outstanding_amount)
                    
                    # Create allocation record (use pre-fetched user_id)
                    db.execute(text("""
                        INSERT INTO financial.payment_allocations (
                            payment_id, reference_type, reference_id, 
                            reference_number, allocated_amount, created_by
                        ) VALUES (
                            :payment_id, 'INVOICE', :invoice_id,
                            :invoice_number, :amount, :user_id
                        )
                    """), {
                        "payment_id": payment_id,
                        "invoice_id": invoice_id,
                        "invoice_number": invoice_result.document_number,
                        "amount": allocation_amount,
                        "user_id": user_id
                    })
                    
                    remaining_amount -= allocation_amount
        else:
            # Auto-allocate using FIFO (oldest invoices first)
            outstanding_invoices = db.execute(text("""
                SELECT document_id, document_number, outstanding_amount
                FROM financial.customer_outstanding
                WHERE customer_id = :customer_id
                AND org_id = :org_id
                AND document_type = 'INVOICE'
                AND status IN ('open', 'partial')
                AND outstanding_amount > 0
                ORDER BY document_date, document_id
            """), {"customer_id": payment_data.customer_id, "org_id": str(org_id)})
            
            remaining_amount = payment_data.amount
            
            for invoice in outstanding_invoices:
                if remaining_amount <= 0:
                    break
                    
                allocation_amount = min(remaining_amount, invoice.outstanding_amount)
                
                # Create allocation record (use pre-fetched user_id)
                db.execute(text("""
                    INSERT INTO financial.payment_allocations (
                        payment_id, reference_type, reference_id, 
                        reference_number, allocated_amount, created_by
                    ) VALUES (
                        :payment_id, 'INVOICE', :invoice_id,
                        :invoice_number, :amount, :user_id
                    )
                """), {
                    "payment_id": payment_id,
                    "invoice_id": invoice.document_id,
                    "invoice_number": invoice.document_number,
                    "amount": allocation_amount,
                    "user_id": user_id
                })
                
                remaining_amount -= allocation_amount
        
        # Update payment allocation status based on what was allocated
        total_allocated = payment_data.amount - remaining_amount if has_allocations else Decimal("0.00")
        
        if not has_allocations:
            # We already have FIFO allocation logic above, so we just need to calculate what was allocated
            total_allocated = payment_data.amount - remaining_amount
        
        # Update payment with final allocation status
        if total_allocated > 0:
            db.execute(text("""
                UPDATE financial.payments
                SET allocation_status = CASE
                    WHEN :allocated >= payment_amount THEN 'allocated'
                    WHEN :allocated > 0 THEN 'partial'
                    ELSE 'unallocated'
                END,
                allocated_amount = :allocated
                WHERE payment_id = :payment_id
                AND org_id = :org_id
            """), {
                "allocated": total_allocated,
                "payment_id": payment_id,
                "org_id": str(org_id)
            })
        
        allocated_amount = total_allocated
        remaining_amount = payment_data.amount - total_allocated
        
        db.commit()
        
        return PaymentResponse(
            payment_id=payment_id,
            customer_id=payment_data.customer_id,
            payment_date=payment_data.payment_date,
            amount=payment_data.amount,
            payment_mode=payment_data.payment_mode,
            reference_number=payment_data.reference_number,
            allocated_amount=allocated_amount,
            unallocated_amount=remaining_amount,
            created_at=datetime.now()
        )
    
    @staticmethod
    def get_or_create_address(
        db: Session,
        org_id: str,
        customer_id: int,
        address_text: str,
        address_type: str
    ) -> Optional[int]:
        """
        Get existing address or create new one for a customer.
        Returns address_id or None if address_text is empty.
        """
        if not address_text:
            return None
        
        try:
            # First check if similar address exists for this customer
            existing = db.execute(text("""
                SELECT address_id FROM master.addresses
                WHERE entity_type = 'customer'
                AND entity_id = :customer_id
                AND address_type = :address_type
                AND is_active = true
                LIMIT 1
            """), {
                "customer_id": customer_id,
                "address_type": address_type
            }).fetchone()
            
            if existing:
                return existing[0]
            
            # Parse address text (simple parsing - could be enhanced)
            # Expected format: "Line1, Line2, City, State, Pincode"
            parts = [p.strip() for p in address_text.split(',')]
            
            # Create new address
            result = db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_name, pincode,
                    country, is_default, is_active,
                    created_at, updated_at
                ) VALUES (
                    :org_id, 'customer', :customer_id, :address_type,
                    :line1, :line2, :city, :state, :pincode,
                    'India', false, true,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING address_id
            """), {
                "org_id": org_id,
                "customer_id": customer_id,
                "address_type": address_type,
                "line1": parts[0] if len(parts) > 0 else address_text,
                "line2": parts[1] if len(parts) > 1 else None,
                "city": parts[-3] if len(parts) >= 3 else None,
                "state": parts[-2] if len(parts) >= 2 else None,
                "pincode": parts[-1] if len(parts) >= 1 and parts[-1].isdigit() else None
            })
            
            return result.scalar()
            
        except Exception as e:
            logger.warning(f"Could not create address: {str(e)}")
            return None
    
    # ==================== SYNC & LIST METHODS ====================
    
    @staticmethod
    def count_customers(
        db: Session,
        org_id: str,
        include_inactive: bool = False,
        since: Optional[str] = None
    ) -> int:
        """
        Count customers with optional filters.
        """
        where_clauses = ["c.org_id = :org_id"]
        params = {"org_id": org_id}
        
        if not include_inactive:
            where_clauses.append("c.is_active = true")
        
        if since:
            where_clauses.append("c.updated_at > :since")
            params["since"] = since
        
        where_sql = " AND ".join(where_clauses)
        query = f"SELECT COUNT(*) FROM parties.customers c WHERE {where_sql}"
        
        result = db.execute(text(query), params)
        return result.scalar() or 0
    
    @staticmethod
    def get_customers_page(
        db: Session,
        org_id: str,
        limit: int = 100,
        offset: int = 0,
        include_inactive: bool = False,
        since: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get paginated customers for bulk sync.
        """
        where_clauses = ["c.org_id = :org_id"]
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
        if not include_inactive:
            where_clauses.append("c.is_active = true")
        
        if since:
            where_clauses.append("c.updated_at > :since")
            params["since"] = since
        
        where_sql = " AND ".join(where_clauses)
        query = f"""
            SELECT 
                c.customer_id, c.customer_code, c.customer_name, c.customer_type,
                c.primary_phone, c.primary_email, c.secondary_phone, c.whatsapp_number,
                c.gst_number, c.pan_number, c.drug_license_number, c.drug_license_validity,
                c.credit_limit, c.credit_days, c.current_outstanding,
                c.contact_person_name, c.contact_person_phone, c.contact_person_email,
                c.business_type, c.customer_category, c.customer_grade,
                c.is_active, c.created_at, c.updated_at
            FROM parties.customers c
            WHERE {where_sql}
            ORDER BY c.customer_name
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_addresses_for_customers(
        db: Session,
        org_id: str,
        customer_ids: List[int]
    ) -> List[Dict[str, Any]]:
        """
        Get all addresses for a list of customer IDs.
        """
        if not customer_ids:
            return []
        
        query = """
            SELECT 
                a.address_id, a.entity_id as customer_id, a.address_type,
                a.address_line1, a.address_line2, a.landmark,
                a.city, a.state_code, a.state_name, a.country, a.pincode,
                a.contact_person, a.contact_number, a.contact_email,
                a.is_default, a.is_active
            FROM master.addresses a
            WHERE a.org_id = :org_id
              AND a.entity_type = 'customer'
              AND a.entity_id = ANY(:customer_ids)
              AND a.is_active = true
            ORDER BY a.is_default DESC, a.address_type
        """
        
        result = db.execute(text(query), {"org_id": org_id, "customer_ids": customer_ids})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def list_customers(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        customer_type: Optional[str] = None,
        is_active: Optional[bool] = None,
        has_gstin: Optional[bool] = None,
        fast_search: bool = True
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List customers with filters and pagination.
        TenantAwareSession auto-filters by org_id.
        
        Returns:
            Tuple of (customers list, total count)
        """
        # Build base query
        if fast_search:
            select_cols = """customer_id, customer_name, customer_code, primary_phone, primary_email,
                          customer_type, business_type, gst_number, credit_limit, credit_days,
                          is_active, org_id, created_at, updated_at"""
        else:
            select_cols = "*"
        
        query = f"SELECT {select_cols} FROM parties.customers"
        count_query = "SELECT COUNT(*) FROM parties.customers"
        
        where_conditions = []
        params = {}
        
        if search:
            where_conditions.append("""(
                customer_name ILIKE :search OR 
                customer_code ILIKE :search OR 
                primary_phone LIKE :search OR
                gst_number LIKE :search
            )""")
            params["search"] = f"%{search}%"
        
        if customer_type:
            where_conditions.append("customer_type = :customer_type")
            params["customer_type"] = customer_type
        
        if is_active is not None:
            where_conditions.append("is_active = :is_active")
            params["is_active"] = is_active
        
        if has_gstin is not None:
            if has_gstin:
                where_conditions.append("gst_number IS NOT NULL")
            else:
                where_conditions.append("gst_number IS NULL")
        
        if where_conditions:
            where_clause = " WHERE " + " AND ".join(where_conditions)
            query += where_clause
            count_query += where_clause
        
        # Get count
        total = db.execute(text(count_query), params).scalar() or 0
        
        # Get customers
        query += " ORDER BY customer_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        customers = [dict(row._mapping) for row in result]
        
        return customers, total
    
    @staticmethod
    def get_customer_with_addresses(
        db: Session,
        customer_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get customer with embedded addresses JSON.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT c.*,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'address_id', a.address_id,
                               'address_type', a.address_type,
                               'address_line1', a.address_line1,
                               'address_line2', a.address_line2,
                               'landmark', a.landmark,
                               'city', a.city,
                               'state_code', a.state_code,
                               'state_name', a.state_name,
                               'country', a.country,
                               'pincode', a.pincode,
                               'contact_person', a.contact_person,
                               'contact_number', a.contact_number,
                               'is_default', a.is_default,
                               'is_active', a.is_active
                           ) ORDER BY a.is_default DESC, a.address_type
                       ) FILTER (WHERE a.address_id IS NOT NULL),
                       '[]'::json
                   ) as addresses
            FROM parties.customers c
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'customer' 
                AND a.entity_id = c.customer_id 
                AND a.org_id = c.org_id
                AND a.is_active = true
            )
            WHERE c.customer_id = :id
            GROUP BY c.customer_id
        """), {"id": customer_id}).fetchone()
        
        return dict(result._mapping) if result else None
    
    @staticmethod
    def insert_customer(
        db: Session,
        org_id: str,
        customer_data: Dict[str, Any]
    ) -> int:
        """
        Insert a new customer record. Returns customer_id.
        """
        result = db.execute(text("""
            INSERT INTO parties.customers (
                org_id, customer_code, customer_name, customer_type, business_type,
                primary_phone, primary_email, secondary_phone, whatsapp_number,
                contact_person_name, contact_person_phone, contact_person_email,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                credit_limit, credit_days, credit_rating, payment_terms,
                internal_notes, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, :customer_code, :customer_name, :customer_type, :business_type,
                :primary_phone, :primary_email, :secondary_phone, :whatsapp_number,
                :contact_person_name, :contact_person_phone, :contact_person_email,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :credit_limit, :credit_days, :credit_rating, :payment_terms,
                :internal_notes, :is_active,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING customer_id
        """), {
            "org_id": org_id,
            "customer_code": customer_data.get("customer_code", ""),
            "customer_name": customer_data.get("customer_name", ""),
            "customer_type": customer_data.get("customer_type", "retail"),
            "business_type": customer_data.get("business_type", "retail_pharmacy"),
            "primary_phone": customer_data.get("primary_phone"),
            "primary_email": customer_data.get("primary_email"),
            "secondary_phone": customer_data.get("secondary_phone"),
            "whatsapp_number": customer_data.get("whatsapp_number"),
            "contact_person_name": customer_data.get("contact_person_name"),
            "contact_person_phone": customer_data.get("contact_person_phone"),
            "contact_person_email": customer_data.get("contact_person_email"),
            "gst_number": customer_data.get("gst_number"),
            "pan_number": customer_data.get("pan_number"),
            "drug_license_number": customer_data.get("drug_license_number"),
            "drug_license_validity": customer_data.get("drug_license_validity"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "credit_rating": customer_data.get("credit_rating", "NEW"),
            "payment_terms": customer_data.get("payment_terms", "CASH"),
            "internal_notes": customer_data.get("internal_notes"),
            "is_active": customer_data.get("is_active", True)
        })
        
        return result.scalar()
    
    @staticmethod
    def insert_address(
        db: Session,
        org_id: str,
        customer_id: int,
        address_data: Dict[str, Any]
    ) -> int:
        """
        Insert a new address for a customer. Returns address_id.
        """
        result = db.execute(text("""
            INSERT INTO master.addresses (
                org_id, entity_type, entity_id, address_type,
                address_line1, address_line2, city, state_code, state_name,
                pincode, country, is_default, created_at, updated_at
            ) VALUES (
                :org_id, 'customer', :customer_id, :address_type,
                :address_line1, :address_line2, :city, :state_code, :state_name,
                :pincode, :country, :is_default, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING address_id
        """), {
            "org_id": org_id,
            "customer_id": customer_id,
            "address_type": address_data.get("address_type", "billing"),
            "address_line1": address_data.get("address_line1", ""),
            "address_line2": address_data.get("address_line2", ""),
            "city": address_data.get("city", ""),
            "state_code": address_data.get("state_code", ""),
            "state_name": address_data.get("state_name", ""),
            "pincode": address_data.get("pincode", ""),
            "country": address_data.get("country", "India"),
            "is_default": address_data.get("is_default", True)
        })
        
        return result.scalar()
    
    @staticmethod
    def get_customer_addresses(
        db: Session,
        customer_id: int
    ) -> List[Dict[str, Any]]:
        """
        Get all addresses for a customer.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 
                address_id, entity_type, entity_id, address_type,
                address_line1, address_line2, landmark, city, 
                state_code, state_name, country, pincode,
                latitude, longitude, contact_person, contact_number,
                is_default, is_active, created_at, updated_at
            FROM master.addresses 
            WHERE entity_type = 'customer' 
            AND entity_id = :customer_id 
            AND is_active = true
            ORDER BY is_default DESC, address_type ASC, created_at DESC
        """), {"customer_id": customer_id})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_deletion_status(
        db: Session,
        customer_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Check if customer can be deleted (exists, is active, has no outstanding).
        """
        result = db.execute(text("""
            WITH customer_check AS (
                SELECT 
                    c.customer_id, 
                    c.customer_name, 
                    c.is_active,
                    COALESCE(
                        (SELECT SUM(final_amount - COALESCE(paid_amount, 0))
                         FROM sales.invoices i
                         WHERE i.customer_id = c.customer_id 
                         AND i.payment_status != 'paid'),
                        0
                    ) as outstanding_balance
                FROM parties.customers c
                WHERE c.customer_id = :customer_id
            )
            SELECT customer_id, customer_name, is_active, outstanding_balance 
            FROM customer_check
        """), {"customer_id": customer_id}).fetchone()
        
        return dict(result._mapping) if result else None
    
    @staticmethod
    def soft_delete(
        db: Session,
        customer_id: int
    ) -> None:
        """
        Soft delete a customer by marking as inactive.
        """
        db.execute(text("""
            UPDATE parties.customers
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
    
    @staticmethod
    def customer_exists(
        db: Session,
        customer_id: int
    ) -> bool:
        """
        Check if a customer exists.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 1 FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id}).scalar()
        return result is not None
    
    @staticmethod
    def update_customer_dynamic(
        db: Session,
        customer_id: int,
        update_fields: List[str],
        params: Dict[str, Any]
    ) -> None:
        """
        Update customer with dynamic field list.
        TenantAwareSession auto-filters by org_id.
        """
        if not update_fields:
            return
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        query = f"""
            UPDATE parties.customers 
            SET {', '.join(update_fields)}
            WHERE customer_id = :id
        """
        
        db.execute(text(query), params)