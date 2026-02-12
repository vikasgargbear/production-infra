import React, { useState, useEffect, useCallback } from 'react';
import { Receipt, Search, Eye, Download, ChevronDown } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { salarySlipsApi, payrollRunApi } from '../../../services/api';
import SalarySlipView from './SalarySlipView';

interface SlipRow {
  payroll_slip_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  slip_number: string;
  payroll_month: number;
  payroll_year: number;
  run_number: string;
  gross_earned: number;
  total_deductions: number;
  net_pay: number;
  status: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SalarySlipList: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSlipId, setSelectedSlipId] = useState<number | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<number | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [slipRes, runRes] = await Promise.all([
        salarySlipsApi.getAll({ run_id: selectedRun, limit: 500 }),
        payrollRunApi.listRuns(),
      ]);
      setSlips(slipRes?.data?.data || []);
      setRuns(runRes?.data?.data || []);
    } catch {
      // error silently handled - loading state resets in finally
    } finally {
      setIsLoading(false);
    }
  }, [selectedRun]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = slips.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return s.employee_name.toLowerCase().includes(term) ||
           s.employee_code.toLowerCase().includes(term) ||
           s.slip_number.toLowerCase().includes(term);
  });

  const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  if (selectedSlipId) {
    return (
      <SalarySlipView
        slipId={selectedSlipId}
        onBack={() => setSelectedSlipId(null)}
      />
    );
  }

  return (
    <div>
      <ModuleHeader title="Salary Slips" icon={Receipt} iconColor="text-emerald-600" />
      <div className="p-6 max-w-7xl mx-auto">

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by employee or slip number..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedRun || ''}
          onChange={(e) => setSelectedRun(e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Payroll Runs</option>
          {runs.map((r: any) => (
            <option key={r.payroll_run_id} value={r.payroll_run_id}>
              {MONTHS[r.payroll_month - 1]} {r.payroll_year} ({r.run_number})
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {slips.length === 0 ? 'No salary slips found. Run payroll first.' : 'No results match your search.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Slip #</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Deductions</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((slip) => (
                <tr key={slip.payroll_slip_id} className="border-b border-gray-50 hover:bg-gray-50/30">
                  <td className="py-2.5 px-4 text-sm text-gray-600 font-mono">{slip.slip_number}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-sm text-gray-900">{slip.employee_name}</div>
                    <div className="text-xs text-gray-400">{slip.employee_code}</div>
                  </td>
                  <td className="py-2.5 px-4 text-sm text-gray-600">
                    {MONTHS[slip.payroll_month - 1]} {slip.payroll_year}
                  </td>
                  <td className="py-2.5 px-4 text-sm text-right font-mono">{fmt(slip.gross_earned)}</td>
                  <td className="py-2.5 px-4 text-sm text-right font-mono text-red-600">{fmt(slip.total_deductions)}</td>
                  <td className="py-2.5 px-4 text-sm text-right font-mono font-medium text-green-700">{fmt(slip.net_pay)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedSlipId(slip.payroll_slip_id)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="View Slip"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
};

export default SalarySlipList;
