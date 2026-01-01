import React, { useState, useEffect, useCallback, ChangeEvent, FC } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins, LucideIcon } from 'lucide-react';

// Imports from centralized types
import type {
    PaymentMethodType,
    PaymentStatus
} from '../../sales/invoice/types/invoiceTypes';

// ==================== TYPE DEFINITIONS ====================

interface Payment {
    id: string;
    method: PaymentMethodType;
    amount: number | '';
    reference: string;
}

interface PaymentMethodOption {
    value: PaymentMethodType;
    label: string;
    icon: LucideIcon;
    color: string;
}

interface SplitPaymentProps {
    totalAmount?: number;
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
    const [paymentAmount, setPaymentAmount] = useState<number | ''>(totalAmount);
    const [reference, setReference] = useState<string>('');
    const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
    const [splitPayments, setSplitPayments] = useState<Payment[]>([
        { id: '1', method: 'cash', amount: 0, reference: '' },
        { id: '2', method: 'upi', amount: 0, reference: '' }
    ]);

    // Payment method options
    const paymentMethods: PaymentMethodOption[] = [
        { value: 'cash', label: 'Cash', icon: Banknote, color: 'green' },
        { value: 'upi', label: 'UPI', icon: Smartphone, color: 'purple' },
        { value: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
        { value: 'bank', label: 'Bank Transfer', icon: Building2, color: 'indigo' },
        { value: 'check', label: 'Check', icon: FileText, color: 'gray' },
        { value: 'credit', label: 'Credit (Pay Later)', icon: AlertCircle, color: 'orange' }
    ];

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
            const totalPaid = splitPayments.reduce((sum, p) => sum + (typeof p.amount === 'number' ? p.amount : 0), 0);
            onPaymentStatusChange?.(
                totalPaid >= totalAmount ? 'paid' :
                    totalPaid > 0 ? 'partial' : 'pending'
            );
        } else {
            const actualAmount = selectedMethod === 'credit' ? 0 : (typeof paymentAmount === 'number' ? paymentAmount : 0);
            onChange([{
                id: '1',
                method: selectedMethod,
                amount: actualAmount,
                reference: reference
            }]);
            onPaymentStatusChange?.(
                selectedMethod === 'credit' ? 'pending' :
                    actualAmount >= totalAmount ? 'paid' :
                        actualAmount > 0 ? 'partial' : 'pending'
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
            setSplitPayments([
                { id: '1', method: 'cash', amount: 0, reference: '' },
                { id: '2', method: 'upi', amount: 0, reference: '' }
            ]);
        } else {
            setPaymentAmount(totalAmount);
            setReference('');
        }
    };

    const addSplitPayment = (): void => {
        const totalPaid = splitPayments.reduce((sum, p) => sum + (typeof p.amount === 'number' ? p.amount : 0), 0);
        const remaining = totalAmount - totalPaid;
        const newId = (splitPayments.length + 1).toString();
        setSplitPayments([...splitPayments, {
            id: newId,
            method: 'card',
            amount: remaining > 0 ? remaining : 0,
            reference: ''
        }]);
    };

    const updateSplitPayment = (id: string, field: keyof Payment, value: string | number): void => {
        setSplitPayments(splitPayments.map(p =>
            p.id === id ? {
                ...p,
                [field]: field === 'amount'
                    ? (value === '' ? '' : parseFloat(String(value)) || 0)
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
        ? splitPayments.reduce((sum, p) => sum + (p.amount === '' ? 0 : parseFloat(String(p.amount)) || 0), 0)
        : selectedMethod === 'credit' ? 0 : (typeof paymentAmount === 'number' ? paymentAmount : 0);
    const remaining = totalAmount - totalPaid;
    const isFullyPaid = totalPaid >= totalAmount;

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
                                        ₹{totalAmount.toFixed(2)} will be marked as unpaid
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
                                        onChange={(e) => setPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                        disabled={readOnly}
                                        className={`${inputClass} flex-1`}
                                        placeholder="0.00"
                                    />
                                    {(typeof paymentAmount === 'number' ? paymentAmount : 0) < totalAmount && (
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

                            {!isFullyPaid && remaining > 0 && (
                                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                    ₹{remaining.toFixed(2)} will go to credit
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
                    ) : totalPaid > 0 ? (
                        <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm">
                            Partial: ₹{totalPaid.toFixed(2)} paid, ₹{remaining.toFixed(2)} credit
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
                                            {paymentMethods.filter(m => m.value !== 'credit').map(method => (
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
                    ) : totalPaid > 0 ? (
                        <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium">
                            Partial: ₹{totalPaid.toFixed(2)} paid, ₹{remaining.toFixed(2)} credit
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
