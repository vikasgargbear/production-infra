import React, { useState, useEffect } from 'react';
import { RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react';
import { CanonicalWriteNotice, ModuleHeader } from '../../global';
import { bankAccountsApi } from '../../../services/api';
import { useCanonicalBusinessDate } from '../../../hooks/useCanonicalBusinessDate';
import { exactDecimalString, exactDecimalUnits, formatExactCurrency, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';


interface BankReconciliationFlowProps {
  onClose?: () => void;
}

interface BankAccount {
  bank_account_id: string;
  settlement_account_id: string;
  code: string;
  account_name: string;
  balance: string;
  account_type: string;
  bank_name: string;
  allows_bank_reconciliation: boolean;
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
  const [reconciliationDate, setReconciliationDate] = useState('');
  const [bankStatementBalance, setBankStatementBalance] = useState('');
  const [bookBalance, setBookBalance] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<UnreconciledTransaction[]>([]);
  const business = useCanonicalBusinessDate();

  // Load only from the live API. Stale local snapshots are intentionally unsupported.
  const loadReconciliationData = async () => {
    setLoading(true);
    setError(null);

    try {
      const accountsResponse = await bankAccountsApi.getAll();

      const accountsData = accountsResponse?.data?.accounts || accountsResponse?.data || [];
      if (Array.isArray(accountsData)) {
        setBankAccounts(accountsData.map((raw: Record<string, unknown>, index: number) => {
          const bankAccountId = String(raw.bank_account_id || raw.id || '');
          const settlementAccountId = String(raw.settlement_account_id || '');
          if (!bankAccountId || !settlementAccountId || typeof raw.balance !== 'string') {
            throw new Error(`Bank account ${index + 1} is missing canonical identities or an exact balance.`);
          }
          return {
            bank_account_id: bankAccountId,
            settlement_account_id: settlementAccountId,
            code: String(raw.code || ''),
            account_name: String(raw.account_name || raw.name || ''),
            balance: normalizeAuthoritativeDecimal(raw.balance, `Bank account ${index + 1} balance`, { scale: 2, maximumWholeDigits: 20, allowNegative: true }),
            account_type: String(raw.account_type || ''),
            bank_name: String(raw.bank_name || ''),
            allows_bank_reconciliation: raw.allows_bank_reconciliation === true,
          };
        }));
      } else {
        setBankAccounts([]);
      }

      // Statement matching remains unavailable until its canonical read/command exists.
      setUnreconciledTransactions([]);

    } catch (err) {
      setError('Unable to load bank reconciliation data from the live API. Please try again.');
      setBankAccounts([]);
      setUnreconciledTransactions([]);
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
    if (business.error) {
      setLoading(false);
      setError(`Unable to load the canonical organization date: ${business.error}`);
      return;
    }
    if (!business.businessDate) return;
    if (!reconciliationDate) {
      setReconciliationDate(business.businessDate);
      return;
    }
    void loadReconciliationData();
  }, [business.businessDate, business.error, reconciliationDate]);

  // Update book balance when bank account changes
  const handleBankAccountChange = (accountId: string) => {
    setSelectedBank(accountId);
    const account = bankAccounts.find(acc => acc.bank_account_id === accountId);
    if (account) {
      setBookBalance(account.balance);
    } else setBookBalance('');
  };

  const statementBalanceValid = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(bankStatementBalance);
  const difference = statementBalanceValid && bookBalance
    ? exactDecimalUnits(bankStatementBalance, 'Bank statement balance', { scale: 2, maximumWholeDigits: 20, allowNegative: true })
      - exactDecimalUnits(bookBalance, 'Book balance', { scale: 2, maximumWholeDigits: 20, allowNegative: true })
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading bank reconciliation data...</span>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Bank Reconciliation"
          status={difference === null ? 'Select source facts' : difference === 0n ? 'Balanced' : `Difference: ${formatExactCurrency(exactDecimalString(difference < 0n ? -difference : difference, 2), 'Reconciliation difference')}`}
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
              label: 'Start Reconciliation (Unavailable)',
              onClick: () => undefined,
              variant: 'primary',
              disabled: true
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
        <CanonicalWriteNotice action="Starting bank reconciliation" className="border-x-0" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
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
                      <option key={account.bank_account_id} value={account.bank_account_id} disabled={!account.allows_bank_reconciliation}>
                        {account.account_name} — {formatExactCurrency(account.balance, 'Book balance')}{!account.allows_bank_reconciliation ? ' — reconciliation unavailable' : ''}
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
                    value={bankStatementBalance}
                    onChange={(e) => setBankStatementBalance(e.target.value)}
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
                  <p className="text-2xl font-bold text-blue-600">{bookBalance ? formatExactCurrency(bookBalance, 'Book balance') : 'Unavailable'}</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Bank Statement Balance</p>
                  <p className="text-2xl font-bold text-green-600">{statementBalanceValid ? formatExactCurrency(bankStatementBalance, 'Statement balance') : bankStatementBalance ? 'Invalid amount' : 'Not entered'}</p>
                </div>
                <div className={`text-center p-4 rounded-lg ${difference === 0n ? 'bg-green-50' : difference === null ? 'bg-slate-50' : 'bg-red-50'}`}>
                  <p className="text-sm text-gray-600 mb-2">Difference</p>
                  <p className={`text-2xl font-bold ${difference === 0n ? 'text-green-600' : difference === null ? 'text-slate-500' : 'text-red-600'}`}>
                    {difference === null ? 'Unavailable' : difference === 0n ? (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle className="w-6 h-6" />
                        Balanced
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <AlertCircle className="w-6 h-6" />
                        {formatExactCurrency(exactDecimalString(difference < 0n ? -difference : difference, 2), 'Reconciliation difference')}
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
                <button
                  type="button"
                  disabled
                  title="Statement import needs a canonical reconciliation command"
                  className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-gray-400"
                >
                  <Upload className="w-4 h-4" />
                  Import unavailable
                </button>
              </div>

              {unreconciledTransactions.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 text-amber-500" />
                  <p>Transaction matching is unavailable</p>
                  <p className="text-sm">No “all reconciled” claim is made until a canonical reconciliation query exists.</p>
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
                            <button
                              type="button"
                              disabled
                              title="Matching needs a canonical reconciliation command"
                              className="min-h-11 cursor-not-allowed rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-400"
                            >
                              Match unavailable
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
