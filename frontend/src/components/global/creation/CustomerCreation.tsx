/**
 * CustomerCreation - Customer Creation Component
 * 
 * Full-screen overlay that completely covers the parent page
 * for an immersive customer creation experience.
 */
import React from 'react';
import CustomerFlow from '../../master/customers/CustomerFlow';
import type { CanonicalCustomerCreateResponse } from '../../../services/api/modules/master/masterCreationContract';

interface CustomerCreationProps {
    onClose: () => void;
    onCustomerCreated?: (customer: CanonicalCustomerCreateResponse) => void;
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
