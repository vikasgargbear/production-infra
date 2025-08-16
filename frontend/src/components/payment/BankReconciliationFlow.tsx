import React, { useState } from 'react';
import { RefreshCw, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { ModuleHeader } from '../global';

interface BankReconciliationFlowProps {
  onClose?: () => void;
}

const BankReconciliationFlow: React.FC<BankReconciliationFlowProps> = ({ onClose }) => {
  const [selectedBank, setSelectedBank] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(new Date().toISOString().split('T')[0]);
  const [bankStatementBalance, setBankStatementBalance] = useState(0);
  const [bookBalance, setBookBalance] = useState(485000); // Mock data
  const [reconciling, setReconciling] = useState(false);

  const bankAccounts = [
    { code: '1102', name: 'HDFC Current Account', balance: 485000 },
    { code: '1103', name: 'SBI Savings Account', balance: 125000 },
    { code: '1104', name: 'ICICI Business Account', balance: 350000 }
  ];

  // Mock unreconciled transactions
  const unreconciledTransactions = [
    { id: 1, date: '2024-01-15', description: 'Customer Payment - ABC Store', amount: 56000, type: 'credit', status: 'unmatched' },
    { id: 2, date: '2024-01-14', description: 'Supplier Payment - XYZ Pharma', amount: -125000, type: 'debit', status: 'unmatched' },
    { id: 3, date: '2024-01-13', description: 'Bank Charges', amount: -250, type: 'debit', status: 'unmatched' }
  ];

  const startReconciliation = async () => {
    if (!selectedBank) {
      alert('Please select a bank account');
      return;
    }

    setReconciling(true);
    try {
      console.log('Starting reconciliation for:', { selectedBank, reconciliationDate, bankStatementBalance });
      // Mock reconciliation process
      setTimeout(() => {
        alert('Bank reconciliation completed successfully!');
        setReconciling(false);
      }, 2000);
    } catch (error) {
      console.error('Error during reconciliation:', error);
      alert('Error during reconciliation');
      setReconciling(false);
    }
  };

  const difference = bankStatementBalance - bookBalance;

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
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: reconciling ? 'Reconciling...' : 'Start Reconciliation',
              onClick: startReconciliation,
              variant: 'primary',
              disabled: !selectedBank || reconciling
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Start Reconciliation | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            
            {/* Reconciliation Setup */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Reconciliation Setup</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Bank Account</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => {
                      setSelectedBank(e.target.value);
                      const account = bankAccounts.find(acc => acc.code === e.target.value);
                      if (account) setBookBalance(account.balance);
                    }}
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
              <h3 className="text-lg font-medium text-gray-900 mb-4">Balance Comparison</h3>
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
                <h3 className="text-lg font-medium text-gray-900">Unreconciled Transactions</h3>
                <button className="px-4 py-2 text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Import Statement
                </button>
              </div>

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
                        <td className={`px-4 py-3 text-sm text-right font-medium ${
                          transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount > 0 ? '+' : ''}₹{Math.abs(transaction.amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                            Unmatched
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankReconciliationFlow;