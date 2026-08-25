/**
 * usePurchaseEntryLogic Hook
 * 
 * Extracted from PurchaseEntryFlow.tsx
 * Contains all state management, calculations, and handlers for purchase entry.
 * The main component handles only rendering.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { purchasesApi } from '../../../../services/api';
import {
    calculatePurchaseOrderPreview,
    toPurchaseCalculationRequest
} from '../../../../services/calculations/purchaseOrderCalculationService';
import { useToast } from '../../../global';
import { usePurchaseEntrySave } from './usePurchaseEntrySave';
import {
    compareExactDecimals,
    formatExactCurrency,
    type EditableDecimalValue,
} from '../../../../utils/exactDecimal';

// Types
export interface PurchaseItem {
    id?: string | number;
    po_item_id?: number;
    product_id: string | number;
    product_name: string;
    quantity: number | string;
    ordered_quantity?: number;
    unit_price: number | string;
    tax_percent: number | string;
    batch?: string;
    batch_number?: string;
    pack_type?: string;
    pack_size?: number | string;
    packages_per_box?: number | string;
    hsn_code?: string;
    category?: string;
    brand_name?: string;
    expiry_date?: string;
    manufacturing_date?: string;
    free_quantity?: number | string;
    mrp?: number | string;
    selling_price?: number | string;
    sale_price?: number | string;
    discount_percent?: number | string;
    taxable_amount?: EditableDecimalValue;
    tax_amount?: EditableDecimalValue;
    total_amount?: EditableDecimalValue;

    [key: string]: any;
}

export interface PurchaseData {
    purchase_number: string;
    supplier_invoice_number: string;
    invoice_date: string;
    supplier_id: string | number;
    supplier_name: string;
    supplier_details: any;
    items: PurchaseItem[];
    payment_methods: any[];
    payment_status: string;
    delivery_date: string;
    delivery_type: string;
    transport_company: string;
    vehicle_number: string;
    lr_number: string;
    gross_amount: EditableDecimalValue;
    discount_amount: EditableDecimalValue;
    tax_amount: EditableDecimalValue;
    freight_charges: EditableDecimalValue;
    insurance_charges: EditableDecimalValue;
    other_charges: EditableDecimalValue;
    round_off: EditableDecimalValue;
    net_amount: EditableDecimalValue;
    total_amount: EditableDecimalValue;
    notes: string;
    // PO linking fields (set when pre-filled from a Purchase Order)
    purchase_order_id?: number;
    po_number?: string;
    [key: string]: any;
}

export interface CreatedPurchaseData {
    purchaseNumber: string;
    purchaseId: string | number;
    supplierName: string;
    totalAmount: number;
}

export interface UsePurchaseEntryLogicProps {
    prefilledData?: Partial<PurchaseData> | null;
    onClose: () => void;
}

export interface UsePurchaseEntryLogicReturn {
    // State
    purchase: PurchaseData;
    setPurchase: React.Dispatch<React.SetStateAction<PurchaseData>>;
    selectedSupplier: any;
    setSelectedSupplier: React.Dispatch<React.SetStateAction<any>>;
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    saving: boolean;
    errors: Record<string, string>;
    setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

    // Modal states
    showSupplierModal: boolean;
    setShowSupplierModal: React.Dispatch<React.SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: React.Dispatch<React.SetStateAction<boolean>>;
    showSuccessModal: boolean;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    showPDFUpload: boolean;
    setShowPDFUpload: React.Dispatch<React.SetStateAction<boolean>>;
    showVerificationFlow: boolean;
    setShowVerificationFlow: React.Dispatch<React.SetStateAction<boolean>>;
    showItemEditModal: boolean;
    setShowItemEditModal: React.Dispatch<React.SetStateAction<boolean>>;

    // Data
    extractedPDFData: any;
    setExtractedPDFData: React.Dispatch<React.SetStateAction<any>>;
    newProductToAdd: any;
    setNewProductToAdd: React.Dispatch<React.SetStateAction<any>>;
    currentEditItem: any;
    setCurrentEditItem: React.Dispatch<React.SetStateAction<any>>;
    createdPurchaseData: CreatedPurchaseData | null;

    // Handlers
    handleSupplierSelect: (supplier: any) => void;
    handleAddItem: (product: any) => void;
    handleSaveItemFromModal: (editedItem: any) => void;
    handleBulkUpload: (products: any[]) => void;
    handleUpdateItem: (index: number, field: string, value: any) => void;
    handleRemoveItem: (index: number) => void;
    handleSavePurchase?: undefined;
    validatePurchase: () => boolean;
    purchaseDraftReadinessError: string | null;
    handlePrint: () => void;
    handlePDFUpload: (file: File) => Promise<void>;
    handleVerificationComplete: (verifiedData: any) => void;

    // Utilities
    formatCurrency: (amount: number | string) => string;
}

export const getInitialPurchase = (prefilledData?: Partial<PurchaseData> | null): PurchaseData => ({
    purchase_number: '',
    supplier_invoice_number: '',
    invoice_date: '',
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_methods: [],
    payment_status: '',
    delivery_date: '',
    delivery_type: '',
    transport_company: '',
    vehicle_number: '',
    lr_number: '',
    gross_amount: '',
    discount_amount: '',
    tax_amount: '',
    freight_charges: '',
    insurance_charges: '',
    other_charges: '',
    round_off: '',
    net_amount: '',
    total_amount: '',
    notes: prefilledData?.notes || '',
    purchase_order_id: prefilledData?.purchase_order_id,
    po_number: prefilledData?.po_number
});

const missingFact = (value: unknown): boolean => value === '' || value === null || value === undefined;

export const purchaseEntryDraftReadinessError = (
    purchase: PurchaseData,
    selectedSupplier: unknown,
): string | null => {
    if (!selectedSupplier || !purchase.supplier_id) return 'Select an authoritative supplier.';
    if (!purchase.supplier_invoice_number.trim()) return 'Enter the supplier invoice number.';
    if (!purchase.invoice_date || !purchase.delivery_date) return 'Enter invoice and delivery dates.';
    if ([purchase.freight_charges, purchase.insurance_charges, purchase.other_charges].some(missingFact)) {
        return 'Enter freight, insurance and other charges explicitly (zero is allowed).';
    }
    if (!purchase.items.length) return 'Add at least one verified purchase line.';
    for (const [index, item] of purchase.items.entries()) {
        const label = `Line ${index + 1}`;
        if (!item.product_id || missingFact(item.uom_conversion_id)) return `${label} is missing canonical product or UOM identity.`;
        if (!String(item.batch_number || '').trim() || !item.expiry_date) return `${label} needs explicit batch and expiry facts.`;
        if (missingFact(item.quantity) || !(Number(item.quantity) > 0)) return `${label} quantity must be explicit and positive.`;
        if (missingFact(item.unit_price) || !(Number(item.unit_price) > 0)) return `${label} cost must be explicit and positive.`;
        if (missingFact(item.mrp) || !(Number(item.mrp) > 0)) return `${label} MRP must be explicit and positive.`;
        if (missingFact(item.free_quantity) || missingFact(item.discount_percent) || missingFact(item.tax_percent)) {
            return `${label} needs explicit free quantity, discount and GST facts (zero is allowed).`;
        }
        if (!Number.isFinite(Number(item.free_quantity)) || Number(item.free_quantity) < 0) return `${label} free quantity cannot be negative.`;
        if (!Number.isFinite(Number(item.discount_percent)) || Number(item.discount_percent) < 0 || Number(item.discount_percent) > 100) {
            return `${label} discount must be between 0% and 100%.`;
        }
        if (!Number.isFinite(Number(item.tax_percent)) || Number(item.tax_percent) < 0 || Number(item.tax_percent) > 100) {
            return `${label} GST rate must be between 0% and 100%.`;
        }
    }
    if (missingFact(purchase.total_amount)) return 'Wait for the authoritative purchase calculation API.';
    return null;
};

export function usePurchaseEntryLogic({
    prefilledData = null,
    onClose
}: UsePurchaseEntryLogicProps): UsePurchaseEntryLogicReturn {
    const toast = useToast();

    // Core State
    const [purchase, setPurchase] = useState<PurchaseData>(() => getInitialPurchase(prefilledData));
    const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);
    const [currentStep, setCurrentStep] = useState(1);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Modal States
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showPDFUpload, setShowPDFUpload] = useState(false);
    const [showVerificationFlow, setShowVerificationFlow] = useState(false);
    const [showItemEditModal, setShowItemEditModal] = useState(false);

    // Data States
    const [extractedPDFData, setExtractedPDFData] = useState<any>(null);
    const [newProductToAdd, setNewProductToAdd] = useState<any>(null);
    const [currentEditItem, setCurrentEditItem] = useState<any>(null);
    const [createdPurchaseData] = useState<CreatedPurchaseData | null>(null);
    const calculationRequestRef = useRef(0);
    const calculationErrorKeyRef = useRef('');
    const toastRef = useRef(toast);
    toastRef.current = toast;

    // Calculate totals
    const calculateTotals = useCallback(async (purchaseData: PurchaseData) => {
        const requestId = ++calculationRequestRef.current;
        if (!purchaseData.items || purchaseData.items.length === 0) {
            setPurchase(prev => ({
                ...prev,
                gross_amount: '',
                discount_amount: '',
                tax_amount: '',
                round_off: '',
                net_amount: '',
                total_amount: ''
            }));
            return;
        }

        const missing = (value: unknown) => value === '' || value === null || value === undefined;
        const incompleteLine = purchaseData.items.find(item => (
            !item.product_id
            || missing(item.quantity)
            || missing(item.unit_price)
            || missing(item.mrp)
            || missing(item.free_quantity)
            || missing(item.discount_percent)
            || missing(item.tax_percent)
        ));
        const incompleteCharges = [
            purchaseData.freight_charges,
            purchaseData.insurance_charges,
            purchaseData.other_charges,
        ].some(missing);
        if (!purchaseData.supplier_id || incompleteLine || incompleteCharges) {
            setPurchase(prev => ({
                ...prev,
                gross_amount: '', discount_amount: '', tax_amount: '', round_off: '',
                net_amount: '', total_amount: '',
            }));
            return;
        }

        try {
            const calculation = await calculatePurchaseOrderPreview(purchaseData, true);
            if (requestId !== calculationRequestRef.current) return;
            calculationErrorKeyRef.current = '';
            const totals = calculation.totals;
            setPurchase(prev => {
                let itemValuesChanged = false;
                const items = prev.items.map((item, index) => {
                    const calculated = calculation.items[index] || {};
                    const taxableAmount = String(calculated.taxable_amount);
                    const taxAmount = String(calculated.tax_amount);
                    const totalAmount = String(calculated.total ?? calculated.total_amount);
                    if (
                        compareExactDecimals(item.taxable_amount || 0, taxableAmount, 'Purchase line taxable', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                        compareExactDecimals(item.tax_amount || 0, taxAmount, 'Purchase line tax', { scale: 2, maximumWholeDigits: 20 }) === 0 &&
                        compareExactDecimals(item.total_amount || 0, totalAmount, 'Purchase line total', { scale: 2, maximumWholeDigits: 20 }) === 0
                    ) return item;
                    itemValuesChanged = true;
                    return { ...item, taxable_amount: taxableAmount, tax_amount: taxAmount, total_amount: totalAmount };
                });
                return {
                    ...prev,
                    items: itemValuesChanged ? items : prev.items,
                    gross_amount: totals.subtotal_amount,
                    discount_amount: totals.discount_amount,
                    tax_amount: totals.tax_amount,
                    round_off: totals.round_off_amount,
                    net_amount: totals.net_amount,
                    total_amount: totals.final_amount
                };
            });
        } catch (calculationError) {
            if (requestId === calculationRequestRef.current) {
                const message = calculationError instanceof Error
                    ? calculationError.message
                    : 'Unable to calculate purchase totals';
                const errorKey = `${JSON.stringify({
                    supplier_id: purchaseData.supplier_id,
                    items: purchaseData.items.map(item => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        discount_percent: item.discount_percent,
                        tax_percent: item.tax_percent
                    })),
                    other_charges: purchaseData.other_charges
                })}:${message}`;
                if (calculationErrorKeyRef.current !== errorKey) {
                    calculationErrorKeyRef.current = errorKey;
                    toastRef.current.error(message);
                }
            }
        }
    }, []);

    const calculationKey = (() => {
        try {
            return JSON.stringify(toPurchaseCalculationRequest(purchase));
        } catch {
            return JSON.stringify({
                supplier_id: purchase.supplier_id,
                items: purchase.items,
                other_charges: purchase.other_charges,
                discount_amount: purchase.discount_amount
            });
        }
    })();

    // Trigger calculations when items change
    useEffect(() => {
        const timeout = window.setTimeout(() => {
            void calculateTotals(purchase);
        }, 200);
        return () => window.clearTimeout(timeout);
        // calculationKey intentionally excludes backend-calculated projection fields.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculateTotals, calculationKey]);

    // Handlers
    const handleSupplierSelect = useCallback((supplier: any) => {
        setSelectedSupplier(supplier);
        if (supplier) {
            setPurchase(prev => ({
                ...prev,
                supplier_id: supplier.supplier_id || supplier.id,
                supplier_name: supplier.supplier_name || supplier.name,
                supplier_details: supplier
            }));
        } else {
            setPurchase(prev => ({
                ...prev,
                supplier_id: '',
                supplier_name: '',
                supplier_details: null
            }));
        }
    }, []);

    const handleAddItem = useCallback((product: any) => {
        setNewProductToAdd({
            id: Date.now() + Math.random(),
            product_id: product.product_id || null,
            product_name: product.product_name || product.name || '',
            product_code: product.product_code,
            uom_conversion_id: product.uom_conversion_id ?? '',
            hsn_code: product.hsn_code || '',
            mrp: product.mrp ?? '',
            selling_price: product.sale_price ?? product.selling_price ?? '',
            tax_percent: product.tax_percent ?? product.gst_percent ?? product.tax_rate ?? '',
            discount_percent: product.discount_percent ?? product.discount ?? '',
            pack_type: product.pack_type ?? product.packaging_type ?? '',
            pack_size: product.pack_size ?? product.units_per_pack ?? '',
            packages_per_box: product.packages_per_box ?? '',
            category: product.category || '',
            brand_name: product.brand_name || product.brand || '',
            unit: product.unit ?? product.uom ?? ''
        });
        setShowItemEditModal(true);
    }, []);

    const handleSaveItemFromModal = useCallback((editedItem: any) => {
        setPurchase(prev => ({
            ...prev,
            items: [...(prev.items || []), editedItem],
            gross_amount: '', discount_amount: '', tax_amount: '', round_off: '', net_amount: '', total_amount: '',
        }));
        setNewProductToAdd(null);
        setShowItemEditModal(false);
    }, []);

    const handleBulkUpload = useCallback((products: any[]) => {
        if (!purchase.supplier_id) {
            toast.error('Please select a supplier first');
            return;
        }

        const bulkData = {
            supplier_id: purchase.supplier_id,
            supplier_name: purchase.supplier_name,
            invoice_number: purchase.supplier_invoice_number,
            invoice_date: purchase.invoice_date,
            items: products.map((product) => ({
                product_id: product.product_id || null,
                product_name: product.product_name || product.name || '',
                product_code: product.product_code,
                uom_conversion_id: product.uom_conversion_id ?? '',
                hsn_code: product.hsn_code || '',
                batch_number: product.batch_number || product.batch || '',
                expiry_date: product.expiry_date || product.expiry || '',
                manufacturing_date: product.manufacturing_date || '',
                quantity: product.quantity ?? '',
                free_quantity: product.free_quantity ?? product.free ?? '',
                mrp: product.mrp ?? '',
                unit_price: product.unit_price ?? '',
                selling_price: product.selling_price ?? product.sale_price ?? '',
                discount_percent: product.discount_percent ?? product.discount ?? '',
                tax_percent: product.tax_percent ?? product.gst_percent ?? product.tax_rate ?? '',
                pack_type: product.pack_type ?? product.packaging_type ?? '',
                pack_size: product.pack_size ?? product.units_per_pack ?? '',
                category: product.category || '',
                brand_name: product.brand_name || product.brand || '',
                unit: product.unit ?? product.uom ?? ''
            })),
            isBulkUpload: true
        };

        setExtractedPDFData(bulkData);
        setShowVerificationFlow(true);
        toast.info(`Verify ${products.length} products from bulk upload`);
    }, [purchase.supplier_id, purchase.supplier_name, purchase.supplier_invoice_number, purchase.invoice_date, toast]);

    const handleUpdateItem = useCallback((index: number, field: string, value: any) => {
        setPurchase(prev => ({
            ...prev,
            items: (prev.items || []).map((item, i) => {
                if (i === index) {
                    const updatedItem = { ...item, [field]: value };
                    // Sync related fields
                    if (field === 'unit_price') updatedItem.unit_price = value;
                    else if (field === 'unit_price') {
                        updatedItem.unit_price = value;
                    }
                    else if (field === 'tax') updatedItem.tax_percent = value;
                    else if (field === 'tax_percent') updatedItem.tax = value;
                    else if (field === 'batch_number' || field === 'batch') {
                        updatedItem.batch_number = value;
                        updatedItem.batch = value;
                    }
                    else if (field === 'selling_price') updatedItem.sale_price = value;
                    else if (field === 'sale_price') updatedItem.selling_price = value;
                    return updatedItem;
                }
                return item;
            }),
            gross_amount: '', discount_amount: '', tax_amount: '', round_off: '', net_amount: '', total_amount: '',
        }));
    }, []);

    const handleRemoveItem = useCallback((index: number) => {
        setPurchase(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
            gross_amount: '', discount_amount: '', tax_amount: '', round_off: '', net_amount: '', total_amount: '',
        }));
    }, []);

    const validatePurchase = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};
        const readinessError = purchaseEntryDraftReadinessError(purchase, selectedSupplier);
        if (readinessError) newErrors.submission = readinessError;
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [selectedSupplier, purchase]);

    const purchaseDraftReadinessError = purchaseEntryDraftReadinessError(purchase, selectedSupplier);

    const { saving, handleSavePurchase } = usePurchaseEntrySave();

    const handlePrint = useCallback(() => {
        const printContent = document.getElementById('purchase-print-area');
        if (!printContent) return;
        const originalContent = document.body.innerHTML;
        document.body.innerHTML = printContent.innerHTML;
        window.print();
        document.body.innerHTML = originalContent;
        window.location.reload();
    }, []);

    const handlePDFUpload = useCallback(async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await purchasesApi.parseInvoice(formData);
            if (response?.data) {
                const extractedData = response.data;
                setExtractedPDFData({
                    ...extractedData,
                    supplier_name: extractedData.supplier_name,
                    supplier_gst_number: extractedData.supplier_gst_number,
                    supplier_address: extractedData.supplier_address,
                    invoice_number: extractedData.invoice_number,
                    invoice_date: extractedData.invoice_date,
                    items: extractedData.items || [],
                    gross_amount: extractedData.gross_amount ?? '',
                    tax_amount: extractedData.tax_amount ?? '',
                    total_amount: extractedData.total_amount ?? ''
                });
                setShowPDFUpload(false);
                setShowVerificationFlow(true);
                toast.success('PDF parsed! Please verify the extracted information.');
            }
        } catch (error: any) {
            toast.error('Failed to parse PDF. Please try again.');
        }
    }, [toast]);

    const handleVerificationComplete = useCallback((verifiedData: any) => {
        const mappedItems = verifiedData.items.map((item: any, index: number) => ({
            id: Date.now() + index + Math.random(),
            product_id: item.product_id,
            product_name: item.product_name,
            product_code: item.product_code,
            uom_conversion_id: item.uom_conversion_id ?? '',
            hsn_code: item.hsn_code,
            batch_number: item.batch_number,
            batch: item.batch_number,
            expiry_date: item.expiry_date,
            manufacturing_date: item.manufacturing_date,
            quantity: item.quantity ?? '',
            free_quantity: item.free_quantity ?? '',
            mrp: item.mrp ?? '',
            unit_price: item.unit_price ?? '',
            selling_price: item.selling_price ?? '',
            sale_price: item.selling_price ?? '',
            discount_percent: item.discount_percent ?? '',
            tax_percent: item.tax_percent ?? '',
            tax: item.tax_percent ?? '',
            tax_amount: '',
            pack_type: item.pack_type ?? '',
            pack_size: item.pack_size ?? '',
            packages_per_box: item.packages_per_box ?? '',
            category: item.category || '',
            brand_name: item.brand_name || '',
            unit: item.unit ?? '',
            isNewProduct: item.isNewProduct || false
        }));

        setPurchase(prev => ({
            ...prev,
            supplier_invoice_number: verifiedData.invoice_number || prev.supplier_invoice_number,
            invoice_date: verifiedData.invoice_date || prev.invoice_date,
            supplier_id: verifiedData.supplier_id,
            supplier_name: verifiedData.supplier_name,
            supplier_details: {
                supplier_id: verifiedData.supplier_id,
                supplier_name: verifiedData.supplier_name,
                gst_number: verifiedData.supplier_gst || verifiedData.supplier_gst_number,
                primary_phone: verifiedData.supplier_phone,
                primary_email: verifiedData.supplier_email,
                address: verifiedData.supplier_address
            },
            items: mappedItems,
            gross_amount: '',
            discount_amount: '',
            tax_amount: '',
            net_amount: '',
            total_amount: ''
        }));

        if (verifiedData.supplier_id) {
            setSelectedSupplier({
                supplier_id: verifiedData.supplier_id,
                supplier_name: verifiedData.supplier_name,
                gst_number: verifiedData.supplier_gst || verifiedData.supplier_gst_number,
                primary_phone: verifiedData.supplier_phone,
                address: verifiedData.supplier_address
            });
        }

        setShowVerificationFlow(false);
        setExtractedPDFData(null);

        if ((verifiedData.isBulkUpload || verifiedData.fromPDFExtract) && verifiedData.items?.length > 0) {
            toast.success('Data verified! Please review and save the purchase entry.');
        } else {
            toast.success('Data verified and loaded successfully!');
        }
    }, [toast]);

    const formatCurrency = useCallback((amount: number | string): string =>
        formatExactCurrency(amount, 'Purchase amount'), []);

    return {
        purchase,
        setPurchase,
        selectedSupplier,
        setSelectedSupplier,
        currentStep,
        setCurrentStep,
        saving,
        errors,
        setErrors,
        showSupplierModal,
        setShowSupplierModal,
        showProductModal,
        setShowProductModal,
        showSuccessModal,
        setShowSuccessModal,
        showPDFUpload,
        setShowPDFUpload,
        showVerificationFlow,
        setShowVerificationFlow,
        showItemEditModal,
        setShowItemEditModal,
        extractedPDFData,
        setExtractedPDFData,
        newProductToAdd,
        setNewProductToAdd,
        currentEditItem,
        setCurrentEditItem,
        createdPurchaseData,
        handleSupplierSelect,
        handleAddItem,
        handleSaveItemFromModal,
        handleBulkUpload,
        handleUpdateItem,
        handleRemoveItem,
        handleSavePurchase,
        validatePurchase,
        purchaseDraftReadinessError,
        handlePrint,
        handlePDFUpload,
        handleVerificationComplete,
        formatCurrency
    };
}

export default usePurchaseEntryLogic;
