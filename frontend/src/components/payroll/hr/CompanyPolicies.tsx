import React, { useState } from 'react';
import { BookOpen, Plus, Edit2, Eye, X, Save, Trash2 } from 'lucide-react';

interface Policy {
  id: string;
  policy_name: string;
  policy_category: string;
  description: string;
  content: string;
  effective_date: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { id: 'hr', label: 'HR' },
  { id: 'leave', label: 'Leave' },
  { id: 'travel', label: 'Travel' },
  { id: 'safety', label: 'Safety' },
  { id: 'general', label: 'General' },
];

const CATEGORY_COLORS: Record<string, string> = {
  hr: 'bg-blue-50 text-blue-700 border-blue-200',
  leave: 'bg-green-50 text-green-700 border-green-200',
  travel: 'bg-purple-50 text-purple-700 border-purple-200',
  safety: 'bg-red-50 text-red-700 border-red-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200',
};

const STORAGE_KEY = 'payroll_company_policies';

const loadPolicies = (): Policy[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};
const savePolicies = (policies: Policy[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
};

const CompanyPolicies: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [policies, setPolicies] = useState<Policy[]>(loadPolicies);
  const [activeCategory, setActiveCategory] = useState('hr');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);

  const [form, setForm] = useState({
    policy_name: '',
    policy_category: 'hr',
    description: '',
    content: '',
    effective_date: new Date().toISOString().split('T')[0],
  });

  const filteredPolicies = policies.filter(p => p.policy_category === activeCategory && p.is_active);

  const handleSave = () => {
    if (!form.policy_name || !form.content) return;

    if (editingId) {
      // Update = create new version, deactivate old
      const old = policies.find(p => p.id === editingId);
      const updated = policies.map(p =>
        p.id === editingId ? { ...p, is_active: false } : p
      );
      const newPolicy: Policy = {
        id: `${Date.now()}`,
        ...form,
        version: (old?.version || 0) + 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const all = [...updated, newPolicy];
      setPolicies(all);
      savePolicies(all);
    } else {
      const newPolicy: Policy = {
        id: `${Date.now()}`,
        ...form,
        version: 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const updated = [...policies, newPolicy];
      setPolicies(updated);
      savePolicies(updated);
    }

    setForm({ policy_name: '', policy_category: activeCategory, description: '', content: '', effective_date: new Date().toISOString().split('T')[0] });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (policy: Policy) => {
    setForm({
      policy_name: policy.policy_name,
      policy_category: policy.policy_category,
      description: policy.description,
      content: policy.content,
      effective_date: policy.effective_date,
    });
    setEditingId(policy.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const updated = policies.map(p => p.id === id ? { ...p, is_active: false } : p);
    setPolicies(updated);
    savePolicies(updated);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-50 rounded-xl">
            <BookOpen className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Company Policies</h1>
            <p className="text-sm text-gray-500">Create & manage company policies</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(f => ({ ...f, policy_category: activeCategory })); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Create Policy
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeCategory === cat.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{editingId ? 'Edit Policy (creates new version)' : 'Create New Policy'}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Policy Name</label>
              <input
                type="text"
                value={form.policy_name}
                onChange={(e) => setForm(f => ({ ...f, policy_name: e.target.value }))}
                placeholder="e.g., Annual Leave Policy"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select
                  value={form.policy_category}
                  onChange={(e) => setForm(f => ({ ...f, policy_category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Effective From</label>
                <input
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => setForm(f => ({ ...f, effective_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this policy"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Policy Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              placeholder="Write the full policy content here..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Save className="w-4 h-4" /> {editingId ? 'Save New Version' : 'Create Policy'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Policy Cards */}
      {filteredPolicies.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No policies in this category.</p>
          <p className="text-xs mt-1">Click "Create Policy" to add one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredPolicies.map(policy => (
            <div key={policy.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{policy.policy_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[policy.policy_category]}`}>
                      {policy.policy_category}
                    </span>
                    <span className="text-xs text-gray-400">v{policy.version}</span>
                    <span className="text-xs text-gray-400">Effective: {fmtDate(policy.effective_date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewingPolicy(policy)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(policy)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(policy.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {policy.description && <p className="text-sm text-gray-600 mt-2">{policy.description}</p>}
              <p className="text-xs text-gray-400 mt-2 line-clamp-2">{policy.content.substring(0, 150)}...</p>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {viewingPolicy && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{viewingPolicy.policy_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[viewingPolicy.policy_category]}`}>
                    {viewingPolicy.policy_category}
                  </span>
                  <span className="text-xs text-gray-400">Version {viewingPolicy.version}</span>
                  <span className="text-xs text-gray-400">Effective: {fmtDate(viewingPolicy.effective_date)}</span>
                </div>
              </div>
              <button onClick={() => setViewingPolicy(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {viewingPolicy.description && (
                <p className="text-sm text-gray-600 mb-4 italic">{viewingPolicy.description}</p>
              )}
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{viewingPolicy.content}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyPolicies;
