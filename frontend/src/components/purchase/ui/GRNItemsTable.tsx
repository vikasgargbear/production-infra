import React, { useRef, useEffect } from 'react';
import { Package, Trash2 } from 'lucide-react';
import { NumberInput, MonthYearPicker } from '../../global';

/**
 * Type definitions specific to GRN Items
 */
export interface GRNItem {
    id?: string | number;
    product_id: string | number;
    product_name: string;
    product_code?: string;

    // Packing
    pack_type?: string;
    pack_size?: number;
    packages_per_box?: number;  // Backend standard: packs in one box

    // Batch & Expiry
    batch_number?: string;
    expiry_date?: string;

    // Quantities
    ordered_qty?: number;
    received_qty?: number;
    free_quantity?: number;

    // Pricing
    mrp?: number;
    unit_price?: number;
    unit_price?: number;
    discount_percent?: number;
    tax_percent?: number;

    // Status
    quality_status?: string;

    [key: string]: any;
}

interface GRNItemsTableProps {
    items: GRNItem[];
    onUpdateItem: (index: number, field: string, value: any) => void;
    onRemoveItem: (index: number) => void;
}

const GRNItemsTable: React.FC<GRNItemsTableProps> = ({
    items,
    onUpdateItem,
    onRemoveItem
}) => {

    // Helper to format currency
    const formatCurrency = (amount: number) => {
        return `₹${(amount || 0).toFixed(2)}`;
    };

    // Calculate total for a row
    const calculateRowTotal = (item: GRNItem) => {
        const qty = parseFloat(String(item.received_qty || 0));
        const price = parseFloat(String(item.unit_price || 0));
        const taxPercent = parseFloat(String(item.tax_percent || 0));
        const subtotal = qty * price;
        const tax = subtotal * (taxPercent / 100);
        return subtotal + tax;
    };

    if (!items || items.length === 0) {
        return null; // Or return a "No items" placeholder if desired
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                    <tr>
                        <th className="px-3 py-3 min-w-[150px]">Product</th>
                        <th className="px-3 py-3 text-center min-w-[100px]">Pack Type</th>
                        <th className="px-3 py-3 text-center min-w-[120px]">Pack Config</th>
                        <th className="px-3 py-3 text-center min-w-[100px]">Batch</th>
                        <th className="px-3 py-3 text-center min-w-[100px]">Expiry</th>
                        <th className="px-3 py-3 text-center w-16">Ordered</th>
                        <th className="px-3 py-3 text-center w-16">Recv</th>
                        <th className="px-3 py-3 text-center w-16">Free</th>
                        <th className="px-3 py-3 text-right min-w-[80px]">MRP</th>
                        <th className="px-3 py-3 text-right min-w-[80px]">Rate</th>
                        <th className="px-3 py-3 text-center w-14">Disc%</th>
                        <th className="px-3 py-3 text-center w-16">Tax%</th>
                        <th className="px-3 py-3 text-center min-w-[100px]">Status</th>
                        <th className="px-3 py-3 text-right min-w-[100px]">Total</th>
                        <th className="px-3 py-3 text-center w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {items.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-gray-50/50 transition-colors">
                            {/* Product Name */}
                            <td className="px-3 py-2 font-medium text-gray-900">
                                <div>{item.product_name}</div>
                                <div className="text-xs text-gray-500">{item.product_code}</div>
                            </td>

                            {/* Pack Type */}
                            <td className="px-3 py-2 text-center">
                                <select
                                    value={item.pack_type || 'STRIP'}
                                    onChange={(e) => onUpdateItem(index, 'pack_type', e.target.value)}
                                    className="w-full text-xs border-gray-200 rounded-md focus:ring-1 focus:ring-green-500 max-w-[100px]"
                                >
                                    <option value="STRIP">STRIP</option>
                                    <option value="BOX">BOX</option>
                                    <option value="BOTTLE">BOTTLE</option>
                                    <option value="VIAL">VIAL</option>
                                    <option value="TUBE">TUBE</option>
                                </select>
                            </td>

                            {/* Pack Config */}
                            <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                    <NumberInput
                                        value={item.pack_size}
                                        onChange={(value) => onUpdateItem(index, 'pack_size', value)}
                                        min={1}
                                        className="w-10 text-center text-xs"
                                    />
                                    <span className="text-gray-400">×</span>
                                    <NumberInput
                                        value={item.packages_per_box}
                                        onChange={(value) => onUpdateItem(index, 'packages_per_box', value)}
                                        min={1}
                                        className="w-10 text-center text-xs"
                                    />
                                </div>
                            </td>

                            {/* Batch */}
                            <td className="px-3 py-2">
                                <input
                                    type="text"
                                    value={item.batch_number || ''}
                                    onChange={(e) => onUpdateItem(index, 'batch_number', e.target.value)}
                                    className="w-full text-xs text-center border-gray-200 rounded-md focus:ring-1 focus:ring-green-500"
                                    placeholder="Batch"
                                />
                            </td>

                            {/* Expiry */}
                            <td className="px-3 py-2 flex justify-center">
                                <MonthYearPicker
                                    value={item.expiry_date}
                                    onChange={(value) => onUpdateItem(index, 'expiry_date', value)}
                                    className="w-20 text-xs"
                                />
                            </td>

                            {/* Ordered Qty */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.ordered_qty}
                                    onChange={(value) => onUpdateItem(index, 'ordered_qty', value)}
                                    min={0}
                                    className="w-full text-center"
                                />
                            </td>

                            {/* Received Qty */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.received_qty}
                                    onChange={(value) => onUpdateItem(index, 'received_qty', value)}
                                    min={0}
                                    className="w-full text-center font-medium text-green-700 bg-green-50/50"
                                />
                            </td>

                            {/* Free Qty */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.free_quantity}
                                    onChange={(value) => onUpdateItem(index, 'free_quantity', value)}
                                    min={0}
                                    className="w-full text-center"
                                />
                            </td>

                            {/* MRP */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.mrp}
                                    onChange={(value) => onUpdateItem(index, 'mrp', value)}
                                    min={0}
                                    className="w-full text-right"
                                />
                            </td>

                            {/* Rate (Unit Price) */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.unit_price}
                                    onChange={(value) => onUpdateItem(index, 'unit_price', value)}
                                    min={0}
                                    className="w-full text-right"
                                />
                            </td>

                            {/* Discount % */}
                            <td className="px-3 py-2">
                                <NumberInput
                                    value={item.discount_percent}
                                    onChange={(value) => onUpdateItem(index, 'discount_percent', value)}
                                    min={0}
                                    max={100}
                                    className="w-full text-center"
                                />
                            </td>

                            {/* Tax % */}
                            <td className="px-3 py-2 text-center">
                                <select
                                    value={item.tax_percent || 12}
                                    onChange={(e) => onUpdateItem(index, 'tax_percent', parseFloat(e.target.value))}
                                    className="w-full text-xs border-gray-200 rounded-md focus:ring-1 focus:ring-green-500 p-1"
                                >
                                    <option value="0">0%</option>
                                    <option value="5">5%</option>
                                    <option value="12">12%</option>
                                    <option value="18">18%</option>
                                    <option value="28">28%</option>
                                </select>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2 text-center">
                                <select
                                    value={item.quality_status || 'Approved'}
                                    onChange={(e) => onUpdateItem(index, 'quality_status', e.target.value)}
                                    className={`w-full text-xs border-gray-200 rounded-md focus:ring-1 focus:ring-green-500 font-medium ${item.quality_status === 'Approved' ? 'text-green-600' :
                                        item.quality_status === 'Rejected' ? 'text-red-600' :
                                            'text-yellow-600'
                                        }`}
                                >
                                    <option value="Approved">Approved</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </td>

                            {/* Total Row */}
                            <td className="px-3 py-2 text-right font-bold text-gray-900">
                                {formatCurrency(calculateRowTotal(item))}
                            </td>

                            {/* Remove Action */}
                            <td className="px-3 py-2 text-center">
                                <button
                                    onClick={() => onRemoveItem(index)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default GRNItemsTable;
