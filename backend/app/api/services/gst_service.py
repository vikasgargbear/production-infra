"""
Unified GST Calculation Service
Handles all GST-related calculations consistently across the entire application

This service ensures:
1. GST type (CGST/SGST vs IGST) is determined automatically based on locations
2. Tax rates are fetched from product master, not hardcoded
3. Calculations are consistent across all modules (sales, purchase, returns)
4. GST compliance for GSTR filing
"""
from decimal import Decimal
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class GSTService:
    """Unified service for GST calculations and compliance"""

    @staticmethod
    def determine_gst_type(
        db: Session,
        org_id: UUID,
        customer_id: Optional[int] = None,
        supplier_id: Optional[int] = None,
        delivery_address_id: Optional[int] = None,
        billing_address_id: Optional[int] = None
    ) -> str:
        """
        Automatically determine GST type based on company and party locations

        GST Rules:
        - Same state: Intra-state - CGST/SGST (each 50% of rate)
        - Different state: Inter-state - IGST (full rate)
        - SEZ/Export: Special handling (future enhancement)

        Args:
            db: Database session
            org_id: Organization ID
            customer_id: Customer ID (for sales)
            supplier_id: Supplier ID (for purchases)
            delivery_address_id: Delivery address (preferred for accuracy)
            billing_address_id: Billing address (fallback)

        Returns:
            str: "CGST/SGST" or "IGST"
        """
        try:
            # Get company/organization state
            company_state = db.execute(text("""
                SELECT state
                FROM master.org_branches
                WHERE org_id = :org_id AND is_default = true
                LIMIT 1
            """), {"org_id": org_id}).scalar()

            # If no company state found, try organization settings
            if not company_state:
                company_state = db.execute(text("""
                    SELECT state_name
                    FROM master.organizations
                    WHERE org_id = :org_id
                    LIMIT 1
                """), {"org_id": org_id}).scalar()

            if not company_state:
                logger.warning(f"Company state not found for org_id={org_id}, defaulting to CGST/SGST")
                return "CGST/SGST"

            # Get party state (customer or supplier)
            party_state = None

            # Try delivery address first (most accurate for GST)
            if delivery_address_id:
                party_state = db.execute(text("""
                    SELECT state_name
                    FROM master.addresses
                    WHERE address_id = :address_id AND is_active = true
                """), {"address_id": delivery_address_id}).scalar()

            # Fallback to billing address
            if not party_state and billing_address_id:
                party_state = db.execute(text("""
                    SELECT state_name
                    FROM master.addresses
                    WHERE address_id = :address_id AND is_active = true
                """), {"address_id": billing_address_id}).scalar()

            # Fallback to customer's default address
            if not party_state and customer_id:
                party_state = db.execute(text("""
                    SELECT state_name
                    FROM master.addresses
                    WHERE entity_type = 'customer'
                      AND entity_id = :customer_id
                      AND is_active = true
                    ORDER BY is_default DESC, created_at DESC
                    LIMIT 1
                """), {"customer_id": customer_id}).scalar()

            # Fallback to supplier's default address
            if not party_state and supplier_id:
                party_state = db.execute(text("""
                    SELECT state_name
                    FROM master.addresses
                    WHERE entity_type = 'supplier'
                      AND entity_id = :supplier_id
                      AND is_active = true
                    ORDER BY is_default DESC, created_at DESC
                    LIMIT 1
                """), {"supplier_id": supplier_id}).scalar()

            if not party_state:
                logger.warning("Party state not found, defaulting to CGST/SGST")
                return "CGST/SGST"

            # Compare states (case-insensitive)
            company_state_clean = company_state.strip().upper()
            party_state_clean = party_state.strip().upper()

            if company_state_clean == party_state_clean:
                logger.debug(f"Intra-state: {company_state} - CGST/SGST")
                return "CGST/SGST"
            else:
                logger.debug(f"Inter-state: {company_state} - {party_state} - IGST")
                return "IGST"

        except Exception as e:
            logger.error(f"Error determining GST type: {e}")
            # Safe fallback
            return "CGST/SGST"

    @staticmethod
    def get_product_gst_rate(
        db: Session,
        product_id: int,
        org_id: UUID
    ) -> Optional[Decimal]:
        """
        Get GST rate for a product from product master

        Args:
            db: Database session
            product_id: Product ID
            org_id: Organization ID (for security)

        Returns:
            Decimal: GST rate (e.g., 18.00 for 18%) or None if not found
        """
        try:
            rate = db.execute(text("""
                SELECT gst_rate
                FROM inventory.products
                WHERE product_id = :product_id AND org_id = :org_id
            """), {"product_id": product_id, "org_id": org_id}).scalar()

            if rate is not None:
                return Decimal(str(rate))
            return None

        except Exception as e:
            logger.error(f"Error fetching GST rate for product {product_id}: {e}")
            return None

    @staticmethod
    def calculate_gst_components(
        taxable_amount: Decimal,
        gst_rate: Decimal,
        gst_type: str
    ) -> Dict[str, Decimal]:
        """
        Calculate CGST, SGST, and IGST amounts based on GST type

        Args:
            taxable_amount: Amount on which GST is calculated (after discounts)
            gst_rate: GST percentage (e.g., 18 for 18%)
            gst_type: "CGST/SGST" or "IGST"

        Returns:
            Dict with keys: igst_percent, igst_amount, cgst_percent, cgst_amount,
                           sgst_percent, sgst_amount, total_tax_amount
        """
        try:
            # Ensure Decimal types
            taxable_amount = Decimal(str(taxable_amount))
            gst_rate = Decimal(str(gst_rate))

            if gst_type == "IGST":
                # Inter-state: Full GST as IGST
                igst_amount = (taxable_amount * gst_rate) / 100
                return {
                    "igst_percent": gst_rate,
                    "igst_amount": igst_amount.quantize(Decimal("0.01")),
                    "cgst_percent": Decimal("0"),
                    "cgst_amount": Decimal("0"),
                    "sgst_percent": Decimal("0"),
                    "sgst_amount": Decimal("0"),
                    "total_tax_amount": igst_amount.quantize(Decimal("0.01"))
                }
            else:
                # Intra-state: Split between CGST and SGST
                half_rate = gst_rate / 2
                cgst_amount = (taxable_amount * half_rate) / 100
                sgst_amount = (taxable_amount * half_rate) / 100
                total_tax = cgst_amount + sgst_amount

                return {
                    "igst_percent": Decimal("0"),
                    "igst_amount": Decimal("0"),
                    "cgst_percent": half_rate,
                    "cgst_amount": cgst_amount.quantize(Decimal("0.01")),
                    "sgst_percent": half_rate,
                    "sgst_amount": sgst_amount.quantize(Decimal("0.01")),
                    "total_tax_amount": total_tax.quantize(Decimal("0.01"))
                }

        except Exception as e:
            logger.error(f"Error calculating GST components: {e}")
            # Return zeros on error
            return {
                "igst_percent": Decimal("0"),
                "igst_amount": Decimal("0"),
                "cgst_percent": Decimal("0"),
                "cgst_amount": Decimal("0"),
                "sgst_percent": Decimal("0"),
                "sgst_amount": Decimal("0"),
                "total_tax_amount": Decimal("0")
            }

    @staticmethod
    def calculate_line_item_totals(
        quantity: Decimal,
        unit_price: Decimal,
        discount_percent: Decimal,
        gst_rate: Decimal,
        gst_type: str,
        free_quantity: Decimal = Decimal("0")
    ) -> Dict[str, Decimal]:
        """
        Complete calculation for a line item (one product in invoice/order)

        Calculation flow:
        1. Gross amount = base_quantity * unit_price
        2. Discount amount = gross_amount * discount_percent / 100
        3. Taxable amount = gross_amount - discount_amount
        4. Tax components = based on gst_type (CGST/SGST or IGST)
        5. Line total = taxable_amount + tax_amount

        Args:
            quantity: Total quantity (base + free)
            unit_price: Price per unit
            discount_percent: Discount percentage
            gst_rate: GST percentage
            gst_type: "CGST/SGST" or "IGST"
            free_quantity: Free quantity (not billed)

        Returns:
            Dict with all calculated values
        """
        try:
            # Convert to Decimal for precision
            quantity = Decimal(str(quantity))
            unit_price = Decimal(str(unit_price))
            discount_percent = Decimal(str(discount_percent))
            gst_rate = Decimal(str(gst_rate))
            free_quantity = Decimal(str(free_quantity))

            # Base quantity (what customer pays for)
            base_quantity = quantity - free_quantity

            # Step 1: Gross amount (before discount)
            gross_amount = base_quantity * unit_price

            # Step 2: Discount
            discount_amount = (gross_amount * discount_percent) / 100

            # Step 3: Taxable amount (after discount, before tax)
            taxable_amount = gross_amount - discount_amount

            # Step 4: Tax components
            gst_components = GSTService.calculate_gst_components(
                taxable_amount, gst_rate, gst_type
            )

            # Step 5: Line total
            line_total = taxable_amount + gst_components["total_tax_amount"]

            # Return complete breakdown
            return {
                "quantity": quantity,
                "base_quantity": base_quantity,
                "free_quantity": free_quantity,
                "unit_price": unit_price,
                "gross_amount": gross_amount.quantize(Decimal("0.01")),
                "discount_percent": discount_percent,
                "discount_amount": discount_amount.quantize(Decimal("0.01")),
                "taxable_amount": taxable_amount.quantize(Decimal("0.01")),
                **gst_components,
                "line_total": line_total.quantize(Decimal("0.01"))
            }

        except Exception as e:
            logger.error(f"Error calculating line item totals: {e}")
            raise ValueError(f"Line item calculation failed: {e}")

    @staticmethod
    def validate_gst_number(gst_number: str) -> Tuple[bool, Optional[str]]:
        """
        Validate GST number format

        Format: 2 digits (state) + 10 digits (PAN) + 1 digit (entity) + 1 letter (Z) + 1 check digit
        Example: 27AAPFU0939F1ZV

        Returns:
            Tuple[bool, Optional[str]]: (is_valid, error_message)
        """
        if not gst_number:
            return False, "GST number is required"

        gst_number = gst_number.strip().upper()

        if len(gst_number) != 15:
            return False, "GST number must be 15 characters"

        # Check format (basic validation)
        if not gst_number[:2].isdigit():
            return False, "First 2 characters must be state code (digits)"

        if not gst_number[2:12].isalnum():
            return False, "PAN portion (characters 3-12) must be alphanumeric"

        if not gst_number[13] == 'Z':
            return False, "14th character must be 'Z'"

        return True, None


# Convenience functions for backward compatibility
def get_gst_type(db: Session, org_id: UUID, customer_id: int = None,
                 delivery_address_id: int = None) -> str:
    """Shorthand for determine_gst_type"""
    return GSTService.determine_gst_type(
        db, org_id, customer_id=customer_id,
        delivery_address_id=delivery_address_id
    )


def calculate_gst(taxable_amount: Decimal, rate: Decimal, gst_type: str) -> Dict:
    """Shorthand for calculate_gst_components"""
    return GSTService.calculate_gst_components(taxable_amount, rate, gst_type)
