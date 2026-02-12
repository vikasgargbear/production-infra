import React, { useState, useEffect } from 'react';
import { Calculator, ChevronRight, Check, Loader2, AlertCircle } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { payrollRunApi } from '../../../services/api';

interface PayrollSlipPreview {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  working_days: number;
  days_present: number;
  days_absent: number;
  lop_days: number;
  gross_earned: number;
  pf_employee: number;
  esi_employee: number;
  professional_tax: number;
  total_deductions: number;
  net_pay: number;
}

interface CalculationResult {
  year: number;
  month: number;
  working_days: number;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net_pay: number;
  total_employer_pf: number;
  total_employer_esi: number;
  slips: PayrollSlipPreview[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const PayrollRunFlow: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const now = new Date();
  const [step, setStep] = useState<1 | 2>(1);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  // Load previous runs
  const [previousRuns, setPreviousRuns] = useState<any[]>([]);
  useEffect(() => {
    payrollRunApi.listRuns(year).then((res: any) => {
      setPreviousRuns(res?.data?.data || []);
    }).catch(() => {});
  }, [year]);

  const existingRun = previousRuns.find(r => r.payroll_month === month && r.payroll_year === year);

  const handleCalculate = async () => {
    setIsCalculating(true);
    setError(null);
    try {
      const res = await payrollRunApi.calculate(year, month);
      const data = res?.data?.data;
      if (!data || data.error) {
        setError(data?.error || 'Failed to calculate payroll');
        return;
      }
      setCalculation(data);
      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to calculate payroll');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await payrollRunApi.generate(year, month);
      setGenerated(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate payroll');
    } finally {
      setIsGenerating(false);
    }
  };

  const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  // Step 1: Select Month
  if (step === 1) {
    return (
      <div>
        <ModuleHeader title="Run Payroll" icon={Calculator} iconColor="text-purple-600" />
        <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {existingRun && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                Payroll already exists for {MONTHS[month - 1]} {year} (Status: <strong>{existingRun.status}</strong>).
                Running again will recalculate and overwrite.
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleCalculate}
            disabled={isCalculating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            {isCalculating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
            ) : (
              <><Calculator className="w-4 h-4" /> Calculate Payroll <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>

        {/* Previous Runs */}
        {previousRuns.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Previous Runs ({year})</h3>
            <div className="space-y-2">
              {previousRuns.map((run: any) => (
                <div key={run.payroll_run_id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{MONTHS[run.payroll_month - 1]} {run.payroll_year}</span>
                    <span className="text-xs text-gray-400 ml-2">{run.run_number}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>{run.total_employees} employees</span>
                    <span className="font-mono">{fmt(run.total_net_pay)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === 'confirmed' ? 'bg-green-50 text-green-700' :
                      run.status === 'calculated' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{run.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    );
  }

  // Step 2: Review & Confirm
  return (
    <div>
      <ModuleHeader
        title={`Payroll Review \u2014 ${MONTHS[month - 1]} ${year}`}
        icon={Calculator}
        iconColor="text-purple-600"
        onClose={() => { setStep(1); setGenerated(false); }}
        additionalActions={
          !generated
            ? [{ label: isGenerating ? 'Generating...' : 'Confirm & Generate Slips', icon: isGenerating ? Loader2 : Check, onClick: handleGenerate, variant: 'success' as const, disabled: isGenerating }]
            : [{ label: 'Payroll Generated', icon: Check, onClick: () => {}, variant: 'default' as const, disabled: true }]
        }
      />
      <div className="p-6 max-w-7xl mx-auto">

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Summary Cards */}
      {calculation && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Gross Pay', value: calculation.total_gross, color: 'blue' },
            { label: 'Deductions', value: calculation.total_deductions, color: 'red' },
            { label: 'Net Pay', value: calculation.total_net_pay, color: 'green' },
            { label: 'Employer PF', value: calculation.total_employer_pf, color: 'purple' },
            { label: 'Employer ESI', value: calculation.total_employer_esi, color: 'amber' },
          ].map((card) => (
            <div key={card.label} className={`bg-white border border-gray-200 rounded-xl p-4`}>
              <div className="text-xs text-gray-500 mb-1">{card.label}</div>
              <div className="text-lg font-bold text-gray-900 font-mono">{fmt(card.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-Employee Breakdown */}
      {calculation?.slips && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Present</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Absent</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">LOP</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">PF</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">ESI</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">PT</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Deductions</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase font-bold">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {calculation.slips.map((slip) => (
                <tr key={slip.employee_id} className="border-b border-gray-50 hover:bg-gray-50/30">
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-gray-900">{slip.employee_name}</div>
                    <div className="text-xs text-gray-400">{slip.employee_code}</div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-green-600">{slip.days_present}</td>
                  <td className="py-2.5 px-4 text-right text-red-600">{slip.days_absent}</td>
                  <td className="py-2.5 px-4 text-right text-amber-600">{slip.lop_days}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{fmt(slip.gross_earned)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-600">{fmt(slip.pf_employee)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-600">{fmt(slip.esi_employee)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-600">{fmt(slip.professional_tax)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-red-600">{fmt(slip.total_deductions)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-green-700">{fmt(slip.net_pay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-medium">
                <td className="py-3 px-4 text-gray-700">Total ({calculation.slips.length} employees)</td>
                <td className="py-3 px-4" colSpan={3}></td>
                <td className="py-3 px-4 text-right font-mono">{fmt(calculation.total_gross)}</td>
                <td className="py-3 px-4" colSpan={3}></td>
                <td className="py-3 px-4 text-right font-mono text-red-600">{fmt(calculation.total_deductions)}</td>
                <td className="py-3 px-4 text-right font-mono font-bold text-green-700">{fmt(calculation.total_net_pay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </div>
    </div>
  );
};

export default PayrollRunFlow;
