import React, { useState } from 'react';
import { 
  TrendingUp, Download, Calendar, FileText, BarChart3
} from 'lucide-react';
import { ModuleHeader } from '../global';

interface FinancialReportsSimpleProps {
  onClose?: () => void;
}

const FinancialReportsSimple: React.FC<FinancialReportsSimpleProps> = ({ onClose }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [selectedReport, setSelectedReport] = useState('');

  const reports = [
    {
      id: 'trial_balance',
      name: 'Trial Balance',
      description: 'Account-wise balance verification',
      icon: BarChart3,
      color: 'bg-blue-500'
    },
    {
      id: 'profit_loss',
      name: 'Profit & Loss',
      description: 'Income statement analysis',
      icon: TrendingUp,
      color: 'bg-green-500'
    },
    {
      id: 'balance_sheet',
      name: 'Balance Sheet',
      description: 'Financial position statement',
      icon: FileText,
      color: 'bg-purple-500'
    }
  ];

  const generateReport = (reportId: string) => {
    setSelectedReport(reportId);
    console.log(`Generating ${reportId} for ${selectedPeriod}`);
    // API call would go here
    alert(`${reportId} report will be generated for ${selectedPeriod}`);
  };

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Financial Reports"
          documentNumber={`RPT-${new Date().getFullYear()}`}
          status={`Period: ${selectedPeriod.replace('_', ' ').toUpperCase()}`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          onClose={onClose}
          historyType="reports"
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: 'Export PDF',
              onClick: () => console.log('Export PDF'),
              variant: 'secondary'
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+G</strong> - Generate Report | <strong>Ctrl+D</strong> - Download | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            
            {/* Period Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Report Period</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'this_month', label: 'This Month' },
                  { value: 'last_month', label: 'Last Month' },
                  { value: 'this_quarter', label: 'This Quarter' },
                  { value: 'this_year', label: 'This Year' }
                ].map(period => (
                  <button
                    key={period.value}
                    onClick={() => setSelectedPeriod(period.value)}
                    className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                      selectedPeriod === period.value
                        ? 'bg-purple-50 border-purple-200 text-purple-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Report Options */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Available Reports</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reports.map(report => {
                  const Icon = report.icon;
                  return (
                    <div
                      key={report.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => generateReport(report.id)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 ${report.color} rounded-lg`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="font-medium text-gray-900">{report.name}</h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{report.description}</p>
                      <button className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                        Generate Report
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">₹8,50,000</p>
                  <p className="text-xs text-gray-500">This month</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">₹6,50,000</p>
                  <p className="text-xs text-gray-500">This month</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Net Profit</p>
                  <p className="text-2xl font-bold text-blue-600">₹2,00,000</p>
                  <p className="text-xs text-gray-500">This month</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialReportsSimple;