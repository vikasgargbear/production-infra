import React from 'react';
import ProductMaster from '../../masters/ProductMaster';

// Wrapper component to maintain backward compatibility
// This redirects to the new comprehensive ProductMaster component
const ProductEditModal = (props) => {
  // Pass through all props to the new ProductMaster component
  return <ProductMaster {...props} />;
};

export default ProductEditModal;