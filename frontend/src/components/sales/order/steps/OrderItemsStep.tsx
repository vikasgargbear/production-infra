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
import type { Order } from '../../../../types/models';
import type { Customer } from '../../../../types/models';
import type { ProductSearchRef } from '../../../global/search/ProductSearch';
import { resolvedSalesOrderDeliveryAddress } from '../../utils/canonicalSalesChainCommand';
import { usePermissions } from '../../../../hooks/usePermissions';
import { FOUNDATION_CAPABILITIES } from '../../../../config/canonicalCapabilities';

// Using canonical types from /types/models - no local duplicates

interface OrderItemsStepProps {
    order: Order;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    maximumOrderDate: string;
    selectedCustomer: Customer | null;
    message: string;
    messageType: string;
    onCustomerSelect: (customer: Customer | null) => Promise<void>;
    onProductSelect: (product: any) => void;
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
    maximumOrderDate,
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
    const { hasCapability } = usePermissions();
    const canManageCustomers = hasCapability(FOUNDATION_CAPABILITIES.customer);
    const canManageProducts = hasCapability(FOUNDATION_CAPABILITIES.product);
    const productSearchRef = useRef<ProductSearchRef>(null);
    const itemsTableRef = useRef<HTMLDivElement>(null);
    const deliveryAddress = resolvedSalesOrderDeliveryAddress(order.shipping_address_data);
    const canRetryCustomerAddress = messageType === 'error'
        && Boolean(selectedCustomer)
        && !deliveryAddress
        && /address/i.test(message);
    return (
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">
            {/* Message Display */}
            {message && (
                <div role="alert" className={`mb-4 flex flex-wrap items-center gap-2 rounded p-3 ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                    {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                    <span className="min-w-0 flex-1">{message}</span>
                    {canRetryCustomerAddress && selectedCustomer && (
                        <button
                            type="button"
                            onClick={() => { void onCustomerSelect(selectedCustomer); }}
                            className="min-h-11 rounded border border-red-300 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-50"
                        >
                            Retry address
                        </button>
                    )}
                </div>
            )}

            {/* Top Section - Dates and Import */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StandardDatePicker
                    label="Order Date"
                    value={order.order_date}
                    onChange={(value: string) => setOrder(prev => ({ ...prev, order_date: value }))}
                    max={maximumOrderDate || undefined}
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
                    {canManageCustomers && <button
                        onClick={onShowImportModal}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm transition-colors hover:bg-blue-50"
                    >
                        <FileInput className="w-4 h-4 text-gray-400" />
                        <span>Import from Invoice/Challan</span>
                    </button>}
                </div>
            </div>

            {/* Customer Section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        CUSTOMER
                    </h3>
                    {canManageProducts && <button
                        onClick={onShowCustomerModal}
                        className="min-h-11 min-w-[140px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Create Customer
                    </button>}
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
                    {selectedCustomer && deliveryAddress && (
                        <p
                            className="mt-3 flex items-center gap-2 text-sm text-green-700"
                            data-testid={`sales-order-delivery-address-${deliveryAddress.id}-v${deliveryAddress.rowVersion}`}
                        >
                            <CheckCircle className="h-4 w-4" aria-hidden="true" />
                            Delivery address ready
                        </p>
                    )}
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
                        className="min-h-11 min-w-[140px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Create Product
                    </button>
                </div>
                <ProductSearch
                    ref={productSearchRef}
                    onAddItem={onProductSelect as any}
                    onCreateProduct={onCreateProduct as any}
                    enforceFefo
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
                        preserveExactDecimals
                        quantityDecimalPlaces={2}
                        showFreeSupplyTaxTreatment
                    />
                </div>
            )}
        </div>
    );
};

export default OrderItemsStep;
