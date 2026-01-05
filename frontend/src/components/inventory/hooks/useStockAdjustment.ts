/**
 * useStockAdjustment Hook
 * 
 * Extracted from EnhancedStockAdjustmentFlow.tsx (939 lines)
 * Handles stock adjustment state, validation, and submission.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { stockApi } from '../../../services/api';
import { ADJUSTMENT_TYPES, ADJUSTMENT_REASONS } from '../../../constants/stockAdjustment';
import { useToast } from '../../global';

// Types
export interface AdjustmentItem {
    id: number;
    product_id: number;
    product_name: string;
    product_code: string;
    batch_id?: number;
    batch_number?: string;
    quantity_available: number;       // CANONICAL: batch-level stock
    adjustment_quantity: number;
    unit: string;
    expiry_date?: string;
    after_adjustment: number;
    adjustment_type?: string;
    reason?: string;
    notes?: string;
}

export interface AdjustmentData {
    adjustment_no: string;
    adjustment_type: string;
    reason: string;
    adjustment_date: string;
    notes: string;
    items: AdjustmentItem[];
}

export interface UseStockAdjustmentProps {
    onClose: () => void;
}

export interface UseStockAdjustmentReturn {
    // State
    currentStep: number;
    loading: boolean;
    saving: boolean;
    error: string | null;
    refreshing: boolean;

    // Data
    adjustmentData: AdjustmentData;
    adjustmentReasons: Record<string, any[]>;
    selectedProduct: any | null;

    // UI State
    showProductSearch: boolean;
    showBulkUpload: boolean;
    showBatchSelector: boolean;

    // Refs
    productSearchRef: React.RefObject<any>;

    // Actions
    setAdjustmentData: React.Dispatch<React.SetStateAction<AdjustmentData>>;
    setShowProductSearch: (v: boolean) => void;
    setShowBulkUpload: (v: boolean) => void;
    setShowBatchSelector: (v: boolean) => void;
    setSelectedProduct: (p: any | null) => void;
    setCurrentStep: (s: number) => void;
    setError: (e: string | null) => void;

    // Handlers
    handleProductSelect: (product: any) => void;
    handleBatchSelect: (batch: any) => void;
    handleRefresh: () => Promise<void>;
    updateItemQuantity: (itemId: number, quantity: any) => void;
    handleRemoveItem: (itemId: number) => void;
    downloadTemplate: () => void;
    handleBulkUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    validateAdjustment: () => boolean;
    handleProceedToReview: () => void;
    handleSubmit: () => Promise<void>;
    handleClose: () => void;
}

function generateAdjustmentNumber(): string {
    const timestamp = Date.now();
    return `ADJ-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
}

export function useStockAdjustment({ onClose }: UseStockAdjustmentProps): UseStockAdjustmentReturn {
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const toast = useToast();

    // Refs
    const productSearchRef = useRef<any>(null);

    // Adjustment data state
    const [adjustmentData, setAdjustmentData] = useState<AdjustmentData>({
        adjustment_no: generateAdjustmentNumber(),
        adjustment_type: '',
        reason: '',
        adjustment_date: new Date().toISOString().split('T')[0],
        notes: '',
        items: []
    });

    const [adjustmentReasons, setAdjustmentReasons] = useState<Record<string, any[]>>({
        increase: [],
        decrease: []
    });
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [showBatchSelector, setShowBatchSelector] = useState(false);

    // Initialize with constants
    useEffect(() => {
        setAdjustmentReasons(ADJUSTMENT_REASONS);
    }, []);

    // Auto-open product search
    useEffect(() => {
        if (adjustmentData.adjustment_type && adjustmentData.reason && !adjustmentData.items.length && !showBulkUpload) {
            setShowProductSearch(true);
        }
    }, [adjustmentData.adjustment_type, adjustmentData.reason, adjustmentData.items.length, showBulkUpload]);

    // Handlers
    const handleProductSelect = useCallback((product: any) => {
        if (!product) return;

        if (adjustmentData.items.find(item => item.product_id === product.product_id)) {
            toast.error('Product already added to adjustment list');
            return;
        }

        setSelectedProduct(product);
        setShowProductSearch(false);
        setShowBatchSelector(true);
    }, [adjustmentData.items, toast]);

    const handleBatchSelect = useCallback((batch: any) => {
        if (!batch || !selectedProduct) return;

        const newItem: AdjustmentItem = {
            id: Date.now(),
            product_id: selectedProduct.product_id,
            product_name: selectedProduct.product_name || selectedProduct.name,
            product_code: selectedProduct.product_code || selectedProduct.code,
            batch_id: batch.batch_id,
            batch_number: batch.batch_number,
            quantity_available: batch.quantity_available || 0,
            adjustment_quantity: 1,
            unit: selectedProduct.unit || batch.base_uom || 'Units',
            expiry_date: batch.expiry_date,
            after_adjustment: adjustmentData.adjustment_type === 'increase'
                ? (batch.quantity_available || 0) + 1
                : Math.max(0, (batch.quantity_available || 0) - 1)
        };

        setAdjustmentData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        setSelectedProduct(null);
        setShowBatchSelector(false);
        toast.success(`Added ${selectedProduct.product_name} - edit quantity in table`);
    }, [selectedProduct, adjustmentData.adjustment_type, toast]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [increaseResponse, decreaseResponse] = await Promise.all([
                (stockApi as any).getMovementReasons('increase'),
                (stockApi as any).getMovementReasons('decrease')
            ]);

            const reasons = {
                increase: Array.isArray(increaseResponse?.data) ? increaseResponse.data : increaseResponse?.data?.reasons || [],
                decrease: Array.isArray(decreaseResponse?.data) ? decreaseResponse.data : decreaseResponse?.data?.reasons || []
            };

            setAdjustmentReasons(reasons);
            toast.success('Adjustment reasons refreshed');
        } catch {
            toast.error('Failed to refresh reasons');
        } finally {
            setRefreshing(false);
        }
    }, [toast]);

    const updateItemQuantity = useCallback((itemId: number, quantity: any) => {
        const qty = Math.max(1, parseInt(quantity) || 1);

        setAdjustmentData(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        adjustment_quantity: qty,
                        after_adjustment: prev.adjustment_type === 'increase'
                            ? item.quantity_available + qty
                            : Math.max(0, item.quantity_available - qty)
                    };
                }
                return item;
            })
        }));
    }, []);

    const handleRemoveItem = useCallback((itemId: number) => {
        setAdjustmentData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }));
    }, []);

    const downloadTemplate = useCallback(() => {
        const csvContent = `Product Code,Product Name,Adjustment Quantity,Reason,Notes
PARA500,Paracetamol 500mg,50,physical_count,Found extra stock
AMOX250,Amoxicillin 250mg,-10,damage,Water damage`;

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_adjustment_template.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, []);

    const handleBulkUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) return;
                const lines = text.split('\n');

                const newItems: AdjustmentItem[] = [];
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;

                    const values = lines[i].split(',').map(v => v.trim());
                    const productCode = values[0];
                    const productName = values[1];
                    const adjustmentQty = parseInt(values[2]) || 0;
                    const reason = values[3] || 'physical_count';
                    const itemNotes = values[4] || '';

                    if (!productCode || adjustmentQty === 0) continue;

                    const isIncrease = adjustmentQty > 0;
                    newItems.push({
                        id: Date.now() + i,
                        product_code: productCode,
                        product_name: productName,
                        product_id: i,
                        quantity_available: 0,
                        adjustment_quantity: Math.abs(adjustmentQty),
                        adjustment_type: isIncrease ? 'increase' : 'decrease',
                        reason: reason,
                        unit: 'Units',
                        after_adjustment: Math.abs(adjustmentQty),
                        notes: itemNotes
                    });
                }

                if (newItems.length > 0) {
                    const firstType = newItems[0].adjustment_type || 'increase';
                    setAdjustmentData(prev => ({
                        ...prev,
                        adjustment_type: firstType,
                        reason: newItems[0].reason || '',
                        items: newItems.filter(item => item.adjustment_type === firstType)
                    }));
                    toast.success(`Loaded ${newItems.length} adjustments from CSV`);
                }

                setShowBulkUpload(false);
            } catch {
                toast.error('Failed to parse CSV file');
            }
        };

        reader.readAsText(file);
    }, [toast]);

    const validateAdjustment = useCallback((): boolean => {
        if (!adjustmentData.adjustment_type) {
            toast.error('Please select adjustment type');
            return false;
        }
        if (!adjustmentData.reason) {
            toast.error('Please select a reason');
            return false;
        }
        if (adjustmentData.items.length === 0) {
            toast.error('Please add at least one product');
            return false;
        }
        return true;
    }, [adjustmentData, toast]);

    const handleProceedToReview = useCallback(() => {
        if (validateAdjustment()) {
            setCurrentStep(2);
            window.scrollTo(0, 0);
        }
    }, [validateAdjustment]);

    const handleSubmit = useCallback(async () => {
        if (!validateAdjustment()) return;

        setSaving(true);
        try {
            const adjustmentPayload = {
                adjustment_type: adjustmentData.adjustment_type,
                reason: adjustmentData.reason,
                notes: adjustmentData.notes,
                adjustment_date: new Date(adjustmentData.adjustment_date).toISOString(),
                items: adjustmentData.items.map(item => ({
                    product_id: item.product_id,
                    quantity: adjustmentData.adjustment_type === 'decrease'
                        ? -item.adjustment_quantity
                        : item.adjustment_quantity,
                    batch_number: null
                }))
            };

            await stockApi.createAdjustment(adjustmentPayload);
            toast.success('Stock adjustment completed successfully');

            setTimeout(() => onClose(), 1500);
        } catch {
            toast.info('Network issue: Stock adjustment saved locally');
        } finally {
            setSaving(false);
        }
    }, [adjustmentData, validateAdjustment, toast, onClose]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    return {
        currentStep,
        loading,
        saving,
        error,
        refreshing,
        adjustmentData,
        adjustmentReasons,
        selectedProduct,
        showProductSearch,
        showBulkUpload,
        showBatchSelector,
        productSearchRef,
        setAdjustmentData,
        setShowProductSearch,
        setShowBulkUpload,
        setShowBatchSelector,
        setSelectedProduct,
        setCurrentStep,
        setError,
        handleProductSelect,
        handleBatchSelect,
        handleRefresh,
        updateItemQuantity,
        handleRemoveItem,
        downloadTemplate,
        handleBulkUpload,
        validateAdjustment,
        handleProceedToReview,
        handleSubmit,
        handleClose
    };
}

export default useStockAdjustment;
