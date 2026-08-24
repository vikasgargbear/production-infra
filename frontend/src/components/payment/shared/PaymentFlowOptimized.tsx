import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';
import { CustomerSearch } from '../../global';
import { bankAccountsApi } from '../../../services/api';
import { localBusinessDate } from '../../../contexts/PaymentContext';

interface SplitPayment {
  type: string;
  amount: string;
  reference?: string;
}

interface CanonicalBankAccount {
  id: string;
  bank_account_id: string;
  settlement_account_id: string;
  account_name: string;
  bank_name: string;
  is_active: boolean;
  is_payment_account: boolean;
  allows_bank_reconciliation: boolean;
  currency_code: string;
}

const PaymentFlowOptimized: React.FC = () => {
  const {
    payment,
    selectedCustomer,
    setCustomer,
    setPaymentField,
    errors,
    clearError,
    setError
  } = usePayment();

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([
    { type: 'CASH', amount: '' },
    { type: 'UPI', amount: '' }
  ]);
  const [bankAccounts, setBankAccounts] = useState<CanonicalBankAccount[]>([]);
  const [bankAccountsError, setBankAccountsError] = useState('');

  const amountRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<any>(null);

  // Auto-focus amount when customer is selected
  useEffect(() => {
    if (selectedCustomer && amountRef.current) {
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 100);
    }
  }, [selectedCustomer]);

  // Auto-focus customer search on mount
  useEffect(() => {
    if (!selectedCustomer) {
      customerSearchRef.current?.focus();
    }
  }, [selectedCustomer]);

  useEffect(() => {
    let active = true;
    bankAccountsApi.getActive()
      .then(response => {
        if (!active) return;
        const accounts = Array.isArray(response.data) ? response.data.filter(account => (
          account?.is_active !== false
          && account?.is_payment_account === true
          && account?.allows_bank_reconciliation === true
          && account?.currency_code === 'INR'
          && account?.bank_account_id
          && account?.settlement_account_id
        )) : [];
        setBankAccounts(accounts);
        setBankAccountsError(accounts.length ? '' : 'No canonical bank settlement account is available.');
        if (accounts.length === 1) {
          setPaymentField('bank_account_id', accounts[0].bank_account_id);
          setPaymentField('settlement_account_id', accounts[0].settlement_account_id);
        }
      })
      .catch(() => {
        if (!active) return;
        setBankAccounts([]);
        setBankAccountsError('Unable to load canonical bank settlement accounts. Receipt posting is unavailable.');
      });
    return () => { active = false; };
    // The context action is intentionally read once; including its render-local
    // function identity would refetch after every field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = (field: string, value: string): void => {
    setPaymentField(field, value);
    if (errors[field]) {
      clearError(field);
    }

    if (field === 'amount') {
      const amount = parseFloat(value);
      if (value && (isNaN(amount) || amount <= 0)) {
        setError(field, 'Enter valid amount');
      }
    }
  };

  const handleCustomerSelect = (customer: any) => {
    setCustomer(customer);
    // Trigger the parent's handleCustomerSelect to fetch invoices
    window.dispatchEvent(new CustomEvent('customerSelected', { detail: customer }));
  };

  // Payment modes including split
  const paymentModes = [
    { value: 'CASH', label: 'Cash', icon: '💵', unavailable: true },
    { value: 'UPI', label: 'UPI', icon: '📱' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄', unavailable: true },
    { value: 'SPLIT', label: 'Split', icon: '➗', unavailable: true }
  ];

  const needsReference = ['UPI', 'CARD', 'BANK_TRANSFER'].includes(payment.payment_mode);

  const handlePaymentModeSelect = (mode: string) => {
    if (mode === 'SPLIT') {
      setShowSplitModal(true);
      setPaymentField('payment_mode', 'SPLIT');
    } else {
      setPaymentField('payment_mode', mode);
      setShowSplitModal(false);
    }
  };

  const updateSplitPayment = (index: number, field: string, value: string) => {
    const updated = [...splitPayments];
    updated[index] = { ...updated[index], [field]: value };
    setSplitPayments(updated);

    // Update payment field with split details
    setPaymentField('split_payments', JSON.stringify(updated));
  };

  const totalSplitAmount = splitPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  return (
    <div className="space-y-4">
      {/* Customer Selection - Standard Pattern */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">CUSTOMER</h3>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openCustomerModal'))}
            className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Customer
          </button>
        </div>
        {/* White card wrapper - consistent with other flows */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <CustomerSearch
            ref={customerSearchRef}
            value={selectedCustomer as any}
            onChange={handleCustomerSelect as any}
            displayMode="compact"
            placeholder="Search customer by name, phone, or code..."
            showCreateButton={false}
            clearable={true}
            autoFocus={!selectedCustomer}
          />
        </div>
      </div>

      {/* Payment Details - Only show after customer selection */}
      {selectedCustomer && (
        <div className="space-y-4">
          {/* Date and Type - First */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={payment.payment_date || localBusinessDate()}
                  onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <select
                value={payment.payment_type || 'order_payment'}
                onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="order_payment">Order Payment</option>
                <option value="advance" disabled>Advance (canonical posting unavailable)</option>
                <option value="adjustment" disabled>Adjustment (canonical posting unavailable)</option>
              </select>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">PAYMENT AMOUNT</h3>
            <Card className="p-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-green-600 font-bold">₹</span>
                <input
                  ref={amountRef}
                  type="number"
                  value={payment.amount}
                  onChange={(e) => handleFieldChange('amount', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={`w-full pl-10 pr-3 py-2.5 text-xl font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                  placeholder="0"
                  min="0.01"
                  step="0.01"
                />
              </div>
              {errors.amount && (
                <p className="text-sm text-red-500 mt-2">{errors.amount}</p>
              )}
            </Card>
          </div>

          {/* Payment Mode Selection */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">PAYMENT METHOD</h3>
            <div className="grid grid-cols-6 gap-2">
              {paymentModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  disabled={mode.unavailable}
                  aria-disabled={mode.unavailable}
                  title={mode.unavailable ? `${mode.label} receipt posting is not available in the canonical API` : undefined}
                  onClick={() => handlePaymentModeSelect(mode.value)}
                  className={`p-2.5 rounded-lg border transition-all disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-50 ${payment.payment_mode === mode.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                >
                  <div className="text-lg">{mode.icon}</div>
                  <div className="text-xs font-medium text-gray-600 mt-1">{mode.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Canonical settlement identity */}
          <div className="space-y-2">
            <label htmlFor="receipt-bank-account" className="block text-sm font-medium text-gray-700">
              Settlement bank account <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <select
              id="receipt-bank-account"
              value={payment.bank_account_id}
              onChange={(event) => {
                const account = bankAccounts.find(candidate => candidate.bank_account_id === event.target.value);
                setPaymentField('bank_account_id', account?.bank_account_id || '');
                setPaymentField('settlement_account_id', account?.settlement_account_id || '');
              }}
              className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select bank settlement account</option>
              {bankAccounts.map(account => (
                <option key={account.bank_account_id} value={account.bank_account_id}>
                  {account.bank_name} — {account.account_name}
                </option>
              ))}
            </select>
            {bankAccountsError && <p role="alert" className="text-sm text-red-700">{bankAccountsError}</p>}
          </div>

          {/* Reference Number */}
          {needsReference && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                {payment.payment_mode === 'UPI' ? 'UPI Transaction ID' : 'Reference Number'}
                {' '}<span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                type="text"
                value={payment.reference_number || ''}
                onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="Enter bank, UPI, or gateway reference"
              />
            </div>
          )}
        </div>
      )}

      {/* Split Payment Details - Compact but user-friendly */}
      {selectedCustomer && showSplitModal && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">SPLIT PAYMENT DETAILS</h3>
          <Card className="p-3">
            <div className="space-y-2">
              {splitPayments.map((split, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={split.type}
                    onChange={(e) => updateSplitPayment(index, 'type', e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CASH">💵 Cash</option>
                    <option value="UPI">📱 UPI</option>
                    <option value="CARD">💳 Card</option>
                    <option value="BANK_TRANSFER">🏦 Bank</option>
                  </select>
                  <div className="relative flex-1 max-w-[150px]">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-600 font-semibold">₹</span>
                    <input
                      type="number"
                      value={split.amount}
                      onChange={(e) => updateSplitPayment(index, 'amount', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="Amount"
                      className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {['UPI', 'BANK_TRANSFER'].includes(split.type) && (
                    <input
                      type="text"
                      value={split.reference || ''}
                      onChange={(e) => updateSplitPayment(index, 'reference', e.target.value)}
                      placeholder="Reference (optional)"
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  {splitPayments.length > 1 && (
                    <button
                      onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== index))}
                      className="text-red-500 hover:text-red-700 px-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={() => setSplitPayments([...splitPayments, { type: 'CASH', amount: '' }])}
                className="text-sm text-blue-600 hover:text-blue-700 mt-2"
              >
                + Add another payment method
              </button>

              {totalSplitAmount !== parseFloat(payment.amount || '0') && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded mt-2">
                  Split total (₹{totalSplitAmount}) must equal payment amount (₹{payment.amount || '0'})
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PaymentFlowOptimized;
