/**
 * Get consistent display values for invoice
 * ALL components MUST use this for display
 */
export const getInvoiceDisplayValues = (invoice) => {
  // Use consistent field names
  const taxable = parseFloat(invoice.taxable_amount || invoice.subtotal_amount || 0);
  const tax = parseFloat(invoice.tax_amount || invoice.total_tax || 0);
  const delivery = parseFloat(invoice.delivery_charges || 0);
  const discount = parseFloat(invoice.discount_amount || invoice.total_discount || 0);
  const roundOff = parseFloat(invoice.round_off || 0);
  
  // Calculate net amount (final amount after everything)
  const netAmount = taxable + tax + delivery + roundOff;
  
  return {
    items: invoice.items || [],
    itemCount: (invoice.items || []).length,
    
    // Money values
    subtotal: taxable, // After item discounts
    discount: discount, // Invoice level discount
    taxableAmount: taxable,
    taxAmount: tax,
    deliveryCharges: delivery,
    roundOff: roundOff,
    netAmount: netAmount,
    
    // For display
    displayValues: {
      subtotal: `₹${taxable.toFixed(2)}`,
      discount: discount > 0 ? `-₹${discount.toFixed(2)}` : '₹0.00',
      taxable: `₹${taxable.toFixed(2)}`,
      tax: `₹${tax.toFixed(2)}`,
      delivery: `₹${delivery.toFixed(2)}`,
      roundOff: roundOff >= 0 ? `+₹${Math.abs(roundOff).toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`,
      netAmount: `₹${netAmount.toFixed(2)}`
    }
  };
};

export default getInvoiceDisplayValues;