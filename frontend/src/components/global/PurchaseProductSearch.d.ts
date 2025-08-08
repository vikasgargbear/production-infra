import React from 'react';

interface ProductWithBatch {
  product_id: number | string;
  product_name?: string;
  [key: string]: any;
}

interface PurchaseProductSearchProps {
  onAddItem: (productWithBatch: ProductWithBatch) => void;
  onCreateProduct?: () => void;
  requireBatch?: boolean;
  placeholder?: string;
}

interface PurchaseProductSearchRef {
  focus: () => void;
  clear: () => void;
}

declare const PurchaseProductSearch: React.ForwardRefExoticComponent<
  PurchaseProductSearchProps & React.RefAttributes<PurchaseProductSearchRef>
>;

export default PurchaseProductSearch;