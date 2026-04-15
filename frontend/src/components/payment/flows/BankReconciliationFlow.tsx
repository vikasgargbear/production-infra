import React, { useState, useEffect } from 'react';
import { RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react';
import { ModuleHeader } from '../../global';
import { paymentsApi, bankAccountsApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';
import { showFinancialEntryNotification } from '../../../utils/financialEntryNotifier';


interface BankReconciliationFlowProps {
  onClose?: () => void;
}

interface BankAccount {
  code: string;
  name: string;
  balance: number;
  account_type: string;
  bank_name: string;
}

interface UnreconciledTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  status: 'unmatched' | 'matched' | 'pending';
  reference_no?: string;
  party_name?: string;
}

const BankReconciliationFlow: React.FC<BankReconciliationFlowProps> = ({ onClose }) => {
  const [selectedBank, setSelectedBank] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(new Date().toISOString().split('T')[0]);
  const [bankStatementBalance, setBankStatementBalance] = useState(0);
  const [bookBalance, setBookBalance] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<UnreconciledTransaction[]>([]);

  // Load bank accounts and reconciliation data with offline fallback
  const loadReconciliationData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load bank accounts and unreconciled transactions
      const [accountsResponse, transactionsResponse] = await Promise.all([
        bankAccountsApi.getAll(),
        paymentsApi.getUnreconciledTransactions({ date: reconciliationDate })
      ]);

      const accountsData = accountsResponse?.data?.accounts || accountsResponse?.data || [];
      if (Array.isArray(accountsData)) {
        setBankAccounts(accountsData);
      } else {
        setBankAccounts([]);
      }

      if (transactionsResponse?.data && Array.isArray(transactionsResponse.data)) {
        setUnreconciledTransactions(transactionsResponse.data);
      } else {
        setUnreconciledTransactions([]);
      }

      // Store data offline for future use
      await offlineStorage.storeOffline('bank_reconciliation_data', {
        accounts: accountsData,
        transactions: transactionsResponse?.data || [],
        date: reconciliationDate
      }, {
        critical: true,
        persistent: true
      });

    } catch (err) {

      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('bank_reconciliation_data', { critical: true });

      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for reconciliation data
        setBankAccounts(offlineData.data.accounts || []);
        setUnreconciledTransactions(offlineData.data.transactions || []);

        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load bank reconciliation data. Please check your connection and try again.');
        setBankAccounts([]);
        setUnreconciledTransactions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh reconciliation data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      await loadReconciliationData();
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Load data when component mounts or date changes
  useEffect(() => {
    loadReconciliationData();
  }, [reconciliationDate]);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const startReconciliation = async () => {
    if (!selectedBank) {
      setError('Please select a bank account');
      return;
    }

    setReconciling(true);
    setError(null);

    try {
      // Call the actual reconciliation API
      const response = await paymentsApi.startBankReconciliation({
        bank_account: selectedBank,
        statement_date: reconciliationDate,
        opening_balance: bookBalance,
        closing_balance: bankStatementBalance,
        transactions: unreconciledTransactions.map((transaction) => ({
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount
        }))
      });

      if (response?.data?.reconciliation_id || response?.data?.status === 'completed') {
        const bankAccount = bankAccounts.find((account) => account.code === selectedBank);
        showFinancialEntryNotification({
          title: 'Bank Reconciliation Saved',
          reference: selectedBank,
          amount: bankStatementBalance,
          status: 'confirmed',
          impacts: [
            `${bankAccount?.name || 'This bank account'} is now checked against your books.`,
            difference === 0
              ? 'Your bank balance and system balance now match.'
              : `There is still a difference of ₹${Math.abs(difference).toFixed(2)} to review.`,
            'This helps you trust that bank money and system money are in sync.'
          ]
        });
        // Refresh data after successful reconciliation
        await loadReconciliationData();
        setError(null);
      } else {
        setError('Reconciliation failed. Please try again.');
      }
    } catch (error) {
      setError('Error during reconciliation. Please check your connection and try again.');
    } finally {
      setReconciling(false);
    }
  };

  // Update book balance when bank account changes
  const handleBankAccountChange = (accountCode: string) => {
    setSelectedBank(accountCode);
    const account = bankAccounts.find(acc => acc.code === accountCode);
    if (account) {
      setBookBalance(account.balance);
    }
  };

  const difference = bankStatementBalance - bookBalance;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading bank reconciliation data...</span>
      </div>
    );
  }

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Bank Reconciliation"
          documentNumber={`REC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`}
          status={difference === 0 ? 'Balanced' : `Difference: ₹${Math.abs(difference).toFixed(2)}`}
          icon={RefreshCw}
          iconColor="text-teal-600"
          onClose={onClose}
          historyType="reconciliation"
          onSaveDraft={() => { }}
          additionalActions={[
            {
              label: 'Refresh',
              onClick: handleRefresh,
              variant: 'outline',
              disabled: refreshing,
              icon: RefreshCw
            },
            {
              label: reconciling ? 'Reconciling...' : 'Start Reconciliation',
              onClick: startReconciliation,
              variant: 'primary',
              disabled: !selectedBank || reconciling
            }
          ] as any}
        />

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-red-800 text-sm">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Start Reconciliation | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

            {/* Reconciliation Setup */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-blue-600" />
                Reconciliation Setup
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Bank Account</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => handleBankAccountChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Select bank account...</option>
                    {bankAccounts.map(account => (
                      <option key={account.code} value={account.code}>
                        {account.name} - ₹{account.balance.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Reconciliation Date</label>
                  <input
                    type="date"
                    value={reconciliationDate}
                    onChange={(e) => setReconciliationDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Bank Statement Balance</label>
                  <input
                    type="number"
                    value={bankStatementBalance || ''}
                    onChange={(e) => setBankStatementBalance(parseFloat(e.target.value) || 0)}
                    placeholder="Enter bank statement balance"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Balance Comparison */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                Balance Comparison
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Book Balance</p>
                  <p className="text-2xl font-bold text-blue-600">₹{bookBalance.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Bank Statement Balance</p>
                  <p className="text-2xl font-bold text-green-600">₹{bankStatementBalance.toLocaleString()}</p>
                </div>
                <div className={`text-center p-4 rounded-lg ${difference === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-sm text-gray-600 mb-2">Difference</p>
                  <p className={`text-2xl font-bold ${difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {difference === 0 ? (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle className="w-6 h-6" />
                        Balanced
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <AlertCircle className="w-6 h-6" />
                        ₹{Math.abs(difference).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Unreconciled Transactions */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-orange-600" />
                  Unreconciled Transactions
                </h3>
                <button className="px-4 py-2 text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Import Statement
                </button>
              </div>

              {unreconciledTransactions.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
                  <p>No unreconciled transactions found</p>
                  <p className="text-sm">All transactions are reconciled for the selected period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Description</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Amount</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {unreconciledTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{transaction.date}</td>
                          <td className="px-4 py-3 text-sm">{transaction.description}</td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {transaction.amount > 0 ? '+' : ''}₹{Math.abs(transaction.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                              {transaction.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className="px-3 py-1 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 rounded hover:bg-teal-50">
                              Match
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankReconciliationFlow;
