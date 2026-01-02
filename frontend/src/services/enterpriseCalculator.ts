/**
 * EnterpriseCalculator - SINGLE SOURCE OF TRUTH FOR ALL CALCULATIONS
 * 
 * ⚠️ WARNING: DO NOT CREATE NEW CALCULATORS!
 * ⚠️ All calculation logic MUST be in this file.
 * 
 * This is the ONLY calculator used across the entire application:
 * ✅ Invoices
 * ✅ Sales Orders  
 * ✅ Delivery Challans
 * ✅ Purchase Orders
 * ✅ Returns
 * ✅ Quotations
 * 
 * If you need new calculation functionality:
 * 1. ADD IT TO THIS FILE
 * 2. Do NOT create wrapper calculators
 * 3. Update this documentation
 * 
 * Architecture:
 * - calculateItem() → Single item calculations
 * - calculateTotals() → Aggregate multiple items
 * - calculateInvoice/Challan/Order() → Document-specific wrappers
 * - calculateDebounced() → Real-time updates with debouncing
 * 
 * Usage:
 * ```typescript
 * import EnterpriseCalculator from './services/enterpriseCalculator';
 * 
 * // Item-level
 * const item = EnterpriseCalculator.calculateItem(itemData);
 * 
 * // Invoice totals
 * const result = EnterpriseCalculator.calculateTotals(items, options);
 * 
 * // Real-time with debounce
 * EnterpriseCalculator.calculateDebounced(invoice, callback);
 * ```
 */

// Import centralized field aliases - SINGLE SOURCE OF TRUTH for variable naming
// @ts-ignore
import { getNumericField } from '../config/fieldAliases';
import { InvoiceItem, InvoiceTotals, GstType, Invoice } from '../components/sales/invoice/types/invoiceTypes';

// Define loose interfaces for input flexibility (since inputs might be partial or from different sources)
export interface CalculationOptions {
  gst_type?: GstType | string;
  freight_charges?: number;       // Was: delivery_charges
  invoice_discount?: number;      // Was: additional_discount
  [key: string]: any;
}

export interface CalculatedItem extends InvoiceItem {
  // Quantities (includes convenience calculables)
  base_quantity: number;           // Billable quantity (clearer name)
  free_quantity: number;
  total_quantity: number;          // base + free
  // Amounts
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface CalculatedTotals {
  items: CalculatedItem[];
  totals: InvoiceTotals;
}

class EnterpriseCalculator {
  /**
   * Calculate single item - reusable across all modules
   * @param {any} item - Item with quantity, rate, discount, etc.
   * @param {CalculationOptions} options - Optional settings like gst_type
   * @returns {CalculatedItem} Calculated item with all amounts
   */
  static calculateItem(item: any, options: CalculationOptions = {}): CalculatedItem {
    const gstType = options.gst_type || 'CGST/SGST';

    // Parse inputs using centralized field aliases
    // This ensures we always check canonical name first, then fallback to aliases
    const unit_price = getNumericField(item, 'unit_price', 0);
    const quantity = getNumericField(item, 'quantity', 0);
    const baseQuantity = quantity; // base_quantity = billable quantity (always same as quantity)
    const freeQuantity = getNumericField(item, 'free_quantity', 0);
    const discountPercent = getNumericField(item, 'discount_percent', 0);
    const gstPercent = getNumericField(item, 'gst_percent', 0);

    // PRODUCTION LOGIC: Use quantity for billing calculations
    // Free items are truly FREE and don't affect pricing
    const subtotal = unit_price * baseQuantity;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const totalAmount = taxableAmount + gstAmount;

    // GST breakdown
    const cgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
    const sgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
    const igstAmount = gstType === 'IGST' ? gstAmount : 0;

    // Return enriched item with all calculations
    return {
      ...item,
      // Quantities - include calculables for convenience
      base_quantity: baseQuantity,      // Billable quantity (clearer name)
      quantity: baseQuantity,           // Alias for compatibility
      free_quantity: freeQuantity,
      total_quantity: baseQuantity + freeQuantity,  // Total including free

      // Amounts - canonical names
      unit_price: this.round(unit_price),
      subtotal: this.round(subtotal),
      discount_percent: discountPercent,
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      gst_percent: gstPercent,
      gst_amount: this.round(gstAmount),
      cgst_amount: this.round(cgstAmount),
      sgst_amount: this.round(sgstAmount),
      igst_amount: this.round(igstAmount),
      total_amount: this.round(totalAmount)
    };
  }

