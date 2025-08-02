import React, { useState, useEffect } from 'react';
import { 
  UserCheck, Search, Plus, Edit2, Trash2, 
  Save, X, Shield, Clock, Key,
  Eye, EyeOff, Lock, Unlock, Loader2, AlertCircle, Check
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';
import { 
  USER_ROLES, 
  MODULES, 
  MODULE_INFO, 
  ROLE_INFO, 
  getRoleDefaults 
} from '../../config/userRoles.config';

const UserManagement = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // User data
  const [users, setUsers] = useState([]);

  // Load users on component mount
  useEffect(() => {
    console.log('UserManagement useEffect - open:', open);
    if (open) {
      loadUsers();
    }
  }, [open]);

  // Load users from backend
  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Calling API to load users...');
      const response = await settingsApi.users.getAll();
      console.log('📥 Users API Response:', response);
      console.log('📥 Response type:', typeof response);
      console.log('📥 Response keys:', response ? Object.keys(response) : 'null response');
      
      // Handle different response formats
      let userData = [];
      
      // The API returns response.data which contains another data field
      if (response?.data?.data) {
        console.log('📥 Found users in response.data.data:', response.data.data);
        userData = response.data.data;
      } else if (response?.data && Array.isArray(response.data)) {
        console.log('📥 Found users in response.data:', response.data);
        userData = response.data;
      } else if (Array.isArray(response)) {
        console.log('📥 Found users in response:', response);
        userData = response;
      } else {
        console.log('⚠️ Unexpected response format:', response);
      }
      
      // Map API response to component format - works with both users and org_users tables
      userData = userData.map(user => ({
        // Handle both table structures
        id: user.user_id || user.id,
        username: user.username || user.email?.split('@')[0] || user.employee_id || 'user',
        fullName: user.full_name || user.fullName || user.name || 'Unknown User',
        email: user.email,
        role: user.role || 'billing',
        status: user.is_active !== undefined ? (user.is_active ? 'active' : 'inactive') : 'active',
        lastLogin: user.last_login_at || user.last_login || user.lastLogin 
          ? new Date(user.last_login_at || user.last_login || user.lastLogin).toLocaleString() 
          : 'Never',
        createdDate: user.created_at || user.createdAt 
          ? new Date(user.created_at || user.createdAt).toLocaleDateString() 
          : 'Unknown',
        modules: user.permissions?.modules || user.modules || [],
        permissions: user.permissions || {},
        // Additional org_users fields
        department: user.department,
        canViewReports: user.can_view_reports,
        canModifyPrices: user.can_modify_prices,
        canApproveDiscounts: user.can_approve_discounts,
        discountLimit: user.discount_limit_percent
      }));
      
      setUsers(userData);
      setIsDemoMode(false);
    } catch (error) {
      console.error('Error loading users:', error);
      
      // Check if it's a database/backend error
      console.log('Error status:', error.response?.status);
      if (error.response?.status === 500 || error.response?.status === 404 || error.code === 'ERR_BAD_RESPONSE') {
        console.log('Activating demo mode...');
        setError('User management is currently unavailable. Using demo mode.');
        setIsDemoMode(true);
        
        // Use mock data when backend fails
        const mockUsers = [
          {
            id: 1,
            username: 'admin',
            fullName: 'Administrator',
            email: 'admin@pharmaerp.com',
            role: 'admin',
            status: 'active',
            lastLogin: new Date().toLocaleString(),
            createdDate: '2024-01-01',
            modules: Object.values(MODULES),
            permissions: getRoleDefaults('admin').permissions,
            department: 'Management',
            canViewReports: true,
            canModifyPrices: true,
            canApproveDiscounts: true,
            discountLimit: 100
          },
          {
            id: 2,
            username: 'manager_demo',
            fullName: 'Demo Manager',
            email: 'manager@pharmaerp.com',
            role: 'manager',
            status: 'active',
            lastLogin: 'Yesterday',
            createdDate: '2024-06-15',
            modules: getRoleDefaults('manager').modules,
            permissions: getRoleDefaults('manager').permissions,
            department: 'Sales',
            canViewReports: true,
            canModifyPrices: true,
            canApproveDiscounts: true,
            discountLimit: 20
          },
          {
            id: 3,
            username: 'billing_demo',
            fullName: 'Demo Billing Staff',
            email: 'billing@pharmaerp.com',
            role: 'billing',
            status: 'active',
            lastLogin: '2 hours ago',
            createdDate: '2024-07-01',
            modules: getRoleDefaults('billing').modules,
            permissions: getRoleDefaults('billing').permissions,
            department: 'Billing',
            canViewReports: false,
            canModifyPrices: false,
            canApproveDiscounts: false,
            discountLimit: 0
          }
        ];
        
        console.log('Setting mock users:', mockUsers);
        setUsers(mockUsers);
      } else {
        setError('Failed to load users. Please try again.');
        setUsers([]);
      }
      
      // Show user-friendly error message
      setTimeout(() => setError(null), 10000);
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    { value: 'all', label: 'All Roles' },
    ...Object.entries(ROLE_INFO).map(([value, info]) => ({
      value,
      label: info.label,
      color: info.color
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
    modules: [],
    permissions: {}
  });

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleModuleToggle = (moduleId) => {
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

  const handlePermissionChange = (moduleId, permission, value) => {
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

  const handleRoleChange = (role) => {
    const roleDefaults = getRoleDefaults(role);
    
    setFormData(prev => ({
      ...prev,
      role,
      modules: roleDefaults.modules || [],
      permissions: roleDefaults.permissions || {}
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    console.log('Is editing:', editingUser);
    console.log('Is demo mode:', isDemoMode);
    
    if (!editingUser && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match!');
      setTimeout(() => setError(null), 5000);
      return;
    }
    
    if (isDemoMode) {
      // In demo mode, just update local state
      if (editingUser) {
        setUsers(prev => prev.map(u => 
          u.id === editingUser.id 
            ? { ...u, ...formData, lastLogin: u.lastLogin }
            : u
        ));
        setSuccessMessage('User updated successfully (Demo Mode)!');
      } else {
        const newUser = {
          ...formData,
          id: Date.now(),
          lastLogin: 'Never',
          createdDate: new Date().toISOString().split('T')[0]
        };
        setUsers(prev => [...prev, newUser]);
        setSuccessMessage('User created successfully (Demo Mode)!');
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // Prepare data for both table structures
      const userData = {
        // REQUIRED: org_id for org_users table
        org_id: 'ad808530-1ddb-4377-ab20-67bef145d80d', // Demo organization ID
        
        // Common fields
        email: formData.email,
        role: formData.role,
        
        // org_users fields
        full_name: formData.fullName,
        is_active: formData.status === 'active',
        // Don't send permissions for now - let backend use defaults
        // permissions: formData.permissions,
        
        // Basic user fields
        username: formData.username,
        employee_id: formData.username, // Use username as employee_id
        phone: null,
        department: 'General',
        can_view_reports: formData.role === 'admin' || formData.role === 'manager',
        can_modify_prices: formData.role === 'admin' || formData.role === 'manager',
        can_approve_discounts: formData.role === 'admin',
        discount_limit_percent: formData.role === 'admin' ? 100 : (formData.role === 'manager' ? 20 : 0)
      };
      
      if (!editingUser) {
        userData.password = formData.password;
      }
      
      if (editingUser) {
        // Update existing user
        await settingsApi.users.update(editingUser.id, userData);
        setSuccessMessage('User updated successfully!');
      } else {
        // Add new user
        await settingsApi.users.create(userData);
        setSuccessMessage('User created successfully!');
      }
      
      // Reload users
      await loadUsers();
      
      // Show success message
      setTimeout(() => setSuccessMessage(''), 3000);
      
      handleCloseModal();
    } catch (error) {
      console.error('Error saving user:', error);
      setError(error.response?.data?.message || 'Failed to save user. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      password: '',
      confirmPassword: '',
      role: user.role,
      status: user.status,
      modules: user.modules,
      permissions: user.permissions
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      if (isDemoMode) {
        setUsers(prev => prev.filter(u => u.id !== id));
        setSuccessMessage('User deleted successfully (Demo Mode)!');
        setTimeout(() => setSuccessMessage(''), 3000);
        return;
      }
      
      try {
        await settingsApi.users.delete(id);
        setSuccessMessage('User deleted successfully!');
        await loadUsers();
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        console.error('Error deleting user:', error);
        setError('Failed to delete user. Please try again.');
        setTimeout(() => setError(null), 5000);
      }
    }
  };

  const handleStatusToggle = async (userId) => {
    if (isDemoMode) {
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' }
          : u
      ));
      setSuccessMessage('User status updated (Demo Mode)!');
      setTimeout(() => setSuccessMessage(''), 3000);
      return;
    }
    
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      
      await settingsApi.users.update(userId, {
        is_active: user.status === 'inactive'
      });
      
      await loadUsers();
      setSuccessMessage('User status updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error updating user status:', error);
      setError('Failed to update user status.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleResetPassword = async (userId) => {
    if (window.confirm('Are you sure you want to reset password for this user?')) {
      if (isDemoMode) {
        setSuccessMessage('Password reset email sent (Demo Mode)!');
        setTimeout(() => setSuccessMessage(''), 5000);
        return;
      }
      
      try {
        await settingsApi.users.resetPassword(userId);
        setSuccessMessage('Password reset link sent to user email!');
        setTimeout(() => setSuccessMessage(''), 5000);
      } catch (error) {
        console.error('Error resetting password:', error);
        setError('Failed to reset password.');
        setTimeout(() => setError(null), 5000);
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
      modules: [],
      permissions: {}
    });
    setShowPassword(false);
  };

  const getRoleColor = (role) => {
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
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
              <span className="text-yellow-800">
                <strong>Demo Mode:</strong> User management is running in demo mode. Changes won't be saved to the database.
              </span>
            </div>
            <button
              onClick={() => {
                console.log('🔄 Retrying API connection...');
                loadUsers();
              }}
              className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && !isDemoMode && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <span className="text-red-800">{error}</span>
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
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            user.status === 'active'
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
                          {user.modules.slice(0, 3).map(moduleId => {
                            const module = modules.find(m => m.id === moduleId);
                            return module ? (
                              <span key={moduleId} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {module.icon} {module.name}
                              </span>
                            ) : null;
                          })}
                          {user.modules.length > 3 && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                              +{user.modules.length - 3} more
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
                            onClick={() => handleResetPassword(user.id)}
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
                        disabled={editingUser}
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

                {/* Password Section (only for new users) */}
                {!editingUser && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Password</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={formData.password}
                            onChange={(e) => handleInputChange('password', e.target.value)}
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
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Confirm Password <span className="text-red-500">*</span>
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={formData.confirmPassword}
                          onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Module Access */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Module Access</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {modules.map(module => (
                      <label key={module.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.modules.includes(module.id)}
                          onChange={() => handleModuleToggle(module.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">
                          {module.icon} {module.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Permissions</h3>
                  <div className="space-y-3">
                    {formData.modules.map(moduleId => {
                      const module = modules.find(m => m.id === moduleId);
                      if (!module) return null;
                      
                      const permissions = formData.permissions[moduleId] || {};
                      
                      return (
                        <div key={moduleId} className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">
                            {module.icon} {module.name}
                          </h4>
                          <div className="grid grid-cols-4 gap-3">
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={permissions.view || false}
                                onChange={(e) => handlePermissionChange(moduleId, 'view', e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">View</span>
                            </label>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={permissions.create || false}
                                onChange={(e) => handlePermissionChange(moduleId, 'create', e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">Create</span>
                            </label>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={permissions.edit || false}
                                onChange={(e) => handlePermissionChange(moduleId, 'edit', e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">Edit</span>
                            </label>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={permissions.delete || false}
                                onChange={(e) => handlePermissionChange(moduleId, 'delete', e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">Delete</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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