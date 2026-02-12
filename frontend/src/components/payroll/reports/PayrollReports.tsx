import React, { useState, useEffect } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { payrollRunApi } from '../../../services/api';
import ModuleHeader from '../../global/ui/ModuleHeader';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

type ReportTab = 'summary' | 'pf' | 'esi' | 'bank' | 'department';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'summary', label: 'Monthly Summary' },
  { id: 'pf', label: 'PF Register' },
  { id: 'esi', label: 'ESI Register' },
  { id: 'bank', label: 'Bank Sheet' },
  { id: 'department', label: 'Department Cost' },
];

const PayrollReports: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadReport = async () => {
    setIsLoading(true);
    try {
      let res;
      switch (activeTab) {
        case 'summary':
          res = await payrollRunApi.getMonthlySummary(year, month);
          break;
        case 'pf':
          res = await payrollRunApi.getPFRegister(year, month);
          break;
        case 'esi':
          res = await payrollRunApi.getESIRegister(year, month);
          break;
        case 'bank':
          res = await payrollRunApi.getBankSheet(year, month);
          break;
        case 'department':
          res = await payrollRunApi.getDepartmentCost(year, month);
          break;
      }
      setData(res?.data?.data || null);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [year, month, activeTab]);

  const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const renderSummary = () => {
    if (!data || !data.payroll_run_id) {
      return <div className="text-center py-8 text-gray-500">No payroll data for {MONTHS[month - 1]} {year}</div>;
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Run Number', value: data.run_number, type: 'text' },
          { label: 'Status', value: data.status, type: 'badge' },
          { label: 'Employees', value: data.total_employees, type: 'number' },
          { label: 'Total Gross', value: data.total_gross, type: 'currency' },
          { label: 'Total Deductions', value: data.total_deductions, type: 'currency' },
          { label: 'Total Net Pay', value: data.total_net_pay, type: 'currency' },
          { label: 'Employer PF', value: data.total_employer_pf, type: 'currency' },
          { label: 'Employer ESI', value: data.total_employer_esi, type: 'currency' },
          { label: 'Total CTC', value: data.ctc_total, type: 'currency' },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900">
              {item.type === 'currency' ? fmt(item.value) :
               item.type === 'badge' ? (
                 <span className={`text-sm px-2 py-0.5 rounded-full ${
                   item.value === 'confirmed' ? 'bg-green-50 text-green-700' :
                   item.value === 'calculated' ? 'bg-amber-50 text-amber-700' :
                   'bg-gray-100 text-gray-600'
                 }`}>{item.value}</span>
               ) : item.value}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTable = (rows: any[], columns: { key: string; label: string; type?: string }[]) => {
    if (!rows || rows.length === 0) {
      return <div className="text-center py-8 text-gray-500">No data available for {MONTHS[month - 1]} {year}</div>;
    }
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {columns.map(col => (
                <th key={col.key} className={`py-3 px-4 text-xs font-medium text-gray-500 uppercase ${col.type === 'currency' || col.type === 'number' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/30">
                {columns.map(col => (
                  <td key={col.key} className={`py-2.5 px-4 ${col.type === 'currency' || col.type === 'number' ? 'text-right font-mono' : ''}`}>
                    {col.type === 'currency' ? fmt(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;

    switch (activeTab) {
      case 'summary':
        return renderSummary();
      case 'pf':
        return renderTable(data || [], [
          { key: 'employee_name', label: 'Employee' },
          { key: 'employee_code', label: 'Code' },
          { key: 'basic_earned', label: 'Basic', type: 'currency' },
          { key: 'pf_employee', label: 'Employee PF', type: 'currency' },
          { key: 'pf_employer', label: 'Employer PF', type: 'currency' },
          { key: 'total_pf', label: 'Total PF', type: 'currency' },
        ]);
      case 'esi':
        return renderTable(data || [], [
          { key: 'employee_name', label: 'Employee' },
          { key: 'employee_code', label: 'Code' },
          { key: 'gross_earned', label: 'Gross', type: 'currency' },
          { key: 'esi_employee', label: 'Employee ESI', type: 'currency' },
          { key: 'esi_employer', label: 'Employer ESI', type: 'currency' },
          { key: 'total_esi', label: 'Total ESI', type: 'currency' },
        ]);
      case 'bank':
        return renderTable(data || [], [
          { key: 'employee_name', label: 'Employee' },
          { key: 'employee_code', label: 'Code' },
          { key: 'bank_name', label: 'Bank' },
          { key: 'account_number', label: 'Account No' },
          { key: 'ifsc_code', label: 'IFSC' },
          { key: 'net_pay', label: 'Net Pay', type: 'currency' },
        ]);
      case 'department':
        return renderTable(data || [], [
          { key: 'department_name', label: 'Department' },
          { key: 'employee_count', label: 'Employees', type: 'number' },
          { key: 'total_gross', label: 'Gross Pay', type: 'currency' },
          { key: 'total_deductions', label: 'Deductions', type: 'currency' },
          { key: 'total_net_pay', label: 'Net Pay', type: 'currency' },
          { key: 'total_employer_pf', label: 'Employer PF', type: 'currency' },
          { key: 'total_ctc', label: 'Total CTC', type: 'currency' },
        ]);
    }
  };

  return (
    <div>
      <ModuleHeader title="Payroll Reports" icon={BarChart3} iconColor="text-gray-600" />

      {/* Period Control Bar */}
      <div className="px-6 py-2 bg-white border-b border-gray-200 flex items-center">
        <span className="text-sm font-medium text-gray-500 mr-3">Period:</span>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Report Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Report Content */}
        {renderContent()}
      </div>
    </div>
  );
};

export default PayrollReports;
