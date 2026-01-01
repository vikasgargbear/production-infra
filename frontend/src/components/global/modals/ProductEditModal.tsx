import React, { FC } from 'react';
import ProductMaster from '../../master/ProductMaster';

// ==================== TYPE DEFINITIONS ====================

interface Product {
    id?: string;
    product_name?: string;
    generic_name?: string;
    product_code?: string;
    category?: string;
    hsn_code?: string;
    brand?: string;
    manufacturer?: string;
    mrp?: number;
    cost_price?: number;
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

const ProductEditModal: FC<ProductEditModalProps> = (props) => {
    return <ProductMaster {...props} />;
};

export default ProductEditModal;
