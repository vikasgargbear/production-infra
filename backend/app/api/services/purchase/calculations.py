"""
Purchase Calculations
Fast, accurate, reusable calculation logic using Decimal for precision
Mirrors the InvoiceCalculator pattern from sales module
"""
from decimal import Decimal
from typing import List, Dict, Optional, Any
from dataclasses import dataclass

from ....core.money import decimal_value, money, rupees
from ..compliance.gst_service import GSTService


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
    insurance_charges: Decimal
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
        normalized_gst_type = str(gst_type).strip().upper()
        if normalized_gst_type not in {"CGST/SGST", "IGST"}:
            raise ValueError("gst_type must be 'IGST' or 'CGST/SGST'")
        quantity = decimal_value(
            item.get('quantity', 0) or item.get('ordered_quantity', 0) or 0,
            "quantity",
            minimum=Decimal("0"),
        )
        if quantity <= 0:
            raise ValueError("quantity must be greater than 0")
        unit_price = decimal_value(
            item.get('unit_price', 0) or item.get('cost_price', 0) or item.get('rate', 0) or 0,
            "unit_price",
            minimum=Decimal("0"),
        )
        discount_percent = decimal_value(
            item.get('discount_percent', 0) or 0,
            "discount_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )
        tax_percent = decimal_value(
            item.get('tax_percent', 0) or item.get('gst_percent', 0) or 0,
            "tax_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )
        mrp = decimal_value(item.get('mrp', 0) or 0, "mrp", minimum=Decimal("0"))
        
        # Step 1: Calculate line total
        line_total = money(quantity * unit_price)
        
        # Step 2: Calculate discount
        discount_amount = money(line_total * discount_percent / Decimal('100'))
        
        # Step 3: Calculate taxable amount (after discount)
        taxable_amount = line_total - discount_amount
        
        # Step 4: Calculate tax
        gst = GSTService.calculate_gst_components(
            taxable_amount, tax_percent, normalized_gst_type
        )
        cgst_amount = gst["cgst_amount"]
        sgst_amount = gst["sgst_amount"]
        igst_amount = gst["igst_amount"]
        tax_amount = gst["total_tax_amount"]
        
        # Round to 2 decimal places
        return CalculatedPurchaseItem(
            product_id=item.get('product_id', 0),
            product_name=item.get('product_name', ''),
            quantity=quantity,
            unit_price=unit_price,
            discount_percent=discount_percent,
            tax_percent=tax_percent,
            mrp=mrp,
            line_total=line_total,
            discount_amount=discount_amount,
            taxable_amount=taxable_amount,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            igst_amount=igst_amount,
            tax_amount=tax_amount
        )
    
    @staticmethod
    def calculate_totals(
        items: List[Dict[str, Any]],
        gst_type: str = "CGST/SGST",
        freight_charges: float = 0,
        insurance_charges: float = 0,
        other_charges: float = 0,
        *,
        exact_output: bool = False,
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
        if not isinstance(items, list) or not items:
            raise ValueError("items must contain at least one purchase line")

        # Aggregate the rounded line snapshots that will be persisted.
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
                'quantity': calc.quantity,
                'unit_price': calc.unit_price,
                'discount_percent': calc.discount_percent,
                'discount_amount': calc.discount_amount,
                'tax_percent': calc.tax_percent,
                'taxable_amount': calc.taxable_amount,
                'cgst_amount': calc.cgst_amount,
                'sgst_amount': calc.sgst_amount,
                'igst_amount': calc.igst_amount,
                'tax_amount': calc.tax_amount,
                'line_total': calc.line_total,
                'mrp': calc.mrp,
            })
        
        # Add additional charges
        freight = money(decimal_value(freight_charges, "freight_charges", minimum=Decimal("0")))
        insurance = money(decimal_value(insurance_charges, "insurance_charges", minimum=Decimal("0")))
        other = money(decimal_value(other_charges, "other_charges", minimum=Decimal("0")))
        
        # Calculate final total
        pre_round_total = taxable_total + tax_total + freight + insurance + other
        
        # Calculate round-off to nearest rupee
        rounded_total = rupees(pre_round_total)
        round_off = rounded_total - pre_round_total
        
        final_total = rounded_total
        
        totals = {
            'subtotal_amount': money(subtotal),
            'discount_amount': money(discount_total),
            'taxable_amount': money(taxable_total),
            'cgst_amount': money(cgst_total),
            'sgst_amount': money(sgst_total),
            'igst_amount': money(igst_total),
            'tax_amount': money(tax_total),
            'freight_charges': freight,
            'insurance_charges': insurance,
            'other_charges': other,
            'round_off_amount': money(round_off),
            'total_amount': final_total,  # For purchase_orders
            'invoice_total': final_total,  # For supplier_invoices
            'calculated_items': calculated_items
        }
        if exact_output:
            return totals
        return {
            **{key: float(value) for key, value in totals.items() if key != 'calculated_items'},
            'calculated_items': [
                {
                    key: float(value) if isinstance(value, Decimal) else value
                    for key, value in item.items()
                }
                for item in calculated_items
            ],
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
            insurance_charges=insurance_charges,
            other_charges=other_charges
        )
        
        # Calculate TDS if applicable
        tds_rate = decimal_value(
            tds_percent, "tds_percent", minimum=Decimal("0"), maximum=Decimal("100")
        )
        if tds_rate > 0:
            tds_amount = money(Decimal(str(result['taxable_amount'])) * tds_rate / Decimal('100'))
            result['tds_percent'] = float(tds_rate)
            result['tds_amount'] = float(tds_amount)
            # TDS reduces the payable amount
            result['payable_amount'] = float(
                money(Decimal(str(result['invoice_total'])) - tds_amount)
            )
        else:
            result['tds_percent'] = 0
            result['tds_amount'] = 0
            result['payable_amount'] = result['invoice_total']
        
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
