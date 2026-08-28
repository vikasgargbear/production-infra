import React, { FC } from 'react';
import ProductCreationModal from '../creation/ProductCreationModal';
import type { Product } from '../../../types/models';

// Use canonical Product type - DO NOT define duplicate

// Accept a flexible product type to support different Product extensions
export interface ProductEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product?: { product_name?: string;[key: string]: unknown } | null;
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
                    onSave(savedProduct as unknown as Product);
                }
            }}
            product={product as Partial<Product> | null}
            initialProductName={product?.product_name || ''}
        />
    );
};

export default ProductEditModal;
