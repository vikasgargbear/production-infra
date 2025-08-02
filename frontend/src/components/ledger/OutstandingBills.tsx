/**
 * OutstandingBills Component
 * Displays pending invoices and bills with aging and collection tracking
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Filter,
  Mail,
  Phone,
  Search,
  TrendingUp,
  CheckCircle,
  Clock,
  Download,
  MessageSquare
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { CustomerSearch, SupplierSearch, DataTable, StatusBadge } from '../global';
import { formatCurrency } from '../../utils/formatters';

interface OutstandingBillsProps {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onBillClick?: (bill: OutstandingBill) => void;
  onPaymentClick?: (bill: OutstandingBill) => void;
}

interface OutstandingBill {
  id: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  party_id: string;
  party_name: string;
  party_phone: string;
  party_email: string;
  bill_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  days_overdue: number;
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | 'over_90';
  status: 'pending' | 'partial' | 'overdue';
  last_reminder_date?: string;
  reminder_count: number;
  collection_status?: 'normal' | 'follow_up' | 'critical' | 'legal';
  notes?: string;
}

interface Summary {
  total_outstanding: number;
  total_overdue: number;
  bills_count: number;
  overdue_bills_count: number;
  aging_summary: {
    current: { count: number; amount: number };
    '1-30': { count: number; amount: number };
    '31-60': { count: number; amount: number };
    '61-90': { count: number; amount: number };
    over_90: { count: number; amount: number };
  };
}

const OutstandingBills: React.FC<OutstandingBillsProps> = ({
  partyType = 'customer',
  partyId,
  embedded = false,
  onBillClick,
  onPaymentClick
}) => {
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [filters, setFilters] = useState({
    status: 'all',
    agingBucket: 'all',
    collectionStatus: 'all',
    searchQuery: ''
  });
  const [selectedBills, setSelectedBills] = useState<string[]>([]);

  // Fetch outstanding bills
  const { data, isLoading, refetch } = useQuery(
    ['outstanding-bills', partyId || selectedParty?.id, partyType, filters],
    () => ledgerApi.getOutstanding({
      party_id: partyId || selectedParty?.id,
      party_type: partyType,
      status: filters.status !== 'all' ? filters.status : undefined,
      aging_bucket: filters.agingBucket !== 'all' ? filters.agingBucket : undefined,
      collection_status: filters.collectionStatus !== 'all' ? filters.collectionStatus : undefined
    }),
    {
      enabled: !!(partyId || selectedParty?.id) || !partyId
    }
  );

  const bills = data?.bills || [];
  const summary: Summary = data?.summary || {
    total_outstanding: 0,
    total_overdue: 0,
    bills_count: 0,
    overdue_bills_count: 0,
    aging_summary: {
      current: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      over_90: { count: 0, amount: 0 }
    }
  };

  // Filter bills based on search
  const filteredBills = useMemo(() => {
    if (!filters.searchQuery) return bills;
    
    const query = filters.searchQuery.toLowerCase();
    return bills.filter((bill: OutstandingBill) =>
      bill.bill_number.toLowerCase().includes(query) ||
      bill.party_name.toLowerCase().includes(query) ||
      bill.notes?.toLowerCase().includes(query)
    );
  }, [bills, filters.searchQuery]);

  const handleSendReminder = async (billIds: string[]) => {
    try {
      await ledgerApi.sendReminders({
        bill_ids: billIds,
        method: 'email',
        template: 'payment_reminder'
      });
      refetch();
    } catch (error) {
      console.error('Failed to send reminders:', error);
    }
  };

  const handleExport = async () => {
    try {
      const response = await ledgerApi.exportOutstanding({
        party_id: partyId || selectedParty?.id,
        party_type: partyType,
        format: 'excel'
      });
      
      // Handle file download
      const blob = new Blob([response.data], {
        type: 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `outstanding-bills-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'green';
      case '1-30': return 'yellow';
      case '31-60': return 'orange';
      case '61-90': return 'red';
      case 'over_90': return 'purple';
      default: return 'gray';
    }
  };

  const getCollectionStatusColor = (status?: string) => {
    switch (status) {
      case 'normal': return 'green';
      case 'follow_up': return 'yellow';
      case 'critical': return 'red';
      case 'legal': return 'purple';
      default: return 'gray';
    }
  };

  const columns = [
    {
      key: 'select',
      label: (
        <input
          type="checkbox"
          checked={selectedBills.length === filteredBills.length && filteredBills.length > 0}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedBills(filteredBills.map((bill: OutstandingBill) => bill.id));
            } else {
              setSelectedBills([]);
            }
          }}
        />
      ),
      render: (bill: OutstandingBill) => (
        <input
          type="checkbox"
          checked={selectedBills.includes(bill.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedBills([...selectedBills, bill.id]);
            } else {
              setSelectedBills(selectedBills.filter(id => id !== bill.id));
            }
          }}
        />
      ),
      width: '50px'
    },
    {
      key: 'bill',
      label: 'Bill Details',
      render: (bill: OutstandingBill) => (
        <div>
          <button
            onClick={() => onBillClick?.(bill)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {bill.bill_number}
          </button>
          <div className="text-sm text-gray-500">
            {format(parseISO(bill.bill_date), 'dd/MM/yyyy')}
          </div>
        </div>
      )
    },
    {
      key: 'party',
      label: partyType === 'customer' ? 'Customer' : 'Supplier',
      render: (bill: OutstandingBill) => (
        <div>
          <div className="font-medium">{bill.party_name}</div>
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Phone className="h-3 w-3" />
            {bill.party_phone}
          </div>
        </div>
      )
    },
    {
      key: 'amounts',
      label: 'Amount Details',
      render: (bill: OutstandingBill) => (
        <div className="text-right">
          <div className="text-sm text-gray-500">
            Bill: {formatCurrency(bill.bill_amount)}
          </div>
          <div className="text-sm text-gray-500">
            Paid: {formatCurrency(bill.paid_amount)}
          </div>
          <div className="font-semibold text-red-600">
            Due: {formatCurrency(bill.outstanding_amount)}
          </div>
        </div>
      )
    },
    {
      key: 'due_date',
      label: 'Due Date',
      render: (bill: OutstandingBill) => (
        <div>
          <div className={bill.days_overdue > 0 ? 'text-red-600 font-medium' : ''}>
            {format(parseISO(bill.due_date), 'dd/MM/yyyy')}
          </div>
          {bill.days_overdue > 0 && (
            <div className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {bill.days_overdue} days overdue
            </div>
          )}
        </div>
      )
    },
    {
      key: 'aging',
      label: 'Aging',
      render: (bill: OutstandingBill) => (
        <StatusBadge
          status={bill.aging_bucket}
          color={getAgingColor(bill.aging_bucket)}
          label={bill.aging_bucket === 'over_90' ? 'Over 90 days' : bill.aging_bucket}
        />
      )
    },
    {
      key: 'collection',
      label: 'Collection Status',
      render: (bill: OutstandingBill) => (
        <div>
          {bill.collection_status && (
            <StatusBadge
              status={bill.collection_status}
              color={getCollectionStatusColor(bill.collection_status)}
              label={bill.collection_status.replace('_', ' ').toUpperCase()}
            />
          )}
          {bill.reminder_count > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {bill.reminder_count} reminders sent
            </div>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (bill: OutstandingBill) => (
        <div className="flex gap-2">
          <button
            onClick={() => onPaymentClick?.(bill)}
            className="text-green-600 hover:text-green-800"
            title="Record Payment"
          >
            <DollarSign className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleSendReminder([bill.id])}
            className="text-blue-600 hover:text-blue-800"
            title="Send Reminder"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            className="text-gray-600 hover:text-gray-800"
            title="Add Note"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Outstanding Bills</h1>
          <p className="text-gray-600">Track and manage pending payments</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-800">
                {formatCurrency(summary.total_outstanding)}
              </p>
              <p className="text-sm text-gray-500">{summary.bills_count} bills</p>
            </div>
            <DollarSign className="h-10 w-10 text-gray-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Overdue Amount</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.total_overdue)}
              </p>
              <p className="text-sm text-gray-500">{summary.overdue_bills_count} bills</p>
            </div>
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.aging_summary.current.amount)}
              </p>
              <p className="text-sm text-gray-500">
                {summary.aging_summary.current.count} bills
              </p>
            </div>
            <CheckCircle className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Over 90 Days</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(summary.aging_summary.over_90.amount)}
              </p>
              <p className="text-sm text-gray-500">
                {summary.aging_summary.over_90.count} bills
              </p>
            </div>
            <Clock className="h-10 w-10 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4">
          {!partyId && (
            <div className="flex-1 min-w-[300px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {partyType === 'customer' ? 'Customer' : 'Supplier'}
              </label>
              {partyType === 'customer' ? (
                <CustomerSearch
                  onSelect={setSelectedParty}
                  placeholder="Search customer"
                />
              ) : (
                <SupplierSearch
                  onSelect={setSelectedParty}
                  placeholder="Search supplier"
                />
              )}
            </div>
          )}

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aging
            </label>
            <select
              value={filters.agingBucket}
              onChange={(e) => setFilters({ ...filters, agingBucket: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="all">All Periods</option>
              <option value="current">Current</option>
              <option value="1-30">1-30 days</option>
              <option value="31-60">31-60 days</option>
              <option value="61-90">61-90 days</option>
              <option value="over_90">Over 90 days</option>
            </select>
          </div>

          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                placeholder="Search bills..."
                className="pl-10 pr-4 py-2 w-full border rounded-md"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-lg shadow">
        {selectedBills.length > 0 && (
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {selectedBills.length} bills selected
            </span>
            <button
              onClick={() => handleSendReminder(selectedBills)}
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center gap-2"
            >
              <Mail className="h-3 w-3" />
              Send Reminders
            </button>
          </div>
        )}
        
        <DataTable
          columns={columns}
          data={filteredBills}
          loading={isLoading}
          emptyMessage="No outstanding bills found"
        />
      </div>
    </div>
  );
};

export default OutstandingBills;