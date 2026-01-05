/**
 * OrderItemsStep Component
 * Step 1 of sales order flow - customer and product selection
 */

import React from 'react';
import {
    CheckCircle, AlertCircle, FileInput, User, Package
} from 'lucide-react';
import {
    CustomerSearch,
    ProductSearchSimple,
    ItemsTable,
    StandardDatePicker
} from '../../../global';
import type { Order, OrderItem } from '../../../../types/models';

interface Customer {
    customer_id?: number | string;
    id?: number | string;
    customer_name?: string;
    name?: string;
    phone?: string;
    gst_number?: string;
    drug_license_number?: string;
}

interface Product {
    product_id: number | string;
    product_name: string;
    [key: string]: unknown;
}

interface OrderItemsStepProps {
    order: Order;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    selectedCustomer: Customer | null;
    message: string;
    messageType: string;
    onCustomerSelect: (customer: Customer | null) => Promise<void>;
    onProductSelect: (product: Product) => void;
    onUpdateItem: (index: number, field: string, value: unknown) => void;
    onRemoveItem: (index: number) => void;
    onShowCustomerModal: () => void;
    onShowProductModal: () => void;
    onShowImportModal: () => void;
    onCreateProduct: (productName: string) => void;
}

const OrderItemsStep: React.FC<OrderItemsStepProps> = ({
    order,
    setOrder,
    selectedCustomer,
    message,
    messageType,
    onCustomerSelect,
    onProductSelect,
    onUpdateItem,
    onRemoveItem,
    onShowCustomerModal,
    onShowProductModal,
    onShowImportModal,
    onCreateProduct
}) => {
    return (
        <div className="max-w-6xl mx-auto px-6 py-6">
            {/* Message Display */}
            {message && (
                <div className={`mb-4 p-3 rounded flex items-center ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                    {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                    {message}
                </div>
            )}

            {/* Top Section - Dates and Import */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <StandardDatePicker
                    label="Order Date"
                    value={order.order_date}
                    onChange={(value: string) => setOrder(prev => ({ ...prev, order_date: value }))}
                    required
                    size="sm"
                />
                <StandardDatePicker
                    label="Expected Delivery"
                    value={order.expected_delivery_date || ''}
                    onChange={(value: string) => setOrder(prev => ({ ...prev, expected_delivery_date: value }))}
                    size="sm"
                />
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Import Data</label>
                    <button
                        onClick={onShowImportModal}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                    >
                        <FileInput className="w-4 h-4 text-gray-400" />
                        <span>Import from Invoice/Challan</span>
                    </button>
                </div>
            </div>

            {/* Customer Section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        CUSTOMER
                    </h3>
                    <button
                        onClick={onShowCustomerModal}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Create Customer
                    </button>
                </div>
                <CustomerSearch
                    value={selectedCustomer as any}
                    onChange={onCustomerSelect as any}
                    onCreateNew={onShowCustomerModal}
                    displayMode="inline"
                    placeholder="Search customer by name, phone, or code..."
                    required
                />
            </div>

            {/* Products Section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                        <Package className="w-4 h-4 mr-2" />
                        PRODUCTS
                    </h3>
                    <button
                        onClick={onShowProductModal}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Create Product
                    </button>
                </div>
                <ProductSearchSimple
                    onAddItem={onProductSelect as any}
                    onCreateProduct={onCreateProduct as any}
                />
            </div>

            {/* Items Table */}
            {order.items.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                        <Package className="w-4 h-4 mr-2" />
                        ORDER ITEMS
                    </h3>
                    <ItemsTable
                        items={order.items as any}
                        onUpdateItem={onUpdateItem}
                        onRemoveItem={onRemoveItem}
                    />
                </div>
            )}
        </div>
    );
};

export default OrderItemsStep;
