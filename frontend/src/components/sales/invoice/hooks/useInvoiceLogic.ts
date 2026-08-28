import { useState, useEffect, useCallback, useRef, RefObject, Dispatch, SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { calculateInvoicePreview } from '../../../../services/calculations/invoiceCalculationService';
import { employeesApi } from '../../../../services/api';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useCanonicalBusinessDate } from '../../../../hooks/useCanonicalBusinessDate';
import { useCompany } from '../../../../contexts/CompanyContext';
import { Customer } from '../../../../types/models/customer';

// Shared Types - Single Source of Truth
import {
    InvoiceItem as SharedInvoiceItem,
    InvoiceTotals as SharedInvoiceTotals,
    Payment,
    Employee,
    ProductInput,
    PrefilledData,
    ImportData,
    CreatedInvoiceData,
    GstType,
    CustomerAddress,
} from '../types/invoiceTypes';
import {
    prepareImportedItemsForInvoice,
    prepareSelectedProductForInvoice,
} from '../utils/invoiceItemUtils';
import { validateInvoiceItem, sanitizeInvoiceItem } from '../utils/invoiceValidator';
import { useInvoiceSave } from './useInvoiceSave';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { addExactDecimals, type ExactDecimalString } from '../../../../utils/exactDecimal';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

// ==================== HOOK-SPECIFIC TYPE EXTENSIONS ====================
// These extend shared types with required fields for the hook's internal state

export interface InvoiceItem extends SharedInvoiceItem {
    product_id: number | string;
    product_name: string;
    unit_price: string | number;
    mrp: string | number;
    gst_percent: string | number;
    quantity: string | number;
    free_quantity: string | number;
    base_billed_quantity?: string | number;
    base_free_quantity?: string | number;
    source_billed_quantity?: string | number;
    source_free_quantity?: string | number;
    discount_percent: string | number;
    // Calculated fields use the canonical server preview names.
    subtotal?: ExactDecimalString;
    discount_amount?: ExactDecimalString;
    taxable_amount?: ExactDecimalString;
    gst_amount?: ExactDecimalString;
    cgst_amount?: ExactDecimalString;
    sgst_amount?: ExactDecimalString;
    igst_amount?: ExactDecimalString;
    total_amount?: ExactDecimalString;
    // Availability
    available_quantity?: string | number;
    manufacturing_date?: string;
}

export interface InvoiceTotals extends SharedInvoiceTotals {
    gross_amount: ExactDecimalString;
    discount_amount: ExactDecimalString;
    taxable_amount: ExactDecimalString;
    total_gst: ExactDecimalString;
    cgst_total: ExactDecimalString;
    sgst_total: ExactDecimalString;
    igst_total: ExactDecimalString;
    round_off: ExactDecimalString;
    final_amount: ExactDecimalString;
}

export interface Invoice {
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    items: InvoiceItem[];
    customer_name: string;
    customer_details: Customer | null;
    billing_address: string;
    shipping_address: string;
    billing_address_data?: CustomerAddress;
    shipping_address_data?: CustomerAddress;
    gst_type: GstType | '';
    zero_rated_payment_mode: 'not_applicable' | 'with_igst';
    delivery_type: '' | 'PICKUP' | 'DELIVERY' | 'COURIER';
    distance_km: string;
    transport_company: string;
    vehicle_number: string;
    driver_phone: string;
    lr_number: string;
    freight_charges: string | number;
    discount_amount: number;
    discount_percent: number;
    discount_type: 'percentage' | 'fixed';
    payment_mode?: string;
    payment_status?: 'pending' | 'partial' | 'paid';
    payments: Payment[];
    notes: string;
    salesperson_id: number | string | null;
    e_invoice_applicable: boolean;
    e_invoice_number: string;
    irn: string;
    ack_no: string;
    ack_date: string;
    qr_code: string;
    eway_bill_number: string;  // DB column name (no underscore between e and way)
    eway_bill_date: string;
    eway_bill_valid_upto: string;
    final_amount: ExactDecimalString;
    totals: InvoiceTotals | null;
    // Linked challan (auto-created with transport details)
    challan_id?: number;
    challan_number?: string;
    // Legacy field name support
    net_amount?: ExactDecimalString;
    delivery_charges?: ExactDecimalString;
    e_way_bill_number?: string;  // Alias for backwards compatibility
}

