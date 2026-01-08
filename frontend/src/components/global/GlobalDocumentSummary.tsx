/**
 * Global Document Summary Component
 * Unified summary component for all document types (Invoice, Purchase, Return, etc.)
 * Ensures 90%+ UI consistency across all modules
 */

import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import {
    FileText, Package, TrendingDown, CreditCard,
    RotateCcw, Truck, ClipboardList, FileCheck,
    LucideIcon
} from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type DocumentType = 'invoice' | 'purchase' | 'return' | 'payment' | 'challan' | 'grn' | 'order' | 'adjustment';

interface TypeConfig {
    icon: LucideIcon;
    color: string;
    title: string;
    numberLabel: string;
    dateLabel: string;
    partyLabel: string;
}

interface DocumentData {
    document_number?: string;
    invoice_number?: string;
    purchase_no?: string;
    document_date?: string;
    invoice_date?: string;
    purchase_date?: string;
    party_name?: string;
    customer_name?: string;
    supplier_name?: string;
    subtotal?: number;
    discount_amount?: number;
    gst_amount?: number;
    tax_amount?: number;
    transport_charges?: number;
    delivery_charges?: number;
    round_off?: number;
    final_amount?: number;
    total_amount?: number;
    paid_amount?: number;
    credit_amount?: number;
    status?: 'completed' | 'pending' | 'draft' | 'cancelled' | string;
    [key: string]: unknown;
}

interface GlobalDocumentSummaryProps {
    type?: DocumentType;
    data?: DocumentData;
    showGST?: boolean;
    showDiscount?: boolean;
    showTransport?: boolean;
    className?: string;
}

// ==================== COMPONENT ====================

const GlobalDocumentSummary: React.FC<GlobalDocumentSummaryProps> = ({
    type = 'invoice',
    data = {},
    showGST = true,
    showDiscount = true,
    showTransport = false,
    className = ''
}) => {
    // Document type configurations
    const typeConfig: Record<DocumentType, TypeConfig> = {
        invoice: {
            icon: FileText,
            color: 'blue',
            title: 'Invoice Summary',
            numberLabel: 'Invoice No',
            dateLabel: 'Invoice Date',
            partyLabel: 'Customer'
        },
        purchase: {
            icon: Package,
            color: 'green',
            title: 'Purchase Summary',
            numberLabel: 'Purchase No',
            dateLabel: 'Purchase Date',
            partyLabel: 'Supplier'
        },
        return: {
            icon: RotateCcw,
            color: 'orange',
            title: 'Return Summary',
            numberLabel: 'Return No',
            dateLabel: 'Return Date',
            partyLabel: 'Party'
        },
        payment: {
            icon: CreditCard,
            color: 'purple',
            title: 'Payment Summary',
            numberLabel: 'Payment No',
            dateLabel: 'Payment Date',
            partyLabel: 'Party'
        },
        challan: {
            icon: Truck,
            color: 'teal',
            title: 'Challan Summary',
            numberLabel: 'Challan No',
            dateLabel: 'Challan Date',
            partyLabel: 'Customer'
        },
        grn: {
            icon: ClipboardList,
            color: 'indigo',
            title: 'GRN Summary',
            numberLabel: 'GRN No',
            dateLabel: 'GRN Date',
            partyLabel: 'Supplier'
        },
        order: {
            icon: FileCheck,
            color: 'cyan',
            title: 'Order Summary',
            numberLabel: 'Order No',
            dateLabel: 'Order Date',
            partyLabel: 'Customer'
        },
        adjustment: {
            icon: TrendingDown,
            color: 'amber',
            title: 'Adjustment Summary',
            numberLabel: 'Adjustment No',
            dateLabel: 'Adjustment Date',
            partyLabel: 'Warehouse'
        }
    };

    const config = typeConfig[type] || typeConfig.invoice;
    const Icon = config.icon;

    // Calculate amounts
    const subtotal = data.subtotal || 0;
    const discountAmount = data.discount_amount || 0;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = data.gst_amount || data.tax_amount || 0;
    const transportCharges = data.transport_charges || data.delivery_charges || 0;
    const roundOff = data.round_off || 0;
    const finalAmount = data.final_amount || data.total_amount || 0;
    const paidAmount = data.paid_amount || 0;
    const creditAmount = data.credit_amount || (finalAmount - paidAmount);

    return (
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
            {/* Header */}
            <div className={`px-4 py-3 border-b border-gray-200 bg-${config.color}-50`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 text-${config.color}-600`} />
                        <h3 className="font-semibold text-gray-900">{config.title}</h3>
                    </div>
                    <span className={`text-sm font-medium text-${config.color}-600`}>
                        {data.document_number || data.invoice_number || data.purchase_no || 'DRAFT'}
                    </span>
                </div>
            </div>

            {/* Document Info */}
            <div className="px-4 py-3 border-b border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-gray-500">{config.numberLabel}:</span>
                        <span className="ml-2 font-medium text-gray-900">
                            {data.document_number || data.invoice_number || data.purchase_no || 'DRAFT'}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-500">{config.dateLabel}:</span>
                        <span className="ml-2 font-medium text-gray-900">
                            {data.document_date || data.invoice_date || data.purchase_date || new Date().toLocaleDateString()}
                        </span>
                    </div>
                    <div className="col-span-2">
                        <span className="text-gray-500">{config.partyLabel}:</span>
                        <span className="ml-2 font-medium text-gray-900">
                            {data.party_name || data.customer_name || data.supplier_name || 'Not Selected'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Amount Breakdown */}
            <div className="px-4 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>

                {showDiscount && discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Discount</span>
                        <span className="font-medium text-green-600">- {formatCurrency(discountAmount)}</span>
                    </div>
                )}

                {showDiscount && discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Taxable Amount</span>
                        <span className="font-medium">{formatCurrency(taxableAmount)}</span>
                    </div>
                )}

                {showGST && gstAmount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">GST</span>
                        <span className="font-medium">{formatCurrency(gstAmount)}</span>
                    </div>
                )}

                {showTransport && transportCharges > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Transport</span>
                        <span className="font-medium">{formatCurrency(transportCharges)}</span>
                    </div>
                )}

                {roundOff !== 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Round Off</span>
                        <span className={`font-medium ${roundOff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {roundOff > 0 ? '+' : ''}{formatCurrency(Math.abs(roundOff))}
                        </span>
                    </div>
                )}

                {/* Final Amount */}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Total Amount</span>
                    <span className={`font-bold text-lg text-${config.color}-600`}>
                        {formatCurrency(finalAmount)}
                    </span>
                </div>

                {/* Payment Status for Invoice/Purchase */}
                {(type === 'invoice' || type === 'purchase') && paidAmount > 0 && (
                    <>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Paid Amount</span>
                            <span className="font-medium text-green-600">{formatCurrency(paidAmount)}</span>
                        </div>
                        {creditAmount > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Credit Amount</span>
                                <span className="font-medium text-orange-600">{formatCurrency(creditAmount)}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Status Badge */}
            {data.status && (
                <div className="px-4 py-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Status</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full
              ${data.status === 'completed' ? 'bg-green-100 text-green-700' : ''}
              ${data.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : ''}
              ${data.status === 'draft' ? 'bg-gray-100 text-gray-700' : ''}
              ${data.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
            `}>
                            {data.status.toUpperCase()}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalDocumentSummary;
