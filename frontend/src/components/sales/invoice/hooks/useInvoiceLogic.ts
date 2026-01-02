import { useState, useEffect, useCallback, useRef, RefObject, Dispatch, SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { invoicesApi } from '../../../../services/api';
import EnterpriseCalculator from '../../../../services/enterpriseCalculator';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import { employeesAPI } from '../../../../services/api';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { getTodayBusinessDate, getDaysFromToday, getUTCTimestamp } from '../../../../utils/indianDateUtils';
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
    DiscountData,
    CreatedInvoiceData,
    GstType
} from '../types/invoiceTypes';
import { storageService, STORAGE_KEYS } from '../../../../services/core/storageService';

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
    discount_percent: number;
    // Calculated fields
    line_subtotal?: number;
    line_discount?: number;
    line_taxable?: number;
    line_gst?: number;
    line_total?: number;
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
    invoice_no?: string;
    invoice_date: string;
    due_date: string;
    items: InvoiceItem[];
    customer_details: Customer | null;
    billing_address: string;
    shipping_address: string;
    gst_type: GstType;
    delivery_type: 'PICKUP' | 'DELIVERY' | 'COURIER';
    transport_company: string;
    vehicle_number: string;
    freight_charges: number;
    discount_amount: number;
    discount_percent: number;
    discount_type: 'percentage' | 'fixed';
    payment_mode: string;
    payment_status: 'pending' | 'partial' | 'paid';
    payments: Payment[];
    notes: string;
    sales_person_id: number | string | null;
    e_invoice_applicable: boolean;
    e_invoice_number: string;
    irn: string;
    ack_no: string;
    ack_date: string;
    qr_code: string;
    e_way_bill_number: string;
    eway_bill_date: string;
    eway_bill_valid_upto: string;
    final_amount: number;
    totals: InvoiceTotals | null;
    // Legacy field name support
    net_amount?: number;
    delivery_charges?: number;
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
    error: string | null;
    setError: Dispatch<SetStateAction<string | null>>;

    saving: boolean;
    showSuccessModal: boolean;
    setShowSuccessModal: Dispatch<SetStateAction<boolean>>;
    createdInvoiceData: CreatedInvoiceData | null;

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
    handleSaveInvoice: () => Promise<void>;

}

// ==================== HELPER FUNCTIONS ====================

/**
 * Prepare a product for invoice item format
 * 
 * Handles data from multiple sources:
 * 1. /products/search-with-batches → product with best_batch embedded
 * 2. BatchSelector → product with batch_id and batch pricing
 * 3. Legacy search → product with product-level pricing
 * 
 * CANONICAL field names: sale_price_per_unit, mrp_per_unit, quantity_available
 */
const prepareItemForInvoice = (product: ProductInput): InvoiceItem => {
    // If product has best_batch from new API, use it
    const bestBatch = (product as any).best_batch;

    // Get pricing - prioritize batch-level, then product-level
    let unitPrice = 0;
    let mrp = 0;
    let availableQty = 0;
    let batchId = product.batch_id;
    let batchNumber = product.batch_number || product.batch_no || '';
    let expiryDate = product.expiry_date || '';
    let manufacturingDate = product.manufacturing_date || '';

    if (product.batch_id) {
        // BatchSelector: product already has batch data merged - ALWAYS respect user selection
        console.log('[Invoice] Using batch data from BatchSelector (user selected)');
        // CANONICAL: sale_price_per_unit, mrp_per_unit
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || (product as any).unit_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            product.quantity_available || product.available_quantity || 0
        ));
    } else if (bestBatch) {
        // New API: use best_batch ONLY if no batch was explicitly selected
        console.log('[Invoice] Using best_batch from API (auto-selected):', bestBatch);
        unitPrice = parseFloat(String(bestBatch.sale_price_per_unit || 0));
        mrp = parseFloat(String(bestBatch.mrp_per_unit || 0));
        availableQty = parseInt(String(bestBatch.quantity_available || 0));
        batchId = bestBatch.batch_id;
        batchNumber = bestBatch.batch_number || '';
        expiryDate = bestBatch.expiry_date || '';
    } else {
        // Legacy: product-level averages (fallback)
        console.log('[Invoice] Using product-level pricing (no batch selected)');
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || (product as any).sale_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            (product as any).total_stock || product.quantity_available || (product as any).current_stock || 0
        ));
    }

    console.log('[Invoice] Prepared item pricing:', { unitPrice, mrp, availableQty, batchId });

    return {
        product_id: product.product_id || product.id || 0,
        product_name: product.product_name || product.name || '',
        product_code: product.product_code || '',
        batch_id: batchId ?? undefined,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        manufacturing_date: manufacturingDate,
        unit_price: unitPrice,
        mrp: mrp,
        gst_percent: parseFloat(String(product.gst_percent || (product as any).tax_rate || 0)),
        hsn_code: product.hsn_code || '',
        quantity: parseInt(String(product.quantity || 1)),
        free_quantity: parseInt(String(product.free_quantity || 0)),
        available_quantity: availableQty,
        discount_percent: parseFloat(String(product.discount_percent || 0))
    };
};

