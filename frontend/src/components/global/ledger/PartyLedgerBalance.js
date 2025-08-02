import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Calendar } from 'lucide-react';
import { partyLedgerAPI } from '../../../services/api';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const PartyLedgerBalance = ({ 
  partyId, 
  partyType = 'customer',
  showDetails = true,
  onBalanceUpdate,
  className = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (partyId) {
      fetchBalance();
    }
  }, [partyId, partyType]);

  const fetchBalance = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await partyLedgerAPI.getBalance(partyId, partyType);
      setBalance(response.data);
      
      if (onBalanceUpdate) {
        onBalanceUpdate(response.data);
      }
    } catch (err) {
      console.error('Error fetching party balance:', err);
      setError('Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-20 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  const isReceivable = balance.balance_type === 'Dr';
  const balanceColor = isReceivable ? 'text-red-600' : 'text-green-600';
  const bgColor = isReceivable ? 'bg-red-50' : 'bg-green-50';
  const borderColor = isReceivable ? 'border-red-200' : 'border-green-200';
  const iconColor = isReceivable ? 'text-red-500' : 'text-green-500';

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isReceivable ? (
              <TrendingDown className={`w-5 h-5 ${iconColor}`} />
            ) : (
              <TrendingUp className={`w-5 h-5 ${iconColor}`} />
            )}
            <h3 className="text-sm font-medium text-gray-700">
              {isReceivable ? 'Receivable' : 'Payable'}
            </h3>
          </div>
          
          <p className={`text-2xl font-bold ${balanceColor}`}>
            {formatCurrency(balance.balance)}
          </p>
          
          {showDetails && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Activity className="w-3 h-3" />
                <span>{balance.transaction_count} transactions</span>
              </div>
              
              {balance.last_transaction_date && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Calendar className="w-3 h-3" />
                  <span>Last: {formatDate(balance.last_transaction_date)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <button
          onClick={fetchBalance}
          className="p-1 hover:bg-white/50 rounded transition-colors"
          title="Refresh balance"
        >
          <Activity className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
};

export default PartyLedgerBalance;