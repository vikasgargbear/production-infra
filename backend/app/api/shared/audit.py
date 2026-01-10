"""
Calculation Audit Logging

Logs calculation mismatches between frontend and backend for monitoring.
"""
import logging
from decimal import Decimal
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Tolerance for floating point comparisons
TOLERANCE = 0.01


class CalculationAuditor:
    """Audits calculations and logs mismatches"""
    
    @staticmethod
    def audit_invoice_totals(
        frontend_totals: Dict[str, float],
        backend_totals: Dict[str, float],
        invoice_number: str = None
    ) -> bool:
        """
        Audit invoice total calculations.
        Returns True if match, False if mismatch (logs warning).
        """
        mismatches = []
        
        fields_to_check = [
            'subtotal_amount', 'discount_amount', 'taxable_amount',
            'cgst_amount', 'sgst_amount', 'igst_amount',
            'total_tax_amount', 'final_amount'
        ]
        
        for field in fields_to_check:
            frontend_val = float(frontend_totals.get(field, 0))
            backend_val = float(backend_totals.get(field, 0))
            
            if abs(frontend_val - backend_val) > TOLERANCE:
                mismatches.append({
                    'field': field,
                    'frontend': frontend_val,
                    'backend': backend_val,
                    'diff': abs(frontend_val - backend_val)
                })
        
        if mismatches:
            logger.warning(
                f"⚠️  Calculation mismatch detected",
                extra={
                    'invoice_number': invoice_number,
                    'mismatches': mismatches,
                    'mismatch_count': len(mismatches)
                }
            )
            return False
        
        logger.debug(f"✓ Calculation audit passed for invoice {invoice_number}")
        return True
    
    @staticmethod
    def audit_line_item(
        frontend_item: Dict[str, Any],
        backend_item: Dict[str, Any],
        item_index: int = 0
    ) -> bool:
        """Audit individual line item calculations"""
        mismatches = []
        
        fields_to_check = [
            'discount_amount', 'taxable_amount',
            'cgst_amount', 'sgst_amount', 'igst_amount',
            'line_total'
        ]
        
        for field in fields_to_check:
            frontend_val = float(frontend_item.get(field, 0))
            backend_val = float(backend_item.get(field, 0))
            
            if abs(frontend_val - backend_val) > TOLERANCE:
                mismatches.append({
                    'field': field,
                    'frontend': frontend_val,
                    'backend': backend_val
                })
        
        if mismatches:
            logger.warning(
                f"⚠️  Line item calculation mismatch at index {item_index}",
                extra={'mismatches': mismatches}
            )
            return False
        
        return True
    
    @staticmethod
    def audit_payment_total(
        payments: list,
        expected_total: float,
        invoice_number: str = None
    ) -> bool:
        """Audit that payment sum doesn't exceed invoice total"""
        payment_sum = sum(float(p.get('amount', 0)) for p in payments)
        
        if payment_sum > expected_total + TOLERANCE:
            logger.error(
                f"❌ Payment overpayment detected",
                extra={
                    'invoice_number': invoice_number,
                    'expected_total': expected_total,
                    'payment_sum': payment_sum,
                    'overpayment': payment_sum - expected_total
                }
            )
            return False
        
        return True
