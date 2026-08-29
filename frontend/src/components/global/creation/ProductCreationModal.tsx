import React from 'react';
import ProductFlow from '../../master/products/ProductFlow';
import type { Product } from '../../../types/models';
import type { ProductMutationResponse } from '../../../types/models/product';

export interface ProductCreationModalProps {
  show: boolean;
  onClose: () => void;
  onProductCreated: (product: ProductMutationResponse) => void;
  initialProductName?: string;
  product?: Partial<Product> | null;
}

/** Single compatibility entrypoint for every product create/edit surface. */
const ProductCreationModal: React.FC<ProductCreationModalProps> = ({
  show,
  onClose,
  onProductCreated,
  initialProductName = '',
  product,
}) => (
  <ProductFlow
    show={show}
    onClose={onClose}
    onProductCreated={onProductCreated}
    initialProductName={initialProductName}
    product={product}
  />
);

export default ProductCreationModal;
