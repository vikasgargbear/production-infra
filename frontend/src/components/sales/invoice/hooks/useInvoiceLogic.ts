import { useState, useEffect, useCallback, useRef, RefObject, Dispatch, SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { calculateInvoicePreview } from '../../../../services/calculations/invoiceCalculationService';
import { employeesApi } from '../../../../services/api';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useCompany } from '../../../../contexts/CompanyContext';
import { getTodayBusinessDate, getDaysFromToday } from '../../../../utils/indianDateUtils';
import { Customer } from '../../../../types/models/customer';
import { determineGstType } from '../../../gst/utils/gstCalculations';

// Shared Types - Single Source of Truth
import {
    InvoiceItem as SharedInvoiceItem,
    InvoiceTotals as SharedInvoiceTotals,
    Payment,
    Employee,
    ProductInput,
    PrefilledData,
    ImportData,
    DiscountData,
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

// ==================== HOOK-SPECIFIC TYPE EXTENSIONS ====================
// These extend shared types with required fields for the hook's internal state

export interface InvoiceItem extends SharedInvoiceItem {
    product_id: number | string;
    product_name: string;
    unit_price: number;
    mrp: number;
    gst_percent: number;
    quantity: number;
    free_quantity: number;
    base_billed_quantity?: number;
    base_free_quantity?: number;
    source_billed_quantity?: number;
    source_free_quantity?: number;
    discount_percent: number;
    // Calculated fields (use canonical names from enterpriseCalculator)
    subtotal?: number;
    discount_amount?: number;
    taxable_amount?: number;
    gst_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    total_amount?: number;
    // Availability
    available_quantity?: number;
    manufacturing_date?: string;
}

export interface InvoiceTotals extends SharedInvoiceTotals {
    gross_amount: number;
    discount_amount: number;
    taxable_amount: number;
    total_gst: number;
    cgst_total: number;
    sgst_total: number;
    igst_total: number;
    round_off: number;
    final_amount: number;
}

export interface Invoice {
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    items: InvoiceItem[];
    customer_details: Customer | null;
    billing_address: string;
    shipping_address: string;
    billing_address_data?: CustomerAddress;
    shipping_address_data?: CustomerAddress;
    gst_type: GstType;
    delivery_type: 'PICKUP' | 'DELIVERY' | 'COURIER';
    transport_company: string;
    vehicle_number: string;
    driver_phone: string;
    lr_number: string;
    freight_charges: number;
    discount_amount: number;
    discount_percent: number;
    discount_type: 'percentage' | 'fixed';
    payment_mode: string;
    payment_status: 'pending' | 'partial' | 'paid';
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
    final_amount: number;
    totals: InvoiceTotals | null;
    // Linked challan (auto-created with transport details)
    challan_id?: number;
    challan_number?: string;
    // Legacy field name support
    net_amount?: number;
    delivery_charges?: number;
    e_way_bill_number?: string;  // Alias for backwards compatibility
}

// Re-export shared types for consumers of this hook
export type { CreatedInvoiceData, Employee, ProductInput, PrefilledData, ImportData, DiscountData, Payment };

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
    showGSTCalculator: boolean;
    setShowGSTCalculator: Dispatch<SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: Dispatch<SetStateAction<boolean>>;
    showBillDiscountModal: boolean;
    setShowBillDiscountModal: Dispatch<SetStateAction<boolean>>;
    showTaxDetailModal: boolean;
    setShowTaxDetailModal: Dispatch<SetStateAction<boolean>>;
    showCashCalculatorModal: boolean;
    setShowCashCalculatorModal: Dispatch<SetStateAction<boolean>>;
    showLastDealModal: boolean;
    setShowLastDealModal: Dispatch<SetStateAction<boolean>>;
    selectedProductForLastDeal: InvoiceItem | null;
    setSelectedProductForLastDeal: Dispatch<SetStateAction<InvoiceItem | null>>;
    showItemProfitModal: boolean;
    setShowItemProfitModal: Dispatch<SetStateAction<boolean>>;

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
    handleApplyBillDiscount: (discountData: DiscountData) => void;
    resetInvoice: () => void;
    handleSaveInvoice: () => Promise<void>;
    confirmPreparedInvoice: () => Promise<void>;
    closeInvoiceReview: () => void;

}

