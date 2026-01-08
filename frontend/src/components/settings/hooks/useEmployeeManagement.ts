/**
 * useEmployeeManagement Hook
 * 
 * Extracts state management, data fetching, and CRUD operations from EmployeeManagement.tsx
 * Reduces EmployeeManagement.tsx from 1,008 lines to ~500 lines (UI only)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { employeesApi, apiClient } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface Employee {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    designation: string;
    department_id?: number;
    branch_id?: number;
    date_of_joining: string;
    is_active: boolean;
    personal_details?: PersonalDetails;
    emergency_contact?: EmergencyContact;
    bank_account_details?: BankDetails;
}

export interface PersonalDetails {
    gender?: string;
    date_of_birth?: string;
    mobile?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    aadhar_number?: string;
    pan_number?: string;
}

export interface EmergencyContact {
    name?: string;
    relationship?: string;
    phone?: string;
}

export interface BankDetails {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
}

export interface EmployeeFormData {
    employee_name: string;
    employee_code: string;
    gender: string;
    date_of_birth: string;
    mobile: string;
    email: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    designation: string;
    department_id: number | null;
    branch_id: number | null;
    date_of_joining: string;
    aadhar_number: string;
    pan_number: string;
    bank_name: string;
    bank_account_number: string;
    bank_ifsc_code: string;
    emergency_contact_name: string;
    emergency_contact_relationship: string;
    emergency_contact_phone: string;
    is_active: boolean;
}

export interface Department {
    department_id: number;
    department_name: string;
}

export interface Branch {
    branch_id: number;
    branch_name: string;
}

// ============================================
// Default Values
// ============================================

const defaultFormData: EmployeeFormData = {
    employee_name: '',
    employee_code: '',
    gender: '',
    date_of_birth: '',
    mobile: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    designation: '',
    department_id: null,
    branch_id: null,
    date_of_joining: new Date().toISOString().split('T')[0],
    aadhar_number: '',
    pan_number: '',
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    is_active: true
};

// ============================================
// Hook Implementation
// ============================================

export function useEmployeeManagement() {
    // Core State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [designationFilter, setDesignationFilter] = useState('');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [formData, setFormData] = useState<EmployeeFormData>(defaultFormData);

    // File Uploads
    const [aadharFile, setAadharFile] = useState<File | null>(null);
    const [panFile, setPanFile] = useState<File | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);

    // ============================================
    // Computed Values
    // ============================================

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = !searchTerm ||
                emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.designation?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesDesignation = !designationFilter ||
                emp.designation === designationFilter;

            return matchesSearch && matchesDesignation;
        });
    }, [employees, searchTerm, designationFilter]);

    const activeEmployeesCount = useMemo(() =>
        employees.filter(e => e.is_active).length,
        [employees]
    );

    // ============================================
    // API Actions
    // ============================================

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const response = await employeesApi.getAll({ limit: 100 });
            if (response?.data || response) {
                setEmployees(response.data || response || []);
            } else {
                toast.error('Failed to load employees');
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            toast.error('Failed to load employees');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDepartments = useCallback(async () => {
        try {
            const response = await apiClient.get('/departments/', { timeout: 5000 });
            if (response.data) {
                setDepartments(response.data.data || response.data || []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
            setDepartments([]);
        }
    }, []);

    const loadBranches = useCallback(async () => {
        try {
            const response = await apiClient.get('/branches/', { timeout: 5000 });
            if (response.data) {
                setBranches(response.data.data || response.data || []);
            }
        } catch (error) {
            console.error('Error loading branches:', error);
            setBranches([]);
        }
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const resetForm = useCallback(() => {
        setFormData(defaultFormData);
        setAadharFile(null);
        setPanFile(null);
        setPhotoFile(null);
    }, []);

    const handleOpenModal = useCallback((employee: Employee | null = null) => {
        if (employee) {
            setEditingEmployee(employee);

            const emergencyContact = employee.emergency_contact || {};
            const bankDetails = employee.bank_account_details || {};
            const personalDetails = employee.personal_details || {};

            setFormData({
                employee_name: employee.employee_name || '',
                employee_code: employee.employee_code || '',
                gender: personalDetails.gender || '',
                date_of_birth: personalDetails.date_of_birth || '',
                mobile: personalDetails.mobile || '',
                email: personalDetails.email || '',
                address: personalDetails.address || '',
                city: personalDetails.city || '',
                state: personalDetails.state || '',
                pincode: personalDetails.pincode || '',
                designation: employee.designation || '',
                department_id: employee.department_id || null,
                branch_id: employee.branch_id || null,
                date_of_joining: employee.date_of_joining || new Date().toISOString().split('T')[0],
                aadhar_number: personalDetails.aadhar_number || '',
                pan_number: personalDetails.pan_number || '',
                bank_name: bankDetails.bank_name || '',
                bank_account_number: bankDetails.account_number || '',
                bank_ifsc_code: bankDetails.ifsc_code || '',
                emergency_contact_name: emergencyContact.name || '',
                emergency_contact_relationship: emergencyContact.relationship || '',
                emergency_contact_phone: emergencyContact.phone || '',
                is_active: employee.is_active !== false
            });
        } else {
            resetForm();
            setEditingEmployee(null);
        }
        setShowModal(true);
    }, [resetForm]);

    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        setEditingEmployee(null);
        resetForm();
    }, [resetForm]);

    const updateFormField = useCallback((field: keyof EmployeeFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleFileChange = useCallback((file: File | null, fileType: 'aadhar' | 'pan' | 'photo') => {
        switch (fileType) {
            case 'aadhar':
                setAadharFile(file);
                break;
            case 'pan':
                setPanFile(file);
                break;
            case 'photo':
                setPhotoFile(file);
                break;
        }
    }, []);

    // ============================================
    // CRUD Operations
    // ============================================

    const handleSave = useCallback(async () => {
        if (!formData.employee_name || !formData.designation) {
            toast.error('Name and designation are required');
            return false;
        }

        setLoading(true);
        try {
            const payload = {
                employee_name: formData.employee_name,
                employee_code: formData.employee_code || undefined,
                designation: formData.designation,
                department_id: formData.department_id || undefined,
                branch_id: formData.branch_id || undefined,
                date_of_joining: formData.date_of_joining,
                is_active: formData.is_active,
                personal_details: {
                    gender: formData.gender || undefined,
                    date_of_birth: formData.date_of_birth || undefined,
                    mobile: formData.mobile || undefined,
                    email: formData.email || undefined,
                    address: formData.address || undefined,
                    city: formData.city || undefined,
                    state: formData.state || undefined,
                    pincode: formData.pincode || undefined,
                    aadhar_number: formData.aadhar_number || undefined,
                    pan_number: formData.pan_number || undefined
                },
                emergency_contact: {
                    name: formData.emergency_contact_name || undefined,
                    relationship: formData.emergency_contact_relationship || undefined,
                    phone: formData.emergency_contact_phone || undefined
                },
                bank_account_details: {
                    bank_name: formData.bank_name || undefined,
                    account_number: formData.bank_account_number || undefined,
                    ifsc_code: formData.bank_ifsc_code || undefined
                }
            };

            let response;
            if (editingEmployee) {
                response = await employeesApi.update(editingEmployee.employee_id, payload);
            } else {
                response = await employeesApi.create(payload);
            }

            if (response?.data || response) {
                toast.success(editingEmployee ? 'Employee updated!' : 'Employee created!');
                handleCloseModal();
                loadEmployees();
                return true;
            } else {
                toast.error(response.error?.message || 'Failed to save employee');
                return false;
            }
        } catch (error: any) {
            console.error('Error saving employee:', error);
            toast.error(error.message || 'Failed to save employee');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, editingEmployee, handleCloseModal, loadEmployees]);

    const handleDelete = useCallback(async (employee: Employee) => {
        if (!window.confirm(`Delete ${employee.employee_name}?`)) {
            return false;
        }

        setLoading(true);
        try {
            const response = await employeesApi.delete(employee.employee_id);
            if (response?.data?.success !== false) {
                toast.success('Employee deleted');
                loadEmployees();
                return true;
            } else {
                toast.error('Failed to delete employee');
                return false;
            }
        } catch (error) {
            console.error('Error deleting employee:', error);
            toast.error('Failed to delete employee');
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadEmployees]);

    const toggleEmployeeStatus = useCallback(async (employee: Employee) => {
        try {
            const response = await employeesApi.update(employee.employee_id, {
                is_active: !employee.is_active
            });
            if (response?.data?.success !== false) {
                toast.success(employee.is_active ? 'Employee deactivated' : 'Employee activated');
                loadEmployees();
            }
        } catch (error) {
            toast.error('Failed to update employee status');
        }
    }, [loadEmployees]);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        loadEmployees();
        loadDepartments();
        loadBranches();
    }, [loadEmployees, loadDepartments, loadBranches]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        employees,
        filteredEmployees,
        departments,
        branches,
        loading,
        activeEmployeesCount,

        // Filters
        searchTerm,
        setSearchTerm,
        designationFilter,
        setDesignationFilter,

        // Modal
        showModal,
        editingEmployee,
        formData,
        handleOpenModal,
        handleCloseModal,
        updateFormField,

        // Files
        aadharFile,
        panFile,
        photoFile,
        handleFileChange,

        // CRUD
        handleSave,
        handleDelete,
        toggleEmployeeStatus,

        // Refresh
        loadEmployees
    };
}

export default useEmployeeManagement;
