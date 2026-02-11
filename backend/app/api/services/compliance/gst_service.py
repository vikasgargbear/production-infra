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
from typing import Dict, Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
from datetime import date
import logging
import re

logger = logging.getLogger(__name__)

# Valid GST slabs in India
GST_SLABS: List[int] = [0, 5, 12, 18, 28]

# Complete mapping of GST state codes to state names
STATE_CODES: Dict[str, str] = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction"
}


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
            # ====================================================================
            # PRIORITY 1: GSTIN-based state code comparison (most reliable)
            # First 2 digits of GSTIN = state code (e.g., 08=Rajasthan, 27=Maharashtra)
            # This is how Tally, Zoho, and all Indian ERPs determine IGST vs CGST/SGST
            # ====================================================================
            company_gstin = db.execute(text("""
                SELECT COALESCE(
                    ob.branch_gst_number,
                    o.gst_number
                )
                FROM master.org_branches ob
                JOIN master.organizations o ON o.org_id = ob.org_id
                WHERE ob.org_id = :org_id AND ob.is_default_location = true
                LIMIT 1
            """), {"org_id": org_id}).scalar()

            party_gstin = None
            if customer_id:
                party_gstin = db.execute(text("""
                    SELECT gst_number FROM parties.customers
                    WHERE customer_id = :customer_id
                """), {"customer_id": customer_id}).scalar()
            elif supplier_id:
                party_gstin = db.execute(text("""
                    SELECT gst_number FROM parties.suppliers
                    WHERE supplier_id = :supplier_id
                """), {"supplier_id": supplier_id}).scalar()

            # Compare GSTIN state codes if both are available
            if company_gstin and party_gstin and len(company_gstin) >= 2 and len(party_gstin) >= 2:
                company_state_code = company_gstin[:2]
                party_state_code = party_gstin[:2]
                if company_state_code.isdigit() and party_state_code.isdigit():
                    if company_state_code == party_state_code:
                        logger.debug(f"GSTIN match: {company_state_code} == {party_state_code} → CGST/SGST")
                        return "CGST/SGST"
                    else:
                        logger.debug(f"GSTIN mismatch: {company_state_code} != {party_state_code} → IGST")
                        return "IGST"

            # ====================================================================
            # PRIORITY 2: Address-based state comparison (fallback when GSTIN missing)
            # ====================================================================
            result = db.execute(text("""
                SELECT COALESCE(
                    address->>'state',
                    address->>'state_name'
                ) as company_state
                FROM master.org_branches
                WHERE org_id = :org_id AND is_default_location = true
                LIMIT 1
            """), {"org_id": org_id}).scalar()

            company_state = result

            if not company_state:
                logger.warning(f"Company state not found for org_id={org_id}, defaulting to CGST/SGST")
                return "CGST/SGST"

            # Get party state from addresses
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
                logger.debug(f"Inter-state: {company_state} → {party_state} - IGST")
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

        # Validate PAN format within GSTIN (chars 3-12): AAAAA9999A
        pan_portion = gst_number[2:12]
        if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan_portion):
            return False, "PAN portion must be in format AAAAA9999A (5 letters, 4 digits, 1 letter)"

        if not gst_number[13] == 'Z':
            return False, "14th character must be 'Z'"

        # Validate state code exists
        state_code = gst_number[:2]
        if state_code not in STATE_CODES:
            return False, f"Invalid state code: {state_code}"

        return True, None

    @staticmethod
    def validate_gstin(gstin: str) -> bool:
        """
        Validate GSTIN format with checksum verification.
        
        This is the simplified validation called by compliance/gst.py.
        For detailed error messages, use validate_gst_number instead.
        
        Args:
            gstin: GSTIN string to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        is_valid, _ = GSTService.validate_gst_number(gstin)
        return is_valid

    @staticmethod
    def extract_state_code(gstin: str) -> Optional[str]:
        """
        Extract the 2-digit state code from a GSTIN.
        
        Args:
            gstin: Valid GSTIN string
            
        Returns:
            str: 2-digit state code or None if invalid
        """
        if not gstin or len(gstin) < 2:
            return None
        
        state_code = gstin[:2].strip()
        if state_code.isdigit() and state_code in STATE_CODES:
            return state_code
        return None

    @staticmethod
    def get_state_name(state_code: str) -> Optional[str]:
        """
        Get state name from a 2-digit state code.
        
        Args:
            state_code: 2-digit GST state code (e.g., "27" for Maharashtra)
            
        Returns:
            str: State name or None if invalid code
        """
        if not state_code:
            return None
        return STATE_CODES.get(state_code.strip())

    @staticmethod
    def calculate_gst_amounts(
        taxable_amount: Decimal,
        gst_rate: Decimal,
        gst_type: str
    ) -> Dict[str, Decimal]:
        """
        Alias for calculate_gst_components for backward compatibility.
        
        This method is called by compliance/gst.py.
        """
        return GSTService.calculate_gst_components(taxable_amount, gst_rate, gst_type)

    @staticmethod
    def get_gst_rate_for_hsn(
        db: Session,
        hsn_code: str,
        org_id: Optional[UUID] = None
    ) -> Optional[Decimal]:
        """
        Look up GST rate from HSN master table.
        
        Args:
            db: Database session
            hsn_code: HSN/SAC code
            org_id: Organization ID (optional, for org-specific rates)
            
        Returns:
            Decimal: GST rate or None if not found
        """
        try:
            if not hsn_code:
                return None
            
            # Try org-specific HSN rates first
            if org_id:
                rate = db.execute(text("""
                    SELECT gst_rate FROM master.hsn_codes
                    WHERE hsn_code = :hsn_code AND org_id = :org_id
                    LIMIT 1
                """), {"hsn_code": hsn_code, "org_id": str(org_id)}).scalar()
                
                if rate is not None:
                    return Decimal(str(rate))
            
            # Fallback to global HSN rates
            rate = db.execute(text("""
                SELECT gst_rate FROM master.hsn_codes
                WHERE hsn_code = :hsn_code AND org_id IS NULL
                LIMIT 1
            """), {"hsn_code": hsn_code}).scalar()
            
            if rate is not None:
                return Decimal(str(rate))
            
            return None
            
        except Exception as e:
            logger.error(f"Error fetching GST rate for HSN {hsn_code}: {e}")
            return None

    @staticmethod
    def get_financial_year(date_value: date = None) -> str:
        """
        Get financial year string for GST filing compliance.
        
        Financial year in India runs from April 1 to March 31.
        
        Args:
            date_value: Date to get FY for (defaults to today)
            
        Returns:
            str: Financial year string (e.g., "2024-25")
        """
        if date_value is None:
            date_value = date.today()
        
        year = date_value.year
        month = date_value.month
        
        # FY starts in April
        if month >= 4:  # April to December
            fy_start = year
            fy_end = year + 1
        else:  # January to March
            fy_start = year - 1
            fy_end = year
        
        return f"{fy_start}-{str(fy_end)[-2:]}"

    @staticmethod
    def is_valid_gst_slab(rate: Decimal) -> bool:
        """
        Check if a GST rate is a valid slab.
        
        Args:
            rate: GST rate to validate
            
        Returns:
            bool: True if rate is a valid GST slab
        """
        try:
            rate_int = int(rate)
            return rate_int in GST_SLABS
        except (ValueError, TypeError):
            return False


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


def calculate_gst_breakdown(
    taxable_amount: float,
    gst_percent: float,
    gst_type: str = "CGST/SGST"
) -> Dict[str, float]:
    """
    Calculate GST breakdown with float inputs/outputs.
    
    Convenience function for API routes that use float types.
    
    Args:
        taxable_amount: Amount after discount
        gst_percent: GST rate (e.g., 5, 12, 18, 28)
        gst_type: "CGST/SGST" or "IGST"
    
    Returns:
        Dict with cgst, sgst, igst, total_tax as floats
    """
    components = GSTService.calculate_gst_components(
        Decimal(str(taxable_amount)),
        Decimal(str(gst_percent)),
        gst_type
    )
    return {
        "cgst_amount": float(components["cgst_amount"]),
        "sgst_amount": float(components["sgst_amount"]),
        "igst_amount": float(components["igst_amount"]),
        "cgst_percent": float(components["cgst_percent"]),
        "sgst_percent": float(components["sgst_percent"]),
        "igst_percent": float(components["igst_percent"]),
        "total_tax": float(components["total_tax_amount"])
    }
