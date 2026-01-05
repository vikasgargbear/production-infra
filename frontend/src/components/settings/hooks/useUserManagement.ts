/**
 * useUserManagement Hook
 * 
 * Extracts state management and CRUD operations from UserManagement.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../../services/api';
import { toast } from 'react-toastify';

// ============================================
// Type Definitions
// ============================================

export interface User {
    user_id: number;
    username: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    last_login?: string;
    phone?: string;
    department?: string;
}

export interface UserFormData {
    username: string;
    email: string;
    full_name: string;
    password: string;
    confirm_password: string;
    role: string;
    is_active: boolean;
    phone?: string;
    department?: string;
}

// ============================================
// Default Values
// ============================================

const getInitialFormData = (): UserFormData => ({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: '',
    role: 'Staff',
    is_active: true,
    phone: '',
    department: ''
});

// ============================================
// Hook Implementation
// ============================================

export function useUserManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter/Search
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<UserFormData>(getInitialFormData());
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // ============================================
    // Computed Values
    // ============================================

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = !searchTerm ||
                user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesRole = !roleFilter || user.role === roleFilter;

            return matchesSearch && matchesRole;
        });
    }, [users, searchTerm, roleFilter]);

    const activeUsersCount = useMemo(() =>
        users.filter(u => u.is_active).length,
        [users]
    );

    const roles = ['Admin', 'Manager', 'Staff', 'Accountant', 'Pharmacist', 'Salesperson'];

    // ============================================
    // API Actions
    // ============================================

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiClient.get('/users/', { timeout: 10000 });
            if (response.data) {
                setUsers(response.data.data || response.data || []);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch users');
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
        setFormErrors({});
    }, []);

    const handleOpenModal = useCallback((user: User | null = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                password: '',
                confirm_password: '',
                role: user.role,
                is_active: user.is_active,
                phone: user.phone || '',
                department: user.department || ''
            });
        } else {
            resetForm();
            setEditingUser(null);
        }
        setShowModal(true);
    }, [resetForm]);

    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        setEditingUser(null);
        resetForm();
    }, [resetForm]);

    const updateFormField = useCallback((field: keyof UserFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: '' }));
        }
    }, [formErrors]);

    const validateForm = useCallback((): boolean => {
        const errors: Record<string, string> = {};

        if (!formData.username.trim()) {
            errors.username = 'Username is required';
        }

        if (!formData.email.trim()) {
            errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Invalid email format';
        }

        if (!formData.full_name.trim()) {
            errors.full_name = 'Full name is required';
        }

        if (!editingUser && !formData.password) {
            errors.password = 'Password is required';
        }

        if (formData.password && formData.password !== formData.confirm_password) {
            errors.confirm_password = 'Passwords do not match';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    }, [formData, editingUser]);

    // ============================================
    // CRUD Operations
    // ============================================

    const handleSave = useCallback(async () => {
        if (!validateForm()) {
            toast.error('Please fix the errors');
            return false;
        }

        setLoading(true);
        try {
            const payload = {
                username: formData.username,
                email: formData.email,
                full_name: formData.full_name,
                role: formData.role,
                is_active: formData.is_active,
                phone: formData.phone || undefined,
                department: formData.department || undefined,
                ...(formData.password ? { password: formData.password } : {})
            };

            let response;
            if (editingUser) {
                response = await apiClient.put(`/users/${editingUser.user_id}`, payload);
            } else {
                response = await apiClient.post('/users/', payload);
            }

            if (response.data) {
                toast.success(editingUser ? 'User updated!' : 'User created!');
                handleCloseModal();
                fetchUsers();
                return true;
            }
            return false;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to save user');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, editingUser, validateForm, handleCloseModal, fetchUsers]);

    const handleDelete = useCallback(async (user: User) => {
        if (!window.confirm(`Delete user ${user.username}?`)) {
            return false;
        }

        setLoading(true);
        try {
            await apiClient.delete(`/users/${user.user_id}`);
            toast.success('User deleted');
            fetchUsers();
            return true;
        } catch (err) {
            toast.error('Failed to delete user');
            return false;
        } finally {
            setLoading(false);
        }
    }, [fetchUsers]);

    const toggleUserStatus = useCallback(async (user: User) => {
        try {
            await apiClient.put(`/users/${user.user_id}`, {
                is_active: !user.is_active
            });
            toast.success(user.is_active ? 'User deactivated' : 'User activated');
            fetchUsers();
        } catch (err) {
            toast.error('Failed to update user status');
        }
    }, [fetchUsers]);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        users,
        filteredUsers,
        loading,
        error,
        activeUsersCount,
        roles,

        // Filters
        searchTerm,
        setSearchTerm,
        roleFilter,
        setRoleFilter,

        // Modal
        showModal,
        editingUser,
        formData,
        formErrors,
        handleOpenModal,
        handleCloseModal,
        updateFormField,

        // CRUD
        handleSave,
        handleDelete,
        toggleUserStatus,
        fetchUsers
    };
}

export default useUserManagement;
