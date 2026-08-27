/**
 * useChallanLogic Hook (Refactored)
 * 
 * Centralized business logic for challan creation.
 * Now COMPOSES useSalesTransaction for common operations,
 * keeping only challan-specific logic here.
 * 
 * Pattern: Composition over duplication
 */

import {
    useState,
    useEffect,
    useRef,
    useCallback,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useSalesTransaction } from '../../hooks/useSalesTransaction';

import { useCompany } from '../../../../contexts/CompanyContext';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useChallanSave } from './useChallanSave';
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
    normalizeExactDecimal,
} from '../../../../utils/exactDecimal';
import { useCanonicalBusinessDate } from '../../../../hooks/useCanonicalBusinessDate';

// ==================== PROPS ====================

export interface UseChallanLogicProps {
    onClose?: () => void;
    sameAsBillingInitial?: boolean;
}

// ==================== THE HOOK ====================

export function useChallanLogic({ onClose, sameAsBillingInitial = true }: UseChallanLogicProps = {}) {

    const { companyInfo } = useCompany();
    const {
        businessDate,
        documentPolicy,
        loading: businessDateLoading,
        error: businessDateError,
    } = useCanonicalBusinessDate();

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
    const [showImportModal, setShowImportModalState] = useState(false);
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

    useEffect(() => {
        if (businessDate) {
            setChallan(previous => ({
                ...previous,
                challan_date: previous.challan_date || businessDate,
            }));
            return;
        }
        if (!businessDateLoading && businessDateError) {
            setMessage(businessDateError);
            setMessageType('error');
        }
    }, [businessDate, businessDateError, businessDateLoading, setChallan]);

    const approvedOrderImportUnavailableReason = (() => {
        if (businessDateLoading) {
            return 'Loading the authoritative organization business date…';
        }
        if (businessDateError || !businessDate) {
            return businessDateError || 'The authoritative organization business date is unavailable.';
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(challan.challan_date)) {
            return 'Select a valid dispatch date before selecting an approved order.';
        }
        return null;
    })();

    const setShowImportModal = useCallback<Dispatch<SetStateAction<boolean>>>(next => {
        setShowImportModalState(previous => {
            const requested = typeof next === 'function' ? next(previous) : next;
            return requested && approvedOrderImportUnavailableReason ? false : requested;
        });
    }, [approvedOrderImportUnavailableReason]);

    // A dispatch is an inventory movement, not a tax invoice. Its selling price,
    // GST and document total are therefore never calculated or cached in the browser.
    // Exact stock quantities and valuation are shown by canonical prepare/readback.

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
        documentPolicy,
        businessDate,
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
            }));
            return;
        }

        // Dispatch posting is sourced from an approved order and does not infer
        // a tax treatment or delivery address from compatibility customer fields.
        setChallan(prev => ({
            ...prev,
            customer_details: customer,
            delivery_contact_person: sameAsBilling ? customer.customer_name || '' : prev.delivery_contact_person,
            delivery_contact_phone: sameAsBilling ? customer.primary_phone || '' : prev.delivery_contact_phone,
        }));
    }, [baseHandleCustomerSelect, sameAsBilling, setChallan]);

    // ==================== HANDLE APPROVED ORDER IMPORT ====================
    const handleImport = useCallback(async (importData: ImportData) => {
        if (!importData.source_order_id
            || !importData.customer_id
            || !importData.customer_name
            || !importData.customer_details
            || !importData.items?.length) {
            setMessage('The approved order is missing canonical customer, order, or line evidence.');
            setMessageType('error');
            return;
        }
        const formattedItems: ChallanItem[] = importData.items.map((item, index) => {
            if (!item.source_order_line_id) {
                throw new Error(`Imported order line ${index + 1} is missing its canonical line identity.`);
            }
            return {
                ...item,
                id: item.source_order_line_id,
                quantity: normalizeExactDecimal(
                    item.quantity, `Imported dispatch line ${index + 1} billed quantity`,
                    { scale: 6, maximumWholeDigits: 14 },
                ),
                free_quantity: normalizeExactDecimal(
                    item.free_quantity, `Imported dispatch line ${index + 1} free quantity`,
                    { scale: 6, maximumWholeDigits: 14 },
                ),
                unit_price: normalizeExactDecimal(
                    item.unit_price, `Imported order line ${index + 1} unit rate`,
                    { scale: 4, maximumWholeDigits: 16 },
                ),
            };
        });
        setSelectedCustomer(importData.customer_details);
        setChallan(previous => ({
            ...previous,
            source_order_id: importData.source_order_id,
            customer_id: importData.customer_id!,
            customer_name: importData.customer_name!,
            customer_details: importData.customer_details!,
            reference_doc: importData.reference_doc ?? '',
            items: formattedItems,
            notes: importData.notes ?? '',
            total_quantity: addExactDecimals(
                formattedItems.map(item => item.quantity),
                'Imported dispatch total quantity',
                { scale: 6, maximumWholeDigits: 14 },
            ),
            total_amount: '',
            taxable_amount: undefined,
            total_tax_amount: undefined,
        }));
    }, [setChallan, setSelectedCustomer]);

    const saveChallan = handleSaveChallan;

    // ==================== SHARE / PRINT ====================
    const shareOnWhatsApp = useCallback(() => {
        const phone = String(createdChallanData?.customer_details?.primary_phone ?? '').replace(/\D/g, '');
        if (!createdChallanData || !phone) {
            setMessage('A posted dispatch and customer phone are required. Nothing was opened or sent.');
            setMessageType('error');
            return;
        }
        const recipient = phone.length === 10 ? `91${phone}` : phone;
        if (!/^[1-9]\d{7,14}$/.test(recipient)) {
            setMessage('Customer phone number is invalid. Nothing was opened or sent.');
            setMessageType('error');
            return;
        }
        const message = [
            `Delivery Challan: ${createdChallanData.challan_number}`,
            `Customer: ${createdChallanData.customer_name}`,
            `Posted inventory quantity: ${createdChallanData.inventory_base_quantity}`,
        ].join('\n');
        window.open(`https://wa.me/${recipient}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    }, [createdChallanData]);

    const printChallan = useCallback(() => {
        window.print();
    }, []);

    // Thermal output uses the same authoritative DOM preview; it must not build
    // an independent template with stale addresses, prices, tax, or totals.
    const thermalPrintChallan = useCallback((_width: string = '80mm') => {
        window.print();
    }, []);

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
        documentPolicy,
        businessDate,
        approvedOrderImportUnavailableReason,

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
            const totalQuantity = addExactDecimals(
                items.map(item => item.quantity),
                'Dispatch selected quantity',
                { scale: 6, maximumWholeDigits: 14 },
            );
            setChallan(prev => ({
                ...prev,
                total_quantity: totalQuantity,
            }));
        },

        // Utilities
        onClose
    };
}

export default useChallanLogic;
