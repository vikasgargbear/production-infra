import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { leaveApi } from '../../../services/api';

const LeaveBalanceView: React.FC = () => {
  const [balances, setBalances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  // Current financial year (Apr-Mar)
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = `${fyStart}-${fyStart + 1}`;

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await leaveApi.getBalances(financialYear);
      const data = res?.data?.data || [];
      setBalances(Array.isArray(data) ? data : []);
    } catch {
      // API unavailable — empty state shown
    } finally {
      setIsLoading(false);
    }
  }, [financialYear]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      await leaveApi.initializeBalances(financialYear);
      loadData();
    } catch {
      // Initialization failed — user can retry
    } finally {
      setInitializing(false);
    }
  };

  // Group by employee
  const grouped: Record<string, { name: string; code: string; leaves: any[] }> = {};
  balances.forEach(b => {
    const key = String(b.employee_id);
    if (!grouped[key]) grouped[key] = { name: b.employee_name, code: b.employee_code, leaves: [] };
    grouped[key].leaves.push(b);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          Financial Year: <strong>{financialYear}</strong>
        </div>
        <button
          onClick={handleInitialize}
          disabled={initializing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${initializing ? 'animate-spin' : ''}`} />
          {initializing ? 'Initializing...' : 'Initialize Balances'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No leave balances found for {financialYear}.</p>
          <p className="text-sm mt-1">Click "Initialize Balances" to set up leave quotas for all employees.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Quota</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Used</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Available</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([empId, emp]) =>
                emp.leaves.map((b: any, idx: number) => (
                  <tr key={`${empId}-${b.leave_policy_id}`} className="border-b border-gray-50">
                    {idx === 0 && (
                      <td className="py-2.5 px-4" rowSpan={emp.leaves.length}>
                        <div className="font-medium text-sm text-gray-900">{emp.name}</div>
                        <div className="text-xs text-gray-400">{emp.code}</div>
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-sm">
                      <span className="font-medium">{b.leave_type}</span>
                      <span className="text-gray-400 ml-1">{b.leave_name}</span>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right">{b.opening_balance}</td>
                    <td className="py-2.5 px-4 text-sm text-right text-red-600">{b.used}</td>
                    <td className="py-2.5 px-4 text-sm text-right font-medium text-green-600">{b.available}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeaveBalanceView;
