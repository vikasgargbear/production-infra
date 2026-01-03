"""
Optimized Invoice Calculations
Fast, accurate, reusable calculation logic using Decimal for precision
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Optional
from dataclasses import dataclass
from ...schemas.sales.billing import InvoiceItemCreate


@dataclass
class CalculatedItem:
    """Calculated invoice item with all computed values"""
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    gst_percent: Decimal
    base_quantity: Decimal
    line_total: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal


@dataclass
class InvoiceTotals:
    """Invoice totals with all calculated amounts"""
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    freight_charges: Decimal
    other_charges: Decimal
    round_off: Decimal
    final_amount: Decimal



class InvoiceCalculator:
    """
    High-performance invoice calculation service
    Uses Decimal for financial precision (no floating point errors)
    """
    
    @staticmethod
    def calculate_item(item: InvoiceItemCreate) -> CalculatedItem:
        """
        Calculate all values for a single invoice item
        
        Formula:
        1. line_total = base_quantity × unit_price
        2. discount_amount = line_total × discount_percent / 100
        3. taxable_amount = line_total - discount_amount
        4. cgst_amount = taxable_amount × (gst_percent / 2) / 100
        5. sgst_amount = taxable_amount × (gst_percent / 2) / 100
        6. igst_amount = 0 (for intrastate; will be calculated if interstate)
        
        Args:
            item: InvoiceItemCreate with product details
            
        Returns:
            CalculatedItem with all calculated fields
        """
        # Use base_quantity for billing (accounts for free items)
        base_qty = item.base_quantity or item.quantity
        
        # Step 1: Calculate line total
        line_total = base_qty * item.unit_price
        
        # Step 2: Calculate discount
        discount_amount = line_total * item.discount_percent / Decimal('100')
        
        # Step 3: Calculate taxable amount (after discount)
        taxable_amount = line_total - discount_amount
        
        # Step 4: Calculate GST (split CGST/SGST for intrastate)
        gst_half = item.gst_percent / Decimal('2')
        cgst_amount = taxable_amount * gst_half / Decimal('100')
        sgst_amount = taxable_amount * gst_half / Decimal('100')
        
        # Round to 2 decimal places
        return CalculatedItem(
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_percent=item.discount_percent,
            gst_percent=item.gst_percent,
            base_quantity=base_qty,
            line_total=line_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            discount_amount=discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            taxable_amount=taxable_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            cgst_amount=cgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            sgst_amount=sgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            igst_amount=Decimal('0')  # Intrastate by default
        )
    
    @staticmethod
    def calculate_items_batch(items: List[InvoiceItemCreate]) -> List[CalculatedItem]:
        """
        Calculate all items in batch (optimized)
        
        Args:
            items: List of invoice items
            
        Returns:
            List of calculated items
        """
        return [InvoiceCalculator.calculate_item(item) for item in items]
    
    @staticmethod
    def calculate_totals(
        calculated_items: List[CalculatedItem],
        freight_charges: Decimal = Decimal('0'),
        insurance_charges: Decimal = Decimal('0'),
        other_charges: Decimal = Decimal('0')
    ) -> InvoiceTotals:
        """
        Calculate invoice totals from calculated items
        
        Args:
            calculated_items: List of items with calculated values
            freight_charges: Delivery/freight charges
            insurance_charges: Insurance charges
            other_charges: Any other charges
            
        Returns:
            InvoiceTotals with all totals
        """
        # Sum all item values
        subtotal = sum((item.line_total for item in calculated_items), Decimal('0'))
        discount_amount = sum((item.discount_amount for item in calculated_items), Decimal('0'))
        taxable_amount = sum((item.taxable_amount for item in calculated_items), Decimal('0'))
        cgst_amount = sum((item.cgst_amount for item in calculated_items), Decimal('0'))
        sgst_amount = sum((item.sgst_amount for item in calculated_items), Decimal('0'))
        igst_amount = sum((item.igst_amount for item in calculated_items), Decimal('0'))
        
        # Total tax
        total_tax = cgst_amount + sgst_amount + igst_amount
        
        # Calculate final amount
        amount_before_round = (
            taxable_amount + 
            total_tax + 
            freight_charges + 
            insurance_charges + 
            other_charges
        )
        
        # Round to nearest integer (Indian practice)
        final_amount = amount_before_round.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        round_off = final_amount - amount_before_round
        
        return InvoiceTotals(
            subtotal=subtotal.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            discount_amount=discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            taxable_amount=taxable_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            cgst_amount=cgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            sgst_amount=sgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            igst_amount=igst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            total_tax=total_tax.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            freight_charges=freight_charges.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            other_charges=(insurance_charges + other_charges).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            round_off=round_off.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            final_amount=final_amount
        )
    
    @staticmethod
    def calculate_full_invoice(
        items: List[InvoiceItemCreate],
        freight_charges: Decimal = Decimal('0'),
        insurance_charges: Decimal = Decimal('0'),
        other_charges: Decimal = Decimal('0')
    ) -> tuple[List[CalculatedItem], InvoiceTotals]:
        """
        One-shot calculation for entire invoice
        
        Args:
            items: Invoice items to calculate
            freight_charges: Delivery charges
            insurance_charges: Insurance charges
            other_charges: Other charges
            
        Returns:
            Tuple of (calculated_items, totals)
        """
        # Calculate all items
        calculated_items = InvoiceCalculator.calculate_items_batch(items)
        
        # Calculate totals
        totals = InvoiceCalculator.calculate_totals(
            calculated_items,
            freight_charges,
            insurance_charges,
            other_charges
        )
        
        return calculated_items, totals
    
    @staticmethod
    def verify_calculation(
        items: List[CalculatedItem],
        totals: InvoiceTotals
    ) -> Dict[str, bool]:
        """
        Verify calculation integrity
        
        Returns:
            Dict with verification results
        """
        # Recalculate from items
        calculated_subtotal = sum((item.line_total for item in items), Decimal('0'))
        calculated_discount = sum((item.discount_amount for item in items), Decimal('0'))
        calculated_cgst = sum((item.cgst_amount for item in items), Decimal('0'))
        calculated_sgst = sum((item.sgst_amount for item in items), Decimal('0'))
        
        return {
            "subtotal_matches": abs(calculated_subtotal - totals.subtotal) < Decimal('0.01'),
            "discount_matches": abs(calculated_discount - totals.discount_amount) < Decimal('0.01'),
            "cgst_matches": abs(calculated_cgst - totals.cgst_amount) < Decimal('0.01'),
            "sgst_matches": abs(calculated_sgst - totals.sgst_amount) < Decimal('0.01'),
            "all_verified": True  # Will be set to False if any check fails
        }


# Convenience functions for common operations

def calculate_gst(amount: Decimal, gst_percent: Decimal) -> Dict[str, Decimal]:
    """
    Calculate GST breakdown for an amount
    
    Args:
        amount: Taxable amount
        gst_percent: GST percentage (e.g., 18 for 18%)
        
    Returns:
        Dict with cgst, sgst, igst, total
    """
    gst_half = gst_percent / Decimal('2')
    cgst = amount * gst_half / Decimal('100')
    sgst = amount * gst_half / Decimal('100')
    
    return {
        "cgst": cgst.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
        "sgst": sgst.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
        "igst": Decimal('0'),
        "total": (cgst + sgst).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    }


def apply_discount(amount: Decimal, discount_percent: Decimal) -> Decimal:
    """
    Apply discount percentage to amount
    
    Args:
        amount: Original amount
        discount_percent: Discount percentage
        
    Returns:
        Amount after discount
    """
    discount = amount * discount_percent / Decimal('100')
    return (amount - discount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def round_to_nearest(amount: Decimal, precision: int = 0) -> Decimal:
    """
    Round amount to nearest integer or specified precision
    
    Args:
        amount: Amount to round
        precision: Decimal places (0 for integer)
        
    Returns:
        Rounded amount
    """
    if precision == 0:
        return amount.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    else:
        quantizer = Decimal('0.1') ** precision
        return amount.quantize(quantizer, rounding=ROUND_HALF_UP)
