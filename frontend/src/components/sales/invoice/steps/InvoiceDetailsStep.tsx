import React, { RefObject } from 'react';
import { FileText } from 'lucide-react';

// Global Components
import { ModuleHeader, AddressForm } from '../../../global';

// Shared Types
import { Customer, Invoice, InvoiceTotals, Payment } from '../types/invoiceTypes';

interface InvoiceDetailsStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
    sameAsShipping: boolean;
    setSameAsShipping: React.Dispatch<React.SetStateAction<boolean>>;
    onClose: () => void;
    onContinue: () => void;
    onBack: () => void;
    // Refs
    deliveryTypeRef: RefObject<HTMLSelectElement>;
    transportRef: RefObject<HTMLInputElement>;
    vehicleRef: RefObject<HTMLInputElement>;
    deliveryChargesRef: RefObject<HTMLInputElement>;
}

const InvoiceDetailsStep: React.FC<InvoiceDetailsStepProps> = ({
    invoice,
    setInvoice,
    selectedCustomer,
    sameAsShipping,
    setSameAsShipping,
    onClose,
    onContinue,
    onBack,
    // Refs
    deliveryTypeRef,
    transportRef,
    vehicleRef,
    deliveryChargesRef,
}) => {
    return (
        <div className="h-full bg-blue-50">
            <div className="h-full flex flex-col">

                {/* Header - Using Global ModuleHeader */}
                <ModuleHeader
                    title="Invoice Details"
                    documentNumber={invoice.invoice_no}
                    status="review"
                    icon={FileText}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    historyType="invoice"
                    additionalActions={[
                        {
                            label: "← Back to Items",
                            onClick: onBack,
                            icon: undefined,
                            variant: "default",
                            className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
                        }
                    ]}
                />

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-blue-50">
                    <div className="w-full max-w-5xl mx-auto px-8 py-6">

                        {/* 1. Delivery Details - First Priority */}
                        <div className="mb-6">
                            <div className="flex items-center mb-4">
                                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full mr-3">
                                    <span className="text-sm font-bold text-blue-600">1</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-800">Delivery Details</h3>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
                                        <select
                                            ref={deliveryTypeRef}
                                            value={invoice.delivery_type || 'PICKUP'}
                                            onChange={(e) => setInvoice(prev => ({ ...prev, delivery_type: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                        >
                                            <option value="PICKUP">Pickup</option>
                                            <option value="SAME_DAY">Same Day</option>
                                            <option value="NEXT_DAY">Next Day</option>
                                            <option value="EXPRESS">Express</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Transport Company</label>
                                        <input
                                            ref={transportRef}
                                            type="text"
                                            value={invoice.transport_company || ''}
                                            onChange={(e) => setInvoice(prev => ({ ...prev, transport_company: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                            placeholder="Transport company"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
                                        <input
                                            ref={vehicleRef}
                                            type="text"
                                            value={invoice.vehicle_number || ''}
                                            onChange={(e) => setInvoice(prev => ({ ...prev, vehicle_number: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                            placeholder="MH-01-AB-1234"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Charges</label>
                                        <input
                                            ref={deliveryChargesRef}
                                            type="number"
                                            value={invoice.freight_charges || ''}
                                            onChange={(e) => setInvoice(prev => ({ ...prev, freight_charges: parseFloat(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                            placeholder="₹0"
                                            min="0"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Address Details - Second Priority */}
                        {selectedCustomer && (
                            <div className="mb-6">
                                <div className="flex items-center mb-4">
                                    <div className="flex items-center justify-center w-8 h-8 bg-green-100 rounded-full mr-3">
                                        <span className="text-sm font-bold text-green-600">2</span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-800">Address Details</h3>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <AddressForm
                                            title="Billing Address"
                                            addressType="billing"
                                            customer={selectedCustomer}
                                            readonly={false}
                                            className=""
                                            onChange={(address: string) => {
                                                console.log('[Invoice] Billing address changed:', address);
                                                setInvoice(prev => ({ ...prev, billing_address: address }));
                                            }}
                                            onSave={(addressData: unknown) => {
                                                console.log('[Invoice] Billing address saved:', addressData);
                                                setInvoice(prev => ({ ...prev, billing_address_data: addressData }));
                                            }}
                                        />
                                        <AddressForm
                                            title="Shipping Address"
                                            addressType="shipping"
                                            customer={selectedCustomer}
                                            sameAsBilling={sameAsShipping}
                                            onSameAsBillingChange={(same: boolean) => {
                                                setSameAsShipping(same);
                                                if (same) {
                                                    setInvoice(prev => ({
                                                        ...prev,
                                                        shipping_address: prev.billing_address,
                                                        shipping_address_data: prev.billing_address_data
                                                    }));
                                                }
                                            }}
                                            onChange={(address: string) => setInvoice(prev => ({ ...prev, shipping_address: address }))}
                                            onSave={(addressData: unknown) => setInvoice(prev => ({ ...prev, shipping_address_data: addressData }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. Payment Details - Clean & Compact */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center">
                                    <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 rounded-full mr-3">
                                        <span className="text-sm font-bold text-indigo-600">3</span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-800">Payment Details</h3>
                                </div>

                                {/* Split Payment Toggle - Outside tile for better UX */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-600">Split Payment</span>
                                    <button
                                        onClick={() => {
                                            const totalAmount = parseFloat(String(invoice.totals?.final_amount || invoice.final_amount)) || 0;
                                            if (invoice.payments && invoice.payments.length > 1) {
                                                // Disable split - Default to credit (pay later)
                                                setInvoice(prev => ({
                                                    ...prev,
                                                    payments: [{
                                                        id: '1',
                                                        method: 'credit',
                                                        amount: totalAmount,
                                                        reference: ''
                                                    }],
                                                    payment_mode: 'credit',
                                                    payment_status: 'pending'
                                                }));
                                            } else {
                                                // Enable split - Start with cash and card
                                                setInvoice(prev => ({
                                                    ...prev,
                                                    payments: [
                                                        { id: '1', method: 'cash', amount: Math.floor(totalAmount / 2), reference: '' },
                                                        { id: '2', method: 'card', amount: totalAmount - Math.floor(totalAmount / 2), reference: '' }
                                                    ],
                                                    payment_mode: 'split',
                                                    payment_status: 'partial'
                                                }));
                                            }
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${invoice.payments && invoice.payments.length > 1
                                            ? 'bg-indigo-600'
                                            : 'bg-gray-200'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${invoice.payments && invoice.payments.length > 1
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

                                {/* Payment Method Selection - Always show dropdown */}
                                <div className="space-y-4">
                                    {invoice.payments && invoice.payments.length > 1 ? (
                                        /* Split Payment Mode - Multiple rows */
                                        <>
                                            <div className="space-y-3">
                                                {invoice.payments.map((payment, index) => (
                                                    <div key={payment.id || index} className="grid grid-cols-12 gap-3 items-center">
                                                        <div className="col-span-4">
                                                            {index === 0 && <label className="block text-sm font-medium text-gray-700 mb-2">Payment Methods</label>}
                                                            <select
                                                                value={payment.method}
                                                                onChange={(e) => {
                                                                    const newPayments = [...(invoice.payments || [])];
                                                                    newPayments[index] = { ...newPayments[index], method: e.target.value };
                                                                    setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                }}
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                            >
                                                                <option value="cash">Cash</option>
                                                                <option value="card">Card</option>
                                                                <option value="upi">UPI</option>
                                                                <option value="bank">Bank Transfer</option>
                                                                <option value="check">Check</option>
                                                                <option value="credit">Credit (Pay Later)</option>
                                                            </select>
                                                        </div>
                                                        <div className="col-span-4">
                                                            {index === 0 && <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>}
                                                            <input
                                                                type="number"
                                                                value={payment.amount}
                                                                onChange={(e) => {
                                                                    const newPayments = [...(invoice.payments || [])];
                                                                    newPayments[index] = { ...newPayments[index], amount: parseFloat(e.target.value) || 0 };
                                                                    setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                }}
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                                placeholder="Amount"
                                                            />
                                                        </div>
                                                        <div className="col-span-3">
                                                            {index === 0 && <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>}
                                                            <input
                                                                type="text"
                                                                value={payment.reference || ''}
                                                                onChange={(e) => {
                                                                    const newPayments = [...(invoice.payments || [])];
                                                                    newPayments[index] = { ...newPayments[index], reference: e.target.value };
                                                                    setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                }}
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                                placeholder={payment.method === 'upi' ? 'UPI ID' :
                                                                    payment.method === 'card' ? 'Last 4 digits' :
                                                                        payment.method === 'bank' ? 'Transaction ID' :
                                                                            payment.method === 'check' ? 'Check Number' : 'Reference'}
                                                            />
                                                        </div>
                                                        <div className="col-span-1">
                                                            {index > 0 && (
                                                                <button
                                                                    onClick={() => {
                                                                        const newPayments = (invoice.payments || []).filter((_, i) => i !== index);
                                                                        setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                    }}
                                                                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Add Payment Button */}
                                            <button
                                                onClick={() => {
                                                    const newPayment: Payment = {
                                                        id: Date.now().toString(),
                                                        method: 'cash',
                                                        amount: 0,
                                                        reference: ''
                                                    };
                                                    setInvoice(prev => ({
                                                        ...prev,
                                                        payments: [...(prev.payments || []), newPayment]
                                                    }));
                                                }}
                                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                            >
                                                + Add Payment Method
                                            </button>
                                        </>
                                    ) : (
                                        /* Single Payment Mode */
                                        <div className={`grid gap-4 ${invoice.payments?.[0]?.method && !['credit', 'cash'].includes(invoice.payments[0].method)
                                            ? 'grid-cols-12'
                                            : 'grid-cols-2'
                                            }`}>
                                            <div className={invoice.payments?.[0]?.method && !['credit', 'cash'].includes(invoice.payments[0].method) ? 'col-span-4' : ''}>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                                                <select
                                                    value={invoice.payments?.[0]?.method || 'credit'}
                                                    onChange={(e) => {
                                                        const totalAmount = parseFloat(String(invoice.totals?.final_amount || invoice.final_amount)) || 0;
                                                        setInvoice(prev => ({
                                                            ...prev,
                                                            payments: [{
                                                                id: '1',
                                                                method: e.target.value,
                                                                amount: totalAmount,
                                                                reference: ''
                                                            }],
                                                            payment_mode: e.target.value
                                                        }));
                                                    }}
                                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                                >
                                                    <option value="credit">Credit (Pay Later)</option>
                                                    <option value="cash">Cash</option>
                                                    <option value="card">Card</option>
                                                    <option value="upi">UPI</option>
                                                    <option value="bank">Bank Transfer</option>
                                                    <option value="check">Check</option>
                                                </select>
                                            </div>
                                            <div className={invoice.payments?.[0]?.method && !['credit', 'cash'].includes(invoice.payments[0].method) ? 'col-span-4' : ''}>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                                <input
                                                    type="number"
                                                    value={parseFloat(String(invoice.totals?.final_amount || invoice.final_amount)) || 0}
                                                    readOnly
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                                                />
                                            </div>
                                            {/* Reference field - show for methods that need it */}
                                            {invoice.payments?.[0]?.method && !['credit', 'cash'].includes(invoice.payments[0].method) && (
                                                <div className="col-span-4">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {invoice.payments[0].method === 'upi' ? 'UPI ID' :
                                                            invoice.payments[0].method === 'card' ? 'Last 4 Digits' :
                                                                invoice.payments[0].method === 'bank' ? 'Transaction ID' :
                                                                    invoice.payments[0].method === 'check' ? 'Check Number' : 'Reference'}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={invoice.payments[0]?.reference || ''}
                                                        onChange={(e) => {
                                                            setInvoice(prev => ({
                                                                ...prev,
                                                                payments: [{
                                                                    ...(prev.payments?.[0] || { id: '1', method: 'credit', amount: 0, reference: '' }),
                                                                    reference: e.target.value
                                                                }]
                                                            }));
                                                        }}
                                                        placeholder={invoice.payments[0].method === 'upi' ? 'xyz@paytm' :
                                                            invoice.payments[0].method === 'card' ? '1234' :
                                                                invoice.payments[0].method === 'bank' ? 'NEFT123' :
                                                                    invoice.payments[0].method === 'check' ? '123456' : 'Optional'}
                                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Invoice Discount Section */}
                                <div className="border-t border-gray-100 pt-4 mb-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                                            <select
                                                value={invoice.discount_type || 'percentage'}
                                                onChange={(e) => {
                                                    const type = e.target.value as 'percentage' | 'fixed';
                                                    setInvoice(prev => ({
                                                        ...prev,
                                                        discount_type: type,
                                                        discount_amount: 0,
                                                        discount_percent: 0
                                                    }));
                                                }}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="percentage">% Discount</option>
                                                <option value="fixed">₹ Amount</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {invoice.discount_type === 'fixed' ? 'Discount Amount' : 'Discount Percentage'}
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max={invoice.discount_type === 'percentage' ? 100 : undefined}
                                                step={invoice.discount_type === 'percentage' ? 0.1 : 0.01}
                                                value={invoice.discount_type === 'fixed' ? (invoice.discount_amount === 0 ? '' : invoice.discount_amount) : (invoice.discount_percent === 0 ? '' : invoice.discount_percent)}
                                                onChange={(e) => {
                                                    const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                                    if (invoice.discount_type === 'fixed') {
                                                        setInvoice(prev => ({ ...prev, discount_amount: value }));
                                                    } else {
                                                        setInvoice(prev => ({ ...prev, discount_percent: value }));
                                                    }
                                                }}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder={invoice.discount_type === 'fixed' ? '₹0' : '0.0'}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">You Save</label>
                                            <div className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-green-50 text-green-700 font-medium">
                                                {((invoice.discount_percent || 0) > 0 || (invoice.discount_amount || 0) > 0) ?
                                                    `₹${(
                                                        invoice.discount_type === 'fixed'
                                                            ? invoice.discount_amount || 0
                                                            : (parseFloat(String(invoice.totals?.taxable_amount || 0)) * (invoice.discount_percent || 0)) / 100
                                                    ).toFixed(2)}` :
                                                    '₹0'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Total Summary - Shows amounts breakdown */}
                                <div className="border-t border-gray-100 pt-4">
                                    <div className="space-y-2">
                                        {/* Gross Amount */}
                                        {invoice.totals?.gross_amount && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Gross Amount</span>
                                                <span className="text-gray-900">₹{parseFloat(String(invoice.totals.gross_amount)).toFixed(2)}</span>
                                            </div>
                                        )}

                                        {/* Item-level Discounts */}
                                        {(invoice.totals?.total_discount || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Item Discounts</span>
                                                <span className="text-green-600">
                                                    -₹{parseFloat(String(invoice.totals?.total_discount)).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Taxable Amount (after item discounts, before invoice discount) */}
                                        {invoice.totals?.taxable_amount && (
                                            <div className="flex justify-between items-center text-sm font-medium">
                                                <span className="text-gray-700">Taxable Amount</span>
                                                <span className="text-gray-900">₹{parseFloat(String(invoice.totals.taxable_amount)).toFixed(2)}</span>
                                            </div>
                                        )}

                                        {/* Invoice Discount (applied on taxable amount) */}
                                        {((invoice.discount_percent || 0) > 0 || (invoice.discount_amount || 0) > 0) && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">
                                                    Invoice Discount
                                                    {invoice.discount_type === 'percentage' && ` (${invoice.discount_percent}%)`}
                                                </span>
                                                <span className="text-green-600">
                                                    -₹{(
                                                        invoice.discount_type === 'fixed'
                                                            ? invoice.discount_amount || 0
                                                            : (parseFloat(String(invoice.totals?.taxable_amount || 0)) * (invoice.discount_percent || 0)) / 100
                                                    ).toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Delivery Charges */}
                                        {(invoice.freight_charges || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Delivery Charges</span>
                                                <span className="text-gray-900">+₹{parseFloat(String(invoice.freight_charges)).toFixed(2)}</span>
                                            </div>
                                        )}

                                        {/* Final Amount */}
                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                            <span className="text-sm font-medium text-gray-700">Total Amount</span>
                                            <span className="text-lg font-semibold text-gray-900">
                                                ₹{parseFloat(String(invoice.totals?.final_amount || invoice.final_amount || 0)).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                        ← Back to Items
                    </button>
                    <button
                        onClick={onContinue}
                        className="inline-flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                        Continue to Preview →
                    </button>
                </div>

            </div>
        </div>
    );
};

export default InvoiceDetailsStep;
