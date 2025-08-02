/**
 * PartyStatement Component
 * Generate and display detailed party account statements with custom date ranges
 */

import React, { useState, useRef } from 'react';
import { useQuery } from 'react-query';
import {
  Calendar,
  Download,
  Printer,
  Mail,
  FileText,
  Building,
  Phone,
  MapPin,
  Globe,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Filter,
  Eye,
  Share2
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { CustomerSearch, SupplierSearch, DatePicker, Select } from '../global';
import { formatCurrency } from '../../utils/formatters';
import { useReactToPrint } from 'react-to-print';

interface PartyStatementProps {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  dateRange?: { from: Date; to: Date };
}

interface StatementData {
  party_info: {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    code: string;
    contact: {
      phone: string;
      email: string;
      address: string;
      city: string;
      state: string;
      pincode: string;
    };
    tax_info: {
      gst_number?: string;
      pan_number?: string;
    };
    credit_limit?: number;
    credit_days?: number;
  };
  statement_period: {
    from: string;
    to: string;
  };
  summary: {
    opening_balance: number;
    total_invoices: number;
    total_payments: number;
    total_credit_notes: number;
    total_debit_notes: number;
    closing_balance: number;
    outstanding_amount: number;
    overdue_amount: number;
  };
  transactions: StatementTransaction[];
  aging_summary: {
    current: number;
    '1-30': number;
    '31-60': number;
    '61-90': number;
    over_90: number;
  };
  company_info: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    gst_number: string;
  };
}

interface StatementTransaction {
  date: string;
  type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'opening_balance';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  due_date?: string;
  is_overdue?: boolean;
}

