import React, { useState, useEffect } from 'react';
import { X, Save, Search } from 'lucide-react';
import { leaveApi, leavePolicyApi, employeesApi } from '../../../services/api';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const LeaveApplicationForm: React.FC<Props> = ({ onClose, onSaved }) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employee_id: 0,
    leave_policy_id: 0,
    from_date: '',
    to_date: '',
    number_of_days: 1,
    half_day: false,
    reason: '',
  });

  useEffect(() => {
    employeesApi.getAll({ is_active: true, limit: 200 }).then((res: any) => {
      setEmployees(res?.data?.data || []);
    });
    leavePolicyApi.getAll().then((res: any) => {
      setPolicies(res?.data?.data || []);
    });
  }, []);

  // Auto-calculate days
  useEffect(() => {
    if (form.from_date && form.to_date) {
      const from = new Date(form.from_date);
      const to = new Date(form.to_date);
      const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setForm(prev => ({ ...prev, number_of_days: form.half_day ? 0.5 : Math.max(diff, 1) }));
    }
  }, [form.from_date, form.to_date, form.half_day]);

  const handleSave = async () => {
    if (!form.employee_id || !form.leave_policy_id || !form.from_date || !form.to_date) return;
    setSaving(true);
    try {
      await leaveApi.applyLeave(form);
      onSaved();
    } catch {
      // Silently handled — form stays open for retry
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Apply for Leave</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select
              value={form.employee_id}
              onChange={(e) => update('employee_id', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Select employee...</option>
              {employees.map((e: any) => (
                <option key={e.employee_id} value={e.employee_id}>
                  {e.full_name || e.employee_name} ({e.employee_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
            <select
              value={form.leave_policy_id}
              onChange={(e) => update('leave_policy_id', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Select leave type...</option>
              {policies.map((p: any) => (
                <option key={p.leave_policy_id} value={p.leave_policy_id}>
                  {p.leave_type} - {p.leave_name} ({p.annual_quota} days/year)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={form.from_date}
                onChange={(e) => update('from_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={form.to_date}
                onChange={(e) => update('to_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.half_day}
                onChange={(e) => update('half_day', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>Half day</span>
            </label>
            <span className="text-sm text-gray-600">
              Days: <strong>{form.number_of_days}</strong>
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => update('reason', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional reason for leave..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.employee_id || !form.leave_policy_id}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveApplicationForm;
