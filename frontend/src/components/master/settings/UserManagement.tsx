import React, { useState, useEffect } from 'react';
import {
  UserCheck, Search, Plus, Edit2, Trash2,
  Save, X, Shield, Clock, Key,
  Eye, EyeOff, Lock, Unlock, Loader2, AlertCircle, Check
} from 'lucide-react';
import { usersApi, roleManagementApi } from '../../../services/api';
import {
  MODULE_INFO,
} from '../../../config/userRoles.config';
import { User } from '../../../types/models/user';
import type { Role } from '../../../types/api.types';
import {
  clearErpSessionStorage,
  getErpAccessToken,
} from '../../../services/auth/erpSessionStorage';

interface UserManagementProps {
  open: boolean;
  onClose: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // User data
  const [users, setUsers] = useState<User[]>([]);

  // DB roles from backend
  const [dbRoles, setDbRoles] = useState<Role[]>([]);

  // Load users on component mount
  useEffect(() => {
    if (open) {
      checkCurrentUserPermissions();
      loadUsers();
      loadDbRoles();
    }
  }, [open]);

  // Fetch roles from the database
  const loadDbRoles = async () => {
    try {
      const response = await roleManagementApi.getAll();
      const data = response?.data?.data || response?.data || [];
      setDbRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load roles from DB, using fallback');
    }
  };

