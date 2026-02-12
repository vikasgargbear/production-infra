import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { leavePolicyApi } from '../../../services/api';

interface Props {
  policy: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const LEAVE_TYPES = [
  { value: 'CL', label: 'Casual Leave (CL)' },
  { value: 'SL', label: 'Sick Leave (SL)' },
  { value: 'EL', label: 'Earned Leave (EL)' },
  { value: 'LOP', label: 'Loss of Pay (LOP)' },
];

const LeavePolicyForm: React.FC<Props> = ({ policy, onClose, onSaved }) => {
  const isEdit = !!policy;
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    leave_type: policy?.leave_type || 'CL',
    leave_name: policy?.leave_name || '',
    annual_quota: policy?.annual_quota || 12,
    carry_forward: policy?.carry_forward ?? false,
    max_carry_forward: policy?.max_carry_forward || 0,
    max_consecutive_days: policy?.max_consecutive_days || 3,
    requires_document: policy?.requires_document ?? false,
    applicable_after_days: policy?.applicable_after_days || 0,
  });

  const handleSave = async () => {
    if (!form.leave_type || !form.leave_name) return;
    setSaving(true);
    try {
      if (isEdit) {
        await leavePolicyApi.update(policy.leave_policy_id, form);
      } else {
        await leavePolicyApi.create(form);
      }
      onSaved();
    } catch {
      // Save failed — form stays open for retry
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Leave Policy' : 'New Leave Policy'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <select
                value={form.leave_type}
                onChange={(e) => {
                  const lt = e.target.value;
                  const match = LEAVE_TYPES.find(t => t.value === lt);
                  update('leave_type', lt);
                  if (match && !form.leave_name) update('leave_name', match.label.split('(')[0].trim());
                }}
                disabled={isEdit}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                {LEAVE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Name</label>
              <input
                type="text"
                value={form.leave_name}
                onChange={(e) => update('leave_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Casual Leave"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Quota</label>
              <input
                type="number"
                value={form.annual_quota}
                onChange={(e) => update('annual_quota', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Consecutive</label>
              <input
                type="number"
                value={form.max_consecutive_days}
                onChange={(e) => update('max_consecutive_days', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Probation (days)</label>
              <input
                type="number"
                value={form.applicable_after_days}
                onChange={(e) => update('applicable_after_days', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.carry_forward}
                onChange={(e) => update('carry_forward', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Allow carry forward to next year</span>
            </label>
            {form.carry_forward && (
              <div className="ml-6">
                <label className="block text-xs text-gray-500 mb-1">Max carry forward days</label>
                <input
                  type="number"
                  value={form.max_carry_forward}
                  onChange={(e) => update('max_carry_forward', parseInt(e.target.value) || 0)}
                  className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_document}
                onChange={(e) => update('requires_document', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Requires supporting document</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.leave_name}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeavePolicyForm;
