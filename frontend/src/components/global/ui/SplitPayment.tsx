import React, { useState, useEffect, useCallback, ChangeEvent, FC } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins, LucideIcon } from 'lucide-react';

// Imports from centralized types
import type {
    PaymentMethodType,
    PaymentStatus
} from '../../sales/invoice/types/invoiceTypes';
import {
    addExactDecimals,
    compareExactDecimals,
    formatExactCurrency,
    normalizeExactDecimal,
    subtractExactDecimals,
    type EditableDecimalValue,
} from '../../../utils/exactDecimal';

// ==================== TYPE DEFINITIONS ====================

interface Payment {
    id: string;
    method: PaymentMethodType;
    amount: EditableDecimalValue | '';
    reference: string;
}

interface PaymentMethodOption {
    value: PaymentMethodType;
    label: string;
    icon: LucideIcon;
    color: string;
}

interface SplitPaymentProps {
    totalAmount?: EditableDecimalValue;
    payments?: Payment[];
    onChange?: (payments: Payment[]) => void;
    onPaymentStatusChange?: (status: PaymentStatus) => void;
    allowPartial?: boolean;
    className?: string;
    readOnly?: boolean;
    defaultPaymentMethod?: PaymentMethodType | null;
}

// ==================== COMPONENT ====================

