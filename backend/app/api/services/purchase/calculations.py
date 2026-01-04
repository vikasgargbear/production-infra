"""
Purchase Calculations
Fast, accurate, reusable calculation logic using Decimal for precision
Mirrors the InvoiceCalculator pattern from sales module
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Optional, Any
from dataclasses import dataclass


@dataclass
class CalculatedPurchaseItem:
    """Calculated purchase item with all computed values"""
    product_id: int
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    tax_percent: Decimal
    mrp: Decimal
    line_total: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal


@dataclass 
class PurchaseTotals:
    """Purchase totals with all calculated amounts"""
    subtotal_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    freight_charges: Decimal
    other_charges: Decimal
    round_off_amount: Decimal
    total_amount: Decimal  # For PO
    invoice_total: Decimal  # For supplier invoice


class PurchaseCalculator:
    """
    High-performance purchase calculation service
    Uses Decimal for financial precision (no floating point errors)
    
    Follows same pattern as InvoiceCalculator for consistency.
    """
    
    @staticmethod
    def calculate_item(
        item: Dict[str, Any],
        gst_type: str = "CGST/SGST"
    ) -> CalculatedPurchaseItem:
        """
        Calculate all values for a single purchase item
        
        Formula:
        1. line_total = quantity × unit_price
        2. discount_amount = line_total × discount_percent / 100
        3. taxable_amount = line_total - discount_amount
        4. tax_amount = taxable_amount × tax_percent / 100
        5. For CGST/SGST: split tax 50/50
        6. For IGST: all tax goes to IGST
        
        Args:
            item: Dict with product details
            gst_type: "CGST/SGST" for intrastate, "IGST" for interstate
            
        Returns:
            CalculatedPurchaseItem with all calculated fields
        """
        # Convert to Decimal for precision
        quantity = Decimal(str(item.get('quantity', 0) or item.get('ordered_quantity', 0) or 0))
        unit_price = Decimal(str(item.get('unit_price', 0) or item.get('cost_price', 0) or item.get('rate', 0) or 0))
        discount_percent = Decimal(str(item.get('discount_percent', 0) or 0))
        tax_percent = Decimal(str(item.get('tax_percent', 0) or item.get('gst_percent', 0) or 0))
        mrp = Decimal(str(item.get('mrp', 0) or 0))
        
        # Step 1: Calculate line total
        line_total = quantity * unit_price
        
        # Step 2: Calculate discount
        discount_amount = line_total * discount_percent / Decimal('100')
        
        # Step 3: Calculate taxable amount (after discount)
        taxable_amount = line_total - discount_amount
        
        # Step 4: Calculate tax
        tax_amount = taxable_amount * tax_percent / Decimal('100')
        
        # Step 5: Split GST based on type
        if gst_type == "IGST":
            cgst_amount = Decimal('0')
            sgst_amount = Decimal('0')
            igst_amount = tax_amount
        else:  # CGST/SGST (intrastate)
            cgst_amount = tax_amount / Decimal('2')
            sgst_amount = tax_amount / Decimal('2')
            igst_amount = Decimal('0')
        
        # Round to 2 decimal places
        return CalculatedPurchaseItem(
            product_id=item.get('product_id', 0),
            product_name=item.get('product_name', ''),
            quantity=quantity.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            unit_price=unit_price.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            discount_percent=discount_percent.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            tax_percent=tax_percent.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            mrp=mrp.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            line_total=line_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            discount_amount=discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            taxable_amount=taxable_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            cgst_amount=cgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            sgst_amount=sgst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            igst_amount=igst_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            tax_amount=tax_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        )
    
    @staticmethod
    def calculate_totals(
        items: List[Dict[str, Any]],
        gst_type: str = "CGST/SGST",
        freight_charges: float = 0,
        other_charges: float = 0
    ) -> Dict[str, Any]:
        """
        Calculate all totals for a purchase order or supplier invoice
        
        Uses full precision during aggregation, rounds only at final output.
        
        Args:
            items: List of item dicts
            gst_type: "CGST/SGST" or "IGST"
            freight_charges: Freight/shipping charges
            other_charges: Any other charges
            
        Returns:
            Dict with all totals and calculated items
        """
        # Aggregate with full precision
        subtotal = Decimal('0')
        discount_total = Decimal('0')
        taxable_total = Decimal('0')
        cgst_total = Decimal('0')
        sgst_total = Decimal('0')
        igst_total = Decimal('0')
        tax_total = Decimal('0')
        
        calculated_items = []
        
        for item in items:
            calc = PurchaseCalculator.calculate_item(item, gst_type)
            
            # Aggregate using pre-rounded values (consistent with frontend)
            subtotal += calc.line_total
            discount_total += calc.discount_amount
            taxable_total += calc.taxable_amount
            cgst_total += calc.cgst_amount
            sgst_total += calc.sgst_amount
            igst_total += calc.igst_amount
            tax_total += calc.tax_amount
            
            calculated_items.append({
                'product_id': calc.product_id,
                'product_name': calc.product_name,
                'quantity': float(calc.quantity),
                'unit_price': float(calc.unit_price),
                'discount_percent': float(calc.discount_percent),
                'discount_amount': float(calc.discount_amount),
                'tax_percent': float(calc.tax_percent),
                'taxable_amount': float(calc.taxable_amount),
                'cgst_amount': float(calc.cgst_amount),
                'sgst_amount': float(calc.sgst_amount),
                'igst_amount': float(calc.igst_amount),
                'tax_amount': float(calc.tax_amount),
                'line_total': float(calc.line_total),
                'mrp': float(calc.mrp)
            })
        
        # Add additional charges
        freight = Decimal(str(freight_charges))
        other = Decimal(str(other_charges))
        
        # Calculate final total
        pre_round_total = taxable_total + tax_total + freight + other
        
        # Calculate round-off to nearest rupee
        rounded_total = pre_round_total.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        round_off = rounded_total - pre_round_total
        
        final_total = rounded_total
        
        # Return with rounded values
        return {
            'subtotal_amount': float(subtotal.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'discount_amount': float(discount_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'taxable_amount': float(taxable_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'cgst_amount': float(cgst_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'sgst_amount': float(sgst_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'igst_amount': float(igst_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'tax_amount': float(tax_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'freight_charges': float(freight.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'other_charges': float(other.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'round_off_amount': float(round_off.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'total_amount': float(final_total),  # For purchase_orders
            'invoice_total': float(final_total),  # For supplier_invoices
            'calculated_items': calculated_items
        }
    
    @staticmethod
    def calculate_purchase_order_totals(
        items: List[Dict[str, Any]],
        gst_type: str = "CGST/SGST",
        other_charges: float = 0
    ) -> Dict[str, Any]:
        """
        Calculate totals specifically for purchase orders
        
        Args:
            items: List of PO items
            gst_type: GST type
            other_charges: Additional charges
            
        Returns:
            Dict with PO-specific totals
        """
        return PurchaseCalculator.calculate_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=0,
            other_charges=other_charges
        )
    
    @staticmethod
    def calculate_supplier_invoice_totals(
        items: List[Dict[str, Any]],
        gst_type: str = "CGST/SGST",
        freight_charges: float = 0,
        insurance_charges: float = 0,
        other_charges: float = 0,
        tds_percent: float = 0
    ) -> Dict[str, Any]:
        """
        Calculate totals specifically for supplier invoices
        
        Args:
            items: List of invoice items
            gst_type: GST type
            freight_charges: Freight charges
            insurance_charges: Insurance charges
            other_charges: Other charges
            tds_percent: TDS percentage to deduct
            
        Returns:
            Dict with supplier invoice totals including TDS
        """
        result = PurchaseCalculator.calculate_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=freight_charges,
            other_charges=other_charges + insurance_charges
        )
        
        # Calculate TDS if applicable
        if tds_percent > 0:
            tds_amount = Decimal(str(result['taxable_amount'])) * Decimal(str(tds_percent)) / Decimal('100')
            result['tds_percent'] = tds_percent
            result['tds_amount'] = float(tds_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
            # TDS reduces the payable amount
            result['payable_amount'] = float(
                Decimal(str(result['invoice_total'])) - tds_amount
            )
        else:
            result['tds_percent'] = 0
            result['tds_amount'] = 0
            result['payable_amount'] = result['invoice_total']
        
        result['insurance_charges'] = float(insurance_charges)
        
        return result
    
    @staticmethod
    def verify_calculation(
        items: List[Dict[str, Any]],
        expected_total: float,
        tolerance: float = 1.0
    ) -> Dict[str, Any]:
        """
        Verify that calculated total matches expected (useful for invoice parsing)
        
        Args:
            items: List of items to calculate
            expected_total: Expected grand total
            tolerance: Allowed difference (for rounding issues)
            
        Returns:
            Dict with verification result
        """
        result = PurchaseCalculator.calculate_totals(items)
        calculated_total = result['invoice_total']
        difference = abs(calculated_total - expected_total)
        
        return {
            'is_valid': difference <= tolerance,
            'calculated_total': calculated_total,
            'expected_total': expected_total,
            'difference': difference,
            'within_tolerance': difference <= tolerance
        }
