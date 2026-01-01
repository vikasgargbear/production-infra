import React, { FC, ReactNode } from 'react';

// ==================== TYPE DEFINITIONS ====================

export interface SummaryItem {
    label: string;
    value: string | number;
    isTotal?: boolean;
    isBold?: boolean;
    color?: string;
    description?: string;
}

export interface SummaryCardProps {
    items?: SummaryItem[];
    title?: string;
    variant?: 'default' | 'compact' | 'detailed';
    showCurrency?: boolean;
    currency?: string;
    className?: string;
    footerContent?: ReactNode;
    headerContent?: ReactNode;
}

type VariantKey = 'default' | 'compact' | 'detailed';

// ==================== COMPONENT ====================

const SummaryCard: FC<SummaryCardProps> = ({
    items = [],
    title,
    variant = 'default',
    showCurrency = true,
    currency = 'INR',
    className = '',
    footerContent,
    headerContent
}) => {
    const formatCurrency = (value: string | number): string => {
        if (typeof value !== 'number') return String(value);

        const formatted = new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);

        if (showCurrency) {
            return currency === 'INR' ? `₹${formatted}` : `${formatted}`;
        }
        return formatted;
    };

    const variantClasses: Record<VariantKey, string> = {
        default: 'bg-gray-50 border border-gray-200',
        compact: 'bg-white border border-gray-200',
        detailed: 'bg-white border border-gray-200 shadow-sm'
    };

    const paddingClasses: Record<VariantKey, string> = {
        default: 'p-4',
        compact: 'p-3',
        detailed: 'p-6'
    };

    const spacingClasses: Record<VariantKey, string> = {
        default: 'space-y-2',
        compact: 'space-y-1',
        detailed: 'space-y-3'
    };

    return (
        <div className={`rounded-lg ${variantClasses[variant]} ${className}`}>
            {(title || headerContent) && (
                <div className={`${paddingClasses[variant]} border-b border-gray-200`}>
                    {title && (
                        <h3 className={`font-semibold text-gray-900 ${variant === 'compact' ? 'text-sm' : 'text-base'}`}>
                            {title}
                        </h3>
                    )}
                    {headerContent}
                </div>
            )}

            <div className={`${paddingClasses[variant]} ${spacingClasses[variant]}`}>
                {items.map((item, index) => {
                    const isLastItem = index === items.length - 1;
                    const showDivider = item.isTotal || (isLastItem && items.some(i => i.isTotal));

                    return (
                        <div key={index}>
                            {showDivider && index > 0 && <div className="border-t border-gray-300 my-2" />}

                            <div className={`flex justify-between items-center ${item.isTotal ? 'pt-1' : ''}`}>
                                <span
                                    className={`
                    ${variant === 'compact' ? 'text-sm' : 'text-base'}
                    ${item.color ? '' : 'text-gray-600'}
                    ${item.isBold || item.isTotal ? 'font-semibold' : ''}
                    ${item.isTotal ? 'text-gray-900' : ''}
                  `}
                                    style={{ color: item.color }}
                                >
                                    {item.label}
                                </span>

                                <span
                                    className={`
                    ${variant === 'compact' ? 'text-sm' : 'text-base'}
                    ${item.isBold || item.isTotal ? 'font-bold' : 'font-medium'}
                    ${item.isTotal ? 'text-lg text-gray-900' : ''}
                    ${item.color ? '' : 'text-gray-900'}
                  `}
                                    style={{ color: item.color }}
                                >
                                    {formatCurrency(item.value)}
                                </span>
                            </div>

                            {item.description && (
                                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {footerContent && (
                <div className={`${paddingClasses[variant]} border-t border-gray-200`}>
                    {footerContent}
                </div>
            )}
        </div>
    );
};

// Preset configurations
interface InvoiceSummaryProps extends Omit<SummaryCardProps, 'items'> {
    subtotal: number;
    tax: number;
    discount?: number;
    total: number;
}

export const InvoiceSummary: FC<InvoiceSummaryProps> = ({ subtotal, tax, discount = 0, total, ...props }) => {
    const items: SummaryItem[] = [
        { label: 'Subtotal', value: subtotal },
        ...(discount > 0 ? [{ label: 'Discount', value: -discount, color: '#059669' }] : []),
        { label: 'Tax', value: tax },
        { label: 'Total Amount', value: total, isTotal: true }
    ];

    return <SummaryCard items={items} variant="default" {...props} />;
};

interface PaymentSummaryProps extends Omit<SummaryCardProps, 'items'> {
    amount: number;
    received: number;
    balance: number;
}

export const PaymentSummary: FC<PaymentSummaryProps> = ({ amount, received, balance, ...props }) => {
    const items: SummaryItem[] = [
        { label: 'Total Amount', value: amount },
        { label: 'Amount Received', value: received, color: '#059669' },
        { label: 'Balance Due', value: balance, isTotal: true, color: balance > 0 ? '#DC2626' : undefined }
    ];

    return <SummaryCard items={items} variant="default" {...props} />;
};

interface OrderSummaryProps extends Omit<SummaryCardProps, 'items'> {
    items: number;
    shipping: number;
    tax: number;
    total: number;
}

export const OrderSummary: FC<OrderSummaryProps> = ({ items, shipping, tax, total, ...props }) => {
    const summaryItems: SummaryItem[] = [
        { label: 'Items Total', value: items },
        { label: 'Shipping', value: shipping },
        { label: 'Tax', value: tax },
        { label: 'Order Total', value: total, isTotal: true }
    ];

    return <SummaryCard items={summaryItems} variant="detailed" title="Order Summary" {...props} />;
};

export default SummaryCard;
