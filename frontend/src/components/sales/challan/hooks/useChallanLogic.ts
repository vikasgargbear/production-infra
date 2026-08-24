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
import { useSalesTransaction } from '../../hooks/useSalesTransaction';

import { useCompany } from '../../../../contexts/CompanyContext';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useChallanSave } from './useChallanSave';
import { calculateChallanPreview } from '../../../../services/calculations/challanCalculationService';
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import {
    Challan,
    ChallanItem,
    CustomerDetails,
    ImportData,
    CreatedChallanData,
    getInitialChallan
} from '../types/challanTypes';
import {
    addExactDecimals,
    compareExactDecimals,
    formatExactDecimal,
} from '../../../../utils/exactDecimal';

// ==================== PROPS ====================

export interface UseChallanLogicProps {
    onClose?: () => void;
    sameAsBillingInitial?: boolean;
}

// ==================== THE HOOK ====================

export function useChallanLogic({ onClose, sameAsBillingInitial = true }: UseChallanLogicProps = {}) {

    const { companyInfo } = useCompany();

    // ==================== COMPOSE SHARED TRANSACTION LOGIC ====================
    const {
        document: challan,
        setDocument: setChallan,
        selectedCustomer,
        setSelectedCustomer,
        employees,
        selectedMR,
        setSelectedMR,
        fetchingAddress,
        productSearchRef,
        itemsTableRef,
        handleCustomerSelect: baseHandleCustomerSelect,
        handleProductSelect,
        updateItem,
        removeItem,
        recalculateTotals,
    } = useSalesTransaction<Challan, CustomerDetails, ChallanItem>({
        getInitialDocument: getInitialChallan,
        documentType: 'challan',
        priceField: 'sale_price',
        includeGst: false,
        onClose
    });

    // ==================== CHALLAN-SPECIFIC STATE ====================
    const [currentStep, setCurrentStep] = useState(1);
    const [saving] = useState(false);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [showCreateProduct, setShowCreateProduct] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdChallanData, setCreatedChallanData] = useState<CreatedChallanData | null>(null);
    const [sameAsBilling, setSameAsBilling] = useState(sameAsBillingInitial);
    const [newProductName, setNewProductName] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');

    // ==================== NETWORK STATUS ====================
    const { isOnline } = useNetworkStatus();

    // ==================== CHALLAN-SPECIFIC REFS ====================
    const customerSearchRef = useRef<HTMLInputElement>(null);
    const challanFormRef = useRef<HTMLFormElement>(null);
    const calculationRequestRef = useRef(0);

    useEffect(() => {
        const requestId = ++calculationRequestRef.current;
        if (!challan.items.length || !challan.customer_id) return;

        // The backend deliberately trusts the explicit GST mode. Derive it from
        // the current Place of Supply at the request boundary so delivery-address
        // edits cannot race with or depend on a previously stored gst_type.
        const calculationChallan: Challan = {
            ...challan,
            gst_type: determineGstTypeForSupply(
                companyInfo?.state,
                challan.delivery_state || challan.customer_details?.state,
                companyInfo?.gst_number,
                challan.customer_details?.gst_number
            )
        };

        void calculateChallanPreview(calculationChallan, true)
            .then(calculation => {
                if (requestId !== calculationRequestRef.current) return;
                setChallan(prev => {
                    let itemsChanged = false;
                    const items = prev.items.map((item, index) => {
                        const calculated = calculation.items[index] || {};
                        const lineTotal = String(calculated.line_total);
                        const taxable = String(calculated.taxable_amount);
                        const tax = String(calculated.total_tax_amount);
                        if (
                            compareExactDecimals(item.line_total || 0, lineTotal, 'Challan line total', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                            compareExactDecimals(item.taxable_amount || 0, taxable, 'Challan taxable amount', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                            compareExactDecimals(item.tax_amount || 0, tax, 'Challan tax amount', { scale: 2, maximumWholeDigits: 20 }) === 0
                        ) return item;
                        itemsChanged = true;
                        return {
                            ...item,
                            ...calculated,
                            quantity: item.quantity,
                            free_quantity: item.free_quantity,
                            unit_price: item.unit_price,
                            mrp: item.mrp,
                            gst_percent: item.gst_percent,
                            line_total: lineTotal,
                            total: lineTotal,
                            taxable_amount: taxable,
                            tax_amount: tax
                        } as unknown as ChallanItem;
                    });
                    const totalQuantity = addExactDecimals(items.map(item => item.quantity), 'Challan total quantity', { scale: 6, maximumWholeDigits: 14 });
                    const totalAmount = calculation.totals.final_amount;
                    const taxableAmount = calculation.totals.taxable_amount;
                    const totalTaxAmount = calculation.totals.total_tax_amount;
                    if (
                        !itemsChanged &&
                        compareExactDecimals(prev.total_quantity, totalQuantity, 'Challan total quantity', { scale: 6, maximumWholeDigits: 14 }) === 0 &&
                        compareExactDecimals(prev.total_amount, totalAmount, 'Challan total amount', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                        compareExactDecimals(prev.taxable_amount || 0, taxableAmount, 'Challan taxable total', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                        compareExactDecimals(prev.total_tax_amount || 0, totalTaxAmount, 'Challan tax total', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                        prev.gst_type === calculation.gst_type
                    ) return prev;
                    return {
                        ...prev,
                        items: itemsChanged ? items : prev.items,
                        total_quantity: totalQuantity as unknown as number,
                        total_amount: totalAmount as unknown as number,
                        taxable_amount: taxableAmount as unknown as number,
                        total_tax_amount: totalTaxAmount as unknown as number,
                        gst_type: calculation.gst_type
                    };
                });
            })
            .catch(error => {
                if (requestId === calculationRequestRef.current) {
                    setMessage(error instanceof Error ? error.message : 'Unable to calculate challan totals');
                    setMessageType('error');
                }
            });
    }, [challan, companyInfo, isOnline, setChallan]);

    // The canonical API must assign the final document number.
    const generateChallanNumber = useCallback(async () => {
        setMessage('Delivery Challan numbers are assigned only by the canonical API after a confirmed submission.');
        setMessageType('error');
    }, []);

    // Fail closed until the delivery-challan canonical command is available.
    const {
        saving: submissionSaving,
        submissionUnavailableReason,
        preparedPreview,
        reviewOpen,
        handleSaveChallan,
        confirmPreparedChallan,
        closeChallanReview,
    } = useChallanSave({
        challan,
        selectedCustomer: selectedCustomer as CustomerDetails,
        companyInfo,
        isOnline,
        setChallan,
        setCreatedChallanData,
        setShowSuccessModal,
        generateChallanNumber
    });

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
                delivery_contact_phone: '',
                gst_type: 'CGST/SGST'
            }));
            return;
        }

        // Challan-specific: handle delivery address based on sameAsBilling
        const address = customer.address || customer.address_line1 || '';
        const city = customer.city || '';
        const state = customer.state || customer.state || '';
        const pincode = customer.pincode || customer.pincode || customer.pincode || '';
        const phone = customer.phone || customer.primary_phone || customer.mobile || customer.contact_number || '';

        setChallan(prev => {
            const deliveryState = sameAsBilling ? state : prev.delivery_state;
            return {
                ...prev,
                customer_details: { ...customer, address, city, state, pincode, phone } as CustomerDetails,
                delivery_address: sameAsBilling ? address : prev.delivery_address,
                delivery_city: sameAsBilling ? city : prev.delivery_city,
                delivery_state: deliveryState,
                delivery_pincode: sameAsBilling ? pincode : prev.delivery_pincode,
                delivery_contact_person: sameAsBilling ? (customer.contact_person || customer.customer_name || customer.name || '') : prev.delivery_contact_person,
                delivery_contact_phone: sameAsBilling ? phone : prev.delivery_contact_phone,
                gst_type: determineGstTypeForSupply(
                    companyInfo?.state,
                    deliveryState || state,
                    companyInfo?.gst_number,
                    customer.gst_number
                )
            };
        });
    }, [baseHandleCustomerSelect, companyInfo, sameAsBilling, setChallan]);

    // ==================== HANDLE IMPORT ====================
    const handleImport = useCallback(async (importData: ImportData) => {
        if (importData.customer_id && importData.customer_details) {
            setSelectedCustomer(importData.customer_details);
            await handleCustomerSelect(importData.customer_details);
        }

        const importedState = importData.delivery_state || importData.customer_details?.state || '';
        const importedGstType = determineGstTypeForSupply(
            companyInfo?.state,
            importedState,
            companyInfo?.gst_number,
            importData.customer_details?.gst_number
        );

        if (importData.delivery_address) {
            setSameAsBilling(false);
            setChallan(prev => ({
                ...prev,
                delivery_address: importData.delivery_address || '',
                delivery_city: importData.delivery_city || '',
                delivery_state: importData.delivery_state || '',
                delivery_pincode: importData.delivery_pincode || '',
                gst_type: importedGstType
            }));
        }

        if (importData.items && importData.items.length > 0) {
            const formattedItems: ChallanItem[] = importData.items.map((item, index) => ({
                ...item,
                id: item.id || `imported-${Date.now()}-${index}`,
                quantity: parseFloat(String(item.quantity)) || 0,
                unit_price: parseFloat(String(item.unit_price ?? item.sale_price)) || 0
            }));

            setChallan(prev => ({
                ...prev,
                source_order_id: importData.source_order_id,
                items: formattedItems,
                notes: importData.notes || prev.notes,
                total_quantity: formattedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
                total_amount: 0,
                taxable_amount: 0,
                total_tax_amount: 0,
                gst_type: importedGstType,
            }));
        } else {
            setChallan(prev => ({ ...prev, gst_type: importedGstType }));
            setMessage('⚠️ No items found in the selected document');
            setMessageType('warning');
        }
    }, [companyInfo, handleCustomerSelect, setChallan, setSelectedCustomer]);

    const saveChallan = handleSaveChallan;

    // ==================== SHARE ON WHATSAPP ====================
    const shareOnWhatsApp = useCallback(() => {
        if (!challan.customer_details?.phone) {
            setMessage('Customer phone number is unavailable. Nothing was opened or sent.');
            setMessageType('error');
            return;
        }

        const message = `
Delivery Challan: ${challan.challan_number}
Date: ${challan.challan_date}
Customer: ${challan.customer_name}
Items: ${challan.total_quantity}
Amount: ₹${formatExactDecimal(challan.total_amount, 'Challan total', { scale: 2, maximumWholeDigits: 20 }, 2)}
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
          <div class="item-row"><span>  Qty: ${item.quantity} ${item.unit || ''}</span><span>₹${formatExactDecimal(
              item.unit_price ?? '0',
              `Challan item ${idx + 1} rate`,
              { scale: 4, maximumWholeDigits: 16 },
              2,
          )}</span></div>
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
        saving: submissionSaving || saving,
        submissionUnavailableReason,
        preparedPreview,
        reviewOpen,
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
        confirmPreparedChallan,
        closeChallanReview,
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
