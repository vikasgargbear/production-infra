import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { salarySlipsApi } from '../../../services/api';

interface Props {
  slipId: number;
  onBack: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SalarySlipView: React.FC<Props> = ({ slipId, onBack }) => {
  const [slip, setSlip] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    salarySlipsApi.getById(slipId).then((res: any) => {
      setSlip(res?.data?.data || null);
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, [slipId]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Salary Slip - ${slip?.slip_number}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        th { background: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #6b7280; }
        .text-right { text-align: right; }
        .font-bold { font-weight: 700; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 15px; }
        .summary { background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; margin-top: 15px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!slip) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>
        <div className="text-center py-12 text-gray-500">Salary slip not found.</div>
      </div>
    );
  }

  const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const period = `${MONTHS[(slip.payroll_month || 1) - 1]} ${slip.payroll_year}`;

  const earnings = [
    { label: 'Basic Salary', value: slip.basic_earned },
    { label: 'HRA', value: slip.hra_earned },
    { label: 'Dearness Allowance', value: slip.da_earned },
    { label: 'Conveyance Allowance', value: slip.conveyance_earned },
    { label: 'Medical Allowance', value: slip.medical_earned },
    { label: 'Special Allowance', value: slip.special_earned },
    { label: 'Other Allowance', value: slip.other_earned },
  ].filter(e => e.value > 0);

  const deductions = [
    { label: 'Provident Fund (PF)', value: slip.pf_employee },
    { label: 'ESI', value: slip.esi_employee },
    { label: 'Professional Tax', value: slip.professional_tax },
    { label: 'TDS', value: slip.tds },
    { label: 'LOP Deduction', value: slip.lop_deduction },
    { label: 'Other Deductions', value: slip.other_deductions },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      {/* Printable Slip */}
      <div ref={printRef} className="bg-white border border-gray-200 rounded-xl p-8">
        {/* Header */}
        <div className="header text-center mb-6 pb-4 border-b-2 border-gray-900">
          <h1 className="text-xl font-bold text-gray-900">SALARY SLIP</h1>
          <p className="text-sm text-gray-600 mt-1">{period}</p>
          <p className="text-xs text-gray-400 mt-0.5">{slip.slip_number}</p>
        </div>

        {/* Employee Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="space-y-1">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium">{slip.employee_name}</span></div>
            <div><span className="text-gray-500">Code:</span> <span className="font-medium">{slip.employee_code}</span></div>
            <div><span className="text-gray-500">Designation:</span> <span className="font-medium">{slip.designation || '-'}</span></div>
          </div>
          <div className="space-y-1">
            <div><span className="text-gray-500">Department:</span> <span className="font-medium">{slip.department_name || '-'}</span></div>
            <div><span className="text-gray-500">Working Days:</span> <span className="font-medium">{slip.working_days}</span></div>
            <div><span className="text-gray-500">Days Present:</span> <span className="font-medium">{slip.days_present}</span>
              {slip.lop_days > 0 && <span className="text-red-500 ml-1">(LOP: {slip.lop_days})</span>}
            </div>
          </div>
        </div>

        {/* Earnings + Deductions side by side */}
        <div className="two-col grid grid-cols-2 gap-6 mb-6">
          {/* Earnings */}
          <div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Earnings</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.label} className="border-b border-gray-50">
                    <td className="py-2 text-sm text-gray-700">{e.label}</td>
                    <td className="py-2 text-sm text-right font-mono">{fmt(e.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-2 text-sm font-bold text-gray-900">Gross Earnings</td>
                  <td className="py-2 text-sm text-right font-mono font-bold">{fmt(slip.gross_earned)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Deductions</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((d) => (
                  <tr key={d.label} className="border-b border-gray-50">
                    <td className="py-2 text-sm text-gray-700">{d.label}</td>
                    <td className="py-2 text-sm text-right font-mono text-red-600">{fmt(d.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-2 text-sm font-bold text-gray-900">Total Deductions</td>
                  <td className="py-2 text-sm text-right font-mono font-bold text-red-600">{fmt(slip.total_deductions)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Net Pay */}
        <div className="summary bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-sm text-green-700 mb-1">Net Pay</div>
          <div className="text-2xl font-bold text-green-800 font-mono">{fmt(slip.net_pay)}</div>
        </div>

        {/* Bank Details */}
        {slip.bank_name && (
          <div className="mt-4 text-xs text-gray-400 text-center">
            Bank: {slip.bank_name} | A/C: {slip.account_number} | IFSC: {slip.ifsc_code}
          </div>
        )}

        {/* Employer Cost (not printed) */}
        {(slip.pf_employer > 0 || slip.esi_employer > 0) && (
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
            <span>Employer Contribution: PF {fmt(slip.pf_employer)}</span>
            {slip.esi_employer > 0 && <span> | ESI {fmt(slip.esi_employer)}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalarySlipView;
