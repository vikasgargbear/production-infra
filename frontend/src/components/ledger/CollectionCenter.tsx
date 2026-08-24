/**
 * CollectionCenter Component
 * Streamlined collection management with integrated communication tools
 * Using working sales/outstanding endpoint
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Mail,
  MessageSquare,
  AlertCircle,
  Clock,
  Target,
  Search,
  PhoneCall,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { ModuleHeader } from '../global';
import WhatsAppIcon from '../icons/WhatsAppIcon';

interface CollectionCenterProps {
  embedded?: boolean;
  onCustomerClick?: (customer: CollectionItem) => void;
  onClose?: () => void;
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
  collection_change?: number;
}

const CollectionCenter: React.FC<CollectionCenterProps> = ({
  embedded = false,
  onCustomerClick,
  onClose
}) => {
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assignedTo: 'all',
    daysOverdue: 'all',
    searchQuery: ''
  });

  // Fetch collection data using the collection aging-data endpoint
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['collection-center', filters],
    queryFn: async () => {
      try {
        // Use the collection aging-data endpoint - single efficient API call
        const response = await apiClient.get('/collection-center/collection/aging-data');

        const agingData = response.data || {};
        const parties = agingData.parties || [];
        const summary = agingData.summary || {};

        // Transform parties data to collection items
        const collections: CollectionItem[] = parties.map((party: any) => {
          // Determine priority based on risk score
          let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
          let collectionStatus: CollectionItem['collection_status'] = 'pending';

          if (party.riskScore > 80 || party.daysOverdue > 90) {
            priority = 'critical';
            collectionStatus = 'dispute';
          } else if (party.riskScore > 60 || party.daysOverdue > 60) {
            priority = 'high';
            collectionStatus = 'promised';
          } else if (party.riskScore > 40 || party.daysOverdue > 30) {
            priority = 'medium';
            collectionStatus = 'contacted';
          } else if (party.daysOverdue > 0) {
            priority = 'low';
            collectionStatus = 'pending';
          }

          return {
            customer_id: String(party.id),
            customer_name: party.name || 'Unknown',
            customer_phone: party.phone || '',
            customer_email: party.email || '',
            customer_address: party.location || '',
            total_outstanding: party.outstandingAmount || 0,
            overdue_amount: party.overdueAmount || 0,
            days_overdue: party.daysOverdue || 0,
            oldest_invoice_date: party.oldestInvoiceDate || '',
            last_payment_date: party.lastPayment,
            last_contact_date: party.lastFollowUp,
            contact_attempts: 0,
            collection_status: collectionStatus,
            priority: priority,
            assigned_to: party.assignedAgent,
            next_follow_up: party.lastFollowUp,
            promise_date: party.promiseDate,
            promise_amount: 0,
            notes: undefined,
            payment_behavior: party.paymentHistory === 'Good' ? 'regular' : party.paymentHistory === 'Average' ? 'delayed' : 'defaulter'
          } as CollectionItem;
        });

        // Apply filters
        let filteredData = [...collections];

        if (filters.status !== 'all') {
          if (filters.status === 'overdue') {
            filteredData = filteredData.filter(c => c.days_overdue > 0);
          } else {
            filteredData = filteredData.filter(c => c.collection_status === filters.status);
          }
        }

        if (filters.priority !== 'all') {
          filteredData = filteredData.filter(c => c.priority === filters.priority);
        }

        // Calculate stats from summary
        const criticalCount = collections.filter(c => c.priority === 'critical').length;

        return {
          collections: filteredData,
          stats: {
            total_outstanding: summary.totalOutstanding || 0,
            total_overdue: summary.overdueAmount || 0,
            collections_today: summary.currentDayCollections || 0,
            collections_mtd: summary.currentMonthCollections || 0,
            promise_amount: 0,
            customers_count: collections.length,
            critical_accounts: criticalCount,
            success_rate: summary.collectionEfficiency || 0,
            collection_change: 0
          }
        };
      } catch (error) {
        console.error('Collection Center API error:', error);
        throw error;
      }
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const collections = useMemo(() => data?.collections || [], [data?.collections]);
  const stats: CollectionStats = data?.stats || {
    total_outstanding: 0,
    total_overdue: 0,
    collections_today: 0,
    collections_mtd: 0,
    promise_amount: 0,
    customers_count: 0,
    critical_accounts: 0,
    success_rate: 0,
    collection_change: 0
  };

  // Filter collections
  const filteredCollections = useMemo(() => {
    let filtered = [...collections];

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((item: CollectionItem) =>
        item.customer_name.toLowerCase().includes(query) ||
        item.customer_phone.includes(query) ||
        item.customer_email?.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [collections, filters.searchQuery]);

  // Quick action handlers
  const sendWhatsApp = (customer: CollectionItem) => {
    if (!customer.customer_phone) return;
    const message = encodeURIComponent(
      `Dear ${customer.customer_name},\n\nYour outstanding amount is ₹${customer.total_outstanding.toLocaleString('en-IN')}. Please make the payment at your earliest convenience.\n\nThank you!`
    );
    // Remove any non-numeric characters from phone number
    let cleanPhone = customer.customer_phone.replace(/\D/g, '');

    // Add +91 if not already present (for Indian numbers)
    if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const sendEmail = (customer: CollectionItem) => {
    if (!customer.customer_email) return;
    const subject = encodeURIComponent('Payment Reminder');
    const body = encodeURIComponent(
      `Dear ${customer.customer_name},\n\nThis is a friendly reminder about your outstanding payment of ₹${customer.total_outstanding.toLocaleString('en-IN')}.\n\nPlease process the payment at your earliest convenience.\n\nThank you for your business!`
    );
    window.location.href = `mailto:${customer.customer_email}?subject=${subject}&body=${body}`;
  };

  const makeCall = (customer: CollectionItem) => {
    if (!customer.customer_phone) return;
    window.location.href = `tel:${customer.customer_phone}`;
  };

  const sendSMS = (customer: CollectionItem) => {
    if (!customer.customer_phone) return;
    const message = encodeURIComponent(
      `Payment reminder: ₹${customer.total_outstanding.toLocaleString('en-IN')} outstanding. Please pay at your earliest convenience.`
    );
    window.location.href = `sms:${customer.customer_phone}?body=${message}`;
  };

  const handleExport = async () => {
    try {
      // Export as CSV
      const csvContent = 'Customer,Phone,Email,Outstanding,Overdue,Days Overdue,Priority,Status\n' +
        filteredCollections.map((c: CollectionItem) =>
          `"${c.customer_name}",${c.customer_phone},${c.customer_email},${c.total_outstanding},${c.overdue_amount},${c.days_overdue},${c.priority},${c.collection_status}`
        ).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `collection-list-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[priority as keyof typeof colors]}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-700',
      contacted: 'bg-blue-100 text-blue-700',
      promised: 'bg-purple-100 text-purple-700',
      partial: 'bg-orange-100 text-orange-700',
      dispute: 'bg-red-100 text-red-700',
      legal: 'bg-red-100 text-red-700'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
        <div className="mx-auto mt-8 max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="mt-3 text-sm text-gray-600">Loading authoritative collection balances...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
        <div role="alert" className="mx-auto mt-8 max-w-xl rounded-lg border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <h2 className="text-base font-semibold text-gray-900">Collection data is unavailable</h2>
          <p className="mt-1 text-sm text-gray-600">No balances are shown because the server request failed.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
      {!embedded && (
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Collection Center"
            documentNumber=""
            status=""
            icon={Target}
            iconColor="text-blue-600"
            onClose={onClose}
            additionalActions={[
              {
                label: "Export",
                onClick: handleExport,
                variant: "default"
              },
              {
                label: "Refresh",
                onClick: () => refetch(),
                variant: "primary"
              }
            ] as any}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Total Outstanding</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ₹{(stats.total_outstanding || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {stats.customers_count} Customers
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Collections Today</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ₹{(stats.collections_today || 0).toLocaleString('en-IN')}
                  </span>
                  {stats.collection_change && (
                    <span className={`mt-1 block text-xs ${stats.collection_change > 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {stats.collection_change > 0 ? '↑' : '↓'} {Math.abs(stats.collection_change || 0)}%
                    </span>
                  )}
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">MTD Collections</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ₹{(stats.collections_mtd || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-gray-500 block mt-1">
                    This Month
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Critical Accounts</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {stats.critical_accounts || 0}
                  </span>
                  <span className="mt-1 block text-xs text-amber-700">
                    High Priority
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Collection Efficiency</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {Math.round(stats.success_rate || 0)}%
                  </span>
                  <span className="text-xs text-gray-500 block mt-1">
                    Success Rate
                  </span>
                </div>
              </div>

              {/* Smart Filters and Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
                    {/* Quick Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button"
                        onClick={() => setFilters({ ...filters, status: filters.status === 'overdue' ? 'all' : 'overdue' })}
                        className={`min-h-11 px-3 py-2 rounded-md text-sm font-medium transition-colors ${filters.status === 'overdue'
                          ? 'bg-red-100 text-red-700 border border-red-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        Overdue
                      </button>
                      <button type="button"
                        onClick={() => setFilters({ ...filters, priority: filters.priority === 'critical' ? 'all' : 'critical' })}
                        className={`min-h-11 px-3 py-2 rounded-md text-sm font-medium transition-colors ${filters.priority === 'critical'
                          ? 'bg-orange-100 text-orange-700 border border-orange-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        <Zap className="w-4 h-4 inline mr-1" />
                        Critical
                      </button>
                      <button type="button"
                        onClick={() => setFilters({ ...filters, status: filters.status === 'promised' ? 'all' : 'promised' })}
                        className={`min-h-11 px-3 py-2 rounded-md text-sm font-medium transition-colors ${filters.status === 'promised'
                          ? 'bg-purple-100 text-purple-700 border border-purple-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        <Clock className="w-4 h-4 inline mr-1" />
                        Promised
                      </button>
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customer, invoice..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={filters.searchQuery || ''}
                        onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Collections List with Communication Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age & Priority</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Contact</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredCollections.map((item: CollectionItem) => {
                        const daysOverdue = item.days_overdue || 0;
                        const isOverdue = daysOverdue > 0;

                        return (
                          <tr key={item.customer_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div
                                className={onCustomerClick ? 'cursor-pointer' : ''}
                                onClick={() => onCustomerClick?.(item)}
                              >
                                <div className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">{item.customer_name}</div>
                                <div className="text-xs text-gray-500">
                                  {item.customer_phone || 'No phone'} • {item.customer_email || 'No email'}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-semibold text-gray-900">
                                ₹{item.total_outstanding?.toLocaleString('en-IN')}
                              </div>
                              {item.overdue_amount > 0 && (
                                <div className="text-xs text-red-600">
                                  Overdue: ₹{item.overdue_amount?.toLocaleString('en-IN')}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-600'
                                }`}>
                                {isOverdue ? `${daysOverdue} days overdue` : 'Current'}
                              </div>
                              <div className="mt-1">
                                {getPriorityBadge(item.priority)}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-600">
                                {item.last_contact_date ?
                                  format(parseISO(item.last_contact_date), 'dd MMM, HH:mm') :
                                  'Never'
                                }
                              </div>
                              {item.contact_attempts > 0 && (
                                <div className="text-xs text-gray-500">
                                  {item.contact_attempts} attempts
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {getStatusBadge(item.collection_status)}
                              {item.promise_date && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Promise: {format(parseISO(item.promise_date), 'dd MMM')}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center space-x-1">
                                {/* WhatsApp */}
                                <button
                                  type="button"
                                  onClick={() => sendWhatsApp(item)}
                                  disabled={!item.customer_phone}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                  title={item.customer_phone ? 'Send WhatsApp' : 'Customer phone unavailable'}
                                  aria-label={`WhatsApp ${item.customer_name}`}
                                >
                                  <WhatsAppIcon className="w-4 h-4" />
                                </button>

                                {/* Email */}
                                <button
                                  type="button"
                                  onClick={() => sendEmail(item)}
                                  disabled={!item.customer_email}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                  title={item.customer_email ? 'Send email' : 'Customer email unavailable'}
                                  aria-label={`Email ${item.customer_name}`}
                                >
                                  <Mail className="w-4 h-4" />
                                </button>

                                {/* Call */}
                                <button
                                  type="button"
                                  onClick={() => makeCall(item)}
                                  disabled={!item.customer_phone}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                  title={item.customer_phone ? 'Call customer' : 'Customer phone unavailable'}
                                  aria-label={`Call ${item.customer_name}`}
                                >
                                  <PhoneCall className="w-4 h-4" />
                                </button>

                                {/* SMS */}
                                <button
                                  type="button"
                                  onClick={() => sendSMS(item)}
                                  disabled={!item.customer_phone}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                  title={item.customer_phone ? 'Send SMS' : 'Customer phone unavailable'}
                                  aria-label={`Send SMS to ${item.customer_name}`}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>

                                {/* View Details */}
                                <button
                                  type="button"
                                  onClick={() => onCustomerClick?.(item)}
                                  disabled={!onCustomerClick}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                  title="View Details"
                                  aria-label={`View ${item.customer_name} details`}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(!filteredCollections || filteredCollections.length === 0) && !isLoading && (
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No collections to display</p>
                      <p className="text-sm text-gray-400 mt-1">Adjust your filters or search to see results</p>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CollectionCenter;