// ==================== MAIN HOOK ====================

export const useInvoiceLogic = (
    onClose?: () => void,
    prefilledData: PrefilledData | null = null
): UseInvoiceLogicReturn => {
    console.log('[DEBUG] useInvoiceLogic v2 loaded - checking for stale bundle');
    // Network Status
    const { isOnline } = useNetworkStatus();

    // Core State - using canonical backend names
    const [invoice, setInvoice] = useState<Invoice>({
        invoice_number: `DRAFT-${getTodayBusinessDate().replace(/-/g, '')}`,
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
        freight_charges: 0,
        discount_amount: 0,
        discount_percent: 0,
        discount_type: 'percentage',
        payment_mode: 'credit',
        payment_status: 'pending',
        payments: [{
            id: '1',
            method: 'credit',
            amount: 0,
            reference: ''
        }],
        notes: '',
        sales_person_id: null,
        e_invoice_applicable: false,
        e_invoice_number: '',
        irn: '',
        ack_no: '',
        ack_date: '',
        qr_code: '',
        e_way_bill_number: '',
        eway_bill_date: '',
        eway_bill_valid_upto: '',
        final_amount: 0,
        totals: null
    });

    // Supporting State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedMR, setSelectedMR] = useState<Employee | null>(null);
    const [sameAsShipping, setSameAsShipping] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [saving, setSaving] = useState(false);
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

    // Auto-save draft every 30 seconds
    useEffect(() => {
        if (invoice.items.length === 0 || !selectedCustomer) {
            return;
        }

        const autoSaveInterval = setInterval(async () => {
            try {

                const draftData = {
                    ...invoice,
                    customer_id: selectedCustomer.customer_id,
                    customer_details: selectedCustomer,
                    draft_saved_at: getUTCTimestamp()
                };

                storageService.setItem(STORAGE_KEYS.INVOICE_DRAFT, draftData);
                console.log('[Invoice] Auto-saved draft');
            } catch (error) {
                console.error('[Invoice] Auto-save failed:', error);
            }
        }, 30000);

        return () => clearInterval(autoSaveInterval);
    }, [invoice, selectedCustomer]);

    // Load draft on mount - use ref to prevent double execution in StrictMode
    const draftLoadedRef = useRef(false);

    useEffect(() => {
        if (draftLoadedRef.current) {
            return;
        }
        draftLoadedRef.current = true;

        // Clean up old drafts silently
        try {
            const draft = storageService.getItem<{ draft_saved_at: string }>(STORAGE_KEYS.INVOICE_DRAFT);
            if (draft) {
                const draftAge = Date.now() - new Date(draft.draft_saved_at).getTime();
                const maxAge = 24 * 60 * 60 * 1000;
                if (draftAge >= maxAge) {
                    storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);
                }
            }
        } catch {
            // Silent cleanup
        }
    }, []);

    // Initialize invoice data
    useEffect(() => {
        const initializeInvoice = async () => {
            try {
                setIsLoading(true);

                // Load employees for MR selection with caching
                try {
                    const cached = storageService.getItem<Employee[]>(STORAGE_KEYS.EMPLOYEES_CACHE);
                    const cacheTime = storageService.getItem<string>(STORAGE_KEYS.EMPLOYEES_CACHE_TIME);
                    const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

                    if (cached && cacheAge < 2 * 60 * 1000) {
                        console.log('[Invoice] Using cached employees');
                        const uniqueCached = Array.from(
                            new Map(cached.map(e => [e.employee_id, e])).values()
                        );
                        setEmployees(uniqueCached);
                    } else {
                        console.log('[Invoice] Fetching employees from API');
                        const employeeResponse = await employeesAPI.getAll({ limit: 100 });

                        const rawData = employeeResponse?.data || employeeResponse || [];
                        const employeesList = Array.isArray(rawData)
                            ? rawData
                            : ((rawData as { employees?: Employee[] }).employees || []);

                        if (Array.isArray(employeesList) && employeesList.length > 0) {
                            const uniqueEmployees = Array.from(
                                new Map(employeesList.map((e: Employee) => [e.employee_id, e])).values()
                            );

                            setEmployees(uniqueEmployees);
                            storageService.setItem(STORAGE_KEYS.EMPLOYEES_CACHE, uniqueEmployees);
                            storageService.setItem(STORAGE_KEYS.EMPLOYEES_CACHE_TIME, Date.now().toString());
                            console.log('[Invoice] Cached', uniqueEmployees.length, 'employees');
                        } else {
                            throw new Error('Empty or invalid employee response');
                        }
                    }
                } catch (employeeError) {
                    console.warn('Unable to fetch employees from API:', (employeeError as Error).message);

                    // OFFLINE FALLBACK: Try to get employees from IndexedDB
                    try {
                        console.log('[Invoice] Attempting to load employees from offline DB...');
                        const offlineEmployees = await offlineDB.getAll('employees') as Employee[];
                        if (offlineEmployees && offlineEmployees.length > 0) {
                            const uniqueOffline = Array.from(
                                new Map(offlineEmployees.map(e => [e.employee_id, e])).values()
                            );
                            setEmployees(uniqueOffline);
                            console.log(`[Invoice] Loaded ${uniqueOffline.length} employees from offline cache`);
                        } else {
                            setEmployees([]);
                        }
                    } catch (offlineError) {
                        console.error('[Invoice] Offline employee load failed:', offlineError);
                        setEmployees([]);
                    }
                }

                // If prefilled data provided, merge it
                if (prefilledData) {
                    if (prefilledData.customer) {
                        setSelectedCustomer(prefilledData.customer as Customer);
                        handleCustomerSelect(prefilledData.customer as Customer);
                    }
                    if (prefilledData.items && prefilledData.items.length > 0) {
                        const transformedItems = prefilledData.items.map(item => prepareItemForInvoice(item));
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

        console.log('🧮 Starting calculation with invoice items:',
            invoice.items?.map(i => ({
                name: i.product_name,
                qty: i.quantity,
                rate: i.unit_price,
                discount: i.discount_percent
            }))
        );

        EnterpriseCalculator.calculateDebounced(
            invoice,
            (error: Error | null, result: any) => {
                if (error) {
                    console.error('❌ Calculation error:', error);
                    return;
                }

                if (result && result.totals) {
                    console.log('✅ Calculation result:', {
                        items: result.items?.map(i => ({
                            name: i.product_name,
                            qty: i.quantity,
                            rate: i.unit_price,
                            line_total: i.line_total
                        })),
                        totals: result.totals
                    });

                    setInvoice(prev => {
                        const enrichedItems = prev.items.map((item, idx) => {
                            const calculatedItem = result.items[idx] || {};

                            return {
                                ...item,
                                line_subtotal: calculatedItem.line_subtotal,
                                line_discount: calculatedItem.line_discount,
                                line_taxable: calculatedItem.line_taxable,
                                line_gst: calculatedItem.line_gst,
                                line_total: calculatedItem.line_total,
                                cgst_amount: calculatedItem.cgst_amount,
                                sgst_amount: calculatedItem.sgst_amount,
                                igst_amount: calculatedItem.igst_amount,
                            };
                        });

                        console.log('📊 Updating invoice with totals:', {
                            final_amount: result.totals.final_amount,
                            items_count: enrichedItems.length
                        });

                        return {
                            ...prev,
                            items: enrichedItems,
                            totals: result.totals,
                            final_amount: result.totals.final_amount
                        };
                    });
                }
            },
            300,
            'invoice'
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // eslint-disable-next-line react-hooks/exhaustive-deps
        JSON.stringify(invoice.items?.map(i => ({
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_percent: i.discount_percent,
            gst_percent: i.gst_percent
        }))),
        invoice.freight_charges,
        invoice.discount_amount,
        invoice.discount_percent
    ]);

    // Handlers
    const handleCustomerSelect = useCallback((customer: Customer | null) => {
        if (!customer) {
            setSelectedCustomer(null);
            setInvoice(prev => ({
                ...prev,
                customer_details: null,
                billing_address: '',
                shipping_address: ''
            }));
            return;
        }

        setSelectedCustomer(customer);
        const billingAddress =
            (customer.address_info?.billing_address ||
                customer.billing_address?.street ||
                // Fallback for offline flat structure
                ((customer as any).address_line1 ? `${(customer as any).address_line1}${(customer as any).city ? `, ${(customer as any).city}` : ''}${(customer as any).state ? `, ${(customer as any).state}` : ''}` : '') ||
                '') as string;

        setInvoice(prev => ({
            ...prev,
            customer_details: customer,
            billing_address: billingAddress,
            shipping_address: sameAsShipping ? billingAddress : prev.shipping_address
        }));

        toast.success(`Customer "${customer.customer_name}" selected`);
    }, [sameAsShipping]);

    const handleAddItem = useCallback(async (product: ProductInput) => {
        if (!product) return;

        console.log('📦 [ADD ITEM] Raw product from search:', product);

        // If product already has batch_id, it came from BatchSelector
        const invoiceItem = product.batch_id
            ? prepareItemForInvoice(product)
            : prepareItemForInvoice(product);

        // OFFLINE: If no batch selected, fetch best batch from IndexedDB
        if (!isOnline && !invoiceItem.batch_id && invoiceItem.product_id) {
            try {
                console.log(`[Invoice] Fetching offline batches for product ${invoiceItem.product_id}...`);
                const batches = await offlineDB.getBatchesForProduct(invoiceItem.product_id);

                if (batches && batches.length > 0) {
                    // Filter for valid batches (stock > 0) and sort by expiry
                    const validBatches = batches
                        .filter((b: any) => (b.quantity_available || 0) > 0)
                        .sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

                    // Use best valid batch, or just the first one if all out of stock
                    const bestBatch = validBatches[0] || batches[0];

                    if (bestBatch) {
                        console.log('[Invoice] Auto-selected offline batch:', bestBatch);

                        // Update item with batch details
                        invoiceItem.batch_id = Number(bestBatch.batch_id);
                        invoiceItem.batch_number = bestBatch.batch_number;
                        invoiceItem.expiry_date = bestBatch.expiry_date;
                        invoiceItem.manufacturing_date = bestBatch.manufacturing_date;

                        // CRITICAL: Update pricing from batch
                        const mrp = Number(bestBatch.mrp_per_unit || 0);
                        const rate = Number(bestBatch.sale_price_per_unit || 0);

                        invoiceItem.mrp = mrp;
                        invoiceItem.unit_price = rate;
                        invoiceItem.sale_price = rate; // Ensure compatibility
                        invoiceItem.available_quantity = Number(bestBatch.quantity_available || 0);

                        // Pack Info
                        invoiceItem.qty_per_strip = Number(bestBatch.units_per_pack || 1);
                        invoiceItem.strips_per_box = Number(bestBatch.packages_per_box || 1);

                        // Recalculate tax if needed
                        // (Usually tax % is from product, but tax amount depends on rate)

                        toast.info(`Offline: Auto-selected batch ${bestBatch.batch_number} (Qty: ${bestBatch.quantity_available})`);
                    }
                } else {
                    console.warn('[Invoice] No offline batches found for product');
                }
            } catch (err) {
                console.error('[Invoice] Error fetching offline batches:', err);
            }
        }

        console.log('📦 [ADD ITEM] Transformed product:', invoiceItem);

        // OFFLINE SUPPORT: Cache batch in IndexedDB
        if (invoiceItem.batch_id) {
            try {
                await offlineDB.storeBatches([{
                    batch_id: invoiceItem.batch_id,
                    product_id: invoiceItem.product_id,
                    batch_number: invoiceItem.batch_number,
                    expiry_date: invoiceItem.expiry_date,
                    manufacturing_date: invoiceItem.manufacturing_date,
                    quantity_available: invoiceItem.available_quantity || 0,
                    mrp_per_unit: invoiceItem.mrp,
                    sale_price_per_unit: invoiceItem.unit_price,
                }]);
                console.log('📦 [ADD ITEM] Batch cached in IndexedDB for offline use');
            } catch (e) {
                console.warn('📦 [ADD ITEM] Failed to cache batch:', e);
            }
        }

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
                updatedItems[existingItemIndex] = {
                    ...updatedItems[existingItemIndex],
                    quantity: parseFloat(String(updatedItems[existingItemIndex].quantity || 0)) + 1
                };
                toast.info(`Quantity updated for ${invoiceItem.product_name} (Batch: ${invoiceItem.batch_number})`);
                return { ...prev, items: updatedItems };
            } else {
                const newItem: InvoiceItem = {
                    ...invoiceItem,
                    quantity: 1,
                    discount_percent: 0,
                    free_quantity: 0
                };

                const toastMsg = invoiceItem.batch_number
                    ? `Added ${invoiceItem.product_name} (Batch: ${invoiceItem.batch_number})`
                    : `Added ${invoiceItem.product_name}`;

                toast.success(toastMsg);

                return {
                    ...prev,
                    items: [...prev.items, newItem]
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

            if (importData.customer) {
                handleCustomerSelect(importData.customer as Customer);
            }

            if (importData.items && importData.items.length > 0) {
                const transformedItems = importData.items.map(item => prepareItemForInvoice(item));
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

    const handleSaveInvoice = useCallback(async () => {
        try {
            setSaving(true);
            setError(null);

            // Validate invoice
            if (!selectedCustomer) {
                throw new Error('Please select a customer');
            }
            if (invoice.items.length === 0) {
                throw new Error('Please add at least one item');
            }

            // Prepare clean invoice data for backend
            const invoiceData = {
                customer_id: Number(selectedCustomer.customer_id),
                invoice_date: invoice.invoice_date || getTodayBusinessDate(),
                due_date: invoice.due_date,
                items: invoice.items.map(item => ({
                    product_id: Number(item.product_id),
                    batch_id: item.batch_id ? Number(item.batch_id) : undefined,
                    quantity: parseFloat(String(item.quantity)) || 0,
                    free_quantity: parseFloat(String(item.free_quantity)) || 0,
                    unit_price: parseFloat(String(item.unit_price)) || 0,
                    mrp: parseFloat(String(item.mrp)) || 0,
                    discount_percent: parseFloat(String(item.discount_percent)) || 0,
                    gst_percent: parseFloat(String(item.gst_percent)) || 0
                })),
                discount_type: invoice.discount_type || 'percentage',
                discount_percent: parseFloat(String(invoice.discount_percent)) || 0,
                discount_amount: parseFloat(String(invoice.discount_amount)) || 0,
                freight_charges: parseFloat(String(invoice.freight_charges)) || 0,
                delivery_type: invoice.delivery_type || 'PICKUP',
                payment_mode: invoice.payment_mode || 'cash',
                payment_status: invoice.payment_status || 'pending',
                payments: (invoice.payments || []).map(p => ({
                    method: p.method,
                    amount: parseFloat(String(p.amount)) || 0
                })),
                billing_address: invoice.billing_address || '',
                shipping_address: invoice.shipping_address || '',
                notes: invoice.notes || '',
                gst_type: invoice.gst_type || 'CGST/SGST',
                total_amount: invoice.final_amount || 0
            };

            console.log('[Invoice] Prepared invoice data:', JSON.stringify(invoiceData, null, 2));

            // OFFLINE-FIRST: Check network status
            if (!isOnline) {
                console.log('[Invoice] Saving offline - no internet connection');

                // Generate temporary offline invoice number
                const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

                const offlineInvoice = {
                    ...invoiceData,
                    invoice_no: offlineInvoiceNo,
                    temp_id: tempId,
                    _localId: tempId,
                    sync_status: 'pending',
                    created_offline: true,
                };

                await offlineDB.add('invoices', offlineInvoice);
                await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice as unknown as null);

                toast.success('✅ Invoice saved offline - Will sync when online', {
                    autoClose: 5000,
                });

                const createdData: CreatedInvoiceData = {
                    invoiceId: tempId,
                    invoiceNumber: offlineInvoiceNo,
                    customerName: selectedCustomer.customer_name,
                    customerPhone: selectedCustomer.phone || '',
                    customerEmail: selectedCustomer.email || '',
                    totalAmount: invoiceData.total_amount,
                    items: invoice.items,
                    isOffline: true
                };

                setCreatedInvoiceData(createdData);
                setShowSuccessModal(true);
                storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);

                setSaving(false);
                return;
            }

            // ONLINE: Normal API save
            console.log('[Invoice] Saving online - backend will assign invoice number');
            const response = await invoicesApi.create(invoiceData);
            console.log('[Invoice] Save successful!');

            // Extract data from response (handles both direct response or axios response format)
            const responseData = response?.data || response;

            const createdData: CreatedInvoiceData = {
                invoiceId: responseData?.invoice_id,
                invoiceNumber: responseData?.invoice_number,
                customerName: selectedCustomer.customer_name,
                customerPhone: selectedCustomer.phone || '',
                customerEmail: selectedCustomer.email || '',
                totalAmount: responseData?.total_amount || invoiceData.total_amount,
                items: responseData?.items || invoice.items,
                isOffline: false
            };

            setInvoice(prev => ({
                ...prev,
                invoice_number: createdData.invoiceNumber,
                invoice_no: createdData.invoiceNumber
            }));

            setCreatedInvoiceData(createdData);
            setShowSuccessModal(true);
            localStorage.removeItem('invoice_draft');

            toast.success('✅ Invoice created successfully');
        } catch (error) {
            const err = error as { response?: { status?: number; data?: { detail?: { error?: string; product_id?: number; required_quantity?: number; available_quantity?: number } } }; code?: string; message?: string };
            console.error('[Invoice] Save failed:', error);

            const errorStatus = err.response?.status;

            // FALLBACK: If backend is unreachable (5xx), save offline instead
            if (errorStatus && (errorStatus >= 500 || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED')) {
                console.log('[Invoice] Backend unreachable, falling back to offline save...');
                toast.warning('⚠️ Server unavailable - saving locally...', { autoClose: 3000 });

                try {
                    const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

                    const offlineInvoice = {
                        customer_id: selectedCustomer?.customer_id,
                        invoice_date: invoice.invoice_date,
                        due_date: invoice.due_date,
                        items: invoice.items.map(item => ({
                            product_id: item.product_id,
                            batch_id: item.batch_id,
                            quantity: parseFloat(String(item.quantity)) || 0,
                            free_quantity: parseFloat(String(item.free_quantity)) || 0,
                            unit_price: parseFloat(String(item.unit_price)) || 0,
                            mrp: parseFloat(String(item.mrp)) || 0,
                            discount_percent: parseFloat(String(item.discount_percent)) || 0,
                            gst_percent: parseFloat(String(item.gst_percent)) || 0
                        })),
                        discount_type: invoice.discount_type || 'percentage',
                        discount_percent: parseFloat(String(invoice.discount_percent)) || 0,
                        discount_amount: parseFloat(String(invoice.discount_amount)) || 0,
                        freight_charges: parseFloat(String(invoice.freight_charges)) || 0,
                        delivery_type: invoice.delivery_type || 'PICKUP',
                        payment_mode: invoice.payment_mode || 'cash',
                        payment_status: invoice.payment_status || 'pending',
                        payments: (invoice.payments || []).map(p => ({
                            method: p.method,
                            amount: parseFloat(String(p.amount)) || 0
                        })),
                        billing_address: invoice.billing_address || '',
                        shipping_address: invoice.shipping_address || '',
                        notes: invoice.notes || '',
                        gst_type: invoice.gst_type || 'CGST/SGST',
                        invoice_no: offlineInvoiceNo,
                        temp_id: tempId,
                        _localId: tempId,
                        sync_status: 'pending',
                        created_offline: true,
                        fallback_reason: `Backend returned ${errorStatus}`
                    };

                    await offlineDB.add('invoices', offlineInvoice);
                    await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice as unknown as null);

                    toast.success('✅ Invoice saved locally - will sync when server is back', {
                        autoClose: 5000,
                    });

                    const createdData: CreatedInvoiceData = {
                        invoiceId: tempId,
                        invoiceNumber: offlineInvoiceNo,
                        customerName: selectedCustomer?.customer_name || '',
                        customerPhone: selectedCustomer?.phone || '',
                        customerEmail: selectedCustomer?.email || '',
                        totalAmount: invoice.final_amount || 0,
                        items: invoice.items,
                        isOffline: true
                    };

                    setCreatedInvoiceData(createdData);
                    setShowSuccessModal(true);
                    storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);
                    return;
                } catch (offlineError) {
                    console.error('[Invoice] Offline fallback also failed:', offlineError);
                    setError('Failed to save both online and offline');
                    toast.error('❌ Save failed - please try again');
                }
            } else if (errorStatus === 409 && err.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
                const details = err.response.data.detail;
                setError(`Insufficient stock: Product ${details.product_id} - Required ${details.required_quantity}, Available ${details.available_quantity}`);
                toast.error(`❌ Insufficient Stock: Only ${details.available_quantity} units available`, {
                    autoClose: 8000
                });
            } else {
                setError(err.message || 'Failed to create invoice');
                toast.error(err.message || 'Failed to create invoice');
            }
        } finally {
            setSaving(false);
        }
    }, [invoice, selectedCustomer, isOnline]);



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
        error,
        setError,

        saving,
        showSuccessModal,
        setShowSuccessModal,
        createdInvoiceData,

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
        handleSaveInvoice,

    };
};
