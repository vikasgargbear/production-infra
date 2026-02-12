import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, X as XIcon, Clock, Filter } from 'lucide-react';
import { leaveApi, employeesApi, leavePolicyApi } from '../../../services/api';
import LeaveApplicationForm from './LeaveApplicationForm';

interface LeaveApplication {
  leave_application_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  leave_type: string;
  leave_name: string;
  from_date: string;
  to_date: string;
  number_of_days: number;
  half_day: boolean;
  reason?: string;
  status: string;
  approver_name?: string;
  approval_remarks?: string;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

const LeaveApplicationList: React.FC = () => {
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await leaveApi.listApplications({ status: statusFilter || undefined, limit: 200 });
      const data = res?.data?.data || [];
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      // error silently handled - loading state resets in finally
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const handleApprove = async (id: number) => {
    try {
      // TODO: pass actual user employee_id from auth context
      await leaveApi.approveLeave(id, 0);
      loadData();
    } catch {
      // error silently handled
    }
  };

  const handleReject = (id: number) => {
    setRejectingId(id);
    setRejectRemarks('');
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    try {
      // TODO: pass actual user employee_id from auth context
      await leaveApi.rejectLeave(rejectingId, 0, rejectRemarks || undefined);
      setRejectingId(null);
      setRejectRemarks('');
      loadData();
    } catch {
      // error silently handled
    }
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No leave applications found.</div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.leave_application_id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{app.employee_name}</span>
                    <span className="text-xs text-gray-400">{app.employee_code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[app.status] || STATUS_BADGE.cancelled}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="font-medium text-blue-600">{app.leave_type} - {app.leave_name}</span>
                    <span>{formatDate(app.from_date)} to {formatDate(app.to_date)}</span>
                    <span>{app.number_of_days} day{app.number_of_days !== 1 ? 's' : ''}{app.half_day ? ' (half day)' : ''}</span>
                  </div>
                  {app.reason && <p className="text-sm text-gray-500 mt-1">{app.reason}</p>}
                  {app.approval_remarks && (
                    <p className="text-xs text-gray-400 mt-1">Remarks: {app.approval_remarks}</p>
                  )}
                </div>

                {app.status === 'pending' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleApprove(app.leave_application_id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReject(app.leave_application_id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Reject"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {rejectingId === app.leave_application_id && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <input
                    type="text"
                    value={rejectRemarks}
                    onChange={(e) => setRejectRemarks(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button onClick={confirmReject} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Reject</button>
                  <button onClick={() => setRejectingId(null)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <LeaveApplicationForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      )}
    </div>
  );
};

export default LeaveApplicationList;
