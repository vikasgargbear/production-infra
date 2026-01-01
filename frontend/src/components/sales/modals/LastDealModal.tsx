import React, { useState, useEffect } from 'react';
import { X, Clock, TrendingUp, User, Calendar } from 'lucide-react';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { invoiceAPI } from '../../../services/api';

interface Deal {
    invoice_date: string;
    customer_name: string;
    rate?: number;
    quantity?: number;
    discount_percent?: number;
    total_amount?: number;
    invoice_no?: string;
}

interface LastDealModalProps {
    isOpen: boolean;
    onClose: () => void;
    productId?: number;
    productName?: string;
    customerId?: number;
}

const LastDealModal: React.FC<LastDealModalProps> = ({ isOpen, onClose, productId, productName, customerId }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [lastDeals, setLastDeals] = useState<Deal[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEscapeKey(() => onClose(), isOpen, 'LastDealModal');

    useEffect(() => {
        if (isOpen && productId) {
            loadLastDeals();
        }
    }, [isOpen, productId, customerId]);

    const loadLastDeals = async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            // Fetch last deals for this product (optionally filtered by customer)
            // API expects null instead of number|undefined for optional customerId
            const response = await (invoiceAPI.getLastDeals as any)(productId, customerId);
            setLastDeals(response.data || []);
        } catch (err) {
            console.error('Failed to load last deals:', err);
            setError('Failed to load last deal information');
            setLastDeals([]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Clock size={20} />
                        Last Deal (Alt+L)
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Product Info */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Product</div>
                        <div className="font-semibold text-gray-900">{productName || 'Selected Product'}</div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-sm text-gray-600">Loading last deals...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <p className="text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Last Deals List */}
                    {!loading && !error && lastDeals.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <TrendingUp size={16} />
                                Recent Deals ({lastDeals.length})
                            </h4>

                            <div className="border rounded-lg divide-y divide-gray-200">
                                {lastDeals.map((deal, index) => (
                                    <div key={index} className="p-3 hover:bg-gray-50">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Calendar size={14} />
                                                    {new Date(deal.invoice_date).toLocaleDateString('en-IN', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                                                    <User size={14} />
                                                    {deal.customer_name}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-gray-900">₹{deal.rate?.toFixed(2)}</div>
                                                <div className="text-sm text-gray-600">per unit</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 text-sm mt-2 pt-2 border-t border-gray-100">
                                            <div>
                                                <div className="text-gray-600">Qty</div>
                                                <div className="font-semibold">{deal.quantity}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-600">Discount</div>
                                                <div className="font-semibold">{deal.discount_percent || 0}%</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-600">Total</div>
                                                <div className="font-semibold">₹{deal.total_amount?.toFixed(2)}</div>
                                            </div>
                                        </div>

                                        {deal.invoice_no && (
                                            <div className="text-xs text-gray-500 mt-2">
                                                Invoice: {deal.invoice_no}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No Deals */}
                    {!loading && !error && lastDeals.length === 0 && (
                        <div className="text-center py-8">
                            <Clock size={48} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-gray-600">No previous deals found</p>
                            <p className="text-sm text-gray-500 mt-1">This product hasn't been sold before</p>
                        </div>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Close (Esc)
                    </button>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded">Alt+L</kbd> to view last deal •
                    <kbd className="px-2 py-1 bg-gray-100 rounded ml-1">Esc</kbd> to close
                </div>
            </div>
        </div>
    );
};

export default LastDealModal;
