/**
 * usePurchaseOrderLogic Hook
 * 
 * Extracted from PurchaseOrderFlow.tsx
 * Contains all state management, calculations, and handlers for purchase orders.
 * The main component handles only rendering.
 */

import { useState, useEffect, useCallback } from 'react';
import { purchasesApi } from '../../../../services/api';
import { searchCache } from '../../../../utils/searchCache';
import documentNumberGenerator from '../../../../services/offline/documents/documentNumberGenerator';
import { useToast } from '../../../global';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { usePurchaseOrderSave } from './usePurchaseOrderSave';

// Types
export interface PurchaseOrderItem {
    id: string | number;
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    unit?: string;
    unit_price: number;
    mrp?: number;
    expected_rate?: number;
    tax_percent: number;
    discount_percent?: number;
    free_quantity?: number;
    pack_type?: string;
    pack_size?: number;
    packages_per_box?: number;
    manufacturer?: string;
    total?: number;
}

export interface PurchaseOrderData {
    po_no: string;
    po_date: string;
    expected_delivery_date: string;
    supplier_id: string | number;
    supplier_name: string;
    supplier_details: any;
    items: PurchaseOrderItem[];
    payment_terms: string;
    delivery_terms: string;
    delivery_location: string;
    transport_mode: string;
    gross_amount: number;
    discount_amount: number;
    tax_amount: number;
    freight_charges: number;
    net_amount: number;
    total_amount: number;
    notes: string;
    status: string;
}

export interface CreatedPOData {
    poNumber: string;
    poId: string | number;
    supplierName: string;
    totalAmount: number;
}

export interface UsePurchaseOrderLogicProps {
    prefilledData?: Partial<PurchaseOrderData> | null;
    onClose: () => void;
}

export interface UsePurchaseOrderLogicReturn {
    // State
    purchaseOrder: PurchaseOrderData;
    setPurchaseOrder: React.Dispatch<React.SetStateAction<PurchaseOrderData>>;
    selectedSupplier: any;
    setSelectedSupplier: React.Dispatch<React.SetStateAction<any>>;
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    saving: boolean;
    errors: Record<string, string>;

    // Modal states
    showSupplierModal: boolean;
    setShowSupplierModal: React.Dispatch<React.SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: React.Dispatch<React.SetStateAction<boolean>>;
    showSuccessModal: boolean;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;

    // Data
    createdPOData: CreatedPOData | null;

    // Handlers
    handleSupplierSelect: (supplier: any) => void;
    handleAddItem: (product: any) => void;
    handleUpdateItem: (index: number, field: string, value: any) => void;
    handleRemoveItem: (index: number) => void;
    handleSavePurchaseOrder: () => Promise<void>;
    validatePurchaseOrder: () => boolean;
    handlePrint: () => void;
    formatCurrency: (amount: number | string) => string;
}

const getInitialPurchaseOrder = (prefilledData?: Partial<PurchaseOrderData> | null): PurchaseOrderData => ({
    po_no: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_terms: '30 days',
    delivery_terms: 'F.O.R. Destination',
    delivery_location: 'Main Warehouse',
    transport_mode: 'By Road',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    freight_charges: 0,
    net_amount: 0,
    total_amount: 0,
    notes: prefilledData?.notes || '',
    status: 'draft'
});

