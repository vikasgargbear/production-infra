/**
 * usePurchaseOrderLogic Hook
 * 
 * Extracted from PurchaseOrderFlow.tsx
 * Contains all state management, calculations, and handlers for purchase orders.
 * The main component handles only rendering.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { getDaysFromToday, getTodayBusinessDate } from '../../../../utils/indianDateUtils';
import { clientUuid } from '../../../../utils/clientUuid';
import { usePurchaseOrderSave } from './usePurchaseOrderSave';
import {
    canonicalPurchaseOrderValidationError,
    type CanonicalPurchaseOrderReview,
} from '../utils/canonicalPurchaseOrderCommand';

// Types
export interface PurchaseOrderItem {
    id: string | number;
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    uom_conversion_id?: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    unit?: string;
    unit_price: number;
    mrp?: number;
    expected_rate?: number;
    tax_percent: number;
    gst_percent?: number;
    discount_percent?: number;
    free_quantity?: number;
    free_supply_tax_treatment?:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate';
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
    preparingReview: boolean;
    errors: Record<string, string>;
    purchaseOrderValidationError: string | null;
    canonicalReview: CanonicalPurchaseOrderReview | null;

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
    prepareForReview: () => Promise<boolean>;
    handleSavePurchaseOrder: () => Promise<void>;
    validatePurchaseOrder: () => boolean;
    handlePrint: () => void;
    formatCurrency: (amount: number | string) => string;
}

export const getInitialPurchaseOrder = (prefilledData?: Partial<PurchaseOrderData> | null): PurchaseOrderData => ({
    po_no: '',
    po_date: getTodayBusinessDate(),
    expected_delivery_date: getDaysFromToday(7),
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
    const { user, isOnline } = useAuth();

    // Core State
    const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderData>(() => getInitialPurchaseOrder(prefilledData));
    const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);
    const [currentStep, setCurrentStep] = useState(1);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Modal States
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Data States
    const [createdPOData, setCreatedPOData] = useState<CreatedPOData | null>(null);

    // Handlers
    const handleSupplierSelect = useCallback((supplier: any) => {
        setSelectedSupplier(supplier);
        setPurchaseOrder(prev => ({
            ...prev,
            supplier_id: supplier?.supplier_id ?? supplier?.id ?? '',
            supplier_name: supplier?.supplier_name ?? supplier?.name ?? '',
            supplier_details: supplier
        }));
    }, []);

    const handleAddItem = useCallback((product: any) => {
        const newItem: PurchaseOrderItem = {
            id: clientUuid(),
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            hsn_code: product.hsn_code || '',
            uom_conversion_id: product.uom_conversion_id,
            batch_number: product.batch_number || '',
            expiry_date: product.expiry_date || '',
            quantity: 1,
            unit: product.unit || product.uom || '',
            unit_price: product.unit_price || product.purchase_rate || 0,
            mrp: product.mrp || 0,
            expected_rate: product.unit_price || product.purchase_rate || 0,
            tax_percent: product.gst_percent ?? product.tax_percent ?? 0,
            gst_percent: product.gst_percent ?? product.tax_percent ?? 0,
            discount_percent: 0,
            free_quantity: 0,
            free_supply_tax_treatment: product.free_supply_tax_treatment,
            pack_type: product.pack_type || '',
            pack_size: product.pack_size,
            packages_per_box: product.packages_per_box,
            manufacturer: product.manufacturer || '',
            total: 0
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
        const canonicalError = canonicalPurchaseOrderValidationError(
            purchaseOrder,
            selectedSupplier,
            user?.branch_id,
        );
        if (canonicalError) newErrors.submission = canonicalError;
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [purchaseOrder, selectedSupplier, user?.branch_id]);

    const {
        saving,
        preparingReview,
        canonicalReview,
        prepareForReview,
        handleSavePurchaseOrder,
    } = usePurchaseOrderSave({
        purchaseOrder,
        selectedSupplier,
        branchId: user?.branch_id,
        isOnline,
        setPurchaseOrder,
        setCreatedPOData,
        setShowSuccessModal,
        setErrors,
    });
    const purchaseOrderValidationError = canonicalPurchaseOrderValidationError(
        purchaseOrder,
        selectedSupplier,
        user?.branch_id,
    );

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
        saving,
        preparingReview,
        errors,
        purchaseOrderValidationError,
        canonicalReview,
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
        prepareForReview,
        handleSavePurchaseOrder,
        validatePurchaseOrder,
        handlePrint,
        formatCurrency
    };
}

export default usePurchaseOrderLogic;
