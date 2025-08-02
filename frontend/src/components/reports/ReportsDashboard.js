import React, { useState } from 'react';
import { 
  FileText, 
  BarChart3, 
  DollarSign, 
  Package, 
  AlertTriangle,
  TrendingUp,
  Calendar,
  Download,
  Filter,
  ChevronRight,
  X
} from 'lucide-react';

const ReportsDashboard = ({ open, onClose }) => {
  const [selectedReport, setSelectedReport] = useState(null);

  const reportCategories = [
    {
      title: 'GST Reports',
      description: 'GST returns and compliance reports',
      icon: FileText,
      color: 'blue',
      reports: [
        { id: 'gstr1', name: 'GSTR-1 (Sales)', description: 'Outward supplies report' },
        { id: 'gstr3b', name: 'GSTR-3B (Summary)', description: 'Monthly summary return' }
      ]
    },
    {
      title: 'Sales & Purchase',
      description: 'Transaction registers and analysis',
      icon: BarChart3,
      color: 'green',
      reports: [
        { id: 'sales-register', name: 'Sales Register', description: 'Complete sales records' },
        { id: 'purchase-register', name: 'Purchase Register', description: 'Purchase transactions' }
      ]
    },
    {
      title: 'Financial Reports',
      description: 'P&L, aging, and financial analysis',
      icon: DollarSign,
      color: 'purple',
      reports: [
        { id: 'profit-loss', name: 'Profit & Loss', description: 'Income and expense statement' },
        { id: 'aging-analysis', name: 'Aging Analysis', description: 'Receivables and payables aging' }
      ]
    },
    {
      title: 'Inventory Reports',
      description: 'Stock valuation and alerts',
      icon: Package,
      color: 'orange',
      reports: [
        { id: 'stock-valuation', name: 'Stock Valuation', description: 'Current inventory value' },
        { id: 'low-stock', name: 'Low Stock Alert', description: 'Items below reorder level' }
      ]
    }
  ];

  const handleReportSelect = (reportId) => {
    setSelectedReport(reportId);
    // Dispatch event for App.js to handle
    window.dispatchEvent(new CustomEvent('selectReport', { detail: { reportId } }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600 mt-1">Generate business insights and compliance reports</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">This Month Sales</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">₹0</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Pending GST</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">₹0</p>
                </div>
                <FileText className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Total Receivables</p>
                  <p className="text-2xl font-bold text-purple-900 mt-1">₹0</p>
                </div>
                <DollarSign className="w-8 h-8 text-purple-500" />
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">Low Stock Items</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">0</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>
          </div>

          {/* Report Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reportCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div key={category.title} className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-start space-x-4 mb-4">
                    <div className={`w-12 h-12 bg-${category.color}-100 rounded-lg flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${category.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{category.title}</h3>
                      <p className="text-sm text-gray-600">{category.description}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {category.reports.map((report) => (
                      <button
                        key={report.id}
                        onClick={() => handleReportSelect(report.id)}
                        className="w-full text-left p-3 bg-white rounded-lg hover:bg-gray-100 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{report.name}</p>
                            <p className="text-sm text-gray-600">{report.description}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Reports */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Reports</h3>
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p>No recent reports generated</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Generate reports for better business insights
            </p>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsDashboard;