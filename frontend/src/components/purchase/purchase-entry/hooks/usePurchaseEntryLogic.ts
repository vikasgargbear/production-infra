/**
 * usePurchaseEntryLogic Hook
 * 
 * Extracted from PurchaseEntryFlow.tsx
 * Contains all state management, calculations, and handlers for purchase entry.
 * The main component handles only rendering.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { purchasesApi } from '../../../../services/api';
import documentNumberGenerator from '../../../../services/offline/documents/documentNumberGenerator';
import { useToast } from '../../../global';

// Types
export interface PurchaseItem {
    id?: string | number;
    product_id: string | number;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_percent: number;
    batch?: string;
    batch_number?: string;
    batch_number?: string;
    pack_type?: string;
    pack_size?: number | string;
    packages_per_box?: number | string;
    hsn_code?: string;
    category?: string;
    brand_name?: string;
    expiry_date?: string;
    manufacturing_date?: string;
    free_quantity?: number;
    unit_price?: number;
    mrp?: number;
    selling_price?: number;
    sale_price?: number;
    discount_percent?: number;
    rate?: number;
    tax?: number;
    unit_price?: number;
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
    gross_amount: number;
    discount_amount: number;
    tax_amount: number;
    other_charges: number;
    round_off: number;
    net_amount: number;
    total_amount: number;
    notes: string;
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
    handleSavePurchase: () => Promise<void>;
    validatePurchase: () => boolean;
    handlePrint: () => void;
    handlePDFUpload: (file: File) => Promise<void>;
    handleVerificationComplete: (verifiedData: any) => void;

    // Utilities
    formatCurrency: (amount: number | string) => string;
}

const getInitialPurchase = (prefilledData?: Partial<PurchaseData> | null): PurchaseData => ({
    purchase_number: '',
    supplier_invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_methods: [{ id: '1', method: 'cash', amount: 0 }],
    payment_status: 'pending',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_type: 'DELIVERY',
    transport_company: '',
    vehicle_number: '',
    lr_number: '',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    total_amount: 0,
    notes: prefilledData?.notes || ''
});

export function usePurchaseEntryLogic({
    prefilledData = null,
    onClose
}: UsePurchaseEntryLogicProps): UsePurchaseEntryLogicReturn {
    const toast = useToast();

    // Core State
    const [purchase, setPurchase] = useState<PurchaseData>(() => getInitialPurchase(prefilledData));
    const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);
    const [currentStep, setCurrentStep] = useState(1);
    const [saving, setSaving] = useState(false);
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
    const [createdPurchaseData, setCreatedPurchaseData] = useState<CreatedPurchaseData | null>(null);

    // Generate purchase number on mount
    useEffect(() => {
        const generateAndSetPurchaseNumber = async () => {
            try {
                const purchaseNumber = await documentNumberGenerator.generatePurchaseNumber();
                setPurchase(prev => ({ ...prev, purchase_number: purchaseNumber }));
            } catch (error) {
                const date = new Date();
                const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
                const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                const fallbackNumber = `PUR-${dateStr}${randomNum}`;
                setPurchase(prev => ({ ...prev, purchase_number: fallbackNumber }));
            }
        };
        generateAndSetPurchaseNumber();
    }, []);

    // Calculate totals
    const calculateTotals = useCallback(() => {
        if (!purchase.items || purchase.items.length === 0) {
            setPurchase(prev => ({
                ...prev,
                gross_amount: 0,
                tax_amount: 0,
                round_off: 0,
                net_amount: 0,
                total_amount: 0
            }));
            return;
        }

        let grossTotal = 0;
        let taxTotal = 0;

        purchase.items.forEach(item => {
            if (item.product_id || item.product_name) {
                const quantity = parseFloat(String(item.quantity)) || 0;
                const purchasePrice = parseFloat(String(item.unit_price || item.unit_price || item.unit_price)) || 0;
                const taxPercent = parseFloat(String(item.tax_percent || item.tax || item.gst_percent)) || 0;

                const itemTotal = quantity * purchasePrice;
                const itemTax = (itemTotal * taxPercent) / 100;

                grossTotal += itemTotal;
                taxTotal += itemTax;
            }
        });

        const discountAmount = parseFloat(String(purchase.discount_amount)) || 0;
        const otherCharges = parseFloat(String(purchase.other_charges)) || 0;

        const netAmount = grossTotal + taxTotal - discountAmount + otherCharges;
        const roundOff = Math.round(netAmount) - netAmount;
        const finalAmount = Math.round(netAmount);

        setPurchase(prev => ({
            ...prev,
            gross_amount: grossTotal,
            tax_amount: taxTotal,
            round_off: roundOff,
            net_amount: netAmount,
            total_amount: finalAmount
        }));
    }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

    // Trigger calculations when items change
    useEffect(() => {
        if (purchase.items) {
            calculateTotals();
        }
    }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

    // Update payment amount when final amount changes
    useEffect(() => {
        if (purchase.total_amount > 0 && purchase.payment_methods?.length > 0) {
            if (purchase.payment_methods.length === 1 && purchase.payment_methods[0].method === 'cash') {
                setPurchase(prev => ({
                    ...prev,
                    payment_methods: [{ id: '1', method: 'cash', amount: prev.total_amount }]
                }));
            }
        }
    }, [purchase.total_amount]);

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
            hsn_code: product.hsn_code || '',
            mrp: parseFloat(product.mrp) || 0,
            selling_price: parseFloat(product.sale_price || product.selling_price) || parseFloat(product.mrp) || 0,
            tax_percent: parseFloat(product.tax_percent || product.gst_percent || product.tax_rate) || 0,
            discount_percent: parseFloat(product.discount_percent || product.discount) || 0,
            pack_type: product.pack_type || product.packaging_type || 'STRIP',
            pack_size: product.pack_size || product.units_per_pack || 10,
            packages_per_box: product.packages_per_box || 10,
            category: product.category || '',
            brand_name: product.brand_name || product.brand || '',
            unit: product.unit || product.uom || 'Strip'
        });
        setShowItemEditModal(true);
    }, []);

    const handleSaveItemFromModal = useCallback((editedItem: any) => {
        setPurchase(prev => ({
            ...prev,
            items: [...(prev.items || []), editedItem]
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
                hsn_code: product.hsn_code || '',
                batch_number: product.batch_number || product.batch_number || product.batch || '',
                expiry_date: product.expiry_date || product.expiry || '',
                manufacturing_date: product.manufacturing_date || product.manufacturing_date || '',
                quantity: parseFloat(product.quantity) || 1,
                free_quantity: parseFloat(product.free_quantity || product.free) || 0,
                mrp: parseFloat(product.mrp) || 0,
                unit_price: parseFloat(product.unit_price || product.unit_price || product.unit_price) || (parseFloat(product.mrp) || 0) * 0.7,
                selling_price: parseFloat(product.selling_price || product.sale_price) || parseFloat(product.mrp) || 0,
                discount_percent: parseFloat(product.discount_percent || product.discount) || 0,
                tax_percent: parseFloat(product.tax_percent || product.gst_percent || product.tax_rate) || 0,
                pack_type: product.pack_type || product.packaging_type || 'STRIP',
                pack_size: product.pack_size || product.units_per_pack || 10,
                category: product.category || '',
                brand_name: product.brand_name || product.brand || '',
                unit: product.unit || product.uom || 'Strip'
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
                    if (field === 'rate') updatedItem.unit_price = value;
                    else if (field === 'unit_price') {
                        updatedItem.unit_price = value;
                        updatedItem.unit_price = value;
                    }
                    else if (field === 'tax') updatedItem.tax_percent = value;
                    else if (field === 'tax_percent') updatedItem.tax = value;
                    else if (field === 'batch_number' || field === 'batch_number' || field === 'batch') {
                        updatedItem.batch_number = value;
                        updatedItem.batch_number = value;
                        updatedItem.batch = value;
                    }
                    else if (field === 'selling_price') updatedItem.sale_price = value;
                    else if (field === 'sale_price') updatedItem.selling_price = value;
                    return updatedItem;
                }
                return item;
            })
        }));
    }, []);

    const handleRemoveItem = useCallback((index: number) => {
        setPurchase(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    }, []);

    const validatePurchase = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};
        if (!selectedSupplier) newErrors.supplier = 'Supplier is required';
        if (!purchase.items || purchase.items.length === 0) newErrors.items = 'At least one item is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [selectedSupplier, purchase.items]);

    const generateInvoiceNumber = useCallback((): string => {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `INV-${year}${month}${day}-${random}`;
    }, []);

    const handleSavePurchase = useCallback(async () => {
        if (!validatePurchase()) {
            toast.error('Please fix validation errors');
            return;
        }

        const itemsWithoutExpiry = purchase.items.filter(item => !item.expiry_date);
        if (itemsWithoutExpiry.length > 0) {
            toast.error(`Please add expiry dates for all items. ${itemsWithoutExpiry.length} item(s) missing expiry date.`);
            return;
        }

        const invoiceNumber = purchase.supplier_invoice_number || generateInvoiceNumber();

        setSaving(true);
        try {
            const purchaseData = {
                supplier_invoice_number: invoiceNumber,
                invoice_date: purchase.invoice_date,
                supplier_id: parseInt(String(purchase.supplier_id)),
                subtotal_amount: purchase.gross_amount || 0,
                tax_amount: purchase.tax_amount || 0,
                discount_amount: purchase.discount_amount || 0,
                total_amount: purchase.total_amount || 0,
                other_charges: purchase.other_charges || 0,
                items: purchase.items.map((item) => {
                    let productId: number | null = null;
                    if (item.product_id && item.product_id !== item.id) {
                        const parsed = parseInt(String(item.product_id));
                        if (!isNaN(parsed) && parsed > 0 && parsed < 2147483647) {
                            productId = parsed;
                        }
                    }
                    return {
                        product_id: productId,
                        product_name: item.product_name || '',
                        batch_number: item.batch_number || item.batch_number || '',
                        expiry_date: item.expiry_date || null,
                        manufacturing_date: item.manufacturing_date || null,
                        quantity: parseFloat(String(item.quantity)) || 1,
                        free_quantity: parseFloat(String(item.free_quantity)) || 0,
                        unit_price: parseFloat(String(item.unit_price)) || 0,
                        mrp: parseFloat(String(item.mrp)) || 0,
                        selling_price: parseFloat(String(item.selling_price || item.sale_price)) || 0,
                        discount_percent: parseFloat(String(item.discount_percent)) || 0,
                        tax_percent: parseFloat(String(item.tax_percent)) || 12,
                        pack_type: item.pack_type || 'STRIP',
                        pack_size: parseInt(String(item.pack_size)) || 10,
                        packages_per_box: parseInt(String(item.packages_per_box)) || 10,
                        hsn_code: item.hsn_code || '',
                        category: item.category || '',
                        brand_name: item.brand_name || ''
                    };
                }),
                payment_methods: purchase.payment_methods?.length > 0
                    ? purchase.payment_methods
                    : [{ method: 'cash', amount: purchase.total_amount }],
                payment_mode: purchase.payment_methods?.length > 0
                    ? purchase.payment_methods[0].method.toLowerCase()
                    : 'cash',
                payment_status: purchase.payment_status || 'pending',
                notes: purchase.notes,
                transport_company: purchase.transport_company,
                vehicle_number: purchase.vehicle_number,
                lr_number: purchase.lr_number
            };

            const response = await purchasesApi.create(purchaseData);

            if (response?.data) {
                const purchaseNumber = response.data.purchase_number || purchase.purchase_number;
                setCreatedPurchaseData({
                    purchaseNumber,
                    purchaseId: response.data.purchase_id || response.data.id,
                    supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
                    totalAmount: purchase.total_amount
                });
                setShowSuccessModal(true);
                toast.success(`Purchase ${purchaseNumber} created successfully!`);
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [purchase, selectedSupplier, validatePurchase, generateInvoiceNumber, toast]);

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
                    gross_amount: extractedData.gross_amount || 0,
                    tax_amount: extractedData.tax_amount || 0,
                    total_amount: extractedData.total_amount || extractedData.total_amount || 0
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
            hsn_code: item.hsn_code,
            batch_number: item.batch_number,
            batch_number: item.batch_number,
            batch: item.batch_number,
            expiry_date: item.expiry_date,
            manufacturing_date: item.manufacturing_date,
            quantity: parseFloat(item.quantity) || 0,
            free_quantity: parseFloat(item.free_quantity) || 0,
            mrp: parseFloat(item.mrp) || 0,
            unit_price: parseFloat(item.unit_price) || 0,
            rate: parseFloat(item.unit_price) || 0,
            unit_price: parseFloat(item.unit_price) || 0,
            selling_price: parseFloat(item.selling_price) || parseFloat(item.mrp) || 0,
            sale_price: parseFloat(item.selling_price) || parseFloat(item.mrp) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            tax_percent: parseFloat(item.tax_percent) || 12,
            tax: parseFloat(item.tax_percent) || 12,
            tax_amount: 0,
            pack_type: item.pack_type || 'STRIP',
            pack_size: item.pack_size || 10,
            packages_per_box: item.packages_per_box || 10,
            category: item.category || '',
            brand_name: item.brand_name || '',
            unit: item.unit || 'Strip',
            isNewProduct: item.isNewProduct || false
        }));

        let grossAmount = 0;
        let taxAmount = 0;
        mappedItems.forEach((item: any) => {
            const itemAmount = item.quantity * item.unit_price;
            const itemTax = itemAmount * (item.tax_percent / 100);
            grossAmount += itemAmount;
            taxAmount += itemTax;
        });
        const netAmount = grossAmount + taxAmount;

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
            gross_amount: grossAmount,
            tax_amount: taxAmount,
            net_amount: netAmount,
            total_amount: verifiedData.total_amount || netAmount
        }));

        if (verifiedData.supplier_id) {
            setSelectedSupplier({
                supplier_id: verifiedData.supplier_id,
                supplier_name: verifiedData.supplier_name,
                gst_number: verifiedData.supplier_gst || verifiedData.supplier_gst_number,
                gst_number: verifiedData.supplier_gst_number || verifiedData.supplier_gst,
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

    const formatCurrency = useCallback((amount: number | string): string => {
        const numAmount = parseFloat(String(amount)) || 0;
        return `₹${numAmount.toFixed(2)}`;
    }, []);

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
        handlePrint,
        handlePDFUpload,
        handleVerificationComplete,
        formatCurrency
    };
}

export default usePurchaseEntryLogic;
