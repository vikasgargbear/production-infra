/**
 * PartyLedger Component - Improved Version
 * Streamlined party ledger with integrated filters and better print/export
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from 'react-query';
import {
  Calendar,
  Download,
  Filter,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  CreditCard,
  AlertCircle,
  PieChart,
  BarChart3,
  CheckCircle,
  XCircle,
  Mail,
  MessageSquare,
  Eye,
  Edit,
  Trash2,
  Loader2,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  User,
  Building
} from 'lucide-react';
import { format, parseISO, subMonths, subDays, differenceInDays, isWithinInterval } from 'date-fns';
import { partyLedgerApi } from '../../services/api';
import { CustomerSearch, SupplierSearch, DatePicker, Select, DataTable, StatusBadge, ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';
import WhatsAppIcon from '../icons/WhatsAppIcon';

interface PartyLedgerProps {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onTransactionClick?: (transaction: LedgerEntry) => void;
  onClose?: () => void;
}

interface LedgerEntry {
  id?: string;
  ledger_id?: number | string;
  date: string;
  transaction_type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'opening_balance' | 'adjustment' | 'Invoice' | 'Payment';
  reference_number?: string;
  reference?: string;
  reference_type?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  running_balance?: number;
  status?: string;
  due_date?: string;
  is_reconciled?: boolean;
  reconciliation_date?: string;
  tags?: string[];
  attachments?: { id: string; name: string; url: string }[];
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

const PartyLedger: React.FC<PartyLedgerProps> = ({
  partyType = 'customer',
  partyId: initialPartyId,
  embedded = false,
  onTransactionClick,
  onClose
}) => {
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: subMonths(new Date(), 3),
    to: new Date()
  });
  const [quickDateRange, setQuickDateRange] = useState('last3months');
  const [filterType, setFilterType] = useState('all');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch organization details for branding
  useEffect(() => {
    const fetchOrgDetails = async () => {
      try {
        const orgData = JSON.parse(localStorage.getItem('pharma_org_details') || '{}');
        if (!orgData.organization_name) {
          // Set default branding
          orgData.organization_name = 'Pharma Enterprise';
          orgData.tagline = 'Your Trusted Healthcare Partner';
        }
        setOrgDetails(orgData);
      } catch (error) {
        console.error('Failed to fetch org details:', error);
        setOrgDetails({
          organization_name: 'Pharma Enterprise',
          tagline: 'Your Trusted Healthcare Partner'
        });
      }
    };
    fetchOrgDetails();
  }, []);

  // Quick date range handler
  const handleQuickDateRange = (range: string) => {
    setQuickDateRange(range);
    const today = new Date();

    switch (range) {
      case 'today':
        setDateRange({ from: today, to: today });
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setDateRange({ from: yesterday, to: yesterday });
        break;
      case 'last7days':
        setDateRange({ from: subDays(today, 7), to: today });
        break;
      case 'last30days':
        setDateRange({ from: subDays(today, 30), to: today });
        break;
      case 'last3months':
        setDateRange({ from: subMonths(today, 3), to: today });
        break;
      case 'last6months':
        setDateRange({ from: subMonths(today, 6), to: today });
        break;
      case 'lastyear':
        setDateRange({ from: subMonths(today, 12), to: today });
        break;
      case 'all':
        setDateRange({ from: new Date('2020-01-01'), to: today });
        break;
    }
  };

  // Get party ID from selectedParty object
  const partyId = initialPartyId || selectedParty?.customer_id || selectedParty?.supplier_id || selectedParty?.id;

  // Fetch party details
  const { data: partyDetails, isLoading: loadingParty, error: partyError } = useQuery(
    ['party-details', partyId, partyType],
    () => partyLedgerApi.getBalance(partyId, partyType),
    {
      enabled: !!partyId,
      retry: 1,
      onError: (error: any) => {
        console.error('Failed to fetch party details:', error);
      }
    }
  );

  // Fetch ledger entries
  const { data: ledgerData, isLoading: loadingLedger, error: ledgerError, refetch } = useQuery(
    ['party-ledger', partyId, partyType, dateRange],
    async () => {
      const response = await partyLedgerApi.getStatement(
        partyId,
        partyType,
        {
          date_from: format(dateRange.from, 'yyyy-MM-dd'),
          date_to: format(dateRange.to, 'yyyy-MM-dd')
        }
      );
      return response;
    },
    {
      enabled: !!partyId,
      retry: 1
    }
  );

  const filteredEntries = useMemo(() => {
    // Handle both API response formats
    const entries = ledgerData?.data?.statement || ledgerData?.data || (ledgerData as any)?.statement || [];

    if (!Array.isArray(entries)) return [];

    let filtered = [...entries];

    // Apply date filter (client-side as fallback if backend doesn't filter)
    filtered = filtered.filter(entry => {
      if (!entry.date) return false;

      try {
        const entryDate = typeof entry.date === 'string' ? parseISO(entry.date) : new Date(entry.date);
        const fromDate = new Date(dateRange.from);
        const toDate = new Date(dateRange.to);

        // Set time to start and end of day for proper comparison
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);

        return entryDate >= fromDate && entryDate <= toDate;
      } catch (error) {
        console.error('Error parsing date:', entry.date, error);
        return false;
      }
    });

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(entry => entry.transaction_type === filterType);
    }

    return filtered;
  }, [ledgerData, filterType, dateRange]);

  // Paginated entries
  const ledgerEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEntries.slice(startIndex, endIndex);
  }, [filteredEntries, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, dateRange, partyId]);

  // Debug: Log date range changes
  useEffect(() => {
    console.log('Date range changed:', {
      from: format(dateRange.from, 'yyyy-MM-dd'),
      to: format(dateRange.to, 'yyyy-MM-dd'),
      quickRange: quickDateRange
    });
  }, [dateRange, quickDateRange]);

  const errorMessage = (partyError as any)?.message || (ledgerError as any)?.message;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    const partyName = selectedParty?.customer_name || selectedParty?.supplier_name || selectedParty?.name || 'Party';

    // Generate table HTML
    const tableHTML = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">Date</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">Type</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">Reference</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">Description</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: right;">Debit</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: right;">Credit</th>
            <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${ledgerEntries.map(entry => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${entry.date || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${entry.transaction_type || entry.type || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${entry.reference_number || entry.reference || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${entry.description || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #dc2626;">
                ${entry.debit ? `₹${entry.debit.toFixed(2)}` : '-'}
              </td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #16a34a;">
                ${entry.credit ? `₹${entry.credit.toFixed(2)}` : '-'}
              </td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">
                ₹${(entry.running_balance || entry.balance || 0).toFixed(2)}
              </td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Total</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">
              ₹${ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0).toFixed(2)}
            </td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: #16a34a;">
              ₹${ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0).toFixed(2)}
            </td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">
              ${ledgerEntries.length > 0 ? `₹${Math.abs(ledgerEntries[ledgerEntries.length - 1]?.balance || 0).toFixed(2)}` : '₹0.00'}
            </td>
          </tr>
        </tfoot>
      </table>
    `;

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ledger - ${partyName}</title>
          <style>
            @page { margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              color: #333;
              line-height: 1.6;
            }
            .header {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
              padding-bottom: 15px;
              border-bottom: 3px solid #1e40af;
            }
            .company-info {
              flex: 1;
            }
            .company-name {
              font-size: 24px;
              font-weight: bold;
              color: #1e40af;
              margin-bottom: 5px;
            }
            .company-tagline {
              font-size: 12px;
              color: #666;
              font-style: italic;
            }
            .company-details {
              margin-top: 10px;
              font-size: 11px;
              color: #666;
            }
            .doc-title {
              text-align: right;
            }
            .doc-title h1 {
              font-size: 18px;
              color: #333;
            }
            .doc-date {
              font-size: 11px;
              color: #666;
              margin-top: 5px;
            }
            .party-info {
              background: #f8f9fa;
              padding: 12px;
              border-radius: 5px;
              margin-bottom: 20px;
            }
            .party-name {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .period {
              font-size: 11px;
              color: #666;
            }
            table {
              width: 100%;
              font-size: 11px;
              margin-top: 15px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              color: #666;
            }
            .summary {
              font-size: 11px;
            }
            .watermark {
              text-align: right;
              color: #1e40af;
              font-weight: bold;
              font-size: 10px;
            }
            @media print {
              .header { break-after: avoid; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <div class="company-name">${orgDetails?.organization_name || 'Pharma Enterprise'}</div>
              <div class="company-tagline">${orgDetails?.tagline || 'Your Trusted Healthcare Partner'}</div>
              <div class="company-details">
                ${orgDetails?.address ? `${orgDetails.address}<br>` : ''}
                ${orgDetails?.phone ? `Phone: ${orgDetails.phone} | ` : ''}
                ${orgDetails?.email ? `Email: ${orgDetails.email}<br>` : ''}
                ${orgDetails?.gst_number ? `GSTIN: ${orgDetails.gst_number}` : ''}
              </div>
            </div>
            <div class="doc-title">
              <h1>LEDGER STATEMENT</h1>
              <div class="doc-date">Date: ${format(new Date(), 'dd MMM yyyy')}</div>
            </div>
          </div>

          <div class="party-info">
            <div class="party-name">Party: ${partyName}</div>
            <div class="period">Statement Period: ${format(dateRange.from, 'dd MMM yyyy')} to ${format(dateRange.to, 'dd MMM yyyy')}</div>
            ${selectedParty?.phone ? `<div style="margin-top: 5px; font-size: 11px;">Contact: ${selectedParty.phone} ${selectedParty.email ? `| ${selectedParty.email}` : ''}</div>` : ''}
          </div>

          ${tableHTML}

          <div class="footer">
            <div class="summary">
              <strong>Summary:</strong><br>
              Total Transactions: ${ledgerEntries.length}<br>
              Closing Balance: ₹${ledgerEntries.length > 0 ? Math.abs(ledgerEntries[ledgerEntries.length - 1]?.balance || 0).toFixed(2) : '0.00'}
              ${ledgerEntries.length > 0 && ledgerEntries[ledgerEntries.length - 1]?.balance < 0 ? ' (Dr)' : ' (Cr)'}
            </div>
            <div class="watermark">
              This is a computer-generated document<br>
              Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}<br>
              <span style="margin-top: 5px; display: block;">Powered by Pharma ERP</span>
            </div>
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // Wait for content to render then print
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 100);
      }, 250);
    };
  };

  const handleExport = async (exportFormat: 'pdf' | 'excel') => {
    if (!selectedParty && !initialPartyId) {
      alert('Please select a party first');
      return;
    }

    if (exportFormat === 'excel') {
      // Generate CSV
      const csvContent = [
        ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
        ...ledgerEntries.map(entry => [
          entry.date,
          entry.transaction_type || entry.type || '',
          entry.reference_number || entry.reference || '',
          entry.description || '',
          entry.debit || 0,
          entry.credit || 0,
          entry.running_balance || entry.balance || 0
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const partyName = selectedParty?.customer_name || selectedParty?.supplier_name || selectedParty?.name || 'export';
      downloadFile(blob, `ledger-${partyName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.csv`);
    } else {
      // For PDF, use print
      handlePrint();
    }
  };

  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (value: any, entry: any) => {
        if (!entry || !entry.date) return '-';
        try {
          return format(parseISO(entry.date), 'dd MMM yyyy');
        } catch (e) {
          return entry.date || '-';
        }
      }
    },
    {
      key: 'type',
      header: 'Type',
      render: (value: any, entry: any) => {
        const type = entry?.transaction_type || entry?.type || '-';
        const typeColors: Record<string, string> = {
          invoice: 'text-blue-600',
          payment: 'text-green-600',
          credit_note: 'text-orange-600',
          debit_note: 'text-red-600',
          opening_balance: 'text-gray-600'
        };
        return (
          <span className={`font-medium ${typeColors[type.toLowerCase()] || 'text-gray-600'}`}>
            {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        );
      }
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (value: any, entry: any) => entry?.reference_number || entry?.reference || '-'
    },
    {
      key: 'description',
      header: 'Description',
      render: (value: any, entry: any) => entry?.description || '-'
    },
    {
      key: 'debit',
      header: 'Debit',
      render: (value: any, entry: any) => {
        if (!entry?.debit) return '-';
        return <span className="text-red-600 font-medium">₹{entry.debit.toFixed(2)}</span>;
      }
    },
    {
      key: 'credit',
      header: 'Credit',
      render: (value: any, entry: any) => {
        if (!entry?.credit) return '-';
        return <span className="text-green-600 font-medium">₹{entry.credit.toFixed(2)}</span>;
      }
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (value: any, entry: any) => {
        const balance = entry?.running_balance || entry?.balance || 0;
        return (
          <span className={`font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ₹{Math.abs(balance).toFixed(2)} {balance < 0 && '(Dr)'}
          </span>
        );
      }
    }
  ];

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
      {!embedded && (
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Party Ledger"
            documentNumber=""
            status=""
            icon={FileText}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="ledger"
            onSaveDraft={() => {}}
            additionalActions={[
              {
                label: refreshing ? "Refreshing..." : "Refresh",
                onClick: handleRefresh,
                variant: "primary",
                icon: RefreshCw,
                disabled: refreshing,
                className: refreshing ? "animate-spin" : ""
              }
            ] as any}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-6">
              {/* Party Selection - Embedded in page background like invoice */}
              {!initialPartyId && (
                <div className="mb-6">
                  {/* Header with icon - matching invoice */}
                  <div className="flex items-center gap-2 mb-3">
                    {partyType === 'customer' ? (
                      <>
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">CUSTOMER</span>
                      </>
                    ) : (
                      <>
                        <Building className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">SUPPLIER</span>
                      </>
                    )}
                  </div>

                  {/* Search field - no background, embedded in page */}
                  {partyType === 'customer' ? (
                    <CustomerSearch
                      value={selectedParty}
                      onChange={setSelectedParty}
                      placeholder="Search customer by name, phone, or code..."
                      displayMode="inline"
                      clearable={true}
                    />
                  ) : (
                    <SupplierSearch
                      onChange={setSelectedParty}
                      placeholder="Search supplier by name or ID..."
                      displayMode="inline"
                      clearable={true}
                    />
                  )}
                </div>
              )}

              {/* Summary and Filters - Show when party is selected */}
              {partyId && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                  {/* Show selected party info */}
                  {selectedParty && (
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {selectedParty?.customer_name || selectedParty?.supplier_name || selectedParty?.name || 'Unknown Party'}
                        </h3>
                        {(selectedParty?.phone || selectedParty?.gst_number) && (
                          <div className="flex items-center gap-4 mt-1">
                            {selectedParty?.phone && (
                              <span className="text-sm text-gray-600">
                                📱 {selectedParty.phone}
                              </span>
                            )}
                            {selectedParty?.gst_number && (
                              <span className="text-sm text-gray-600">
                                GST: {selectedParty.gst_number}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {selectedParty?.phone && (
                        <button
                          onClick={() => {
                            let phone = selectedParty.phone.replace(/\D/g, '');
                            if (!phone.startsWith('91') && phone.length === 10) {
                              phone = '91' + phone;
                            }
                            const message = encodeURIComponent(`Hello ${selectedParty?.customer_name || selectedParty?.supplier_name || selectedParty?.name || 'Customer'}, please find your ledger statement attached.`);
                            window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm flex items-center gap-1"
                        >
                          <WhatsAppIcon className="w-4 h-4" />
                          WhatsApp
                        </button>
                      )}
                    </div>
                  )}

                  {/* Summary Cards - Compact */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 rounded-md px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-gray-600">Total Debit</span>
                      <span className="text-sm font-bold text-blue-600">
                        ₹{filteredEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-green-50 rounded-md px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-gray-600">Total Credit</span>
                      <span className="text-sm font-bold text-green-600">
                        ₹{filteredEntries.reduce((sum, entry) => sum + (entry.credit || 0), 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-purple-50 rounded-md px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-gray-600">Net Balance</span>
                      <span className={`text-sm font-bold ${
                        filteredEntries.length > 0 && filteredEntries[filteredEntries.length - 1]?.balance >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        ₹{filteredEntries.length > 0 ? Math.abs(filteredEntries[filteredEntries.length - 1]?.balance || 0).toFixed(2) : '0.00'}
                        {filteredEntries.length > 0 && filteredEntries[filteredEntries.length - 1]?.balance < 0 ? ' (Dr)' : ''}
                      </span>
                    </div>
                    <div className="bg-orange-50 rounded-md px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-gray-600">Transactions</span>
                      <span className="text-sm font-bold text-orange-600">
                        {filteredEntries.length}
                      </span>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="space-y-4">
                    {/* Quick Date Range Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-600">Quick Select:</span>
                      {[
                        { value: 'today', label: 'Today' },
                        { value: 'yesterday', label: 'Yesterday' },
                        { value: 'last7days', label: 'Last 7 Days' },
                        { value: 'last30days', label: 'Last 30 Days' },
                        { value: 'last3months', label: 'Last 3 Months' },
                        { value: 'last6months', label: 'Last 6 Months' },
                        { value: 'lastyear', label: 'Last Year' },
                        { value: 'all', label: 'All Time' }
                      ].map(range => (
                        <button
                          key={range.value}
                          onClick={() => handleQuickDateRange(range.value)}
                          className={`px-3 py-1 rounded-md text-sm ${
                            quickDateRange === range.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>

                    {/* Date Range, Filter and Actions in one row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <input
                          type="date"
                          value={format(dateRange.from, 'yyyy-MM-dd')}
                          onChange={(e) => setDateRange(prev => ({ ...prev, from: new Date(e.target.value) }))}
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-500 text-sm">to</span>
                        <input
                          type="date"
                          value={format(dateRange.to, 'yyyy-MM-dd')}
                          onChange={(e) => setDateRange(prev => ({ ...prev, to: new Date(e.target.value) }))}
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All Types</option>
                        <option value="invoice">Invoices</option>
                        <option value="payment">Payments</option>
                        <option value="credit_note">Credit Notes</option>
                        <option value="debit_note">Debit Notes</option>
                      </select>

                      <div className="flex-1"></div>

                      {/* Action Buttons inline */}
                      <button
                        onClick={() => handleExport('pdf')}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center gap-1"
                      >
                        <FileDown className="w-4 h-4" />
                        PDF
                      </button>
                      <button
                        onClick={() => handleExport('excel')}
                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                      </button>
                      <button
                        onClick={handlePrint}
                        className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm flex items-center gap-1"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {(loadingParty || loadingLedger) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-600">Loading ledger data...</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {errorMessage && (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-red-700">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Ledger Table */}
              {partyId && !loadingLedger && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <DataTable
                    columns={columns}
                    data={ledgerEntries}
                    keyField="id"
                    loading={loadingLedger}
                    emptyMessage="No transactions found for the selected period"
                  />

                  {/* Pagination */}
                  {filteredEntries.length > 0 && (
                    <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700">Show</span>
                          <select
                            value={itemsPerPage}
                            onChange={(e) => {
                              setItemsPerPage(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                          <span className="text-sm text-gray-700">entries</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of {filteredEntries.length} entries
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>

                        {/* Page Numbers */}
                        <div className="flex items-center gap-1">
                          {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = idx + 1;
                            } else if (currentPage <= 3) {
                              pageNum = idx + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + idx;
                            } else {
                              pageNum = currentPage - 2 + idx;
                            }

                            return (
                              <button
                                key={idx}
                                onClick={() => setCurrentPage(pageNum)}
                                className={`px-3 py-1 rounded text-sm ${
                                  currentPage === pageNum
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function
function downloadFile(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default PartyLedger;