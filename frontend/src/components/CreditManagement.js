import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown,
  Clock,
  DollarSign,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Download,
  Phone,
  MessageSquare,
  Mail,
  ChevronRight,
  IndianRupee,
  AlertTriangle,
  Shield
} from 'lucide-react';

const CreditManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [creditStats, setCreditStats] = useState({
    totalCredit: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    customersOnCredit: 0
  });

  // Sample data with Indian business context
  useEffect(() => {
    const sampleCustomers = [
      {
        id: 'CUST001',
        name: 'Rajesh Medical Store',
        phone: '+91 98765 43210',
        email: 'rajesh.medical@gmail.com',
        creditLimit: 500000,
        creditUsed: 125000,
        creditAvailable: 375000,
        paymentTerms: 30,
        creditScore: 85,
        status: 'active',
        lastPaymentDate: '2024-01-10',
        avgPaymentDays: 25,
        totalBusiness: 2500000,
        outstandingInvoices: [
          { invoiceNo: 'INV-2401', amount: 45000, dueDate: '2024-02-15', daysOverdue: 0 },
          { invoiceNo: 'INV-2356', amount: 80000, dueDate: '2024-01-30', daysOverdue: 5 }
        ]
      },
      {
        id: 'CUST002',
        name: 'City Hospital Pharmacy',
        phone: '+91 98765 43211',
        email: 'cityhospital@gmail.com',
        creditLimit: 1000000,
        creditUsed: 450000,
        creditAvailable: 550000,
        paymentTerms: 45,
        creditScore: 92,
        status: 'active',
        lastPaymentDate: '2024-01-12',
        avgPaymentDays: 35,
        totalBusiness: 5000000,
        outstandingInvoices: [
          { invoiceNo: 'INV-2389', amount: 250000, dueDate: '2024-02-20', daysOverdue: 0 },
          { invoiceNo: 'INV-2345', amount: 200000, dueDate: '2024-02-10', daysOverdue: 0 }
        ]
      },
      {
        id: 'CUST003',
        name: 'Krishna Pharmacy',
        phone: '+91 98765 43212',
        email: 'krishna.pharma@gmail.com',
        creditLimit: 200000,
        creditUsed: 195000,
        creditAvailable: 5000,
        paymentTerms: 15,
        creditScore: 65,
        status: 'warning',
        lastPaymentDate: '2023-12-20',
        avgPaymentDays: 45,
        totalBusiness: 800000,
        outstandingInvoices: [
          { invoiceNo: 'INV-2234', amount: 95000, dueDate: '2024-01-15', daysOverdue: 20 },
          { invoiceNo: 'INV-2156', amount: 100000, dueDate: '2023-12-30', daysOverdue: 35 }
        ]
      },
      {
        id: 'CUST004',
        name: 'Wellness Medical Store',
        phone: '+91 98765 43213',
        email: 'wellness@gmail.com',
        creditLimit: 300000,
        creditUsed: 320000,
        creditAvailable: -20000,
        paymentTerms: 7,
        creditScore: 45,
        status: 'blocked',
        lastPaymentDate: '2023-11-15',
        avgPaymentDays: 60,
        totalBusiness: 1200000,
        outstandingInvoices: [
          { invoiceNo: 'INV-2098', amount: 120000, dueDate: '2023-12-01', daysOverdue: 65 },
          { invoiceNo: 'INV-2076', amount: 100000, dueDate: '2023-11-20', daysOverdue: 85 },
          { invoiceNo: 'INV-2045', amount: 100000, dueDate: '2023-11-10', daysOverdue: 95 }
        ]
      }
    ];

    setCustomers(sampleCustomers);

    // Calculate stats
    const stats = sampleCustomers.reduce((acc, customer) => {
      acc.totalCredit += customer.creditLimit;
      acc.outstandingAmount += customer.creditUsed;
      acc.overdueAmount += customer.outstandingInvoices
        .filter(inv => inv.daysOverdue > 0)
        .reduce((sum, inv) => sum + inv.amount, 0);
      if (customer.creditUsed > 0) acc.customersOnCredit++;
      return acc;
    }, { totalCredit: 0, outstandingAmount: 0, overdueAmount: 0, customersOnCredit: 0 });

    setCreditStats(stats);
  }, []);

  const getCreditScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.phone.includes(searchTerm);
    const matchesFilter = filterStatus === 'all' || customer.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const sendPaymentReminder = (customer, method) => {
    alert(`Payment reminder sent to ${customer.name} via ${method}`);
  };

  const updateCreditLimit = (customerId, newLimit) => {
    setCustomers(prev => prev.map(c => 
      c.id === customerId 
        ? { ...c, creditLimit: newLimit, creditAvailable: newLimit - c.creditUsed }
        : c
    ));
    setShowCreditModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Credit Management</h1>
            <p className="text-gray-600">Monitor and manage customer credit limits</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">Total Credit Extended</p>
                <p className="text-2xl font-bold text-blue-900">₹{(creditStats.totalCredit / 100000).toFixed(1)}L</p>
              </div>
              <CreditCard className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">Outstanding Amount</p>
                <p className="text-2xl font-bold text-purple-900">₹{(creditStats.outstandingAmount / 100000).toFixed(1)}L</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600">Overdue Amount</p>
                <p className="text-2xl font-bold text-red-900">₹{(creditStats.overdueAmount / 100000).toFixed(1)}L</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Active Credit Customers</p>
                <p className="text-2xl font-bold text-green-900">{creditStats.customersOnCredit}</p>
              </div>
              <User className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="warning">Warning</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-4">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{customer.name}</h3>
                  <div className="flex items-center space-x-3 text-sm text-gray-600">
                    <span>{customer.phone}</span>
                    <span>•</span>
                    <span>Terms: {customer.paymentTerms} days</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(customer.status)}`}>
                  {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                </span>
                <div className={`px-3 py-1 rounded-lg text-sm font-medium ${getCreditScoreColor(customer.creditScore)}`}>
                  Score: {customer.creditScore}
                </div>
              </div>
            </div>

            {/* Credit Details */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600">Credit Limit</p>
                <p className="text-lg font-semibold">₹{customer.creditLimit.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600">Credit Used</p>
                <p className="text-lg font-semibold text-orange-600">₹{customer.creditUsed.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600">Available</p>
                <p className={`text-lg font-semibold ${customer.creditAvailable < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{customer.creditAvailable.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600">Avg Payment Days</p>
                <p className="text-lg font-semibold">{customer.avgPaymentDays} days</p>
              </div>
            </div>

            {/* Credit Usage Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Credit Utilization</span>
                <span className="font-medium">{Math.round((customer.creditUsed / customer.creditLimit) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    (customer.creditUsed / customer.creditLimit) > 0.9 ? 'bg-red-500' :
                    (customer.creditUsed / customer.creditLimit) > 0.7 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min((customer.creditUsed / customer.creditLimit) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Outstanding Invoices */}
            {customer.outstandingInvoices.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Outstanding Invoices</h4>
                <div className="space-y-2">
                  {customer.outstandingInvoices.map((invoice) => (
                    <div key={invoice.invoiceNo} className="flex items-center justify-between bg-gray-50 rounded p-2">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium">{invoice.invoiceNo}</span>
                        <span className="text-sm text-gray-600">₹{invoice.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Due: {invoice.dueDate}</span>
                        {invoice.daysOverdue > 0 && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            {invoice.daysOverdue} days overdue
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => sendPaymentReminder(customer, 'SMS')}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center"
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  SMS
                </button>
                <button
                  onClick={() => sendPaymentReminder(customer, 'WhatsApp')}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center"
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  WhatsApp
                </button>
                <button
                  onClick={() => sendPaymentReminder(customer, 'Email')}
                  className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Email
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setShowCreditModal(true);
                  }}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Update Credit Limit
                </button>
                {customer.status === 'blocked' ? (
                  <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                    Unblock Customer
                  </button>
                ) : (
                  <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                    Block Customer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Credit Limit Modal */}
      {showCreditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Update Credit Limit</h3>
            <p className="text-gray-600 mb-4">Customer: {selectedCustomer.name}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Credit Limit
              </label>
              <input
                type="number"
                defaultValue={selectedCustomer.creditLimit}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateCreditLimit(selectedCustomer.id, parseInt(e.target.value));
                  }
                }}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCreditModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  const input = e.target.parentElement.parentElement.querySelector('input');
                  updateCreditLimit(selectedCustomer.id, parseInt(input.value));
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditManagement;