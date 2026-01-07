/**
 * User Model
 * Defines the structure of User objects in the system
 */

export interface UserPermissions {
    modules?: string[];
    [key: string]: any;
}

export interface User {
    // Identifiers
    id?: number | string;
    user_id?: number | string;
    employee_id?: string;

    // Profile
    username: string;
    email?: string;
    full_name?: string;
    fullName?: string; // Common alias
    name?: string;     // Common alias
    phone?: string;
    department?: string;

    // Access
    role: string;
    role_id?: string;
    is_active?: boolean;
    status?: string; // Sometimes mapped from is_active

    // Timestamps
    created_at?: string;
    createdAt?: string;
    updated_at?: string;
    last_login_at?: string;
    last_login?: string;
    lastLogin?: string; // Alias

    // Permissions
    permissions?: UserPermissions;
    modules?: string[];

    // UI/App specific flags
    can_view_reports?: boolean;
    can_modify_prices?: boolean;
    can_approve_discounts?: boolean;
    discount_limit_percent?: number;

    // Allow index access - REMOVED for strict typing
    // [key: string]: any;
}
