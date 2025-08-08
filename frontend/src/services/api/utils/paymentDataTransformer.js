/**
 * Payment Data Transformer
 * Utility functions for transforming payment data between frontend and backend formats
 */

export const paymentDataTransformer = {
  /**
   * Transform payment data for API submission
   */
  toAPI: (paymentData) => ({
    ...paymentData,
    amount: parseFloat(paymentData.amount) || 0,
    payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
  }),

  /**
   * Transform API response to frontend format
   */
  fromAPI: (apiData) => ({
    ...apiData,
    amount: apiData.amount?.toString() || '0',
    payment_date: apiData.payment_date || new Date().toISOString().split('T')[0],
  }),
};

export default paymentDataTransformer;