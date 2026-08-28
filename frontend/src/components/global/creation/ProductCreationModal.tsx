import React from 'react';
import ProductFlow from '../../master/products/ProductFlow';
import type { Product } from '../../../types/models';

export interface ProductCreationModalProps {
  show: boolean;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
  initialProductName?: string;
  product?: Partial<Product> | null;
}

/** Single compatibility entrypoint for every product create/edit surface. */
const ProductCreationModal: React.FC<ProductCreationModalProps> = ({
  show,
  onClose,
  initialProductName = '',
  product,
}) => (
  <ProductFlow
    show={show}
    onClose={onClose}
    initialProductName={initialProductName}
    product={product}
  />
);

export default ProductCreationModal;
