import React, { useState, useEffect } from 'react';
import { 
  FileText, AlertCircle, Clock, CheckCircle, 
  AlertTriangle, Filter, ChevronDown 
} from 'lucide-react';
import { partyLedgerAPI } from '../../../services/api';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const OutstandingBills = ({ 
  partyId, 
  partyType = 'customer',
  onBillSelect,
  showSummary = true,
  className = '' 
}) => {
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedBill, setExpandedBill] = useState(null);

  useEffect(() => {
    if (partyId) {
      fetchBills();
    }
  }, [partyId, partyType, filter]);

  const fetchBills = async () => {
    setLoading(true);
    
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await partyLedgerAPI.getOutstandingBills(partyId, partyType, params);
      setBills(response.data);
    } catch (err) {
      console.error('Error fetching outstanding bills:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'partial':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAgingColor = (daysOverdue) => {
    if (daysOverdue <= 0) return 'text-gray-600';
    if (daysOverdue <= 30) return 'text-yellow-600';
    if (daysOverdue <= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!bills) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary */}
      {showSummary && bills.summary && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Outstanding Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600">Total Bills</p>
              <p className="text-lg font-semibold text-gray-900">
                {bills.summary.total_bills}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Outstanding</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(bills.summary.total_outstanding)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Current</p>
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(bills.summary.current_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Overdue</p>
              <p className="text-lg font-semibold text-red-600">
                {formatCurrency(bills.summary.overdue_amount)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Bills</option>
          <option value="outstanding">Outstanding</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Bills List */}
      <div className="space-y-2">
        {bills.bills.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No bills found</p>
          </div>
        ) : (
          bills.bills.map((bill) => (
            <div
              key={bill.bill_id}
              className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => {
                  setExpandedBill(expandedBill === bill.bill_id ? null : bill.bill_id);
                  if (onBillSelect) {
                    onBillSelect(bill);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(bill.status)}
                      <h4 className="font-medium text-gray-900">
                        {bill.bill_number}
                      </h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(bill.status)}`}>
                        {bill.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Date: {formatDate(bill.bill_date)}</span>
                      <span>Due: {formatDate(bill.due_date)}</span>
                      {bill.days_overdue > 0 && (
                        <span className={`font-medium ${getAgingColor(bill.days_overdue)}`}>
                          {bill.days_overdue} days overdue
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(bill.outstanding_amount)}
                    </p>
                    <p className="text-xs text-gray-600">
                      of {formatCurrency(bill.bill_amount)}
                    </p>
                  </div>
                </div>
                
                {expandedBill === bill.bill_id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Bill Amount</p>
                        <p className="font-medium">{formatCurrency(bill.bill_amount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Paid Amount</p>
                        <p className="font-medium text-green-600">
                          {formatCurrency(bill.paid_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Outstanding</p>
                        <p className="font-medium text-red-600">
                          {formatCurrency(bill.outstanding_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Aging Bucket</p>
                        <p className="font-medium">{bill.aging_bucket}</p>
                      </div>
                    </div>
                    
                    {bill.reference && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-600">Reference: {bill.reference}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OutstandingBills;