/**
 * RoleManagement — Full-page settings component for managing roles & permissions.
 *
 * Features:
 *   - List all roles (system + custom) with user counts
 *   - Create custom roles with permission matrix
 *   - Edit role permissions (system roles: permissions only, custom: everything)
 *   - Delete custom roles with user reassignment
 *   - "Start from template" to pre-fill permission matrix
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, Edit2, Trash2, Save, X,
  Loader2, AlertCircle, Check, Users, Crown,
  Copy, ChevronDown
} from 'lucide-react';
import { roleManagementApi } from '../../../services/api';
import { MODULES, MODULE_INFO, PERMISSIONS } from '../../../config/userRoles.config';
import type { Role } from '../../../types/api.types';
import { CanonicalWriteNotice } from '../../global';

// ─── Types ──────────────────────────────────────────────────────
interface RoleFormData {
  role_name: string;
  role_code: string;
  role_description: string;
  data_access_level: 'own' | 'branch' | 'organization';
  permissions: Record<string, Record<string, boolean>>;
  allowed_modules: string[];
}

const EMPTY_FORM: RoleFormData = {
  role_name: '',
  role_code: '',
  role_description: '',
  data_access_level: 'own',
  permissions: {},
  allowed_modules: [],
};

const MODULE_KEYS = Object.values(MODULES);
const PERMISSION_KEYS = Object.values(PERMISSIONS);

const DATA_ACCESS_OPTIONS = [
  { value: 'own', label: 'Own data only', description: 'User sees only their own records' },
  { value: 'branch', label: 'Branch level', description: 'User sees all records in their branch' },
  { value: 'organization', label: 'Organization wide', description: 'User sees all records across the organization' },
];

// ─── Helpers ────────────────────────────────────────────────────
const toRoleCode = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const isAllPermission = (perms: any): perms is { all: boolean } =>
  perms && typeof perms === 'object' && 'all' in perms && perms.all === true;

/**
 * Convert the backend `{ all: true }` shorthand into a full permission matrix
 * so every module/permission checkbox shows as checked.
 */
const expandPermissions = (perms: any): Record<string, Record<string, boolean>> => {
  if (isAllPermission(perms)) {
    const expanded: Record<string, Record<string, boolean>> = {};
    MODULE_KEYS.forEach(mod => {
      expanded[mod] = {};
      PERMISSION_KEYS.forEach(p => { expanded[mod][p] = true; });
    });
    return expanded;
  }
  return perms || {};
};

// ─── Component ──────────────────────────────────────────────────
interface RoleManagementProps {
  open: boolean;
  onClose: () => void;
}

const RoleManagement: React.FC<RoleManagementProps> = ({ open, onClose }) => {
  // ── State ─────────────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState<RoleFormData>({ ...EMPTY_FORM });

  // Delete dialog
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [reassignRoleId, setReassignRoleId] = useState<number | ''>('');

  // ── Data fetching ─────────────────────────────────────────────
  const loadRoles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await roleManagementApi.getAll();
      const data = response?.data?.data || response?.data || [];
      setRoles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadRoles();
  }, [open, loadRoles]);

  // ── Auto-clear messages ───────────────────────────────────────
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingRole(null);
    setFormData({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    const perms = expandPermissions(role.permissions);
    setFormData({
      role_name: role.role_name,
      role_code: role.role_code,
      role_description: role.role_description || '',
      data_access_level: role.data_access_level || 'own',
      permissions: perms,
      allowed_modules: role.allowed_modules || [],
    });
    setShowModal(true);
  };

  const handleTemplate = (templateRole: Role) => {
    const perms = expandPermissions(templateRole.permissions);
    setFormData(prev => ({
      ...prev,
      permissions: perms,
      allowed_modules: templateRole.allowed_modules || [],
      data_access_level: templateRole.data_access_level || prev.data_access_level,
    }));
  };

  const handleModuleToggle = (moduleId: string) => {
    setFormData(prev => {
      const isEnabled = prev.allowed_modules.includes(moduleId);
      let newModules: string[];
      let newPerms = { ...prev.permissions };

      if (isEnabled) {
        newModules = prev.allowed_modules.filter(m => m !== moduleId);
        delete newPerms[moduleId];
      } else {
        newModules = [...prev.allowed_modules, moduleId];
        newPerms[moduleId] = { view: true, create: false, edit: false, delete: false, approve: false, export: false };
      }

      return { ...prev, allowed_modules: newModules, permissions: newPerms };
    });
  };

  const handlePermissionToggle = (moduleId: string, permission: string) => {
    setFormData(prev => {
      const modPerms = { ...(prev.permissions[moduleId] || {}) };
      modPerms[permission] = !modPerms[permission];

      // If enabling any permission, make sure module is enabled
      const anyEnabled = Object.values(modPerms).some(v => v);
      let newModules = [...prev.allowed_modules];
      if (anyEnabled && !newModules.includes(moduleId)) {
        newModules.push(moduleId);
      }

      return {
        ...prev,
        permissions: { ...prev.permissions, [moduleId]: modPerms },
        allowed_modules: newModules,
      };
    });
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      role_name: name,
      // Auto-generate code only for new roles
      ...(!editingRole ? { role_code: toRoleCode(name) } : {}),
    }));
  };

  const handleSave = async () => {
    if (!formData.role_name.trim()) {
      setError('Role name is required');
      return;
    }
    if (!editingRole && !formData.role_code.trim()) {
      setError('Role code is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        role_name: formData.role_name,
        role_code: formData.role_code,
        role_description: formData.role_description,
        data_access_level: formData.data_access_level,
        permissions: formData.permissions,
        allowed_modules: formData.allowed_modules,
      };

      if (editingRole) {
        await roleManagementApi.update(editingRole.role_id, payload);
        setSuccess('Role updated successfully');
      } else {
        await roleManagementApi.create(payload);
        setSuccess('Role created successfully');
      }

      setShowModal(false);
      setEditingRole(null);
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRole) return;

    const userCount = deletingRole.user_count || 0;
    if (userCount > 0 && !reassignRoleId) {
      setError('Please select a role to reassign users to');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await roleManagementApi.delete(
        deletingRole.role_id,
        userCount > 0 ? reassignRoleId || null : null
      );
      setSuccess('Role deleted successfully');
      setDeletingRole(null);
      setReassignRoleId('');
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetupDefaults = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await roleManagementApi.setupDefaults();
      setSuccess('Default roles seeded successfully');
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to setup default roles');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
            <span className="text-sm text-gray-500">({roles.length} roles)</span>
          </div>
          <div className="flex items-center space-x-3">
            {roles.length === 0 && (
              <button
                onClick={handleSetupDefaults}
                disabled={true}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center space-x-2 disabled:opacity-50"
              >
                <Crown className="w-4 h-4" />
                <span>Setup Default Roles</span>
              </button>
            )}
            <button
              onClick={handleCreate}
              disabled
              title="Unavailable until a canonical role command exists"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center space-x-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Create Custom Role</span>
            </button>
          </div>
        </div>
      </div>

      <CanonicalWriteNotice action="Changing roles and permissions" className="mx-6 mt-4" />

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <Check className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
          <span className="text-green-800 text-sm">{success}</span>
        </div>
      )}

      {/* Roles Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600">Loading roles...</span>
          </div>
        ) : roles.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No roles configured</h3>
            <p className="text-gray-600 mb-4">Set up default system roles to get started.</p>
            <button
              onClick={handleSetupDefaults}
              disabled
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
              Setup Default Roles
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Users</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Data Access</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modules</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {roles.map((role) => (
                    <tr key={role.role_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{role.role_name}</p>
                          <p className="text-xs text-gray-500">{role.role_code}</p>
                          {role.role_description && (
                            <p className="text-xs text-gray-400 mt-0.5">{role.role_description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          role.is_system_role
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {role.is_system_role ? 'System' : 'Custom'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center text-sm text-gray-600">
                          <Users className="w-3.5 h-3.5 mr-1" />
                          {role.user_count ?? 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs text-gray-600 capitalize">
                          {role.data_access_level || 'own'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(role.allowed_modules || []).slice(0, 4).map(mod => {
                            const info = MODULE_INFO[mod as keyof typeof MODULE_INFO];
                            return info ? (
                              <span key={mod} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {info.icon} {info.name}
                              </span>
                            ) : null;
                          })}
                          {(role.allowed_modules || []).length > 4 && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                              +{(role.allowed_modules || []).length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(role)}
                            disabled
                            className="p-1.5 text-blue-600 rounded disabled:text-gray-300 disabled:cursor-not-allowed"
                            title="Edit Role"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!role.is_system_role && (
                            <button
                              onClick={() => { setDeletingRole(role); setReassignRoleId(''); }}
                              disabled
                              className="p-1.5 text-red-600 rounded disabled:text-gray-300 disabled:cursor-not-allowed"
                              title="Delete Role"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl m-4 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingRole ? `Edit: ${editingRole.role_name}` : 'Create Custom Role'}
                </h2>
                <button onClick={() => { setShowModal(false); setEditingRole(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Error in modal */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0" />
                  <span className="text-red-800 text-sm">{error}</span>
                </div>
              )}

              {/* ── Basic Details ──────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Basic Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.role_name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      disabled={editingRole?.is_system_role}
                      placeholder="e.g. Delivery Executive"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Code</label>
                    <input
                      type="text"
                      value={formData.role_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, role_code: e.target.value }))}
                      disabled={!!editingRole}
                      placeholder="auto-generated"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 font-mono text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={formData.role_description}
                      onChange={(e) => setFormData(prev => ({ ...prev, role_description: e.target.value }))}
                      placeholder="Brief description of this role"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data Access Level</label>
                    <select
                      value={formData.data_access_level}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_access_level: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      {DATA_ACCESS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {DATA_ACCESS_OPTIONS.find(o => o.value === formData.data_access_level)?.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Template Selector ────────────────────────── */}
              {!editingRole && roles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Copy className="w-4 h-4" /> Start from Template
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {roles.filter(r => r.is_system_role).map(r => (
                      <button
                        key={r.role_id}
                        type="button"
                        onClick={() => handleTemplate(r)}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 rounded-lg transition-colors"
                      >
                        {r.role_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Permission Matrix ─────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Permission Matrix</h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-48">Module</th>
                        {PERMISSION_KEYS.map(p => (
                          <th key={p} className="text-center px-2 py-2.5 font-medium text-gray-600 w-16 capitalize">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {MODULE_KEYS.map(moduleId => {
                        const info = MODULE_INFO[moduleId as keyof typeof MODULE_INFO];
                        if (!info) return null;
                        const isModuleEnabled = formData.allowed_modules.includes(moduleId);
                        const modPerms = formData.permissions[moduleId] || {};

                        return (
                          <tr key={moduleId} className={isModuleEnabled ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-4 py-2.5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isModuleEnabled}
                                  onChange={() => handleModuleToggle(moduleId)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="mr-1">{info.icon}</span>
                                <span className={`font-medium ${isModuleEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                                  {info.name}
                                </span>
                              </label>
                            </td>
                            {PERMISSION_KEYS.map(p => (
                              <td key={p} className="text-center px-2 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={modPerms[p] === true}
                                  onChange={() => handlePermissionToggle(moduleId, p)}
                                  disabled={!isModuleEnabled}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={() => { setShowModal(false); setEditingRole(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={true}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{editingRole ? 'Update Role' : 'Create Role'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ──────────────────────── */}
      {deletingRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md m-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Role</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deletingRole.role_name}</strong>?
            </p>

            {(deletingRole.user_count || 0) > 0 && (
              <div className="mb-4">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  This role has <strong>{deletingRole.user_count}</strong> active user(s).
                  Please select a role to reassign them to.
                </p>
                <select
                  value={reassignRoleId}
                  onChange={(e) => setReassignRoleId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select a role...</option>
                  {roles
                    .filter(r => r.role_id !== deletingRole.role_id)
                    .map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => { setDeletingRole(null); setReassignRoleId(''); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
