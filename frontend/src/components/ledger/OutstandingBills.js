import React, { useState, useEffect } from 'react';
import {
  CreditCard, Search, Filter, Download, Eye, AlertTriangle,
  Clock, CheckCircle, XCircle, Calendar, Phone, Mail,
  X, RefreshCw, FileText, TrendingUp
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { DataTable, StatusBadge, Select, DatePicker, SummaryCard } from '../global';

const OutstandingBills = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [partyType, setPartyType] = useState('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agingFilter, setAgingFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [summary, setSummary] = useState({
    totalBills: 0,
    totalOutstanding: 0,
    overdueBills: 0,
    overdueAmount: 0
  });

  useEffect(() => {
    loadOutstandingBills();
  }, [partyType]);

  useEffect(() => {
    filterBills();
  }, [bills, searchQuery, statusFilter, agingFilter]);

  const loadOutstandingBills = async () => {
    setLoading(true);
    try {
      // TODO: Remove mock data when backend schema is fixed
      // Generate mock outstanding bills for demonstration
      const mockBills = Array.from({ length: 30 }, (_, i) => {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() - Math.floor(Math.random() * 120) + 30);
        const billDate = new Date(dueDate);
        billDate.setDate(billDate.getDate() - 30);
        
        const billAmount = Math.random() * 50000 + 5000;
        const paidAmount = Math.random() > 0.6 ? Math.random() * billAmount * 0.7 : 0;
        const daysOverdue = Math.max(0, Math.floor((new Date() - dueDate) / (1000 * 60 * 60 * 24)));
        
        return {
          bill_id: `bill-${i}`,
          party_id: `party-${Math.floor(Math.random() * 20)}`,
          party_name: `${partyType === 'customer' ? 'Customer' : 'Supplier'} ${Math.floor(Math.random() * 20) + 1}`,
          bill_number: `INV-2025-${1000 + i}`,
          bill_date: billDate.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          bill_amount: billAmount,
          paid_amount: paidAmount,
          outstanding_amount: billAmount - paidAmount,
          days_overdue: daysOverdue,
          status: paidAmount === 0 ? (daysOverdue > 0 ? 'overdue' : 'outstanding') : 'partial',
          aging_bucket: daysOverdue <= 0 ? 'Current' : 
                       daysOverdue <= 30 ? '0-30' :
                       daysOverdue <= 60 ? '31-60' :
                       daysOverdue <= 90 ? '61-90' :
                       daysOverdue <= 120 ? '91-120' : '>120'
        };
      });
      
      setBills(mockBills);
      
      // Calculate summary
      const summary = mockBills.reduce((acc, bill) => {
        acc.totalBills++;
        acc.totalOutstanding += bill.outstanding_amount;
        
        if (bill.days_overdue > 0) {
          acc.overdueBills++;
          acc.overdueAmount += bill.outstanding_amount;
        }
        
        return acc;
      }, {
        totalBills: 0,
        totalOutstanding: 0,
        overdueBills: 0,
        overdueAmount: 0
      });
      
      setSummary(summary);
      
      /* Original API call - restore when backend is fixed
      const response = await ledgerApi.getOutstandingBills(null, {
        partyType: partyType,
        limit: 500
      });
      const billsData = response.data.bills || [];
      setBills(billsData);
      */
    } catch (error) {
      console.error('Error loading outstanding bills:', error);
      setBills([]);
      setSummary({
        totalBills: 0,
        totalOutstanding: 0,
        overdueBills: 0,
        overdueAmount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const filterBills = () => {
    let filtered = [...bills];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(bill =>
        bill.party_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.bill_number.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(bill => bill.status === statusFilter);
    }

    // Aging filter
    if (agingFilter !== 'all') {
      filtered = filtered.filter(bill => bill.aging_bucket === agingFilter);
    }

    // Sort by overdue days (most overdue first)
    filtered.sort((a, b) => b.days_overdue - a.days_overdue);

    setFilteredBills(filtered);
  };

  const handleExportBills = async () => {
    try {
      const csvHeaders = [
        'Party Name',
        'Bill Number',
        'Bill Date',
        'Due Date',
        'Bill Amount',
        'Paid Amount',
        'Outstanding Amount',
        'Days Overdue',
        'Status',
        'Aging Bucket'
      ];

      const csvData = filteredBills.map(bill => [
        bill.party_name,
        bill.bill_number,
        bill.bill_date,
        bill.due_date || '',
        bill.bill_amount,
        bill.paid_amount,
        bill.outstanding_amount,
        bill.days_overdue,
        bill.status,
        bill.aging_bucket
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `outstanding_bills_${partyType}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`Successfully exported ${filteredBills.length} outstanding bills`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const getBillStatus = (bill) => {
    if (bill.status === 'paid') {
      return { color: 'green', text: 'Paid', icon: CheckCircle };
    } else if (bill.status === 'overdue') {
      return { color: 'red', text: 'Overdue', icon: AlertTriangle };
    } else if (bill.status === 'partial') {
      return { color: 'yellow', text: 'Partial', icon: Clock };
    } else {
      return { color: 'blue', text: 'Outstanding', icon: FileText };
    }
  };

  const getAgingColor = (agingBucket) => {
    switch (agingBucket) {
      case 'Current': return 'green';
      case '0-30': return 'yellow';
      case '31-60': return 'orange';
      case '61-90': return 'red';
      case '91-120': return 'red';
      case '>120': return 'red';
      default: return 'gray';
    }
  };

  const handleSendReminder = async (bill) => {
    try {
      const reminderData = {
        party_id: bill.party_id,
        party_type: partyType,
        reminder_type: 'whatsapp',
        reminder_date: new Date().toISOString().split('T')[0],
        outstanding_amount: bill.outstanding_amount,
        bills_count: 1,
        message_content: `Dear ${bill.party_name}, your bill ${bill.bill_number} of ${formatCurrency(bill.outstanding_amount)} is pending. Please make payment at your earliest convenience.`
      };

      await ledgerApi.createCollectionReminder(reminderData);
      alert('Reminder sent successfully!');
    } catch (error) {
      console.error('Error sending reminder:', error);
      alert('Failed to send reminder. Please try again.');
    }
  };

  const columns = [
    {
      header: 'Party & Bill',
      field: 'party_name',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.party_name}</div>
          <div className="text-sm text-gray-500">
            Bill: {row.bill_number}
          </div>
          <div className="text-xs text-gray-500">
            Date: {formatDate(row.bill_date)}
          </div>
        </div>
      )
    },
    {
      header: 'Amount Details',
      field: 'bill_amount',
      render: (row) => (
        <div className="text-right">
          <div className="text-sm text-gray-600">
            Total: {formatCurrency(row.bill_amount)}
          </div>
          {row.paid_amount > 0 && (
            <div className="text-sm text-green-600">
              Paid: {formatCurrency(row.paid_amount)}
            </div>
          )}
          <div className="font-bold text-red-600">
            Due: {formatCurrency(row.outstanding_amount)}
          </div>
        </div>
      )
    },
    {
      header: 'Due Date & Aging',
      field: 'due_date',
      render: (row) => (
        <div className="text-center">
          {row.due_date && (
            <div className="text-sm font-medium">
              {formatDate(row.due_date)}
            </div>
          )}
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${
            row.days_overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {row.days_overdue > 0 ? `${row.days_overdue} days overdue` : 'Not due'}
          </div>
          <div className="mt-1">
            <StatusBadge
              status={row.aging_bucket}
              color={getAgingColor(row.aging_bucket)}
            />
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      field: 'status',
      render: (row) => {
        const status = getBillStatus(row);
        return (
          <div className="flex items-center space-x-2">
            <status.icon className={`w-4 h-4 text-${status.color}-600`} />
            <StatusBadge
              status={status.text}
              color={status.color}
            />
          </div>
        );
      }
    }
  ];

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Outstanding Bills</h1>
              <p className="text-sm text-gray-600">Track pending payments & overdue amounts</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportBills}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              
              <button
                onClick={loadOutstandingBills}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Total Bills"
              value={summary.totalBills}
              icon={FileText}
              color="blue"
            />

            <SummaryCard
              title="Total Outstanding"
              value={formatCurrency(summary.totalOutstanding)}
              icon={CreditCard}
              color="amber"
            />

            <SummaryCard
              title="Overdue Bills"
              value={summary.overdueBills}
              icon={AlertTriangle}
              color="red"
            />

            <SummaryCard
              title="Overdue Amount"
              value={formatCurrency(summary.overdueAmount)}
              icon={TrendingUp}
              color="red"
            />
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <Filter className="w-4 h-4" />
                <span>{showFilters ? 'Hide' : 'Show'} Filters</span>
              </button>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${showFilters ? '' : 'hidden'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Type
                </label>
                <Select
                  value={partyType}
                  onChange={setPartyType}
                  options={[
                    { value: 'customer', label: 'Customers' },
                    { value: 'supplier', label: 'Suppliers' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'outstanding', label: 'Outstanding' },
                    { value: 'overdue', label: 'Overdue' },
                    { value: 'partial', label: 'Partial Paid' }
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aging
                </label>
                <Select
                  value={agingFilter}
                  onChange={setAgingFilter}
                  options={[
                    { value: 'all', label: 'All Ages' },
                    { value: 'Current', label: 'Current' },
                    { value: '0-30', label: '0-30 Days' },
                    { value: '31-60', label: '31-60 Days' },
                    { value: '61-90', label: '61-90 Days' },
                    { value: '>120', label: '>120 Days' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search party or bill..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bills Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredBills.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredBills}
                actions={(row) => (
                  row.days_overdue > 0 && (
                    <button
                      onClick={() => handleSendReminder(row)}
                      className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                      title="Send Payment Reminder"
                    >
                      <Phone className="w-3 h-3" />
                    </button>
                  )
                )}
                emptyMessage="No outstanding bills found"
              />
            ) : (
              <div className="text-center py-12">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No outstanding bills found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchQuery || statusFilter !== 'all' || agingFilter !== 'all'
                    ? 'Try adjusting your filters' 
                    : `All ${partyType} bills are settled`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutstandingBills;