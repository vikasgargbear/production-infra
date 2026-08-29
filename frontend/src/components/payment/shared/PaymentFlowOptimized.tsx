import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Loader2, Upload } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';
import { CustomerSearch } from '../../global';
import { moneyToCents } from '../entry/customerReceiptCommand';
import {
  getCustomerReceiptContext,
  uploadCustomerReceiptEvidence,
  type CustomerReceiptContext,
} from '../../../services/api/modules/finance/customerReceipts.api';
import { usePermissions } from '../../../hooks/usePermissions';
import { FOUNDATION_CAPABILITIES } from '../../../config/canonicalCapabilities';

type CanonicalBankAccount = CustomerReceiptContext['settlement_accounts'][number];

const PaymentFlowOptimized: React.FC = () => {
  const { hasCapability } = usePermissions();
  const canManageCustomers = hasCapability(FOUNDATION_CAPABILITIES.customer);
  const {
    payment,
    selectedCustomer,
    setCustomer,
    setPaymentField,
    errors,
    outstandingInvoices,
    clearError,
    setError
  } = usePayment();

  const [bankAccounts, setBankAccounts] = useState<CanonicalBankAccount[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CustomerReceiptContext['payment_methods']>([]);
  const [bankAccountsError, setBankAccountsError] = useState('');
  const [receiptContext, setReceiptContext] = useState<CustomerReceiptContext | null>(null);
  const [sourcesError, setSourcesError] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<any>(null);
  const paymentMethodRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const receiptPurposeRef = useRef<HTMLSelectElement>(null);

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
    getCustomerReceiptContext()
      .then(response => {
        if (!active) return;
        const accounts = response.data.settlement_accounts;
        setBankAccounts(accounts);
        setPaymentMethods(response.data.payment_methods);
        setReceiptContext(response.data);
        setPaymentField('payment_date', response.data.business_date);
        setPaymentField('business_date', response.data.business_date);
        setBankAccountsError(accounts.length ? '' : 'No canonical bank settlement account is available.');
      })
      .catch(() => {
        if (!active) return;
        setBankAccounts([]);
        setPaymentMethods([]);
        setReceiptContext(null);
        setPaymentField('payment_date', '');
        setPaymentField('business_date', '');
        setBankAccountsError('Unable to load the canonical receipt context. Receipt posting is unavailable.');
      });
    return () => { active = false; };
    // The context action is intentionally read once; including its render-local
    // function identity would refetch after every field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomer?.customer_id) return;
    let active = true;
    setSourcesError('');
    getCustomerReceiptContext(selectedCustomer.customer_id)
      .then(response => {
        if (!active) return;
        setReceiptContext(response.data);
      })
      .catch(() => {
        if (!active) return;
        setReceiptContext(current => current ? {
          ...current,
          approved_goods_orders: [],
        } : null);
        setSourcesError('Unable to load verified receipt evidence or approved goods orders.');
      });
    return () => { active = false; };
  }, [selectedCustomer?.customer_id]);

  const handleFieldChange = (field: string, value: string): void => {
    setPaymentField(field, value);
    if (errors[field]) {
      clearError(field);
    }

    if (field === 'amount') {
      let valid = false;
      try { valid = moneyToCents(value) > 0n; } catch { valid = false; }
      if (value && !valid) {
        setError(field, 'Enter valid amount');
      }
    }
  };

  const handleCustomerSelect = (customer: any) => {
    setCustomer(customer);
    // Trigger the parent's handleCustomerSelect to fetch invoices
    window.dispatchEvent(new CustomEvent('customerSelected', { detail: customer }));
  };

  const settlementBranches = new Set(
    payment.allocations.map(allocation => (
      outstandingInvoices.find(invoice => invoice.invoice_id === allocation.invoice_id)?.branch_id
    )).filter(Boolean),
  );
  const derivedBranchId = payment.receipt_purpose === 'customer_advance'
    ? payment.branch_id
    : settlementBranches.size === 1 ? [...settlementBranches][0] : '';
  const evidenceChoices = (receiptContext?.evidence ?? []).filter(
    evidence => !derivedBranchId || evidence.branch_id === derivedBranchId,
  );

  const refreshSources = async (): Promise<void> => {
    if (!selectedCustomer?.customer_id) return;
    const response = await getCustomerReceiptContext(selectedCustomer.customer_id);
    setReceiptContext(response.data);
  };

  const handleEvidenceUpload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      setUploadingEvidence(true);
      setSourcesError('');
      const uploaded = await uploadCustomerReceiptEvidence(
        derivedBranchId, payment.payment_date, file,
      );
      await refreshSources();
      setPaymentField('evidence_attachment_id', uploaded.data.attachment_id);
      setPaymentField('evidence_label', uploaded.data.original_filename);
    } catch (error) {
      setSourcesError(error instanceof Error ? error.message : 'Receipt evidence upload failed.');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const needsReference = Boolean(payment.payment_mode);

  const handlePaymentModeSelect = (mode: string) => {
    setPaymentField('payment_mode', mode);
  };

  const handlePaymentMethodKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    method: string,
    index: number,
  ): void => {
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = (index + offset + paymentMethods.length) % paymentMethods.length;
      paymentMethodRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      handlePaymentModeSelect(method);
      setTimeout(() => receiptPurposeRef.current?.focus(), 0);
    }
  };

  return (
    <div className="space-y-4">
      {/* Customer Selection - Standard Pattern */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">CUSTOMER</h3>
          {canManageCustomers && <button
            onClick={() => window.dispatchEvent(new CustomEvent('openCustomerModal'))}
            className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Customer
          </button>}
        </div>
        <p className="text-sm text-gray-600">
          Required: select a customer, positive receipt amount, payment method, settlement account, reference, and allocation.
        </p>
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
          {/* Business date */}
          <div className="max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={payment.payment_date}
                  max={payment.business_date || undefined}
                  onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
            <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
              {paymentMethods.map((method, methodIndex) => {
                const label = method === 'bank_transfer'
                  ? 'Bank Transfer'
                  : method.charAt(0).toUpperCase() + method.slice(1);
                return (
                <button
                  ref={element => { paymentMethodRefs.current[methodIndex] = element; }}
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={payment.payment_mode === method}
                  data-enter-tab
                  onClick={() => handlePaymentModeSelect(method)}
                  onKeyDownCapture={(event) => handlePaymentMethodKey(event, method, methodIndex)}
                  className={`min-h-11 p-2.5 rounded-lg border transition-all ${payment.payment_mode === method
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                >
                  <div className="text-xs font-medium text-gray-700">{label}</div>
                </button>
              );})}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Receipt purpose
              <select ref={receiptPurposeRef} value={payment.receipt_purpose} onChange={(event) => {
                handleFieldChange('receipt_purpose', event.target.value);
                setPaymentField('allocation_method', event.target.value === 'customer_advance' ? 'advance' : 'manual');
                setPaymentField('branch_id', '');
                setPaymentField('sales_order_id', '');
                setPaymentField('sales_order_label', '');
                setPaymentField('evidence_attachment_id', '');
                setPaymentField('evidence_label', '');
                setPaymentField('allocations', []);
              }} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                <option value="invoice_settlement">Invoice settlement</option>
                <option value="customer_advance">Goods-order customer advance</option>
              </select>
            </label>
          </div>

          {payment.receipt_purpose === 'customer_advance' && <div className="space-y-2">
            <label htmlFor="customer-advance-order" className="text-sm font-medium text-gray-700">Approved goods order</label>
            <select id="customer-advance-order" value={payment.sales_order_id} onChange={(event) => {
              const order = receiptContext?.approved_goods_orders.find(candidate => candidate.sales_order_id === event.target.value);
              setPaymentField('sales_order_id', order?.sales_order_id || '');
              setPaymentField('sales_order_label', order ? `${order.order_number} · ${order.branch_name}` : '');
              setPaymentField('branch_id', order?.branch_id || '');
              setPaymentField('evidence_attachment_id', '');
              setPaymentField('evidence_label', '');
            }} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
              <option value="">Select approved order for this customer</option>
              {(receiptContext?.approved_goods_orders ?? []).map(order => (
                <option key={order.sales_order_id} value={order.sales_order_id}>
                  {order.order_number} · {order.order_date} · {order.branch_name} · ₹{order.remaining_advance_amount} available
                </option>
              ))}
            </select>
            {receiptContext && receiptContext.approved_goods_orders.length === 0 && (
              <p className="text-sm text-amber-700">No approved goods order with an available advance balance was found for this customer.</p>
            )}
          </div>}

          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Verified receipt evidence</h3>
              <p className="mt-1 text-sm text-gray-600">
                {derivedBranchId
                  ? 'Choose existing verified evidence or upload one PDF for the selected branch.'
                  : payment.receipt_purpose === 'customer_advance'
                    ? 'Select an approved goods order first.'
                    : 'Allocate the receipt to an outstanding invoice first; its branch is used automatically.'}
              </p>
            </div>
            <select aria-label="Verified receipt evidence" disabled={!derivedBranchId}
              value={payment.evidence_attachment_id} onChange={(event) => {
                const evidence = evidenceChoices.find(candidate => candidate.attachment_id === event.target.value);
                setPaymentField('evidence_attachment_id', evidence?.attachment_id || '');
                setPaymentField('evidence_label', evidence ? `${evidence.original_filename} · ${evidence.document_date}` : '');
              }} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 disabled:bg-gray-100">
              <option value="">Select verified receipt evidence</option>
              {evidenceChoices.map(evidence => (
                <option key={evidence.attachment_id} value={evidence.attachment_id}>
                  {evidence.original_filename} · {evidence.document_date} · {evidence.branch_name}
                </option>
              ))}
            </select>
            <label className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium ${derivedBranchId ? 'cursor-pointer border-blue-300 text-blue-700 hover:bg-blue-50' : 'cursor-not-allowed border-gray-200 text-gray-400'}`}>
              {uploadingEvidence ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingEvidence ? 'Verifying PDF…' : 'Upload receipt PDF'}
              <input type="file" accept="application/pdf,.pdf" className="sr-only"
                disabled={!derivedBranchId || uploadingEvidence}
                onChange={(event) => {
                  void handleEvidenceUpload(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }} />
            </label>
            {sourcesError && <p role="alert" className="text-sm text-red-700">{sourcesError}</p>}
          </div>

          {/* Canonical settlement identity */}
          {!['cash', 'cheque'].includes(payment.payment_mode) && <div className="space-y-2">
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
                  {account.bank_name} — {account.settlement_account_name}
                </option>
              ))}
            </select>
            {bankAccountsError && <p role="alert" className="text-sm text-red-700">{bankAccountsError}</p>}
          </div>}

          {payment.payment_mode === 'cheque' && <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Instrument number
              <input value={payment.instrument_number} onChange={(event) => handleFieldChange('instrument_number', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" />
            </label>
            <label className="text-sm font-medium text-gray-700">Instrument date
              <input type="date" value={payment.instrument_date} onChange={(event) => handleFieldChange('instrument_date', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" />
            </label>
            <label className="text-sm font-medium text-gray-700">Drawee bank
              <input value={payment.drawee_bank_name} onChange={(event) => handleFieldChange('drawee_bank_name', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={payment.account_payee_confirmed} onChange={(event) => setPaymentField('account_payee_confirmed', event.target.checked)} />Account-payee confirmed
            </label>
          </div>}

          {/* Reference Number */}
          {needsReference && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                {payment.payment_mode === 'upi' ? 'UPI Transaction ID' : 'Reference Number'}
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

    </div>
  );
};

export default PaymentFlowOptimized;