const SplitPayment: FC<SplitPaymentProps> = ({
    totalAmount = 0,
    payments = [],
    onChange,
    onPaymentStatusChange,
    allowPartial = true,
    className = '',
    readOnly = false,
    defaultPaymentMethod = null
}) => {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('cash');
    const [paymentAmount, setPaymentAmount] = useState<EditableDecimalValue | ''>(totalAmount);
    const [reference, setReference] = useState<string>('');
    const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
    const [splitPayments, setSplitPayments] = useState<Payment[]>([
        { id: '1', method: 'cash', amount: 0, reference: '' },
        { id: '2', method: 'upi', amount: 0, reference: '' }
    ]);

    // Payment method options - Credit first for B2B focus (India runs on credit)
    const paymentMethods: PaymentMethodOption[] = [
        { value: 'credit', label: 'Credit (Pay Later)', icon: AlertCircle, color: 'orange' },
        { value: 'cash', label: 'Cash', icon: Banknote, color: 'green' },
        { value: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
        { value: 'upi', label: 'UPI', icon: Smartphone, color: 'purple' },
        { value: 'bank', label: 'Bank Transfer', icon: Building2, color: 'indigo' },
        { value: 'check', label: 'Check', icon: FileText, color: 'gray' }
    ];
    const moneyOptions = { scale: 2, maximumWholeDigits: 20 } as const;
    const validMoney = (value: EditableDecimalValue | '', label: string): string => {
        try {
            return normalizeExactDecimal(value === '' ? 0 : value, label, moneyOptions);
        } catch {
            return '0.00';
        }
    };

    // Initialize from props - only run once
    useEffect(() => {
        if (payments && payments.length > 0) {
            if (payments.length === 1) {
                setSelectedMethod(payments[0].method);
                setPaymentAmount(payments[0].amount);
                setReference(payments[0].reference || '');
                setIsSplitMode(false);
            } else {
                setIsSplitMode(true);
                setSplitPayments(payments);
            }
        } else if (defaultPaymentMethod) {
            setSelectedMethod(defaultPaymentMethod);
            if (defaultPaymentMethod !== 'credit') {
                setPaymentAmount(totalAmount);
            } else {
                setPaymentAmount(0);
            }
        }
    }, []); // Empty dependency array - only run on mount

    // Update parent when payment changes
    const updateParent = useCallback(() => {
        if (!onChange) return;

        if (isSplitMode) {
            onChange(splitPayments);
            const totalPaid = addExactDecimals(
                splitPayments.map((payment, index) => validMoney(payment.amount, `Split payment ${index + 1}`)),
                'Split payment total',
                moneyOptions,
            );
            onPaymentStatusChange?.(
                compareExactDecimals(totalPaid, totalAmount, 'Payment completion', moneyOptions) >= 0 ? 'paid' :
                    compareExactDecimals(totalPaid, '0.00', 'Payment received', moneyOptions) > 0 ? 'partial' : 'pending'
            );
        } else {
            const actualAmount = selectedMethod === 'credit' ? '0.00' : validMoney(paymentAmount, 'Payment amount');
            onChange([{
                id: '1',
                method: selectedMethod,
                amount: actualAmount,
                reference: reference
            }]);
            onPaymentStatusChange?.(
                selectedMethod === 'credit' ? 'pending' :
                    compareExactDecimals(actualAmount, totalAmount, 'Payment completion', moneyOptions) >= 0 ? 'paid' :
                        compareExactDecimals(actualAmount, '0.00', 'Payment received', moneyOptions) > 0 ? 'partial' : 'pending'
            );
        }
    }, [selectedMethod, paymentAmount, reference, isSplitMode, splitPayments, totalAmount, onChange, onPaymentStatusChange]);

    // Debounced update
    useEffect(() => {
        const timer = setTimeout(() => {
            updateParent();
        }, 300);
        return () => clearTimeout(timer);
    }, [updateParent]);

    const handleMethodChange = (e: ChangeEvent<HTMLSelectElement>): void => {
        const method = e.target.value as PaymentMethodType;
        setSelectedMethod(method);
        if (method === 'credit') {
            setPaymentAmount(0);
            setReference('');
        } else if (method !== selectedMethod) {
            setPaymentAmount(totalAmount);
            setReference('');
        }
    };

    const handleSplitToggle = (): void => {
        setIsSplitMode(!isSplitMode);
        if (!isSplitMode) {
            // Default to Credit (full amount) + Cash (0) - B2B friendly default
            // User can then adjust cash amount as needed
            setSplitPayments([
                { id: '1', method: 'credit', amount: totalAmount, reference: '' },
                { id: '2', method: 'cash', amount: 0, reference: '' }
            ]);
        } else {
            setPaymentAmount(totalAmount);
            setReference('');
        }
    };

    const addSplitPayment = (): void => {
        const totalPaid = addExactDecimals(splitPayments.map((payment, index) => validMoney(payment.amount, `Split payment ${index + 1}`)), 'Split payment total', moneyOptions);
        const remaining = subtractExactDecimals(totalAmount, totalPaid, 'Remaining payment', moneyOptions);
        const newId = (splitPayments.length + 1).toString();
        setSplitPayments([...splitPayments, {
            id: newId,
            method: 'card',
            amount: compareExactDecimals(remaining, '0.00', 'Remaining payment', moneyOptions) > 0 ? remaining : '0.00',
            reference: ''
        }]);
    };

    const updateSplitPayment = (id: string, field: keyof Payment, value: string | number): void => {
        setSplitPayments(splitPayments.map(p =>
            p.id === id ? {
                ...p,
                [field]: field === 'amount'
                    ? value
                    : value
            } : p
        ));
    };

    const removeSplitPayment = (id: string): void => {
        if (splitPayments.length > 2) {
            setSplitPayments(splitPayments.filter(p => p.id !== id));
        }
    };

    const totalPaid = isSplitMode
        ? addExactDecimals(splitPayments.map((payment, index) => validMoney(payment.amount, `Split payment ${index + 1}`)), 'Split payment total', moneyOptions)
        : selectedMethod === 'credit' ? '0.00' : validMoney(paymentAmount, 'Payment amount');
    const remaining = subtractExactDecimals(totalAmount, totalPaid, 'Remaining payment', moneyOptions);
    const isFullyPaid = compareExactDecimals(totalPaid, totalAmount, 'Payment completion', moneyOptions) >= 0;

    const getPaymentIcon = (method: PaymentMethodType): LucideIcon => {
        const methodInfo = paymentMethods.find(m => m.value === method);
        return methodInfo ? methodInfo.icon : Banknote;
    };

    const getReferenceLabel = (method: PaymentMethodType): string => {
        switch (method) {
            case 'upi': return 'UPI ID';
            case 'card': return 'Last 4';
            case 'bank': return 'Ref#';
            case 'check': return 'Check#';
            default: return 'Ref';
        }
    };

    const getReferencePlaceholder = (method: PaymentMethodType): string => {
        switch (method) {
            case 'upi': return '412345678900';
            case 'card': return '1234';
            case 'bank': return 'NEFT/RTGS';
            case 'check': return '123456';
            default: return 'Reference';
        }
    };

    const inputClass = "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
    const selectClass = "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white";

    return (
        <div className={`${className}`}>
            {/* Header with Split Payment Toggle */}
            <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-gray-700">Payment Method</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSplitToggle}
                        disabled={readOnly}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isSplitMode
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                            : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                            }`}
                    >
                        <Coins className="w-4 h-4" />
                        <span>Split Payment</span>
                        {isSplitMode && <Check className="w-3.5 h-3.5 ml-1" />}
                    </button>

                    {isSplitMode && splitPayments.length < 5 && (
                        <button
                            onClick={addSplitPayment}
                            disabled={readOnly}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Payment</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Main Payment Interface */}
            {!isSplitMode ? (
                <div className="space-y-3">
                    {selectedMethod === 'credit' ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                                <div>
                                    <span className="text-sm font-medium text-amber-900">Full Credit Sale</span>
                                    <div className="text-xs text-amber-700 mt-0.5">
                                        {formatExactCurrency(totalAmount, 'Payment total')} will be marked as unpaid
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <select
                                        value={selectedMethod}
                                        onChange={handleMethodChange}
                                        disabled={readOnly}
                                        className={`${selectClass} w-full`}
                                    >
                                        {paymentMethods.map(method => (
                                            <option key={method.value} value={method.value}>
                                                {method.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-sm">₹</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={paymentAmount === 0 ? '' : paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        disabled={readOnly}
                                        className={`${inputClass} flex-1`}
                                        placeholder="0.00"
                                    />
                                    {compareExactDecimals(validMoney(paymentAmount, 'Payment amount'), totalAmount, 'Payment amount remaining', moneyOptions) < 0 && (
                                        <button
                                            onClick={() => setPaymentAmount(totalAmount)}
                                            disabled={readOnly}
                                            className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 whitespace-nowrap"
                                        >
                                            Full
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        disabled={readOnly}
                                        className={`${inputClass} w-full`}
                                        placeholder={`${getReferenceLabel(selectedMethod)}: ${getReferencePlaceholder(selectedMethod)}`}
                                    />
                                </div>
                            </div>

                            {!isFullyPaid && compareExactDecimals(remaining, '0.00', 'Remaining payment', moneyOptions) > 0 && (
                                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                    {formatExactCurrency(remaining, 'Remaining payment')} will go to credit
                                </div>
                            )}
                        </div>
                    )}

                    {/* Payment Status Badge */}
                    {selectedMethod === 'credit' ? (
                        <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium">
                            Credit Sale - Payment pending
                        </div>
                    ) : isFullyPaid ? (
                        <div className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Paid in full
                        </div>
                    ) : compareExactDecimals(totalPaid, '0.00', 'Payment received', moneyOptions) > 0 ? (
                        <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm">
                            Partial: {formatExactCurrency(totalPaid, 'Payment received')} paid, {formatExactCurrency(remaining, 'Remaining payment')} credit
                        </div>
                    ) : (
                        <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm">
                            No payment received - Full credit
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {splitPayments.map((payment) => {
                        const Icon = getPaymentIcon(payment.method);

                        return (
                            <div key={payment.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />

                                <div className="grid grid-cols-3 gap-3 flex-1">
                                    <div>
                                        <select
                                            value={payment.method}
                                            onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                                            disabled={readOnly}
                                            className={`${selectClass} w-full`}
                                        >
                                            {/* All payment methods available in split mode */}
                                            {paymentMethods.map(method => (
                                                <option key={method.value} value={method.value}>{method.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500 text-sm">₹</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={payment.amount === '' ? '' : payment.amount}
                                            onChange={(e) => updateSplitPayment(payment.id, 'amount', e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            disabled={readOnly}
                                            placeholder="0.00"
                                            className={`${inputClass} flex-1`}
                                        />
                                    </div>

                                    <div>
                                        <input
                                            type="text"
                                            value={payment.reference}
                                            onChange={(e) => updateSplitPayment(payment.id, 'reference', e.target.value)}
                                            disabled={readOnly}
                                            placeholder={`${getReferenceLabel(payment.method)}`}
                                            className={`${inputClass} w-full`}
                                        />
                                    </div>
                                </div>

                                {splitPayments.length > 2 && (
                                    <button
                                        onClick={() => removeSplitPayment(payment.id)}
                                        disabled={readOnly}
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex-shrink-0"
                                        title="Remove"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Status Badge */}
                    {isFullyPaid ? (
                        <div className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Paid in full
                        </div>
                    ) : compareExactDecimals(totalPaid, '0.00', 'Payment received', moneyOptions) > 0 ? (
                        <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium">
                            Partial: {formatExactCurrency(totalPaid, 'Payment received')} paid, {formatExactCurrency(remaining, 'Remaining payment')} credit
                        </div>
                    ) : (
                        <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm">
                            No payment received - Full credit
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SplitPayment;