// Re-export shared types for consumers of this hook
export type { CreatedInvoiceData, Employee, ProductInput, PrefilledData, ImportData, Payment };

export interface UseInvoiceLogicReturn {
    // State
    invoice: Invoice;
    setInvoice: Dispatch<SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
    setSelectedCustomer: Dispatch<SetStateAction<Customer | null>>;
    employees: Employee[];
    selectedMR: Employee | null;
    setSelectedMR: Dispatch<SetStateAction<Employee | null>>;
    sameAsShipping: boolean;
    setSameAsShipping: Dispatch<SetStateAction<boolean>>;
    isLoading: boolean;
    isOnline: boolean;
    error: string | null;
    setError: Dispatch<SetStateAction<string | null>>;
    documentPolicy: CanonicalDocumentPolicy | null;
    businessDate: string;

    saving: boolean;
    showSuccessModal: boolean;
    setShowSuccessModal: Dispatch<SetStateAction<boolean>>;
    createdInvoiceData: CreatedInvoiceData | null;
    preparedPreview: CanonicalCommandPreview | null;
    reviewOpen: boolean;

    // Modal States
    showCustomerModal: boolean;
    setShowCustomerModal: Dispatch<SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: Dispatch<SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: Dispatch<SetStateAction<boolean>>;

    // Refs
    productSearchRef: RefObject<HTMLInputElement | null>;
    itemsTableRef: RefObject<HTMLDivElement | null>;
    deliveryTypeRef: RefObject<HTMLSelectElement | null>;
    transportRef: RefObject<HTMLInputElement | null>;
    vehicleRef: RefObject<HTMLInputElement | null>;
    deliveryChargesRef: RefObject<HTMLInputElement | null>;

    // Handlers
    handleCustomerSelect: (customer: Customer | null) => void;
    handleAddItem: (product: ProductInput) => Promise<void>;
    handleUpdateItem: (index: number, field: string, value: unknown) => void;
    handleRemoveItem: (index: number) => void;
    handleImport: (importData: ImportData) => Promise<void>;
    resetInvoice: () => void;
    handleSaveInvoice: () => Promise<void>;
    confirmPreparedInvoice: () => Promise<void>;
    closeInvoiceReview: () => void;

}

// ==================== HELPER FUNCTIONS ====================
// (Moved to ../utils/invoiceItemUtils.ts)

export const createInitialInvoice = (businessDate = ''): Invoice => ({
    invoice_number: '',
    invoice_date: businessDate,
    due_date: '',
    items: [],
    customer_name: '',
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    // The canonical calculation preview resolves the tax treatment from the
    // branch, customer, document date, and reviewed tax registration facts.
    gst_type: '',
    zero_rated_payment_mode: 'not_applicable',
    delivery_type: '',
    distance_km: '',
    transport_company: '',
    vehicle_number: '',
    driver_phone: '',
    lr_number: '',
    // The item-step preview runs before the logistics step is shown. Start
    // from an explicit neutral freight amount so the canonical calculation
    // request is complete; the operator can still change it on step two.
    freight_charges: '0.00',
    discount_amount: 0,
    discount_percent: 0,
    discount_type: 'percentage',
    payments: [],
    notes: '',
    salesperson_id: null,
    e_invoice_applicable: false,
    e_invoice_number: '',
    irn: '',
    ack_no: '',
    ack_date: '',
    qr_code: '',
    eway_bill_number: '',
    eway_bill_date: '',
    eway_bill_valid_upto: '',
    final_amount: '0.00',
    totals: null,
});

