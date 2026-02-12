import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CalendarClock, Edit2, Trash2, Save, X } from 'lucide-react';
import { leavePolicyApi } from '../../../services/api';
import LeavePolicyForm from './LeavePolicyForm';
import ModuleHeader from '../../global/ui/ModuleHeader';

interface LeavePolicy {
  leave_policy_id: number;
  leave_type: string;
  leave_name: string;
  annual_quota: number;
  carry_forward: boolean;
  max_carry_forward: number;
  max_consecutive_days: number;
  requires_document: boolean;
  applicable_after_days: number;
  is_active: boolean;
}

const LeavePolicyList: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await leavePolicyApi.getAll();
      const data = res?.data?.data || res?.data || [];
      setPolicies(Array.isArray(data) ? data : []);
    } catch {
      // error silently handled - loading state resets in finally
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this leave policy?')) return;
    try {
      await leavePolicyApi.delete(id);
      loadData();
    } catch {
      // error silently handled
    }
  };

  const leaveTypeColors: Record<string, string> = {
    CL: 'bg-blue-50 text-blue-700',
    SL: 'bg-red-50 text-red-700',
    EL: 'bg-green-50 text-green-700',
    LOP: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <ModuleHeader
        title="Leave Policies"
        icon={CalendarClock}
        iconColor="text-green-600"
        additionalActions={[
          { label: 'Add Leave Type', icon: Plus, onClick: () => { setEditingPolicy(null); setShowForm(true); }, variant: 'primary' },
        ]}
      />

      <div className="p-6 max-w-5xl mx-auto">
      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12">
          <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No leave policies configured.</p>
          <p className="text-sm text-gray-400 mt-1">Add standard leave types like CL, SL, EL to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((p) => (
            <div key={p.leave_policy_id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${leaveTypeColors[p.leave_type] || 'bg-gray-100 text-gray-700'}`}>
                    {p.leave_type}
                  </span>
                  <span className="font-medium text-gray-900">{p.leave_name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingPolicy(p); setShowForm(true); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.leave_policy_id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Annual Quota:</span>
                  <span className="ml-1 font-medium">{p.annual_quota} days</span>
                </div>
                <div>
                  <span className="text-gray-500">Max Consecutive:</span>
                  <span className="ml-1 font-medium">{p.max_consecutive_days} days</span>
                </div>
                <div>
                  <span className="text-gray-500">Carry Forward:</span>
                  <span className={`ml-1 font-medium ${p.carry_forward ? 'text-green-600' : 'text-gray-400'}`}>
                    {p.carry_forward ? `Yes (max ${p.max_carry_forward})` : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Document:</span>
                  <span className="ml-1 font-medium">{p.requires_document ? 'Required' : 'Not required'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <LeavePolicyForm
          policy={editingPolicy}
          onClose={() => { setShowForm(false); setEditingPolicy(null); }}
          onSaved={() => { setShowForm(false); setEditingPolicy(null); loadData(); }}
        />
      )}
      </div>
    </div>
  );
};

export default LeavePolicyList;
