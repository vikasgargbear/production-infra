import React from 'react';
import { CreditCard, Banknote, Smartphone, Building2, FileText, LucideIcon } from 'lucide-react';

// Import centralized types - single source of truth
import type { PaymentMethodType, BankAccount } from '../../sales/invoice/types/invoiceTypes';

// ==================== COMPONENT TYPES ====================

/** Payment entry for display */
interface PaymentEntry {
    method: PaymentMethodType;
    amount: string | number;
    reference?: string;
}

interface PaymentConfig {
    icon: LucideIcon;
    color: string;
    label: string;
}

export interface CompactPaymentMethodProps {
    payments?: PaymentEntry[];
    totalAmount?: number;
    className?: string;
    showDetails?: boolean;
    bankAccount?: BankAccount | null;
}

export interface PaymentBadgeProps {
    payments?: PaymentEntry[];
    totalAmount?: number;
}

// ==================== COMPONENT ====================

/**
 * CompactPaymentMethod Component
 * A compact, space-efficient payment display component
 * Shows payment breakdown in a clean grid layout
 */
const CompactPaymentMethod: React.FC<CompactPaymentMethodProps> = ({
    payments = [],
    totalAmount = 0,
    className = '',
    showDetails = false,
    bankAccount = null
}) => {
    const paymentConfig: Record<PaymentMethodType, PaymentConfig> = {
        cash: { icon: Banknote, color: 'green', label: 'Cash' },
        card: { icon: CreditCard, color: 'blue', label: 'Card' },
        upi: { icon: Smartphone, color: 'purple', label: 'UPI' },
        bank: { icon: Building2, color: 'indigo', label: 'Bank' },
        check: { icon: FileText, color: 'gray', label: 'Cheque' },
        credit: { icon: FileText, color: 'orange', label: 'Credit' },
        online: { icon: Smartphone, color: 'teal', label: 'Online' },
        advance: { icon: Banknote, color: 'emerald', label: 'Advance' }
    };

    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);
    const creditAmount = totalAmount - totalPaid;
    const isFullyPaid = Math.abs(creditAmount) < 0.01;
    const hasPayments = payments.length > 0 && totalPaid > 0;

    const getPaymentStyle = (method: PaymentMethodType): PaymentConfig => {
        return paymentConfig[method] || paymentConfig.cash;
    };

    if (!hasPayments) {
        return (
            <div className={`bg-orange-50 border border-orange-200 rounded-lg p-3 ${className}`}>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-orange-800">Full Credit</span>
                    <span className="text-lg font-bold text-orange-900">₹{totalAmount.toFixed(2)}</span>
                </div>
                {bankAccount && (
                    <p className="text-xs text-gray-600 mt-2">
                        Bank: {bankAccount.bank_name} • A/C: {bankAccount.account_number}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
            {/* Compact header */}
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment Summary</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isFullyPaid
                        ? 'bg-green-100 text-green-800'
                        : creditAmount > 0
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                        {isFullyPaid ? 'Paid' : creditAmount > 0 ? 'Partial' : 'Overpaid'}
                    </span>
                </div>
            </div>

            {/* Payment breakdown */}
            <div className="p-3 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Invoice Total</span>
                    <span className="text-sm font-semibold text-gray-900">₹{totalAmount.toFixed(2)}</span>
                </div>

                {payments.map((payment, index) => {
                    const style = getPaymentStyle(payment.method);
                    const Icon = style.icon;

                    return (
                        <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Icon className={`w-4 h-4 text-${style.color}-600`} />
                                <span className="text-sm text-gray-700">{style.label}</span>
                                {payment.reference && showDetails && (
                                    <span className="text-xs text-gray-500">({payment.reference})</span>
                                )}
                            </div>
                            <span className="text-sm font-medium text-gray-900">₹{parseFloat(String(payment.amount)).toFixed(2)}</span>
                        </div>
                    );
                })}

                {!isFullyPaid && (
                    <div className={`flex items-center justify-between pt-2 border-t ${creditAmount > 0 ? 'border-orange-200' : 'border-red-200'
                        }`}>
                        <span className={`text-sm font-medium ${creditAmount > 0 ? 'text-orange-700' : 'text-red-700'
                            }`}>
                            {creditAmount > 0 ? 'Credit Amount' : 'Excess Amount'}
                        </span>
                        <span className={`text-sm font-bold ${creditAmount > 0 ? 'text-orange-800' : 'text-red-800'
                            }`}>
                            ₹{Math.abs(creditAmount).toFixed(2)}
                        </span>
                    </div>
                )}

                {creditAmount > 0 && bankAccount && (
                    <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500">
                            Receiving Bank: {bankAccount.bank_name} • {bankAccount.account_number}
                        </p>
                    </div>
                )}
            </div>

            {payments.length > 1 && (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>{payments.length} payment{payments.length > 1 ? 's' : ''}</span>
                        <span>Paid: ₹{totalPaid.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * PaymentBadge Component
 * Ultra-compact payment display for lists and tables
 */
export const PaymentBadge: React.FC<PaymentBadgeProps> = ({ payments = [], totalAmount = 0 }) => {
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);
    const creditAmount = totalAmount - totalPaid;
    const isFullyPaid = Math.abs(creditAmount) < 0.01;

    const primaryMethod = payments.length > 0 ? payments[0].method : 'credit';
    const methodLabel = primaryMethod === 'credit' ? 'Credit' :
        primaryMethod === 'cash' ? 'Cash' :
            primaryMethod === 'card' ? 'Card' :
                primaryMethod === 'upi' ? 'UPI' :
                    primaryMethod === 'bank' ? 'Bank' : 'Mixed';

    return (
        <div className="inline-flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${isFullyPaid
                ? 'bg-green-100 text-green-800'
                : creditAmount > 0
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                {methodLabel}
                {payments.length > 1 && ` +${payments.length - 1}`}
            </span>
            <span className="text-sm font-medium text-gray-700">
                ₹{totalPaid.toFixed(0)}
                {!isFullyPaid && (
                    <span className="text-xs text-gray-500">
                        /{totalAmount.toFixed(0)}
                    </span>
                )}
            </span>
        </div>
    );
};

export default CompactPaymentMethod;
