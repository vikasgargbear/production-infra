import React, { useState, useEffect, useCallback } from 'react';
import { History, Search, Filter, Download, X, RefreshCw, CreditCard, MessageCircle, Mail } from 'lucide-react';
import { ModuleHeader, InlineFilterPanel, DataTable, Pagination, StatusBadge } from '../../global';
import { paymentsApi } from '../../../services/api';
import { useCompany } from '../../../contexts/CompanyContext';
import { toast } from 'react-toastify';

interface PaymentHistoryProps {
  onClose?: () => void;
}

interface Payment {
  id: string;
  payment_id: string;
  payment_date: string;
  party_name: string;
  payment_type: 'received' | 'made';
  amount: number;
  payment_mode: string;
  payment_status: string;
  reference_no?: string;
  notes?: string;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onClose }) => {
  const { companyInfo } = useCompany();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 25,
    total: 0,
    total_pages: 0
  });

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch payments
  const fetchPayments = useCallback(async (page = 1, filters: any = {}) => {
    setLoading(true);
    try {
      const searchParams: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        ...filters
      };

      const response = await paymentsApi.getAll(searchParams);
      const paymentsData = response.data?.payments || response.data || [];

      const transformedPayments: Payment[] = paymentsData.map((p: any) => ({
        id: p.payment_id || p.id,
        payment_id: p.payment_id || p.payment_number || `PAY-${p.id}`,
        payment_date: p.payment_date || p.transaction_date,
        party_name: p.party_name || p.customer_name || p.supplier_name || 'Unknown',
        payment_type: p.payment_type || 'received',
        amount: p.amount || p.total_amount || 0,
        payment_mode: p.payment_mode || p.method || 'Cash',
        payment_status: p.payment_status || p.status || 'completed',
        reference_no: p.reference_no || p.transaction_id,
        notes: p.notes || p.description
      }));

      setPayments(transformedPayments);

      const total = response.data?.total || 0;
      setPagination({
        ...pagination,
        page,
        total,
        total_pages: Math.ceil(total / pagination.per_page)
      });
    } catch (error) {
      console.error('Failed to fetch payments:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, [pagination.per_page]);

  useEffect(() => {
    fetchPayments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchPayments(pagination.page);
  };

  const handleExport = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Payment #', 'Date', 'Party', 'Type', 'Amount', 'Mode', 'Status', 'Reference'],
      ...payments.map(payment => [payment.payment_id, payment.payment_date, payment.party_name,
        payment.payment_type, payment.amount, payment.payment_mode, payment.payment_status,
        payment.reference_no || ''])
    ];
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: 'payment_date',
      header: 'Date',
      render: (_: any, payment: Payment) => (
        <div className="text-gray-700">
          {new Date(payment.payment_date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      ),
      width: '110px'
    },
    {
      key: 'payment_id',
      header: 'Payment #',
      render: (_: any, payment: Payment) => (
        <div className="text-sm text-gray-600">{payment.payment_id}</div>
      ),
      width: '140px'
    },
    {
      key: 'party_name',
      header: 'Party',
      render: (_: any, payment: Payment) => (
        <div>
          <div className="font-medium text-gray-900">{payment.party_name}</div>
          <div className="text-xs text-gray-500">
            {payment.payment_type === 'received' ? 'Payment Received' : 'Payment Made'}
          </div>
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, payment: Payment) => (
        <div className="text-right">
          <div className={`font-semibold ${payment.payment_type === 'received' ? 'text-green-600' : 'text-red-600'}`}>
            {payment.payment_type === 'received' ? '+' : '-'}₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'payment_mode',
      header: 'Mode',
      render: (_: any, payment: Payment) => (
        <div className="text-sm text-gray-700">{payment.payment_mode}</div>
      ),
      width: '100px'
    },
    {
      key: 'payment_status',
      header: 'Status',
      align: 'center' as const,
      render: (_: any, payment: Payment) => {
        const statusMap: Record<string, any> = {
          completed: { status: 'success', label: 'Completed' },
          pending: { status: 'warning', label: 'Pending' },
          failed: { status: 'error', label: 'Failed' },
          cancelled: { status: 'error', label: 'Cancelled' }
        };
        const config = statusMap[payment.payment_status] || { status: 'default', label: payment.payment_status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '100px'
    }
  ];

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Payment History"
          documentNumber=""
          status="active"
          icon={CreditCard}
          iconColor="text-blue-600"
          onClose={onClose}
          showSaveDraft={false}
          onSaveDraft={() => { }}
          additionalActions={[
            {
              label: "",
              onClick: handleRefresh,
              variant: "ghost",
              icon: RefreshCw,
              disabled: loading,
              title: "Refresh",
              className: loading ? "animate-spin" : ""
            },
            {
              label: "Export All",
              onClick: handleExport,
              variant: "outline",
              className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }
          ] as any}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">

            {/* Filters */}
            <InlineFilterPanel
              filters={[
                {
                  key: 'date_preset',
                  label: 'Period',
                  type: 'select',
                  options: [
                    { value: 'all', label: 'All Time' },
                    { value: 'today', label: 'Today' },
                    { value: 'yesterday', label: 'Yesterday' },
                    { value: 'last7days', label: 'Last 7 Days' },
                    { value: 'last30days', label: 'Last 30 Days' },
                    { value: 'thisMonth', label: 'This Month' },
                    { value: 'lastMonth', label: 'Last Month' },
                    { value: 'thisQuarter', label: 'This Quarter' }
                  ],
                },
                {
                  key: 'payment_type',
                  label: 'Type',
                  type: 'select',
                  options: [
                    { value: 'all', label: 'All Types' },
                    { value: 'received', label: 'Payment Received' },
                    { value: 'made', label: 'Payment Made' }
                  ],
                },
                {
                  key: 'payment_status',
                  label: 'Status',
                  type: 'select',
                  options: [
                    { value: 'all', label: 'All Status' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'failed', label: 'Failed' },
                    { value: 'cancelled', label: 'Cancelled' }
                  ],
                },
                {
                  key: 'dateFrom',
                  label: 'From Date',
                  type: 'date'
                },
                {
                  key: 'dateTo',
                  label: 'To Date',
                  type: 'date'
                }
              ]}
              onFilterChange={(filters) => {
                console.log('Filters changed:', filters);
                // TODO: Implement filter logic
              }}
              onSearchChange={setSearchQuery}
            />

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-4">
              <DataTable
                columns={columns}
                data={payments}
                keyField="id"
                loading={loading}
                emptyMessage="No payments found"
              />
            </div>

            {/* Pagination */}
            {!loading && pagination.total > 0 && (
              <div className="mt-6">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.total_pages}
                  onPageChange={(page) => fetchPayments(page)}
                  itemsPerPage={pagination.per_page}
                  totalItems={pagination.total}
                  onItemsPerPageChange={(perPage) => {
                    setPagination({ ...pagination, per_page: perPage, page: 1 });
                    fetchPayments(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistory;
