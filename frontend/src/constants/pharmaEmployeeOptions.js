/**
 * Pharma Industry - Employee Designations and Departments
 * Comprehensive options for pharmaceutical distribution and retail
 */

// ============================================
// DESIGNATIONS (Job Titles)
// ============================================
export const PHARMA_DESIGNATIONS = [
  // Sales & Marketing
  { value: 'Medical Representative', label: 'Medical Representative (MR)', category: 'Sales' },
  { value: 'Area Sales Manager', label: 'Area Sales Manager (ASM)', category: 'Sales' },
  { value: 'Regional Sales Manager', label: 'Regional Sales Manager (RSM)', category: 'Sales' },
  { value: 'Zonal Sales Manager', label: 'Zonal Sales Manager (ZSM)', category: 'Sales' },
  { value: 'National Sales Manager', label: 'National Sales Manager (NSM)', category: 'Sales' },
  { value: 'Sales Executive', label: 'Sales Executive', category: 'Sales' },
  { value: 'Sales Coordinator', label: 'Sales Coordinator', category: 'Sales' },
  { value: 'Business Development Manager', label: 'Business Development Manager', category: 'Sales' },
  { value: 'Key Account Manager', label: 'Key Account Manager', category: 'Sales' },
  { value: 'Product Manager', label: 'Product Manager', category: 'Sales' },
  { value: 'Marketing Manager', label: 'Marketing Manager', category: 'Sales' },
  
  // Purchase & Procurement
  { value: 'Purchase Manager', label: 'Purchase Manager', category: 'Purchase' },
  { value: 'Purchase Executive', label: 'Purchase Executive', category: 'Purchase' },
  { value: 'Purchase Officer', label: 'Purchase Officer', category: 'Purchase' },
  { value: 'Procurement Head', label: 'Procurement Head', category: 'Purchase' },
  
  // Warehouse & Logistics
  { value: 'Warehouse Manager', label: 'Warehouse Manager', category: 'Warehouse' },
  { value: 'Warehouse Supervisor', label: 'Warehouse Supervisor', category: 'Warehouse' },
  { value: 'Warehouse Incharge', label: 'Warehouse Incharge', category: 'Warehouse' },
  { value: 'Store Keeper', label: 'Store Keeper', category: 'Warehouse' },
  { value: 'Inventory Manager', label: 'Inventory Manager', category: 'Warehouse' },
  { value: 'Logistics Manager', label: 'Logistics Manager', category: 'Warehouse' },
  { value: 'Logistics Coordinator', label: 'Logistics Coordinator', category: 'Warehouse' },
  { value: 'Delivery Executive', label: 'Delivery Executive', category: 'Warehouse' },
  { value: 'Packing Supervisor', label: 'Packing Supervisor', category: 'Warehouse' },
  
  // Accounts & Finance
  { value: 'Accountant', label: 'Accountant', category: 'Accounts' },
  { value: 'Chief Accountant', label: 'Chief Accountant', category: 'Accounts' },
  { value: 'Accounts Manager', label: 'Accounts Manager', category: 'Accounts' },
  { value: 'Accounts Executive', label: 'Accounts Executive', category: 'Accounts' },
  { value: 'Finance Manager', label: 'Finance Manager', category: 'Accounts' },
  { value: 'Finance Controller', label: 'Finance Controller', category: 'Accounts' },
  { value: 'Chief Financial Officer', label: 'Chief Financial Officer (CFO)', category: 'Accounts' },
  { value: 'Billing Executive', label: 'Billing Executive', category: 'Accounts' },
  { value: 'Collection Executive', label: 'Collection Executive', category: 'Accounts' },
  
  // Quality Control & Regulatory
  { value: 'Quality Control Manager', label: 'Quality Control Manager (QC)', category: 'Quality' },
  { value: 'Quality Assurance Manager', label: 'Quality Assurance Manager (QA)', category: 'Quality' },
  { value: 'Quality Analyst', label: 'Quality Analyst', category: 'Quality' },
  { value: 'Regulatory Affairs Manager', label: 'Regulatory Affairs Manager', category: 'Quality' },
  { value: 'Compliance Officer', label: 'Compliance Officer', category: 'Quality' },
  { value: 'Pharmacovigilance Officer', label: 'Pharmacovigilance Officer', category: 'Quality' },
  
  // Pharmacy & Dispensing
  { value: 'Pharmacist', label: 'Pharmacist (B.Pharm/M.Pharm)', category: 'Pharmacy' },
  { value: 'Chief Pharmacist', label: 'Chief Pharmacist', category: 'Pharmacy' },
  { value: 'Registered Pharmacist', label: 'Registered Pharmacist', category: 'Pharmacy' },
  { value: 'Clinical Pharmacist', label: 'Clinical Pharmacist', category: 'Pharmacy' },
  { value: 'Pharmacy Assistant', label: 'Pharmacy Assistant', category: 'Pharmacy' },
  { value: 'Pharmacy Technician', label: 'Pharmacy Technician', category: 'Pharmacy' },
  
  // Administration & HR
  { value: 'General Manager', label: 'General Manager (GM)', category: 'Admin' },
  { value: 'Branch Manager', label: 'Branch Manager', category: 'Admin' },
  { value: 'Office Manager', label: 'Office Manager', category: 'Admin' },
  { value: 'Admin Executive', label: 'Admin Executive', category: 'Admin' },
  { value: 'HR Manager', label: 'HR Manager', category: 'Admin' },
  { value: 'HR Executive', label: 'HR Executive', category: 'Admin' },
  { value: 'Office Assistant', label: 'Office Assistant', category: 'Admin' },
  { value: 'Receptionist', label: 'Receptionist', category: 'Admin' },
  
  // IT & Technology
  { value: 'IT Manager', label: 'IT Manager', category: 'IT' },
  { value: 'System Administrator', label: 'System Administrator', category: 'IT' },
  { value: 'Software Developer', label: 'Software Developer', category: 'IT' },
  { value: 'Data Entry Operator', label: 'Data Entry Operator', category: 'IT' },
  
  // Executive Leadership
  { value: 'Managing Director', label: 'Managing Director (MD)', category: 'Leadership' },
  { value: 'Chief Executive Officer', label: 'Chief Executive Officer (CEO)', category: 'Leadership' },
  { value: 'Chief Operating Officer', label: 'Chief Operating Officer (COO)', category: 'Leadership' },
  { value: 'Director', label: 'Director', category: 'Leadership' },
  { value: 'Vice President', label: 'Vice President', category: 'Leadership' },
];

