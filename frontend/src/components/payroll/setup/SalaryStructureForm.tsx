import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Search, Lightbulb, TrendingUp, ChevronDown, AlertCircle } from 'lucide-react';
import { salaryStructureApi, employeesApi } from '../../../services/api';

interface Props {
  structure: any | null;
  onClose: () => void;
  onSaved: () => void;
}

// ═══════════════════════════════════════════════════════════════
// PHARMA INDUSTRY SALARY TEMPLATES — Indian Tier 1/2/3
// Adjusted for thin-margin pharma distribution reality
// ═══════════════════════════════════════════════════════════════

interface SalaryTemplate {
  id: string;
  role: string;
  description: string;
  tier: string;
  basic_salary: number;
  hra: number;
  dearness_allowance: number;
  conveyance_allowance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowance: number;
  pf_applicable: boolean;
  esi_applicable: boolean;
  professional_tax_applicable: boolean;
  incentive_type: 'none' | 'target' | 'attendance' | 'performance';
  incentive_description: string;
  incentive_range: string;
  retention_tips: string[];
}

const SALARY_TEMPLATES: SalaryTemplate[] = [
  // ── SALES ROLES (Keep base low, incentive heavy) ──────
  {
    id: 'sales_rep_t23',
    role: 'Sales Representative / MR',
    description: 'Field sales, order collection, market coverage',
    tier: 'Tier 2/3',
    basic_salary: 5000,
    hra: 2500,
    dearness_allowance: 1000,
    conveyance_allowance: 1500,
    medical_allowance: 500,
    special_allowance: 1000,
    other_allowance: 500,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: true,
    incentive_type: 'target',
    incentive_description: '1% of collections above ₹3L target. ₹2,000 quarterly bonus on 100% target. Top performer: extra ₹1,000/mo.',
    incentive_range: '₹1,500 - ₹5,000/month',
    retention_tips: [
      'At ₹12K fixed, margin is tight — make incentives the real earning (can touch ₹17-18K with targets)',
      'Quarterly bonus lock-in: they forfeit if they leave mid-quarter (costs you nothing if they leave)',
      'Free chai/lunch at godown (₹30/day = ₹800/mo) — high emotional value, tiny cost',
      'Annual increment: 8-10%. Do it on time — delayed increment is #1 reason people look outside',
      'Give them a route/territory ownership — pride in "my area" keeps them longer than ₹500 raise',
    ],
  },
  {
    id: 'sales_rep_t1',
    role: 'Sales Representative / MR',
    description: 'Field sales, order collection, market coverage',
    tier: 'Tier 1',
    basic_salary: 8000,
    hra: 4000,
    dearness_allowance: 1500,
    conveyance_allowance: 2500,
    medical_allowance: 1000,
    special_allowance: 2000,
    other_allowance: 1000,
    pf_applicable: true,
    esi_applicable: false,
    professional_tax_applicable: true,
    incentive_type: 'target',
    incentive_description: '0.75% of collections above ₹5L target. ₹5,000 quarterly bonus on 100% target.',
    incentive_range: '₹2,000 - ₹8,000/month',
    retention_tips: [
      'Tier 1 market rate is ₹18-22K — keep fixed at ₹20K, let incentives push to ₹25-28K',
      'Phone reimbursement ₹300/month — tiny cost, everyone else charges',
      'Clear promotion path: Senior MR (18mo) → ASM (3yr). Written career ladder on wall.',
      'Annual increment: 10-12%. Star performers: 15% + new territory',
    ],
  },
  {
    id: 'area_manager',
    role: 'Area Sales Manager',
    description: 'Team lead, 3-5 MRs, area targets, key accounts',
    tier: 'All',
    basic_salary: 12000,
    hra: 6000,
    dearness_allowance: 2500,
    conveyance_allowance: 3000,
    medical_allowance: 1500,
    special_allowance: 3500,
    other_allowance: 1500,
    pf_applicable: true,
    esi_applicable: false,
    professional_tax_applicable: true,
    incentive_type: 'target',
    incentive_description: 'Team target: 0.3% of team collections above target. Override: ₹300 per MR who hits target.',
    incentive_range: '₹3,000 - ₹10,000/month',
    retention_tips: [
      'KEY ROLE: Losing ASM = losing his MR relationships + 3-6 months rebuilding that area',
      '₹30K fixed is fair for Tier 2/3 — let incentive take it to ₹35-40K on good months',
      '2-wheeler loan: deduct EMI from salary (you guarantee, zero cash out) — massive retention',
      'Annual target bonus: 15 days salary (not full month — margin conscious)',
      'Title matters: "Regional Manager" after 2 years — free to give, hard for competitor to match',
    ],
  },
  // ── OPERATIONS (Keep it simple, attendance = money) ──
  {
    id: 'delivery_boy',
    role: 'Delivery Boy / Helper',
    description: 'Last-mile delivery, order dispatch, collections',
    tier: 'Tier 2/3',
    basic_salary: 4000,
    hra: 1500,
    dearness_allowance: 500,
    conveyance_allowance: 500,
    medical_allowance: 300,
    special_allowance: 200,
    other_allowance: 0,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: false,
    incentive_type: 'attendance',
    incentive_description: 'Full attendance: ₹1,000/month. ≤2 absent: ₹500. Festival bonus: ₹1,000 (Diwali).',
    incentive_range: '₹500 - ₹1,000/month',
    retention_tips: [
      'Market rate in Tier 2/3 is ₹7-8K — at ₹7K fixed + ₹1K attendance, you match it',
      'They leave for ₹500 more — attendance bonus makes that ₹500 gap irrelevant',
      'Company fuel (₹50/day = ₹1,300/mo) feels like "free petrol" — better than ₹1,300 in CTC',
      'Festival advance ₹3,000 (recover in 2 months) — creates 2-month lock-in, costs you nothing',
      'Diwali + Holi bonus ₹1,000 each — ₹2,000/year, massive goodwill at this salary level',
      'Must be ≥ state minimum wage (check your state slab)',
    ],
  },
  {
    id: 'warehouse_staff',
    role: 'Warehouse / Godown Staff',
    description: 'Stock management, packing, dispatch, inventory',
    tier: 'Tier 2/3',
    basic_salary: 4500,
    hra: 2000,
    dearness_allowance: 800,
    conveyance_allowance: 500,
    medical_allowance: 500,
    special_allowance: 500,
    other_allowance: 200,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: false,
    incentive_type: 'attendance',
    incentive_description: 'Attendance bonus: ₹800/month (full). Overtime: ₹50/hr for >8hrs (quarter-end).',
    incentive_range: '₹800 - ₹2,000/month',
    retention_tips: [
      'Tier 2/3 godown staff: ₹9-10K is market — at ₹9.5K + attendance, you are competitive',
      'PF + ESI = real retention here — many local shops dont give it, highlight this',
      'Overtime during quarter-end dispatch rush — they earn ₹1-2K extra, you get throughput',
      'Uniform + chappals (₹1,500/year) — surprisingly effective, creates belonging',
      'Promote to "supervisor" after 2 years with ₹1,500 raise — title + money, low cost',
    ],
  },
  // ── BACK OFFICE (Semi-skilled, scarce in small towns) ─
  {
    id: 'accountant',
    role: 'Accountant / Back Office',
    description: 'Billing, GST filing, ledger management, MIS',
    tier: 'Tier 2/3',
    basic_salary: 7000,
    hra: 3500,
    dearness_allowance: 1500,
    conveyance_allowance: 1000,
    medical_allowance: 1000,
    special_allowance: 2000,
    other_allowance: 500,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: true,
    incentive_type: 'performance',
    incentive_description: 'Quarterly: ₹2,000 for zero GST errors. Annual: ₹5,000 for clean audit year.',
    incentive_range: '₹2,000/quarter',
    retention_tips: [
      'Tier 2/3 accountant market: ₹14-18K — at ₹16.5K you are competitive',
      'GST accuracy bonus pays for itself — one wrong filing penalty > full year bonus',
      'Allow flexibility during GST filing week (they are stressed anyway) — zero cost',
      'ERP/Tally training: ₹2-3K one-time, makes them more productive + feel invested in',
      'Annual increment: 8-10%. Give title "Senior Accountant" after 2 years (free retention)',
    ],
  },
  {
    id: 'accountant_t1',
    role: 'Accountant / Back Office',
    description: 'Billing, GST filing, ledger management, MIS',
    tier: 'Tier 1',
    basic_salary: 9000,
    hra: 4500,
    dearness_allowance: 2000,
    conveyance_allowance: 1500,
    medical_allowance: 1000,
    special_allowance: 2500,
    other_allowance: 500,
    pf_applicable: true,
    esi_applicable: false,
    professional_tax_applicable: true,
    incentive_type: 'performance',
    incentive_description: 'Quarterly: ₹3,000 for zero GST errors. Annual: ₹8,000 for clean audit year.',
    incentive_range: '₹3,000/quarter',
    retention_tips: [
      'Tier 1 accountant market: ₹20-25K — at ₹21K fixed you need accuracy bonus to retain',
      'Allow WFH 1 day/week (if possible) — high-value perk competing shops cant match',
      'Annual increment: 10-12%. Key person with 3+ years: make them "Accounts Head"',
    ],
  },
  // ── SPECIALIZED (Pharmacist = your license, dont be cheap) ──
  {
    id: 'pharmacist',
    role: 'Pharmacist (Drug License Holder)',
    description: 'Regulatory compliance, drug license, quality checks',
    tier: 'Tier 2/3',
    basic_salary: 8000,
    hra: 4000,
    dearness_allowance: 1500,
    conveyance_allowance: 1500,
    medical_allowance: 1000,
    special_allowance: 2500,
    other_allowance: 500,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: true,
    incentive_type: 'none',
    incentive_description: 'License retention bonus: ₹3,000/quarter for keeping drug license active on company name.',
    incentive_range: '₹3,000/quarter',
    retention_tips: [
      'CRITICAL: Pharmacist leaves = drug license at risk = ₹2-5L re-registration + months of delay',
      '₹19K + ₹12K/year license bonus = ₹20K effective. Market in Tier 2/3: ₹18-22K — you are fair',
      'NEVER delay salary — pharmacists in demand, they walk for 1 late payment',
      'License retention bonus is insurance: ₹12K/year to protect ₹2-5L asset',
      'Annual increment: 10-12%. After 3 years: profit-share talk (0.05% of revenue) — locks them in',
    ],
  },
  {
    id: 'pharmacist_t1',
    role: 'Pharmacist (Drug License Holder)',
    description: 'Regulatory compliance, drug license, quality checks',
    tier: 'Tier 1',
    basic_salary: 10000,
    hra: 5000,
    dearness_allowance: 2000,
    conveyance_allowance: 2000,
    medical_allowance: 1500,
    special_allowance: 3500,
    other_allowance: 1000,
    pf_applicable: true,
    esi_applicable: false,
    professional_tax_applicable: true,
    incentive_type: 'none',
    incentive_description: 'License retention bonus: ₹5,000/quarter for keeping drug license active on company name.',
    incentive_range: '₹5,000/quarter',
    retention_tips: [
      'Tier 1 pharmacist market: ₹25-30K. At ₹25K + ₹20K/year bonus = competitive',
      'Same rule: NEVER delay salary. One late payment and they start looking.',
      'Health insurance for family (₹3L, ₹3-4K/year premium) — pharmacists value this',
    ],
  },
  {
    id: 'branch_manager',
    role: 'Branch Manager',
    description: 'Full P&L ownership, team management, key decisions',
    tier: 'All',
    basic_salary: 15000,
    hra: 7000,
    dearness_allowance: 2500,
    conveyance_allowance: 3500,
    medical_allowance: 2000,
    special_allowance: 4500,
    other_allowance: 1500,
    pf_applicable: true,
    esi_applicable: false,
    professional_tax_applicable: true,
    incentive_type: 'target',
    incentive_description: 'Branch profit bonus: 1.5% of monthly branch profit above target. Annual: 15 days salary on target.',
    incentive_range: '₹5,000 - ₹18,000/month',
    retention_tips: [
      'Branch Manager IS your business in that city — losing one = 6 months of chaos',
      '₹36K fixed is tight but fair for Tier 2/3. Incentive should make it ₹45-55K on good months.',
      'Profit share (1.5%) means: if branch does ₹5L profit, he gets ₹7.5K. Self-funded retention.',
      '2-wheeler/car loan assistance (EMI deduction, you guarantee) — zero cash outflow',
      'Health insurance for family (₹5L cover, ₹5-6K/year premium) — high ROI retention',
      'Title: "Business Head" after 3 years. Visiting card. These things matter.',
    ],
  },
  // ── ADMIN (Minimum wage zone — compliance first) ──────
  {
    id: 'peon_admin',
    role: 'Peon / Office Assistant',
    description: 'Office maintenance, errands, basic support',
    tier: 'Tier 2/3',
    basic_salary: 3500,
    hra: 1500,
    dearness_allowance: 500,
    conveyance_allowance: 400,
    medical_allowance: 300,
    special_allowance: 300,
    other_allowance: 0,
    pf_applicable: true,
    esi_applicable: true,
    professional_tax_applicable: false,
    incentive_type: 'attendance',
    incentive_description: 'Full attendance: ₹500/month. Diwali + Holi bonus: ₹1,000 each.',
    incentive_range: '₹500/month',
    retention_tips: [
      'Market rate: ₹6-7K. At ₹6.5K + ₹500 attendance you are right at market.',
      'Tea + lunch (₹25/day = ₹650/mo) — massive impact at this level, tiny cost for you',
      'Festival advance ₹2,000 (recover in 2 months) — creates mini lock-in',
      'Uniform annually (₹1,000) — belonging + professionalism',
      'Must check state minimum wage slab — non-compliance risk is not worth ₹500 saving',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════

const SalaryStructureForm: React.FC<Props> = ({ structure, onClose, onSaved }) => {
  const isEdit = !!structure;

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SalaryTemplate | null>(null);
  const [showTemplates, setShowTemplates] = useState(!isEdit);

  const [form, setForm] = useState({
    employee_id: structure?.employee_id || 0,
    employee_name: structure?.employee_name || '',
    basic_salary: structure?.basic_salary || 0,
    hra: structure?.hra || 0,
    dearness_allowance: structure?.dearness_allowance || 0,
    conveyance_allowance: structure?.conveyance_allowance || 0,
    medical_allowance: structure?.medical_allowance || 0,
    special_allowance: structure?.special_allowance || 0,
    other_allowance: structure?.other_allowance || 0,
    pf_applicable: structure?.pf_applicable ?? true,
    pf_percent: structure?.pf_percent || 12,
    esi_applicable: structure?.esi_applicable ?? false,
    professional_tax_applicable: structure?.professional_tax_applicable ?? true,
    effective_from: structure?.effective_from?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  });

  const gross = form.basic_salary + form.hra + form.dearness_allowance +
    form.conveyance_allowance + form.medical_allowance + form.special_allowance + form.other_allowance;

  const pfBase = Math.min(form.basic_salary, 15000);
  const employerPF = form.pf_applicable ? Math.round(pfBase * 0.12) : 0;
  const employerESI = form.esi_applicable && gross <= 21000 ? Math.round(gross * 0.0325) : 0;
  const employeePF = form.pf_applicable ? Math.round(pfBase * 0.12) : 0;
  const employeeESI = form.esi_applicable && gross <= 21000 ? Math.round(gross * 0.0075) : 0;
  const totalEmployerCost = gross + employerPF + employerESI;
  const annualCTC = totalEmployerCost * 12;

  useEffect(() => {
    if (employeeSearch.length >= 2) {
      employeesApi.search(employeeSearch).then((res: any) => {
        const data = res?.data?.data || [];
        setEmployees(Array.isArray(data) ? data : []);
        setShowDropdown(true);
      });
    } else {
      setShowDropdown(false);
    }
  }, [employeeSearch]);

  const selectEmployee = (emp: any) => {
    setForm(prev => ({ ...prev, employee_id: emp.employee_id, employee_name: emp.full_name || emp.employee_name }));
    setEmployeeSearch(emp.full_name || emp.employee_name || '');
    setShowDropdown(false);
  };

  const applyTemplate = (template: SalaryTemplate) => {
    setSelectedTemplate(template);
    setForm(prev => ({
      ...prev,
      basic_salary: template.basic_salary,
      hra: template.hra,
      dearness_allowance: template.dearness_allowance,
      conveyance_allowance: template.conveyance_allowance,
      medical_allowance: template.medical_allowance,
      special_allowance: template.special_allowance,
      other_allowance: template.other_allowance,
      pf_applicable: template.pf_applicable,
      esi_applicable: template.esi_applicable,
      professional_tax_applicable: template.professional_tax_applicable,
    }));
    setShowTemplates(false);
  };

  const handleSave = async () => {
    if (!form.employee_id) return;
    setSaving(true);
    try {
      if (isEdit) {
        await salaryStructureApi.update(structure.salary_structure_id, form);
      } else {
        await salaryStructureApi.create(form);
      }
      onSaved();
    } catch {
      // Save failed — form stays open for retry
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const fmt = (val: number) => `₹${(val || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Salary Structure' : 'New Salary Structure'}
          </h2>
          <p className="text-sm text-gray-500">
            {isEdit ? `Editing structure for ${structure.employee_name}` : 'Choose a template or build from scratch'}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !form.employee_id}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Save Structure'}
        </button>
      </div>

      {/* ── TEMPLATE SELECTOR ────────────────────────── */}
      {!isEdit && (
        <div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 w-full p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl text-left hover:from-purple-100 hover:to-indigo-100 transition-colors"
          >
            <Lightbulb className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-purple-900">
                {selectedTemplate ? `Template: ${selectedTemplate.role} (${selectedTemplate.tier})` : 'Use Industry Template'}
              </div>
              <div className="text-xs text-purple-600">
                {selectedTemplate
                  ? `Gross: ${fmt(selectedTemplate.basic_salary + selectedTemplate.hra + selectedTemplate.dearness_allowance + selectedTemplate.conveyance_allowance + selectedTemplate.medical_allowance + selectedTemplate.special_allowance + selectedTemplate.other_allowance)} — click to change`
                  : 'Pre-built salary structures for Indian pharma distribution roles'}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-purple-600 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>

          {showTemplates && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {SALARY_TEMPLATES.map((t) => {
                const tGross = t.basic_salary + t.hra + t.dearness_allowance + t.conveyance_allowance + t.medical_allowance + t.special_allowance + t.other_allowance;
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className={`text-left p-3 rounded-xl border transition-all hover:shadow-md ${
                      selectedTemplate?.id === t.id
                        ? 'bg-purple-50 border-purple-300'
                        : 'bg-white border-gray-200 hover:border-purple-200'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{t.role}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{t.description}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t.tier}</span>
                      <span className="text-xs font-mono font-medium text-green-700">{fmt(tGross)}/mo</span>
                      {t.incentive_type !== 'none' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">+ incentive</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN FORM GRID ──────────────────────────── */}
      <div className="grid grid-cols-3 gap-6">
        {/* LEFT: Employee + Earnings + Statutory (col-span-2) */}
        <div className="col-span-2 space-y-5">
          {/* Employee Search */}
          {!isEdit ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search employee by name or code..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {showDropdown && employees.length > 0 && (
                <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {employees.map((emp: any) => (
                    <button
                      key={emp.employee_id}
                      onClick={() => selectEmployee(emp)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors text-sm"
                    >
                      <span className="font-medium">{emp.full_name || emp.employee_name}</span>
                      <span className="text-gray-500 ml-2">{emp.employee_code}</span>
                      {emp.designation && <span className="text-gray-400 ml-2">({emp.designation})</span>}
                    </button>
                  ))}
                </div>
              )}
              {form.employee_id > 0 && (
                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  Selected: <span className="font-medium">{form.employee_name}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                {structure.employee_name} ({structure.employee_code})
              </div>
            </div>
          )}

          {/* Monthly Earnings */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">Monthly Earnings</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'basic_salary', label: 'Basic Salary', hint: '40-50% of gross' },
                { key: 'hra', label: 'HRA', hint: '40-50% of basic' },
                { key: 'dearness_allowance', label: 'Dearness Allowance', hint: 'Cost of living' },
                { key: 'conveyance_allowance', label: 'Conveyance / Travel', hint: 'For daily commute' },
                { key: 'medical_allowance', label: 'Medical Allowance', hint: 'Health expenses' },
                { key: 'special_allowance', label: 'Special Allowance', hint: 'Balancing component' },
                { key: 'other_allowance', label: 'Other Allowance', hint: 'Flexible component' },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label} <span className="text-gray-300">({hint})</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input
                      type="number"
                      value={(form as any)[key] || ''}
                      onChange={(e) => updateField(key, parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Statutory Deductions */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">Statutory Deductions</label>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.pf_applicable} onChange={(e) => updateField('pf_applicable', e.target.checked)} className="rounded text-blue-600" />
                <span>PF Applicable (12% of Basic, max ₹15,000 base)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.esi_applicable} onChange={(e) => updateField('esi_applicable', e.target.checked)} className="rounded text-blue-600" />
                <span>ESI Applicable (if gross ≤ ₹21,000) {gross > 21000 && <span className="text-amber-600">[Not eligible — gross exceeds ₹21K]</span>}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.professional_tax_applicable} onChange={(e) => updateField('professional_tax_applicable', e.target.checked)} className="rounded text-blue-600" />
                <span>Professional Tax (Maharashtra slabs)</span>
              </label>
            </div>
          </div>

          {/* Effective From */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Effective From</label>
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) => updateField('effective_from', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* RIGHT SIDEBAR: CTC Summary + Tips (col-span-1) */}
        <div className="space-y-4">
          {/* CTC Cards */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-xs text-blue-600 mb-0.5">Monthly Gross</div>
            <div className="text-xl font-bold text-blue-800 font-mono">{fmt(gross)}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-xs text-green-600 mb-0.5">Employer Cost / Month</div>
            <div className="text-xl font-bold text-green-800 font-mono">{fmt(totalEmployerCost)}</div>
            <div className="text-[10px] text-green-600 mt-0.5">PF: {fmt(employerPF)} + ESI: {fmt(employerESI)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
            <div className="text-xs text-purple-600 mb-0.5">Annual CTC</div>
            <div className="text-xl font-bold text-purple-800 font-mono">{fmt(annualCTC)}</div>
          </div>

          {/* Take Home */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Approx. Take Home</div>
            <div className="text-lg font-bold text-gray-900 font-mono">
              {fmt(gross - employeePF - employeeESI - (form.professional_tax_applicable && gross > 10000 ? 200 : 0))}
            </div>
            <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-gray-400">
              {form.pf_applicable && <span>PF: -{fmt(employeePF)}</span>}
              {form.esi_applicable && gross <= 21000 && <span>ESI: -{fmt(employeeESI)}</span>}
              {form.professional_tax_applicable && <span>PT: -₹200</span>}
            </div>
          </div>

          {/* Incentive Recommendation */}
          {selectedTemplate && selectedTemplate.incentive_type !== 'none' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
                <span className="text-xs font-semibold text-amber-900">
                  {selectedTemplate.incentive_type === 'target' ? 'Target' : selectedTemplate.incentive_type === 'attendance' ? 'Attendance' : 'Performance'} Incentive
                </span>
              </div>
              <div className="text-xs font-mono font-medium text-amber-800 mb-1.5">{selectedTemplate.incentive_range}</div>
              <p className="text-xs text-amber-700 leading-relaxed">{selectedTemplate.incentive_description}</p>
            </div>
          )}

          {/* Margin Reality */}
          {selectedTemplate && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                <span className="text-xs font-semibold text-rose-900">Margin Check</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-rose-700">
                  <span>Costs you</span>
                  <span className="font-mono font-medium">{fmt(totalEmployerCost)}/mo</span>
                </div>
                <div className="flex items-center justify-between text-rose-700">
                  <span>Revenue @3% margin</span>
                  <span className="font-mono font-medium">{fmt(Math.round(totalEmployerCost / 0.03))}/mo</span>
                </div>
                <div className="flex items-center justify-between text-rose-700">
                  <span>Revenue @5% margin</span>
                  <span className="font-mono font-medium">{fmt(Math.round(totalEmployerCost / 0.05))}/mo</span>
                </div>
              </div>
              <p className="text-[10px] text-rose-600 mt-2">Keep payroll under 3-4% of revenue</p>
            </div>
          )}
        </div>
      </div>

      {/* ── RETENTION TIPS (full width below form) ─────── */}
      {selectedTemplate && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-semibold text-emerald-900">Retention Strategy — {selectedTemplate.role} ({selectedTemplate.tier})</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {selectedTemplate.retention_tips.map((tip, i) => (
              <div key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                <span className="text-emerald-400 mt-1 flex-shrink-0">•</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Save Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to List
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.employee_id}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : isEdit ? 'Update Structure' : 'Create Structure'}
        </button>
      </div>
    </div>
  );
};

export default SalaryStructureForm;