// ==================== HELPER FUNCTIONS ====================
// (Moved to ../utils/invoiceItemUtils.ts)

export const createInitialInvoice = (): Invoice => ({
    invoice_number: '',
    invoice_date: getTodayBusinessDate(),
    due_date: getDaysFromToday(30),
    items: [],
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    transport_company: '',
    vehicle_number: '',
    driver_phone: '',
    lr_number: '',
    freight_charges: 0,
    discount_amount: 0,
    discount_percent: 0,
    discount_type: 'percentage',
    payment_mode: 'credit',
    payment_status: 'pending',
    payments: [{ id: '1', method: 'credit', amount: 0, reference: '' }],
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
    final_amount: 0,
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

    // Core State - using canonical backend names
    const [invoice, setInvoice] = useState<Invoice>(createInitialInvoice);

    // Supporting State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedMR, setSelectedMR] = useState<Employee | null>(null);
    const [sameAsShipping, setSameAsShipping] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Save state and logic managed by useInvoiceSave
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdInvoiceData, setCreatedInvoiceData] = useState<CreatedInvoiceData | null>(null);

    // Modal States
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showGSTCalculator, setShowGSTCalculator] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showBillDiscountModal, setShowBillDiscountModal] = useState(false);
    const [showTaxDetailModal, setShowTaxDetailModal] = useState(false);
    const [showCashCalculatorModal, setShowCashCalculatorModal] = useState(false);
    const [showLastDealModal, setShowLastDealModal] = useState(false);
    const [selectedProductForLastDeal, setSelectedProductForLastDeal] = useState<InvoiceItem | null>(null);
    const [showItemProfitModal, setShowItemProfitModal] = useState(false);

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
                    const rawData = employeeResponse?.data || employeeResponse || [];
                    const employeesList = Array.isArray(rawData)
                        ? rawData
                        : ((rawData as { data?: Employee[]; employees?: Employee[] }).data ||
                            (rawData as { employees?: Employee[] }).employees || []);
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
                        ...(result.items[idx] || {})
                    })),
                    totals: result.totals as InvoiceTotals,
                    final_amount: Number(result.totals.final_amount || 0)
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
                customer_details: null,
                billing_address: '',
                shipping_address: '',
                billing_address_data: undefined,
                shipping_address_data: undefined,
                gst_type: 'CGST/SGST' // Reset to default when no customer
            }));
            return;
        }

        setSelectedCustomer(customer);

        // PRELIMINARY GST type from customer registration state / GSTIN
        // This is a temporary value — gets OVERRIDDEN by determineGstTypeForSupply()
        // when delivery address is selected in InvoiceDetailsStep (Step 2)
        const customerState = (customer as any).state ||
            customer.billing_address?.state ||
            customer.address_info?.billing_state || '';
        const gstType = determineGstType(
            companyInfo?.state,
            customerState,
            (companyInfo as any)?.gst_number,
            customer.gst_number
        );

        const billingAddressData: CustomerAddress = {
            address_line1: customer.address_info?.billing_address || customer.billing_address?.street || '',
            city: customer.address_info?.billing_city || customer.billing_address?.city || '',
            state: customer.address_info?.billing_state || customer.billing_address?.state || '',
            pincode: customer.address_info?.billing_pincode || customer.billing_address?.pincode || '',
            country: 'India',
        };
        const shippingAddressData: CustomerAddress = {
            address_line1: customer.address_info?.shipping_address || customer.shipping_address?.street || billingAddressData.address_line1,
            city: customer.address_info?.shipping_city || customer.shipping_address?.city || billingAddressData.city,
            state: customer.address_info?.shipping_state || customer.shipping_address?.state || billingAddressData.state,
            pincode: customer.address_info?.shipping_pincode || customer.shipping_address?.pincode || billingAddressData.pincode,
            country: 'India',
        };
        const addressString = (address: CustomerAddress): string => [
            address.address_line1,
            address.city,
            address.state,
            address.pincode,
        ].filter(Boolean).join(', ');
        const billingAddress = addressString(billingAddressData);
        const shippingAddress = addressString(shippingAddressData);

        setInvoice(prev => ({
            ...prev,
            customer_details: customer,
            billing_address: billingAddress,
            billing_address_data: billingAddressData,
            shipping_address: sameAsShipping ? (shippingAddress || billingAddress) : prev.shipping_address,
            shipping_address_data: sameAsShipping ? shippingAddressData : prev.shipping_address_data,
            gst_type: gstType // CRITICAL: Set GST type based on state comparison
        }));

        // Note: Toast removed to prevent duplicates (parent component may also show selection feedback)
    }, [sameAsShipping, companyInfo]);

    const handleAddItem = useCallback(async (product: ProductInput) => {
        if (!product) return;

        console.log('📦 [ADD ITEM] Raw product from search:', product);

        const invoiceItem = prepareSelectedProductForInvoice(product);

        console.log('📦 [ADD ITEM] Transformed product:', invoiceItem);

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
                    quantity: updatedItems[existingItemIndex].quantity + invoiceItem.quantity,
                    free_quantity: updatedItems[existingItemIndex].free_quantity
                        + invoiceItem.free_quantity,
                };
                // Note: Toast removed - visual feedback in table is sufficient
                return { ...prev, items: updatedItems };
            } else {
                // SANITIZE: Remove deprecated fields before adding
                const sanitizedItem = sanitizeInvoiceItem(invoiceItem);

                const newItem = {
                    ...sanitizedItem,
                    mrp: sanitizedItem.mrp ?? 0,
                    // PRESERVE user's discount - don't reset!
                    discount_percent: sanitizedItem.discount_percent ?? 0,
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
                setInvoice(prev => ({
                    ...prev,
                    delivery_type: (importData.delivery_details?.delivery_type as Invoice['delivery_type']) || 'PICKUP',
                    freight_charges: importData.delivery_details?.delivery_charges || 0
                }));
            }

            toast.success(`Imported ${importData.items?.length || 0} items from ${importData.source}`);
        } catch (error) {
            console.error('Import error:', error);
            toast.error('Failed to import data');
        }
    }, [handleCustomerSelect]);

    const handleApplyBillDiscount = useCallback((discountData: DiscountData) => {
        setInvoice(prev => ({
            ...prev,
            discount_type: discountData.type,
            discount_amount: discountData.type === 'fixed' ? (discountData.amount || 0) : 0,
            discount_percent: discountData.type === 'percentage' ? (discountData.percentage || 0) : 0
        }));
    }, []);

    const resetInvoice = useCallback(() => {
        setInvoice(createInitialInvoice());
        setSelectedCustomer(null);
        setSelectedMR(null);
        setSameAsShipping(true);
        setCreatedInvoiceData(null);
        setShowSuccessModal(false);
        setError(null);
    }, []);





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
        isLoading,
        isOnline,
        error,
        setError,

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
        showGSTCalculator,
        setShowGSTCalculator,
        showImportModal,
        setShowImportModal,
        showBillDiscountModal,
        setShowBillDiscountModal,
        showTaxDetailModal,
        setShowTaxDetailModal,
        showCashCalculatorModal,
        setShowCashCalculatorModal,
        showLastDealModal,
        setShowLastDealModal,
        selectedProductForLastDeal,
        setSelectedProductForLastDeal,
        showItemProfitModal,
        setShowItemProfitModal,

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
        handleApplyBillDiscount,
        resetInvoice,
        handleSaveInvoice,
        confirmPreparedInvoice,
        closeInvoiceReview,

    };
};
