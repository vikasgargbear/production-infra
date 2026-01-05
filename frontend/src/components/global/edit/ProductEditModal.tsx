import React, { FC } from 'react';
import ProductCreationModal from '../creation/ProductCreationModal';

// ==================== TYPE DEFINITIONS ====================

interface Product {
    id?: string;
    product_id?: number | string;
    product_name?: string;
    generic_name?: string;
    product_code?: string;
    category?: string;
    hsn_code?: string;
    brand?: string;
    manufacturer?: string;
    mrp?: number;
    cost_per_unit?: number;
    pack_size?: string;
    unit?: string;
    tax_rate?: number;
    status?: string;
    is_active?: boolean;
    [key: string]: unknown;
}

export interface ProductEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product?: Product | null;
    onSave?: (product: Product) => void;
    mode?: 'edit' | 'create' | 'view';
}

// ==================== COMPONENT ====================

/**
 * ProductEditModal - Wrapper around ProductCreationModal for editing products
 * Note: ProductCreationModal handles both create and edit modes
 */
const ProductEditModal: FC<ProductEditModalProps> = ({
    isOpen,
    onClose,
    product,
    onSave,
    mode = 'edit'
}) => {
    if (!isOpen) return null;

    return (
        <ProductCreationModal
            show={isOpen}
            onClose={onClose}
            onProductCreated={(savedProduct) => {
                if (onSave) {
                    onSave(savedProduct as Product);
                }
            }}
            initialProductName={product?.product_name || ''}
        />
    );
};

export default ProductEditModal;

