/**
 * useChallanLogic Hook
 * 
 * Centralized business logic for challan creation
 * Pattern: Matches useInvoiceLogic structure
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { challansApi, apiClient, employeesAPI } from '../../../../services/api';
import {
    Challan,
    ChallanItem,
    CustomerDetails,
    Employee,
    ImportData,
    CreatedChallanData,
    getInitialChallan
} from '../types/challanTypes';

// ==================== HOOK ====================

export interface UseChallanLogicProps {
    onClose?: () => void;
    sameAsBillingInitial?: boolean;
}

export function useChallanLogic({ onClose, sameAsBillingInitial = true }: UseChallanLogicProps = {}) {
    // ==================== STATE ====================
    const [challan, setChallan] = useState<Challan>(getInitialChallan());
    const [currentStep, setCurrentStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetails | null>(null);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [showCreateProduct, setShowCreateProduct] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdChallanData, setCreatedChallanData] = useState<CreatedChallanData | null>(null);
    const [sameAsBilling, setSameAsBilling] = useState(sameAsBillingInitial);
    const [newProductName, setNewProductName] = useState('');
    const [fetchingAddress, setFetchingAddress] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedMR, setSelectedMR] = useState<Employee | null>(null);

    // ==================== REFS ====================
    const customerSearchRef = useRef<HTMLInputElement>(null);
    const productSearchRef = useRef<HTMLInputElement>(null);
    const itemsTableRef = useRef<any>(null);
    const challanFormRef = useRef<HTMLFormElement>(null);

    // ==================== LOAD EMPLOYEES ====================
    const loadEmployees = useCallback(async () => {
        try {
            const response = await employeesAPI.getAll({ is_active: true, limit: 100 });
            if (response.success) {
                setEmployees(response.data || []);
            }
        } catch (error) {
            console.error('Failed to load employees:', error);
        }
    }, []);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    // ==================== FETCH ADDRESS ====================
    const fetchCustomerAddress = async (customerId: string | number) => {
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
                    state: preferredAddr.state_name || '',
                    pincode: preferredAddr.pincode || ''
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    // ==================== GENERATE CHALLAN NUMBER ====================
    const generateChallanNumber = useCallback(async () => {
        try {
            const { generateChallanNumber: genNum } = await import('../../../../services/offline/documents/documentNumberGenerator');
            const challanNumber = await genNum();
            setChallan(prev => ({ ...prev, challan_number: challanNumber }));
        } catch (error) {
            console.error('Failed to generate challan number:', error);
            const now = new Date();
            const year = now.getFullYear() % 100;
            const yearPrefix = year.toString().padStart(2, '0');
            const timestamp = Date.now();
            const uniqueNum = 10000000 + (timestamp % 90000000);
            setChallan(prev => ({ ...prev, challan_number: `DC-${yearPrefix}${uniqueNum}` }));
        }
    }, []);

    // ==================== RECALCULATE TOTALS ====================
    const recalculateTotals = useCallback((items: ChallanItem[]) => {
        const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0);
        const totalAmount = items.reduce((sum, item) => {
            const quantity = parseFloat(String(item.quantity)) || 0;
            const unitPrice = parseFloat(String(item.unit_price || item.rate || item.sale_price)) || 0;
            return sum + (quantity * unitPrice);
        }, 0);

        setChallan(prev => ({
            ...prev,
            total_quantity: totalQuantity,
            total_amount: totalAmount
        }));
    }, []);

    // ==================== HANDLE CUSTOMER SELECT ====================
    const handleCustomerSelect = useCallback(async (customer: CustomerDetails | null) => {
        setSelectedCustomer(customer);

        if (!customer) {
            setChallan(prev => ({
                ...prev,
                customer_id: '',
                customer_name: '',
                customer_details: null,
                billing_address: '',
                delivery_address: '',
                delivery_city: '',
                delivery_state: '',
                delivery_pincode: '',
                delivery_contact_person: '',
                delivery_contact_phone: ''
            }));
            return;
        }

        let address = customer.address || customer.address_line1 || '';
        let city = customer.city || '';
        let state = customer.state || customer.state_name || '';
        let pincode = customer.pincode || customer.pin_code || customer.postal_code || '';
        const phone = customer.phone || customer.primary_phone || customer.mobile || customer.contact_number || '';

        let addressParts = [address, city, state, pincode].filter(part => part && part.trim());
        let billingAddress = addressParts.join(', ');

        if (!address && !city && customer.customer_id) {
            setFetchingAddress(true);
            const addressData = await fetchCustomerAddress(customer.customer_id);
            if (addressData) {
                address = addressData.address;
                city = addressData.city;
                state = addressData.state;
                pincode = addressData.pincode;
                const newAddressParts = [address, city, state, pincode].filter(part => part && part.trim());
                billingAddress = newAddressParts.join(', ');
                customer = { ...customer, address, city, state, pincode };
                setSelectedCustomer(customer);
            }
            setFetchingAddress(false);
        }

        setChallan(prev => ({
            ...prev,
            customer_id: customer.customer_id || '',
            customer_name: customer.customer_name || customer.name || '',
            customer_details: { ...customer, address, city, state, pincode, phone },
            billing_address: billingAddress,
            delivery_address: sameAsBilling ? address : prev.delivery_address,
            delivery_city: sameAsBilling ? city : prev.delivery_city,
            delivery_state: sameAsBilling ? state : prev.delivery_state,
            delivery_pincode: sameAsBilling ? pincode : prev.delivery_pincode,
            delivery_contact_person: sameAsBilling ? (customer.contact_person || customer.customer_name || customer.name || '') : prev.delivery_contact_person,
            delivery_contact_phone: sameAsBilling ? phone : prev.delivery_contact_phone
        }));
    }, [sameAsBilling]);

    // ==================== HANDLE PRODUCT SELECT ====================
    const handleProductSelect = useCallback((product: any) => {
        const existingItem = challan.items.find(item => item.product_id === product.product_id);

        if (existingItem) {
            const updatedItems = challan.items.map(item =>
                item.id === existingItem.id ? { ...item, quantity: item.quantity + 1 } : item
            );
            setChallan(prev => ({ ...prev, items: updatedItems }));
            recalculateTotals(updatedItems);
        } else {
            const quantity = 1;
            const unitPrice = product.sale_price || product.mrp || 0;
            const total = quantity * unitPrice;

            const newItem: ChallanItem = {
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
                gst_percent: product.gst_percent || 0,
                manufacturer: product.manufacturer,
                category: product.category
            };

            const updatedItems = [...challan.items, newItem];
            setChallan(prev => ({ ...prev, items: updatedItems }));
            recalculateTotals(updatedItems);

            setTimeout(() => {
                if (itemsTableRef.current?.focusFirstField) {
                    itemsTableRef.current.focusFirstField();
                }
            }, 150);
        }
    }, [challan.items, recalculateTotals]);

    // ==================== HANDLE IMPORT ====================
    const handleImport = useCallback((importData: ImportData) => {
        if (importData.customer_id && importData.customer_details) {
            setSelectedCustomer(importData.customer_details);
            handleCustomerSelect(importData.customer_details);
        }

        if (importData.delivery_address) {
            setSameAsBilling(false);
            setChallan(prev => ({
                ...prev,
                delivery_address: importData.delivery_address || '',
                delivery_city: importData.delivery_city || '',
                delivery_state: importData.delivery_state || '',
                delivery_pincode: importData.delivery_pincode || ''
            }));
        }

        if (importData.items && importData.items.length > 0) {
            const formattedItems: ChallanItem[] = importData.items.map((item, index) => ({
                ...item,
                id: item.id || `imported-${Date.now()}-${index}`,
                quantity: parseFloat(String(item.quantity)) || 0,
                unit_price: parseFloat(String(item.unit_price || item.rate || item.sale_price)) || 0,
                rate: parseFloat(String(item.rate || item.unit_price || item.sale_price)) || 0,
                sale_price: parseFloat(String(item.sale_price || item.rate || item.unit_price)) || 0,
                line_total: 0
            }));

            setChallan(prev => ({
                ...prev,
                items: formattedItems,
                notes: importData.notes || prev.notes
            }));

            setTimeout(() => recalculateTotals(formattedItems), 100);
        } else {
            setMessage('⚠️ No items found in the selected document');
            setMessageType('warning');
        }
    }, [handleCustomerSelect, recalculateTotals]);

    // ==================== UPDATE ITEM ====================
    const updateItem = useCallback((index: number, field: string, value: any) => {
        const updatedItems = challan.items.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'quantity' || field === 'unit_price' || field === 'rate') {
                    const quantity = parseFloat(field === 'quantity' ? value : String(item.quantity)) || 0;
                    const unitPrice = parseFloat(field === 'unit_price' || field === 'rate' ? value : String(item.unit_price || item.rate)) || 0;
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

        setChallan(prev => ({ ...prev, items: updatedItems }));
        recalculateTotals(updatedItems);
    }, [challan.items, recalculateTotals]);

    // ==================== REMOVE ITEM ====================
    const removeItem = useCallback((itemId: number | string) => {
        const updatedItems = challan.items.filter(item => item.id !== itemId);
        setChallan(prev => ({ ...prev, items: updatedItems }));
        recalculateTotals(updatedItems);
    }, [challan.items, recalculateTotals]);

    // ==================== SAVE CHALLAN ====================
    const saveChallan = useCallback(async () => {
        setSaving(true);
        try {
            if (!challan.customer_id) {
                alert('Please select a customer');
                setSaving(false);
                return;
            }

            if (!challan.items || challan.items.length === 0) {
                alert('Please add at least one item');
                setSaving(false);
                return;
            }

            const apiItems = challan.items.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                batch_id: item.batch_id || null,
                batch_number: item.batch_number || null,
                expiry_date: item.expiry_date || null,
                ordered_quantity: null,
                dispatched_quantity: item.quantity,
                unit_price: item.unit_price || item.rate || item.sale_price || 0,
                gst_percent: item.gst_percent || 0,
                cgst_percent: (item.gst_percent || 0) / 2,
                sgst_percent: (item.gst_percent || 0) / 2,
                igst_percent: 0,
                uom: item.unit || item.base_uom || 'NOS',
                package_type: 'UNIT'
            }));

            const totalAmount = apiItems.reduce((sum, item) =>
                sum + ((item.dispatched_quantity || 0) * (item.unit_price || 0)), 0
            ) + (parseFloat(String(challan.freight_charges)) || 0);

            let finalChallanNumber = challan.challan_number;
            if (!finalChallanNumber) {
                await generateChallanNumber();
                finalChallanNumber = challan.challan_number;
            }

            const challanData = {
                challan_number: finalChallanNumber,
                challan_date: challan.challan_date,
                expected_delivery_date: challan.expected_delivery_date || challan.challan_date,
                customer_id: challan.customer_id,
                customer_name: challan.customer_name,
                delivery_address: challan.delivery_address || selectedCustomer?.address || 'N/A',
                delivery_city: challan.delivery_city || selectedCustomer?.city || 'Mumbai',
                delivery_state: challan.delivery_state || selectedCustomer?.state || 'Maharashtra',
                delivery_pincode: challan.delivery_pincode || selectedCustomer?.pincode || '400001',
                items: apiItems,
                transport_company: challan.transport_company || '',
                vehicle_number: challan.vehicle_number || '',
                driver_phone: challan.driver_phone || '',
                freight_charges: parseFloat(String(challan.freight_charges)) || 0,
                lr_number: challan.lr_number || '',
                notes: challan.notes || '',
                total_amount: totalAmount
            };

            const response = await challansApi.create(challanData);

            if (response.data) {
                const challanNumber = response.data.challan_number || challan.challan_number || `DC-${response.data.challan_id}`;
                const createdData: CreatedChallanData = {
                    ...response.data,
                    challan_id: response.data.challan_id,
                    challan_number: challanNumber,
                    customer_name: challan.customer_name,
                    customer_details: challan.customer_details || undefined,
                    items: challan.items,
                    total_amount: challan.total_amount
                };
                setCreatedChallanData(createdData);
                setShowSuccessModal(true);
            }
        } catch (error: any) {
            let errorMsg = 'Failed to save challan';
            if (error.response?.data?.detail) {
                if (Array.isArray(error.response.data.detail)) {
                    errorMsg = error.response.data.detail.map((err: any) =>
                        typeof err === 'object' ? `${err.loc?.join('.') || 'Field'}: ${err.msg}` : err
                    ).join('\n');
                } else {
                    errorMsg = error.response.data.detail;
                }
            } else if (error.message) {
                errorMsg = error.message;
            }
            alert(`Error: ${errorMsg}`);
        } finally {
            setSaving(false);
        }
    }, [challan, selectedCustomer, generateChallanNumber]);

    // ==================== SHARE ON WHATSAPP ====================
    const shareOnWhatsApp = useCallback(() => {
        if (!challan.customer_details?.phone) {
            alert('Customer phone number not available');
            return;
        }

        const message = `
Delivery Challan: ${challan.challan_number}
Date: ${challan.challan_date}
Customer: ${challan.customer_name}
Items: ${challan.total_quantity}
Amount: ₹${challan.total_amount.toFixed(2)}
Expected Delivery: ${challan.expected_delivery_date}
    `.trim();

        const whatsappUrl = `https://wa.me/91${challan.customer_details.phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    }, [challan]);

    // ==================== PRINT ====================
    const printChallan = useCallback(() => {
        window.print();
    }, []);

    const thermalPrintChallan = useCallback((width: string = '80mm') => {
        const printWindow = window.open('', '', 'width=400,height=600');
        if (!printWindow) return;

        const challanDate = new Date(challan.challan_date).toLocaleDateString('en-IN');
        const expectedDeliveryDate = new Date(challan.expected_delivery_date).toLocaleDateString('en-IN');

        const formatAddress = (addr: any) => {
            if (!addr) return '';
            if (typeof addr === 'string') return addr;
            const parts = [];
            if (addr.address_line_1) parts.push(addr.address_line_1);
            if (addr.address_line_2) parts.push(addr.address_line_2);
            if (addr.city) parts.push(addr.city);
            if (addr.state) parts.push(addr.state);
            if (addr.pincode) parts.push(addr.pincode);
            return parts.join(', ');
        };

        const thermalHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Challan - ${challan.challan_number}</title>
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { font-family: monospace; font-size: ${width === '58mm' ? '10px' : '12px'}; line-height: 1.3; margin: 0; padding: 5px; width: ${width}; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 3px 0; }
          .item-row { display: flex; justify-content: space-between; margin: 2px 0; }
          .total-section { margin-top: 5px; padding-top: 5px; border-top: 1px dashed #000; }
        </style>
      </head>
      <body>
        <div class="center bold">DELIVERY CHALLAN</div>
        <div class="center">${challan.challan_number}</div>
        <div class="divider"></div>
        <div>Date: ${challanDate}</div>
        <div>Expected: ${expectedDeliveryDate}</div>
        <div class="divider"></div>
        <div class="bold">Customer:</div>
        <div>${challan.customer_name || 'N/A'}</div>
        <div class="divider"></div>
        <div class="bold">Delivery To:</div>
        <div>${formatAddress(challan.delivery_address) || 'N/A'}</div>
        <div class="divider"></div>
        <div class="bold">Items:</div>
        ${challan.items.map((item, idx) => `
          <div class="item-row"><span>${idx + 1}. ${item.product_name || 'N/A'}</span></div>
          <div class="item-row"><span>  Qty: ${item.quantity} ${item.unit || ''}</span><span>₹${(item.rate || item.unit_price || 0).toFixed(2)}</span></div>
        `).join('')}
        <div class="total-section">
          <div class="item-row"><span class="bold">Total Items:</span><span>${challan.items.length}</span></div>
          <div class="item-row"><span class="bold">Total Qty:</span><span>${challan.total_quantity}</span></div>
        </div>
        <div class="divider"></div>
        <div class="center">Thank You!</div>
      </body>
      </html>
    `;

        printWindow.document.write(thermalHTML);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    }, [challan]);

    // ==================== RETURN ====================
    return {
        // State
        challan,
        setChallan,
        selectedCustomer,
        setSelectedCustomer,
        employees,
        selectedMR,
        setSelectedMR,

        // UI State
        currentStep,
        setCurrentStep,
        saving,
        showCreateCustomer,
        setShowCreateCustomer,
        showCreateProduct,
        setShowCreateProduct,
        showImportModal,
        setShowImportModal,
        showSuccessModal,
        setShowSuccessModal,
        createdChallanData,
        sameAsBilling,
        setSameAsBilling,
        newProductName,
        setNewProductName,
        fetchingAddress,
        message,
        messageType,

        // Refs
        customerSearchRef,
        productSearchRef,
        itemsTableRef,
        challanFormRef,

        // Handlers
        handleCustomerSelect,
        handleProductSelect,
        handleImport,
        updateItem,
        removeItem,
        saveChallan,
        shareOnWhatsApp,
        printChallan,
        thermalPrintChallan,
        generateChallanNumber,
        recalculateTotals,

        // Utilities
        onClose
    };
}

export default useChallanLogic;
