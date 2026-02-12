import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, RefreshCw, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, X, Eye, Activity,
  Users, AlertTriangle, LogIn
} from 'lucide-react';
import { auditApi } from '../../../services/api';
import type { AuditLogEntry, AuditSummary, AuditLogParams } from '../../../services/api/modules/audit/audit.api';

interface AuditTrailProps {
  open?: boolean;
  onClose?: () => void;
}

const ACTIVITY_TYPES = [
  { value: '', label: 'All Activities' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'view', label: 'View' },
  { value: 'export', label: 'Export' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'user', label: 'User' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'order', label: 'Order' },
  { value: 'payment', label: 'Payment' },
  { value: 'product', label: 'Product' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'role', label: 'Role' },
];

const activityBadgeColor: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login: 'bg-indigo-100 text-indigo-800',
  logout: 'bg-gray-100 text-gray-800',
  view: 'bg-yellow-100 text-yellow-800',
  export: 'bg-purple-100 text-purple-800',
};

const statusBadgeColor: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failure: 'bg-red-100 text-red-800',
  error: 'bg-orange-100 text-orange-800',
};

function formatTimestamp(ts: string): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

const AuditTrail: React.FC<AuditTrailProps> = ({ open = true, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [activityType, setActivityType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const LIMIT = 50;

  const loadSummary = useCallback(async () => {
    try {
      const res = await auditApi.getSummary();
      setSummary(res.data);
    } catch (err) {
      console.warn('Failed to load audit summary:', err);
    }
  }, []);

  const loadLogs = useCallback(async (pageNum: number = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: AuditLogParams = { page: pageNum, limit: LIMIT };
      if (searchTerm) params.search = searchTerm;
      if (activityType) params.activity_type = activityType;
      if (entityType) params.entity_type = entityType;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await auditApi.getAll(params);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
      setPage(pageNum);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, activityType, entityType, startDate, endDate]);

  useEffect(() => {
    if (open) {
      loadSummary();
      loadLogs(1);
    }
  }, [open, loadSummary, loadLogs]);

  const handleSearch = () => {
    loadLogs(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const openDetail = async (auditId: number) => {
    setDetailLoading(true);
    try {
      const res = await auditApi.getById(auditId);
      setSelectedLog(res.data);
    } catch (err) {
      console.error('Failed to load audit detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  if (!open) return null;

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
            <span className="text-sm text-gray-500">({total} entries)</span>
          </div>
          <button
            onClick={() => { loadSummary(); loadLogs(page); }}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="px-6 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 text-gray-500 text-sm mb-1">
              <Activity className="w-4 h-4" />
              <span>Total Actions (30d)</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.total_actions.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 text-gray-500 text-sm mb-1">
              <Users className="w-4 h-4" />
              <span>Active Users</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.active_users}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 text-gray-500 text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span>Critical Changes</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{summary.critical_changes}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 text-gray-500 text-sm mb-1">
              <LogIn className="w-4 h-4" />
              <span>Failed Logins</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{summary.failed_logins}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 mx-6 mt-4 rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search actions or entity names..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {ACTIVITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {ENTITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            placeholder="From"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            placeholder="To"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Search
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading audit logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No audit logs found</h3>
            <p className="text-gray-600">Audit logs will appear here as system activities are recorded.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.audit_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatTimestamp(log.activity_timestamp)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{log.full_name || log.user_name}</div>
                        {log.ip_address && (
                          <div className="text-xs text-gray-400">{log.ip_address}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${activityBadgeColor[log.activity_type] || 'bg-gray-100 text-gray-800'}`}>
                          {log.activity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900 capitalize">{log.entity_type}</div>
                        {log.entity_name && (
                          <div className="text-xs text-gray-500">{log.entity_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {log.action_performed}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeColor[log.result_status] || 'bg-gray-100 text-gray-800'}`}>
                          {log.result_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openDetail(log.audit_id)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {((page - 1) * LIMIT) + 1} - {Math.min(page * LIMIT, total)} of {total}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => loadLogs(page - 1)}
                    disabled={page <= 1}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => loadLogs(page + 1)}
                    disabled={page >= totalPages}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {(selectedLog || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : selectedLog && (
              <>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Audit Log Detail</h2>
                  <button onClick={() => setSelectedLog(null)} className="p-1 hover:bg-gray-100 rounded">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Timestamp</div>
                      <div className="font-medium">{formatTimestamp(selectedLog.activity_timestamp)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">User</div>
                      <div className="font-medium">{selectedLog.full_name || selectedLog.user_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Activity Type</div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${activityBadgeColor[selectedLog.activity_type] || 'bg-gray-100 text-gray-800'}`}>
                        {selectedLog.activity_type}
                      </span>
                    </div>
                    <div>
                      <div className="text-gray-500">Status</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeColor[selectedLog.result_status] || 'bg-gray-100 text-gray-800'}`}>
                        {selectedLog.result_status}
                      </span>
                    </div>
                    <div>
                      <div className="text-gray-500">Entity Type</div>
                      <div className="font-medium capitalize">{selectedLog.entity_type}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Entity ID</div>
                      <div className="font-medium">{selectedLog.entity_id || '-'}</div>
                    </div>
                    {selectedLog.entity_name && (
                      <div className="col-span-2">
                        <div className="text-gray-500">Entity Name</div>
                        <div className="font-medium">{selectedLog.entity_name}</div>
                      </div>
                    )}
                    <div className="col-span-2">
                      <div className="text-gray-500">Action</div>
                      <div className="font-medium">{selectedLog.action_performed}</div>
                    </div>
                    {selectedLog.ip_address && (
                      <div>
                        <div className="text-gray-500">IP Address</div>
                        <div className="font-medium">{selectedLog.ip_address}</div>
                      </div>
                    )}
                    {selectedLog.error_message && (
                      <div className="col-span-2">
                        <div className="text-gray-500">Error</div>
                        <div className="font-medium text-red-600">{selectedLog.error_message}</div>
                      </div>
                    )}
                  </div>

                  {/* Old vs New Values */}
                  {(selectedLog.old_values || selectedLog.new_values) && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Changes</h3>
                      {selectedLog.changed_fields && selectedLog.changed_fields.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1">Changed Fields</div>
                          <div className="flex flex-wrap gap-1">
                            {selectedLog.changed_fields.map((field) => (
                              <span key={field} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {selectedLog.old_values && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1 font-medium">Old Values</div>
                            <pre className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(selectedLog.old_values, null, 2)}
                            </pre>
                          </div>
                        )}
                        {selectedLog.new_values && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1 font-medium">New Values</div>
                            <pre className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(selectedLog.new_values, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
