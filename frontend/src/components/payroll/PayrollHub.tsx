import React from 'react';
import {
  Banknote, Wallet, CalendarClock,
  ClipboardCheck, CalendarOff,
  Calculator, Receipt, BarChart3,
  FileText, Calendar, Folder, BookOpen
} from 'lucide-react';
import { ModuleHub } from '../global';
import { Module } from '../global/navigation/ModuleHub';

// Payroll components
import SalaryStructureList from './setup/SalaryStructureList';
import LeavePolicyList from './setup/LeavePolicyList';
import AttendanceMarking from './attendance/AttendanceMarking';
import LeaveManagement from './leave/LeaveManagement';
import PayrollRunFlow from './payrun/PayrollRunFlow';
import SalarySlipList from './slips/SalarySlipList';
import PayrollReports from './reports/PayrollReports';

// HR & Documents components
import HRLetters from './hr/HRLetters';
import HolidayCalendar from './hr/HolidayCalendar';
import EmployeeDocuments from './hr/EmployeeDocuments';
import CompanyPolicies from './hr/CompanyPolicies';

interface PayrollHubProps {
  open?: boolean;
  onClose?: () => void;
}

const PayrollHub: React.FC<PayrollHubProps> = ({ open = true, onClose }) => {
  const payrollModules: Module[] = [
    // ── Setup ─────────────────────────────────────────────
    {
      id: 'salary-structures',
      label: 'Salary Structures',
      fullLabel: 'Salary Structures',
      description: 'Define salary components & templates',
      icon: Wallet,
      color: 'blue',
      component: SalaryStructureList,
      group: 'Setup'
    },
    {
      id: 'leave-policy',
      label: 'Leave Policy',
      fullLabel: 'Leave Policy',
      description: 'Configure leave types & rules',
      icon: CalendarClock,
      color: 'green',
      component: LeavePolicyList,
      group: 'Setup'
    },
    // ── Daily Operations ──────────────────────────────────
    {
      id: 'attendance',
      label: 'Attendance',
      fullLabel: 'Attendance',
      description: 'Mark & track daily attendance',
      icon: ClipboardCheck,
      color: 'amber',
      component: AttendanceMarking,
      group: 'Daily Operations'
    },
    {
      id: 'leave-management',
      label: 'Leave Management',
      fullLabel: 'Leave Management',
      description: 'Apply, approve & track leaves',
      icon: CalendarOff,
      color: 'teal',
      component: LeaveManagement,
      group: 'Daily Operations'
    },
    // ── Month End ─────────────────────────────────────────
    {
      id: 'run-payroll',
      label: 'Run Payroll',
      fullLabel: 'Run Payroll',
      description: 'Process monthly salary run',
      icon: Calculator,
      color: 'purple',
      component: PayrollRunFlow,
      group: 'Month End'
    },
    {
      id: 'salary-slips',
      label: 'Salary Slips',
      fullLabel: 'Salary Slips',
      description: 'View & download salary slips',
      icon: Receipt,
      color: 'emerald',
      component: SalarySlipList,
      group: 'Month End'
    },
    // ── Reports ───────────────────────────────────────────
    {
      id: 'payroll-reports',
      label: 'Payroll Reports',
      fullLabel: 'Payroll Reports',
      description: 'Payroll analytics & summaries',
      icon: BarChart3,
      color: 'gray',
      component: PayrollReports,
      group: 'Reports'
    },
    // ── HR & Documents ──────────────────────────────────
    {
      id: 'hr-letters',
      label: 'HR Letters',
      fullLabel: 'HR Letters',
      description: 'Generate offer, appointment, experience letters',
      icon: FileText,
      color: 'indigo',
      component: HRLetters,
      group: 'HR & Documents'
    },
    {
      id: 'holiday-calendar',
      label: 'Holiday Calendar',
      fullLabel: 'Holiday Calendar',
      description: 'Manage holidays & week-offs',
      icon: Calendar,
      color: 'rose',
      component: HolidayCalendar,
      group: 'HR & Documents'
    },
    {
      id: 'employee-documents',
      label: 'Employee Documents',
      fullLabel: 'Employee Documents',
      description: 'Upload & track employee documents',
      icon: Folder,
      color: 'orange',
      component: EmployeeDocuments,
      group: 'HR & Documents'
    },
    {
      id: 'company-policies',
      label: 'Company Policies',
      fullLabel: 'Company Policies',
      description: 'Create & manage company policies',
      icon: BookOpen,
      color: 'cyan',
      component: CompanyPolicies,
      group: 'HR & Documents'
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="Payroll"
      subtitle="Manage payroll & attendance"
      icon={Banknote}
      modules={payrollModules}
      defaultModule="attendance"
    />
  );
};

export default PayrollHub;