const PartyStatement: React.FC<PartyStatementProps> = ({
  partyType = 'customer',
  partyId: initialPartyId,
  embedded = false,
  dateRange: initialDateRange
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [dateRange, setDateRange] = useState(
    initialDateRange || {
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date())
    }
  );
  const [statementType, setStatementType] = useState<'detailed' | 'summary'>('detailed');
  const [includeOptions, setIncludeOptions] = useState({
    includePending: true,
    includeSettled: false,
    groupByMonth: false
  });

  // Fetch statement data
  const { data: statementData, isLoading, refetch } = useQuery(
    ['party-statement', selectedParty?.id || initialPartyId, dateRange, includeOptions],
    () => ledgerApi.getPartyStatement({
      party_id: selectedParty?.id || initialPartyId,
      party_type: partyType,
      date_from: format(dateRange.from, 'yyyy-MM-dd'),
      date_to: format(dateRange.to, 'yyyy-MM-dd'),
      include_pending: includeOptions.includePending,
      include_settled: includeOptions.includeSettled,
      group_by_month: includeOptions.groupByMonth
    }),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Print handler
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Statement-${statementData?.party_info.name}-${format(new Date(), 'yyyy-MM-dd')}`,
    pageStyle: '@page { size: A4; margin: 10mm; }'
  });

  // Export handlers
  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const response = await ledgerApi.exportStatement({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        format,
        include_letter_head: true
      });
      
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `statement-${statementData?.party_info.name}-${format(new Date(), 'yyyy-MM-dd')}.${format}`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleEmail = async () => {
    try {
      await ledgerApi.emailStatement({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        email: statementData?.party_info.contact.email,
        cc_emails: [],
        subject: `Account Statement - ${format(dateRange.from, 'MMM yyyy')} to ${format(dateRange.to, 'MMM yyyy')}`,
        message: 'Please find attached your account statement for the requested period.'
      });
      
      // Show success message
      alert('Statement sent successfully!');
    } catch (error) {
      console.error('Email failed:', error);
    }
  };

  const handleShare = async () => {
    try {
      const response = await ledgerApi.generateStatementLink({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        expiry_days: 7
      });
      
      // Copy link to clipboard
      navigator.clipboard.writeText(response.data.link);
      alert('Statement link copied to clipboard!');
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  // Quick date range setters
  const setQuickDateRange = (type: string) => {
    const today = new Date();
    switch (type) {
      case 'current_month':
        setDateRange({
          from: startOfMonth(today),
          to: endOfMonth(today)
        });
        break;
      case 'last_month':
        const lastMonth = subMonths(today, 1);
        setDateRange({
          from: startOfMonth(lastMonth),
          to: endOfMonth(lastMonth)
        });
        break;
      case 'last_quarter':
        setDateRange({
          from: subMonths(today, 3),
          to: today
        });
        break;
      case 'last_year':
        setDateRange({
          from: subMonths(today, 12),
          to: today
        });
        break;
    }
  };

  if (!statementData && !isLoading) {
    return (
      <div className={embedded ? '' : 'p-6'}>
        {/* Party Selection */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select {partyType === 'customer' ? 'Customer' : 'Supplier'}
          </label>
          {partyType === 'customer' ? (
            <CustomerSearch
              onSelect={setSelectedParty}
              placeholder="Search customer by name, phone or ID"
            />
          ) : (
            <SupplierSearch
              onSelect={setSelectedParty}
              placeholder="Search supplier by name or ID"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Party Statement</h1>
            <p className="text-gray-600">Generate detailed account statements</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
            <button
              onClick={handleEmail}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              onClick={handleShare}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Statement Period
            </label>
            <div className="flex gap-2">
              <DatePicker
                value={dateRange.from}
                onChange={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                placeholder="From date"
              />
              <DatePicker
                value={dateRange.to}
                onChange={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                placeholder="To date"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setQuickDateRange('current_month')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              This Month
            </button>
            <button
              onClick={() => setQuickDateRange('last_month')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              Last Month
            </button>
            <button
              onClick={() => setQuickDateRange('last_quarter')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              Last Quarter
            </button>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeOptions.includePending}
                onChange={(e) => setIncludeOptions({
                  ...includeOptions,
                  includePending: e.target.checked
                })}
              />
              <span className="text-sm">Include Pending</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeOptions.includeSettled}
                onChange={(e) => setIncludeOptions({
                  ...includeOptions,
                  includeSettled: e.target.checked
                })}
              />
              <span className="text-sm">Include Settled</span>
            </label>
          </div>

          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Generate Statement
          </button>
        </div>
      </div>

      {/* Statement Content */}
      {statementData && (
        <div ref={printRef} className="bg-white rounded-lg shadow print:shadow-none">
          {/* Company Header */}
          <div className="p-8 border-b">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-800">
                {statementData.company_info.name}
              </h1>
              <p className="text-sm text-gray-600">{statementData.company_info.address}</p>
              <p className="text-sm text-gray-600">
                Phone: {statementData.company_info.phone} | Email: {statementData.company_info.email}
              </p>
              <p className="text-sm text-gray-600">GST: {statementData.company_info.gst_number}</p>
            </div>

            <h2 className="text-xl font-semibold text-center mb-6">STATEMENT OF ACCOUNT</h2>

            <div className="grid grid-cols-2 gap-8">
              {/* Party Details */}
              <div>
                <h3 className="font-semibold mb-2">Party Details:</h3>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{statementData.party_info.name}</p>
                  <p>{statementData.party_info.contact.address}</p>
                  <p>{statementData.party_info.contact.city}, {statementData.party_info.contact.state} - {statementData.party_info.contact.pincode}</p>
                  <p>Phone: {statementData.party_info.contact.phone}</p>
                  <p>Email: {statementData.party_info.contact.email}</p>
                  {statementData.party_info.tax_info.gst_number && (
                    <p>GST: {statementData.party_info.tax_info.gst_number}</p>
                  )}
                </div>
              </div>

              {/* Statement Info */}
              <div className="text-right">
                <h3 className="font-semibold mb-2">Statement Details:</h3>
                <div className="space-y-1 text-sm">
                  <p>Party Code: {statementData.party_info.code}</p>
                  <p>Statement Date: {format(new Date(), 'dd/MM/yyyy')}</p>
                  <p>Period: {format(parseISO(statementData.statement_period.from), 'dd/MM/yyyy')} to {format(parseISO(statementData.statement_period.to), 'dd/MM/yyyy')}</p>
                  {statementData.party_info.credit_limit && (
                    <p>Credit Limit: {formatCurrency(statementData.party_info.credit_limit)}</p>
                  )}
                  {statementData.party_info.credit_days && (
                    <p>Credit Days: {statementData.party_info.credit_days}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-8 border-b">
            <h3 className="font-semibold mb-4">Account Summary</h3>
            <div className="grid grid-cols-6 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Opening Balance</p>
                <p className="font-semibold">{formatCurrency(statementData.summary.opening_balance)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Invoices</p>
                <p className="font-semibold">{formatCurrency(statementData.summary.total_invoices)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Payments</p>
                <p className="font-semibold">{formatCurrency(statementData.summary.total_payments)}</p>
              </div>
              <div>
                <p className="text-gray-500">Credit Notes</p>
                <p className="font-semibold">{formatCurrency(statementData.summary.total_credit_notes)}</p>
              </div>
              <div>
                <p className="text-gray-500">Debit Notes</p>
                <p className="font-semibold">{formatCurrency(statementData.summary.total_debit_notes)}</p>
              </div>
              <div>
                <p className="text-gray-500">Closing Balance</p>
                <p className={`font-semibold ${statementData.summary.closing_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(statementData.summary.closing_balance))}
                  {statementData.summary.closing_balance < 0 ? ' (Dr)' : ' (Cr)'}
                </p>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="p-8">
            <h3 className="font-semibold mb-4">Transaction Details</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Reference</th>
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {statementData.transactions.map((transaction, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{format(parseISO(transaction.date), 'dd/MM/yyyy')}</td>
                    <td className="py-2">{transaction.reference}</td>
                    <td className="py-2">{transaction.description}</td>
                    <td className="text-right py-2">
                      {transaction.debit ? formatCurrency(transaction.debit) : '-'}
                    </td>
                    <td className="text-right py-2">
                      {transaction.credit ? formatCurrency(transaction.credit) : '-'}
                    </td>
                    <td className="text-right py-2 font-medium">
                      {formatCurrency(Math.abs(transaction.balance))}
                      {transaction.balance < 0 ? ' Dr' : ' Cr'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Aging Summary */}
          {statementData.summary.outstanding_amount > 0 && (
            <div className="p-8 border-t">
              <h3 className="font-semibold mb-4">Aging Analysis</h3>
              <div className="grid grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Current</p>
                  <p className="font-semibold">{formatCurrency(statementData.aging_summary.current)}</p>
                </div>
                <div>
                  <p className="text-gray-500">1-30 Days</p>
                  <p className="font-semibold">{formatCurrency(statementData.aging_summary['1-30'])}</p>
                </div>
                <div>
                  <p className="text-gray-500">31-60 Days</p>
                  <p className="font-semibold">{formatCurrency(statementData.aging_summary['31-60'])}</p>
                </div>
                <div>
                  <p className="text-gray-500">61-90 Days</p>
                  <p className="font-semibold">{formatCurrency(statementData.aging_summary['61-90'])}</p>
                </div>
                <div>
                  <p className="text-gray-500">Over 90 Days</p>
                  <p className="font-semibold">{formatCurrency(statementData.aging_summary.over_90)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-8 text-center text-sm text-gray-500">
            <p>This is a computer generated statement and does not require signature.</p>
            <p>For any queries, please contact: {statementData.company_info.email}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyStatement;