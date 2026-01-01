/**
 * useSalesOrderLogic Hook
 * Manages state and logic for sales order creation flow
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { apiClient, usersApi, authApi } from '../../../../services/api';
import EnterpriseCalculator from '../../../../services/enterpriseCalculator';
import documentNumberGenerator from '../../../../services/offline/documents/documentNumberGenerator';
import { useCompany } from '../../../../contexts/CompanyContext';
import type { Order, OrderItem, Address, CalculationResult, CreatedOrderData, BankAccount } from '../../../../types/models';

// ==================== TYPE DEFINITIONS ====================

interface Customer {
    customer_id?: number | string;
    id?: number | string;
    customer_name?: string;
    name?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    state_name?: string;
    pincode?: string;
    phone?: string;
    primary_phone?: string;
    email?: string;
    gstin?: string;
    dl_number?: string;
}

interface Employee {
    user_id?: number | string;
    id?: number | string;
    full_name?: string;
    name?: string;
    email?: string;
}

interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
    state?: string;
    city?: string;
}

interface Product {
    product_id: number | string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: number | string;
    batch_number?: string;
    batch_no?: string;
    quantity?: number;
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;
    mrp?: number;
    sale_price?: number;
    unit_price?: number;
    gst_percent?: number;
    manufacturer?: string;
    category?: string;
}

interface ImportData {
    customer_id?: number | string;
    customer_details?: Customer;
    billing_address?: string;
    shipping_address?: string;
    items?: OrderItem[];
    notes?: string;
}

export interface UseSalesOrderLogicReturn {
    // State
    order: Order;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    selectedCustomer: Customer | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
    sameAsBilling: boolean;
    setSameAsBilling: React.Dispatch<React.SetStateAction<boolean>>;
    employees: Employee[];
    saving: boolean;
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
    handleProductSelect: (product: Product) => void;
    handleImport: (importData: ImportData) => void;
    updateItem: (index: number, field: string, value: unknown) => void;
    removeItem: (index: number) => void;
    updateItemQuantity: (itemId: number | string, newQuantity: number) => void;
    saveOrder: () => Promise<void>;
    printOrder: () => void;
    shareOnWhatsApp: () => void;
    resetOrder: () => void;

    // Company info
    companyInfo: CompanyInfo;
}

// ==================== INITIAL STATE ====================

const createInitialOrder = (): Order => ({
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: null,
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
    sales_person: localStorage.getItem('userName') || 'Admin',
    created_by: localStorage.getItem('userName') || 'Admin',
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
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
    const [createdOrderData, setCreatedOrderData] = useState<CreatedOrderData | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Modal states
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [newProductName, setNewProductName] = useState('');

    // Load employees
    useEffect(() => {
        const loadEmployees = async (): Promise<void> => {
            try {
                const response = await usersApi.getAll({ limit: 20, role: 'sales' });
                const users = response.data?.data || response.data?.users || response.data || [];

                if (Array.isArray(users) && users.length > 0) {
                    setEmployees(users);
                    if (!order.created_by && users.length > 0) {
                        setOrder(prev => ({
                            ...prev,
                            created_by: users[0].user_id || users[0].id,
                            created_by_name: users[0].full_name || users[0].name || 'User'
                        }));
                    }
                } else {
                    throw new Error('No users returned');
                }
            } catch {
                const currentUser = authApi.getCurrentUser() as Employee | null;
                const fallbackUser: Employee = currentUser ? {
                    user_id: currentUser.user_id || currentUser.id,
                    full_name: currentUser.full_name || currentUser.name || 'Current User',
                    email: currentUser.email
                } : {
                    user_id: undefined,
                    full_name: companyInfo.name ? `${companyInfo.name} User` : 'User',
                    email: companyInfo.email || ''
                };

                setEmployees([fallbackUser]);

                if (!order.created_by && fallbackUser.user_id) {
                    setOrder(prev => ({
                        ...prev,
                        created_by: fallbackUser.user_id || null,
                        created_by_name: fallbackUser.full_name
                    }));
                }
            }
        };

        loadEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyInfo]);

    // Calculate fallback totals
    const calculateFallbackTotals = useCallback((items: OrderItem[]): Partial<Order> => {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        items.forEach(item => {
            const quantity = parseFloat(String(item.quantity)) || 0;
            const unitPrice = parseFloat(String(item.unit_price)) || 0;
            const discountPercent = parseFloat(String(item.discount_percent)) || 0;
            const gstPercent = parseFloat(String(item.gst_percent)) || 0;

            const lineSubtotal = quantity * unitPrice;
            const itemDiscount = (lineSubtotal * discountPercent) / 100;
            const taxableAmount = lineSubtotal - itemDiscount;
            const taxAmount = (taxableAmount * gstPercent) / 100;

            subtotal += lineSubtotal;
            totalDiscount += itemDiscount;
            totalTax += taxAmount;
        });

        const taxableTotal = subtotal - totalDiscount;
        const finalTotal = taxableTotal + totalTax;

        return {
            subtotal_amount: taxableTotal,
            discount_amount: totalDiscount,
            tax_amount: totalTax,
            total_amount: finalTotal,
            final_amount: finalTotal,
            cgst_amount: totalTax / 2,
            sgst_amount: totalTax / 2
        };
    }, []);

    // Recalculate totals
    const recalculateTotals = useCallback(async (items: OrderItem[]): Promise<void> => {
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
            const orderData = { ...order, items, customer_id: selectedCustomer?.customer_id };
            // FIX: EnterpriseCalculator.calculateSalesOrder returns CalculatedTotals
            // Removing 'await' as it is synchronous and removing invalid 'as CalculationResult' cast
            const result = EnterpriseCalculator.calculateSalesOrder(orderData);

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
                    total_quantity: items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0),
                    subtotal_amount: formattedTotals.gross_amount || 0,
                    discount_amount: formattedTotals.total_discount || 0,
                    tax_amount: formattedTotals.total_gst || formattedTotals.total_tax || 0,
                    total_amount: formattedTotals.final_amount || formattedTotals.total_amount || 0,
                    final_amount: formattedTotals.final_amount || formattedTotals.total_amount || 0,
                    cgst_amount: formattedTotals.cgst_amount || 0,
                    sgst_amount: formattedTotals.sgst_amount || 0,
                    igst_amount: formattedTotals.igst_amount || 0,
                    calculatedLineItems: result.items as any
                }));
            } else {
                const fallbackTotals = calculateFallbackTotals(items);
                setOrder(prev => ({
                    ...prev,
                    total_quantity: items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0),
                    ...fallbackTotals
                }));
            }
        } catch (error) {
            console.error('Calculation error:', error);
            toast.warning('Using local calculation. Error in calculator.');
            const fallbackTotals = calculateFallbackTotals(items);
            setOrder(prev => ({
                ...prev,
                total_quantity: items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0),
                ...fallbackTotals
            }));
        }
    }, [order, selectedCustomer, calculateFallbackTotals]);

    // Handle customer selection
    const handleCustomerSelect = useCallback(async (customer: Customer | null): Promise<void> => {
        setSelectedCustomer(customer);

        if (!customer) {
            setOrder(prev => ({
                ...prev,
                customer_id: null,
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
                    if (preferredAddr.state || preferredAddr.state_name) fetchedParts.push(preferredAddr.state || preferredAddr.state_name);
                    if (preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code) {
                        fetchedParts.push(preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code);
                    }
                    fullAddress = fetchedParts.filter(Boolean).join(', ');

                    addressData = {
                        address_line1: preferredAddr.address_line1 || '',
                        address_line2: preferredAddr.address_line2 || '',
                        city: preferredAddr.city || '',
                        state: preferredAddr.state || preferredAddr.state_name || '',
                        pincode: preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code || '',
                        country: preferredAddr.country || 'India'
                    };

                    customer = {
                        ...customer,
                        address: preferredAddr.address_line1 || '',
                        address2: preferredAddr.address_line2 || '',
                        city: preferredAddr.city || '',
                        state: preferredAddr.state || preferredAddr.state_name || '',
                        pincode: preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code || ''
                    };
                    setSelectedCustomer(customer);
                }
            } catch {
                // Silent error
            }
        }

        const customerState = addressData.state || customer.state || customer.state_name || '';
        const companyState = companyInfo.state || 'Gujarat';
        const cleanCustomerState = customerState.trim().toLowerCase();
        const cleanCompanyState = companyState.trim().toLowerCase();
        const gstType = (cleanCustomerState === cleanCompanyState || cleanCustomerState === '') ? 'CGST/SGST' : 'IGST';

        setOrder(prev => ({
            ...prev,
            customer_id: customer?.customer_id || customer?.id || null,
            customer_name: customer?.customer_name || customer?.name || '',
            customer_details: customer as unknown as Order['customer_details'],
            billing_address: fullAddress,
            shipping_address: fullAddress,
            billing_address_data: addressData,
            shipping_address_data: addressData,
            gst_type: gstType,
            place_of_supply: customerState || companyState
        }));
    }, [companyInfo]);

    // Handle product selection
    const handleProductSelect = useCallback((product: Product): void => {
        const existingItem = order.items.find(item => item.product_id === product.product_id);

        if (existingItem) {
            const updatedItems = order.items.map(item =>
                item.product_id === product.product_id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            );
            setOrder(prev => ({ ...prev, items: updatedItems }));
            recalculateTotals(updatedItems);
        } else {
            const quantity = 1;
            const unitPrice = product.sale_price || product.mrp || 0;
            const discountPercent = 0;
            const gstPercent = product.gst_percent || 0;

            const subtotal = quantity * unitPrice;
            const discountAmount = (subtotal * discountPercent) / 100;
            const taxableAmount = subtotal - discountAmount;
            const taxAmount = (taxableAmount * gstPercent) / 100;
            const finalAmount = taxableAmount + taxAmount;

            const newItem: OrderItem = {
                id: Date.now(),
                product_id: product.product_id,
                product_name: product.product_name,
                hsn_code: product.hsn_code,
                batch_id: product.batch_id,
                batch_number: product.batch_number || product.batch_no,
                quantity,
                unit: product.unit || product.uom || 'NOS',
                pack_size: product.pack_size || product.pack_type,
                mrp: product.mrp || 0,
                unit_price: unitPrice,
                discount_percent: discountPercent,
                discount_amount: discountAmount,
                gst_percent: gstPercent,
                tax_amount: taxAmount,
                subtotal,
                total: finalAmount,
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
        if (importData.customer_id && importData.customer_details) {
            setSelectedCustomer(importData.customer_details);
            handleCustomerSelect(importData.customer_details);
        }

        if (importData.billing_address) {
            setOrder(prev => ({
                ...prev,
                billing_address: importData.billing_address || '',
                shipping_address: importData.shipping_address || importData.billing_address || ''
            }));
        }

        if (importData.items && importData.items.length > 0) {
            const formattedItems: OrderItem[] = importData.items.map((item, index) => ({
                ...item,
                id: item.id || `imported-${Date.now()}-${index}`,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: parseFloat(String(item.quantity)) || 0,
                unit_price: parseFloat(String(item.unit_price || item.rate || item.sale_price)) || 0,
                discount_percent: parseFloat(String(item.discount_percent)) || 0,
                gst_percent: parseFloat(String(item.gst_percent)) || 0,
                total: 0
            }));

            setOrder(prev => ({
                ...prev,
                items: formattedItems,
                notes: importData.notes || prev.notes
            }));

            setTimeout(() => recalculateTotals(formattedItems), 100);
        } else {
            const warningMsg = 'No items found in the selected document';
            setMessage(warningMsg);
            setMessageType('warning');
            toast.warning(warningMsg);
        }
    }, [handleCustomerSelect, recalculateTotals]);

    // Update item
    const updateItem = useCallback((index: number, field: string, value: unknown): void => {
        const updatedItems = order.items.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, [field]: value };

                if (field === 'quantity' || field === 'unit_price' || field === 'discount_percent' || field === 'gst_percent') {
                    const quantity = parseFloat(String(updatedItem.quantity)) || 0;
                    const unitPrice = parseFloat(String(updatedItem.unit_price)) || 0;
                    const discountPercent = parseFloat(String(updatedItem.discount_percent)) || 0;
                    const gstPercent = parseFloat(String(updatedItem.gst_percent)) || 0;

                    const subtotal = quantity * unitPrice;
                    const discountAmount = (subtotal * discountPercent) / 100;
                    const taxableAmount = subtotal - discountAmount;
                    const gstAmount = (taxableAmount * gstPercent) / 100;

                    updatedItem.subtotal = subtotal;
                    updatedItem.discount_amount = discountAmount;
                    updatedItem.tax_amount = gstAmount;
                    updatedItem.total = taxableAmount + gstAmount;
                }

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

    // Save order
    const saveOrder = useCallback(async (): Promise<void> => {
        setSaving(true);
        try {
            const orderNumber = await documentNumberGenerator.generateSalesOrderNumber();

            const salesOrderData = {
                customer_id: parseInt(String(order.customer_id)),
                order_date: order.order_date || new Date().toISOString().split('T')[0],
                delivery_date: order.expected_delivery_date || order.order_date,
                order_type: 'sales',
                payment_terms: 'credit',
                items: order.items.map(item => {
                    const quantity = parseInt(String(item.quantity)) || 1;
                    const freeQuantity = parseInt(String(item.free_quantity)) || 0;
                    const unitPrice = parseFloat(String(item.unit_price)) || 0;
                    const discountPercent = parseFloat(String(item.discount_percent)) || 0;
                    const taxPercent = parseFloat(String(item.gst_percent)) || 0;

                    const subtotal = quantity * unitPrice;
                    const discountAmount = (subtotal * discountPercent) / 100;
                    const taxableAmount = subtotal - discountAmount;
                    const taxAmount = (taxableAmount * taxPercent) / 100;

                    return {
                        product_id: parseInt(String(item.product_id)),
                        product_code: item.product_code || null,
                        batch_id: item.batch_id ? parseInt(String(item.batch_id)) : null,
                        batch_number: item.batch_number || null,
                        quantity,
                        free_quantity: freeQuantity,
                        unit_price: unitPrice,
                        mrp: parseFloat(String(item.mrp)) || unitPrice,
                        discount_percent: discountPercent,
                        discount_amount: discountAmount,
                        tax_percent: taxPercent,
                        tax_amount: taxAmount,
                        gst_type: order.gst_type || 'CGST/SGST',
                        uom: item.uom || null,
                        pack_type: item.pack_type || null
                    };
                }),
                notes: order.notes || '',
                billing_address: order.billing_address || '',
                shipping_address: order.shipping_address || '',
                discount_amount: parseFloat(String(order.discount_amount)) || 0,
                other_charges: parseFloat(String(order.other_charges)) || 0
            };

            const response = await apiClient.post('/sales-orders/', salesOrderData);

            if (response?.data) {
                const createdOrderId = response.data.order_id || response.data.id;
                const createdOrderNumber = response.data.order_number || response.data.order_no || orderNumber;

                setOrder(prev => ({ ...prev, order_number: createdOrderNumber, order_id: createdOrderId }));
                setCreatedOrderData({
                    orderId: createdOrderId,
                    orderNumber: createdOrderNumber,
                    customerName: selectedCustomer?.customer_name || order.customer_name,
                    totalAmount: order.total_amount || 0
                });

                toast.success('Sales order created successfully!');
                setShowSuccessModal(true);
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error: unknown) {
            toast.error('Failed to create sales order');
            const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
            let errorMessage = 'Failed to create sales order';

            if (err.response?.data?.detail) {
                const details = err.response.data.detail;
                if (Array.isArray(details)) {
                    errorMessage = details.map((e: { loc?: string[]; msg: string }) =>
                        `${e.loc?.join('.') || 'Field'}: ${e.msg}`
                    ).join('\n');
                } else {
                    errorMessage = String(details);
                }
            } else if (err.message) {
                errorMessage = err.message;
            }

            setMessage(errorMessage);
            setMessageType('error');
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [order, selectedCustomer]);

    // Print order
    const printOrder = useCallback((): void => {
        document.body.classList.add('printing-order');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-order'), 100);
    }, []);

    // Share on WhatsApp
    const shareOnWhatsApp = useCallback((): void => {
        if (!order.customer_details?.phone) {
            alert('Customer phone number not available');
            return;
        }

        const msg = `
Sales Order: ${order.order_number}
Date: ${order.order_date}
Customer: ${order.customer_name}
Items: ${order.total_quantity}
Amount: ₹${order.total_amount.toFixed(2)}
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
        employees,
        saving,
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
        printOrder,
        shareOnWhatsApp,
        resetOrder,
        companyInfo
    };
};

export default useSalesOrderLogic;
