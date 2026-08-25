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
  Target,
  Search,
  PhoneCall,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { parseISO, format } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { ModuleHeader } from '../global';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { compareExactDecimals, formatExactCurrency } from '../../utils/exactDecimal';
import {
  CollectionItem,
  CollectionStats,
  projectCollectionAging,
} from './collectionProjection';

interface CollectionCenterProps {
  embedded?: boolean;
  onCustomerClick?: (customer: CollectionItem) => void;
  onClose?: () => void;
}

const positiveMoney = (value: string, label: string) => compareExactDecimals(value, '0.00', label, {
  scale: 2, maximumWholeDigits: 20, allowNegative: false,
}) > 0;

const CollectionCenter: React.FC<CollectionCenterProps> = ({
  embedded = false,
  onCustomerClick,
  onClose
}) => {
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    searchQuery: ''
  });

  // Fetch collection data using the collection aging-data endpoint
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['collection-center', 'canonical-aging'],
    queryFn: async () => {
      try {
        // Use the collection aging-data endpoint - single efficient API call
        const response = await apiClient.get('/collection-center/collection/aging-data');

        const projected = projectCollectionAging(response.data);
        const collections = projected.collections;

        return {
          collections,
          stats: projected.stats,
        };
      } catch (error) {
        console.error('Collection Center API error:', error);
        throw error;
      }
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const collections = useMemo(() => data?.collections ?? [], [data?.collections]);
  const stats: CollectionStats | null = data?.stats ?? null;

  // Filter collections
  const filteredCollections = useMemo(() => {
    let filtered = [...collections];

    if (filters.status !== 'all') {
      filtered = filtered.filter(item => item.collection_status === filters.status);
    }

    if (filters.priority !== 'all') {
      filtered = filtered.filter(item => item.priority === filters.priority);
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((item: CollectionItem) =>
        item.customer_name.toLowerCase().includes(query) ||
        item.customer_phone?.includes(query) ||
        item.customer_email?.toLowerCase().includes(query) ||
        item.customer_address?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [collections, filters.priority, filters.searchQuery, filters.status]);

  // Quick action handlers
  const sendWhatsApp = (customer: CollectionItem) => {
    if (!customer.customer_phone) return;
    const message = encodeURIComponent(
      `Dear ${customer.customer_name},\n\nYour outstanding amount is ${formatExactCurrency(customer.total_outstanding, 'Collection outstanding')}. Please make the payment at your earliest convenience.\n\nThank you!`
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
      `Dear ${customer.customer_name},\n\nThis is a friendly reminder about your outstanding payment of ${formatExactCurrency(customer.total_outstanding, 'Collection outstanding')}.\n\nPlease process the payment at your earliest convenience.\n\nThank you for your business!`
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
      `Payment reminder: ${formatExactCurrency(customer.total_outstanding, 'Collection outstanding')} outstanding. Please pay at your earliest convenience.`
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
      link.download = 'collection-list.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      current: 'bg-green-100 text-green-700',
      '1-30': 'bg-yellow-100 text-yellow-700',
      '31-60': 'bg-orange-100 text-orange-700',
      '61-90': 'bg-red-100 text-red-700',
      '90+': 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[priority as keyof typeof colors]}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      current: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700'
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

  if (!stats) {
    return (
      <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
        <div role="alert" className="mx-auto mt-8 max-w-xl rounded-lg border border-red-200 bg-white p-6 text-center">
          Collection data is unavailable because the canonical response was empty.
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
                    {formatExactCurrency(stats.total_outstanding, 'Collection total outstanding')}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {stats.customers_count} Customers
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Collections Today</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {formatExactCurrency(stats.collections_today, 'Collections today')}
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">MTD Collections</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {formatExactCurrency(stats.collections_mtd, 'Collections month to date')}
                  </span>
                  <span className="text-xs text-gray-500 block mt-1">
                    This Month
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">90+ Day Accounts</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {stats.critical_accounts}
                  </span>
                  <span className="mt-1 block text-xs text-amber-700">
                    By invoice due date
                  </span>
                </div>
                <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <span className="mb-1 block text-xs text-gray-500">Collection Efficiency</span>
                  <span className="text-lg font-semibold text-gray-900">
                    Unavailable
                  </span>
                  <span className="text-xs text-gray-500 block mt-1">
                    No authoritative target configured
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
                        onClick={() => setFilters({ ...filters, priority: filters.priority === '90+' ? 'all' : '90+' })}
                        className={`min-h-11 px-3 py-2 rounded-md text-sm font-medium transition-colors ${filters.priority === '90+'
                          ? 'bg-orange-100 text-orange-700 border border-orange-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        <Zap className="w-4 h-4 inline mr-1" />
                        90+ Days
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredCollections.map((item: CollectionItem) => {
                        const daysOverdue = item.days_overdue;
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
                                {formatExactCurrency(item.total_outstanding, 'Collection outstanding')}
                              </div>
                              {positiveMoney(item.overdue_amount, 'Collection overdue') && (
                                <div className="text-xs text-red-600">
                                  Overdue: {formatExactCurrency(item.overdue_amount, 'Collection overdue')}
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
                                {item.last_payment_date ?
                                  format(parseISO(item.last_payment_date), 'dd MMM yyyy') :
                                  'No posted allocation'
                                }
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {getStatusBadge(item.collection_status)}
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
