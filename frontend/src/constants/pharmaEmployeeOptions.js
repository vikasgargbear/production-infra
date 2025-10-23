/**
 * Pharma Industry - Employee Designations and Departments
 * Comprehensive options for pharmaceutical distribution and retail
 */

// ============================================
// DESIGNATIONS (Job Titles) - Top 10 for Pharma
// ============================================
export const PHARMA_DESIGNATIONS = [
  { value: 'Medical Representative', label: 'Medical Representative (MR)' },
  { value: 'Sales Manager', label: 'Sales Manager' },
  { value: 'Pharmacist', label: 'Pharmacist' },
  { value: 'Warehouse Manager', label: 'Warehouse Manager' },
  { value: 'Store Keeper', label: 'Store Keeper' },
  { value: 'Accountant', label: 'Accountant' },
  { value: 'Purchase Manager', label: 'Purchase Manager' },
  { value: 'Branch Manager', label: 'Branch Manager' },
  { value: 'Delivery Executive', label: 'Delivery Executive' },
  { value: 'General Manager', label: 'General Manager' },
];

// ============================================
// DEPARTMENTS - Top 10 for Pharma
// ============================================
export const PHARMA_DEPARTMENTS = [
  { value: 'Sales & Marketing', label: 'Sales & Marketing' },
  { value: 'Purchase', label: 'Purchase' },
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'Accounts', label: 'Accounts' },
  { value: 'Pharmacy', label: 'Pharmacy' },
  { value: 'Quality Control', label: 'Quality Control' },
  { value: 'Administration', label: 'Administration' },
  { value: 'Human Resources', label: 'Human Resources' },
  { value: 'IT', label: 'IT' },
  { value: 'Management', label: 'Management' },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get all designations as flat list (no categories)
 */
export const getAllDesignations = () => {
  return PHARMA_DESIGNATIONS;
};

/**
 * Get only sales-related designations
 */
export const getSalesDesignations = () => {
  return PHARMA_DESIGNATIONS.filter(d => 
    d.value.toLowerCase().includes('medical representative') ||
    d.value.toLowerCase().includes('sales')
  );
};

/**
 * Get department by value
 */
export const getDepartmentByValue = (value) => {
  return PHARMA_DEPARTMENTS.find(dept => dept.value === value);
};

/**
 * Get designation by value
 */
export const getDesignationByValue = (value) => {
  return PHARMA_DESIGNATIONS.find(des => des.value === value);
};
