import React, { useState } from 'react';
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: 'national' | 'regional' | 'company';
  isOptional: boolean;
}

const INDIAN_HOLIDAYS: Omit<Holiday, 'id'>[] = [
  { date: '-01-26', name: 'Republic Day', type: 'national', isOptional: false },
  { date: '-03-14', name: 'Holi', type: 'national', isOptional: false },
  { date: '-04-14', name: 'Dr. Ambedkar Jayanti', type: 'national', isOptional: false },
  { date: '-04-18', name: 'Good Friday', type: 'national', isOptional: true },
  { date: '-05-01', name: 'May Day', type: 'regional', isOptional: true },
  { date: '-08-15', name: 'Independence Day', type: 'national', isOptional: false },
  { date: '-08-27', name: 'Janmashtami', type: 'national', isOptional: false },
  { date: '-10-02', name: 'Gandhi Jayanti', type: 'national', isOptional: false },
  { date: '-10-12', name: 'Dussehra', type: 'national', isOptional: false },
  { date: '-10-31', name: 'Diwali', type: 'national', isOptional: false },
  { date: '-11-01', name: 'Diwali (Day 2)', type: 'national', isOptional: false },
  { date: '-11-15', name: 'Guru Nanak Jayanti', type: 'national', isOptional: false },
  { date: '-12-25', name: 'Christmas', type: 'national', isOptional: false },
];

const STORAGE_KEY = 'payroll_holidays';

const TYPE_BADGES: Record<string, string> = {
  national: 'bg-blue-50 text-blue-700 border-blue-200',
  regional: 'bg-purple-50 text-purple-700 border-purple-200',
  company: 'bg-amber-50 text-amber-700 border-amber-200',
};

const loadHolidays = (): Holiday[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
};

const saveHolidays = (holidays: Holiday[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holidays));
};

const HolidayCalendar: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>(loadHolidays);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', name: '', type: 'company' as Holiday['type'], isOptional: false });

  const yearHolidays = holidays
    .filter(h => h.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const handleAdd = () => {
    if (!form.date || !form.name) return;
    const newHoliday: Holiday = { ...form, id: `${Date.now()}` };
    const updated = [...holidays, newHoliday];
    setHolidays(updated);
    saveHolidays(updated);
    setForm({ date: '', name: '', type: 'company', isOptional: false });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = holidays.filter(h => h.id !== id);
    setHolidays(updated);
    saveHolidays(updated);
  };

  const handleBulkAdd = () => {
    const existing = new Set(holidays.map(h => h.date));
    const newHolidays: Holiday[] = [];
    INDIAN_HOLIDAYS.forEach(h => {
      const fullDate = `${year}${h.date}`;
      if (!existing.has(fullDate)) {
        newHolidays.push({ ...h, date: fullDate, id: `${Date.now()}-${Math.random()}` });
      }
    });
    if (newHolidays.length === 0) return;
    const updated = [...holidays, ...newHolidays];
    setHolidays(updated);
    saveHolidays(updated);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }); }
    catch { return d; }
  };

  return (
    <div>
      <ModuleHeader
        title="Holiday Calendar"
        icon={Calendar}
        iconColor="text-rose-600"
        additionalActions={[
          { label: 'Add Indian Holidays', icon: Sparkles, onClick: handleBulkAdd, variant: 'secondary' },
          { label: 'Add Holiday', icon: Plus, onClick: () => setShowForm(true), variant: 'primary' },
        ]}
      />

      {/* Year Control Bar */}
      <div className="px-6 py-2 bg-white border-b border-gray-200 flex items-center">
        <span className="text-sm font-medium text-gray-500 mr-3">Year:</span>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <button onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[50px] text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm text-gray-400 ml-3">{yearHolidays.length} holidays</span>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
      {/* Add Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Holiday Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Company Anniversary"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value as Holiday['type'] }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="national">National</option>
                <option value="regional">Regional</option>
                <option value="company">Company</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday List */}
      {yearHolidays.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>No holidays added for {year}.</p>
          <p className="text-sm mt-1">Click "Add Indian Holidays" to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Holiday</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {yearHolidays.map((h) => (
                <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                  <td className="py-2.5 px-4 text-sm font-mono text-gray-600">{fmtDate(h.date)}</td>
                  <td className="py-2.5 px-4">
                    <span className="text-sm font-medium text-gray-900">{h.name}</span>
                    {h.isOptional && <span className="text-xs text-gray-400 ml-2">(Optional)</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_BADGES[h.type]}`}>
                      {h.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
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

export default HolidayCalendar;
