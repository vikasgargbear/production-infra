/**
 * CollectionCenter Component
 * Central hub for managing payment collections, follow-ups, and recovery processes
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'react-query';
import {
  Users,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  BarChart3,
  FileText,
  Download,
  Filter,
  Search,
  ChevronRight,
  UserCheck,
  MapPin
} from 'lucide-react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { DataTable, StatusBadge, Select, DatePicker } from '../global';
import { formatCurrency } from '../../utils/formatters';

interface CollectionCenterProps {
  embedded?: boolean;
  onCustomerClick?: (customer: CollectionItem) => void;
}

interface CollectionItem {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  total_outstanding: number;
  overdue_amount: number;
  days_overdue: number;
  oldest_invoice_date: string;
  last_payment_date?: string;
  last_contact_date?: string;
  contact_attempts: number;
  collection_status: 'pending' | 'contacted' | 'promised' | 'partial' | 'dispute' | 'legal';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string;
  next_follow_up?: string;
  promise_date?: string;
  promise_amount?: number;
  notes?: string;
  payment_behavior: 'regular' | 'delayed' | 'defaulter';
}

interface CollectionStats {
  total_outstanding: number;
  total_overdue: number;
  collections_today: number;
  collections_mtd: number;
  promise_amount: number;
  customers_count: number;
  critical_accounts: number;
  success_rate: number;
}

interface CollectionAgent {
  id: string;
  name: string;
  active_cases: number;
  collected_today: number;
  collected_mtd: number;
  success_rate: number;
}

const CollectionCenter: React.FC<CollectionCenterProps> = ({
  embedded = false,
  onCustomerClick
}) => {
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assignedTo: 'all',
    daysOverdue: 'all',
    searchQuery: ''
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  // Fetch collection data
  const { data, isLoading, refetch } = useQuery(
    ['collection-center', filters],
    () => ledgerApi.getCollectionData({
      status: filters.status !== 'all' ? filters.status : undefined,
      priority: filters.priority !== 'all' ? filters.priority : undefined,
      assigned_to: filters.assignedTo !== 'all' ? filters.assignedTo : undefined,
      days_overdue_range: filters.daysOverdue !== 'all' ? filters.daysOverdue : undefined
    }),
    {
      refetchInterval: 60000 // Refresh every minute
    }
  );

  // Fetch collection agents
  const { data: agents } = useQuery(
    'collection-agents',
    () => ledgerApi.getCollectionAgents()
  );

  const collections = data?.collections || [];
  const stats: CollectionStats = data?.stats || {
    total_outstanding: 0,
    total_overdue: 0,
    collections_today: 0,
    collections_mtd: 0,
    promise_amount: 0,
    customers_count: 0,
    critical_accounts: 0,
    success_rate: 0
  };

  // Filter collections
  const filteredCollections = useMemo(() => {
    if (!filters.searchQuery) return collections;
    
    const query = filters.searchQuery.toLowerCase();
    return collections.filter((item: CollectionItem) =>
      item.customer_name.toLowerCase().includes(query) ||
      item.customer_phone.includes(query) ||
      item.notes?.toLowerCase().includes(query)
    );
  }, [collections, filters.searchQuery]);

  // Mutations
  const updateStatusMutation = useMutation(
    ({ customerId, status }: { customerId: string; status: string }) =>
      ledgerApi.updateCollectionStatus(customerId, status),
    {
      onSuccess: () => refetch()
    }
  );

  const assignAgentMutation = useMutation(
    ({ customerIds, agentId }: { customerIds: string[]; agentId: string }) =>
      ledgerApi.assignCollectionAgent(customerIds, agentId),
    {
      onSuccess: () => {
        refetch();
        setSelectedItems([]);
        setShowAssignModal(false);
      }
    }
  );

  const recordContactMutation = useMutation(
    (data: { customerId: string; type: string; notes: string; nextFollowUp?: string }) =>
      ledgerApi.recordCollectionContact(data),
    {
      onSuccess: () => refetch()
    }
  );

  const handleBulkAction = (action: string) => {
    switch (action) {
      case 'assign':
        setShowAssignModal(true);
        break;
      case 'send-reminder':
        handleSendReminders(selectedItems);
        break;
      case 'export':
        handleExportSelected();
        break;
    }
  };

  const handleSendReminders = async (customerIds: string[]) => {
    try {
      await ledgerApi.sendBulkReminders({
        customer_ids: customerIds,
        template: 'payment_reminder_urgent'
      });
      refetch();
    } catch (error) {
      console.error('Failed to send reminders:', error);
    }
  };

  const handleExportSelected = async () => {
    try {
      const response = await ledgerApi.exportCollectionList({
        customer_ids: selectedItems.length > 0 ? selectedItems : undefined,
        format: 'excel'
      });
      
      const blob = new Blob([response.data], {
        type: 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `collection-list-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'green';
      case 'medium': return 'yellow';
      case 'high': return 'orange';
      case 'critical': return 'red';
      default: return 'gray';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'gray';
      case 'contacted': return 'blue';
      case 'promised': return 'yellow';
      case 'partial': return 'orange';
      case 'dispute': return 'red';
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
          checked={selectedItems.length === filteredCollections.length && filteredCollections.length > 0}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedItems(filteredCollections.map((item: CollectionItem) => item.customer_id));
            } else {
              setSelectedItems([]);
            }
          }}
        />
      ),
      render: (item: CollectionItem) => (
        <input
          type="checkbox"
          checked={selectedItems.includes(item.customer_id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedItems([...selectedItems, item.customer_id]);
            } else {
              setSelectedItems(selectedItems.filter(id => id !== item.customer_id));
            }
          }}
        />
      ),
      width: '50px'
    },
    {
      key: 'customer',
      label: 'Customer Details',
      render: (item: CollectionItem) => (
        <div>
          <button
            onClick={() => onCustomerClick?.(item)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {item.customer_name}
          </button>
          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {item.customer_phone}
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.customer_address}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'outstanding',
      label: 'Outstanding Details',
      render: (item: CollectionItem) => (
        <div className="text-right">
          <div className="font-semibold">
            {formatCurrency(item.total_outstanding)}
          </div>
          <div className="text-sm text-red-600">
            Overdue: {formatCurrency(item.overdue_amount)}
          </div>
          <div className="text-xs text-gray-500">
            {item.days_overdue} days overdue
          </div>
        </div>
      )
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (item: CollectionItem) => (
        <StatusBadge
          status={item.priority}
          color={getPriorityColor(item.priority)}
          label={item.priority.toUpperCase()}
        />
      )
    },
    {
      key: 'status',
      label: 'Collection Status',
      render: (item: CollectionItem) => (
        <div>
          <StatusBadge
            status={item.collection_status}
            color={getStatusColor(item.collection_status)}
            label={item.collection_status.toUpperCase()}
          />
          {item.promise_date && (
            <div className="text-xs text-gray-500 mt-1">
              Promise: {format(parseISO(item.promise_date), 'dd/MM')}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'contact',
      label: 'Last Contact',
      render: (item: CollectionItem) => (
        <div>
          {item.last_contact_date ? (
            <div>
              <div className="text-sm">
                {format(parseISO(item.last_contact_date), 'dd/MM/yyyy')}
              </div>
              <div className="text-xs text-gray-500">
                {item.contact_attempts} attempts
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400">No contact</span>
          )}
        </div>
      )
    },
    {
      key: 'assigned',
      label: 'Assigned To',
      render: (item: CollectionItem) => (
        <div>
          {item.assigned_to ? (
            <div className="flex items-center gap-1">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm">{item.assigned_to}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">Unassigned</span>
          )}
        </div>
      )
    },
    {
      key: 'followup',
      label: 'Next Follow-up',
      render: (item: CollectionItem) => {
        if (!item.next_follow_up) return '-';
        
        const daysUntil = differenceInDays(parseISO(item.next_follow_up), new Date());
        const isOverdue = daysUntil < 0;
        
        return (
          <div className={isOverdue ? 'text-red-600' : ''}>
            <div className="text-sm">
              {format(parseISO(item.next_follow_up), 'dd/MM/yyyy')}
            </div>
            <div className="text-xs">
              {isOverdue 
                ? `${Math.abs(daysUntil)} days overdue`
                : `In ${daysUntil} days`
              }
            </div>
          </div>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item: CollectionItem) => (
        <div className="flex gap-1">
          <button
            onClick={() => handleContact(item, 'call')}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
            title="Record Call"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleContact(item, 'email')}
            className="p-1 text-green-600 hover:bg-green-50 rounded"
            title="Send Email"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleContact(item, 'message')}
            className="p-1 text-purple-600 hover:bg-purple-50 rounded"
            title="Send SMS"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => onCustomerClick?.(item)}
            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
            title="View Details"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  const handleContact = (item: CollectionItem, type: string) => {
    // In a real implementation, this would open a modal or form
    console.log('Contact customer:', item.customer_name, 'via', type);
  };

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Collection Center</h1>
          <p className="text-gray-600">Manage payment collections and follow-ups</p>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-800">
                {formatCurrency(stats.total_outstanding)}
              </p>
              <p className="text-sm text-gray-500">{stats.customers_count} customers</p>
            </div>
            <DollarSign className="h-10 w-10 text-gray-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Collected Today</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.collections_today)}
              </p>
              <p className="text-sm text-gray-500">
                MTD: {formatCurrency(stats.collections_mtd)}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Promise Amount</p>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(stats.promise_amount)}
              </p>
              <p className="text-sm text-gray-500">Pending collection</p>
            </div>
            <Clock className="h-10 w-10 text-yellow-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Critical Accounts</p>
              <p className="text-2xl font-bold text-red-600">
                {stats.critical_accounts}
              </p>
              <p className="text-sm text-gray-500">
                Success: {stats.success_rate.toFixed(1)}%
              </p>
            </div>
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
        </div>
      </div>

      {/* Collection Agents Performance */}
      {agents && agents.length > 0 && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Agent Performance</h3>
          <div className="grid grid-cols-4 gap-4">
            {agents.map((agent: CollectionAgent) => (
              <div key={agent.id} className="border rounded-lg p-3">
                <div className="font-medium">{agent.name}</div>
                <div className="text-sm text-gray-500 space-y-1 mt-2">
                  <div>Active: {agent.active_cases} cases</div>
                  <div>Today: {formatCurrency(agent.collected_today)}</div>
                  <div>Success: {agent.success_rate}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'contacted', label: 'Contacted' },
                { value: 'promised', label: 'Promised' },
                { value: 'partial', label: 'Partial' },
                { value: 'dispute', label: 'Dispute' },
                { value: 'legal', label: 'Legal' }
              ]}
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <Select
              value={filters.priority}
              onChange={(value) => setFilters({ ...filters, priority: value })}
              options={[
                { value: 'all', label: 'All Priorities' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' }
              ]}
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days Overdue
            </label>
            <Select
              value={filters.daysOverdue}
              onChange={(value) => setFilters({ ...filters, daysOverdue: value })}
              options={[
                { value: 'all', label: 'All' },
                { value: '0-30', label: '0-30 days' },
                { value: '31-60', label: '31-60 days' },
                { value: '61-90', label: '61-90 days' },
                { value: 'over_90', label: 'Over 90 days' }
              ]}
            />
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
                placeholder="Search by name, phone or notes..."
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
              onClick={() => handleExportSelected()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Collection Table */}
      <div className="bg-white rounded-lg shadow">
        {selectedItems.length > 0 && (
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {selectedItems.length} customers selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkAction('assign')}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Assign Agent
              </button>
              <button
                onClick={() => handleBulkAction('send-reminder')}
                className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
              >
                Send Reminders
              </button>
            </div>
          </div>
        )}
        
        <DataTable
          columns={columns}
          data={filteredCollections}
          loading={isLoading}
          emptyMessage="No collection items found"
        />
      </div>
    </div>
  );
};

export default CollectionCenter;