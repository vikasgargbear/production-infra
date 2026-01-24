/**
 * CustomerCreation - Customer Creation Component
 * 
 * Full-screen overlay that completely covers the parent page
 * for an immersive customer creation experience.
 */
import React from 'react';
import CustomerFlow from '../../master/customers/CustomerFlow';

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
    // Full-screen overlay that covers everything
    return (
        <div className="fixed inset-0 z-50 bg-white">
            <CustomerFlow
                open={true}
                onClose={onClose}
                onCustomerCreated={onCustomerCreated}
            />
        </div>
    );
};

export default CustomerCreation;

