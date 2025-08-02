import React, { useState, useEffect, useRef } from 'react';
import { 
  X,
  IndianRupee, 
  Search, 
  CreditCard,
  Banknote,
  Smartphone,
  Building,
  FileText,
  CheckCircle,
  Save,
  Phone,
  Mail,
  Upload,
  Trash2,
  Plus,
  Minus
} from 'lucide-react';

const PaymentEntryModal = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('simple');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [paymentMode, setPaymentMode] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef(null);
  
  const [paymentData, setPaymentData] = useState({
    // Backend payments table fields
    customer_id: '',
    amount: '',
    payment_mode: '',
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    remarks: '',
    payment_type: 'order_payment',
    status: 'completed',
    bank_name: '',
    transaction_id: '',
    
    // UI-specific fields
    paymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
    chequeNo: '',
    chequeDate: '',
    attachments: [],
    sendReceipt: true,
    allocationType: 'fifo'
  });
  
  const [errors, setErrors] = useState({});

  // Payment modes
  const paymentModes = [
    { id: 'cash', name: 'Cash', icon: Banknote, color: 'green' },
    { id: 'upi', name: 'UPI', icon: Smartphone, color: 'purple' },
    { id: 'cheque', name: 'Cheque', icon: FileText, color: 'blue' },
    { id: 'rtgs_neft', name: 'RTGS/NEFT', icon: Building, color: 'orange' },
    { id: 'card', name: 'Card', icon: CreditCard, color: 'pink' }
  ];

  // Sample customers
  const customers = [
    {
      id: 'CUST001',
      name: 'Rajesh Medical Store',
      phone: '+91 98765 43210',
      email: 'rajesh@medical.com',
      totalOutstanding: 450000,
      overdueAmount: 120000
    },
    {
      id: 'CUST002',
      name: 'City Hospital Pharmacy',
      phone: '+91 98765 43211',
      email: 'pharmacy@cityhospital.com',
      totalOutstanding: 850000,
      overdueAmount: 250000
    }
  ];

  // Sample invoices
  const sampleInvoices = [
    {
      id: 'INV-2401',
      date: '2024-01-05',
      amount: 150000,
      balance: 150000,
      daysOverdue: 0,
      status: 'pending'
    },
    {
      id: 'INV-2389',
      date: '2023-12-15',
      amount: 250000,
      balance: 150000,
      daysOverdue: 16,
      status: 'partial'
    }
  ];

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setActiveTab('simple');
    setSelectedCustomer(null);
    setSearchQuery('');
    setPaymentMode('');
    setSelectedInvoices([]);
    setPaymentData({
      paymentDate: new Date().toISOString().split('T')[0],
      paymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      amount: '',
      transactionId: '',
      chequeNo: '',
      chequeDate: '',
      bankName: '',
      remarks: '',
      attachments: [],
      sendReceipt: true,
      allocationType: 'fifo'
    });
    setErrors({});
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setShowCustomerSearch(false);
    setSearchQuery(customer.name);
  };

  const handleQuickFill = (amount) => {
    setPaymentData(prev => ({ ...prev, amount: amount.toString() }));
  };

  const handleInvoiceSelect = (invoice) => {
    setSelectedInvoices(prev => {
      const exists = prev.find(inv => inv.id === invoice.id);
      if (exists) {
        return prev.filter(inv => inv.id !== invoice.id);
      } else {
        return [...prev, { ...invoice, allocatedAmount: invoice.balance }];
      }
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    setTimeout(() => {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
      setLoading(false);
    }, 1000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center">
              <IndianRupee className="w-6 h-6 mr-2" />
              Payment Entry
            </h2>
            <p className="text-blue-100 mt-1">Record customer payments quickly</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-6 mt-6">
          <button
            onClick={() => setActiveTab('simple')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'simple'
                ? 'border-white text-white font-medium'
                : 'border-transparent text-blue-200 hover:text-white'
            }`}
          >
            Simple Payment
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'invoice'
                ? 'border-white text-white font-medium'
                : 'border-transparent text-blue-200 hover:text-white'
            }`}
          >
            Invoice Payment
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Customer Details</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Customer <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowCustomerSearch(true);
                  }}
                  onFocus={() => setShowCustomerSearch(true)}
                  placeholder="Search by name, phone, or GSTIN..."
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                
                {showCustomerSearch && searchQuery && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {customers
                      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(customer => (
                        <button
                          key={customer.id}
                          onClick={() => handleCustomerSelect(customer)}
                          className="w-full p-3 hover:bg-gray-50 text-left border-b last:border-b-0"
                        >
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-gray-600">{customer.phone}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {selectedCustomer && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-blue-900">{selectedCustomer.name}</h4>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-blue-700">
                      <span className="flex items-center">
                        <Phone className="w-3 h-3 mr-1" />
                        {selectedCustomer.phone}
                      </span>
                      <span className="flex items-center">
                        <Mail className="w-3 h-3 mr-1" />
                        {selectedCustomer.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSearchQuery('');
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-blue-600">Outstanding</p>
                    <p className="font-semibold text-blue-900">₹{selectedCustomer.totalOutstanding.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-blue-600">Overdue</p>
                    <p className="font-semibold text-red-600">₹{selectedCustomer.overdueAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Payment Details</h3>
            
            {/* Amount Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 text-lg font-medium border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {selectedCustomer && activeTab === 'simple' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleQuickFill(selectedCustomer.totalOutstanding)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200"
                  >
                    Full Outstanding (₹{selectedCustomer.totalOutstanding.toLocaleString()})
                  </button>
                  {selectedCustomer.overdueAmount > 0 && (
                    <button
                      onClick={() => handleQuickFill(selectedCustomer.overdueAmount)}
                      className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200"
                    >
                      Overdue (₹{selectedCustomer.overdueAmount.toLocaleString()})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment Mode Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Mode <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {paymentModes.map(mode => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setPaymentMode(mode.id)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        paymentMode === mode.id
                          ? `border-${mode.color}-500 bg-${mode.color}-50`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mx-auto mb-1 ${
                        paymentMode === mode.id ? `text-${mode.color}-600` : 'text-gray-600'
                      }`} />
                      <span className={`text-sm font-medium block ${
                        paymentMode === mode.id ? `text-${mode.color}-700` : 'text-gray-700'
                      }`}>
                        {mode.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Fields */}
            {paymentMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentData.paymentDate}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, paymentDate: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={paymentData.paymentTime}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, paymentTime: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {paymentMode === 'upi' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Transaction ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paymentData.transactionId}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, transactionId: e.target.value }))}
                      placeholder="Enter UPI transaction ID"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {paymentMode === 'cheque' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cheque No <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={paymentData.chequeNo}
                          onChange={(e) => setPaymentData(prev => ({ ...prev, chequeNo: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cheque Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={paymentData.chequeDate}
                          onChange={(e) => setPaymentData(prev => ({ ...prev, chequeDate: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={paymentData.bankName}
                        onChange={(e) => setPaymentData(prev => ({ ...prev, bankName: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    value={paymentData.remarks}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any notes..."
                  />
                </div>

                {activeTab === 'simple' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Invoice Allocation
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          value="fifo"
                          checked={paymentData.allocationType === 'fifo'}
                          onChange={(e) => setPaymentData(prev => ({ ...prev, allocationType: e.target.value }))}
                          className="mr-3"
                        />
                        <div>
                          <p className="font-medium">Auto-allocate (FIFO)</p>
                          <p className="text-sm text-gray-600">Apply to oldest invoices first</p>
                        </div>
                      </label>
                      <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          value="none"
                          checked={paymentData.allocationType === 'none'}
                          onChange={(e) => setPaymentData(prev => ({ ...prev, allocationType: e.target.value }))}
                          className="mr-3"
                        />
                        <div>
                          <p className="font-medium">Keep as advance</p>
                          <p className="text-sm text-gray-600">Don't allocate to any invoice</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice Selection for Invoice Tab */}
          {activeTab === 'invoice' && selectedCustomer && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Select Invoices</h3>
              <div className="space-y-3">
                {sampleInvoices.map(invoice => {
                  const isSelected = selectedInvoices.find(inv => inv.id === invoice.id);
                  
                  return (
                    <div
                      key={invoice.id}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => handleInvoiceSelect(invoice)}
                            className="mt-1 mr-3 w-4 h-4 text-blue-600 rounded"
                          />
                          <div>
                            <span className="font-medium">{invoice.id}</span>
                            <div className="text-sm text-gray-600 mt-1">
                              Date: {invoice.date}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">₹{invoice.balance.toLocaleString()}</div>
                          <div className="text-xs text-gray-500">
                            of ₹{invoice.amount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-6 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={paymentData.sendReceipt}
                onChange={(e) => setPaymentData(prev => ({ ...prev, sendReceipt: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-sm">Send receipt via WhatsApp</span>
            </label>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Recording...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Record Payment
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center z-50">
          <CheckCircle className="w-5 h-5 mr-2" />
          Payment recorded successfully!
        </div>
      )}
    </div>
  );
};

export default PaymentEntryModal;