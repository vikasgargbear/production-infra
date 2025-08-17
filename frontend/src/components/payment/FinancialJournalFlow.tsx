import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, AlertCircle, CheckCircle, 
  Calculator, X, Search, Calendar, Loader2, RefreshCw
} from 'lucide-react';
import { ModuleHeader } from '../global';

interface FinancialJournalFlowProps {
  onClose?: () => void;
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  narration: string;
}

const FinancialJournalFlow: React.FC<FinancialJournalFlowProps> = ({ onClose }) => {
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', account_code: '', account_name: '', debit_amount: 0, credit_amount: 0, narration: '' },
    { id: '2', account_code: '', account_name: '', debit_amount: 0, credit_amount: 0, narration: '' }
  ]);
  const [isBalanced, setIsBalanced] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // API data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Accounts for selection - will be loaded from API
  const [accounts, setAccounts] = useState([
    { code: '1101', name: 'Cash in Hand' },
    { code: '1102', name: 'Bank - HDFC Current' },
    { code: '1201', name: 'Accounts Receivable' },
    { code: '2101', name: 'Accounts Payable' },
    { code: '4001', name: 'Sales Revenue' },
    { code: '5001', name: 'Purchase Expense' }
  ]);

  useEffect(() => {
    // Load initial data
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Here you would load accounts from the API
      // For now, we'll keep the default accounts
      // const accountsResponse = await accountsApi.getAll();
      // setAccounts(accountsResponse.data || []);
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load initial data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  // Calculate totals and check balance
  useEffect(() => {
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
    setIsBalanced(totalDebit === totalCredit && totalDebit > 0);
  }, [lines]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (isBalanced) {
              saveJournal();
            }
            break;
          case 'a':
            e.preventDefault();
            addLine();
            break;
        }
      }
      
      if (e.key === 'Escape') {
        if (onClose) {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isBalanced, onClose]);

  const updateLine = (lineId: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(line => 
      line.id === lineId ? { ...line, [field]: value } : line
    ));
  };

  const addLine = () => {
    const newLine: JournalLine = {
      id: Date.now().toString(),
      account_code: '',
      account_name: '',
      debit_amount: 0,
      credit_amount: 0,
      narration: ''
    };
    setLines(prev => [...prev, newLine]);
  };

  const removeLine = (lineId: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  const saveJournal = async () => {
    if (!isBalanced) {
      setError('Journal entries must be balanced before saving');
      return;
    }

    setSaving(true);
    try {
      setError(null);
      
      // Validate required fields
      for (const line of lines) {
        if (!line.account_code.trim()) {
          throw new Error('Account code is required for all lines');
        }
        if (!line.account_name.trim()) {
          throw new Error('Account name is required for all lines');
        }
        if (line.debit_amount === 0 && line.credit_amount === 0) {
          throw new Error('At least one amount (debit or credit) must be entered for each line');
        }
        if (line.debit_amount > 0 && line.credit_amount > 0) {
          throw new Error('A line cannot have both debit and credit amounts');
        }
      }
      
      // Here you would call the actual API to save the journal entry
      // For now, we'll just log it
      console.log('Saving journal entry:', { journalDate, narration, lines });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert('Journal entry saved successfully!');
      
      // Reset form after successful save
      setLines([
        { id: '1', account_code: '', account_name: '', debit_amount: 0, credit_amount: 0, narration: '' },
        { id: '2', account_code: '', account_name: '', debit_amount: 0, credit_amount: 0, narration: '' }
      ]);
      setNarration('');
      
    } catch (error) {
      console.error('Error saving journal entry:', error);
      setError(error instanceof Error ? error.message : 'Error saving journal entry');
    } finally {
      setSaving(false);
    }
  };

  const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Journal Entry"
          documentNumber={`JV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`}
          status={isBalanced ? 'Balanced' : 'Not Balanced'}
          icon={FileText}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="journal"
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "default",
              icon: refreshing ? Loader2 : RefreshCw,
              disabled: refreshing
            },
            {
              label: saving ? 'Saving...' : 'Post Entry',
              onClick: saveJournal,
              variant: 'primary',
              disabled: !isBalanced || saving
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Post Entry | <strong>Ctrl+A</strong> - Add Line | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            
            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-lg shadow-sm border border-green-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-green-600" />
                  <p className="text-gray-600">Loading journal entry form...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                <div className="text-center max-w-md mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            
            {/* Journal Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Date</label>
                  <input
                    type="date"
                    value={journalDate}
                    onChange={(e) => setJournalDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Reference</label>
                  <input
                    type="text"
                    placeholder="Optional reference"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-600 mb-2">Narration</label>
                <textarea
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Enter journal entry description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Journal Lines */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Journal Lines</h3>
                <button
                  onClick={addLine}
                  className="px-3 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Line
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Account</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Narration</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Debit</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Credit</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <select
                            value={line.account_code}
                            onChange={(e) => {
                              const account = accounts.find(acc => acc.code === e.target.value);
                              updateLine(line.id, 'account_code', e.target.value);
                              updateLine(line.id, 'account_name', account?.name || '');
                            }}
                            className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          >
                            <option value="">Select account...</option>
                            {accounts.map(account => (
                              <option key={account.code} value={account.code}>
                                {account.code} - {account.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={line.narration}
                            onChange={(e) => updateLine(line.id, 'narration', e.target.value)}
                            placeholder="Line description..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={line.debit_amount || ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              updateLine(line.id, 'debit_amount', value);
                              if (value > 0) updateLine(line.id, 'credit_amount', 0);
                            }}
                            placeholder="0.00"
                            step="0.01"
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={line.credit_amount || ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              updateLine(line.id, 'credit_amount', value);
                              if (value > 0) updateLine(line.id, 'debit_amount', 0);
                            }}
                            placeholder="0.00"
                            step="0.01"
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lines.length > 2 && (
                            <button
                              onClick={() => removeLine(line.id)}
                              className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Totals Row */}
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-4 py-3" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-gray-600" />
                          Total:
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">₹{totalDebit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{totalCredit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        {isBalanced ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 mx-auto" />
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance Check */}
            {!isBalanced && totalDebit !== totalCredit && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">Entry is not balanced</span>
                </div>
                <p className="text-sm text-red-600 mt-1">
                  Difference: ₹{Math.abs(totalDebit - totalCredit).toFixed(2)}
                  {totalDebit > totalCredit ? ' (Debit excess)' : ' (Credit excess)'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialJournalFlow;