import React from 'react';

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
  [key: string]: any;
}

interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null | undefined;
  onSave?: (product: Product) => void;
  mode?: 'edit' | 'create' | 'view';
}

declare const ProductEditModal: React.FC<ProductEditModalProps>;

export default ProductEditModal;