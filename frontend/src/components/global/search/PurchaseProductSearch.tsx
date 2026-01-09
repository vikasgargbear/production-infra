import React, { forwardRef, ForwardRefRenderFunction } from 'react';
import ProductSearch from './ProductSearch';

// ==================== TYPE DEFINITIONS ====================

interface ProductWithBatch {
    product_id: number | string;
    product_name?: string;
    [key: string]: unknown;
}

export interface PurchaseProductSearchRef {
    focus: () => void;
    clear: () => void;
}

export interface PurchaseProductSearchProps {
    onAddItem: (productWithBatch: ProductWithBatch) => void;
    onCreateProduct?: () => void;
    requireBatch?: boolean;
    placeholder?: string;
    className?: string;
}

// ==================== COMPONENT ====================

const PurchaseProductSearchComponent: ForwardRefRenderFunction<PurchaseProductSearchRef, PurchaseProductSearchProps> = ({
    requireBatch = false,
    onAddItem,
    onCreateProduct,
    placeholder = "Search products by name, code, or HSN...",
    className = ""
}, ref) => {
    return (
        <ProductSearch
            ref={ref}
            onAddItem={onAddItem as (product: any) => void}
            onCreateProduct={onCreateProduct}
            showBatchSelection={requireBatch}
            placeholder={placeholder}
            className={className}
        />
    );
};

const PurchaseProductSearch = forwardRef(PurchaseProductSearchComponent);
PurchaseProductSearch.displayName = 'PurchaseProductSearch';

export default PurchaseProductSearch;
