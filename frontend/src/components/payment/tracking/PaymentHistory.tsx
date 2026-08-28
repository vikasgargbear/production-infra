import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, CreditCard, Eye, X } from 'lucide-react';
import { ModuleHeader, InlineFilterPanel, DataTable, Pagination, StatusBadge } from '../../global';
import { paymentsApi } from '../../../services/api';
import { toast } from 'react-toastify';
import type {
  CanonicalPaymentDetail,
  CanonicalPaymentDirection,
  CanonicalPaymentHistoryItem,
  CanonicalPaymentHistoryParams,
} from '../../../services/api/modules/finance/payments.api';
import { formatExactCurrency } from '../../../utils/exactDecimal';
import { useDialogFocus } from '../../../hooks/useDialogFocus';

interface PaymentHistoryProps {
  onClose?: () => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onClose }) => {
  const [payments, setPayments] = useState<CanonicalPaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<CanonicalPaymentHistoryParams>({});
  const [detail, setDetail] = useState<CanonicalPaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const closeDetailRef = useRef<HTMLButtonElement>(null);
  const detailDialogRef = useDialogFocus<HTMLElement>(Boolean(detail), closeDetailRef);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 25,
    total: 0,
    total_pages: 0
  });

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (detail) setDetail(null);
        else onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [detail, onClose]);

  // Fetch payments
  const fetchPayments = useCallback(async (
    page = 1,
    filters: CanonicalPaymentHistoryParams = activeFilters,
    pageSize = pagination.per_page,
  ) => {
    setLoading(true);
    try {
      const searchParams: CanonicalPaymentHistoryParams = {
        page,
        page_size: pageSize,
        ...filters
      };

      const response = await paymentsApi.getCanonicalHistory(searchParams);
      setPayments(response.data.items);
      setPagination((current) => ({
        ...current,
        page,
        per_page: response.data.page_size,
        total: response.data.total,
        total_pages: Math.ceil(response.data.total / response.data.page_size)
      }));
    } catch (error) {
      console.error('Failed to fetch payments:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, [activeFilters, pagination.per_page]);

  useEffect(() => {
    fetchPayments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchPayments(pagination.page);
  };

  const loadDetail = async (paymentId: string) => {
    setDetailLoading(true);
    try {
      const response = await paymentsApi.getCanonicalDetail(paymentId);
      setDetail(response.data);
    } catch (error) {
      console.error('Failed to fetch payment detail:', error);
      toast.error('Failed to load authoritative payment detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Payment #', 'Date', 'Party', 'Type', 'Amount', 'Mode', 'Status', 'Reference'],
      ...payments.map(payment => [payment.payment_number, payment.payment_date, payment.party_name,
        payment.direction, payment.amount, payment.payment_method, payment.status,
        payment.external_reference || ''])
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
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
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
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
        <div className="text-sm text-gray-600">{payment.payment_number}</div>
      ),
      width: '140px'
    },
    {
      key: 'party_name',
      header: 'Party',
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
        <div>
          <div className="font-medium text-gray-900">{payment.party_name}</div>
          <div className="text-xs text-gray-500">
            {payment.direction === 'received' ? 'Payment Received' : 'Payment Made'}
          </div>
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
        <div className="text-right">
          <div className={`font-semibold ${payment.direction === 'received' ? 'text-green-700' : 'text-red-700'}`}>
            {payment.direction === 'received' ? '+' : '-'}{formatExactCurrency(payment.amount, 'Payment amount')}
          </div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'payment_method',
      header: 'Mode',
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
        <div className="text-sm text-gray-700">{payment.payment_method.replace('_', ' ')}</div>
      ),
      width: '100px'
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: () => {
        return <StatusBadge status="success" label="Posted" />;
      },
      width: '100px'
    },
    {
      key: 'actions',
      header: 'Details',
      align: 'center' as const,
      render: (_: any, payment: CanonicalPaymentHistoryItem) => (
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          aria-label={`View payment ${payment.payment_number}`}
          onClick={() => loadDetail(payment.payment_id)}
          disabled={detailLoading}
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
      width: '80px'
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
              label: "Export Page",
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
                  key: 'direction',
                  label: 'Type',
                  type: 'select',
                  options: [
                    { value: 'all', label: 'All Types' },
                    { value: 'received', label: 'Customer Receipts' },
                    { value: 'made', label: 'Supplier Payments' }
                  ],
                },
                {
                  key: 'date_from',
                  label: 'From Date',
                  type: 'date'
                },
                {
                  key: 'date_to',
                  label: 'To Date',
                  type: 'date'
                }
              ]}
              searchQuery={searchQuery}
              searchPlaceholder="Search payment number, party, or reference..."
              onFilterChange={(filters: Record<string, string>) => {
                const next: CanonicalPaymentHistoryParams = 'search' in filters
                  ? { ...activeFilters, search: filters.search || undefined }
                  : {
                    direction: filters.direction && filters.direction !== 'all'
                      ? filters.direction as CanonicalPaymentDirection
                      : undefined,
                    date_from: filters.date_from || undefined,
                    date_to: filters.date_to || undefined,
                    search: searchQuery.trim() || undefined,
                  };
                setActiveFilters(next);
                fetchPayments(1, next);
              }}
              onSearchChange={(query) => {
                setSearchQuery(query);
                if (!query) {
                  const next = { ...activeFilters, search: undefined };
                  setActiveFilters(next);
                  fetchPayments(1, next);
                }
              }}
              showFilters
              onClearFilters={() => {
                setSearchQuery('');
                setActiveFilters({});
                fetchPayments(1, {});
              }}
            />

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-4">
              <DataTable
                columns={columns}
                data={payments}
                keyField="payment_id"
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
                    setPagination((current) => ({ ...current, per_page: perPage, page: 1 }));
                    fetchPayments(1, activeFilters, perPage);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" role="presentation">
          <section
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-detail-title"
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <header className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h2 id="payment-detail-title" className="text-lg font-semibold text-gray-900">
                  {detail.payment_number}
                </h2>
                <p className="text-sm text-gray-600">{detail.party_name} · {detail.direction === 'received' ? 'Customer receipt' : 'Supplier payment'}</p>
              </div>
              <button ref={closeDetailRef} type="button" onClick={() => setDetail(null)} aria-label="Close payment details" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-4">
                <div><div className="text-xs text-gray-500">Amount</div><div className="font-semibold">{formatExactCurrency(detail.amount)}</div></div>
                <div><div className="text-xs text-gray-500">Allocated</div><div className="font-semibold">{formatExactCurrency(detail.allocated_amount)}</div></div>
                <div><div className="text-xs text-gray-500">Journal</div><div className="font-medium">{detail.journal_number}</div></div>
                <div><div className="text-xs text-gray-500">Reference</div><div className="font-medium">{detail.external_reference || '—'}</div></div>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-gray-900">Allocations</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="p-3">Document</th><th className="p-3 text-right">Applied</th><th className="p-3 text-right">Residual</th></tr></thead>
                    <tbody>{detail.allocations.map((row) => <tr key={row.allocation_id} className="border-t border-gray-200"><td className="p-3">{row.source_document_number}</td><td className="p-3 text-right">{formatExactCurrency(row.amount)}</td><td className="p-3 text-right">{formatExactCurrency(row.residual_amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-gray-900">Balanced journal</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="p-3">Line</th><th className="p-3">Account</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th></tr></thead>
                    <tbody>{detail.journal_lines.map((row) => <tr key={row.journal_line_id} className="border-t border-gray-200"><td className="p-3">{row.line_number}</td><td className="p-3 font-mono text-xs">{row.account_id}</td><td className="p-3 text-right">{formatExactCurrency(row.debit)}</td><td className="p-3 text-right">{formatExactCurrency(row.credit)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