  // Check current user's permissions
  const checkCurrentUserPermissions = () => {
    try {
      const token = getErpAccessToken();
      if (token) {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          setCurrentUserRole(payload.role || payload.role_id);

          // Check if user has admin/owner role
          const userRole = payload.role || payload.role_id;
          if (!['admin', 'owner', 'administrator'].includes(userRole?.toLowerCase())) {
          }
        }
      }
    } catch (e) {
    }
  };

  // Load users from backend
  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = getErpAccessToken();

      if (!token) {
        setError('You are not logged in. Please login to manage users.');
        setIsLoading(false);
        return;
      }

      // Validate token format and expiry
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          const expiry = payload.exp * 1000;
          const now = Date.now();

          if (now > expiry) {
            setError('Session expired. Please login again.');
            clearErpSessionStorage();
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Token parsing error:', e);
      }


      const response = await usersApi.getAll();

      // Handle different response formats
      let userData: any[] = [];

      // The API returns response.data which contains another data field
      if (response?.data?.data) {
        userData = response.data.data;
      } else if (response?.data && Array.isArray(response.data)) {
        userData = response.data;
      } else if (Array.isArray(response)) {
        userData = response;
      } else {
        setError('No user data available');
        setUsers([]);
        return;
      }

      // Map API response to component format - works with both users and org_users tables
      const transformedUsers = userData.map(user => ({
        // Handle both table structures
        id: user.user_id || user.id,
        username: user.username || user.email?.split('@')[0] || user.employee_id || 'user',
        fullName: user.full_name || user.fullName || user.name || 'Unknown User',
        email: user.email,
        role: user.role || 'billing',
        status: user.is_active !== undefined ? (user.is_active ? 'active' : 'inactive') : 'active',
        lastLogin: user.last_login_at || user.last_login || user.lastLogin
          ? new Date(user.last_login_at || user.last_login || user.lastLogin).toLocaleString()
          : 'Not yet',
        createdDate: user.created_at || user.createdAt
          ? new Date(user.created_at || user.createdAt).toLocaleDateString()
          : 'Unknown',
        modules: user.permissions?.modules || user.modules || [],
        permissions: user.permissions || {}
      }));

      setUsers(transformedUsers);
    } catch (error: any) {

      // Detailed error handling
      if (error.response) {

        if (error.response.status === 401) {
          setError('Authentication failed. Your session may have expired. Please login again.');
        } else if (error.response.status === 403) {
          setError('Access denied. You do not have permission to view users.');
        } else if (error.response.status === 500) {
          setError('Server error. Please contact support if this persists.');
        } else {
          setError(`Failed to load users: ${error.response.data?.detail || error.response.data?.message || 'Unknown error'}`);
        }
      } else if (error.request) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(`Error: ${error.message}`);
      }

      setUsers([]);

      // Show user-friendly error message
      setTimeout(() => setError(null), 15000);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  // Build role options from DB roles (with "All" filter option)
  const roles = [
    { value: 'all', label: 'All Roles', color: 'gray', role_id: 0 },
    ...dbRoles.map(r => ({
      value: r.role_code,
      label: r.role_name,
      color: r.is_system_role ? 'blue' : 'purple',
      role_id: r.role_id
    }))
  ];

  const modules = Object.entries(MODULE_INFO).map(([id, info]) => ({
    id,
    name: info.name,
    icon: info.icon,
    color: info.color
  }));

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'billing',
    status: 'active',
    modules: [] as string[],
    permissions: {} as Record<string, any>,
    sendInviteEmail: true,
    phone: '' // Added missing field
  });

  const filteredUsers = users.filter((user: User) => {
    const matchesSearch = (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleModuleToggle = (moduleId: string) => {
    setFormData(prev => {
      const newModules = prev.modules.includes(moduleId)
        ? prev.modules.filter(m => m !== moduleId)
        : [...prev.modules, moduleId];

      // Initialize permissions for the module if not exists
      if (!prev.permissions[moduleId]) {
        return {
          ...prev,
          modules: newModules,
          permissions: {
            ...prev.permissions,
            [moduleId]: { create: false, edit: false, delete: false, view: true }
          }
        };
      }

      return { ...prev, modules: newModules };
    });
  };

  const handlePermissionChange = (moduleId: string, permission: string, value: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleId]: {
          ...prev.permissions[moduleId],
          [permission]: value
        }
      }
    }));
  };

  const handleRoleChange = (roleCode: string) => {
    const dbRole = dbRoles.find(r => r.role_code === roleCode);

    if (dbRole) {
      const perms = dbRole.permissions && typeof dbRole.permissions === 'object' && 'all' in dbRole.permissions
        ? {} // admin — show all modules with full access
        : (dbRole.permissions || {});
      setFormData(prev => ({
        ...prev,
        role: roleCode,
        modules: dbRole.allowed_modules || [],
        permissions: perms as Record<string, any>
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        role: roleCode,
        modules: [],
        permissions: {}
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only validate password match if password is provided
    if (!editingUser && formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match!');
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Prepare data for both table structures
      const selectedDbRole = dbRoles.find(r => r.role_code === formData.role);
      const userData: Partial<User> & { password?: string; send_invite_email?: boolean; role_id?: number } = {
        // Common fields
        email: formData.email,
        role: formData.role,
        ...(selectedDbRole ? { role_id: selectedDbRole.role_id } : {}),

        // org_users fields
        full_name: formData.fullName,
        is_active: formData.status === 'active',

        // Basic user fields
        username: formData.username,
        employee_id: formData.username, // Use username as employee_id
        phone: formData.phone || '',
        department: 'General',
        can_view_reports: formData.role === 'admin' || formData.role === 'manager',
        can_modify_prices: formData.role === 'admin' || formData.role === 'manager',
        can_approve_discounts: formData.role === 'admin',
        discount_limit_percent: formData.role === 'admin' ? 100 : (formData.role === 'manager' ? 20 : 0)
      };

      if (!editingUser) {
        userData.password = formData.password;
        userData.send_invite_email = formData.sendInviteEmail;
      }

      if (editingUser && editingUser.id) {
        // Update existing user
        await usersApi.update(editingUser.id, userData as any);
        setSuccessMessage('User updated successfully!');
      } else {
        // Add new user
        await usersApi.create(userData as any);
        setSuccessMessage('User created successfully!');
      }

      // Reload users
      await loadUsers();

      // Show success message
      setTimeout(() => setSuccessMessage(''), 3000);

      handleCloseModal();
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to save user. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    // Try to find the DB role for this user to pre-populate permissions preview
    const userDbRole = dbRoles.find(r => r.role_code === user.role);
    const isAdminAll = userDbRole?.permissions && typeof userDbRole.permissions === 'object' && 'all' in userDbRole.permissions;
    setFormData({
      username: user.username || '',
      fullName: user.fullName || '',
      email: user.email || '',
      password: '',
      confirmPassword: '',
      role: user.role,
      status: user.status || 'active',
      modules: userDbRole?.allowed_modules || user.modules || [],
      permissions: isAdminAll ? {} : ((userDbRole?.permissions || user.permissions || {}) as Record<string, any>),
      phone: user.phone || '',
      sendInviteEmail: false
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: number | string | undefined) => {
    if (!id) return;
    if (window.confirm('Are you sure you want to delete this user?')) {
      setIsSaving(true);
      setError(null);
      try {
        await usersApi.delete(id);
        setSuccessMessage('User deleted successfully!');
        await loadUsers();
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        setError('Failed to delete user. Please try again.');
        setTimeout(() => setError(null), 5000);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleStatusToggle = async (userId: string | number | undefined) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    setIsSaving(true);
    setError(null);
    try {
      const updatePayload: any = {
        is_active: user.status === 'inactive'
      };
      if (userId === undefined) return;
      await usersApi.update(userId, updatePayload);

      await loadUsers();
      setSuccessMessage('User status updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setError('Failed to update user status.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!user || user.status === 'inactive') return;

    if (window.confirm(`Are you sure you want to reset password for ${user.fullName || user.username}?`)) {
      setIsSaving(true);
      setError(null);
      try {
        // API expects email for reset password
        if (user.email) {
          await usersApi.resetPassword(user.email);
          setSuccessMessage('Password reset link sent to user email!');
          setTimeout(() => setSuccessMessage(''), 5000);
        } else {
          setError('User does not have an email address.');
        }
      } catch (error: any) {
        setError('Failed to reset password.');
        setTimeout(() => setError(null), 5000);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingUser(null);
    setFormData({
      username: '',
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'billing',
      status: 'active',
      modules: [] as string[],
      permissions: {} as Record<string, any>,
      sendInviteEmail: true,
      phone: ''
    });
    setShowPassword(false);
  };

  const getRoleColor = (role: string) => {
    const roleConfig = roles.find(r => r.value === role);
    return roleConfig?.color || 'gray';
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <UserCheck className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <span className="text-sm text-gray-500">({users.length} users)</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Clock className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {/* Removed demo mode banner as it's no longer used */}

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
            {error.includes('not logged in') && (
              <button
                onClick={() => window.location.href = '/login'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Go to Login
              </button>
            )}
          </div>
        </div>
      )}
      {successMessage && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <Check className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by username, name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {roles.map(role => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first user.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First User
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modules</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => {
                    const roleColor = getRoleColor(user.role);
                    return (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                            <p className="text-xs text-gray-500">@{user.username}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${roleColor}-100 text-${roleColor}-800`}>
                            <Shield className="w-3 h-3 mr-1" />
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleStatusToggle(user.id)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${user.status === 'active'
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                          >
                            {user.status === 'active' ? (
                              <>
                                <Unlock className="w-3 h-3 mr-1" />
                                Active
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3 mr-1" />
                                Inactive
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(user.modules || []).slice(0, 3).map(moduleId => {
                              const module = modules.find(m => m.id === moduleId);
                              return module ? (
                                <span key={moduleId} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                  {module.icon} {module.name}
                                </span>
                              ) : null;
                            })}
                            {(user.modules || []).length > 3 && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                +{(user.modules || []).length - 3} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-sm text-gray-900">
                            <Clock className="w-3 h-3 mr-1 text-gray-400" />
                            {user.lastLogin}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(user)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit User"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user)}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                              title="Reset Password"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {/* Error message in modal */}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <span className="text-red-800">{error}</span>
                </div>
              )}

              <div className="space-y-6">
                {/* Basic Details */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Basic Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        disabled={!!editingUser}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={formData.role}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {roles.slice(1).map(role => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Password Section (only for new users) - OPTIONAL for Google users */}
                {!editingUser && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Key className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-semibold text-gray-900">Password</h3>
                      <span className="text-xs text-gray-400">(Optional)</span>
                    </div>

                    {/* Info box about Google login */}
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 flex items-start gap-2">
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" />
                        <path d="M12 8v4M12 16h.01" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <div className="text-xs text-blue-700">
                        <strong>Password is optional.</strong> If the user has a Google account (Gmail), they can use "Sign in with Google" instead.
                        Only set a password if you want to allow email/password login.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={formData.password}
                            onChange={(e) => handleInputChange('password', e.target.value)}
                            placeholder="Leave blank for Google-only login"
                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {formData.password && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm Password
                          </label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={formData.confirmPassword}
                            onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Role Permissions Preview (Read-Only) - Clean Compact Design */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Role Permissions</h3>
                    <span className="ml-auto text-xs text-gray-400 italic">Read-only</span>
                  </div>

                  {(() => {
                    const dbRole = dbRoles.find(r => r.role_code === formData.role);
                    const isAdminAll = dbRole?.permissions && typeof dbRole.permissions === 'object' && 'all' in dbRole.permissions;
                    const roleModules = dbRole?.allowed_modules || formData.modules || [];
                    const rolePermissions = isAdminAll
                      ? Object.fromEntries(roleModules.map(m => [m, { view: true, create: true, edit: true, delete: true }]))
                      : ((dbRole?.permissions || formData.permissions || {}) as Record<string, any>);

                    return (
                      <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Compact table layout */}
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-100/80">
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Module</th>
                              <th className="text-center px-2 py-2 font-medium text-gray-600 w-12">View</th>
                              <th className="text-center px-2 py-2 font-medium text-gray-600 w-14">Create</th>
                              <th className="text-center px-2 py-2 font-medium text-gray-600 w-12">Edit</th>
                              <th className="text-center px-2 py-2 font-medium text-gray-600 w-14">Delete</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {roleModules.map(moduleId => {
                              const module = modules.find(m => m.id === moduleId);
                              if (!module) return null;
                              const perms = (rolePermissions[moduleId] || {}) as any;

                              return (
                                <tr key={moduleId} className="hover:bg-blue-50/30">
                                  <td className="px-3 py-2 font-medium text-gray-700">
                                    <span className="mr-1.5">{module.icon}</span>
                                    {module.name}
                                  </td>
                                  <td className="text-center px-2 py-2">
                                    {perms.view ? <span className="text-green-600">✓</span> : <span className="text-gray-300">–</span>}
                                  </td>
                                  <td className="text-center px-2 py-2">
                                    {perms.create ? <span className="text-green-600">✓</span> : <span className="text-gray-300">–</span>}
                                  </td>
                                  <td className="text-center px-2 py-2">
                                    {perms.edit ? <span className="text-green-600">✓</span> : <span className="text-gray-300">–</span>}
                                  </td>
                                  <td className="text-center px-2 py-2">
                                    {perms.delete ? <span className="text-green-600">✓</span> : <span className="text-gray-300">–</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {roleModules.length === 0 && (
                          <div className="px-4 py-3 text-center text-gray-400 text-xs">
                            No modules assigned to this role
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Send Invite Email Option */}
                {!editingUser && (
                  <div className="border-t border-gray-200 pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sendInviteEmail || false}
                        onChange={(e) => handleInputChange('sendInviteEmail', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Send invite email to user</span>
                        <p className="text-xs text-gray-500">User will receive an email with login instructions</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingUser ? 'Update User' : 'Create User'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