export function usePurchaseOrderLogic({
    prefilledData = null,
    onClose
}: UsePurchaseOrderLogicProps): UsePurchaseOrderLogicReturn {
    const toast = useToast();

    // Core State
    const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderData>(() => getInitialPurchaseOrder(prefilledData));
    const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);
    const [currentStep, setCurrentStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Modal States
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Data States
    const [createdPOData, setCreatedPOData] = useState<CreatedPOData | null>(null);

    // Network status for offline-first
    const { isOnline } = useNetworkStatus();

    // Generate PO number on mount
    useEffect(() => {
        const generateAndSetPONumber = async () => {
            try {
                const poNumber = await documentNumberGenerator.generatePONumber();
                setPurchaseOrder(prev => ({ ...prev, po_no: poNumber }));
            } catch (error) {
                const fallbackNumber = `PO-${Date.now().toString().slice(-8)}`;
                setPurchaseOrder(prev => ({ ...prev, po_no: fallbackNumber }));
            }
        };
        generateAndSetPONumber();
    }, []);

    // Calculate totals
    const calculateTotals = useCallback(() => {
        if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
            setPurchaseOrder(prev => ({
                ...prev,
                gross_amount: 0,
                tax_amount: 0,
                net_amount: 0,
                total_amount: 0
            }));
            return;
        }

        let grossTotal = 0;
        let taxTotal = 0;

        purchaseOrder.items.forEach(item => {
            if (item.product_id) {
                const quantity = parseFloat(String(item.quantity)) || 0;
                const unitPrice = parseFloat(String(item.unit_price)) || 0;
                const taxPercent = parseFloat(String(item.tax_percent)) || 0;

                const itemTotal = quantity * unitPrice;
                const itemTax = (itemTotal * taxPercent) / 100;

                grossTotal += itemTotal;
                taxTotal += itemTax;
            }
        });

        const discountAmount = Number(purchaseOrder.discount_amount) || 0;
        const freightCharges = Number(purchaseOrder.freight_charges) || 0;
        const netAmount = grossTotal + taxTotal - discountAmount + freightCharges;

        setPurchaseOrder(prev => ({
            ...prev,
            gross_amount: grossTotal,
            tax_amount: taxTotal,
            net_amount: netAmount,
            total_amount: netAmount
        }));
    }, [purchaseOrder.items, purchaseOrder.discount_amount, purchaseOrder.freight_charges]);

    // Trigger calculations when items change
    useEffect(() => {
        if (purchaseOrder.items) {
            calculateTotals();
        }
    }, [purchaseOrder.items, purchaseOrder.discount_amount, purchaseOrder.freight_charges]);

    // Handlers
    const handleSupplierSelect = useCallback((supplier: any) => {
        setSelectedSupplier(supplier);
        setPurchaseOrder(prev => ({
            ...prev,
            supplier_id: supplier.supplier_id,
            supplier_name: supplier.supplier_name,
            supplier_details: supplier
        }));
    }, []);

    const handleAddItem = useCallback((product: any) => {
        const newItem: PurchaseOrderItem = {
            id: Date.now() + Math.random(),
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            hsn_code: product.hsn_code || '',
            batch_number: product.batch_number || '',
            expiry_date: product.expiry_date || '',
            quantity: 1,
            unit: product.unit || product.uom || '',
            unit_price: product.unit_price || (product.mrp || 0) * 0.7,
            mrp: product.mrp || 0,
            expected_rate: product.sale_price || product.selling_price || product.mrp || 0,
            tax_percent: product.tax_percent || 12,
            discount_percent: 0,
            free_quantity: 0,
            pack_type: 'STRIP',
            pack_size: 10,
            packages_per_box: 10,
            manufacturer: product.manufacturer || '',
            total: product.unit_price || 0
        };

        setPurchaseOrder(prev => ({
            ...prev,
            items: [...(prev.items || []), newItem]
        }));
    }, []);

    const handleUpdateItem = useCallback((index: number, field: string, value: any) => {
        setPurchaseOrder(prev => ({
            ...prev,
            items: (prev.items || []).map((item, i) => {
                if (i === index) {
                    return { ...item, [field]: value };
                }
                return item;
            })
        }));
    }, []);

    const handleRemoveItem = useCallback((index: number) => {
        setPurchaseOrder(prev => ({
            ...prev,
            items: (prev.items || []).filter((_, i) => i !== index)
        }));
    }, []);

    const validatePurchaseOrder = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};
        if (!selectedSupplier) newErrors.supplier = 'Supplier is required';
        if (!purchaseOrder.items || purchaseOrder.items.length === 0) newErrors.items = 'At least one item is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [selectedSupplier, purchaseOrder.items]);

    // Offline-first save hook
    const { saving: offlineSaving, handleSavePurchaseOrder } = usePurchaseOrderSave({
        purchaseOrder,
        selectedSupplier,
        isOnline,
        setCreatedPOData,
        setShowSuccessModal,
        validatePurchaseOrder
    });

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const formatCurrency = useCallback((amount: number | string): string => {
        return `₹${(parseFloat(String(amount)) || 0).toFixed(2)}`;
    }, []);

    return {
        purchaseOrder,
        setPurchaseOrder,
        selectedSupplier,
        setSelectedSupplier,
        currentStep,
        setCurrentStep,
        saving: offlineSaving || saving,
        errors,
        showSupplierModal,
        setShowSupplierModal,
        showProductModal,
        setShowProductModal,
        showSuccessModal,
        setShowSuccessModal,
        createdPOData,
        handleSupplierSelect,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        handleSavePurchaseOrder,
        validatePurchaseOrder,
        handlePrint,
        formatCurrency
    };
}

export default usePurchaseOrderLogic;
