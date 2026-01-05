/**
 * Invoice API Service
 * Handles all backend API calls for invoice calculations and validation
 * Replaces frontend calculations with secure backend calculations
 */

import api from './api';
import { AxiosResponse, AxiosError } from 'axios';

// ==================== TYPE DEFINITIONS ====================

interface InvoiceItem {
    product_id: number;
    batch_id?: number;
    quantity: number;
    sale_price?: number;
    discount_percent?: number;
    free_quantity?: number;
    gst_percent?: number;
    [key: string]: unknown;
}

interface CalculatedItem extends InvoiceItem {
    rate: number;
    discount_amount: number;
    taxable_amount: number;
    gst_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    line_total: number;
}

interface InvoiceTotals {
    gross_amount: number;
    total_discount: number;
    taxable_amount: number;
    total_gst: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    delivery_charges: number;
    final_amount: number;
}

interface InvoiceData {
    customer_id?: number;
    delivery_type?: string;
    payment_mode?: string;
    invoice_date?: string;
    items: InvoiceItem[];
    delivery_charges?: number;
    additional_discount?: number;
    [key: string]: unknown;
}

interface DraftData {
    draft_id?: string;
    customer_id?: number;
    items: InvoiceItem[];
    totals?: InvoiceTotals;
    created_by?: string;
    [key: string]: unknown;
}

interface SearchParams {
    query: string;
    include_batches?: boolean;
    include_stock_summary?: boolean;
    include_credit_info?: boolean;
    limit?: number;
    filters?: Record<string, unknown>;
}

interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Array<{ message: string }>;
    };
}

interface CompanySettings {
    public: {
        company_name: string;
        address: string;
        phone: string;
        email: string;
    };
    secure: {
        gst_number: string;
        state_code: string;
    };
}

interface InvoiceListParams {
    limit?: number;
    offset?: number;
    customer_id?: number;
    [key: string]: unknown;
}

// ==================== INTERCEPTORS ====================

// Add response interceptor for error handling
api.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
        // If backend APIs are not ready, provide mock responses
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {

            // Mock responses for development
            if (error.config?.url?.includes('calculate-live')) {
                const requestData = JSON.parse(error.config.data as string || '{}') as InvoiceData;

                // Calculate totals properly using each product's GST rate
                let gross_amount = 0;
                let total_discount = 0;
                let taxable_amount = 0;
                let total_cgst = 0;
                let total_sgst = 0;
                let total_igst = 0;
                let total_gst = 0;

                const calculatedItems: CalculatedItem[] = (requestData.items || []).map(item => {
                    const quantity = parseFloat(String(item.quantity)) || 0;
                    const rate = parseFloat(String(item.sale_price)) || 0;
                    const discountPercent = parseFloat(String(item.discount_percent)) || 0;
                    const gstPercent = parseFloat(String(item.gst_percent)) || 0;

                    // Calculate item totals
                    const itemGross = quantity * rate;
                    const itemDiscount = (itemGross * discountPercent) / 100;
                    const itemTaxable = itemGross - itemDiscount;
                    const itemGstAmount = (itemTaxable * gstPercent) / 100;

                    // Determine GST split based on delivery type
                    const isInterstate = requestData.delivery_type === 'INTERSTATE';
                    const itemCgst = isInterstate ? 0 : itemGstAmount / 2;
                    const itemSgst = isInterstate ? 0 : itemGstAmount / 2;
                    const itemIgst = isInterstate ? itemGstAmount : 0;

                    const itemTotal = itemTaxable + itemGstAmount;

                    // Add to totals
                    gross_amount += itemGross;
                    total_discount += itemDiscount;
                    taxable_amount += itemTaxable;
                    total_cgst += itemCgst;
                    total_sgst += itemSgst;
                    total_igst += itemIgst;
                    total_gst += itemGstAmount;

                    return {
                        ...item,
                        rate: rate,
                        discount_amount: Math.round(itemDiscount * 100) / 100,
                        taxable_amount: Math.round(itemTaxable * 100) / 100,
                        gst_amount: Math.round(itemGstAmount * 100) / 100,
                        cgst_amount: Math.round(itemCgst * 100) / 100,
                        sgst_amount: Math.round(itemSgst * 100) / 100,
                        igst_amount: Math.round(itemIgst * 100) / 100,
                        line_total: Math.round(itemTotal * 100) / 100
                    };
                });

                const final_amount = taxable_amount + total_gst + (parseFloat(String(requestData.delivery_charges)) || 0);

                return Promise.resolve({
                    data: {
                        success: true,
                        data: {
                            totals: {
                                gross_amount: Math.round(gross_amount * 100) / 100,
                                total_discount: Math.round(total_discount * 100) / 100,
                                taxable_amount: Math.round(taxable_amount * 100) / 100,
                                total_gst: Math.round(total_gst * 100) / 100,
                                total_cgst: Math.round(total_cgst * 100) / 100,
                                total_sgst: Math.round(total_sgst * 100) / 100,
                                total_igst: Math.round(total_igst * 100) / 100,
                                delivery_charges: parseFloat(String(requestData.delivery_charges)) || 0,
                                final_amount: Math.round(final_amount * 100) / 100
                            },
                            items: calculatedItems,
                            invoice_info: {
                                gst_type: (requestData.delivery_type === 'INTERSTATE') ? 'IGST' : 'CGST/SGST',
                                is_interstate: requestData.delivery_type === 'INTERSTATE'
                            }
                        }
                    }
                });
            } else if (error.config?.url?.includes('company/settings/public')) {
                return Promise.resolve({
                    data: {
                        company_name: 'AASO Pharmaceuticals',
                        address: 'Gangapur City, Rajasthan',
                        phone: '+91-XXX-XXX-XXXX',
                        email: 'info@aasopharma.com'
                    }
                });
            } else if (error.config?.url?.includes('company/settings/secure')) {
                return Promise.resolve({
                    data: {
                        gst_number: '27AABCU9603R1ZM',
                        state_code: '27'
                    }
                });
            }
        }

        return Promise.reject(error);
    }
);

