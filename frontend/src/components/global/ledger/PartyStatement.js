import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Calendar, Filter, Download, Printer, 
  ChevronLeft, ChevronRight, RefreshCw, X
} from 'lucide-react';
import { partyLedgerApi } from '../../../services/api';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { DatePicker } from '../ui';

const PartyStatement = ({ 
  partyId, 
  partyType = 'customer',
  partyName = '',
  onClose,
  className = '' 
}) => {
  const [loading, setLoading] = useState(false);
  const [statement, setStatement] = useState(null);
  const [filters, setFilters] = useState({
    from_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    to_date: new Date().toISOString().split('T')[0]
  });
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  useEffect(() => {
    if (partyId) {
      fetchStatement();
    }
  }, [partyId, partyType, filters, page]);

  const fetchStatement = async () => {
    setLoading(true);
    
    try {
      const params = {
        ...filters,
        skip: page * pageSize,
        limit: pageSize
      };
      
      const response = await partyLedgerApi.getStatement(partyId, partyType, params);
      setStatement(response.data);
    } catch (err) {
      console.error('Error fetching statement:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Export to CSV');
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setPage(0);
  };

  if (!statement && !loading) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Party Statement
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {partyName || statement?.party_name}
              {statement?.phone && ` • ${statement.phone}`}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Print"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <DatePicker
              value={filters.from_date}
              onChange={(date) => handleFilterChange('from_date', date)}
              placeholder="From date"
              className="text-sm"
            />
            <span className="text-gray-500">to</span>
            <DatePicker
              value={filters.to_date}
              onChange={(date) => handleFilterChange('to_date', date)}
              placeholder="To date"
              className="text-sm"
            />
          </div>
          
          <button
            onClick={fetchStatement}
            disabled={loading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Statement Summary */}
      {statement && (
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-600">Opening Balance</p>
              <p className="text-lg font-semibold">
                {formatCurrency(statement.opening_balance)}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  {statement.opening_balance_type}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Period Activity</p>
              <p className="text-lg font-semibold">
                {statement.transactions.length} transactions
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Closing Balance</p>
              <p className="text-lg font-semibold">
                {formatCurrency(statement.closing_balance)}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  {statement.closing_balance_type}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Particulars
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Debit
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Credit
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Opening Balance Row */}
            {statement && page === 0 && (
              <tr className="bg-gray-50">
                <td className="px-6 py-3 text-sm text-gray-900">
                  {formatDate(filters.from_date)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-900 font-medium">
                  Opening Balance
                </td>
                <td className="px-6 py-3 text-sm text-right">-</td>
                <td className="px-6 py-3 text-sm text-right">-</td>
                <td className="px-6 py-3 text-sm text-right font-medium">
                  {formatCurrency(statement.opening_balance)}
                  <span className="text-xs text-gray-600 ml-1">
                    {statement.opening_balance_type}
                  </span>
                </td>
              </tr>
            )}
            
            {/* Transaction Rows */}
            {loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center">
                  <div className="flex justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                </td>
              </tr>
            ) : statement?.transactions.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  No transactions found for the selected period
                </td>
              </tr>
            ) : (
              statement?.transactions.map((txn, index) => (
                <tr key={txn.ledger_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-900">
                    {formatDate(txn.date)}
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {txn.description || txn.transaction_type}
                    </p>
                    {txn.reference && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {txn.reference}
                      </p>
                    )}
                    {txn.payment_mode && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mt-1">
                        {txn.payment_mode}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-right">
                    {txn.debit ? formatCurrency(txn.debit) : '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-right">
                    {txn.credit ? formatCurrency(txn.credit) : '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-medium">
                    {formatCurrency(txn.balance)}
                    <span className="text-xs text-gray-600 ml-1">
                      {txn.balance_type}
                    </span>
                  </td>
                </tr>
              ))
            )}
            
            {/* Closing Balance Row */}
            {statement && !loading && statement.transactions.length > 0 && (
              <tr className="bg-gray-50 font-medium">
                <td className="px-6 py-3 text-sm text-gray-900">
                  {formatDate(filters.to_date)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-900">
                  Closing Balance
                </td>
                <td className="px-6 py-3 text-sm text-right">-</td>
                <td className="px-6 py-3 text-sm text-right">-</td>
                <td className="px-6 py-3 text-sm text-right">
                  {formatCurrency(statement.closing_balance)}
                  <span className="text-xs text-gray-600 ml-1">
                    {statement.closing_balance_type}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {statement && statement.total_transactions > pageSize && (
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, statement.total_transactions)} of {statement.total_transactions} transactions
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(prev => Math.max(0, prev - 1))}
              disabled={page === 0}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(prev => prev + 1)}
              disabled={(page + 1) * pageSize >= statement.total_transactions}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .${className}, .${className} * {
            visibility: visible;
          }
          .${className} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PartyStatement;