  /**
   * Calculate totals from items array - used by all modules
   * @param {any[]} items - Array of items to sum
   * @param {CalculationOptions} options - Additional options like delivery_charges
   * @returns {CalculatedTotals} Aggregated totals
   */
  static calculateTotals(items: any[] = [], options: CalculationOptions = {}): CalculatedTotals {
    // Initialize totals
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalGst = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    // Calculate each item and aggregate
    const calculatedItems = items.map(item => {
      const calculated = this.calculateItem(item, options);

      // Aggregate totals
      grossAmount += calculated.subtotal;
      totalDiscount += calculated.discount_amount;
      taxableAmount += calculated.taxable_amount;
      totalGst += calculated.gst_amount;
      cgstTotal += calculated.cgst_amount;
      sgstTotal += calculated.sgst_amount;
      igstTotal += calculated.igst_amount;

      return calculated;
    });

    // Additional charges
    const freightCharges = parseFloat(String(options.freight_charges || options.delivery_charges || 0));
    const invoiceDiscount = parseFloat(String(options.invoice_discount || options.additional_discount || 0));

    // CRITICAL: Apply scheme discount to taxable amount BEFORE GST calculation
    // Per Indian GST: All discounts must be applied before calculating tax
    const taxableAfterSchemeDiscount = taxableAmount - invoiceDiscount;

    // Recalculate GST on the fully discounted amount
    // Note: This is a simplified recalculation. For exact per-item GST rates,
    // you'd need to proportionally reduce each item's taxable amount.
    const effectiveGstRate = taxableAmount > 0 ? (totalGst / taxableAmount) : 0;
    const adjustedGst = taxableAfterSchemeDiscount * effectiveGstRate;
    const adjustedCgst = adjustedGst / 2;
    const adjustedSgst = adjustedGst / 2;

    // Final calculations
    const netAmount = taxableAfterSchemeDiscount + adjustedGst + freightCharges;
    const finalAmount = Math.round(netAmount);
    const roundOff = parseFloat((finalAmount - netAmount).toFixed(2));

    return {
      items: calculatedItems,
      totals: {
        // Canonical field names (matching database schema: sales.invoices)
        // NOTE: No rounding on intermediate values - only final_amount is rounded
        subtotal_amount: grossAmount,                           // DB: subtotal_amount
        discount_amount: totalDiscount,                         // DB: discount_amount (item-level)

        // UI display: Show taxable BEFORE scheme discount for clear breakdown
        taxable_before_scheme: taxableAmount,                   // UI only: for showing discount calculation
        scheme_discount: invoiceDiscount,                       // DB: scheme_discount (invoice-level)

        taxable_amount: taxableAfterSchemeDiscount,             // DB: taxable_amount (AFTER all discounts)
        total_tax_amount: adjustedGst,                          // DB: total_tax_amount
        cgst_amount: adjustedCgst,                              // DB: cgst_amount
        sgst_amount: adjustedSgst,                              // DB: sgst_amount
        igst_amount: igstTotal > 0 ? adjustedGst : 0,           // DB: igst_amount
        freight_charges: freightCharges,                        // DB: freight_charges
        round_off_amount: this.round(roundOff),                 // DB: round_off_amount (keep 2 decimal precision)
        final_amount: finalAmount                               // DB: final_amount (ONLY this is rounded)
      }
    };
  }

  /**
   * Calculate invoice - uses base methods
   */
  static calculateInvoice(invoiceData: Partial<Invoice>): CalculatedTotals {
    // Calculate invoice discount from percentage or amount
    let invoiceDiscount = 0;
    if (invoiceData.discount_type === 'percentage' && invoiceData.discount_percent) {
      // IMPORTANT: Calculate discount as percentage of TAXABLE amount (after item-level discounts)
      // This is the standard practice - invoice discount applies on pre-tax amount after item discounts
      const prelimResult = this.calculateTotals(invoiceData.items || [], {
        gst_type: invoiceData.gst_type,
        freight_charges: 0,
        invoice_discount: 0
      });
      invoiceDiscount = (Number(prelimResult.totals.taxable_amount) * Number(invoiceData.discount_percent)) / 100;
    } else if (invoiceData.discount_type === 'fixed' && invoiceData.discount_amount) {
      invoiceDiscount = Number(invoiceData.discount_amount);
    }

    const result = this.calculateTotals(invoiceData.items || [], {
      gst_type: invoiceData.gst_type,
      freight_charges: Number(invoiceData.freight_charges || 0),
      invoice_discount: invoiceDiscount  // Apply invoice-level discount (in addition to item discounts)
    });

    return result;
  }

  /**
   * Calculate challan - uses base methods
   */
  static calculateChallan(challanData: any): CalculatedTotals {
    return this.calculateTotals(challanData.items || [], {
      gst_type: challanData.gst_type,
      delivery_charges: challanData.delivery_charges
    });
  }

  /**
   * Calculate sales order - uses base methods
   */
  static calculateSalesOrder(orderData: any): CalculatedTotals {
    return this.calculateTotals(orderData.items || [], {
      gst_type: orderData.gst_type,
      delivery_charges: orderData.delivery_charges
    });
  }

  /**
   * Debounced calculation for real-time updates
   */
  static debounceTimeouts = new Map<string, NodeJS.Timeout>();

  static calculateDebounced(
    data: any,
    callback: (error: Error | null, result: CalculatedTotals | null) => void,
    delay: number = 300,
    type: 'invoice' | 'challan' | 'sales-order' = 'invoice'
  ): void {
    const key = `calc_${type}`;

    // Clear previous timeout
    if (this.debounceTimeouts.has(key)) {
      clearTimeout(this.debounceTimeouts.get(key));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      try {
        let result: CalculatedTotals;
        switch (type) {
          case 'invoice':
            result = this.calculateInvoice(data);
            break;
          case 'challan':
            result = this.calculateChallan(data);
            break;
          case 'sales-order':
            result = this.calculateSalesOrder(data);
            break;
          default:
            result = this.calculateTotals(data.items || [], data);
        }
        callback(null, result);
      } catch (error) {
        callback(error as Error, null);
      }
      this.debounceTimeouts.delete(key);
    }, delay);

    this.debounceTimeouts.set(key, timeoutId);
  }

  /**
   * Round to 2 decimal places
   */
  static round(value: number, decimals: number = 2): number {
    return Math.round((value + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Format currency for display
   */
  static formatCurrency(amount: number | null | undefined): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }
}

export default EnterpriseCalculator;