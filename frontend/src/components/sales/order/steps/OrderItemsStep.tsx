/**
 * OrderItemsStep Component
 * Step 1 of sales order flow - customer and product selection
 */

import React, { useRef } from 'react';
import {
    CheckCircle, AlertCircle, FileInput, User, Package
} from 'lucide-react';
import {
    CustomerSearch,
    ProductSearch,
    ItemsTableKeyboard,
    StandardDatePicker
} from '../../../global';
import type { Order, OrderItem } from '../../../../types/models';
import type { Customer, Product } from '../../../../types/models';
import type { ProductSearchRef } from '../../../global/search/ProductSearch';

// Using canonical types from /types/models - no local duplicates

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
    const productSearchRef = useRef<ProductSearchRef>(null);
    const itemsTableRef = useRef<HTMLDivElement>(null);
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Import Data</label>
                    <button
                        onClick={onShowImportModal}
                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
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
                        className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Create Customer
                    </button>
                </div>
                {/* White card wrapper - consistent with ProductSearch */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <CustomerSearch
                        value={selectedCustomer as any}
                        onChange={onCustomerSelect as any}
                        displayMode="compact"
                        placeholder="Search customer by name, phone, or code..."
                        showCreateButton={false}
                        clearable={true}
                        tabIndex={1}
                        nextFocusRef={productSearchRef as any}
                    />
                </div>
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
                        className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Create Product
                    </button>
                </div>
                <ProductSearch
                    ref={productSearchRef}
                    onAddItem={onProductSelect as any}
                    onCreateProduct={onCreateProduct as any}
                    tabIndex={2}
                />
            </div>

            {/* Items Table */}
            {order.items.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                        <Package className="w-4 h-4 mr-2" />
                        ORDER ITEMS
                    </h3>
                    <ItemsTableKeyboard
                        ref={itemsTableRef as any}
                        items={order.items as any}
                        onUpdateItem={onUpdateItem}
                        onRemoveItem={onRemoveItem}
                        productSearchRef={productSearchRef as any}
                        currencySymbol="₹"
                    />
                </div>
            )}
        </div>
    );
};

export default OrderItemsStep;
