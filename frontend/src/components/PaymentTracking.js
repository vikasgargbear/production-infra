import React, { useState, useEffect } from 'react';
import PaymentEntryModal from './PaymentEntryModal';
import { 
  IndianRupee,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  Search,
  Filter,
  Plus,
  User,
  Building,
  CreditCard,
  Banknote,
  Smartphone,
  MessageSquare,
  ChevronRight,
  Camera,
  Upload
} from 'lucide-react';

const PaymentTracking = () => {
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateRange, setDateRange] = useState('today');
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentStats, setPaymentStats] = useState({
    todayCollection: 0,
    weekCollection: 0,
    monthCollection: 0,
    pendingAmount: 0,
    bounceRate: 0,
    collectionRate: 0
  });

  // Payment modes common in India
  const paymentModes = [
    { id: 'cash', name: 'Cash', icon: Banknote, color: 'green' },
    { id: 'upi', name: 'UPI', icon: Smartphone, color: 'purple' },
    { id: 'cheque', name: 'Cheque', icon: FileText, color: 'blue' },
    { id: 'rtgs', name: 'RTGS/NEFT', icon: Building, color: 'orange' },
    { id: 'card', name: 'Card', icon: CreditCard, color: 'pink' }
  ];

  // Sample payment data
  useEffect(() => {
    const samplePayments = [
      {
        id: 'PAY001',
        customerName: 'Rajesh Medical Store',
        customerPhone: '+91 98765 43210',
        invoiceNo: 'INV-2401',
        invoiceAmount: 45000,
        paymentAmount: 45000,
        paymentMode: 'upi',
        paymentDate: '2024-01-15',
        paymentTime: '10:30 AM',
        transactionId: 'UPI123456789',
        status: 'completed',
        collectedBy: 'Sales Rep - Amit',
        remarks: 'Payment received on time',
        attachments: []
      },
      {
        id: 'PAY002',
        customerName: 'City Hospital Pharmacy',
        customerPhone: '+91 98765 43211',
        invoiceNo: 'INV-2389',
        invoiceAmount: 250000,
        paymentAmount: 100000,
        paymentMode: 'cheque',
        paymentDate: '2024-01-15',
        paymentTime: '2:15 PM',
        transactionId: 'CHQ-987654',
        chequeNo: '987654',
        chequeDate: '2024-01-15',
        bankName: 'HDFC Bank',
        status: 'pending',
        collectedBy: 'Accounts Team',
        remarks: 'Part payment - Cheque deposited',
        attachments: ['cheque_photo.jpg']
      },
      {
        id: 'PAY003',
        customerName: 'Krishna Pharmacy',
        customerPhone: '+91 98765 43212',
        invoiceNo: 'INV-2234',
        invoiceAmount: 95000,
        paymentAmount: 95000,
        paymentMode: 'cash',
        paymentDate: '2024-01-14',
        paymentTime: '5:45 PM',
        status: 'completed',
        collectedBy: 'Sales Rep - Rahul',
        remarks: 'Cash collected after multiple follow-ups',
        attachments: []
      },
      {
        id: 'PAY004',
        customerName: 'Wellness Medical Store',
        customerPhone: '+91 98765 43213',
        invoiceNo: 'INV-2098',
        invoiceAmount: 120000,
        paymentAmount: 120000,
        paymentMode: 'cheque',
        paymentDate: '2024-01-10',
        paymentTime: '11:00 AM',
        transactionId: 'CHQ-654321',
        chequeNo: '654321',
        chequeDate: '2024-01-10',
        bankName: 'SBI',
        status: 'bounced',
        collectedBy: 'Sales Rep - Suresh',
        remarks: 'Cheque bounced - Insufficient funds',
        bounceCharges: 500,
        attachments: ['bounce_memo.pdf']
      },
      {
        id: 'PAY005',
        customerName: 'Apollo Pharmacy',
        customerPhone: '+91 98765 43214',
        invoiceNo: 'INV-2412',
        invoiceAmount: 180000,
        paymentAmount: 180000,
        paymentMode: 'rtgs',
        paymentDate: '2024-01-15',
        paymentTime: '3:30 PM',
        transactionId: 'RTGS202401151234',
        status: 'completed',
        collectedBy: 'Online Transfer',
        remarks: 'Auto-reconciled payment',
        attachments: []
      }
    ];

    setPayments(samplePayments);

    // Calculate stats
    const today = new Date().toISOString().split('T')[0];
    const todayPayments = samplePayments.filter(p => p.paymentDate === today && p.status === 'completed');
    const todayCollection = todayPayments.reduce((sum, p) => sum + p.paymentAmount, 0);

    setPaymentStats({
      todayCollection,
      weekCollection: 1250000,
      monthCollection: 5500000,
      pendingAmount: 450000,
      bounceRate: 5.2,
      collectionRate: 92.5
    });
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'bounced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getModeIcon = (mode) => {
    const modeConfig = paymentModes.find(m => m.id === mode);
    return modeConfig ? modeConfig.icon : CreditCard;
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.transactionId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || payment.paymentMode === filterType;
    
    // Date filtering would go here
    return matchesSearch && matchesType;
  });

  const sendPaymentReceipt = (payment) => {
    alert(`Payment receipt sent to ${payment.customerName} via WhatsApp`);
  };

  const handleExport = () => {
    // Create CSV content
    const headers = ['Payment ID', 'Date', 'Customer', 'Invoice', 'Amount', 'Mode', 'Status', 'Transaction ID'];
    const csvContent = [
      headers.join(','),
      ...filteredPayments.map(p => [
        p.id,
        p.paymentDate,
        p.customerName,
        p.invoiceNo,
        p.paymentAmount,
        p.paymentMode,
        p.status,
        p.transactionId || ''
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleMarkAsCleared = (payment) => {
    setPayments(prev => prev.map(p => 
      p.id === payment.id ? { ...p, status: 'completed' } : p
    ));
    alert('Payment marked as cleared');
  };

  const handleMarkAsBounced = (payment) => {
    setPayments(prev => prev.map(p => 
      p.id === payment.id ? { ...p, status: 'bounced', bounceCharges: 500 } : p
    ));
    alert('Payment marked as bounced');
  };

  const handleRepresentCheque = (payment) => {
    alert('Cheque re-presentation recorded');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Tracking</h1>
            <p className="text-gray-600">Real-time payment collection and tracking</p>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => handleExport()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <button 
              onClick={() => setShowAddPayment(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Record Payment
            </button>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-green-600">Today's Collection</p>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-900">₹{(paymentStats.todayCollection / 1000).toFixed(0)}K</p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-blue-600">This Week</p>
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-900">₹{(paymentStats.weekCollection / 100000).toFixed(1)}L</p>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-purple-600">This Month</p>
              <Calendar className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-900">₹{(paymentStats.monthCollection / 100000).toFixed(0)}L</p>
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-orange-600">Pending</p>
              <Clock className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-orange-900">₹{(paymentStats.pendingAmount / 100000).toFixed(1)}L</p>
          </div>

          <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-red-600">Bounce Rate</p>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-900">{paymentStats.bounceRate}%</p>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-green-600">Collection Rate</p>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-900">{paymentStats.collectionRate}%</p>
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
              placeholder="Search by customer, invoice or transaction ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Payment Types</option>
            {paymentModes.map(mode => (
              <option key={mode.id} value={mode.id}>{mode.name}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      {/* Payment List */}
      <div className="space-y-4">
        {filteredPayments.map((payment) => {
          const ModeIcon = getModeIcon(payment.paymentMode);
          const modeConfig = paymentModes.find(m => m.id === payment.paymentMode);
          
          return (
            <div key={payment.id} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 bg-${modeConfig?.color || 'gray'}-100 rounded-lg flex items-center justify-center`}>
                    <ModeIcon className={`w-6 h-6 text-${modeConfig?.color || 'gray'}-600`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{payment.customerName}</h3>
                    <div className="flex items-center space-x-3 text-sm text-gray-600">
                      <span>{payment.customerPhone}</span>
                      <span>•</span>
                      <span>Invoice: {payment.invoiceNo}</span>
                      <span>•</span>
                      <span>{payment.paymentDate} {payment.paymentTime}</span>
                    </div>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(payment.status)}`}>
                  {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </span>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Invoice Amount</p>
                  <p className="text-lg font-semibold">₹{payment.invoiceAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Payment Amount</p>
                  <p className={`text-lg font-semibold ${
                    payment.paymentAmount < payment.invoiceAmount ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    ₹{payment.paymentAmount.toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Payment Mode</p>
                  <p className="text-lg font-semibold">{modeConfig?.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Collected By</p>
                  <p className="text-sm font-medium">{payment.collectedBy}</p>
                </div>
              </div>

              {/* Additional Details */}
              {payment.paymentMode === 'cheque' && (
                <div className="bg-blue-50 rounded-lg p-3 mb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-600">Cheque No:</span>
                      <span className="ml-2 font-medium">{payment.chequeNo}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cheque Date:</span>
                      <span className="ml-2 font-medium">{payment.chequeDate}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Bank:</span>
                      <span className="ml-2 font-medium">{payment.bankName}</span>
                    </div>
                    {payment.status === 'bounced' && (
                      <div>
                        <span className="text-gray-600">Bounce Charges:</span>
                        <span className="ml-2 font-medium text-red-600">₹{payment.bounceCharges}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {payment.transactionId && payment.paymentMode !== 'cheque' && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <span className="text-sm text-gray-600">Transaction ID:</span>
                  <span className="ml-2 text-sm font-medium">{payment.transactionId}</span>
                </div>
              )}

              {payment.remarks && (
                <div className="text-sm text-gray-600 mb-4">
                  <span className="font-medium">Remarks:</span> {payment.remarks}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center space-x-2">
                  {payment.attachments.length > 0 && (
                    <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center">
                      <FileText className="w-4 h-4 mr-1" />
                      View Attachments ({payment.attachments.length})
                    </button>
                  )}
                  <button
                    onClick={() => sendPaymentReceipt(payment)}
                    className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Send Receipt
                  </button>
                </div>
                {payment.status === 'pending' && (
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => handleMarkAsCleared(payment)}
                      className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                    >
                      Mark as Cleared
                    </button>
                    <button 
                      onClick={() => handleMarkAsBounced(payment)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      Mark as Bounced
                    </button>
                  </div>
                )}
                {payment.status === 'bounced' && (
                  <button 
                    onClick={() => handleRepresentCheque(payment)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                  >
                    Re-present Cheque
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment Entry Modal */}
      <PaymentEntryModal open={showAddPayment} onClose={() => setShowAddPayment(false)} />
    </div>
  );
};

export default PaymentTracking;