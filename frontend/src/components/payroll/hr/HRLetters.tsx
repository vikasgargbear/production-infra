import React, { useState, useEffect, useRef } from 'react';
import { FileText, Printer, Search, Loader2 } from 'lucide-react';
import { employeesApi, salaryStructureApi } from '../../../services/api';
import { generateLetter, LETTER_TYPES, LetterData, LetterType } from '../utils/hrLetterTemplates';
import ModuleHeader from '../../global/ui/ModuleHeader';

const HRLetters: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [letterType, setLetterType] = useState<LetterType>('offer');
  const [previewHtml, setPreviewHtml] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [salaryData, setSalaryData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Custom fields
  const [customFields, setCustomFields] = useState({
    last_working_date: '',
    increment_percent: 0,
    new_salary: 0,
    old_salary: 0,
  });

  // Company info
  const companyName = localStorage.getItem('companyName') || 'Your Company';
  const companyAddress = localStorage.getItem('companyAddress') || 'Company Address';

  useEffect(() => {
    employeesApi.getAll({ is_active: true, limit: 200 }).then((res: any) => {
      setEmployees(res?.data?.data || []);
    });
  }, []);

  const handleEmployeeSelect = async (empId: number) => {
    const emp = employees.find((e: any) => e.employee_id === empId);
    if (!emp) return;
    setSelectedEmployee(emp);
    setIsLoading(true);
    try {
      const res = await salaryStructureApi.getByEmployee(empId);
      const sal = res?.data?.data;
      setSalaryData(sal || null);
    } catch {
      setSalaryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    if (!selectedEmployee) return;

    const data: LetterData = {
      employee_name: selectedEmployee.full_name || `${selectedEmployee.first_name} ${selectedEmployee.last_name || ''}`.trim(),
      employee_code: selectedEmployee.employee_code,
      designation: selectedEmployee.designation || 'Employee',
      department: selectedEmployee.department_name || 'General',
      joining_date: selectedEmployee.joining_date || new Date().toISOString().split('T')[0],
      last_working_date: customFields.last_working_date || undefined,
      monthly_gross: salaryData?.gross_salary || salaryData?.basic || 0,
      annual_ctc: salaryData?.gross_salary ? salaryData.gross_salary * 12 : 0,
      basic: salaryData?.basic || 0,
      hra: salaryData?.hra || 0,
      company_name: companyName,
      company_address: companyAddress,
      letter_date: new Date().toISOString().split('T')[0],
      increment_percent: customFields.increment_percent || undefined,
      new_salary: customFields.new_salary || undefined,
      old_salary: customFields.old_salary || salaryData?.gross_salary || undefined,
    };

    setPreviewHtml(generateLetter(letterType, data));
  };

  const handlePrint = () => {
    if (!previewHtml) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(previewHtml);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const filteredEmployees = employees.filter((e: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = (e.full_name || e.first_name || '').toLowerCase();
    const code = (e.employee_code || '').toLowerCase();
    return name.includes(term) || code.includes(term);
  });

  const needsLastWorkingDate = letterType === 'relieving' || letterType === 'experience';
  const needsIncrementFields = letterType === 'increment';

  return (
    <div>
      <ModuleHeader title="HR Letters" icon={FileText} iconColor="text-indigo-600" />

      <div className="p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-5 gap-6">
        {/* Left Panel - Form */}
        <div className="col-span-2 space-y-4">
          {/* Employee Search */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or code..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={selectedEmployee?.employee_id || ''}
              onChange={(e) => handleEmployeeSelect(parseInt(e.target.value))}
              size={5}
              className="w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {filteredEmployees.map((e: any) => (
                <option key={e.employee_id} value={e.employee_id} className="py-1 px-2">
                  {e.full_name || e.first_name} ({e.employee_code}) - {e.designation}
                </option>
              ))}
            </select>

            {selectedEmployee && (
              <div className="mt-3 p-3 bg-indigo-50 rounded-lg text-sm">
                <div className="font-medium text-indigo-900">{selectedEmployee.full_name || selectedEmployee.first_name}</div>
                <div className="text-indigo-700">{selectedEmployee.designation} | {selectedEmployee.employee_code}</div>
                {salaryData && <div className="text-indigo-600 mt-1">Gross: ₹{(salaryData.gross_salary || 0).toLocaleString('en-IN')}/mo</div>}
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600 mt-1" />}
              </div>
            )}
          </div>

          {/* Letter Type */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Letter Type</label>
            <div className="space-y-1">
              {LETTER_TYPES.map((lt) => (
                <label
                  key={lt.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    letterType === lt.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="letterType"
                    value={lt.id}
                    checked={letterType === lt.id}
                    onChange={() => setLetterType(lt.id)}
                    className="text-indigo-600"
                  />
                  <span className="text-sm">{lt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Fields */}
          {(needsLastWorkingDate || needsIncrementFields) && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Details</label>
              {needsLastWorkingDate && (
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Last Working Date</label>
                  <input
                    type="date"
                    value={customFields.last_working_date}
                    onChange={(e) => setCustomFields(f => ({ ...f, last_working_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {needsIncrementFields && (
                <>
                  <div className="mb-3">
                    <label className="block text-xs text-gray-500 mb-1">Increment %</label>
                    <input
                      type="number"
                      value={customFields.increment_percent || ''}
                      onChange={(e) => setCustomFields(f => ({ ...f, increment_percent: parseFloat(e.target.value) || 0 }))}
                      placeholder="e.g., 15"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs text-gray-500 mb-1">New Monthly Gross (₹)</label>
                    <input
                      type="number"
                      value={customFields.new_salary || ''}
                      onChange={(e) => setCustomFields(f => ({ ...f, new_salary: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!selectedEmployee}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> Generate Preview
          </button>
        </div>

        {/* Right Panel - Preview */}
        <div className="col-span-3">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <span className="text-sm font-medium text-gray-700">Letter Preview</span>
              {previewHtml && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / Download
                </button>
              )}
            </div>
            <div className="p-6 min-h-[600px]">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[700px] border border-gray-100 rounded-lg"
                  title="Letter Preview"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                  <FileText className="w-12 h-12 mb-3 text-gray-200" />
                  <p className="text-sm">Select an employee and click "Generate Preview"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default HRLetters;
