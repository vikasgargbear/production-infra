/**
 * useProducts Hook
 * 
 * Extracts state management and CRUD operations from Products.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { productsApi } from '../../../services/api';
import type { ProductCreateInput, ProductUpdateInput } from '../../../types/models/product';

// ============================================
// Type Definitions
// ============================================

export interface Product {
    product_id: number | string;
    product_name: string;
    category?: string;
    manufacturer?: string;
    product_type?: string;
    hsn_code?: string;
    generic_name?: string;
    gst_percent?: number;
    cgst_percent?: number;
    sgst_percent?: number;
    igst_percent?: number;
    mrp?: number;
    sale_price?: number;
    cost_per_unit?: number;
    min_stock?: number;
    max_stock?: number;
    reorder_level?: number;
    rack_location?: string;
    shelf_location?: string;
    barcode?: string;
    is_active?: boolean;
}

export type ProductFormData = ProductCreateInput;

// ============================================
// Hook Implementation
// ============================================

export function useProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter/Search
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const perPage = 50;

    // ============================================
    // Computed Values
    // ============================================

    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesSearch = !searchTerm ||
                product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.barcode?.includes(searchTerm);

            const matchesCategory = !categoryFilter ||
                product.category?.toLowerCase().includes(categoryFilter.toLowerCase());

            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, categoryFilter]);

    // ============================================
    // API Actions
    // ============================================

    const fetchProducts = useCallback(async (pageNum = 1) => {
        setLoading(true);
        setError(null);

        try {
            const response = await productsApi.getAll({
                limit: perPage,
                offset: (pageNum - 1) * perPage,
                include_inactive: true,
            });

            if (response.data?.success || response.data) {
                const productData = response.data?.products || response.data || [];
                setProducts(productData);
                setTotalPages(Math.ceil((response.data?.total || productData.length) / perPage));
                setPage(pageNum);
            } else {
                setError('Failed to fetch products');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch products');
        } finally {
            setLoading(false);
        }
    }, []);

    const createProduct = useCallback(async (formData: ProductFormData) => {
        setLoading(true);
        try {
            const response = await productsApi.create(formData);
            await fetchProducts(page);
            return { success: true, data: response.data };
        } catch (err: any) {
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [fetchProducts, page]);

    const updateProduct = useCallback(async (productId: number | string, formData: ProductUpdateInput) => {
        setLoading(true);
        try {
            const response = await productsApi.update(productId, formData);
            await fetchProducts(page);
            return { success: true, data: response.data };
        } catch (err: any) {
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [fetchProducts, page]);

    const deleteProduct = useCallback(async (productId: number | string) => {
        if (!window.confirm('Delete this unused product draft? Active or referenced products cannot be deleted.')) {
            return { success: false };
        }

        setLoading(true);
        try {
            const response = await productsApi.delete(productId);
            if (response.data?.success || response.status === 200) {
                await fetchProducts(page);
                return { success: true };
            }
            return { success: false, error: 'Failed to delete product' };
        } catch (err: any) {
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [fetchProducts, page]);

    // ============================================
    // Modal Actions
    // ============================================

    const openCreateModal = useCallback(() => {
        setEditingProduct(null);
        setShowModal(true);
    }, []);

    const openEditModal = useCallback((product: Product) => {
        setEditingProduct(product);
        setShowModal(true);
    }, []);

    const closeModal = useCallback(() => {
        setShowModal(false);
        setEditingProduct(null);
    }, []);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        products,
        filteredProducts,
        loading,
        error,

        // Search/Filter
        searchTerm,
        setSearchTerm,
        categoryFilter,
        setCategoryFilter,

        // Pagination
        page,
        totalPages,
        setPage: (p: number) => fetchProducts(p),

        // Modal
        showModal,
        editingProduct,
        openCreateModal,
        openEditModal,
        closeModal,

        // CRUD
        fetchProducts,
        createProduct,
        updateProduct,
        deleteProduct
    };
}

export default useProducts;
