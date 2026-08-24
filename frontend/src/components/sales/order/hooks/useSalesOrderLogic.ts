/**
 * useSalesOrderLogic Hook
 * Manages state and logic for sales order creation flow
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { apiClient } from '../../../../services/api';
import { calculateSalesOrderPreview } from '../../../../services/calculations/salesOrderCalculationService';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useSalesOrderSave } from './useSalesOrderSave';
import { useCompany } from '../../../../contexts/CompanyContext';
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import type { Order, OrderItem, Address, CreatedOrderData, BankAccount, Product } from '../../../../types/models';
import type { ImportData } from '../../../global/modals/DocumentImportModal';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { addExactDecimals, formatExactDecimal, normalizeExactDecimal } from '../../../../utils/exactDecimal';

// ==================== TYPE DEFINITIONS ====================

// Using canonical Customer type with additional UI fields
import type { Customer as BaseCustomer } from '../../../../types/models/customer';

// Extended Customer with UI fields for this component
type Customer = BaseCustomer & {
    id?: number | string;
    name?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    pincode?: string;
};

interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan?: string;
    state?: string;
    city?: string;
}

// Using canonical Product type from /types/models - extended with UI fields
type ProductInput = Omit<Product, 'mrp' | 'sale_price' | 'gst_percent'> & {
    branch_id?: string;
    location_id?: string;
    uom_conversion_id?: string;
    batch_id?: number | string;
    batch_number?: string;
    quantity?: string | number;
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;
    mrp?: string | number;
    sale_price?: string | number;
    unit_price?: string | number;
    gst_percent?: string | number;
};

export interface UseSalesOrderLogicReturn {
    // State
    order: Order;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    selectedCustomer: Customer | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
    sameAsBilling: boolean;
    setSameAsBilling: React.Dispatch<React.SetStateAction<boolean>>;
    saving: boolean;
    submissionUnavailableReason: string;
    preparedPreview: CanonicalCommandPreview | null;
    reviewOpen: boolean;
    message: string;
    messageType: string;
    selectedBankAccount: BankAccount | null;
    setSelectedBankAccount: React.Dispatch<React.SetStateAction<BankAccount | null>>;
    createdOrderData: CreatedOrderData | null;
    showSuccessModal: boolean;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;

    // Modal states
    showCustomerModal: boolean;
    setShowCustomerModal: React.Dispatch<React.SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
    newProductName: string;
    setNewProductName: React.Dispatch<React.SetStateAction<string>>;

    // Handlers
    handleCustomerSelect: (customer: Customer | null) => Promise<void>;
    handleProductSelect: (product: ProductInput) => void;
    handleImport: (importData: ImportData) => void;
    updateItem: (index: number, field: string, value: unknown) => void;
    removeItem: (index: number) => void;
    updateItemQuantity: (itemId: number | string, newQuantity: number) => void;
    saveOrder: () => Promise<void>;
    confirmPreparedOrder: () => Promise<void>;
    closeOrderReview: () => void;
    printOrder: () => void;
    shareOnWhatsApp: () => void;
    resetOrder: () => void;

    // Company info
    companyInfo: CompanyInfo;
}

// ==================== INITIAL STATE ====================

const createInitialOrder = (): Order => ({
    order_id: 0,  // Will be set when order is saved
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: 0,  // Will be set when customer is selected
    customer_name: '',
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    billing_address_data: null,
    shipping_address_data: null,
    items: [],
    status: 'pending',
    payment_terms: 'credit',
    reference_no: '',
    sales_person: '',
    created_by: '',
    terms_conditions: 'Standard terms apply',
    notes: '',
    discount_amount: 0,
    other_charges: 0,
    total_quantity: 0,
    total_amount: 0,
    subtotal_amount: 0,
    tax_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    round_off: 0,
    gst_type: 'CGST/SGST',
    place_of_supply: ''
});

// ==================== MAIN HOOK ====================

export const useSalesOrderLogic = (): UseSalesOrderLogicReturn => {
    const { companyInfo } = useCompany() as { companyInfo: CompanyInfo };

    // Core state
    const [order, setOrder] = useState<Order>(createInitialOrder());
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [sameAsBilling, setSameAsBilling] = useState(true);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
    const [createdOrderData, setCreatedOrderData] = useState<CreatedOrderData | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Network status is retained for read-only API availability messaging.
    const { isOnline } = useNetworkStatus();

    // Fail closed until the sales-order canonical command is available.
    const {
        saving: submissionSaving,
        submissionUnavailableReason,
        preparedPreview,
        reviewOpen,
        handleSaveOrder,
        confirmPreparedOrder,
        closeOrderReview,
    } = useSalesOrderSave({
        order,
        selectedCustomer,
        isOnline,
        setOrder,
        setCreatedOrderData,
        setShowSuccessModal,
        setMessage,
        setMessageType
    });

    // Modal states
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const calculationRequestRef = useRef(0);

    // Recalculate totals
    const recalculateTotals = useCallback(async (
        items: OrderItem[],
        sourceOrder: Order = order,
    ): Promise<void> => {
        const requestId = ++calculationRequestRef.current;
        if (!items || items.length === 0) {
            setOrder(prev => ({
                ...prev,
                total_quantity: 0,
                subtotal_amount: 0,
                tax_amount: 0,
                total_amount: 0,
                final_amount: 0
            }));
            return;
        }

        try {
            const orderData = {
                ...sourceOrder,
                items,
            };
            const result = await calculateSalesOrderPreview(orderData, true);

            if (requestId !== calculationRequestRef.current) {
                return;
            }

            if (result && result.totals) {
                const formattedTotals = result.totals;
                const updatedItems = items.map((item, index) => {
                    const calculatedLineItem = result.items && result.items[index];
                    if (calculatedLineItem) {
                        return {
                            ...item,
                            subtotal: calculatedLineItem.subtotal,
                            discount_amount: calculatedLineItem.discount_amount,
                            tax_amount: calculatedLineItem.gst_amount, // mapped from gst_amount
                            total: calculatedLineItem.total_amount,    // mapped from total_amount
                            calculated_total: calculatedLineItem.total_amount,
                            taxable_amount: calculatedLineItem.taxable_amount
                        };
                    }
                    return item;
                });

                setOrder(prev => ({
                    ...prev,
                    items: updatedItems,
                    total_quantity: addExactDecimals(
                        items.map(item => item.quantity),
                        'Sales order total quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ),
                    subtotal_amount: formattedTotals.subtotal_amount,
                    discount_amount: formattedTotals.discount_amount,
                    tax_amount: formattedTotals.total_tax_amount,
                    total_amount: formattedTotals.final_amount,
                    final_amount: formattedTotals.final_amount,
                    cgst_amount: formattedTotals.cgst_amount,
                    sgst_amount: formattedTotals.sgst_amount,
                    igst_amount: formattedTotals.igst_amount,
                    calculatedLineItems: result.items
                }));
            }
        } catch (error) {
            if (requestId !== calculationRequestRef.current) {
                return;
            }
            console.error('Calculation error:', error);
            toast.error('Unable to calculate order totals. Please review the entered item values.');
        }
    }, [order]);

    // Handle customer selection
    const handleCustomerSelect = useCallback(async (customer: Customer | null): Promise<void> => {
        setSelectedCustomer(customer);

        if (!customer) {
            setOrder(prev => ({
                ...prev,
                customer_id: 0,  // Reset when customer is cleared
                customer_name: '',
                customer_details: null,
                billing_address: '',
                shipping_address: '',
                billing_address_data: null,
                shipping_address_data: null
            }));
            return;
        }

        const addressParts: string[] = [];
        if (customer.address) addressParts.push(customer.address);
        if (customer.city) addressParts.push(customer.city);
        if (customer.state) addressParts.push(customer.state);
        if (customer.pincode) addressParts.push(customer.pincode);
        let fullAddress = addressParts.filter(Boolean).join(', ');

        let addressData: Address = {
            address_line1: customer.address || '',
            address_line2: customer.address2 || '',
            city: customer.city || '',
            state: customer.state || '',
            pincode: customer.pincode || '',
            country: 'India'
        };

        if (!fullAddress && customer.customer_id) {
            try {
                const response = await apiClient.get(`/customers/${customer.customer_id}/addresses`);
                if (response.data?.success && response.data.data?.length > 0) {
                    const addresses = response.data.data;
                    const billingAddr = addresses.find((addr: { address_type: string; is_default: boolean }) =>
                        addr.address_type === 'billing' && addr.is_default);
                    const shippingAddr = addresses.find((addr: { address_type: string; is_default: boolean }) =>
                        addr.address_type === 'shipping' && addr.is_default);
                    const anyDefaultAddr = addresses.find((addr: { is_default: boolean }) => addr.is_default);
                    const preferredAddr = billingAddr || shippingAddr || anyDefaultAddr || addresses[0];

                    const fetchedParts: string[] = [];
                    if (preferredAddr.address_line1) fetchedParts.push(preferredAddr.address_line1);
                    if (preferredAddr.address_line2) fetchedParts.push(preferredAddr.address_line2);
                    if (preferredAddr.city) fetchedParts.push(preferredAddr.city);
                    if (preferredAddr.state) fetchedParts.push(preferredAddr.state);
                    if (preferredAddr.pincode) fetchedParts.push(preferredAddr.pincode);
                    fullAddress = fetchedParts.filter(Boolean).join(', ');

                    addressData = {
                        address_line1: preferredAddr.address_line1 || '',
                        address_line2: preferredAddr.address_line2 || '',
                        city: preferredAddr.city || '',
                        state: preferredAddr.state || '',
                        pincode: preferredAddr.pincode || '',
                        country: preferredAddr.country || 'India'
                    };

                    customer = {
                        ...customer,
                        address: preferredAddr.address_line1 || '',
                        address2: preferredAddr.address_line2 || '',
                        city: preferredAddr.city || '',
                        state: preferredAddr.state || '',
                        pincode: preferredAddr.pincode || ''
                    };
                    setSelectedCustomer(customer);
                }
            } catch {
                // Silent error
            }
        }

        const customerState = addressData.state || addressData.state_name || customer.state || '';
        const gstType = determineGstTypeForSupply(
            companyInfo?.state,
            customerState,
            companyInfo?.gst_number,
            customer.gst_number
        );

        setOrder(prev => ({
            ...prev,
            customer_id: String(customer?.customer_id || customer?.id || ''),
            customer_name: customer?.customer_name || customer?.name || '',
            customer_details: customer,
            billing_address: fullAddress,
            shipping_address: fullAddress,
            billing_address_data: addressData,
            shipping_address_data: addressData,
            gst_type: gstType,
            place_of_supply: customerState || companyInfo?.state || ''
        }));
    }, [companyInfo]);

    // Handle product selection
    const handleProductSelect = useCallback((product: ProductInput): void => {
        const existingItem = order.items.find(item =>
            item.product_id === product.product_id && item.batch_id === product.batch_id
        );

        if (existingItem) {
            const updatedItems = order.items.map(item =>
                item.product_id === product.product_id && item.batch_id === product.batch_id
                    ? { ...item, quantity: addExactDecimals(
                        [item.quantity, product.quantity ?? '1.000000'],
                        'Sales order item quantity',
                        { scale: 6, maximumWholeDigits: 14 },
                    ) }
                    : item
            );
            setOrder(prev => ({ ...prev, items: updatedItems }));
            recalculateTotals(updatedItems);
        } else {
            const quantity = normalizeExactDecimal(
                product.quantity ?? '1.000000',
                'Sales order item quantity',
                { scale: 6, maximumWholeDigits: 14 },
            );
            const unitPrice = product.sale_price ?? product.unit_price;
            const discountPercent = '0.000000';
            const gstPercent = product.gst_percent;
            if (typeof unitPrice !== 'string' || typeof gstPercent !== 'string') {
                toast.error('Select an authoritative canonical batch before adding this order item.');
                return;
            }
            const newItem: OrderItem = {
                id: Date.now(),
                product_id: product.product_id,
                product_name: product.product_name,
                hsn_code: product.hsn_code,
                batch_id: product.batch_id,
                batch_number: product.batch_number || product.batch_number,
                branch_id: product.branch_id,
                location_id: product.location_id,
                uom_conversion_id: product.uom_conversion_id,
                quantity,
                unit: product.unit || product.uom || 'NOS',
                pack_size: product.pack_size || product.pack_type,
                mrp: product.mrp,
                unit_price: unitPrice,
                discount_percent: discountPercent,
                discount_amount: 0,
                gst_percent: gstPercent,
                tax_amount: 0,
                subtotal: 0,
                total: 0,
                manufacturer: product.manufacturer,
                category: product.category
            };

            const updatedItems = [...order.items, newItem];
            setOrder(prev => ({ ...prev, items: updatedItems }));
            recalculateTotals(updatedItems);
        }
    }, [order.items, recalculateTotals]);

    // Handle import
    const handleImport = useCallback((importData: ImportData): void => {
        const importedCustomerId = importData.customer_id;
        if (importedCustomerId === undefined || importedCustomerId === null
            || String(importedCustomerId).trim() === '' || String(importedCustomerId) === '0') {
            const errorMessage = 'The imported document is missing its canonical customer identity.';
            setMessage(errorMessage);
            setMessageType('error');
            toast.error(errorMessage);
            return;
        }
        if (!importData.items.length) {
            const warningMsg = 'No items found in the selected document';
            setMessage(warningMsg);
            setMessageType('warning');
            toast.warning(warningMsg);
            return;
        }

        const suppliedCustomer = importData.customer_details;
        const importedCustomer: Customer = suppliedCustomer
            && typeof suppliedCustomer === 'object'
            ? {
                ...(suppliedCustomer as Customer),
                customer_id: importedCustomerId,
                customer_name: importData.customer_name
                    || (suppliedCustomer as Customer).customer_name
                    || '',
            }
            : {
                customer_id: importedCustomerId,
                customer_name: importData.customer_name || '',
            } as Customer;
        const formattedItems = importData.items.map((item, index) => ({
            ...item,
            id: `imported-${Date.now()}-${index}`,
            quantity: item.quantity,
            free_quantity: item.free_quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            gst_percent: item.gst_percent,
            mrp: item.mrp,
            total: '0.00',
        }));
        const importedCustomerState = importedCustomer.state || '';
        const importedOrder: Order = {
            ...order,
            customer_id: importedCustomerId,
            customer_name: importData.customer_name || importedCustomer.customer_name || '',
            customer_details: importedCustomer,
            billing_address: importData.billing_address || importedCustomer.address || '',
            shipping_address: importData.shipping_address
                || importData.billing_address
                || importedCustomer.address
                || '',
            items: formattedItems,
            notes: importData.notes || order.notes,
            gst_type: determineGstTypeForSupply(
                companyInfo?.state,
                importedCustomerState,
                companyInfo?.gst_number,
                importedCustomer.gst_number,
            ),
            place_of_supply: importedCustomerState || companyInfo?.state || '',
        };

        setSelectedCustomer(importedCustomer);
        setOrder(importedOrder);
        void recalculateTotals(formattedItems, importedOrder);
    }, [companyInfo, order, recalculateTotals]);

    // Update item
    const updateItem = useCallback((index: number, field: string, value: unknown): void => {
        const updatedItems = order.items.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, [field]: value };

                return updatedItem;
            }
            return item;
        });

        setOrder(prev => ({ ...prev, items: updatedItems }));
        recalculateTotals(updatedItems);
    }, [order.items, recalculateTotals]);

    // Remove item
    const removeItem = useCallback((index: number): void => {
        const updatedItems = order.items.filter((_, i) => i !== index);
        setOrder(prev => ({ ...prev, items: updatedItems }));
        recalculateTotals(updatedItems);
    }, [order.items, recalculateTotals]);

    // Update item quantity
    const updateItemQuantity = useCallback((itemId: number | string, newQuantity: number): void => {
        if (newQuantity <= 0) {
            const idx = order.items.findIndex(item => item.id === itemId);
            if (idx >= 0) removeItem(idx);
            return;
        }

        const updatedItems = order.items.map(item =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
        );

        setOrder(prev => ({ ...prev, items: updatedItems }));
        recalculateTotals(updatedItems);
    }, [order.items, removeItem, recalculateTotals]);

    const saveOrder = handleSaveOrder;

    // Print order
    const printOrder = useCallback((): void => {
        document.body.classList.add('printing-order');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-order'), 100);
    }, []);

    // Share on WhatsApp
    const shareOnWhatsApp = useCallback((): void => {
        if (!order.customer_details?.phone) {
            setMessage('Customer phone number is unavailable. Nothing was opened or sent.');
            setMessageType('error');
            return;
        }

        const msg = `
Sales Order: ${order.order_number}
Date: ${order.order_date}
Customer: ${order.customer_name}
Items: ${order.total_quantity}
Amount: ₹${formatExactDecimal(order.total_amount, 'Order total', { scale: 2, maximumWholeDigits: 20 }, 2)}
Expected Delivery: ${order.expected_delivery_date}
    `.trim();

        window.open(`https://wa.me/91${order.customer_details.phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }, [order]);

    // Reset order
    const resetOrder = useCallback((): void => {
        setOrder(createInitialOrder());
        setSelectedCustomer(null);
        setCreatedOrderData(null);
        setShowSuccessModal(false);
        setMessage('');
        setMessageType('');
    }, []);

    return {
        order,
        setOrder,
        selectedCustomer,
        setSelectedCustomer,
        sameAsBilling,
        setSameAsBilling,
        saving: submissionSaving,
        submissionUnavailableReason,
        preparedPreview,
        reviewOpen,
        message,
        messageType,
        selectedBankAccount,
        setSelectedBankAccount,
        createdOrderData,
        showSuccessModal,
        setShowSuccessModal,
        showCustomerModal,
        setShowCustomerModal,
        showProductModal,
        setShowProductModal,
        showImportModal,
        setShowImportModal,
        newProductName,
        setNewProductName,
        handleCustomerSelect,
        handleProductSelect,
        handleImport,
        updateItem,
        removeItem,
        updateItemQuantity,
        saveOrder,
        confirmPreparedOrder,
        closeOrderReview,
        printOrder,
        shareOnWhatsApp,
        resetOrder,
        companyInfo
    };
};

export default useSalesOrderLogic;