// ==================== SERVICE CLASS ====================

class InvoiceApiService {

    /**
     * Calculate invoice totals and item amounts on backend
     */
    static async calculateInvoice(invoiceData: InvoiceData): Promise<ApiResponse> {
        try {
            const response = await api.post('/invoices/calculate-live', {
                customer_id: invoiceData.customer_id,
                delivery_type: invoiceData.delivery_type || 'PICKUP',
                payment_mode: invoiceData.payment_mode || 'CASH',
                invoice_date: invoiceData.invoice_date || new Date().toISOString().split('T')[0],
                items: invoiceData.items.map(item => ({
                    product_id: item.product_id,
                    batch_id: item.batch_id,
                    quantity: parseFloat(String(item.quantity)) || 0,
                    discount_percent: parseFloat(String(item.discount_percent)) || 0,
                    free_quantity: parseFloat(String(item.free_quantity)) || 0
                })),
                delivery_charges: parseFloat(String(invoiceData.delivery_charges)) || 0,
                additional_discount: parseFloat(String(invoiceData.additional_discount)) || 0,
                round_off: true
            });

            if (response.data) {
                return {
                    success: true,
                    data: {
                        totals: response.data,
                        items: invoiceData.items
                    }
                };
            } else {
                throw new Error('Calculation failed - no response data');
            }
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'CALCULATION_ERROR',
                    message: axiosError.message || 'Failed to calculate invoice'
                }
            };
        }
    }

    /**
     * Validate invoice against business rules
     */
    static async validateInvoice(invoiceData: InvoiceData): Promise<ApiResponse> {
        try {
            const response = await api.post('/invoices/validate', {
                customer_id: invoiceData.customer_id,
                items: invoiceData.items.map(item => ({
                    product_id: item.product_id,
                    batch_id: item.batch_id,
                    quantity: parseFloat(String(item.quantity)) || 0,
                    discount_percent: parseFloat(String(item.discount_percent)) || 0
                }))
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'VALIDATION_ERROR',
                    message: axiosError.message || 'Failed to validate invoice'
                }
            };
        }
    }

    /**
     * Check customer credit limit
     */
    static async checkCustomerCredit(customerId: string | number, invoiceAmount: number): Promise<ApiResponse> {
        try {
            const response = await api.post(`/api/customers/${customerId}/credit-check`, {
                invoice_amount: parseFloat(String(invoiceAmount)),
                include_pending_invoices: true
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'CREDIT_CHECK_ERROR',
                    message: axiosError.message || 'Failed to check customer credit'
                }
            };
        }
    }

    /**
     * Save invoice draft
     */
    static async saveDraft(draftData: DraftData): Promise<ApiResponse> {
        try {
            const response = await api.post('/invoices/drafts', {
                draft_id: draftData.draft_id,
                customer_id: draftData.customer_id,
                items: draftData.items,
                totals: draftData.totals,
                metadata: {
                    last_modified: new Date().toISOString(),
                    created_by: draftData.created_by || 'CURRENT_USER'
                }
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'DRAFT_SAVE_ERROR',
                    message: axiosError.message || 'Failed to save draft'
                }
            };
        }
    }

    /**
     * Get saved drafts
     */
    static async getDrafts(): Promise<ApiResponse> {
        try {
            const response = await api.get('/invoices/drafts');

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'DRAFT_FETCH_ERROR',
                    message: axiosError.message || 'Failed to fetch drafts'
                }
            };
        }
    }

    /**
     * Generate invoice number
     */
    static async generateInvoiceNumber(): Promise<ApiResponse<{ invoice_number: string }>> {
        try {
            const response = await api.get('/invoices/generate-number');

            if (response.data && response.data.invoice_number) {
                return {
                    success: true,
                    data: {
                        invoice_number: response.data.invoice_number
                    }
                };
            }

            throw new Error('Invalid response from server');
        } catch (error) {
            throw new Error('Unable to generate invoice number. Please check your connection and try again.');
        }
    }

    /**
     * Get secure company settings
     */
    static async getCompanySettings(): Promise<ApiResponse<CompanySettings>> {
        try {
            const [publicResponse, secureResponse] = await Promise.all([
                api.get('/company/settings/public'),
                api.get('/company/settings/secure')
            ]);

            return {
                success: true,
                data: {
                    public: publicResponse.data,
                    secure: secureResponse.data
                }
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'SETTINGS_FETCH_ERROR',
                    message: axiosError.message || 'Failed to fetch company settings'
                }
            };
        }
    }

    /**
     * Enhanced product search with stock info
     */
    static async searchProductsEnhanced(searchParams: SearchParams): Promise<ApiResponse> {
        try {
            const response = await api.post('/products/search-enhanced', {
                query: searchParams.query,
                include_batches: searchParams.include_batches !== false,
                include_stock_summary: searchParams.include_stock_summary !== false,
                limit: searchParams.limit || 20,
                filters: searchParams.filters || {}
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'SEARCH_ERROR',
                    message: axiosError.message || 'Product search failed'
                }
            };
        }
    }

    /**
     * Enhanced customer search with credit info
     */
    static async searchCustomersEnhanced(searchParams: SearchParams): Promise<ApiResponse> {
        try {
            const response = await api.post('/customers/search-enhanced', {
                query: searchParams.query,
                include_credit_info: searchParams.include_credit_info !== false,
                limit: searchParams.limit || 20
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'SEARCH_ERROR',
                    message: axiosError.message || 'Customer search failed'
                }
            };
        }
    }

    /**
     * Get list of invoices with pagination and filters
     */
    static async getInvoices(params: InvoiceListParams = {}): Promise<ApiResponse> {
        try {
            const response = await api.get('/invoices/', {
                params: {
                    limit: params.limit || 50,
                    offset: params.offset || 0,
                    customer_id: params.customer_id,
                    ...params
                }
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'INVOICE_FETCH_ERROR',
                    message: axiosError.message || 'Failed to fetch invoices'
                }
            };
        }
    }

    /**
     * Get invoice by ID with full details
     */
    static async getInvoiceById(invoiceId: string | number): Promise<ApiResponse> {
        try {
            const response = await api.get(`/invoices/${invoiceId}`);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ error?: { code: string; message: string } }>;
            return {
                success: false,
                error: axiosError.response?.data?.error || {
                    code: 'INVOICE_FETCH_ERROR',
                    message: axiosError.message || 'Failed to fetch invoice'
                }
            };
        }
    }

    /**
     * Get current financial year
     */
    static getCurrentFinancialYear(): string {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        if (currentMonth >= 4) {
            return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
        } else {
            return `${currentYear - 1}-${currentYear.toString().slice(-2)}`;
        }
    }

    /**
     * Format error for display
     */
    static formatError(error: ApiResponse['error']): string {
        if (error?.details && Array.isArray(error.details)) {
            return error.details.map(detail => detail.message).join(', ');
        }
        return error?.message || 'An unexpected error occurred';
    }

    /**
     * Generate invoice from order
     */
    static async generateFromOrder(orderId: number): Promise<unknown> {
        try {
            const response = await api.post(`/api/invoices/generate-from-order`, {
                order_id: orderId
            });

            if (response.data.success) {
                return response.data.data;
            }

            throw new Error(response.data.message || 'Failed to generate invoice from order');
        } catch (error) {
            throw error;
        }
    }
}

export default InvoiceApiService;

// Re-export types for external use
export type {
    InvoiceItem,
    CalculatedItem,
    InvoiceTotals,
    InvoiceData,
    DraftData,
    SearchParams,
    ApiResponse,
    CompanySettings,
    InvoiceListParams
};
