import React, { forwardRef } from 'react';
import ProductSearchSimple from './search/ProductSearchSimple';

/**
 * Global Purchase Product Search Component
 * Unified product search for all purchase modules (PO, Purchase Entry, etc.)
 * 
 * @param {boolean} requireBatch - Whether batch selection is required (true for Purchase Entry, false for PO)
 * @param {function} onAddItem - Callback when item is added
 * @param {function} onCreateProduct - Callback for creating new product
 * @param {string} placeholder - Search placeholder text
 */
const PurchaseProductSearch = forwardRef(({ 
  requireBatch = false,
  onAddItem,
  onCreateProduct,
  placeholder = "Search products by name, code, or HSN...",
  className = ""
}, ref) => {
  return (
    <ProductSearchSimple
      ref={ref}
      onAddItem={onAddItem}
      onCreateProduct={onCreateProduct}
      showBatchSelection={requireBatch}
      placeholder={placeholder}
      className={className}
    />
  );
});

PurchaseProductSearch.displayName = 'PurchaseProductSearch';

export default PurchaseProductSearch;