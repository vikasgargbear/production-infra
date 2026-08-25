/**
 * OrderReviewStep Component
 * Step 2 of sales order flow - review and confirm order
 */

import React from 'react';
import { formatExactDecimal } from '../../../../utils/exactDecimal';
import { CheckCircle, AlertCircle } from 'lucide-react';
import {
    NotesSection,
    AddressForm,
    PrintUtility
} from '../../../global';
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import type { Order, BankAccount, Customer } from '../../../../types/models';
import { canonicalOrderPreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';

// Using canonical Customer type from /types/models - no local duplicate

interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan?: string;
    city?: string;
    state?: string;
}

interface OrderReviewStepProps {
    order: Order;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    selectedCustomer: Customer | null;
    sameAsBilling: boolean;
    setSameAsBilling: React.Dispatch<React.SetStateAction<boolean>>;
    selectedBankAccount: BankAccount | null;
    setSelectedBankAccount: React.Dispatch<React.SetStateAction<BankAccount | null>>;
    message: string;
    messageType: string;
    companyInfo: CompanyInfo;
}

const OrderReviewStep: React.FC<OrderReviewStepProps> = ({
    order,
    setOrder,
    selectedCustomer,
    sameAsBilling,
    setSameAsBilling,
    message,
    messageType,
    companyInfo
}) => {
    const money = (value: unknown, label: string) => formatExactDecimal(
        value,
        label,
        { scale: 2, maximumWholeDigits: 20, allowNegative: true },
        2,
    );
    const previewUnavailableReason = canonicalOrderPreviewUnavailableReason(order);
    if (previewUnavailableReason) {
        return <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900" role="alert">
            <h2 className="font-semibold">Authoritative sales-order preview unavailable</h2>
            <p className="mt-1 text-sm">{previewUnavailableReason} Return to the item step and refresh the live calculation.</p>
        </div>;
    }
    return (
        <div className="max-w-6xl mx-auto p-6">
            {/* Message Display */}
            {message && (
                <div className={`mb-4 p-3 rounded-lg flex items-center ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                    {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                    {message}
                </div>
            )}

            {/* Order Preview */}
            <PrintUtility
                documentData={{
                    documentNumber: order.order_number,
                    date: order.order_date,
                    customer: {
                        name: order.customer_name,
                        phone: selectedCustomer?.phone || selectedCustomer?.primary_phone,
                        gst_number: selectedCustomer?.gst_number,
                        drug_license_number: selectedCustomer?.drug_license_number
                    },
                    items: order.items.map(item => ({
                        product_name: item.product_name,
                        hsn_code: item.hsn_code,
                        batch_number: item.batch_number,
                        quantity: item.quantity,
                        free_quantity: item.free_quantity,
                        unit_price: item.unit_price,
                        discount_percent: item.discount_percent,
                        gst_percent: item.gst_percent,
                        total: item.calculated_total
                    })) as any,
                    totals: {
                        subtotal: order.subtotal_amount,
                        discount: order.discount_amount,
                        tax_amount: order.tax_amount,
                        cgst_amount: order.cgst_amount,
                        sgst_amount: order.sgst_amount,
                        igst_amount: order.igst_amount,
                        total_amount: order.total_amount,
                        final_amount: order.total_amount
                    },
                    addresses: {
                        billing: order.billing_address,
                        shipping: order.shipping_address
                    },
                    notes: order.notes
                }}
                documentType="sales-order"
                companyInfo={companyInfo as any}
                showPrintOptions={true}
            >
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 print-container order-preview-container">
                    {/* Header */}
                    <div className="mb-4 pb-3 border-b-2 border-blue-300 print-header">
                        <div className="flex justify-between items-start">
                            <div className="flex gap-4">
                                <div className="w-24 h-24 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                                    <span className="text-xs text-gray-400 text-center">Company<br />Logo</span>
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 mb-1">{companyInfo.name || 'Company identity unavailable'}</h1>
                                    {companyInfo.gst_number && (
                                        <p className="text-sm font-semibold text-gray-700 mb-1">GSTIN: {companyInfo.gst_number}</p>
                                    )}
                                    <p className="text-xs text-gray-600">{companyInfo.address || ''}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold text-blue-700 mb-2">SALES ORDER</h2>
                                <div className="bg-gray-50 border border-gray-200 rounded p-2">
                                    <p className="text-sm font-semibold text-gray-700">Order No: {order.order_number}</p>
                                    <p className="text-xs text-gray-600 mt-1">Date: {new Date(order.order_date).toLocaleDateString('en-IN')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Customer Details */}
                    <div className="mb-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h3 className="text-xs font-semibold text-gray-700 mb-2">Customer Details</h3>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                                    <p className="font-medium text-sm text-gray-900">{order.customer_name}</p>
                                    {selectedCustomer?.gst_number && (
                                        <p className="text-xs text-gray-500 mt-1">GSTIN: {selectedCustomer.gst_number}</p>
                                    )}
                                    {selectedCustomer?.drug_license_number && (
                                        <p className="text-xs text-gray-500">D.L. No: {selectedCustomer.drug_license_number}</p>
                                    )}
                                    {selectedCustomer?.phone && (
                                        <p className="text-xs text-gray-500">Phone: {selectedCustomer.phone}</p>
                                    )}
                                </div>

                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-gray-700">Settlement details</p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        A sales order does not select or publish a company bank account.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-semibold text-gray-700 mb-2">Commercial Details</h3>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                                    <p className="text-xs font-semibold text-gray-700">Payment terms</p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        Not part of the canonical sales-order contract. No payment term will be inferred or posted.
                                    </p>
                                </div>

                                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <label className="text-xs font-semibold text-gray-700 block">Expected Delivery</label>
                                    <input
                                        type="date"
                                        value={order.expected_delivery_date}
                                        onChange={(e) => setOrder(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                                        className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors print:hidden"
                                        min={order.order_date}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address Forms */}
                        {selectedCustomer && (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <AddressForm
                                    customer={selectedCustomer as any}
                                    addressData={order.billing_address_data as any}
                                    addressType="billing"
                                    onChange={(address: string) => setOrder(prev => ({ ...prev, billing_address: address }))}
                                    onSave={(addressData: any) => setOrder(prev => ({ ...prev, billing_address_data: addressData }))}
                                    className="bg-gray-50 border border-gray-200 rounded-lg"
                                />
                                <AddressForm
                                    customer={selectedCustomer as any}
                                    addressData={order.shipping_address_data as any}
                                    addressType="shipping"
                                    onChange={(address: string) => setOrder(prev => ({ ...prev, shipping_address: address }))}
                                    onSave={(addressData: any) => {
                                        const addrState = addressData?.state || addressData?.state_name;
                                        const gstType = determineGstTypeForSupply(
                                            companyInfo?.state, addrState,
                                            companyInfo?.gst_number, selectedCustomer?.gst_number
                                        );
                                        setOrder(prev => ({
                                            ...prev,
                                            shipping_address_data: addressData,
                                            gst_type: gstType,
                                            place_of_supply: addrState || companyInfo?.state || ''
                                        }));
                                    }}
                                    sameAsBilling={sameAsBilling}
                                    billingAddressData={order.billing_address_data as any}
                                    onSameAsBillingChange={(same: boolean) => {
                                        setSameAsBilling(same);
                                        if (same) {
                                            const billingState = (order.billing_address_data as any)?.state || (order.billing_address_data as any)?.state_name;
                                            const gstType = determineGstTypeForSupply(
                                                companyInfo?.state, billingState,
                                                companyInfo?.gst_number, selectedCustomer?.gst_number
                                            );
                                            setOrder(prev => ({
                                                ...prev,
                                                shipping_address: prev.billing_address,
                                                shipping_address_data: prev.billing_address_data,
                                                gst_type: gstType,
                                                place_of_supply: billingState || companyInfo?.state || ''
                                            }));
                                        }
                                    }}
                                    className="bg-gray-50 border border-gray-200 rounded-lg"
                                />
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-4">Order Items</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full border border-gray-200 print-table">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left py-2 px-3 text-xs font-medium text-blue-700 border-b">Item Details</th>
                                        <th className="text-center py-2 px-3 text-xs font-medium text-blue-700 border-b">Qty</th>
                                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">Rate</th>
                                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">GST %</th>
                                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, index) => (
                                        <tr key={index} className="border-b hover:bg-gray-50">
                                            <td className="py-2 px-3">
                                                <p className="text-sm font-medium">{item.product_name}</p>
                                                <p className="text-xs text-gray-500">Batch: {item.batch_number || 'Not available'}</p>
                                            </td>
                                            <td className="text-center py-2 px-3 text-sm font-medium">{item.quantity}</td>
                                            <td className="text-right py-2 px-3 text-sm">₹{formatExactDecimal(
                                                item.unit_price,
                                                `Order item ${index + 1} rate`,
                                                { scale: 4, maximumWholeDigits: 16 },
                                                2,
                                            )}</td>
                                            <td className="text-right py-2 px-3 text-sm">{item.gst_percent}%</td>
                                            <td className="text-right py-2 px-3 text-sm font-medium">₹{money(item.calculated_total || item.total, `Order item ${index + 1} total`)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Summary */}
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-sm font-semibold text-blue-700 mb-2">GST Breakdown</h4>
                                <div className="space-y-1">
                                    {order.gst_type === 'IGST' ? (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">IGST</span>
                                            <span className="font-medium">₹{money(order.igst_amount, 'Order IGST')}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">CGST</span>
                                                <span className="font-medium">₹{money(order.cgst_amount, 'Order CGST')}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">SGST</span>
                                                <span className="font-medium">₹{money(order.sgst_amount, 'Order SGST')}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between text-sm border-t pt-1">
                                        <span className="text-blue-700 font-medium">Total GST</span>
                                        <span className="font-semibold">₹{money(order.tax_amount, 'Order total GST')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-sm font-semibold text-blue-700 mb-2">Order Summary</h4>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Sub Total</span>
                                        <span className="font-medium">₹{money(order.subtotal_amount, 'Order subtotal')}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Total GST</span>
                                        <span className="font-medium">₹{money(order.tax_amount, 'Order total GST')}</span>
                                    </div>
                                    <div className="flex justify-between text-sm border-t pt-1">
                                        <span className="text-blue-700 font-semibold">Grand Total</span>
                                        <span className="font-bold text-lg text-blue-700">₹{money(order.total_amount, 'Order grand total')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Amount in Words */}
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-sm"><span className="font-medium">Exact Amount:</span> ₹{money(order.total_amount, 'Order grand total')}</p>
                        </div>

                        {/* Terms & Signature */}
                        <div className="grid grid-cols-2 gap-6 mt-4 pt-3 border-t border-gray-200">
                            <div>
                                <h4 className="text-xs font-semibold text-gray-700 mb-2">Terms & Conditions</h4>
                                <p className="text-xs text-gray-600">
                                    Only terms confirmed by the canonical order preview apply.
                                </p>
                            </div>
                            <div className="text-center">
                                <div className="h-12 border-b border-gray-300 mb-2"></div>
                                <p className="text-xs font-semibold text-gray-700">Authorized Signatory</p>
                                <p className="text-xs text-gray-500">For {companyInfo.name || 'Company identity unavailable'}</p>
                            </div>
                        </div>

                        {/* Thank You */}
                        <div className="text-center mt-4 pt-3 border-t border-gray-100">
                            <p className="text-sm text-gray-600">Thank you for your business!</p>
                            <p className="text-xs text-gray-400 mt-1">{companyInfo.name || 'Company identity unavailable'}</p>
                        </div>
                    </div>
                </div>
            </PrintUtility>

            {/* Notes Section */}
            <div className="mt-6">
                <NotesSection
                    value={order.notes}
                    onChange={(value: string) => setOrder(prev => ({ ...prev, notes: value }))}
                    placeholder="Add any special instructions or notes..."
                    rows={3}
                />
            </div>
        </div>
    );
};

export default OrderReviewStep;
