/**
 * Creation Components
 * Entity creation modals and forms
 */

// SupplierCreationModal now uses the new full-page SupplierFlow component
export { default as SupplierCreationModal } from '../../master/suppliers/SupplierFlow';
// ProductCreationModal now uses the new full-page ProductFlow component
export { default as ProductCreationModal } from '../../master/products/ProductFlow';
// CustomerCreation uses the master CustomerFlow component (B2B pharma focused)
export { default as CustomerCreation } from './CustomerCreation';
