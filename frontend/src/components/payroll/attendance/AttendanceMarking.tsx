import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { attendanceApi, employeesApi } from '../../../services/api';

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'week_off';

interface Employee {
  employee_id: number;
  full_name: string;
  employee_code: string;
}

interface AttendanceCell {
  employee_id: number;
  date: string;  // YYYY-MM-DD
  status: AttendanceStatus;
  changed: boolean;
}

const STATUS_CYCLE: AttendanceStatus[] = ['present', 'absent', 'half_day', 'leave', 'holiday', 'week_off'];
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  half_day: 'H',
  leave: 'L',
  holiday: 'HD',
  week_off: 'WO',
};
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-800 border-green-200',
  absent: 'bg-red-100 text-red-800 border-red-200',
  half_day: 'bg-amber-100 text-amber-800 border-amber-200',
  leave: 'bg-blue-100 text-blue-800 border-blue-200',
  holiday: 'bg-purple-100 text-purple-800 border-purple-200',
  week_off: 'bg-gray-100 text-gray-500 border-gray-200',
};

const AttendanceMarking: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [grid, setGrid] = useState<Record<string, AttendanceCell>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const cellKey = (empId: number, day: number) =>
    `${empId}-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const dateStr = (day: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isWeekend = (day: number) => {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 0; // Sunday
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load employees
      const empRes = await employeesApi.getAll({ is_active: true, limit: 200 });
      const empData = empRes?.data?.data || [];
      setEmployees(Array.isArray(empData) ? empData : []);

      // Load existing attendance
      const attRes = await attendanceApi.getMonthly(year, month);
      const attData = attRes?.data?.data || [];

      const newGrid: Record<string, AttendanceCell> = {};
      if (Array.isArray(attData)) {
        attData.forEach((rec: any) => {
          const d = new Date(rec.attendance_date);
          const day = d.getDate();
          const key = cellKey(rec.employee_id, day);
          newGrid[key] = {
            employee_id: rec.employee_id,
            date: rec.attendance_date,
            status: rec.status,
            changed: false,
          };
        });
      }
      setGrid(newGrid);
      setHasChanges(false);
    } catch {
      // error silently handled - loading state resets in finally
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleCell = (empId: number, day: number) => {
    const key = cellKey(empId, day);
    const current = grid[key];
    const currentStatus = current?.status || (isWeekend(day) ? 'week_off' : 'present');
    const nextIndex = (STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];

    setGrid(prev => ({
      ...prev,
      [key]: {
        employee_id: empId,
        date: dateStr(day),
        status: nextStatus,
        changed: true,
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const changed = Object.values(grid).filter(c => c.changed);
    if (changed.length === 0) return;

    setIsSaving(true);
    try {
      await attendanceApi.bulkMark(
        changed.map(c => ({
          employee_id: c.employee_id,
          attendance_date: c.date,
          status: c.status,
        }))
      );
      setHasChanges(false);
      // Mark all as not changed
      setGrid(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(k => { updated[k] = { ...updated[k], changed: false }; });
        return updated;
      });
    } catch {
      // error silently handled
    } finally {
      setIsSaving(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Summary counts for an employee
  const getEmployeeSummary = (empId: number) => {
    let p = 0, a = 0, h = 0, l = 0;
    dates.forEach(day => {
      const key = cellKey(empId, day);
      const status = grid[key]?.status;
      if (status === 'present') p++;
      else if (status === 'absent') a++;
      else if (status === 'half_day') h++;
      else if (status === 'leave') l++;
    });
    return { p, a, h, l };
  };

  return (
    <div>
      <ModuleHeader
        title="Attendance"
        icon={ClipboardCheck}
        iconColor="text-amber-600"
        additionalActions={[{
          label: 'Save',
          icon: isSaving ? Loader2 : Save,
          onClick: handleSave,
          variant: 'primary' as const,
          disabled: !hasChanges || isSaving,
        }]}
      />

      {/* Month Navigator + Legend */}
      <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {monthNames[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-xs">
          {STATUS_CYCLE.map(s => (
            <span key={s} className={`px-2 py-0.5 rounded border ${STATUS_COLORS[s]}`}>
              {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-full">
      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading attendance...</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No active employees found.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 bg-gray-50 z-10 text-left py-2.5 px-3 font-medium text-gray-600 min-w-[160px]">
                  Employee
                </th>
                {dates.map(d => (
                  <th
                    key={d}
                    className={`py-2.5 px-1 text-center font-medium min-w-[32px] ${isWeekend(d) ? 'bg-gray-100 text-gray-400' : 'text-gray-600'}`}
                  >
                    {d}
                  </th>
                ))}
                <th className="py-2.5 px-2 text-center font-medium text-gray-600 bg-gray-50 min-w-[40px]">P</th>
                <th className="py-2.5 px-2 text-center font-medium text-gray-600 bg-gray-50 min-w-[40px]">A</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const summary = getEmployeeSummary(emp.employee_id);
                return (
                  <tr key={emp.employee_id} className="border-b border-gray-50 hover:bg-gray-50/30">
                    <td className="sticky left-0 bg-white z-10 py-1.5 px-3 border-r border-gray-100">
                      <div className="font-medium text-gray-900 truncate">{emp.full_name}</div>
                      <div className="text-gray-400">{emp.employee_code}</div>
                    </td>
                    {dates.map(d => {
                      const key = cellKey(emp.employee_id, d);
                      const cell = grid[key];
                      const status = cell?.status || (isWeekend(d) ? 'week_off' : undefined);
                      const isChanged = cell?.changed;

                      return (
                        <td key={d} className="py-1 px-0.5 text-center">
                          <button
                            onClick={() => toggleCell(emp.employee_id, d)}
                            className={`w-7 h-7 rounded text-[10px] font-bold border transition-all
                              ${status ? STATUS_COLORS[status] : 'border-gray-200 text-gray-300 hover:border-gray-300'}
                              ${isChanged ? 'ring-2 ring-blue-300' : ''}
                            `}
                            title={`${emp.full_name} - ${d} ${monthNames[month - 1]} - ${status || 'not marked'}`}
                          >
                            {status ? STATUS_LABELS[status] : '-'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center font-medium text-green-700 bg-green-50/30">{summary.p}</td>
                    <td className="py-1.5 px-2 text-center font-medium text-red-700 bg-red-50/30">{summary.a}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
};

export default AttendanceMarking;
