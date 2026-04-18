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
  include_gst?: boolean;
  quantity_field?: string;
  round_final_amount?: boolean;
  selected_only?: boolean;
  paid_quantity_field?: string;
  free_quantity_field?: string;
  cap_to_paid_quantity?: boolean;
  exclude_free_quantity_from_taxable?: boolean;
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
  static toNumber(value: unknown, fallback: number = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  static getItemTaxPercent(item: any): number {
    const directPercent = getNumericField(item, 'gst_percent', Number.NaN);
    if (Number.isFinite(directPercent)) {
      return directPercent;
    }

    const taxPercent = getNumericField(item, 'tax_percent', Number.NaN);
    if (Number.isFinite(taxPercent)) {
      return taxPercent;
    }

    const cgstRate = this.toNumber(item?.cgst_rate ?? item?.cgst_percent, 0);
    const sgstRate = this.toNumber(item?.sgst_rate ?? item?.sgst_percent, 0);
    const igstRate = this.toNumber(item?.igst_rate ?? item?.igst_percent, 0);
    return cgstRate + sgstRate + igstRate;
  }

  static getItemGstType(item: any, defaultGstType: string = 'CGST/SGST'): string {
    const igstRate = this.toNumber(item?.igst_rate ?? item?.igst_percent, 0);
    const cgstRate = this.toNumber(item?.cgst_rate ?? item?.cgst_percent, 0);
    const sgstRate = this.toNumber(item?.sgst_rate ?? item?.sgst_percent, 0);

    if (igstRate > 0) return 'IGST';
    if (cgstRate > 0 || sgstRate > 0) return 'CGST/SGST';
    return defaultGstType;
  }

  static getBreakdownFromTax(taxAmount: number, gstType: string) {
    return {
      cgst_amount: gstType === 'CGST/SGST' ? taxAmount / 2 : 0,
      sgst_amount: gstType === 'CGST/SGST' ? taxAmount / 2 : 0,
      igst_amount: gstType === 'IGST' ? taxAmount : 0
    };
  }

  static buildInvoiceTotals(params: {
    grossAmount: number;
    totalDiscount: number;
    taxableBeforeScheme: number;
    schemeDiscount: number;
    totalGst: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    freightCharges: number;
    roundOff: number;
    finalAmount: number;
    roundFinalAmount: boolean;
  }): InvoiceTotals {
    const netAmount = params.taxableBeforeScheme - params.schemeDiscount + params.totalGst + params.freightCharges;

    return {
      subtotal: this.round(params.grossAmount),
      subtotal_amount: this.round(params.grossAmount),
      gross_amount: this.round(params.grossAmount),
      total_discount: this.round(params.totalDiscount),
      discount_amount: this.round(params.totalDiscount),
      taxable_before_scheme: this.round(params.taxableBeforeScheme),
      scheme_discount: this.round(params.schemeDiscount),
      additional_discount: this.round(params.schemeDiscount),
      taxable_amount: this.round(params.taxableBeforeScheme - params.schemeDiscount),
      tax_amount: this.round(params.totalGst),
      total_tax: this.round(params.totalGst),
      total_tax_amount: this.round(params.totalGst),
      cgst_amount: this.round(params.cgstAmount),
      sgst_amount: this.round(params.sgstAmount),
      igst_amount: this.round(params.igstAmount),
      cgst_total: this.round(params.cgstAmount),
      sgst_total: this.round(params.sgstAmount),
      igst_total: this.round(params.igstAmount),
      freight_charges: this.round(params.freightCharges),
      delivery_charges: this.round(params.freightCharges),
      round_off: this.round(params.roundOff),
      round_off_amount: this.round(params.roundOff),
      net_amount: this.round(netAmount),
      total_amount: params.roundFinalAmount ? params.finalAmount : this.round(netAmount),
      final_amount: params.roundFinalAmount ? params.finalAmount : this.round(netAmount)
    };
  }

  static calculateReturnLine(item: any, options: CalculationOptions = {}) {
    const includeGst = options.include_gst !== false;
    const quantityField = options.quantity_field || 'return_quantity';
    const requestedQuantity = this.toNumber(item?.[quantityField] ?? item?.return_quantity ?? item?.quantity, 0);
    const paidQuantityField = options.paid_quantity_field || 'paid_quantity';
    const freeQuantityField = options.free_quantity_field || 'free_quantity';
    const paidQuantity = this.toNumber(item?.[paidQuantityField], 0);
    const freeQuantity = this.toNumber(item?.[freeQuantityField], 0);

    let billableQuantity = requestedQuantity;
    if (options.cap_to_paid_quantity && paidQuantity > 0) {
      billableQuantity = Math.min(requestedQuantity, paidQuantity);
    } else if (options.exclude_free_quantity_from_taxable && freeQuantity > 0) {
      billableQuantity = Math.max(0, requestedQuantity - freeQuantity);
    }

    const unitPrice = getNumericField(item, 'unit_price', 0);
    const discountPercent = getNumericField(item, 'discount_percent', 0);
    const subtotal = billableQuantity * unitPrice;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstPercent = includeGst ? this.getItemTaxPercent(item) : 0;
    const gstType = this.getItemGstType(item, String(options.gst_type || 'CGST/SGST'));
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const breakdown = this.getBreakdownFromTax(gstAmount, gstType);

    return {
      requested_quantity: requestedQuantity,
      base_quantity: billableQuantity,
      free_quantity: freeQuantity,
      unit_price: this.round(unitPrice),
      discount_percent: discountPercent,
      tax_percent: gstPercent,
      gst_type: gstType,
      subtotal: this.round(subtotal),
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      gst_amount: this.round(gstAmount),
      cgst_amount: this.round(breakdown.cgst_amount),
      sgst_amount: this.round(breakdown.sgst_amount),
      igst_amount: this.round(breakdown.igst_amount),
      total_amount: this.round(taxableAmount + gstAmount),
      _raw: {
        subtotal,
        discount_amount: discountAmount,
        taxable_amount: taxableAmount,
        gst_amount: gstAmount,
        cgst_amount: breakdown.cgst_amount,
        sgst_amount: breakdown.sgst_amount,
        igst_amount: breakdown.igst_amount,
        total_amount: taxableAmount + gstAmount,
        base_quantity: billableQuantity,
        requested_quantity: requestedQuantity
      }
    };
  }

  /**
   * Calculate single item - reusable across all modules
   * @param {any} item - Item with quantity, rate, discount, etc.
   * @param {CalculationOptions} options - Optional settings like gst_type
   * @returns {CalculatedItem} Calculated item with all amounts
   */
  static calculateItem(item: any, options: CalculationOptions = {}): CalculatedItem {
    const gstType = String(options.gst_type || 'CGST/SGST');

    // Parse inputs using centralized field aliases
    // This ensures we always check canonical name first, then fallback to aliases
    const unit_price = getNumericField(item, 'unit_price', 0);
    const quantity = getNumericField(item, 'quantity', 0);
    const baseQuantity = quantity; // base_quantity = billable quantity (always same as quantity)
    const freeQuantity = getNumericField(item, 'free_quantity', 0);
    const discountPercent = getNumericField(item, 'discount_percent', 0);
    const gstPercent = this.getItemTaxPercent(item);

    // PRODUCTION LOGIC: Use quantity for billing calculations
    // Free items are truly FREE and don't affect pricing
    const subtotal = unit_price * baseQuantity;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const totalAmount = taxableAmount + gstAmount;

    // GST breakdown
    const lineGstType = this.getItemGstType(item, gstType);
    const breakdown = this.getBreakdownFromTax(gstAmount, lineGstType);

    // Return enriched item with all calculations
    // NOTE: We store BOTH raw values (for aggregation) and rounded values (for display)
    // This prevents cumulative rounding errors during aggregation
    return {
      ...item,
      // Quantities - include calculables for convenience
      base_quantity: baseQuantity,      // Billable quantity (clearer name)
      quantity: baseQuantity,           // Alias for compatibility
      free_quantity: freeQuantity,
      total_quantity: baseQuantity + freeQuantity,  // Total including free

      // Raw values for aggregation (FULL PRECISION - no rounding)
      _raw: {
        subtotal,
        discount_amount: discountAmount,
        taxable_amount: taxableAmount,
        gst_amount: gstAmount,
        cgst_amount: breakdown.cgst_amount,
        sgst_amount: breakdown.sgst_amount,
        igst_amount: breakdown.igst_amount,
        total_amount: totalAmount
      },

      // Rounded values for display (2 decimal places)
      unit_price: this.round(unit_price),
      subtotal: this.round(subtotal),
      discount_percent: discountPercent,
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      gst_percent: gstPercent,
      gst_amount: this.round(gstAmount),
      tax_percent: gstPercent,
      cgst_amount: this.round(breakdown.cgst_amount),
      sgst_amount: this.round(breakdown.sgst_amount),
      igst_amount: this.round(breakdown.igst_amount),
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
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableBeforeScheme = 0;

    const calculatedItems = items.map(item => {
      const calculated = this.calculateItem(item, options);
      const raw = calculated._raw || calculated;
      grossAmount += raw.subtotal;
      totalDiscount += raw.discount_amount;
      taxableBeforeScheme += raw.taxable_amount;
      return calculated;
    });

    const freightCharges = this.toNumber(options.freight_charges ?? options.delivery_charges, 0);
    const invoiceDiscount = this.toNumber(options.invoice_discount ?? options.additional_discount, 0);

    let adjustedItems = calculatedItems;
    let totalGst = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    if (invoiceDiscount > 0 && taxableBeforeScheme > 0) {
      const taxableItems = calculatedItems.filter(item => (item._raw?.taxable_amount ?? item.taxable_amount ?? 0) > 0);
      let allocatedSchemeDiscount = 0;

      adjustedItems = calculatedItems.map(item => {
        const raw = item._raw || item;
        if (raw.taxable_amount <= 0) {
          return item;
        }

        const isLastTaxableItem = taxableItems[taxableItems.length - 1] === item;
        const proportionalDiscount = isLastTaxableItem
          ? invoiceDiscount - allocatedSchemeDiscount
          : this.round(invoiceDiscount * (raw.taxable_amount / taxableBeforeScheme));
        allocatedSchemeDiscount += proportionalDiscount;

        const adjustedTaxableAmount = Math.max(0, raw.taxable_amount - proportionalDiscount);
        const itemTaxPercent = this.getItemTaxPercent(item);
        const itemGstType = this.getItemGstType(item, String(options.gst_type || 'CGST/SGST'));
        const adjustedTaxAmount = adjustedTaxableAmount * itemTaxPercent / 100;
        const breakdown = this.getBreakdownFromTax(adjustedTaxAmount, itemGstType);

        totalGst += adjustedTaxAmount;
        cgstTotal += breakdown.cgst_amount;
        sgstTotal += breakdown.sgst_amount;
        igstTotal += breakdown.igst_amount;

        return {
          ...item,
          taxable_amount: this.round(adjustedTaxableAmount),
          gst_amount: this.round(adjustedTaxAmount),
          cgst_amount: this.round(breakdown.cgst_amount),
          sgst_amount: this.round(breakdown.sgst_amount),
          igst_amount: this.round(breakdown.igst_amount),
          total_amount: this.round(adjustedTaxableAmount + adjustedTaxAmount),
          _raw: {
            ...raw,
            taxable_amount: adjustedTaxableAmount,
            gst_amount: adjustedTaxAmount,
            cgst_amount: breakdown.cgst_amount,
            sgst_amount: breakdown.sgst_amount,
            igst_amount: breakdown.igst_amount,
            total_amount: adjustedTaxableAmount + adjustedTaxAmount
          }
        };
      });
    } else {
      adjustedItems.forEach(item => {
        const raw = item._raw || item;
        totalGst += raw.gst_amount;
        cgstTotal += raw.cgst_amount;
        sgstTotal += raw.sgst_amount;
        igstTotal += raw.igst_amount;
      });
    }

    const taxableAfterSchemeDiscount = Math.max(0, taxableBeforeScheme - invoiceDiscount);
    const roundFinalAmount = options.round_final_amount !== false;
    const netAmount = taxableAfterSchemeDiscount + totalGst + freightCharges;
    const finalAmount = roundFinalAmount ? Math.round(netAmount) : this.round(netAmount);
    const roundOff = roundFinalAmount ? this.round(finalAmount - netAmount) : 0;

    return {
      items: adjustedItems,
      totals: this.buildInvoiceTotals({
        grossAmount,
        totalDiscount,
        taxableBeforeScheme,
        schemeDiscount: invoiceDiscount,
        totalGst,
        cgstAmount: cgstTotal,
        sgstAmount: sgstTotal,
        igstAmount: igstTotal,
        freightCharges,
        roundOff,
        finalAmount,
        roundFinalAmount
      })
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

  static calculateReturnTotals(items: any[] = [], options: CalculationOptions = {}) {
    const selectedItems = options.selected_only === false
      ? items
      : items.filter(item => item?.selected !== false);

    let subtotal = 0;
    let taxAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let totalReturnQuantity = 0;

    const calculatedItems = selectedItems
      .filter(item => this.toNumber(item?.[options.quantity_field || 'return_quantity'] ?? item?.return_quantity ?? item?.quantity, 0) > 0)
      .map(item => {
        const calculated = this.calculateReturnLine(item, options);
        const raw = calculated._raw;

        subtotal += raw.taxable_amount;
        taxAmount += raw.gst_amount;
        cgstAmount += raw.cgst_amount;
        sgstAmount += raw.sgst_amount;
        igstAmount += raw.igst_amount;
        totalReturnQuantity += raw.requested_quantity;

        return {
          ...item,
          ...calculated
        };
      });

    const roundFinalAmount = options.round_final_amount !== false;
    const preRoundTotal = subtotal + taxAmount;
    const totalAmount = roundFinalAmount ? Math.round(preRoundTotal) : this.round(preRoundTotal);
    const roundOffAmount = roundFinalAmount ? this.round(totalAmount - preRoundTotal) : 0;

    return {
      items: calculatedItems,
      totals: {
        subtotal: this.round(subtotal),
        subtotal_amount: this.round(subtotal),
        tax_amount: this.round(taxAmount),
        total_tax: this.round(taxAmount),
        total_tax_amount: this.round(taxAmount),
        cgst_amount: this.round(cgstAmount),
        sgst_amount: this.round(sgstAmount),
        igst_amount: this.round(igstAmount),
        round_off: this.round(roundOffAmount),
        round_off_amount: this.round(roundOffAmount),
        total_amount: totalAmount,
        final_amount: totalAmount,
        total_return_quantity: this.round(totalReturnQuantity)
      }
    };
  }

  static calculateSalesReturn(returnData: any) {
    return this.calculateReturnTotals(returnData?.items || [], {
      gst_type: returnData?.gst_type,
      include_gst: !returnData?.withhold_gst,
      selected_only: true,
      quantity_field: 'return_quantity',
      paid_quantity_field: 'paid_quantity',
      free_quantity_field: 'free_quantity',
      cap_to_paid_quantity: true,
      round_final_amount: true
    });
  }

  static calculatePurchaseReturn(returnData: any) {
    return this.calculateReturnTotals(returnData?.items || [], {
      gst_type: returnData?.gst_type,
      include_gst: returnData?.include_gst !== false,
      selected_only: true,
      quantity_field: 'return_quantity',
      round_final_amount: true
    });
  }

  static calculateNoteTotals(items: any[] = [], options: CalculationOptions = {}) {
    return this.calculateReturnTotals(items, {
      ...options,
      include_gst: options.include_gst !== false,
      selected_only: options.selected_only ?? true,
      quantity_field: options.quantity_field || 'quantity',
      round_final_amount: false
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
