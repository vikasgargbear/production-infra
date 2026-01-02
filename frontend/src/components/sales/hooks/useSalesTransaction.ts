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
import { employeesAPI, apiClient } from '../../../services/api';
import { BaseEmployee, BaseCustomer, BaseLineItem } from '../types/salesSharedTypes';

// ==================== CONFIGURATION ====================

export interface UseSalesTransactionConfig<TDoc, TCustomer extends BaseCustomer, TItem extends BaseLineItem> {
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

export interface UseSalesTransactionReturn<TDoc, TCustomer extends BaseCustomer, TItem extends BaseLineItem> {
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
    recalculateTotals: (items: TItem[]) => { totalQuantity: number; totalAmount: number };
    fetchCustomerAddress: (customerId: string | number) => Promise<{ address: string; city: string; state: string; pincode: string } | null>;

    // Utilities
    resetDocument: () => void;
}

// ==================== THE HOOK ====================

export function useSalesTransaction<
    TDoc extends { items: TItem[]; customer_id?: string | number; customer_name?: string },
    TCustomer extends BaseCustomer = BaseCustomer,
    TItem extends BaseLineItem = BaseLineItem
>(
    config: UseSalesTransactionConfig<TDoc, TCustomer, TItem>
): UseSalesTransactionReturn<TDoc, TCustomer, TItem> {

    const { getInitialDocument, documentType, priceField = 'sale_price', includeGst = false, onClose } = config;

    // ==================== STATE ====================
    const [document, setDocument] = useState<TDoc>(getInitialDocument());
    const [selectedCustomer, setSelectedCustomer] = useState<TCustomer | null>(null);
    const [employees, setEmployees] = useState<BaseEmployee[]>([]);
    const [selectedMR, setSelectedMR] = useState<BaseEmployee | null>(null);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fetchingAddress, setFetchingAddress] = useState(false);

    // ==================== REFS ====================
    const productSearchRef = useRef<HTMLInputElement>(null);
    const itemsTableRef = useRef<unknown>(null);

    // ==================== LOAD EMPLOYEES ====================
    const loadEmployees = useCallback(async () => {
        setLoadingEmployees(true);
        try {
            const response = await employeesAPI.getAll({ is_active: true, limit: 100 }) as unknown as { success?: boolean; data?: BaseEmployee[] };
            if (response.success || response.data) {
                setEmployees(response.data || []);
            }
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

            if (response.data?.success && response.data.data?.length > 0) {
                const addresses = response.data.data;
                const billingAddr = addresses.find((addr: any) => addr.address_type === 'billing' && addr.is_default);
                const shippingAddr = addresses.find((addr: any) => addr.address_type === 'shipping' && addr.is_default);
                const anyDefaultAddr = addresses.find((addr: any) => addr.is_default);
                const preferredAddr = billingAddr || shippingAddr || anyDefaultAddr || addresses[0];

                return {
                    address: preferredAddr.address_line1 || '',
                    city: preferredAddr.city || '',
                    state: preferredAddr.state_name || preferredAddr.state || '',
                    pincode: preferredAddr.pincode || ''
                };
            }
            return null;
        } catch (error) {
            console.error(`[useSalesTransaction:${documentType}] Address fetch failed:`, error);
            return null;
        }
    }, [documentType]);

    // ==================== RECALCULATE TOTALS ====================
    const recalculateTotals = useCallback((items: TItem[]) => {
        const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0);
        const totalAmount = items.reduce((sum, item) => {
            const quantity = parseFloat(String(item.quantity)) || 0;
            const unitPrice = parseFloat(String(item.unit_price || item.rate || item.sale_price)) || 0;
            return sum + (quantity * unitPrice);
        }, 0);

        return { totalQuantity, totalAmount };
    }, []);

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

        let address = customer.address || customer.address_line1 || '';
        let city = customer.city || '';
        let state = customer.state || customer.state_name || '';
        let pincode = customer.pincode || customer.pin_code || customer.postal_code || '';

        // Fetch address if not available locally
        if (!address && !city && customer.customer_id) {
            setFetchingAddress(true);
            const addressData = await fetchCustomerAddress(customer.customer_id);
            if (addressData) {
                address = addressData.address;
                city = addressData.city;
                state = addressData.state;
                pincode = addressData.pincode;
            }
            setFetchingAddress(false);
        }

        const billingAddressParts = [address, city, state, pincode].filter(p => p && p.trim());
        const billingAddress = billingAddressParts.join(', ');

        setDocument(prev => ({
            ...prev,
            customer_id: customer.customer_id || '',
            customer_name: customer.customer_name || customer.name || '',
            billing_address: billingAddress
        } as TDoc));

    }, [fetchCustomerAddress]);

    // ==================== HANDLE PRODUCT SELECT ====================
    const handleProductSelect = useCallback((product: any) => {
        const existingIndex = document.items.findIndex(item => item.product_id === product.product_id);

        if (existingIndex >= 0) {
            // Increment quantity if product already exists
            const updatedItems = document.items.map((item, index) =>
                index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
            );
            setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));
        } else {
            // Add new item
            const quantity = 1;
            const unitPrice = product[priceField] || product.sale_price || product.mrp || 0;
            const total = quantity * unitPrice;

            const newItem: TItem = {
                id: Date.now(),
                product_id: product.product_id,
                product_name: product.product_name,
                hsn_code: product.hsn_code,
                quantity,
                unit: product.unit || product.base_uom || product.uom_code || '',
                mrp: product.mrp || 0,
                unit_price: unitPrice,
                rate: unitPrice,
                sale_price: unitPrice,
                total,
                line_total: total,
                gst_percent: includeGst ? (product.gst_percent || 0) : undefined
            } as TItem;

            const updatedItems = [...document.items, newItem];
            setDocument(prev => ({ ...prev, items: updatedItems } as TDoc));

            // Focus items table after adding
            setTimeout(() => {
                if (itemsTableRef.current && typeof (itemsTableRef.current as any).focusFirstField === 'function') {
                    (itemsTableRef.current as any).focusFirstField();
                }
            }, 150);
        }
    }, [document.items, priceField, includeGst]);

    // ==================== UPDATE ITEM ====================
    const updateItem = useCallback((index: number, field: string, value: unknown) => {
        const updatedItems = document.items.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, [field]: value };

                // Recalculate line total if quantity or price changes
                if (field === 'quantity' || field === 'unit_price' || field === 'rate') {
                    const quantity = parseFloat(field === 'quantity' ? String(value) : String(item.quantity)) || 0;
                    const unitPrice = parseFloat((field === 'unit_price' || field === 'rate') ? String(value) : String(item.unit_price || item.rate)) || 0;
                    const total = quantity * unitPrice;
                    updatedItem.total = total;
                    updatedItem.line_total = total;
                    updatedItem.unit_price = unitPrice;
                    updatedItem.rate = unitPrice;
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
        recalculateTotals,
        fetchCustomerAddress,

        // Utilities
        resetDocument
    };
}

export default useSalesTransaction;
