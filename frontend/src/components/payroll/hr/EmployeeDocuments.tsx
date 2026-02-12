import React, { useState, useEffect, useRef } from 'react';
import { Folder, Upload, Eye, Trash2, Search, AlertTriangle, FileCheck } from 'lucide-react';
import { employeesApi } from '../../../services/api';
import ModuleHeader from '../../global/ui/ModuleHeader';

interface EmployeeDoc {
  id: string;
  employee_id: number;
  document_type: string;
  document_name: string;
  file_data: string; // base64 data URL
  uploaded_at: string;
  expiry_date?: string;
  notes?: string;
}

const DOC_TYPES = [
  { id: 'aadhar', label: 'Aadhar Card' },
  { id: 'pan', label: 'PAN Card' },
  { id: 'contract', label: 'Employment Contract' },
  { id: 'certificate', label: 'Educational Certificate' },
  { id: 'license', label: 'Drug License / DL' },
  { id: 'medical', label: 'Medical Certificate' },
  { id: 'other', label: 'Other' },
];

const STORAGE_KEY = 'payroll_employee_documents';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const loadDocs = (): EmployeeDoc[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};
const saveDocs = (docs: EmployeeDoc[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
};

const EmployeeDocuments: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number>(0);
  const [documents, setDocuments] = useState<EmployeeDoc[]>(loadDocs);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ document_type: 'aadhar', document_name: '', expiry_date: '', notes: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    employeesApi.getAll({ is_active: true, limit: 200 }).then((res: any) => {
      setEmployees(res?.data?.data || []);
    });
  }, []);

  const empDocs = documents.filter(d => d.employee_id === selectedEmpId);
  const selectedEmployee = employees.find((e: any) => e.employee_id === selectedEmpId);

  const filteredEmployees = employees.filter((e: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (e.full_name || e.first_name || '').toLowerCase().includes(term) ||
           (e.employee_code || '').toLowerCase().includes(term);
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmpId) return;
    setUploadError(null);

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File size must be less than 5MB');
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF, JPG, PNG files are allowed');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const newDoc: EmployeeDoc = {
        id: `${Date.now()}`,
        employee_id: selectedEmpId,
        document_type: uploadForm.document_type,
        document_name: uploadForm.document_name || file.name,
        file_data: reader.result as string,
        uploaded_at: new Date().toISOString(),
        expiry_date: uploadForm.expiry_date || undefined,
        notes: uploadForm.notes || undefined,
      };
      const updated = [...documents, newDoc];
      setDocuments(updated);
      saveDocs(updated);
      setShowUpload(false);
      setUploadForm({ document_type: 'aadhar', document_name: '', expiry_date: '', notes: '' });
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = (id: string) => {
    const updated = documents.filter(d => d.id !== id);
    setDocuments(updated);
    saveDocs(updated);
  };

  const handleView = (doc: EmployeeDoc) => {
    const w = window.open('');
    if (!w) return;
    if (doc.file_data.startsWith('data:application/pdf')) {
      w.document.write(`<iframe src="${doc.file_data}" style="width:100%;height:100vh;border:none;"></iframe>`);
    } else {
      w.document.write(`<img src="${doc.file_data}" style="max-width:100%;"/>`);
    }
  };

  const isExpiringSoon = (date?: string) => {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  const isExpired = (date?: string) => {
    if (!date) return false;
    return new Date(date).getTime() < Date.now();
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  // Doc count per employee
  const docCountMap: Record<number, number> = {};
  documents.forEach(d => { docCountMap[d.employee_id] = (docCountMap[d.employee_id] || 0) + 1; });

  return (
    <div>
      <ModuleHeader title="Employee Documents" icon={Folder} iconColor="text-orange-600" />

      <div className="p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-3 gap-6">
        {/* Left - Employee Selector */}
        <div className="col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employee..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredEmployees.map((emp: any) => (
                <button
                  key={emp.employee_id}
                  onClick={() => setSelectedEmpId(emp.employee_id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedEmpId === emp.employee_id
                      ? 'bg-orange-50 border border-orange-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{emp.full_name || emp.first_name}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-gray-400">{emp.employee_code}</span>
                    {docCountMap[emp.employee_id] > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {docCountMap[emp.employee_id]} docs
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right - Documents */}
        <div className="col-span-2">
          {!selectedEmpId ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
              <Folder className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p>Select an employee to view their documents</p>
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-sm font-medium text-gray-900">{selectedEmployee?.full_name || selectedEmployee?.first_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{empDocs.length} documents</span>
                </div>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <Upload className="w-4 h-4" /> Upload Document
                </button>
              </div>

              {/* Upload Form */}
              {showUpload && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                  {uploadError && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
                      <span>{uploadError}</span>
                      <button onClick={() => setUploadError(null)} className="text-red-500 hover:text-red-700 text-xs underline">Dismiss</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
                      <select
                        value={uploadForm.document_type}
                        onChange={(e) => setUploadForm(f => ({ ...f, document_type: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Document Name</label>
                      <input
                        type="text"
                        value={uploadForm.document_name}
                        onChange={(e) => setUploadForm(f => ({ ...f, document_name: e.target.value }))}
                        placeholder="e.g., Aadhar Front"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date (optional)</label>
                      <input
                        type="date"
                        value={uploadForm.expiry_date}
                        onChange={(e) => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <input
                        type="text"
                        value={uploadForm.notes}
                        onChange={(e) => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium cursor-pointer">
                      <Upload className="w-4 h-4" /> Choose File (PDF/JPG/PNG, max 5MB)
                      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" />
                    </label>
                    <button onClick={() => setShowUpload(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* Document List */}
              {empDocs.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
                  <FileCheck className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">No documents uploaded for this employee.</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Document</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Expiry</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empDocs.map((doc) => (
                        <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                          <td className="py-2.5 px-4">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {DOC_TYPES.find(t => t.id === doc.document_type)?.label || doc.document_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-sm font-medium text-gray-900">{doc.document_name}</span>
                            {doc.notes && <span className="text-xs text-gray-400 ml-2">({doc.notes})</span>}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-gray-600">{fmtDate(doc.uploaded_at)}</td>
                          <td className="py-2.5 px-4">
                            {doc.expiry_date ? (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                isExpired(doc.expiry_date)
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : isExpiringSoon(doc.expiry_date)
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-green-50 text-green-700 border border-green-200'
                              }`}>
                                {isExpired(doc.expiry_date) && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                {fmtDate(doc.expiry_date)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleView(doc)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default EmployeeDocuments;
