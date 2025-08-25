/**
 * SINGLE SOURCE OF TRUTH FOR ALL CALCULATIONS
 * USE THIS EVERYWHERE - NO EXCEPTIONS!
 */

export const calculateFinalAmount = (invoice) => {
  const taxable = parseFloat(invoice.taxable_amount || invoice.subtotal_amount || 0);
  const tax = parseFloat(invoice.tax_amount || invoice.total_tax || 0);
  const delivery = parseFloat(invoice.delivery_charges || 0);
  const roundOff = parseFloat(invoice.round_off || 0);
  
  // SIMPLE MATH - NO TRICKS
  const netAmount = taxable + tax + delivery + roundOff;
  
  console.log('SINGLE_CALCULATION:', {
    taxable,
    tax,
    delivery,
    roundOff,
    calculated: netAmount
  });
  
  return {
    taxable,
    tax,
    delivery,
    roundOff,
    netAmount
  };
};

export default calculateFinalAmount;