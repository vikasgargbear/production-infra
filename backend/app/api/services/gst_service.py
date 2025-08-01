"""
GST Service Module
Handles GST calculations based on Indian tax laws
Follows industry-standard logic from Marg ERP, Vyapar, Tally
"""
from typing import Dict, Optional, Tuple
from decimal import Decimal
from enum import Enum
import re
import logging

logger = logging.getLogger(__name__)


class GSTType(str, Enum):
    """GST tax types"""
    CGST_SGST = "cgst_sgst"  # Intra-state
    IGST = "igst"  # Inter-state
    EXEMPT = "exempt"  # Export/SEZ


class GSTService:
    """
    Centralized GST calculation service
    Used across sales, purchases, returns, and all tax calculations
    """
    
    # Indian state codes as per GST
    STATE_CODES = {
        "01": "Jammu and Kashmir",
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
        "25": "Daman and Diu",
        "26": "Dadra and Nagar Haveli",
        "27": "Maharashtra",
        "28": "Andhra Pradesh",
        "29": "Karnataka",
        "30": "Goa",
        "31": "Lakshadweep",
        "32": "Kerala",
        "33": "Tamil Nadu",
        "34": "Puducherry",
        "35": "Andaman and Nicobar Islands",
        "36": "Telangana",
        "37": "Andhra Pradesh (New)",
        "38": "Ladakh"
    }
    
    @staticmethod
    def validate_gstin(gstin: str) -> bool:
        """
        Validate GSTIN format
        Format: 2 digits state code + 10 char PAN + 1 digit entity + 1 char Z + 1 check digit
        """
        if not gstin:
            return False
            
        # Remove any spaces and convert to uppercase
        gstin = gstin.strip().upper()
        
        # Check length
        if len(gstin) != 15:
            return False
            
        # Check pattern
        pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
        if not re.match(pattern, gstin):
            return False
            
        # Check if state code is valid
        state_code = gstin[:2]
        if state_code not in GSTService.STATE_CODES:
            return False
            
        return True
    
    @staticmethod
    def extract_state_code(gstin: str) -> Optional[str]:
        """
        Extract state code from GSTIN (first 2 digits)
        Returns None if GSTIN is invalid
        """
        if not gstin:
            return None
            
        gstin = gstin.strip().upper()
        
        if not GSTService.validate_gstin(gstin):
            logger.warning(f"Invalid GSTIN format: {gstin}")
            return None
            
        return gstin[:2]
    
    @staticmethod
    def get_state_name(state_code: str) -> Optional[str]:
        """Get state name from state code"""
        return GSTService.STATE_CODES.get(state_code)
    
    @staticmethod
    def determine_gst_type(
        seller_gstin: Optional[str],
        buyer_gstin: Optional[str],
        seller_state_code: Optional[str] = None,
        buyer_state_code: Optional[str] = None,
        is_export: bool = False,
        is_sez: bool = False
    ) -> GSTType:
        """
        Determine GST type based on seller and buyer location
        
        Logic:
        1. Export/SEZ = EXEMPT (0% with LUT)
        2. No buyer GSTIN = Intra-state B2C (CGST+SGST)
        3. Same state = CGST+SGST
        4. Different state = IGST
        
        Args:
            seller_gstin: Seller's GSTIN
            buyer_gstin: Buyer's GSTIN
            seller_state_code: Override seller state (for unregistered sellers)
            buyer_state_code: Override buyer state (for composition dealers)
            is_export: Is this an export transaction
            is_sez: Is buyer in SEZ
            
        Returns:
            GSTType enum value
        """
        # Export or SEZ transactions
        if is_export or is_sez:
            return GSTType.EXEMPT
            
        # Extract state codes from GSTIN
        if not seller_state_code and seller_gstin:
            seller_state_code = GSTService.extract_state_code(seller_gstin)
            
        if not buyer_state_code and buyer_gstin:
            buyer_state_code = GSTService.extract_state_code(buyer_gstin)
            
        # If buyer has no GSTIN (B2C), default to intra-state
        if not buyer_gstin and not buyer_state_code:
            logger.info("No buyer GSTIN - defaulting to intra-state B2C")
            return GSTType.CGST_SGST
            
        # If we still don't have state codes, default to intra-state
        if not seller_state_code or not buyer_state_code:
            logger.warning("Could not determine state codes - defaulting to intra-state")
            return GSTType.CGST_SGST
            
        # Compare state codes
        if seller_state_code == buyer_state_code:
            return GSTType.CGST_SGST
        else:
            return GSTType.IGST
    
    @staticmethod
    def calculate_gst_amounts(
        taxable_amount: Decimal,
        gst_rate: Decimal,
        gst_type: GSTType
    ) -> Dict[str, Decimal]:
        """
        Calculate GST amounts based on type
        
        Args:
            taxable_amount: Base amount on which GST is calculated
            gst_rate: Total GST percentage (e.g., 18 for 18%)
            gst_type: Type of GST to apply
            
        Returns:
            Dictionary with cgst_amount, sgst_amount, igst_amount, total_tax
        """
        result = {
            "cgst_rate": Decimal("0"),
            "sgst_rate": Decimal("0"),
            "igst_rate": Decimal("0"),
            "cgst_amount": Decimal("0"),
            "sgst_amount": Decimal("0"),
            "igst_amount": Decimal("0"),
            "total_tax": Decimal("0")
        }
        
        if gst_type == GSTType.EXEMPT or gst_rate == 0:
            return result
            
        # Ensure we're working with Decimal
        taxable_amount = Decimal(str(taxable_amount))
        gst_rate = Decimal(str(gst_rate))
        
        if gst_type == GSTType.CGST_SGST:
            # Split GST equally between CGST and SGST
            cgst_rate = gst_rate / 2
            sgst_rate = gst_rate / 2
            
            result["cgst_rate"] = cgst_rate
            result["sgst_rate"] = sgst_rate
            result["cgst_amount"] = (taxable_amount * cgst_rate / 100).quantize(Decimal("0.01"))
            result["sgst_amount"] = (taxable_amount * sgst_rate / 100).quantize(Decimal("0.01"))
            result["total_tax"] = result["cgst_amount"] + result["sgst_amount"]
            
        elif gst_type == GSTType.IGST:
            # Full GST as IGST
            result["igst_rate"] = gst_rate
            result["igst_amount"] = (taxable_amount * gst_rate / 100).quantize(Decimal("0.01"))
            result["total_tax"] = result["igst_amount"]
            
        return result
    
    @staticmethod
    def calculate_item_gst(
        item_data: Dict,
        gst_type: GSTType,
        override_gst_rate: Optional[Decimal] = None
    ) -> Dict[str, any]:
        """
        Calculate GST for a single invoice item
        
        Args:
            item_data: Dictionary containing:
                - quantity: Item quantity
                - unit_price: Price per unit
                - discount_percent: Discount percentage (optional)
                - discount_amount: Discount amount (optional)
                - tax_percent: GST rate (can be overridden)
            gst_type: Type of GST to apply
            override_gst_rate: Override the item's tax_percent
            
        Returns:
            Dictionary with all calculations
        """
        quantity = Decimal(str(item_data.get("quantity", 0)))
        unit_price = Decimal(str(item_data.get("unit_price", 0)))
        discount_percent = Decimal(str(item_data.get("discount_percent", 0)))
        discount_amount = Decimal(str(item_data.get("discount_amount", 0)))
        gst_rate = override_gst_rate or Decimal(str(item_data.get("tax_percent", 0)))
        
        # Calculate base amount
        base_amount = quantity * unit_price
        
        # Apply discount
        if discount_percent > 0:
            discount_amount = (base_amount * discount_percent / 100).quantize(Decimal("0.01"))
        
        taxable_amount = base_amount - discount_amount
        
        # Calculate GST
        gst_amounts = GSTService.calculate_gst_amounts(taxable_amount, gst_rate, gst_type)
        
        # Total amount including tax
        total_amount = taxable_amount + gst_amounts["total_tax"]
        
        return {
            "quantity": quantity,
            "unit_price": unit_price,
            "base_amount": base_amount,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
            "taxable_amount": taxable_amount,
            "gst_rate": gst_rate,
            "cgst_rate": gst_amounts["cgst_rate"],
            "sgst_rate": gst_amounts["sgst_rate"],
            "igst_rate": gst_amounts["igst_rate"],
            "cgst_amount": gst_amounts["cgst_amount"],
            "sgst_amount": gst_amounts["sgst_amount"],
            "igst_amount": gst_amounts["igst_amount"],
            "tax_amount": gst_amounts["total_tax"],
            "total_amount": total_amount
        }
    
    @staticmethod
    def calculate_invoice_gst(
        invoice_data: Dict,
        seller_gstin: str,
        buyer_gstin: Optional[str] = None,
        is_export: bool = False
    ) -> Dict[str, any]:
        """
        Calculate GST for entire invoice
        
        Args:
            invoice_data: Dictionary containing:
                - items: List of item dictionaries
                - discount_amount: Overall discount (optional)
                - other_charges: Additional charges (optional)
            seller_gstin: Seller's GSTIN
            buyer_gstin: Buyer's GSTIN (optional for B2C)
            is_export: Is this an export invoice
            
        Returns:
            Complete invoice calculation with GST breakup
        """
        # Determine GST type
        gst_type = GSTService.determine_gst_type(
            seller_gstin=seller_gstin,
            buyer_gstin=buyer_gstin,
            is_export=is_export
        )
        
        # Process items
        items_calculated = []
        subtotal = Decimal("0")
        total_discount = Decimal("0")
        total_taxable = Decimal("0")
        total_cgst = Decimal("0")
        total_sgst = Decimal("0")
        total_igst = Decimal("0")
        
        for item in invoice_data.get("items", []):
            item_calc = GSTService.calculate_item_gst(item, gst_type)
            items_calculated.append(item_calc)
            
            subtotal += item_calc["base_amount"]
            total_discount += item_calc["discount_amount"]
            total_taxable += item_calc["taxable_amount"]
            total_cgst += item_calc["cgst_amount"]
            total_sgst += item_calc["sgst_amount"]
            total_igst += item_calc["igst_amount"]
        
        # Apply overall discount if any
        overall_discount = Decimal(str(invoice_data.get("discount_amount", 0)))
        if overall_discount > 0:
            total_discount += overall_discount
            total_taxable -= overall_discount
            
            # Recalculate tax on new taxable amount
            # This is a simplified approach - in practice, you might want to
            # proportionally distribute the discount across items
        
        # Add other charges
        other_charges = Decimal(str(invoice_data.get("other_charges", 0)))
        
        # Calculate final totals
        total_tax = total_cgst + total_sgst + total_igst
        grand_total = total_taxable + total_tax + other_charges
        
        return {
            "gst_type": gst_type,
            "items": items_calculated,
            "subtotal": subtotal,
            "total_discount": total_discount,
            "total_taxable": total_taxable,
            "cgst_amount": total_cgst,
            "sgst_amount": total_sgst,
            "igst_amount": total_igst,
            "total_tax": total_tax,
            "other_charges": other_charges,
            "grand_total": grand_total,
            "seller_state": GSTService.get_state_name(GSTService.extract_state_code(seller_gstin)),
            "buyer_state": GSTService.get_state_name(GSTService.extract_state_code(buyer_gstin)) if buyer_gstin else None
        }
    
    @staticmethod
    def get_gst_summary_for_period(transactions: list) -> Dict[str, Decimal]:
        """
        Get GST summary for GSTR filing
        Groups transactions by tax type and rate
        """
        summary = {
            "b2b_taxable": Decimal("0"),
            "b2b_cgst": Decimal("0"),
            "b2b_sgst": Decimal("0"),
            "b2b_igst": Decimal("0"),
            "b2c_taxable": Decimal("0"),
            "b2c_cgst": Decimal("0"),
            "b2c_sgst": Decimal("0"),
            "exports": Decimal("0"),
            "nil_rated": Decimal("0")
        }
        
        for trans in transactions:
            if trans.get("buyer_gstin"):
                # B2B transaction
                summary["b2b_taxable"] += trans.get("taxable_amount", 0)
                summary["b2b_cgst"] += trans.get("cgst_amount", 0)
                summary["b2b_sgst"] += trans.get("sgst_amount", 0)
                summary["b2b_igst"] += trans.get("igst_amount", 0)
            else:
                # B2C transaction
                summary["b2c_taxable"] += trans.get("taxable_amount", 0)
                summary["b2c_cgst"] += trans.get("cgst_amount", 0)
                summary["b2c_sgst"] += trans.get("sgst_amount", 0)
                
            if trans.get("is_export"):
                summary["exports"] += trans.get("taxable_amount", 0)
                
        return summary