/**
 * useSalesReturn Hook
 * 
 * Extracted from SalesReturnFlow.tsx (1,155 lines)
 * Handles sales return workflow: customer/invoice selection, items, validation, and submission.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { returnsApi, customersApi, metadataApi } from '../../../services/api';
import InvoiceApiService from '../../../services/invoicesApiService';
import offlineStorage from '../../../services/offlineStorage';
import { getApiBaseUrl } from '../../../config/apiBase';
import { useToast } from '../../global';

const API_BASE_URL = getApiBaseUrl();

// Types
export interface ReturnItem {
    id?: string | number;
    product_id: number;
    product_name: string;
    batch_id?: number;
    batch_number?: string;
    batch_number?: string;
    manufacturing_date?: string;
    expiry_date?: string;
    rate: number;
    tax_percent: number;
    quantity: number;
    paid_quantity: number;
    free_quantity: number;
    return_quantity: number;
    max_returnable_qty: number;
    return_reason?: string;
    selected: boolean;
    hsn_code?: string;
    unit?: string;
    manufacturer?: string;
    is_manual?: boolean;
    available_stock?: number;
    discount_percent: number;
    disposition?: string;
    invoice_item_id?: number;
}

export interface ReturnData {
    return_no: string;
    return_date: string;
    customer_id: string;
    customer_details: any | null;
    invoice_id: string;
    invoice_no: string;
    invoice_date: string;
    original_invoice: any | null;
    items: ReturnItem[];
    return_reason: string;
    return_reason_notes: string;
    return_method: string;
    subtotal_amount: number;
    tax_amount: number;
    total_amount: number;
    credit_note_no: string;
    status: string;
    include_gst: boolean;
    credit_adjustment_type: string;
}

export interface UseSalesReturnProps {
    onClose: () => void;
}

export interface UseSalesReturnReturn {
    // State
    currentStep: number;
    loading: boolean;
    saving: boolean;

    // Data
    returnData: ReturnData;
    selectedCustomer: any | null;
    selectedInvoice: any | null;
    customerDues: number;
    returnReasons: Array<{ value: string; label: string }>;
    availableBatches: Record<number, any[]>;

    // UI State
    showCustomerModal: boolean;
    showManualEntry: boolean;
    showInvoiceSection: boolean;

    // Refs
    customerSearchRef: React.RefObject<any>;
    invoiceSearchRef: React.RefObject<any>;
    firstInputRef: React.RefObject<any>;
    historyButtonRef: React.RefObject<any>;

    // Actions
    setReturnData: React.Dispatch<React.SetStateAction<ReturnData>>;
    setShowCustomerModal: (v: boolean) => void;
    setCurrentStep: (s: number) => void;

    // Handlers
    handleCustomerSelect: (customer: any) => void;
    handleInvoiceSelect: (invoice: any) => void;
    handleSkipInvoiceSelection: () => void;
    addManualItem: (product: any) => void;
    removeManualItem: (itemId: string | number) => void;
    updateReturnItem: (indexOrId: number | string, field: string, value: any) => void;
    validateReturn: () => boolean;
    handleProceedToReview: () => void;
    handleSaveReturn: () => Promise<void>;
    handlePrint: () => void;
}

function generateReturnNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SR-${dateStr}${randomNum}`;
}

export function useSalesReturn({ onClose }: UseSalesReturnProps): UseSalesReturnReturn {
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    // Refs
    const customerSearchRef = useRef<any>(null);
    const invoiceSearchRef = useRef<any>(null);
    const firstInputRef = useRef<any>(null);
    const historyButtonRef = useRef<any>(null);

    // Return data state
    const [returnData, setReturnData] = useState<ReturnData>({
        return_no: generateReturnNumber(),
        return_date: new Date().toISOString().split('T')[0],
        customer_id: '',
        customer_details: null,
        invoice_id: '',
        invoice_no: '',
        invoice_date: '',
        original_invoice: null,
        items: [],
        return_reason: '',
        return_reason_notes: '',
        return_method: 'credit_note',
        subtotal_amount: 0,
        tax_amount: 0,
        total_amount: 0,
        credit_note_no: '',
        status: 'PENDING',
        include_gst: true,
        credit_adjustment_type: 'future'
    });

    const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [customerDues, setCustomerDues] = useState(0);
    const [returnReasons, setReturnReasons] = useState<Array<{ value: string; label: string }>>([]);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [showInvoiceSection, setShowInvoiceSection] = useState(true);
    const [manualItemCounter, setManualItemCounter] = useState(1);
    const [availableBatches, setAvailableBatches] = useState<Record<number, any[]>>({});

    // Load return reasons
    useEffect(() => {
        const loadReturnReasons = async () => {
            const defaultReasons = [
                { value: 'EXPIRED', label: 'Expired Product' },
                { value: 'DAMAGED', label: 'Damaged Product' },
                { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered' },
                { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
                { value: 'NOT_REQUIRED', label: 'Not Required' },
                { value: 'OTHER', label: 'Other' }
            ];
            setReturnReasons(defaultReasons);

            try {
                const cached = await offlineStorage.getOffline('sales_return_reasons', { persistent: true });
                if (cached?.data?.length > 0) {
                    setReturnReasons(cached.data);
                }

                const response = await metadataApi.getReturnReasons();
                const fetchedReasons = response.data?.sales_return_reasons || [];

                if (fetchedReasons.length > 0) {
                    setReturnReasons(fetchedReasons);
                    await offlineStorage.storeOffline('sales_return_reasons', fetchedReasons, { persistent: true });
                }
            } catch {
                // Keep default reasons
            }
        };

        loadReturnReasons();
    }, []);

    // Calculate totals
    const calculateTotals = useCallback(() => {
        let subtotal = 0;
        let taxAmount = 0;

        returnData.items.forEach(item => {
            if (item.selected && item.return_quantity > 0) {
                const returnQty = parseFloat(String(item.return_quantity)) || 0;
                const paidQty = Math.max(0, parseFloat(String(item.paid_quantity || 0)));
                const paidReturnQty = Math.min(returnQty, paidQty);

                if (paidReturnQty <= 0) return;

                const rate = parseFloat(String(item.rate)) || 0;
                const discountPercent = parseFloat(String(item.discount_percent)) || 0;

                const baseAmount = paidReturnQty * rate;
                const discountAmount = (baseAmount * discountPercent) / 100;
                const afterDiscount = baseAmount - discountAmount;

                const taxPercent = (!selectedCustomer?.gst_number || returnData.include_gst)
                    ? (parseFloat(String(item.tax_percent)) || 0)
                    : 0;
                const itemTax = (afterDiscount * taxPercent) / 100;

                subtotal += afterDiscount;
                taxAmount += itemTax;
            }
        });

        const total = subtotal + taxAmount;

        setReturnData(prev => ({
            ...prev,
            subtotal_amount: subtotal,
            tax_amount: taxAmount,
            total_amount: total
        }));
    }, [returnData.items, selectedCustomer, returnData.include_gst]);

    // Recalculate on item changes
    useEffect(() => {
        calculateTotals();
    }, [calculateTotals]);

    // Handlers
    const handleCustomerSelect = useCallback(async (customer: any) => {
        if (!customer) {
            setSelectedCustomer(null);
            setSelectedInvoice(null);
            setShowInvoiceSection(true);
            setShowManualEntry(false);
            setReturnData(prev => ({
                ...prev,
                customer_id: '',
                customer_details: null,
                invoice_id: '',
                items: []
            }));
            return;
        }

        const fullCustomer = {
            ...customer,
            customer_name: customer.customer_name || customer.name,
            address: customer.address || customer.billing_address || '',
            phone: customer.phone || customer.mobile || '',
            gst_number: customer.gst_number || customer.gst_number || ''
        };

        setSelectedCustomer(fullCustomer);
        setSelectedInvoice(null);
        setShowInvoiceSection(true);
        setShowManualEntry(false);
        setReturnData(prev => ({
            ...prev,
            customer_id: customer.id || customer.customer_id,
            customer_details: fullCustomer,
            invoice_id: '',
            items: []
        }));

        try {
            const detailResponse = await customersApi.getById(customer.id || customer.customer_id);
            if (detailResponse?.data) {
                setSelectedCustomer({ ...fullCustomer, ...detailResponse.data });
                setCustomerDues(detailResponse.data.outstanding_amount || 0);
            }
        } catch {
            setCustomerDues(0);
        }
    }, []);

    const handleInvoiceSelect = useCallback(async (invoice: any) => {
        if (!invoice) return;

        setSelectedInvoice(invoice);
        setReturnData(prev => ({
            ...prev,
            invoice_id: invoice.id || invoice.invoice_id,
            invoice_no: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            original_invoice: invoice
        }));

        if (!invoice.items || invoice.items.length === 0) {
            try {
                const fullInvoice = await InvoiceApiService.getInvoiceById(invoice.id || invoice.invoice_id);
                if (fullInvoice.success && fullInvoice.data) {
                    const items = fullInvoice.data.items || [];
                    setReturnData(prev => ({
                        ...prev,
                        items: items.map((item: any) => {
                            const totalQty = parseFloat(item.quantity || 0);
                            const freeQty = parseFloat(item.free_quantity || 0);
                            const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0);

                            return {
                                ...item,
                                return_quantity: totalQty,
                                selected: true,
                                paid_quantity: totalQty - freeQty,
                                free_quantity: freeQty,
                                quantity: totalQty,
                                rate: item.unit_price || item.rate || 0,
                                discount_percent: item.discount_percent || 0,
                                tax_percent: gstPercent,
                                max_returnable_qty: totalQty,
                                disposition: 'RESTOCK'
                            };
                        })
                    }));
                }
            } catch {
                toast.error('Failed to load invoice items');
            }
        } else {
            setReturnData(prev => ({
                ...prev,
                items: invoice.items.map((item: any) => {
                    const totalQty = parseFloat(item.quantity || 0);
                    const freeQty = parseFloat(item.free_quantity || 0);
                    const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) || item.tax_percent || 0;

                    return {
                        ...item,
                        return_quantity: totalQty,
                        selected: true,
                        paid_quantity: totalQty - freeQty,
                        free_quantity: freeQty,
                        quantity: totalQty,
                        rate: item.unit_price || item.rate || 0,
                        discount_percent: item.discount_percent || 0,
                        tax_percent: gstPercent,
                        max_returnable_qty: totalQty,
                        disposition: 'RESTOCK'
                    };
                })
            }));
        }
    }, [toast]);

    const handleSkipInvoiceSelection = useCallback(() => {
        setSelectedInvoice(null);
        setShowManualEntry(true);
        setShowInvoiceSection(false);
        setReturnData(prev => ({
            ...prev,
            invoice_id: '',
            invoice_no: '',
            invoice_date: '',
            original_invoice: null,
            items: []
        }));
    }, []);

    const fetchBatchesForProduct = useCallback(async (productId: number) => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/inventory/batches/product/${productId}`,
                {
                    headers: {
                        'X-Org-Id': localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id') || ''
                    }
                }
            );
            if (response.ok) {
                const batches = await response.json();
                setAvailableBatches(prev => ({
                    ...prev,
                    [productId]: batches.filter((b: any) => b.quantity_available > 0)
                }));
            }
        } catch {
            // Handle error
        }
    }, []);

    const addManualItem = useCallback(async (product: any) => {
        if (!product) return;

        if (showManualEntry) {
            await fetchBatchesForProduct(product.product_id);
        }

        const sellingPrice = parseFloat(product.sale_price || product.selling_price || product.mrp || 0);
        const gstPercent = parseFloat(product.gst_percent || product.tax_rate || 0);

        const newItem: ReturnItem = {
            id: `manual-${manualItemCounter}`,
            product_id: product.product_id,
            product_name: product.product_name || product.name,
            batch_id: product.batch_id,
            batch_number: product.batch_number || product.batch_number || '',
            batch_number: product.batch_number || product.batch_number || '',
            rate: sellingPrice,
            tax_percent: gstPercent,
            quantity: 1,
            paid_quantity: 1,
            free_quantity: 0,
            return_quantity: 1,
            max_returnable_qty: 999999,
            selected: true,
            hsn_code: product.hsn_code || '',
            unit: product.unit || 'PCS',
            is_manual: true,
            discount_percent: 0,
            disposition: 'QUARANTINE'
        };

        setReturnData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        setManualItemCounter(prev => prev + 1);
    }, [showManualEntry, manualItemCounter, fetchBatchesForProduct]);

    const removeManualItem = useCallback((itemId: string | number) => {
        setReturnData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }));
    }, []);

    const updateReturnItem = useCallback((indexOrId: number | string, field: string, value: any) => {
        const actualField = field === 'quantity' ? 'return_quantity' : field;

        setReturnData(prev => ({
            ...prev,
            items: prev.items.map((item, index) => {
                if (index === indexOrId || item.id === indexOrId) {
                    return { ...item, [actualField]: value };
                }
                return item;
            })
        }));
    }, []);

    const validateReturn = useCallback((): boolean => {
        if (!selectedCustomer) {
            toast.error('Please select a customer');
            return false;
        }

        if (!selectedInvoice && !showManualEntry) {
            toast.error('Please select an invoice or use manual entry');
            return false;
        }

        const hasSelectedItems = returnData.items.some(item =>
            item.selected && item.return_quantity > 0
        );

        if (!hasSelectedItems) {
            toast.error('Please add items to return');
            return false;
        }

        if (!returnData.return_reason) {
            toast.error('Please select a return reason');
            return false;
        }

        return true;
    }, [selectedCustomer, selectedInvoice, showManualEntry, returnData.items, returnData.return_reason, toast]);

    const handleProceedToReview = useCallback(() => {
        if (validateReturn()) {
            setCurrentStep(2);
            window.scrollTo(0, 0);
        }
    }, [validateReturn]);

    const handleSaveReturn = useCallback(async () => {
        if (!validateReturn()) return;

        setSaving(true);
        try {
            const response = await returnsApi.createSaleReturn(returnData);

            if (response.data) {
                const { credit_note_no, has_gst, message } = response.data;

                if (credit_note_no) {
                    toast.success(`Sales return created with Credit Note: ${credit_note_no}`);
                } else if (has_gst === false) {
                    toast.success('Sales return created (No GST credit note)');
                } else {
                    toast.success(message || 'Sales return created successfully');
                }
            } else {
                toast.success('Sales return created successfully');
            }

            setTimeout(() => onClose(), 2500);
        } catch (error: any) {
            const errorMessage = Array.isArray(error.message)
                ? error.message[0]?.msg || 'Failed to create return'
                : error.message || 'Failed to create return';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [returnData, validateReturn, toast, onClose]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    return {
        currentStep,
        loading,
        saving,
        returnData,
        selectedCustomer,
        selectedInvoice,
        customerDues,
        returnReasons,
        availableBatches,
        showCustomerModal,
        showManualEntry,
        showInvoiceSection,
        customerSearchRef,
        invoiceSearchRef,
        firstInputRef,
        historyButtonRef,
        setReturnData,
        setShowCustomerModal,
        setCurrentStep,
        handleCustomerSelect,
        handleInvoiceSelect,
        handleSkipInvoiceSelection,
        addManualItem,
        removeManualItem,
        updateReturnItem,
        validateReturn,
        handleProceedToReview,
        handleSaveReturn,
        handlePrint
    };
}

export default useSalesReturn;
