/**
 * useChallanLogic Hook (Refactored)
 * 
 * Centralized business logic for challan creation.
 * Now COMPOSES useSalesTransaction for common operations,
 * keeping only challan-specific logic here.
 * 
 * Pattern: Composition over duplication
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { challansApi } from '../../../../services/api';
import { useSalesTransaction } from '../../hooks/useSalesTransaction';
import {
    Challan,
    ChallanItem,
    CustomerDetails,
    Employee,
    ImportData,
    CreatedChallanData,
    getInitialChallan
} from '../types/challanTypes';

// ==================== PROPS ====================

export interface UseChallanLogicProps {
    onClose?: () => void;
    sameAsBillingInitial?: boolean;
}

// ==================== THE HOOK ====================

export function useChallanLogic({ onClose, sameAsBillingInitial = true }: UseChallanLogicProps = {}) {

    // ==================== COMPOSE SHARED TRANSACTION LOGIC ====================
    const {
        document: challan,
        setDocument: setChallan,
        selectedCustomer,
        setSelectedCustomer,
        employees,
        selectedMR,
        setSelectedMR,
        loadingEmployees,
        saving: baseSaving,
        fetchingAddress,
        productSearchRef,
        itemsTableRef,
        handleCustomerSelect: baseHandleCustomerSelect,
        handleProductSelect,
        updateItem,
        removeItem,
        recalculateTotals,
        fetchCustomerAddress,
        resetDocument
    } = useSalesTransaction<Challan, CustomerDetails, ChallanItem>({
        getInitialDocument: getInitialChallan,
        documentType: 'challan',
        priceField: 'sale_price',
        includeGst: false,
        onClose
    });

    // ==================== CHALLAN-SPECIFIC STATE ====================
    const [currentStep, setCurrentStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [showCreateProduct, setShowCreateProduct] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdChallanData, setCreatedChallanData] = useState<CreatedChallanData | null>(null);
    const [sameAsBilling, setSameAsBilling] = useState(sameAsBillingInitial);
    const [newProductName, setNewProductName] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');

    // ==================== CHALLAN-SPECIFIC REFS ====================
    const customerSearchRef = useRef<HTMLInputElement>(null);
    const challanFormRef = useRef<HTMLFormElement>(null);

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
    }, [setChallan]);

    // ==================== ENHANCED CUSTOMER SELECT (with delivery address logic) ====================
    const handleCustomerSelect = useCallback(async (customer: CustomerDetails | null) => {
        // Call base handler first
        await baseHandleCustomerSelect(customer);

        if (!customer) {
            setChallan(prev => ({
                ...prev,
                customer_details: null,
                delivery_address: '',
                delivery_city: '',
                delivery_state: '',
                delivery_pincode: '',
                delivery_contact_person: '',
                delivery_contact_phone: ''
            }));
            return;
        }

        // Challan-specific: handle delivery address based on sameAsBilling
        const address = customer.address || customer.address_line1 || '';
        const city = customer.city || '';
        const state = customer.state || customer.state_name || '';
        const pincode = customer.pincode || customer.pin_code || customer.postal_code || '';
        const phone = customer.phone || customer.primary_phone || customer.mobile || customer.contact_number || '';

        setChallan(prev => ({
            ...prev,
            customer_details: { ...customer, address, city, state, pincode, phone } as CustomerDetails,
            delivery_address: sameAsBilling ? address : prev.delivery_address,
            delivery_city: sameAsBilling ? city : prev.delivery_city,
            delivery_state: sameAsBilling ? state : prev.delivery_state,
            delivery_pincode: sameAsBilling ? pincode : prev.delivery_pincode,
            delivery_contact_person: sameAsBilling ? (customer.contact_person || customer.customer_name || customer.name || '') : prev.delivery_contact_person,
            delivery_contact_phone: sameAsBilling ? phone : prev.delivery_contact_phone
        }));
    }, [baseHandleCustomerSelect, sameAsBilling, setChallan]);

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

            // Recalculate totals and update document
            setTimeout(() => {
                const { totalQuantity, totalAmount } = recalculateTotals(formattedItems);
                setChallan(prev => ({
                    ...prev,
                    total_quantity: totalQuantity,
                    total_amount: totalAmount
                }));
            }, 100);
        } else {
            setMessage('⚠️ No items found in the selected document');
            setMessageType('warning');
        }
    }, [handleCustomerSelect, recalculateTotals, setChallan, setSelectedCustomer]);

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
                delivery_address: challan.delivery_address || (selectedCustomer as CustomerDetails)?.address || 'N/A',
                delivery_city: challan.delivery_city || (selectedCustomer as CustomerDetails)?.city || 'Mumbai',
                delivery_state: challan.delivery_state || (selectedCustomer as CustomerDetails)?.state || 'Maharashtra',
                delivery_pincode: challan.delivery_pincode || (selectedCustomer as CustomerDetails)?.pincode || '400001',
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
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
            let errorMsg = 'Failed to save challan';
            if (err.response?.data?.detail) {
                if (Array.isArray(err.response.data.detail)) {
                    errorMsg = err.response.data.detail.map((e: { loc?: string[]; msg?: string }) =>
                        typeof e === 'object' ? `${e.loc?.join('.') || 'Field'}: ${e.msg}` : String(e)
                    ).join('\n');
                } else {
                    errorMsg = String(err.response.data.detail);
                }
            } else if (err.message) {
                errorMsg = err.message;
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

        const formatAddress = (addr: unknown) => {
            if (!addr) return '';
            if (typeof addr === 'string') return addr;
            const a = addr as { address_line_1?: string; address_line_2?: string; city?: string; state?: string; pincode?: string };
            const parts: string[] = [];
            if (a.address_line_1) parts.push(a.address_line_1);
            if (a.address_line_2) parts.push(a.address_line_2);
            if (a.city) parts.push(a.city);
            if (a.state) parts.push(a.state);
            if (a.pincode) parts.push(a.pincode);
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
        // Document State (from shared hook)
        challan,
        setChallan,
        selectedCustomer,
        setSelectedCustomer,
        employees,
        selectedMR,
        setSelectedMR,

        // Challan-specific UI State
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

        // Handlers (mixed: shared + challan-specific)
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
        recalculateTotals: (items: ChallanItem[]) => {
            const { totalQuantity, totalAmount } = recalculateTotals(items);
            setChallan(prev => ({
                ...prev,
                total_quantity: totalQuantity,
                total_amount: totalAmount
            }));
        },

        // Utilities
        onClose
    };
}

export default useChallanLogic;
