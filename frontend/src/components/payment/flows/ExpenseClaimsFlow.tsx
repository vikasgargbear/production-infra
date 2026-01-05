import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Calendar, X, Loader2, RefreshCw, AlertCircle, User } from 'lucide-react';
import { ModuleHeader } from '../../global';
import { expensesApi } from '../../../services/api';


interface ExpenseClaimsFlowProps {
  onClose?: () => void;
}

interface ExpenseLine {
  id: string;
  expense_type: string;
  description: string;
  amount: number;
  date: string;
  receipt_attached: boolean;
}

const ExpenseClaimsFlow: React.FC<ExpenseClaimsFlowProps> = ({ onClose }) => {
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [employeeName, setEmployeeName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expenses, setExpenses] = useState<ExpenseLine[]>([
    { id: '1', expense_type: '', description: '', amount: 0, date: new Date().toISOString().split('T')[0], receipt_attached: false }
  ]);
  const [saving, setSaving] = useState(false);

  // API data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Expense types loaded from API
  const [expenseTypes, setExpenseTypes] = useState<{ code: string, name: string }[]>([]);

  useEffect(() => {
    // Load any initial data if needed
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load expense types from API
      const expenseTypesResponse = await expensesApi.getExpenseTypes();
      setExpenseTypes(expenseTypesResponse.expense_types || []);

      // Set default employee name (in real app, get from auth context)
      setEmployeeName('Current User');

    } catch (error) {
      setError('Failed to load expense types');
      // Fallback expense types
      setExpenseTypes([
        { code: 'TRAVEL', name: 'Travel' },
        { code: 'ACCOMMODATION', name: 'Accommodation' },
        { code: 'MEALS', name: 'Meals' },
        { code: 'OFFICE_SUPPLIES', name: 'Office Supplies' },
        { code: 'COMMUNICATION', name: 'Communication' },
        { code: 'MEDICAL', name: 'Medical' },
        { code: 'TRAINING', name: 'Training' },
        { code: 'OTHER', name: 'Other' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  const addExpenseLine = () => {
    const newExpense: ExpenseLine = {
      id: Date.now().toString(),
      expense_type: '',
      description: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      receipt_attached: false
    };
    setExpenses(prev => [...prev, newExpense]);
  };

  const updateExpense = (id: string, field: keyof ExpenseLine, value: any) => {
    setExpenses(prev => prev.map(exp =>
      exp.id === id ? { ...exp, [field]: value } : exp
    ));
  };

  const removeExpense = (id: string) => {
    if (expenses.length <= 1) return;
    setExpenses(prev => prev.filter(exp => exp.id !== id));
  };

  const saveExpenseClaim = async () => {
    setSaving(true);
    try {
      setError(null);

      // Validate required fields
      if (!employeeName.trim()) {
        throw new Error('Employee name is required');
      }

      if (expenses.length === 0) {
        throw new Error('At least one expense line is required');
      }

      // Validate expense lines
      for (const expense of expenses) {
        if (!expense.expense_type.trim()) {
          throw new Error('Expense type is required for all lines');
        }
        if (!expense.description.trim()) {
          throw new Error('Description is required for all lines');
        }
        if (expense.amount <= 0) {
          throw new Error('Amount must be greater than 0 for all lines');
        }
      }

      // Prepare expense claim data for API
      const claimData = {
        employee_name: employeeName,
        claim_date: claimDate,
        purpose: purpose,
        expenses: expenses.map(expense => ({
          expense_type: expense.expense_type,
          description: expense.description,
          amount: expense.amount,
          expense_date: expense.date,
          receipt_attached: expense.receipt_attached
        }))
      };

      // Call the actual API to save the expense claim
      const response = await expensesApi.create(claimData);

      alert(`Expense claim saved successfully! Claim Number: ${response.data?.claim_number}`);

      // Reset form after successful save
      setExpenses([{ id: '1', expense_type: '', description: '', amount: 0, date: new Date().toISOString().split('T')[0], receipt_attached: false }]);
      setPurpose('');

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error saving expense claim');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Expense Claims"
          documentNumber={`EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`}
          status={`Total: ₹${totalAmount.toFixed(2)}`}
          icon={Receipt}
          iconColor="text-orange-600"
          onClose={onClose}
          historyType="expense"
          onSaveDraft={() => { }}
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "primary",
              icon: refreshing ? Loader2 : RefreshCw,
              disabled: refreshing
            },
            {
              label: saving ? 'Saving...' : 'Submit Claim',
              onClick: saveExpenseClaim,
              variant: 'primary',
              disabled: !employeeName || expenses.length === 0 || saving
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Submit Claim | <strong>Ctrl+A</strong> - Add Expense | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-lg shadow-sm border border-green-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-green-600" />
                  <p className="text-gray-600">Loading expense claim form...</p>
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

            {/* Claim Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2 text-blue-600" />
                Claim Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Employee Name</label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Enter employee name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Claim Date</label>
                  <input
                    type="date"
                    value={claimDate}
                    onChange={(e) => setClaimDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Total Amount</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900">
                    ₹{totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-600 mb-2">Purpose</label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Enter purpose of expenses..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            {/* Expense Lines */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Expense Items</h3>
                <button
                  onClick={addExpenseLine}
                  className="px-3 py-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Expense
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Description</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Amount</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Receipt</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <select
                            value={expense.expense_type}
                            onChange={(e) => updateExpense(expense.id, 'expense_type', e.target.value)}
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                          >
                            <option value="">Select type...</option>
                            {expenseTypes.map(type => (
                              <option key={type.code} value={type.code}>{type.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={expense.description}
                            onChange={(e) => updateExpense(expense.id, 'description', e.target.value)}
                            placeholder="Expense description..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={expense.date}
                            onChange={(e) => updateExpense(expense.id, 'date', e.target.value)}
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={expense.amount || ''}
                            onChange={(e) => updateExpense(expense.id, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            step="0.01"
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-right text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={expense.receipt_attached}
                            onChange={(e) => updateExpense(expense.id, 'receipt_attached', e.target.checked)}
                            className="w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {expenses.length > 1 && (
                            <button
                              onClick={() => removeExpense(expense.id)}
                              className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
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

export default ExpenseClaimsFlow;