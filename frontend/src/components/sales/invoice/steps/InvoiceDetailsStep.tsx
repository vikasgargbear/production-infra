import React, { RefObject, useState } from 'react';
import { FileText, Plus } from 'lucide-react';

// Global Components
import { ModuleHeader, AddressForm, DocumentFooter } from '../../../global';

// GST Type Determination
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import { useCompany } from '../../../../contexts/CompanyContext';

// Shared Types
import { Customer, Invoice, InvoiceTotals, Payment } from '../types/invoiceTypes';

interface InvoiceDetailsStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
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
    onClose,
    onContinue,
    onBack,
    // Refs
    deliveryTypeRef,
    transportRef,
    vehicleRef,
    deliveryChargesRef,
}) => {
    const { companyInfo } = useCompany();
    // State for controlling AddressForm add mode externally
    const [addAddressMode, setAddAddressMode] = useState(false);

    return (
        <div className="h-full bg-blue-50">
            <div className="h-full flex flex-col">

                {/* Header - Using Global ModuleHeader */}
                <ModuleHeader
                    title="Invoice Details"
                    documentNumber={invoice.invoice_number}
                    status="review"
                    icon={FileText}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    additionalActions={[
                        {
                            label: "← Back to Items",
                            onClick: onBack,
                            variant: "secondary"
                        }
                    ]}
                />

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-blue-50">
                    <div className="max-w-6xl mx-auto px-6 py-6">

                        {/* 1. Delivery - Address first, then options */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    DELIVERY
                                </h3>
                                {selectedCustomer && (
                                    <button
                                        onClick={() => setAddAddressMode(true)}
                                        className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        New Address
                                    </button>
                                )}
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">

                                {/* Delivery Address - First Priority */}
                                {selectedCustomer ? (
                                    <AddressForm
                                        title="Delivery Address"
                                        addressType="shipping"
                                        customer={selectedCustomer}
                                        readonly={false}
                                        className=""
                                        isAddMode={addAddressMode}
                                        onExitAddMode={() => setAddAddressMode(false)}
                                        onChange={(address: string) => {
                                            setInvoice(prev => ({
                                                ...prev,
                                                shipping_address: address,
                                                billing_address: address
                                            }));
                                        }}
                                        onSave={(addressData: unknown) => {
                                            setAddAddressMode(false);
                                            // Uses global GST utility — delivery address state = Place of Supply (IGST Act Section 10)
                                            const addrState = (addressData as any)?.state || (addressData as any)?.state_name;
                                            const gstType = determineGstTypeForSupply(
                                                companyInfo?.state, addrState,
                                                companyInfo?.gst_number, selectedCustomer?.gst_number
                                            );
                                            setInvoice(prev => ({
                                                ...prev,
                                                shipping_address_data: addressData,
                                                billing_address_data: addressData,
                                                gst_type: gstType
                                            } as Invoice));
                                        }}
                                    />
                                ) : (
                                    <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                                        Select a customer to choose delivery address
                                    </div>
                                )}

                                {/* Delivery Options - Compact row */}
                                <div className="border-t border-gray-100 pt-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
                                            <select
                                                ref={deliveryTypeRef}
                                                value={invoice.delivery_type || 'PICKUP'}
                                                onChange={(e) => setInvoice(prev => ({ ...prev, delivery_type: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                            >
                                                <option value="PICKUP">Pickup</option>
                                                <option value="SAME_DAY">Same Day</option>
                                                <option value="NEXT_DAY">Next Day</option>
                                                <option value="EXPRESS">Express</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Transport</label>
                                            <input
                                                ref={transportRef}
                                                type="text"
                                                value={invoice.transport_company || ''}
                                                onChange={(e) => setInvoice(prev => ({ ...prev, transport_company: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                placeholder="Company name"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle</label>
                                            <input
                                                ref={vehicleRef}
                                                type="text"
                                                value={invoice.vehicle_number || ''}
                                                onChange={(e) => setInvoice(prev => ({ ...prev, vehicle_number: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                                                onFocus={(e) => e.target.select()}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                placeholder="0"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Payment */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    PAYMENT
                                </h3>

                                {/* Split Payment Toggle */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-700">Split Payment</span>
                                    <button
                                        role="switch"
                                        aria-checked={!!(invoice.payments && invoice.payments.length > 1)}
                                        aria-label="Enable split payment"
                                        onClick={() => {
                                            const totalAmount = parseFloat(String(invoice.totals?.final_amount || invoice.final_amount)) || 0;
                                            if (invoice.payments && invoice.payments.length > 1) {
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
                                                setInvoice(prev => ({
                                                    ...prev,
                                                    payments: [
                                                        { id: '1', method: 'upi', amount: totalAmount, reference: '' },
                                                        { id: '2', method: 'credit', amount: '', reference: '' }
                                                    ],
                                                    payment_mode: 'split',
                                                    payment_status: 'partial'
                                                }));
                                            }
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${invoice.payments && invoice.payments.length > 1
                                            ? 'bg-blue-600'
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

                            <div className="bg-white rounded-lg border border-gray-200 p-6">

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
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                                                                value={payment.amount === 0 || payment.amount === '' ? '' : payment.amount}
                                                                onChange={(e) => {
                                                                    const newPayments = [...(invoice.payments || [])];
                                                                    const val = e.target.value;
                                                                    newPayments[index] = { ...newPayments[index], amount: val === '' ? '' : parseFloat(val) || 0 };
                                                                    setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                }}
                                                                onBlur={(e) => {
                                                                    if (e.target.value === '') {
                                                                        const newPayments = [...(invoice.payments || [])];
                                                                        newPayments[index] = { ...newPayments[index], amount: 0 };
                                                                        setInvoice(prev => ({ ...prev, payments: newPayments }));
                                                                    }
                                                                }}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                                                        amount: '',
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
                                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
                                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Bill Discount - Expanded Grid (no Type label) */}
                                <div className="border-t border-gray-100 pt-5 mb-4">
                                    <div className="flex items-center gap-3 mb-4">
                                        <h4 className="text-sm font-semibold text-gray-700">Bill Discount</h4>
                                        {((invoice.discount_percent || 0) > 0 || (invoice.discount_amount || 0) > 0) && (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                                Saves ₹{(
                                                    invoice.discount_type === 'fixed'
                                                        ? invoice.discount_amount || 0
                                                        : (parseFloat(String(invoice.totals?.taxable_before_scheme || invoice.totals?.taxable_amount || 0)) * (invoice.discount_percent || 0)) / 100
                                                ).toFixed(0)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-12 gap-4 items-end">
                                        {/* Discount Type Toggle - No label */}
                                        <div className="col-span-4">
                                            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                                                <button
                                                    onClick={() => setInvoice(prev => ({
                                                        ...prev,
                                                        discount_type: 'percentage',
                                                        discount_amount: 0,
                                                        discount_percent: prev.discount_percent || 0
                                                    }))}
                                                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${(invoice.discount_type || 'percentage') === 'percentage'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    Percentage (%)
                                                </button>
                                                <button
                                                    onClick={() => setInvoice(prev => ({
                                                        ...prev,
                                                        discount_type: 'fixed',
                                                        discount_percent: 0,
                                                        discount_amount: prev.discount_amount || 0
                                                    }))}
                                                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${invoice.discount_type === 'fixed'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    Fixed (₹)
                                                </button>
                                            </div>
                                        </div>

                                        {/* Discount Value */}
                                        <div className="col-span-4">
                                            <div className="relative">
                                                {invoice.discount_type === 'fixed' && (
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                                                )}
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={invoice.discount_type === 'percentage' || !invoice.discount_type ? 100 : undefined}
                                                    step={invoice.discount_type === 'percentage' || !invoice.discount_type ? 0.5 : 1}
                                                    value={invoice.discount_type === 'fixed'
                                                        ? (invoice.discount_amount || '')
                                                        : (invoice.discount_percent || '')}
                                                    onChange={(e) => {
                                                        const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                                        if (invoice.discount_type === 'fixed') {
                                                            setInvoice(prev => ({ ...prev, discount_amount: value }));
                                                        } else {
                                                            setInvoice(prev => ({ ...prev, discount_percent: value }));
                                                        }
                                                    }}
                                                    onFocus={(e) => e.target.select()}
                                                    className={`w-full ${invoice.discount_type === 'fixed' ? 'pl-8' : 'pl-4'} pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                                                    placeholder="Enter value"
                                                />
                                                {(invoice.discount_type === 'percentage' || !invoice.discount_type) && (
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Clear Button */}
                                        <div className="col-span-4">
                                            {((invoice.discount_percent || 0) > 0 || (invoice.discount_amount || 0) > 0) ? (
                                                <button
                                                    onClick={() => setInvoice(prev => ({
                                                        ...prev,
                                                        discount_percent: 0,
                                                        discount_amount: 0
                                                    }))}
                                                    className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-300"
                                                >
                                                    Clear Discount
                                                </button>
                                            ) : (
                                                <div className="h-[42px]"></div>
                                            )}
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

                                        {/* Taxable Amount (after item discounts, BEFORE invoice discount) */}
                                        {(invoice.totals?.taxable_before_scheme || invoice.totals?.taxable_amount) && (
                                            <div className="flex justify-between items-center text-sm font-medium">
                                                <span className="text-gray-700">Taxable Amount</span>
                                                <span className="text-gray-900">₹{parseFloat(String(invoice.totals.taxable_before_scheme || invoice.totals.taxable_amount)).toFixed(2)}</span>
                                            </div>
                                        )}

                                        {/* Invoice Discount (scheme_discount from calculator) */}
                                        {(invoice.totals?.scheme_discount || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">
                                                    Invoice Discount
                                                    {invoice.discount_type === 'percentage' && ` (${invoice.discount_percent}%)`}
                                                </span>
                                                <span className="text-green-600">
                                                    -₹{parseFloat(String(invoice.totals?.scheme_discount)).toFixed(2)}
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
                <DocumentFooter
                    totalAmount={parseFloat(String(invoice.totals?.final_amount || invoice.final_amount || 0))}
                    onCancel={onBack}
                    onContinue={onContinue}
                    cancelLabel="← Back to Items"
                    continueLabel="Continue to Preview"
                    continueDisabled={(() => {
                        const totalPaid = (invoice.payments || []).reduce((sum: number, p: Payment) => sum + Number(p.amount || 0), 0);
                        const finalAmount = parseFloat(String(invoice.totals?.final_amount || invoice.final_amount || 0));
                        return totalPaid > finalAmount;
                    })()}
                    continueButtonColor="blue"
                    additionalInfo={(() => {
                        const totalPaid = (invoice.payments || []).reduce((sum: number, p: Payment) => sum + Number(p.amount || 0), 0);
                        const finalAmount = parseFloat(String(invoice.totals?.final_amount || invoice.final_amount || 0));
                        const remaining = finalAmount - totalPaid;

                        if (remaining > 0) {
                            return (
                                <span className="text-sm text-gray-700">
                                    Credit: <strong className="text-gray-900">₹{remaining.toFixed(2)}</strong>
                                </span>
                            );
                        } else if (remaining < 0) {
                            return (
                                <span className="text-sm text-red-600">
                                    Overpaid: <strong>₹{Math.abs(remaining).toFixed(2)}</strong>
                                </span>
                            );
                        }
                        return null;
                    })()}
                />

            </div>
        </div>
    );
};

export default InvoiceDetailsStep;
