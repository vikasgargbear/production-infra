/**
 * useBatchMaster Hook
 * 
 * Extracts state management and CRUD operations from BatchMaster.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { productsApi, batchApi } from '../../../services/api';
import { toast } from 'react-toastify';

// ============================================
// Type Definitions
// ============================================

export interface Batch {
    batch_id: number;
    batch_number: string;
    product_id: number;
    product_name: string;
    manufacturer?: string;
    manufacturing_date: string;
    expiry_date: string;
    mrp: number;
    sale_price: number;
    cost_per_unit: number;
    quantity: number;
    available_quantity: number;
    rack_location?: string;
    is_expired: boolean;
    expiring_soon: boolean;
}

export interface BatchFormData {
    batch_number: string;
    product_id: number | null;
    product_name: string;
    manufacturing_date: string;
    expiry_date: string;
    mrp: string;
    sale_price: string;
    cost_per_unit: string;
    quantity: string;
    rack_location: string;
}

// ============================================
// Default Values
// ============================================

const getInitialFormData = (): BatchFormData => ({
    batch_number: '',
    product_id: null,
    product_name: '',
    manufacturing_date: '',
    expiry_date: '',
    mrp: '',
    sale_price: '',
    cost_per_unit: '',
    quantity: '',
    rack_location: ''
});

// ============================================
// Hook Implementation
// ============================================

export function useBatchMaster() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'expiring' | 'valid'>('all');
    const [productFilter, setProductFilter] = useState<string>('');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
    const [formData, setFormData] = useState<BatchFormData>(getInitialFormData());

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const perPage = 50;

    // ============================================
    // Computed Values
    // ============================================

    const filteredBatches = useMemo(() => {
        return batches.filter(batch => {
            const matchesSearch = !searchTerm ||
                batch.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                batch.product_name?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesProduct = !productFilter ||
                batch.product_name?.toLowerCase().includes(productFilter.toLowerCase());

            let matchesExpiry = true;
            if (expiryFilter === 'expired') matchesExpiry = batch.is_expired;
            else if (expiryFilter === 'expiring') matchesExpiry = batch.expiring_soon && !batch.is_expired;
            else if (expiryFilter === 'valid') matchesExpiry = !batch.is_expired && !batch.expiring_soon;

            return matchesSearch && matchesProduct && matchesExpiry;
        });
    }, [batches, searchTerm, productFilter, expiryFilter]);

    const stats = useMemo(() => {
        const expired = batches.filter(b => b.is_expired).length;
        const expiringSoon = batches.filter(b => b.expiring_soon && !b.is_expired).length;
        const lowStock = batches.filter(b => b.available_quantity < 10).length;
        return { expired, expiringSoon, lowStock, total: batches.length };
    }, [batches]);

    // ============================================
    // API Actions
    // ============================================

    const fetchBatches = useCallback(async (pageNum = 1) => {
        setLoading(true);
        setError(null);

        try {
            const response = await batchApi.getAll({
                limit: perPage,
                offset: (pageNum - 1) * perPage
            });

            if (response.data) {
                const batchData = response.data.batches || response.data || [];
                setBatches(batchData.map((b: any) => ({
                    ...b,
                    is_expired: new Date(b.expiry_date) < new Date(),
                    expiring_soon: new Date(b.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                })));
                setTotalPages(Math.ceil((response.data.total || batchData.length) / perPage));
                setPage(pageNum);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch batches');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            const response = await productsApi.getAll({ limit: 500 });
            if (response.data) {
                setProducts(response.data.products || response.data || []);
            }
        } catch (err) {
            console.error('Failed to load products');
        }
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
    }, []);

    const handleOpenModal = useCallback((batch: Batch | null = null) => {
        if (batch) {
            setEditingBatch(batch);
            setFormData({
                batch_number: batch.batch_number,
                product_id: batch.product_id,
                product_name: batch.product_name,
                manufacturing_date: batch.manufacturing_date,
                expiry_date: batch.expiry_date,
                mrp: batch.mrp.toString(),
                sale_price: batch.sale_price.toString(),
                cost_per_unit: batch.cost_per_unit.toString(),
                quantity: batch.quantity.toString(),
                rack_location: batch.rack_location || ''
            });
        } else {
            resetForm();
            setEditingBatch(null);
        }
        setShowModal(true);
    }, [resetForm]);

    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        setEditingBatch(null);
        resetForm();
    }, [resetForm]);

    const updateFormField = useCallback((field: keyof BatchFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    // ============================================
    // CRUD Operations
    // ============================================

    const handleSave = useCallback(async () => {
        if (!formData.batch_number || !formData.product_id) {
            toast.error('Batch number and product are required');
            return false;
        }

        setLoading(true);
        try {
            const payload = {
                batch_number: formData.batch_number,
                product_id: formData.product_id,
                manufacturing_date: formData.manufacturing_date || undefined,
                expiry_date: formData.expiry_date,
                mrp: parseFloat(formData.mrp) || 0,
                sale_price: parseFloat(formData.sale_price) || 0,
                cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
                quantity: parseInt(formData.quantity) || 0,
                rack_location: formData.rack_location || undefined
            };

            let response;
            if (editingBatch) {
                response = await batchApi.update(editingBatch.batch_id, payload);
            } else {
                response = await batchApi.create(payload);
            }

            if (response.success || response.data) {
                toast.success(editingBatch ? 'Batch updated!' : 'Batch created!');
                handleCloseModal();
                fetchBatches(page);
                return true;
            }
            return false;
        } catch (err: any) {
            toast.error(err.message || 'Failed to save batch');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, editingBatch, handleCloseModal, fetchBatches, page]);

    const handleDelete = useCallback(async (batch: Batch) => {
        if (!window.confirm(`Delete batch ${batch.batch_number}?`)) {
            return false;
        }

        setLoading(true);
        try {
            await batchApi.delete(batch.batch_id);
            toast.success('Batch deleted');
            fetchBatches(page);
            return true;
        } catch (err) {
            toast.error('Failed to delete batch');
            return false;
        } finally {
            setLoading(false);
        }
    }, [fetchBatches, page]);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        fetchBatches();
        fetchProducts();
    }, [fetchBatches, fetchProducts]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        batches,
        filteredBatches,
        products,
        loading,
        error,
        stats,

        // Filters
        searchTerm,
        setSearchTerm,
        expiryFilter,
        setExpiryFilter,
        productFilter,
        setProductFilter,

        // Pagination
        page,
        totalPages,
        setPage: (p: number) => fetchBatches(p),

        // Modal
        showModal,
        editingBatch,
        formData,
        handleOpenModal,
        handleCloseModal,
        updateFormField,

        // CRUD
        handleSave,
        handleDelete,
        fetchBatches
    };
}

export default useBatchMaster;
