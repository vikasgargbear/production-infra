import React, { useState, useEffect } from 'react';
import {
  Phone, Mail, MessageSquare, Users, Clock, CheckCircle,
  AlertTriangle, Search, Filter, Plus, Eye, X, RefreshCw,
  Calendar, Send, User, FileText, DollarSign
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { DataTable, StatusBadge, Select, DatePicker, SummaryCard } from '../global';
import { CustomerSearch } from '../global';

const CollectionCenter = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState([]);
  const [filteredReminders, setFilteredReminders] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    reminderType: 'all',
    status: 'all',
    fromDate: '',
    toDate: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState({
    totalReminders: 0,
    pendingReminders: 0,
    completedReminders: 0,
    totalAmount: 0
  });

  // Create reminder form state
  const [createForm, setCreateForm] = useState({
    selectedParty: null,
    partyType: 'customer',
    reminderType: 'whatsapp',
    reminderDate: new Date().toISOString().split('T')[0],
    outstandingAmount: '',
    billsCount: '',
    messageContent: ''
  });

  useEffect(() => {
    loadReminders();
  }, []);

  useEffect(() => {
    filterReminders();
  }, [reminders, searchQuery, filters]);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const response = await ledgerApi.getCollectionReminders({
        limit: 200
      });
      
      const remindersData = response.data.reminders || [];
      setReminders(remindersData);
      
      // Calculate summary
      const summary = remindersData.reduce((acc, reminder) => {
        acc.totalReminders++;
        acc.totalAmount += reminder.outstanding_amount || 0;
        
        if (reminder.status === 'pending') {
          acc.pendingReminders++;
        } else if (reminder.status === 'completed') {
          acc.completedReminders++;
        }
        
        return acc;
      }, {
        totalReminders: 0,
        pendingReminders: 0,
        completedReminders: 0,
        totalAmount: 0
      });
      
      setSummary(summary);
    } catch (error) {
      console.error('Error loading reminders:', error);
      setReminders([]);
      setSummary({
        totalReminders: 0,
        pendingReminders: 0,
        completedReminders: 0,
        totalAmount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const filterReminders = () => {
    let filtered = [...reminders];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(reminder =>
        reminder.party_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (reminder.phone && reminder.phone.includes(searchQuery))
      );
    }

    // Reminder type filter
    if (filters.reminderType !== 'all') {
      filtered = filtered.filter(reminder => reminder.reminder_type === filters.reminderType);
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(reminder => reminder.status === filters.status);
    }

    // Date range filter
    if (filters.fromDate) {
      filtered = filtered.filter(reminder => reminder.reminder_date >= filters.fromDate);
    }
    if (filters.toDate) {
      filtered = filtered.filter(reminder => reminder.reminder_date <= filters.toDate);
    }

    // Sort by reminder date (most recent first)
    filtered.sort((a, b) => new Date(b.reminder_date) - new Date(a.reminder_date));

    setFilteredReminders(filtered);
  };

  const handleCreateReminder = async () => {
    if (!createForm.selectedParty || !createForm.outstandingAmount) {
      alert('Please select a party and enter outstanding amount');
      return;
    }

    try {
      const reminderData = {
        party_id: createForm.selectedParty.customer_id || createForm.selectedParty.supplier_id,
        party_type: createForm.partyType,
        reminder_type: createForm.reminderType,
        reminder_date: createForm.reminderDate,
        outstanding_amount: parseFloat(createForm.outstandingAmount),
        bills_count: parseInt(createForm.billsCount) || 1,
        message_content: createForm.messageContent || generateDefaultMessage()
      };

      await ledgerApi.createCollectionReminder(reminderData);
      
      // Reset form and reload data
      setCreateForm({
        selectedParty: null,
        partyType: 'customer',
        reminderType: 'whatsapp',
        reminderDate: new Date().toISOString().split('T')[0],
        outstandingAmount: '',
        billsCount: '',
        messageContent: ''
      });
      setShowCreateForm(false);
      loadReminders();
      
      alert('Reminder created successfully!');
    } catch (error) {
      console.error('Error creating reminder:', error);
      alert('Failed to create reminder. Please try again.');
    }
  };

  const handleUpdateReminderStatus = async (reminderId, newStatus, responseNotes = '') => {
    try {
      await ledgerApi.updateReminderStatus(reminderId, newStatus, responseNotes);
      loadReminders();
      alert('Reminder status updated successfully!');
    } catch (error) {
      console.error('Error updating reminder status:', error);
      alert('Failed to update reminder status. Please try again.');
    }
  };

  const generateDefaultMessage = () => {
    const partyName = createForm.selectedParty?.customer_name || createForm.selectedParty?.supplier_name || '';
    const amount = formatCurrency(createForm.outstandingAmount);
    
    return `Dear ${partyName}, you have outstanding bills totaling ${amount}. Please arrange payment at your earliest convenience. Thank you.`;
  };

  const getReminderTypeIcon = (type) => {
    switch (type) {
      case 'whatsapp':
        return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'sms':
        return <Phone className="w-4 h-4 text-blue-600" />;
      case 'email':
        return <Mail className="w-4 h-4 text-purple-600" />;
      case 'call':
        return <Phone className="w-4 h-4 text-orange-600" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-600" />;
    }
  };

  const getReminderStatus = (reminder) => {
    switch (reminder.status) {
      case 'pending':
        return { color: 'yellow', text: 'Pending', icon: Clock };
      case 'sent':
        return { color: 'blue', text: 'Sent', icon: Send };
      case 'completed':
        return { color: 'green', text: 'Completed', icon: CheckCircle };
      case 'failed':
        return { color: 'red', text: 'Failed', icon: AlertTriangle };
      default:
        return { color: 'gray', text: 'Unknown', icon: Clock };
    }
  };

  const columns = [
    {
      header: 'Party & Contact',
      field: 'party_name',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.party_name}</div>
          {row.phone && (
            <div className="text-sm text-gray-500">📞 {row.phone}</div>
          )}
          {row.email && (
            <div className="text-sm text-gray-500">✉️ {row.email}</div>
          )}
        </div>
      )
    },
    {
      header: 'Reminder Details',
      field: 'reminder_type',
      render: (row) => (
        <div>
          <div className="flex items-center space-x-2 mb-1">
            {getReminderTypeIcon(row.reminder_type)}
            <span className="text-sm font-medium capitalize">
              {row.reminder_type}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Date: {formatDate(row.reminder_date)}
          </div>
          <div className="text-sm text-gray-500">
            Bills: {row.bills_count}
          </div>
        </div>
      )
    },
    {
      header: 'Amount',
      field: 'outstanding_amount',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-red-600">
            {formatCurrency(row.outstanding_amount)}
          </div>
          <div className="text-sm text-gray-500">
            Outstanding
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      field: 'status',
      render: (row) => {
        const status = getReminderStatus(row);
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
    },
    {
      header: 'Actions',
      field: 'actions',
      render: (row) => (
        <div className="flex items-center space-x-2">
          {row.status === 'pending' && (
            <>
              <button
                onClick={() => handleUpdateReminderStatus(row.reminder_id, 'sent')}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                title="Mark as Sent"
              >
                <Send className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleUpdateReminderStatus(row.reminder_id, 'completed', 'Payment received')}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                title="Mark as Completed"
              >
                <CheckCircle className="w-3 h-3" />
              </button>
            </>
          )}
          {row.status === 'sent' && (
            <button
              onClick={() => handleUpdateReminderStatus(row.reminder_id, 'completed', 'Payment received')}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              title="Mark as Completed"
            >
              <CheckCircle className="w-3 h-3" />
            </button>
          )}
        </div>
      )
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
              <h1 className="text-2xl font-bold text-gray-900">Collection Center</h1>
              <p className="text-sm text-gray-600">Manage payment follow-up & reminders</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>New Reminder</span>
              </button>
              
              <button
                onClick={loadReminders}
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
              title="Total Reminders"
              value={summary.totalReminders}
              icon={MessageSquare}
              color="blue"
            />

            <SummaryCard
              title="Pending"
              value={summary.pendingReminders}
              icon={Clock}
              color="yellow"
              subtitle="Need follow-up"
            />

            <SummaryCard
              title="Completed"
              value={summary.completedReminders}
              icon={CheckCircle}
              color="green"
              subtitle="Successfully resolved"
            />

            <SummaryCard
              title="Total Amount"
              value={formatCurrency(summary.totalAmount)}
              icon={DollarSign}
              color="red"
              subtitle="Outstanding"
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

            <div className={`grid grid-cols-1 md:grid-cols-5 gap-4 ${showFilters ? '' : 'hidden'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reminder Type
                </label>
                <Select
                  value={filters.reminderType}
                  onChange={(value) => setFilters(prev => ({ ...prev, reminderType: value }))}
                  options={[
                    { value: 'all', label: 'All Types' },
                    { value: 'whatsapp', label: 'WhatsApp' },
                    { value: 'sms', label: 'SMS' },
                    { value: 'email', label: 'Email' },
                    { value: 'call', label: 'Phone Call' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select
                  value={filters.status}
                  onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'sent', label: 'Sent' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'failed', label: 'Failed' }
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    placeholder="Search party..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reminders Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredReminders.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredReminders}
                emptyMessage="No reminders found"
              />
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No reminders found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchQuery || filters.reminderType !== 'all' || filters.status !== 'all'
                    ? 'Try adjusting your filters' 
                    : 'Create your first payment reminder'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Reminder Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Create Payment Reminder</h2>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Party Type
                  </label>
                  <Select
                    value={createForm.partyType}
                    onChange={(value) => setCreateForm(prev => ({ ...prev, partyType: value }))}
                    options={[
                      { value: 'customer', label: 'Customer' },
                      { value: 'supplier', label: 'Supplier' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Party
                  </label>
                  <CustomerSearch
                    onChange={(party) => setCreateForm(prev => ({ ...prev, selectedParty: party }))}
                    placeholder={`Search ${createForm.partyType}...`}
                    className="w-full"
                  />
                </div>
              </div>

              {createForm.selectedParty && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {createForm.selectedParty.customer_name || createForm.selectedParty.supplier_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {createForm.selectedParty.phone && `Phone: ${createForm.selectedParty.phone}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reminder Type
                  </label>
                  <Select
                    value={createForm.reminderType}
                    onChange={(value) => setCreateForm(prev => ({ ...prev, reminderType: value }))}
                    options={[
                      { value: 'whatsapp', label: 'WhatsApp' },
                      { value: 'sms', label: 'SMS' },
                      { value: 'email', label: 'Email' },
                      { value: 'call', label: 'Phone Call' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outstanding Amount *
                  </label>
                  <input
                    type="number"
                    value={createForm.outstandingAmount}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, outstandingAmount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Bills
                  </label>
                  <input
                    type="number"
                    value={createForm.billsCount}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, billsCount: e.target.value }))}
                    placeholder="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reminder Date
                </label>
                <input
                  type="date"
                  value={createForm.reminderDate}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, reminderDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message Content
                </label>
                <textarea
                  value={createForm.messageContent}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, messageContent: e.target.value }))}
                  placeholder={generateDefaultMessage()}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="text-sm text-gray-500 mt-1">
                  Leave blank to use default message
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReminder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Reminder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionCenter;