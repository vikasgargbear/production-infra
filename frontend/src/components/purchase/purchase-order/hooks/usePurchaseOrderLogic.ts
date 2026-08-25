/**
 * usePurchaseOrderLogic Hook
 * 
 * Extracted from PurchaseOrderFlow.tsx
 * Contains all state management, calculations, and handlers for purchase orders.
 * The main component handles only rendering.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { clientUuid } from '../../../../utils/clientUuid';
import { canonicalBusinessContextApi } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import { toast } from 'react-toastify';
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
    quantity: number | string;
    unit?: string;
    unit_price: number | string;
    mrp?: number;
    expected_rate?: number;
    tax_percent?: number | string;
    discount_percent?: number | string;
    free_quantity?: number | string;
    free_supply_tax_treatment?:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate';
    pack_type?: string;
    pack_size?: number;
    packages_per_box?: number;
    manufacturer?: string;
    total?: number | string;
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
    gross_amount: number | string;
    discount_amount: number | string;
    tax_amount: number | string;
    freight_charges: number | string;
    net_amount: number | string;
    total_amount: number | string;
    notes: string;
    status: string;
}

export interface CreatedPOData {
    poNumber: string;
    poId: string | number;
    supplierName: string;
    totalAmount: number | string;
}

export interface UsePurchaseOrderLogicProps {
    prefilledData?: Partial<PurchaseOrderData> | null;
    onClose: () => void;
}

export interface UsePurchaseOrderLogicReturn {
    // State
    purchaseOrder: PurchaseOrderData;
    setPurchaseOrder: React.Dispatch<React.SetStateAction<PurchaseOrderData>>;
    documentPolicy: CanonicalDocumentPolicy | null;
    selectedSupplier: any;
    setSelectedSupplier: React.Dispatch<React.SetStateAction<any>>;
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    saving: boolean;
    preparingReview: boolean;
    errors: Record<string, string>;
    purchaseOrderValidationError: string | null;
    canonicalReview: CanonicalPurchaseOrderReview | null;
    executedResourceId: string | null;

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
}

export const getInitialPurchaseOrder = (
    prefilledData?: Partial<PurchaseOrderData> | null,
): PurchaseOrderData => ({
    po_no: '',
    po_date: prefilledData?.po_date || '',
    expected_delivery_date: prefilledData?.expected_delivery_date || '',
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_terms: '',
    delivery_terms: '',
    delivery_location: '',
    transport_mode: '',
    gross_amount: '',
    discount_amount: '',
    tax_amount: '',
    freight_charges: '',
    net_amount: '',
    total_amount: '',
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
    const [documentPolicy, setDocumentPolicy] = useState<CanonicalDocumentPolicy | null>(null);

    // Modal States
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Data States
    const [createdPOData, setCreatedPOData] = useState<CreatedPOData | null>(null);

    useEffect(() => {
        let active = true;
        void canonicalBusinessContextApi.get().then(context => {
            if (!active) return;
            setPurchaseOrder(previous => ({
                ...previous,
                po_date: previous.po_date || context.business_date,
            }));
            setDocumentPolicy(context.document_policy);
        }).catch(error => {
            if (active) toast.error(
                error instanceof Error
                    ? error.message
                    : 'Unable to load the organization business date.',
            );
        });
        return () => { active = false; };
    }, []);

    // Handlers
    const handleSupplierSelect = useCallback((supplier: any) => {
        setSelectedSupplier(supplier);
        setPurchaseOrder(prev => ({
            ...prev,
            supplier_id: supplier?.supplier_id ?? '',
            supplier_name: supplier?.supplier_name ?? '',
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
            quantity: '',
            unit: product.unit || product.uom || '',
            unit_price: product.unit_price ?? product.purchase_rate ?? '',
            mrp: product.mrp,
            expected_rate: product.unit_price ?? product.purchase_rate,
            tax_percent: product.gst_percent,
            discount_percent: '',
            free_quantity: '',
            free_supply_tax_treatment: product.free_supply_tax_treatment,
            pack_type: product.pack_type || '',
            pack_size: product.pack_size,
            packages_per_box: product.packages_per_box,
            manufacturer: product.manufacturer || '',
            total: ''
        };

        setPurchaseOrder(prev => ({
            ...prev,
            items: [...(prev.items || []), newItem]
        }));
    }, []);

    const handleUpdateItem = useCallback((index: number, field: string, value: any) => {
        const exactFields = new Set(['quantity', 'unit_price', 'discount_percent', 'free_quantity', 'free']);
        setPurchaseOrder(prev => ({
            ...prev,
            items: (prev.items || []).map((item, i) => {
                if (i === index) {
                    return { ...item, [field]: exactFields.has(field) ? String(value) : value };
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
        executedResourceId,
        prepareForReview,
        handleSavePurchaseOrder,
    } = usePurchaseOrderSave({
        purchaseOrder,
        selectedSupplier,
        branchId: user?.branch_id,
        isOnline,
        documentPolicy,
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

    return {
        purchaseOrder,
        setPurchaseOrder,
        documentPolicy,
        selectedSupplier,
        setSelectedSupplier,
        currentStep,
        setCurrentStep,
        saving,
        preparingReview,
        errors,
        purchaseOrderValidationError,
        canonicalReview,
        executedResourceId,
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
        handlePrint
    };
}

export default usePurchaseOrderLogic;
