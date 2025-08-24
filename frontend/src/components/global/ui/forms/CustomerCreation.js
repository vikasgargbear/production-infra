import React, { useState, useEffect } from 'react';
import CustomerCreationB2B from './CustomerCreationB2B';
import CustomerCreationB2C from './CustomerCreationB2C';
import { useCompany } from '../../../../contexts/CompanyContext';

/**
 * Smart Customer Creation Component
 * 
 * Purpose: Automatically renders the appropriate customer creation form
 * based on organization configuration
 * 
 * How it works:
 * 1. Checks organization settings for business_type
 * 2. Renders B2B component for: wholesale, distributor, b2b
 * 3. Renders B2C component for: retail, b2c, pharmacy
 * 4. Falls back to toggle mode for testing/development
 * 
 * Configuration:
 * - Set in Organization Settings: business_type
 * - Or set in localStorage: customer_creation_mode
 * - Or use forceMode prop to override
 * 
 * Usage:
 * <CustomerCreation onClose={handleClose} onCustomerCreated={handleCreated} />
 * <CustomerCreation forceMode="b2b" ... />  // Force B2B mode
 * <CustomerCreation forceMode="b2c" ... />  // Force B2C mode
 * <CustomerCreation forceMode="toggle" ... />  // Show toggle (testing)
 */
const CustomerCreation = ({ 
  onClose, 
  onCustomerCreated, 
  forceMode = null,
  showToggle = false // Set to true for testing both modes
}) => {
  const { companyInfo } = useCompany();
  const [mode, setMode] = useState('b2b'); // Default to B2B
  const [isToggleMode, setIsToggleMode] = useState(false);

  useEffect(() => {
    // Priority 1: Force mode from prop
    if (forceMode) {
      if (forceMode === 'toggle') {
        setIsToggleMode(true);
      } else {
        setMode(forceMode);
        setIsToggleMode(false);
      }
      return;
    }

    // Priority 2: Check if toggle is explicitly enabled (for testing)
    if (showToggle) {
      setIsToggleMode(true);
      return;
    }

    // Priority 3: Organization settings
    if (companyInfo?.business_settings?.business_type) {
      const businessType = companyInfo.business_settings.business_type.toLowerCase();
      
      // B2C types
      if (['retail', 'b2c', 'pharmacy', 'medical_store'].includes(businessType)) {
        setMode('b2c');
      } 
      // B2B types
      else if (['wholesale', 'distributor', 'b2b', 'stockist'].includes(businessType)) {
        setMode('b2b');
      }
      // Unknown type - default to B2B
      else {
        setMode('b2b');
      }
      setIsToggleMode(false);
      return;
    }

    // Priority 4: Local storage override (for development/testing)
    const localMode = localStorage.getItem('customer_creation_mode');
    if (localMode) {
      if (localMode === 'toggle') {
        setIsToggleMode(true);
      } else {
        setMode(localMode);
        setIsToggleMode(false);
      }
      return;
    }

    // Priority 5: Check if system has mixed customers (enable toggle)
    // This could be determined by checking if there are both B2B and B2C customers in the database
    // For now, we'll default to B2B mode
    setMode('b2b');
    setIsToggleMode(false);
  }, [companyInfo, forceMode, showToggle]);

  // If in toggle mode, show a combined component with toggle
  if (isToggleMode) {
    return (
      <CustomerCreationWithToggle 
        onClose={onClose}
        onCustomerCreated={onCustomerCreated}
        initialMode={mode}
      />
    );
  }

  // Render the appropriate component based on mode
  if (mode === 'b2c') {
    return (
      <CustomerCreationB2C 
        onClose={onClose}
        onCustomerCreated={onCustomerCreated}
      />
    );
  }

  // Default to B2B
  return (
    <CustomerCreationB2B 
      onClose={onClose}
      onCustomerCreated={onCustomerCreated}
    />
  );
};

/**
 * Component with Toggle (for testing/development)
 * This is only used when explicitly enabled
 */
const CustomerCreationWithToggle = ({ onClose, onCustomerCreated, initialMode = 'b2b' }) => {
  const [mode] = useState(initialMode);

  // For now, just render the B2B component with a temporary toggle
  // This avoids the nested modal overlay issue
  if (mode === 'b2c') {
    return (
      <CustomerCreationB2C 
        onClose={onClose}
        onCustomerCreated={onCustomerCreated}
      />
    );
  }

  return (
    <CustomerCreationB2B 
      onClose={onClose}
      onCustomerCreated={onCustomerCreated}
    />
  );
};

// Export the smart component as default
export default CustomerCreation;

// Also export individual components for direct access if needed
export { CustomerCreationB2B, CustomerCreationB2C };