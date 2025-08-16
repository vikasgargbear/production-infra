import React, { useState } from 'react';
import { Users, Search, Filter, Download, AlertTriangle, TrendingUp } from 'lucide-react';
import { ModuleHeader } from '../global';

interface OutstandingManagementProps {
  onClose?: () => void;
}

const OutstandingManagement: React.FC<OutstandingManagementProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock customer outstanding data
  const customerOutstanding = [
    { id: 1, name: 'ABC Medical Store', phone: '9876543210', outstanding: 125000, overdue: 45000, days: 15 },
    { id: 2, name: 'XYZ Pharmacy', phone: '9876543211', outstanding: 85000, overdue: 0, days: 5 },
    { id: 3, name: 'City Health Center', phone: '9876543212', outstanding: 225000, overdue: 125000, days: 45 },
    { id: 4, name: 'Life Care Medical', phone: '9876543213', outstanding: 65000, overdue: 0, days: 8 }
  ];

  // Mock supplier outstanding data
  const supplierOutstanding = [
    { id: 1, name: 'Pharma Distributors Ltd', phone: '9876543220', outstanding: 185000, overdue: 85000, days: 25 },
    { id: 2, name: 'MedSupply Co.', phone: '9876543221', outstanding: 95000, overdue: 0, days: 10 },
    { id: 3, name: 'Healthcare Wholesalers', phone: '9876543222', outstanding: 275000, overdue: 175000, days: 35 }
  ];

  const currentData = activeTab === 'customers' ? customerOutstanding : supplierOutstanding;
  const totalOutstanding = currentData.reduce((sum, item) => sum + item.outstanding, 0);
  const totalOverdue = currentData.reduce((sum, item) => sum + item.overdue, 0);

  const filteredData = currentData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.phone.includes(searchTerm)
  );

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Outstanding Management"
          documentNumber={`OUT-${new Date().getFullYear()}`}
          status={`Total Outstanding: ₹${totalOutstanding.toLocaleString()}`}
          icon={Users}
          iconColor="text-amber-600"
          onClose={onClose}
          historyType="outstanding"
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: 'Export Report',
              onClick: () => console.log('Export outstanding report'),
              variant: 'secondary'
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+D</strong> - Download Report | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Outstanding</p>
                    <p className="text-2xl font-bold text-blue-600">₹{totalOutstanding.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-sm text-gray-600">Overdue Amount</p>
                    <p className="text-2xl font-bold text-red-600">₹{totalOverdue.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Parties</p>
                    <p className="text-2xl font-bold text-green-600">{currentData.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs and Search */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab('customers')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeTab === 'customers'
                          ? 'bg-amber-100 text-amber-700'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Customer Outstanding
                    </button>
                    <button
                      onClick={() => setActiveTab('suppliers')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeTab === 'suppliers'
                          ? 'bg-amber-100 text-amber-700'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Supplier Outstanding
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search parties..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <button className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Filter
                    </button>
                    <button className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                  </div>
                </div>
              </div>

              {/* Outstanding Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                        {activeTab === 'customers' ? 'Customer' : 'Supplier'} Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Contact</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Outstanding</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Overdue</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Days</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredData.map((party) => (
                      <tr key={party.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{party.name}</p>
                            <p className="text-sm text-gray-500">ID: {activeTab === 'customers' ? 'CUST' : 'SUPP'}-{party.id.toString().padStart(3, '0')}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{party.phone}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-gray-900">₹{party.outstanding.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {party.overdue > 0 ? (
                            <span className="font-medium text-red-600">₹{party.overdue.toLocaleString()}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            party.days <= 15 ? 'bg-green-100 text-green-700' :
                            party.days <= 30 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {party.days} days
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded hover:bg-blue-50">
                              View Ledger
                            </button>
                            <button className="px-3 py-1 text-xs text-green-600 hover:text-green-700 border border-green-200 rounded hover:bg-green-50">
                              Send Reminder
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutstandingManagement;