/**
 * useSalesTransaction Hook
 * 
 * Shared business logic for all sales transactions (invoice, challan, order).
 * Provides common state management, calculations, and handlers.
 * 
 * Individual module hooks (useInvoiceLogic, useChallanLogic, useSalesOrderLogic)
 * can compose this hook for shared functionality.
 */

import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { employeesApi, apiClient } from '../../../services/api';
import { BaseEmployee, BaseCustomer, BaseLineItem } from '../types/salesSharedTypes';
import {
    addExactDecimals,
    normalizeAuthoritativeDecimal,
    normalizeExactDecimal,
} from '../../../utils/exactDecimal';
import { clientUuid } from '../../../utils/clientUuid';

// ==================== CONFIGURATION ====================

export interface UseSalesTransactionConfig<TDoc> {
    /** Initial document state */
    getInitialDocument: () => TDoc;
    /** Document type identifier */
    documentType: 'invoice' | 'challan' | 'order';
    /** Price field to use from product */
    priceField?: 'sale_price' | 'mrp' | 'unit_price';
    /** Whether to calculate GST */
    includeGst?: boolean;
    /** Callback when document is saved successfully */
    onSaveSuccess?: (data: unknown) => void;
    /** Callback on close */
    onClose?: () => void;
}

// ==================== RETURN TYPE ====================

export interface UseSalesTransactionReturn<TDoc, TCustomer extends BaseCustomer> {
    // Document State
    document: TDoc;
    setDocument: React.Dispatch<React.SetStateAction<TDoc>>;

    // Customer
    selectedCustomer: TCustomer | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<TCustomer | null>>;

    // Employees
    employees: BaseEmployee[];
    selectedMR: BaseEmployee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<BaseEmployee | null>>;
    loadingEmployees: boolean;

    // UI State
    saving: boolean;
    fetchingAddress: boolean;

    // Refs
    productSearchRef: RefObject<HTMLInputElement | null>;
    itemsTableRef: RefObject<unknown>;

    // Handlers
    handleCustomerSelect: (customer: TCustomer | null) => Promise<void>;
    handleProductSelect: (product: unknown) => void;
    updateItem: (index: number, field: string, value: unknown) => void;
    removeItem: (indexOrId: number | string) => void;
    fetchCustomerAddress: (customerId: string | number) => Promise<{ address: string; city: string; stateCode: string; pincode: string } | null>;

    // Utilities
    resetDocument: () => void;
}

// ==================== THE HOOK ====================

export function useSalesTransaction<
    TDoc extends { items: TItem[]; customer_id?: string | number; customer_name?: string },
    TCustomer extends BaseCustomer = BaseCustomer,
    TItem extends BaseLineItem = BaseLineItem
>(
    config: UseSalesTransactionConfig<TDoc>
): UseSalesTransactionReturn<TDoc, TCustomer> {

    const { getInitialDocument, documentType, priceField = 'sale_price', includeGst = false } = config;

    // ==================== STATE ====================
    const [document, setDocument] = useState<TDoc>(getInitialDocument());
    const [selectedCustomer, setSelectedCustomer] = useState<TCustomer | null>(null);
    const [employees, setEmployees] = useState<BaseEmployee[]>([]);
    const [selectedMR, setSelectedMR] = useState<BaseEmployee | null>(null);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const saving = false;
    const [fetchingAddress, setFetchingAddress] = useState(false);

    // ==================== REFS ====================
    const productSearchRef = useRef<HTMLInputElement>(null);
    const itemsTableRef = useRef<unknown>(null);

    // ==================== LOAD EMPLOYEES ====================
    const loadEmployees = useCallback(async () => {
        setLoadingEmployees(true);
        try {
            const response = await employeesApi.getAll({ limit: 100 });
            setEmployees(response.data.employees as BaseEmployee[]);
        } catch (error) {
            console.error(`[useSalesTransaction:${documentType}] Failed to load employees:`, error);
        } finally {
            setLoadingEmployees(false);
        }
    }, [documentType]);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    // ==================== FETCH ADDRESS ====================
    const fetchCustomerAddress = useCallback(async (customerId: string | number) => {
        try {
            const response = await apiClient.get(`/customers/${customerId}/addresses`);

            if (response.data?.success && Array.isArray(response.data.data)) {
                const billingAddress = response.data.data.find((address: Record<string, unknown>) =>
                    address.address_type === 'billing' && address.is_default === true);
                const stateCode = String(billingAddress?.state_code ?? '').trim();
                if (!billingAddress || !/^\d{2}$/.test(stateCode)) return null;
                return {
                    address: String(billingAddress.address_line1 ?? '').trim(),
                    city: String(billingAddress.city ?? '').trim(),
                    stateCode,
                    pincode: String(billingAddress.pincode ?? '').trim(),
                };
            }
            return null;
        } catch (error) {
            console.error(`[useSalesTransaction:${documentType}] Address fetch failed:`, error);
            return null;
        }
    }, [documentType]);

    // ==================== HANDLE CUSTOMER SELECT ====================
    const handleCustomerSelect = useCallback(async (customer: TCustomer | null) => {
        setSelectedCustomer(customer);

        if (!customer) {
            setDocument(prev => ({
                ...prev,
                customer_id: '',
                customer_name: ''
            }));
            return;
        }

        setFetchingAddress(true);
        const addressData = customer.customer_id
            ? await fetchCustomerAddress(customer.customer_id)
            : null;
        setFetchingAddress(false);

        const billingAddressParts = addressData
            ? [addressData.address, addressData.city, addressData.stateCode, addressData.pincode]
            : [];
        const billingAddress = billingAddressParts.join(', ');

        setDocument(prev => ({
            ...prev,
            customer_id: customer.customer_id ?? '',
            customer_name: customer.customer_name ?? '',
            billing_address: billingAddress
        } as TDoc));

    }, [fetchCustomerAddress]);

    // ==================== HANDLE PRODUCT SELECT ====================
    const handleProductSelect = useCallback((product: any) => {
        if (typeof product?.quantity !== 'string' || typeof product?.free_quantity !== 'string') {
            throw new Error('Selected sales item requires exact billed and free decimal strings.');
        }
        const billedQuantity = normalizeExactDecimal(
            product.quantity,
            'Selected sales item billed quantity',
            { scale: 6, maximumWholeDigits: 14 },
        );
        const freeQuantity = normalizeExactDecimal(
            product.free_quantity,
            'Selected sales item free quantity',
            { scale: 6, maximumWholeDigits: 14 },
        );
        const existingIndex = document.items.findIndex(item => item.product_id === product.product_id);

        if (existingIndex >= 0) {
            // Re-selecting the same product preserves the selector's complete
            // billed/free intent; it never manufactures an increment.
            const updatedItems = document.items.map((item, index) =>
                index === existingIndex ? {
                    ...item,
                    quantity: addExactDecimals(
                        [item.quantity, billedQuantity],
                        'Sales item billed quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ),
                    free_quantity: addExactDecimals(
                        [item.free_quantity, freeQuantity],
                        'Sales item free quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ),
                } : item
            );
            setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));
        } else {
            // Add new item
            if (!product.batch_id || typeof product[priceField] !== 'string') {
                console.error(`[useSalesTransaction:${documentType}] Canonical batch price is unavailable`);
                return;
            }
            const unitPrice = normalizeAuthoritativeDecimal(
                product[priceField],
                'Selected batch unit rate',
                { scale: 4, maximumWholeDigits: 16 },
            );

            const newItem: TItem = {
                id: clientUuid(),
                product_id: product.product_id,
                product_name: product.product_name,
                hsn_code: product.hsn_code,
                batch_id: product.batch_id,
                batch_number: product.batch_number,
                branch_id: product.branch_id,
                location_id: product.location_id,
                uom_conversion_id: product.uom_conversion_id,
                quantity: billedQuantity,
                free_quantity: freeQuantity,
                free_supply_tax_treatment: product.free_supply_tax_treatment,
                unit: product.unit || product.base_uom || product.uom_code || '',
                mrp: product.mrp,
                unit_price: unitPrice,  // ✅ CANONICAL
                gst_percent: includeGst ? product.gst_percent : undefined
            } as unknown as TItem;

            const updatedItems = [...document.items, newItem];
            setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));

            // Focus items table after adding
            setTimeout(() => {
                if (itemsTableRef.current && typeof (itemsTableRef.current as any).focusFirstField === 'function') {
                    (itemsTableRef.current as any).focusFirstField();
                }
            }, 150);
        }
    }, [document.items, documentType, priceField, includeGst]);

    // ==================== UPDATE ITEM ====================
    const updateItem = useCallback((index: number, field: string, value: unknown) => {
        const updatedItems = document.items.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, [field]: value };

                if (field === 'quantity' || field === 'free_quantity') {
                    if (typeof value !== 'string') {
                        throw new Error(`Sales item ${field} must remain an exact decimal string.`);
                    }
                    updatedItem[field] = normalizeExactDecimal(
                        value,
                        `Sales item ${field}`,
                        { scale: 6, maximumWholeDigits: 14 },
                    );
                } else if (field === 'unit_price') {
                    if (typeof value !== 'string') {
                        throw new Error('Sales item unit price must remain an exact decimal string.');
                    }
                    updatedItem.unit_price = normalizeExactDecimal(
                        value,
                        'Sales item unit price',
                        { scale: 4, maximumWholeDigits: 16 },
                    );
                }
                return updatedItem;
            }
            return item;
        });

        setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));
    }, [document.items]);

    // ==================== REMOVE ITEM ====================
    const removeItem = useCallback((indexOrId: number | string) => {
        const updatedItems = typeof indexOrId === 'number'
            ? document.items.filter((_, i) => i !== indexOrId)
            : document.items.filter(item => item.id !== indexOrId);

        setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));
    }, [document.items]);

    // ==================== RESET DOCUMENT ====================
    const resetDocument = useCallback(() => {
        setDocument(getInitialDocument());
        setSelectedCustomer(null);
        setSelectedMR(null);
    }, [getInitialDocument]);

    // ==================== RETURN ====================
    return {
        // Document State
        document,
        setDocument,

        // Customer
        selectedCustomer,
        setSelectedCustomer,

        // Employees
        employees,
        selectedMR,
        setSelectedMR,
        loadingEmployees,

        // UI State
        saving,
        fetchingAddress,

        // Refs
        productSearchRef,
        itemsTableRef,

        // Handlers
        handleCustomerSelect,
        handleProductSelect,
        updateItem,
        removeItem,
        fetchCustomerAddress,

        // Utilities
        resetDocument
    };
}

export default useSalesTransaction;
