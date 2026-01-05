import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, TrendingUp, DollarSign, Percent, Loader2 } from 'lucide-react';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { apiClient } from '../../../services/api';

// Shared Types
import { InvoiceItem } from '../invoice/types/invoiceTypes';

interface ItemWithProfit extends InvoiceItem {
    costRate: number;
    totalCost: number;
    totalSelling: number;
    profit: number;
    profitPercent: number;
    margin: number;
}

interface Totals {
    totalCost: number;
    totalSelling: number;
    totalProfit: number;
}

interface ItemProfitModalProps {
    isOpen: boolean;
    onClose: () => void;
    items?: InvoiceItem[];
}

const ItemProfitModal: React.FC<ItemProfitModalProps> = ({ isOpen, onClose, items = [] }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [itemsWithCost, setItemsWithCost] = useState<InvoiceItem[]>([]);
    const hasFetchedRef = useRef<boolean>(false);

    useEscapeKey(() => onClose(), isOpen, 'ItemProfitModal');

    // Fetch cost data for all items when modal opens
    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setItemsWithCost([]);
            setLoading(false);
            hasFetchedRef.current = false;
            return;
        }

        if (items.length > 0 && !hasFetchedRef.current) {
            console.log('=== ItemProfitModal OPENED ===');
            console.log('Items received:', JSON.stringify(items, null, 2));
            console.log('First item structure:', items[0]);
            hasFetchedRef.current = true;
            fetchCostData();
        } else if (items.length === 0) {
            console.warn('ItemProfitModal - Modal opened but no items provided!');
            setItemsWithCost([]);
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, items.length]); // Re-fetch when modal opens or items count changes

    const fetchCostData = async (): Promise<void> => {
        setLoading(true);

        try {
            // Fetch batch cost data for all items that have batch_id
            const itemsWithCostData = await Promise.all(
                items.map(async (item) => {
                    if (!item.batch_id) {
                        console.log(`Item ${item.product_name} has no batch_id`);
                        return { ...item, cost_per_unit: 0, cost_source: 'none' };
                    }

                    try {
                        // Fetch batch details to get cost_per_unit
                        const response = await apiClient.get(`/inventory/batches/${item.batch_id}`);

                        // Handle different response structures
                        const batch = response.data?.batch || response.data?.data || response.data;

                        // Parse cost from string to number (DB returns as string like "30.0000")
                        const costPerUnit = parseFloat(batch.cost_per_unit) || 0;
                        const weightedAvgCost = parseFloat(batch.weighted_average_cost) || 0;

                        const finalCost = costPerUnit || weightedAvgCost || 0;

                        console.log(`Batch ${item.batch_id} (${item.product_name}): cost = ₹${finalCost}`);

                        return {
                            ...item,
                            cost_per_unit: finalCost,
                            cost_source: costPerUnit > 0 ? 'batch' : (weightedAvgCost > 0 ? 'weighted_avg' : 'none')
                        };
                    } catch (error) {
                        console.error(`Failed to fetch cost for batch ${item.batch_id}:`, (error as Error).message);
                        return { ...item, cost_per_unit: 0, cost_source: 'error' };
                    }
                })
            );

            setItemsWithCost(itemsWithCostData);
        } catch (error) {
            console.error('Failed to fetch cost data:', error);
            setItemsWithCost(items.map(item => ({ ...item, cost_per_unit: 0, cost_source: 'error' })));
        } finally {
            setLoading(false);
        }
    };

    // Calculate profit details for each item - memoized to prevent recalculation
    const itemsWithProfit: ItemWithProfit[] = useMemo(() => {
        return itemsWithCost.map(item => {
            // Handle multiple field name variations
            const quantity = parseFloat(String(item.quantity || item.qty || item.base_quantity)) || 0;
            const sellingRate = parseFloat(String(
                item.rate ||
                item.sale_price ||
                item.selling_price ||
                item.unit_price ||
                item.sale_price_per_unit
            )) || 0;
            const costRate = parseFloat(String(item.cost_per_unit)) || 0;
            const discountAmount = parseFloat(String(item.discount_amount)) || 0;

            const totalCost = costRate * quantity;
            const totalSelling = (sellingRate * quantity) - discountAmount;
            const profit = totalSelling - totalCost;
            const profitPercent = totalCost > 0 ? ((profit / totalCost) * 100) : 0;
            const margin = totalSelling > 0 ? ((profit / totalSelling) * 100) : 0;

            return {
                ...item,
                quantity,
                costRate,
                totalCost,
                totalSelling,
                profit,
                profitPercent,
                margin
            };
        });
    }, [itemsWithCost]);

    if (!isOpen) return null;

    const totals: Totals = itemsWithProfit.reduce((acc, item) => ({
        totalCost: acc.totalCost + item.totalCost,
        totalSelling: acc.totalSelling + item.totalSelling,
        totalProfit: acc.totalProfit + item.profit
    }), { totalCost: 0, totalSelling: 0, totalProfit: 0 });

    const overallProfitPercent = totals.totalCost > 0
        ? ((totals.totalProfit / totals.totalCost) * 100)
        : 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-[900px] max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp size={20} />
                        Item Cost & Profit Analysis (Shift+~)
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Loading State */}
                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            <span className="ml-3 text-gray-600">Loading cost data...</span>
                        </div>
                    )}

                    {/* Overall Summary */}
                    {!loading && (
                        <>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-3 rounded-lg">
                                    <div className="text-sm text-gray-600">Total Cost</div>
                                    <div className="text-xl font-bold text-gray-900">₹{totals.totalCost.toFixed(2)}</div>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg">
                                    <div className="text-sm text-gray-600">Total Selling</div>
                                    <div className="text-xl font-bold text-gray-900">₹{totals.totalSelling.toFixed(2)}</div>
                                </div>
                                <div className={`p-3 rounded-lg ${totals.totalProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                    <div className="text-sm text-gray-600">Total Profit</div>
                                    <div className={`text-xl font-bold ${totals.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        ₹{totals.totalProfit.toFixed(2)}
                                    </div>
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg">
                                    <div className="text-sm text-gray-600">Profit %</div>
                                    <div className={`text-xl font-bold ${overallProfitPercent >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                        {overallProfitPercent.toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Product</th>
                                            <th className="px-3 py-2 text-center font-semibold text-gray-700">Qty</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Cost Rate</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Sell Rate</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Cost</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Sell</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Profit</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Profit%</th>
                                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Margin%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {itemsWithProfit.map((item, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-gray-900">{item.product_name}</div>
                                                    {item.batch_number && (
                                                        <div className="text-xs text-gray-500">Batch: {item.batch_number}</div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                <td className="px-3 py-2 text-right">₹{item.costRate.toFixed(2)}</td>
                                                <td className="px-3 py-2 text-right">₹{(item.rate || 0).toFixed(2)}</td>
                                                <td className="px-3 py-2 text-right">₹{item.totalCost.toFixed(2)}</td>
                                                <td className="px-3 py-2 text-right">₹{item.totalSelling.toFixed(2)}</td>
                                                <td className={`px-3 py-2 text-right font-semibold ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    ₹{item.profit.toFixed(2)}
                                                </td>
                                                <td className={`px-3 py-2 text-right ${item.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {item.profitPercent.toFixed(1)}%
                                                </td>
                                                <td className={`px-3 py-2 text-right ${item.margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                    {item.margin.toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-100 font-semibold">
                                        <tr>
                                            <td colSpan={4} className="px-3 py-2">Total</td>
                                            <td className="px-3 py-2 text-right">₹{totals.totalCost.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right">₹{totals.totalSelling.toFixed(2)}</td>
                                            <td className={`px-3 py-2 text-right ${totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                ₹{totals.totalProfit.toFixed(2)}
                                            </td>
                                            <td className={`px-3 py-2 text-right ${overallProfitPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {overallProfitPercent.toFixed(1)}%
                                            </td>
                                            <td className="px-3 py-2"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Legend & Info */}
                            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 space-y-1">
                                <div className="flex items-center gap-2">
                                    <Percent size={14} />
                                    <strong>Profit %:</strong> Profit as percentage of cost (Profit / Cost × 100)
                                </div>
                                <div className="flex items-center gap-2">
                                    <DollarSign size={14} />
                                    <strong>Margin %:</strong> Profit as percentage of selling price (Profit / Selling × 100)
                                </div>
                                {totals.totalCost === 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-200 text-amber-600">
                                        ⚠️ <strong>Note:</strong> Cost prices are loaded from batch master data. Items showing ₹0.00 cost may not have purchase/cost prices set in their batch records.
                                    </div>
                                )}
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Close (Esc)
                            </button>
                        </>
                    )}
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded">Shift+~</kbd> to view profit analysis •
                    <kbd className="px-2 py-1 bg-gray-100 rounded ml-1">Esc</kbd> to close
                </div>
            </div>
        </div>
    );
};

export default ItemProfitModal;
