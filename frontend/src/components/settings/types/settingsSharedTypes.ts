/**
 * Settings Shared Types
 */

// Form state types
export interface FormState {
    isEditing: boolean;
    isSaving: boolean;
    isDirty: boolean;
    error: string | null;
}

// Company profile
export interface CompanyProfile {
    id?: number;
    name: string;
    legal_name?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    website?: string;
    logo_url?: string;
    industry_type?: string;
    registration_date?: string;
}

// Employee types
export interface Employee {
    id?: number;
    employee_id?: string;
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
    department?: string;
    designation?: string;
    branch_id?: number;
    branch_name?: string;
    date_of_joining?: string;
    status?: 'active' | 'inactive';
    role?: string;
    salary?: number;
    address?: string;
    emergency_contact?: string;
    documents?: EmployeeDocument[];
}

export interface EmployeeDocument {
    id?: number;
    document_type: string;
    file_name: string;
    file_url: string;
    uploaded_at?: string;
}

export interface Department {
    id: number;
    name: string;
    description?: string;
}

export interface Branch {
    id: number;
    name: string;
    address?: string;
}

// Feature flags
export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description?: string;
    category?: string;
}

export interface SettingsCategory {
    id: string;
    name: string;
    description: string;
    icon: string;
}