// ============================================
// DEPARTMENTS
// ============================================
export const PHARMA_DEPARTMENTS = [
  // Core Operations
  { value: 'Sales & Marketing', label: 'Sales & Marketing', description: 'Field force, institutional sales, retail sales' },
  { value: 'Purchase & Procurement', label: 'Purchase & Procurement', description: 'Vendor management, order placement' },
  { value: 'Warehouse & Logistics', label: 'Warehouse & Logistics', description: 'Inventory, storage, distribution' },
  { value: 'Accounts & Finance', label: 'Accounts & Finance', description: 'Billing, payments, financial reporting' },
  
  // Pharmacy Operations
  { value: 'Pharmacy', label: 'Pharmacy', description: 'Dispensing, patient counseling, prescription verification' },
  { value: 'Retail Operations', label: 'Retail Operations', description: 'Counter sales, customer service' },
  
  // Quality & Compliance
  { value: 'Quality Control', label: 'Quality Control (QC)', description: 'Drug quality testing, sampling' },
  { value: 'Quality Assurance', label: 'Quality Assurance (QA)', description: 'Process compliance, audits' },
  { value: 'Regulatory Affairs', label: 'Regulatory Affairs', description: 'Drug licenses, compliance, documentation' },
  
  // Support Functions
  { value: 'Administration', label: 'Administration', description: 'Office management, facilities' },
  { value: 'Human Resources', label: 'Human Resources (HR)', description: 'Recruitment, training, payroll' },
  { value: 'Information Technology', label: 'Information Technology (IT)', description: 'Systems, software, data management' },
  
  // Strategic
  { value: 'Business Development', label: 'Business Development', description: 'New products, market expansion' },
  { value: 'Customer Service', label: 'Customer Service', description: 'Queries, complaints, support' },
  { value: 'Management', label: 'Management', description: 'Executive leadership, strategy' },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get designations grouped by category
 */
export const getDesignationsByCategory = () => {
  const grouped = {};
  PHARMA_DESIGNATIONS.forEach(designation => {
    if (!grouped[designation.category]) {
      grouped[designation.category] = [];
    }
    grouped[designation.category].push(designation);
  });
  return grouped;
};

/**
 * Get only Medical Representative related designations
 */
export const getMedicalRepDesignations = () => {
  return PHARMA_DESIGNATIONS.filter(d => 
    d.value.toLowerCase().includes('medical representative') ||
    d.value.toLowerCase().includes('sales manager') ||
    d.value.toLowerCase().includes('sales executive') ||
    d.category === 'Sales'
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
