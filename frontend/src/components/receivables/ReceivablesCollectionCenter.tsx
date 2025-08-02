import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Filter, 
  Phone, 
  MessageSquare, 
  Mail, 
  Calendar, 
  Clock, 
  DollarSign, 
  User, 
  MapPin, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle, 
  FileText, 
  Download,
  Plus,
  Eye,
  Edit,
  RefreshCw
} from 'lucide-react';

interface ReceivablesCollectionCenterProps {
  open: boolean;
  onClose: () => void;
}

interface Receivable {
  id: number;
  partyName: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  daysOverdue: number;
  status: 'overdue' | 'due_today' | 'current';
  route: string;
  salesperson: string;
  lastFollowUp: string | null;
  promiseDate: string | null;
  contactNumber: string;
}

type FilterPeriod = 'all' | '0-30' | '30-60' | '60+';

const ReceivablesCollectionCenter: React.FC<ReceivablesCollectionCenterProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [selectedParty, setSelectedParty] = useState<Receivable | null>(null);
  const [followUpModal, setFollowUpModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);

  // Mock data for receivables
  const [receivables, setReceivables] = useState<Receivable[]>([
    {
      id: 1,
      partyName: 'Apollo Pharmacy',
      invoiceNo: 'INV-2024-001',
      invoiceDate: '2024-07-01',
      dueDate: '2024-07-15',
      amount: 25000,
      paidAmount: 10000,
      balanceAmount: 15000,
      daysOverdue: 9,
      status: 'overdue',
      route: 'Route A',
      salesperson: 'John Doe',
      lastFollowUp: '2024-07-20',
      promiseDate: '2024-07-25',
      contactNumber: '+91 9876543210'
    },
    {
      id: 2,
      partyName: 'MedPlus Mart',
      invoiceNo: 'INV-2024-002',
      invoiceDate: '2024-07-10',
      dueDate: '2024-07-25',
      amount: 18500,
      paidAmount: 0,
      balanceAmount: 18500,
      daysOverdue: -1,
      status: 'due_today',
      route: 'Route B',
      salesperson: 'Jane Smith',
      lastFollowUp: '2024-07-22',
      promiseDate: null,
      contactNumber: '+91 9876543211'
    },
    {
      id: 3,
      partyName: 'Wellness Forever',
      invoiceNo: 'INV-2024-003',
      invoiceDate: '2024-06-15',
      dueDate: '2024-06-30',
      amount: 45000,
      paidAmount: 20000,
      balanceAmount: 25000,
      daysOverdue: 24,
      status: 'overdue',
      route: 'Route A',
      salesperson: 'John Doe',
      lastFollowUp: '2024-07-15',
      promiseDate: '2024-07-30',
      contactNumber: '+91 9876543212'
    }
  ]);

  const getStatusColor = (status: string, daysOverdue: number): string => {
    if (daysOverdue > 60) return 'bg-red-100 text-red-800';
    if (daysOverdue > 30) return 'bg-orange-100 text-orange-800';
    if (daysOverdue > 0) return 'bg-yellow-100 text-yellow-800';
    if (status === 'due_today') return 'bg-blue-100 text-blue-800';
    return 'bg-green-100 text-green-800';
  };

  const getStatusText = (status: string, daysOverdue: number): string => {
    if (daysOverdue > 60) return `${daysOverdue}d overdue`;
    if (daysOverdue > 0) return `${daysOverdue}d overdue`;
    if (status === 'due_today') return 'Due Today';
    if (daysOverdue < 0) return `Due in ${Math.abs(daysOverdue)}d`;
    return 'Current';
  };

  const filteredReceivables = receivables.filter(item => {
    const matchesSearch = item.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPeriod = filterPeriod === 'all' ||
                         (filterPeriod === '0-30' && item.daysOverdue >= 0 && item.daysOverdue <= 30) ||
                         (filterPeriod === '30-60' && item.daysOverdue > 30 && item.daysOverdue <= 60) ||
                         (filterPeriod === '60+' && item.daysOverdue > 60);
    
    return matchesSearch && matchesPeriod;
  });

  const totalOutstanding = receivables.reduce((sum, item) => sum + item.balanceAmount, 0);
  const overdueAmount = receivables.filter(item => item.daysOverdue > 0)
                                  .reduce((sum, item) => sum + item.balanceAmount, 0);

  const FollowUpModal: React.FC = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Add Follow-up</h3>
            <button onClick={() => setFollowUpModal(false)}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Follow-up Type
            </label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
              <option>Phone Call</option>
              <option>WhatsApp</option>
              <option>In-person Visit</option>
              <option>Email</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Promise Date
            </label>
            <input 
              type="date" 
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea 
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Add follow-up notes..."
            />
          </div>
          <div className="flex space-x-2">
            <button className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Save Follow-up
            </button>
            <button 
              onClick={() => setFollowUpModal(false)}
              className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 overflow-auto">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Receivables & Collection Center</h1>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-medium">Total Outstanding</p>
                <p className="text-lg font-bold text-blue-900">₹{totalOutstanding.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-xs text-red-600 font-medium">Overdue Amount</p>
                <p className="text-lg font-bold text-red-900">₹{overdueAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-xs text-yellow-600 font-medium">Due Today</p>
                <p className="text-lg font-bold text-yellow-900">
                  {receivables.filter(r => r.status === 'due_today').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-xs text-green-600 font-medium">Promises Today</p>
                <p className="text-lg font-bold text-green-900">2</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by party name or invoice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Periods</option>
              <option value="0-30">0-30 Days</option>
              <option value="30-60">30-60 Days</option>
              <option value="60+">60+ Days</option>
            </select>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Receivables Table */}
      <div className="flex-1 p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Party Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice Info
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Follow-up
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReceivables.map((receivable) => (
                  <tr key={receivable.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{receivable.partyName}</div>
                        <div className="text-xs text-gray-500">{receivable.route} • {receivable.salesperson}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{receivable.invoiceNo}</div>
                        <div className="text-xs text-gray-500">
                          Date: {receivable.invoiceDate} | Due: {receivable.dueDate}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="text-sm font-bold text-gray-900">₹{receivable.balanceAmount.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          of ₹{receivable.amount.toLocaleString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(receivable.status, receivable.daysOverdue)}`}>
                        {getStatusText(receivable.status, receivable.daysOverdue)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-gray-500">
                        {receivable.lastFollowUp && (
                          <div>Last: {receivable.lastFollowUp}</div>
                        )}
                        {receivable.promiseDate && (
                          <div className="text-blue-600">Promise: {receivable.promiseDate}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex space-x-1">
                        <button
                          onClick={() => setFollowUpModal(true)}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="Add Follow-up"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                          title="Send Reminder"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPaymentModal(true)}
                          className="p-1 text-purple-600 hover:bg-purple-100 rounded transition-colors"
                          title="Record Payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
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

      {/* Modals */}
      {followUpModal && <FollowUpModal />}
    </div>
  );
};

export default ReceivablesCollectionCenter;