// ==================== MAIN HOOK ====================

export const useInvoiceLogic = (
    onClose?: () => void,
    prefilledData: PrefilledData | null = null
): UseInvoiceLogicReturn => {
    // Network Status
    const { isOnline } = useNetworkStatus();

    // Company Info (for GST type determination)
    const { companyInfo } = useCompany();
    const {
        businessDate,
        documentPolicy,
        loading: businessDateLoading,
        error: businessDateError,
    } = useCanonicalBusinessDate();

    // Core State - using canonical backend names
    const [invoice, setInvoice] = useState<Invoice>(createInitialInvoice);

    // Supporting State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedMR, setSelectedMR] = useState<Employee | null>(null);
    const [sameAsShipping, setSameAsShipping] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (businessDate) {
            setInvoice(previous => ({
                ...previous,
                invoice_date: previous.invoice_date || businessDate,
                zero_rated_payment_mode: previous.zero_rated_payment_mode
                    || documentPolicy?.default_zero_rated_payment_mode
                    || 'not_applicable',
            }));
            return;
        }
        if (!businessDateLoading && businessDateError) {
            setError(previous => previous || businessDateError);
        }
    }, [businessDate, businessDateError, businessDateLoading, documentPolicy]);

    // Save state and logic managed by useInvoiceSave
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdInvoiceData, setCreatedInvoiceData] = useState<CreatedInvoiceData | null>(null);

    // Modal States
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    // Refs
    const productSearchRef = useRef<HTMLInputElement | null>(null);
    const itemsTableRef = useRef<HTMLDivElement | null>(null);
    const deliveryTypeRef = useRef<HTMLSelectElement | null>(null);
    const transportRef = useRef<HTMLInputElement | null>(null);
    const vehicleRef = useRef<HTMLInputElement | null>(null);
    const deliveryChargesRef = useRef<HTMLInputElement | null>(null);


    // Save Logic: canonical API confirmation only.
    const {
        saving,
        preparedPreview,
        reviewOpen,
        handleSaveInvoice,
        confirmPreparedInvoice,
        closeInvoiceReview,
    } = useInvoiceSave({
        invoice,
        selectedCustomer,
        companyInfo,
        documentPolicy,
        businessDate,
        isOnline,
        setInvoice,
        setCreatedInvoiceData,
        setShowSuccessModal,
        setError
    });


    // Initialize invoice data
    useEffect(() => {
        const initializeInvoice = async () => {
            try {
                setIsLoading(true);

                // The canonical API assigns the final invoice number on execute.
                // Load employee choices directly from the API without local caches.
                try {
                    const employeeResponse = await employeesApi.getAll({ limit: 100 });
                    const employeesList = employeeResponse.data.employees as Employee[];
                    const uniqueEmployees = Array.from(
                        new Map(employeesList.map((employee: Employee) => [employee.employee_id, employee])).values()
                    );
                    setEmployees(uniqueEmployees);
                } catch (employeeError) {
                    console.error('Unable to fetch employees from API:', employeeError);
                    setEmployees([]);
                }

                // If prefilled data provided, merge it
                if (prefilledData) {
                    if (prefilledData.customer) {
                        setSelectedCustomer(prefilledData.customer as Customer);
                        handleCustomerSelect(prefilledData.customer as Customer);
                    }
                    if (prefilledData.items && prefilledData.items.length > 0) {
                        const transformedItems = prefilledData.items.map(
                            prepareSelectedProductForInvoice,
                        );
                        setInvoice(prev => ({ ...prev, items: transformedItems }));
                    }
                }

                setIsLoading(false);
            } catch (error) {
                console.error('Error initializing invoice:', error);
                setError('Failed to initialize invoice. Please try again.');
                setIsLoading(false);
            }
        };

        initializeInvoice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefilledData]);

    // Recalculate totals when items or discounts change
    useEffect(() => {
        if (!invoice.items || invoice.items.length === 0) {
            return;
        }

        let cancelled = false;
        const timeoutId = window.setTimeout(async () => {
            try {
                const result = await calculateInvoicePreview(invoice, true);
                if (cancelled) return;

                setInvoice(prev => ({
                    ...prev,
                    gst_type: result.gst_type as GstType,
                    items: prev.items.map((item, idx) => ({
                        ...item,
                        ...(result.items[idx] || {}),
                        // Canonical previews return exact JSON strings. Source and
                        // allocation identities remain the posting authority.
                        quantity: item.quantity,
                        free_quantity: item.free_quantity,
                        unit_price: item.unit_price,
                        discount_percent: item.discount_percent,
                        base_billed_quantity: item.base_billed_quantity,
                        base_free_quantity: item.base_free_quantity,
                        source_billed_quantity: item.source_billed_quantity,
                        source_free_quantity: item.source_free_quantity,
                    })),
                    totals: result.totals,
                    final_amount: result.totals.final_amount
                }));
            } catch (calculationError) {
                if (!cancelled) {
                    console.error('Invoice calculation failed:', calculationError);
                    setError('Unable to calculate invoice totals. Please review the entries and try again.');
                }
            }
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // eslint-disable-next-line react-hooks/exhaustive-deps
        JSON.stringify(invoice.items?.map(i => ({
            quantity: i.quantity,
            free_quantity: i.free_quantity,
            free_supply_tax_treatment: i.free_supply_tax_treatment,
            unit_price: i.unit_price,
            discount_percent: i.discount_percent,
            gst_percent: i.gst_percent
        }))),
        invoice.freight_charges,
        invoice.discount_amount,
        invoice.discount_percent,
        invoice.customer_details?.customer_id,
        isOnline
    ]);

    // Handlers
    const handleCustomerSelect = useCallback((customer: Customer | null) => {
        if (!customer) {
            setSelectedCustomer(null);
            setInvoice(prev => ({
                ...prev,
                customer_name: '',
                customer_details: null,
                billing_address: '',
                shipping_address: '',
                billing_address_data: undefined,
                shipping_address_data: undefined,
                gst_type: '',
            }));
            return;
        }

        setSelectedCustomer(customer);

        // Canonical customer search does not project a saved address. AddressForm
        // loads the reviewed UUID-scoped address projection after selection.
        setInvoice(prev => ({
            ...prev,
            customer_name: customer.customer_name,
            customer_details: customer,
            billing_address: '',
            billing_address_data: undefined,
            shipping_address: sameAsShipping ? '' : prev.shipping_address,
            shipping_address_data: sameAsShipping ? undefined : prev.shipping_address_data,
            gst_type: '',
        }));

        // Note: Toast removed to prevent duplicates (parent component may also show selection feedback)
    }, [sameAsShipping]);

    const handleAddItem = useCallback(async (product: ProductInput) => {
        if (!product) return;

        const invoiceItem = prepareSelectedProductForInvoice(product);

        if (!invoiceItem || !invoiceItem.product_name) {
            toast.error('Invalid product data');
            return;
        }

        setInvoice(prev => {
            const existingItemIndex = prev.items.findIndex(item => {
                if (item.batch_id && invoiceItem.batch_id) {
                    return item.product_id === invoiceItem.product_id &&
                        item.batch_id === invoiceItem.batch_id;
                }
                return item.product_id === invoiceItem.product_id;
            });

            if (existingItemIndex >= 0) {
                const updatedItems = [...prev.items];
                // Selecting the same product/batch is additive. The selection's
                // explicit billed/free split is the user's intent; do not turn a
                // free-only or fractional selection into one billed unit.
                updatedItems[existingItemIndex] = {
                    ...updatedItems[existingItemIndex],
                    quantity: addExactDecimals(
                        [updatedItems[existingItemIndex].quantity, invoiceItem.quantity],
                        'Invoice billed quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ),
                    free_quantity: addExactDecimals(
                        [updatedItems[existingItemIndex].free_quantity, invoiceItem.free_quantity],
                        'Invoice free quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ),
                };
                // Note: Toast removed - visual feedback in table is sufficient
                return { ...prev, items: updatedItems };
            } else {
                // SANITIZE: Remove deprecated fields before adding
                const sanitizedItem = sanitizeInvoiceItem(invoiceItem);

                const newItem = {
                    ...sanitizedItem,
                } as any;

                // Note: Toast removed - visual feedback (item appearing in table) is sufficient
                // Users can clearly see the product was added

                // VALIDATION: Catch deprecated fields in development
                validateInvoiceItem(newItem, `new item: ${sanitizedItem.product_name}`);

                return {
                    ...prev,
                    items: [...prev.items, newItem as any]
                };
            }
        });

        // Message already shown via toast.success above
    }, []);

    const handleUpdateItem = useCallback((index: number, field: string, value: unknown) => {
        console.log(`🔄 [UPDATE ITEM] Index: ${index}, Field: ${field}, Value: ${value}`);

        setInvoice(prev => {
            const updatedItems = [...prev.items];
            updatedItems[index] = {
                ...updatedItems[index],
                [field]: value
            };

            console.log('🔄 [UPDATE ITEM] Updated item:', updatedItems[index]);

            return { ...prev, items: updatedItems };
        });
    }, []);

    const handleRemoveItem = useCallback((index: number) => {
        setInvoice(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    }, []);

    const handleImport = useCallback(async (importData: ImportData) => {
        try {
            if (!importData) return;

            const transformedItems = importData.items && importData.items.length > 0
                ? prepareImportedItemsForInvoice(importData.items)
                : null;

            if (importData.customer) {
                handleCustomerSelect(importData.customer as Customer);
            }

            if (transformedItems) {
                setInvoice(prev => ({ ...prev, items: transformedItems }));
            }

            if (importData.delivery_details) {
                const deliveryType = importData.delivery_details.delivery_type;
                const deliveryCharges = importData.delivery_details.delivery_charges;
                setInvoice(prev => ({
                    ...prev,
                    ...(deliveryType ? { delivery_type: deliveryType as Invoice['delivery_type'] } : {}),
                    ...(deliveryCharges !== undefined ? { freight_charges: deliveryCharges } : {}),
                }));
            }

            const sourceType = String(importData.source_type ?? '').trim();
            toast.success(
                `Imported ${importData.items?.length ?? 0} items from ${sourceType || 'canonical document'}`,
            );
        } catch (error) {
            console.error('Import error:', error);
            toast.error('Failed to import data');
        }
    }, [handleCustomerSelect]);

    const resetInvoice = useCallback(() => {
        setInvoice(createInitialInvoice(businessDate));
        setSelectedCustomer(null);
        setSelectedMR(null);
        setSameAsShipping(true);
        setCreatedInvoiceData(null);
        setShowSuccessModal(false);
        setError(null);
    }, [businessDate]);





    return {
        // State
        invoice,
        setInvoice,
        selectedCustomer,
        setSelectedCustomer,
        employees,
        selectedMR,
        setSelectedMR,
        sameAsShipping,
        setSameAsShipping,
        isLoading: isLoading || businessDateLoading,
        isOnline,
        error,
        setError,
        documentPolicy,
        businessDate,

        saving,
        showSuccessModal,
        setShowSuccessModal,
        createdInvoiceData,
        preparedPreview,
        reviewOpen,

        // Modal States
        showCustomerModal,
        setShowCustomerModal,
        showProductModal,
        setShowProductModal,
        showImportModal,
        setShowImportModal,

        // Refs
        productSearchRef,
        itemsTableRef,
        deliveryTypeRef,
        transportRef,
        vehicleRef,
        deliveryChargesRef,

        // Handlers
        handleCustomerSelect,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        handleImport,
        resetInvoice,
        handleSaveInvoice,
        confirmPreparedInvoice,
        closeInvoiceReview,

    };
};
