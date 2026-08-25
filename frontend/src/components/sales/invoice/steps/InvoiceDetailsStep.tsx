import React, { RefObject, useState } from 'react';
import { FileText, Plus } from 'lucide-react';

// Global Components
import { ModuleHeader, AddressForm, DocumentFooter } from '../../../global';

// GST Type Determination
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import { useCompany } from '../../../../contexts/CompanyContext';
import { indianStateName } from '../../../../utils/indianStates';
import { applySelectedDeliveryAddress } from '../utils/invoiceAddressSelection';
import { compareExactDecimals, formatExactCurrency } from '../../../../utils/exactDecimal';

// Shared Types
import { Customer, Invoice } from '../types/invoiceTypes';

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
    const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;
    const canonicalFinalAmount = invoice.totals?.final_amount;
    const canonicalItemDiscount = invoice.totals?.total_discount;
    const canonicalSchemeDiscount = invoice.totals?.scheme_discount;
    // State for controlling AddressForm add mode externally
    const [addAddressMode, setAddAddressMode] = useState(false);

    return (
        <div className="h-full bg-gray-50">
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
                <div className="flex-1 overflow-y-auto bg-gray-50">
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
                                                // The canonical place of supply must come from a saved,
                                                // structured address, never partially edited display text.
                                                shipping_address_data: undefined,
                                            }));
                                        }}
                                        onSave={(addressData: unknown) => {
                                            setAddAddressMode(false);
                                            // Uses global GST utility — delivery address state = Place of Supply (IGST Act Section 10)
                                            const addrState = indianStateName(
                                                (addressData as any)?.state_code ||
                                                (addressData as any)?.state ||
                                                (addressData as any)?.state_name,
                                            );
                                            const gstType = determineGstTypeForSupply(
                                                companyInfo?.state, addrState,
                                                companyInfo?.gst_number, selectedCustomer?.gst_number
                                            );
                                            setInvoice(prev => applySelectedDeliveryAddress(
                                                prev,
                                                addressData as Record<string, unknown>,
                                                addrState,
                                                gstType,
                                            ));
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

                        {/* Payments are a separate canonical lifecycle. */}
                        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-800">Payment</h3>
                            <p className="mt-2 text-sm text-blue-900">
                                This invoice flow does not infer payment status, paid amount, credit terms, or allocation. Record payment only after the invoice posts, using the canonical Payments flow.
                            </p>
                        </div>

                        <div className="mb-6">
                            <div className="rounded-lg border border-gray-200 bg-white p-6">
                                {/* Bill Discount - Expanded Grid (no Type label) */}
                                <div className="border-t border-gray-100 pt-5 mb-4">
                                    <div className="flex items-center gap-3 mb-4">
                                        <h4 className="text-sm font-semibold text-gray-700">Bill Discount</h4>
                                        {canonicalSchemeDiscount !== undefined
                                            && compareExactDecimals(canonicalSchemeDiscount, '0', 'Invoice scheme discount', moneyOptions) > 0 && (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                                Saves {formatExactCurrency(canonicalSchemeDiscount, 'Invoice scheme discount')}
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
                                                <span className="text-gray-900">{formatExactCurrency(invoice.totals.gross_amount, 'Invoice gross amount')}</span>
                                            </div>
                                        )}

                                        {/* Item-level Discounts */}
                                        {canonicalItemDiscount !== undefined
                                            && compareExactDecimals(canonicalItemDiscount, '0', 'Invoice item discount', moneyOptions) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Item Discounts</span>
                                                <span className="text-green-600">
                                                    -{formatExactCurrency(canonicalItemDiscount, 'Invoice item discount')}
                                                </span>
                                            </div>
                                        )}

                                        {/* Taxable Amount (after item discounts, BEFORE invoice discount) */}
                                        {(invoice.totals?.taxable_before_scheme || invoice.totals?.taxable_amount) && (
                                            <div className="flex justify-between items-center text-sm font-medium">
                                                <span className="text-gray-700">Taxable Amount</span>
                                                <span className="text-gray-900">{formatExactCurrency(invoice.totals.taxable_before_scheme ?? invoice.totals.taxable_amount, 'Invoice taxable amount')}</span>
                                            </div>
                                        )}

                                        {/* Invoice Discount (scheme_discount from calculator) */}
                                        {invoice.totals?.scheme_discount !== undefined && compareExactDecimals(invoice.totals.scheme_discount, 0, 'Invoice scheme discount', moneyOptions) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">
                                                    Invoice Discount
                                                    {invoice.discount_type === 'percentage' && ` (${invoice.discount_percent}%)`}
                                                </span>
                                                <span className="text-green-600">
                                                    -{formatExactCurrency(invoice.totals.scheme_discount, 'Invoice scheme discount')}
                                                </span>
                                            </div>
                                        )}

                                        {/* Delivery Charges */}
                                        {invoice.freight_charges > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Delivery Charges</span>
                                                <span className="text-gray-900">+{formatExactCurrency(invoice.freight_charges, 'Invoice delivery charges')}</span>
                                            </div>
                                        )}

                                        {/* Final Amount */}
                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                            <span className="text-sm font-medium text-gray-700">Total Amount</span>
                                            <span className="text-lg font-semibold text-gray-900">
                                                {canonicalFinalAmount === undefined
                                                    ? 'Live total unavailable'
                                                    : formatExactCurrency(canonicalFinalAmount, 'Invoice final amount')}
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
                    totalAmount={canonicalFinalAmount}
                    onCancel={onBack}
                    onContinue={onContinue}
                    cancelLabel="← Back to Items"
                    continueLabel="Continue to Preview"
                    continueDisabled={canonicalFinalAmount === undefined}
                    continueButtonColor="blue"
                    additionalInfo={canonicalFinalAmount === undefined
                        ? <span className="text-sm text-amber-800">Refresh the live calculation before continuing.</span>
                        : <span className="text-sm text-gray-700">Payment is recorded separately after posting.</span>}
                />

            </div>
        </div>
    );
};

export default InvoiceDetailsStep;
