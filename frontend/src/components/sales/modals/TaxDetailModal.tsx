import React from 'react';
import { X, FileText } from 'lucide-react';
import useEscapeKey from '../../../hooks/useEscapeKey';

interface InvoiceItem {
    gst_rate?: number;
    quantity?: number;
    rate?: number;
    discount_amount?: number;
    [key: string]: unknown;
}

interface InvoiceTotals {
    subtotal?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total_gst?: number;
    delivery_charges?: number;
    round_off?: number;
    total_amount?: number;
    [key: string]: unknown;
}

interface Invoice {
    invoice_no?: string;
    customer_name?: string;
    gst_type?: string;
    items?: InvoiceItem[];
    totals?: InvoiceTotals;
    [key: string]: unknown;
}

interface TaxGroup {
    rate: number;
    items: InvoiceItem[];
    taxable_amount: number;
    cgst: number;
    sgst: number;
    igst: number;
}

interface TaxDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice | null;
}

const TaxDetailModal: React.FC<TaxDetailModalProps> = ({ isOpen, onClose, invoice }) => {
    useEscapeKey(() => onClose(), isOpen, 'TaxDetailModal');

    if (!isOpen || !invoice) return null;

    const totals = invoice.totals || {};
    const gstType = invoice.gst_type || 'CGST/SGST';

    // Group items by tax rate
    const itemsByTaxRate: Record<number, TaxGroup> = {};
    (invoice.items || []).forEach(item => {
        const rate = item.gst_rate || 0;
        if (!itemsByTaxRate[rate]) {
            itemsByTaxRate[rate] = {
                rate,
                items: [],
                taxable_amount: 0,
                cgst: 0,
                sgst: 0,
                igst: 0
            };
        }

        const taxableAmount = (item.quantity || 0) * (item.rate || 0) - (item.discount_amount || 0);
        itemsByTaxRate[rate].items.push(item);
        itemsByTaxRate[rate].taxable_amount += taxableAmount;

        if (gstType === 'IGST') {
            itemsByTaxRate[rate].igst += taxableAmount * (rate / 100);
        } else {
            const halfRate = rate / 2;
            itemsByTaxRate[rate].cgst += taxableAmount * (halfRate / 100);
            itemsByTaxRate[rate].sgst += taxableAmount * (halfRate / 100);
        }
    });

    const taxGroups = Object.values(itemsByTaxRate);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-[800px] max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileText size={20} />
                        Tax Detail (F10)
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Invoice Summary */}
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-sm text-gray-600">Invoice No</div>
                                <div className="font-semibold">{invoice.invoice_no}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Customer</div>
                                <div className="font-semibold">{invoice.customer_name}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">GST Type</div>
                                <div className="font-semibold">{gstType}</div>
                            </div>
                        </div>
                    </div>

                    {/* Tax Breakdown by Rate */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">GST Rate</th>
                                    <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Items</th>
                                    <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Taxable Amount</th>
                                    {gstType === 'IGST' ? (
                                        <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">IGST</th>
                                    ) : (
                                        <>
                                            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">CGST</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">SGST</th>
                                        </>
                                    )}
                                    <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total Tax</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {taxGroups.map((group, index) => {
                                    const totalTax = gstType === 'IGST' ? group.igst : (group.cgst + group.sgst);
                                    return (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm font-medium">{group.rate}%</td>
                                            <td className="px-4 py-3 text-sm text-right">{group.items.length}</td>
                                            <td className="px-4 py-3 text-sm text-right">₹{group.taxable_amount.toFixed(2)}</td>
                                            {gstType === 'IGST' ? (
                                                <td className="px-4 py-3 text-sm text-right">₹{group.igst.toFixed(2)}</td>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-3 text-sm text-right">₹{group.cgst.toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-sm text-right">₹{group.sgst.toFixed(2)}</td>
                                                </>
                                            )}
                                            <td className="px-4 py-3 text-sm text-right font-semibold">₹{totalTax.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-100 font-semibold">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3 text-sm">Total</td>
                                    <td className="px-4 py-3 text-sm text-right">₹{totals.subtotal?.toFixed(2) || '0.00'}</td>
                                    {gstType === 'IGST' ? (
                                        <td className="px-4 py-3 text-sm text-right">₹{totals.igst?.toFixed(2) || '0.00'}</td>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 text-sm text-right">₹{totals.cgst?.toFixed(2) || '0.00'}</td>
                                            <td className="px-4 py-3 text-sm text-right">₹{totals.sgst?.toFixed(2) || '0.00'}</td>
                                        </>
                                    )}
                                    <td className="px-4 py-3 text-sm text-right">₹{totals.total_gst?.toFixed(2) || '0.00'}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Final Summary */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Subtotal (Before Tax)</span>
                            <span className="font-semibold">₹{totals.subtotal?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total GST</span>
                            <span className="font-semibold text-blue-600">₹{totals.total_gst?.toFixed(2) || '0.00'}</span>
                        </div>
                        {(totals.delivery_charges || 0) > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Delivery Charges</span>
                                <span className="font-semibold">₹{totals.delivery_charges?.toFixed(2) || '0.00'}</span>
                            </div>
                        )}
                        {totals.round_off !== 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Round Off</span>
                                <span className="font-semibold">{(totals.round_off || 0) >= 0 ? '+' : ''}₹{totals.round_off?.toFixed(2) || '0.00'}</span>
                            </div>
                        )}
                        <div className="border-t pt-2 mt-2">
                            <div className="flex justify-between text-lg">
                                <span className="font-bold text-gray-900">Grand Total</span>
                                <span className="font-bold text-gray-900">₹{totals.total_amount?.toFixed(2) || '0.00'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Close (Esc)
                    </button>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded">F10</kbd> to view tax detail •
                    <kbd className="px-2 py-1 bg-gray-100 rounded ml-1">Esc</kbd> to close
                </div>
            </div>
        </div>
    );
};

export default TaxDetailModal;
