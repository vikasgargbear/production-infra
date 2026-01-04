/**
 * CustomerCreation - Customer Creation Component
 * 
 * This is a compatibility shim that re-exports CustomerCreationModal
 * for backwards compatibility with existing imports.
 * 
 * Usage:
 * <CustomerCreation onClose={handleClose} onCustomerCreated={handleCreated} />
 */
import React from 'react';
import CustomerCreationModal from './CustomerCreationModal';

interface CustomerCreationProps {
    onClose: () => void;
    onCustomerCreated?: (customer: any) => void;
    forceMode?: string | null;
    showToggle?: boolean;
}

const CustomerCreation: React.FC<CustomerCreationProps> = ({
    onClose,
    onCustomerCreated,
}) => {
    // Use the unified CustomerCreationModal
    return (
        <CustomerCreationModal
            show={true}
            onClose={onClose}
            onCustomerCreated={onCustomerCreated}
        />
    );
};

export default CustomerCreation;
