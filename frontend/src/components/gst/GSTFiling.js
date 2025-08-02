import React, { useState } from 'react';
import { 
  FileText, Upload, Calendar, CheckCircle, 
  AlertTriangle, Clock, Download, Send,
  Info, RefreshCw, Shield, ArrowRight
} from 'lucide-react';

const GSTFiling = ({ open, onClose }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filingStatus, setFilingStatus] = useState({});
  
  const filingTypes = [
    {
      id: 'gstr-1',
      name: 'GSTR-1',
      description: 'Outward supplies return',
      dueDate: '11th of next month',
      status: 'pending',
      icon: Upload,
      color: 'blue'
    },
    {
      id: 'gstr-3b',
      name: 'GSTR-3B',
      description: 'Summary return',
      dueDate: '20th of next month',
      status: 'draft',
      icon: FileText,
      color: 'green'
    },
    {
      id: 'gstr-2b',
      name: 'GSTR-2B',
      description: 'Auto-generated ITC statement',
      dueDate: '14th of next month',
      status: 'available',
      icon: Download,
      color: 'purple'
    },
    {
      id: 'gstr-9',
      name: 'GSTR-9',
      description: 'Annual return',
      dueDate: '31st December',
      status: 'not-due',
      icon: Calendar,
      color: 'amber'
    }
  ];

  const monthlyOverview = {
    salesInvoices: 234,
    purchaseInvoices: 189,
    outputTax: 245670,
    inputTax: 187450,
    netPayable: 58220,
    itcAvailable: 187450,
    itcUtilized: 187450,
    cashLedgerBalance: 125000
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'yellow', text: 'Pending', icon: Clock },
      draft: { color: 'blue', text: 'Draft', icon: FileText },
      filed: { color: 'green', text: 'Filed', icon: CheckCircle },
      available: { color: 'purple', text: 'Available', icon: Download },
      'not-due': { color: 'gray', text: 'Not Due', icon: Calendar },
      overdue: { color: 'red', text: 'Overdue', icon: AlertTriangle }
    };

    const config = statusConfig[status] || statusConfig['not-due'];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </span>
    );
  };

  const handleFilingAction = (filingType, action) => {
    console.log(`${action} for ${filingType}`);
    alert(`${action} ${filingType} - Feature coming soon!`);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Filing</h1>
            <p className="text-gray-600 mt-1">Manage and file your GST returns</p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {[...Array(6)].map((_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const value = date.toISOString().slice(0, 7);
                const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return (
                  <option key={value} value={value}>{label}</option>
                );
              })}
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Validate All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Overview */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Sales Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{monthlyOverview.salesInvoices}</p>
              <p className="text-xs text-gray-500 mt-1">Output Tax: ₹{monthlyOverview.outputTax.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Purchase Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{monthlyOverview.purchaseInvoices}</p>
              <p className="text-xs text-gray-500 mt-1">Input Tax: ₹{monthlyOverview.inputTax.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Net GST Payable</p>
              <p className="text-2xl font-bold text-red-600">₹{monthlyOverview.netPayable.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">After ITC adjustment</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cash Ledger Balance</p>
              <p className="text-2xl font-bold text-green-600">₹{monthlyOverview.cashLedgerBalance.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Available for payment</p>
            </div>
          </div>
        </div>

        {/* Filing Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filingTypes.map((filing) => {
            const Icon = filing.icon;
            return (
              <div key={filing.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 bg-${filing.color}-100 rounded-lg flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${filing.color}-600`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{filing.name}</h3>
                      <p className="text-sm text-gray-600">{filing.description}</p>
                    </div>
                  </div>
                  {getStatusBadge(filing.status)}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Due Date:</span>
                    <span className="font-medium text-gray-900">{filing.dueDate}</span>
                  </div>

                  {filing.status === 'pending' && (
                    <div className="bg-yellow-50 rounded-lg p-3 flex items-start space-x-2">
                      <Info className="w-4 h-4 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800">Action Required</p>
                        <p className="text-yellow-700">Please review and file before due date</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-2">
                    {filing.status === 'draft' && (
                      <>
                        <button
                          onClick={() => handleFilingAction(filing.name, 'Review')}
                          className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                        >
                          Review Draft
                        </button>
                        <button
                          onClick={() => handleFilingAction(filing.name, 'File')}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center justify-center space-x-1"
                        >
                          <Send className="w-4 h-4" />
                          <span>File Now</span>
                        </button>
                      </>
                    )}
                    
                    {filing.status === 'pending' && (
                      <button
                        onClick={() => handleFilingAction(filing.name, 'Prepare')}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Prepare Return
                      </button>
                    )}
                    
                    {filing.status === 'filed' && (
                      <button
                        onClick={() => handleFilingAction(filing.name, 'Download')}
                        className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center justify-center space-x-1"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Filed Return</span>
                      </button>
                    )}
                    
                    {filing.status === 'available' && (
                      <button
                        onClick={() => handleFilingAction(filing.name, 'Download')}
                        className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center justify-center space-x-1"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Statement</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ITC Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Input Tax Credit Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">ITC Available</span>
                <span className="font-medium">₹{monthlyOverview.itcAvailable.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ITC Utilized</span>
                <span className="font-medium">₹{monthlyOverview.itcUtilized.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ITC Balance</span>
                <span className="font-medium text-green-600">₹{(monthlyOverview.itcAvailable - monthlyOverview.itcUtilized).toLocaleString()}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">CGST Credit</span>
                <span className="font-medium">₹{(monthlyOverview.itcAvailable * 0.5).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">SGST Credit</span>
                <span className="font-medium">₹{(monthlyOverview.itcAvailable * 0.5).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">IGST Credit</span>
                <span className="font-medium">₹0</span>
              </div>
            </div>
            
            <div className="flex items-center justify-center">
              <button className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2">
                <RefreshCw className="w-5 h-5" />
                <span>Reconcile ITC</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTFiling;