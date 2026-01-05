/**
 * usePurchaseTransaction Hook
 * 
 * Shared hook for Purchase module following Sales pattern (useSalesTransaction).
 * Composes existing hooks and replaces PurchaseContext.
 * 
 * @example
 * ```ts
 * const {
 *   purchase, setPurchase,
 *   selectedSupplier, handleSupplierSelect,
 *   items, handleAddItem, handleUpdateItem, handleRemoveItem,
 *   totals
 * } = usePurchaseTransaction<PurchaseEntry, Supplier, PurchaseEntryItem>({
 *   getInitialDocument: () => initialPurchaseEntry,
 *   documentType: 'purchase_entry'
 * });
 * ```
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePurchaseItems } from './usePurchaseItems';
import { useDraftAutoSave } from './useDraftAutoSave';
import { calculateDocumentTotals } from '../utils/purchaseCalculations';
import type {
    BasePurchaseItem,
    BasePurchaseDocument,
    Supplier,
    PurchaseType
} from '../types';

// ==================== TYPES ====================

export interface UsePurchaseTransactionConfig<TDocument extends BasePurchaseDocument> {
    /** Function to get initial document state */
    getInitialDocument: () => TDocument;
    /** Document type for storage keys */
    documentType: PurchaseType | string;
    /** Enable draft auto-save */
    enableDraftSave?: boolean;
    /** Draft storage key override */
    draftStorageKey?: string;
}

export interface UsePurchaseTransactionReturn<
    TDocument extends BasePurchaseDocument,
    TSupplier extends Supplier,
    TItem extends BasePurchaseItem
> {
    // Document state
    purchase: TDocument;
    setPurchase: React.Dispatch<React.SetStateAction<TDocument>>;
    setPurchaseField: <K extends keyof TDocument>(field: K, value: TDocument[K]) => void;

    // Supplier state
    selectedSupplier: TSupplier | null;
    handleSupplierSelect: (supplier: TSupplier | null) => void;

    // Items state (from usePurchaseItems)
    items: TItem[];
    setItems: React.Dispatch<React.SetStateAction<TItem[]>>;
    handleAddItem: (item: TItem) => void;
    handleUpdateItem: (index: number, field: keyof TItem, value: any) => void;
    handleRemoveItem: (index: number) => void;
    clearItems: () => void;

    // Loading/Saving state
    saving: boolean;
    setSaving: React.Dispatch<React.SetStateAction<boolean>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;

    // UI state
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    message: string;
    messageType: 'info' | 'success' | 'error' | '';
    setMessage: (msg: string, type?: 'info' | 'success' | 'error') => void;
    clearMessage: () => void;

    // Validation
    errors: Record<string, string>;
    setError: (field: string, error: string) => void;
    clearError: (field: string) => void;
    clearErrors: () => void;

    // Calculations
    totals: ReturnType<typeof calculateDocumentTotals>;

    // Reset
    resetTransaction: () => void;
}

// ==================== HOOK ====================

export function usePurchaseTransaction<
    TDocument extends BasePurchaseDocument,
    TSupplier extends Supplier = Supplier,
    TItem extends BasePurchaseItem = BasePurchaseItem
>(config: UsePurchaseTransactionConfig<TDocument>): UsePurchaseTransactionReturn<TDocument, TSupplier, TItem> {
    const { getInitialDocument, documentType, enableDraftSave = true, draftStorageKey } = config;

    // ==================== DOCUMENT STATE ====================
    const [purchase, setPurchase] = useState<TDocument>(getInitialDocument);

    const setPurchaseField = useCallback(<K extends keyof TDocument>(field: K, value: TDocument[K]) => {
        setPurchase(prev => ({ ...prev, [field]: value }));
    }, []);

    // ==================== SUPPLIER STATE ====================
    const [selectedSupplier, setSelectedSupplier] = useState<TSupplier | null>(null);

    const handleSupplierSelect = useCallback((supplier: TSupplier | null) => {
        setSelectedSupplier(supplier);
        if (supplier) {
            setPurchase(prev => ({
                ...prev,
                supplier_id: supplier.supplier_id,
                supplier_name: supplier.supplier_name,
                supplier_details: supplier.supplier_details
            }));
        } else {
            setPurchase(prev => ({
                ...prev,
                supplier_id: undefined,
                supplier_name: '',
                supplier_details: undefined
            }));
        }
    }, []);

    // ==================== ITEMS STATE (COMPOSED) ====================
    const {
        items,
        setItems,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        clearItems
    } = usePurchaseItems<TItem>();

    // Sync items to purchase document
    useEffect(() => {
        setPurchase(prev => ({ ...prev, items: items as unknown as TDocument['items'] }));
    }, [items]);

    // ==================== UI STATE ====================
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [message, setMessageState] = useState('');
    const [messageType, setMessageType] = useState<'info' | 'success' | 'error' | ''>('');

    const setMessage = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
        setMessageState(msg);
        setMessageType(type);
    }, []);

    const clearMessage = useCallback(() => {
        setMessageState('');
        setMessageType('');
    }, []);

    // ==================== VALIDATION ====================
    const [errors, setErrors] = useState<Record<string, string>>({});

    const setError = useCallback((field: string, error: string) => {
        setErrors(prev => ({ ...prev, [field]: error }));
    }, []);

    const clearError = useCallback((field: string) => {
        setErrors(prev => {
            const { [field]: _, ...rest } = prev;
            return rest;
        });
    }, []);

    const clearErrors = useCallback(() => {
        setErrors({});
    }, []);

    // ==================== CALCULATIONS ====================
    const totals = useMemo(() => calculateDocumentTotals(items), [items]);

    // Update purchase amounts when totals change
    useEffect(() => {
        setPurchase(prev => ({
            ...prev,
            gross_amount: totals.subtotal,
            tax_amount: totals.totalTax,
            net_amount: totals.grandTotal,
            total_amount: totals.grandTotal
        }));
    }, [totals]);

    // ==================== DRAFT AUTO-SAVE ====================
    const storageKey = draftStorageKey || `${documentType}_draft`;

    useDraftAutoSave({
        data: { ...purchase, supplier: selectedSupplier },
        storageKey,
        shouldSave: () => enableDraftSave && items.length > 0 && !!selectedSupplier
    });

    // ==================== RESET ====================
    const resetTransaction = useCallback(() => {
        setPurchase(getInitialDocument());
        setSelectedSupplier(null);
        clearItems();
        setCurrentStep(1);
        clearErrors();
        clearMessage();
    }, [getInitialDocument, clearItems, clearErrors, clearMessage]);

    // ==================== RETURN ====================
    return {
        // Document
        purchase,
        setPurchase,
        setPurchaseField,

        // Supplier
        selectedSupplier,
        handleSupplierSelect,

        // Items
        items,
        setItems,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        clearItems,

        // Loading/Saving
        saving,
        setSaving,
        loading,
        setLoading,

        // UI
        currentStep,
        setCurrentStep,
        message,
        messageType,
        setMessage,
        clearMessage,

        // Validation
        errors,
        setError,
        clearError,
        clearErrors,

        // Calculations
        totals,

        // Reset
        resetTransaction
    };
}

export default usePurchaseTransaction;
