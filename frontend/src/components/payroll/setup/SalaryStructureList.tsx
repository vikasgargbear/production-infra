import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Wallet, Edit2 } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { salaryStructureApi } from '../../../services/api';
import SalaryStructureForm from './SalaryStructureForm';

interface SalaryStructure {
  salary_structure_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  designation?: string;
  department_name?: string;
  basic_salary: number;
  hra: number;
  dearness_allowance: number;
  conveyance_allowance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowance: number;
  gross_salary: number;
  pf_applicable: boolean;
  esi_applicable: boolean;
  professional_tax_applicable: boolean;
  effective_from: string;
  is_active: boolean;
}

const SalaryStructureList: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingStructure, setEditingStructure] = useState<SalaryStructure | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await salaryStructureApi.getAll();
      const data = res?.data?.data || res?.data || [];
      setStructures(Array.isArray(data) ? data : []);
    } catch {
      // error silently handled - loading state resets in finally
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = structures.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (s.employee_name || '').toLowerCase().includes(term) ||
           (s.employee_code || '').toLowerCase().includes(term);
  });

  const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString('en-IN')}`;

  const openForm = (structure: SalaryStructure | null) => {
    setEditingStructure(structure);
    setView('form');
  };

  const closeForm = () => {
    setEditingStructure(null);
    setView('list');
  };

  const handleSaved = () => {
    closeForm();
    loadData();
  };

  // ── FORM VIEW ─────────────────────────────────
  if (view === 'form') {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <SalaryStructureForm
          structure={editingStructure}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────
  return (
    <div>
      <ModuleHeader
        title="Salary Structures"
        icon={Wallet}
        iconColor="text-blue-600"
        additionalActions={[{
          label: 'Add Structure',
          icon: Plus,
          onClick: () => openForm(null),
          variant: 'primary' as const,
        }]}
      />
      <div className="p-6 max-w-7xl mx-auto">

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by employee name or code..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {structures.length === 0 ? 'No salary structures configured yet. Add one to get started.' : 'No results found.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Basic</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">HRA</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">PF</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">ESI</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.salary_structure_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-sm text-gray-900">{s.employee_name}</div>
                    <div className="text-xs text-gray-500">{s.employee_code}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{s.designation || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono">{formatCurrency(s.basic_salary)}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono">{formatCurrency(s.hra)}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono font-medium">{formatCurrency(s.gross_salary)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.pf_applicable ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.pf_applicable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.esi_applicable ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.esi_applicable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openForm(s)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
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

export default SalaryStructureList;
