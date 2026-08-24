import React, { RefObject, useEffect, useCallback } from 'react';
import { FileText, User, Package, FileInput, AlertCircle, X } from 'lucide-react';

// Global Components
import { ModuleHeader, StandardDatePicker, CustomerSearch, ProductSearch, ItemsTableKeyboard } from '../../../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';

// Modals
import CustomerCreation from '../../../global/creation/CustomerCreation';
import { ProductCreationModal, GSTCalculator, DocumentImportModal } from '../../../global';
import BillDiscountModal from '../../modals/BillDiscountModal';
import TaxDetailModal from '../../modals/TaxDetailModal';
import CashCalculatorModal from '../../modals/CashCalculatorModal';
import LastDealModal from '../../modals/LastDealModal';
import ItemProfitModal from '../../modals/ItemProfitModal';

// Utils
import { toast } from 'react-toastify';
import { ordersApi, challansApi } from '../../../../services/api';
import { extractDocumentCollection, extractDocumentDetail } from '../../utils/documentImport';

// Shared Types
import { Customer, Invoice, InvoiceItem, Employee, ProductForLastDeal } from '../types/invoiceTypes';
import InvoiceItemsFooter from './InvoiceItemsFooter';

interface InvoiceItemsStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
    employees: Employee[];
    selectedMR: Employee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<Employee | null>>;
    isLoading: boolean;
    error: string | null;
    setError: React.Dispatch<React.SetStateAction<string | null>>;

    onClose: () => void;
    onReset: () => void;
    onContinue: () => void;
    // Refs
    productSearchRef: RefObject<HTMLInputElement>;
    itemsTableRef: RefObject<HTMLDivElement>;
    // Handlers
    handleCustomerSelect: (customer: Customer) => void;
    handleAddItem: (product: unknown) => void;
    handleUpdateItem: (index: number, updates: Partial<InvoiceItem>) => void;
    handleRemoveItem: (index: number) => void;
    handleImport: (data: unknown) => void;
    handleApplyBillDiscount: (discount: number) => void;
    // Modal states
    showCustomerModal: boolean;
    setShowCustomerModal: React.Dispatch<React.SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: React.Dispatch<React.SetStateAction<boolean>>;
    showGSTCalculator: boolean;
    setShowGSTCalculator: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
    showBillDiscountModal: boolean;
    setShowBillDiscountModal: React.Dispatch<React.SetStateAction<boolean>>;
    showTaxDetailModal: boolean;
    setShowTaxDetailModal: React.Dispatch<React.SetStateAction<boolean>>;
    showCashCalculatorModal: boolean;
    setShowCashCalculatorModal: React.Dispatch<React.SetStateAction<boolean>>;
    showLastDealModal: boolean;
    setShowLastDealModal: React.Dispatch<React.SetStateAction<boolean>>;
    selectedProductForLastDeal: ProductForLastDeal | null;
    showItemProfitModal: boolean;
    setShowItemProfitModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const InvoiceItemsStep: React.FC<InvoiceItemsStepProps> = ({
    invoice,
    setInvoice,
    selectedCustomer,
    setSelectedCustomer,
    employees,
    selectedMR,
    setSelectedMR,
    isLoading,
    error,
    setError,

    onClose,
    onReset,
    onContinue,
    // Refs
    productSearchRef,
    itemsTableRef,
    // Handlers
    handleCustomerSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    handleImport,
    handleApplyBillDiscount,
    // Modal states
    showCustomerModal,
    setShowCustomerModal,
    showProductModal,
    setShowProductModal,
    showGSTCalculator,
    setShowGSTCalculator,
    showImportModal,
    setShowImportModal,
    showBillDiscountModal,
    setShowBillDiscountModal,
    showTaxDetailModal,
    setShowTaxDetailModal,
    showCashCalculatorModal,
    setShowCashCalculatorModal,
    showLastDealModal,
    setShowLastDealModal,
    selectedProductForLastDeal,
    showItemProfitModal,
    setShowItemProfitModal
}) => {
    // Ctrl+Enter → Continue shortcut
    const continueDisabled = !selectedCustomer || !invoice.items || invoice.items.length === 0;
    const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'Enter' && !continueDisabled) {
            e.preventDefault();
            onContinue();
        }
    }, [continueDisabled, onContinue]);

    useEffect(() => {
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleGlobalKeyDown]);

    return (
        <div className="h-full bg-gray-50">
            <div className="h-full flex flex-col">

                {/* Header - Using Global ModuleHeader */}
                <ModuleHeader
                    title="Invoice"
                    documentNumber={invoice.invoice_number}
                    status={invoice.status || 'draft'}
                    icon={FileText}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    additionalActions={[
                        {
                            label: 'Import from Order/Challan',
                            icon: FileInput,
                            onClick: () => setShowImportModal(true),
                            variant: 'secondary'
                        }
                    ]}
                />

                {/* Keyboard Shortcuts Help */}
                <KeyboardShortcuts shortcuts={SHORTCUT_SETS.CREATE as any} />

                {/* Error State */}
                {error && (
                    <div className="bg-red-50 px-4 py-3 text-red-700 border-b border-red-200 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        <span>{error}</span>
                        <button
                            onClick={() => setError(null)}
                            className="ml-auto hover:opacity-70"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Content - Consistent max-width like Purchase */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="max-w-6xl mx-auto px-6 py-6">



                        {/* Date Section */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <StandardDatePicker
                                label="Invoice Date"
                                value={invoice.invoice_date}
                                onChange={(value: string) => setInvoice(prev => ({ ...prev, invoice_date: value }))}
                                required
                                tabIndex={1}
                                autoFocus
                            />
                            <StandardDatePicker
                                label="Due Date"
                                value={invoice.due_date}
                                onChange={(value: string) => setInvoice(prev => ({ ...prev, due_date: value }))}
                                required
                                tabIndex={2}
                            />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    M.R. (Medical Representative)
                                </label>
                                <select
                                    value={selectedMR?.employee_id || ''}
                                    onChange={(e) => {
                                        const employeeId = parseInt(e.target.value);
                                        const employee = employees.find(emp => emp.employee_id === employeeId);
                                        setSelectedMR(employee || null);
                                        const userId = employee?.user_id ?? null;
                                        const empId = typeof employee?.employee_id === 'number' ? employee.employee_id : null;
                                        setInvoice(prev => ({ ...prev, salesperson_id: userId || empId }));
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                    tabIndex={3}
                                >
                                    <option value="">
                                        {employees.length === 0 ? 'No Medical Representatives found' : 'Select M.R.'}
                                    </option>
                                    {employees.map((employee) => (
                                        <option key={employee.employee_id} value={employee.employee_id}>
                                            {employee.full_name || `Employee ${employee.employee_id}`}
                                        </option>
                                    ))}
                                </select>
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
                                    onClick={() => setShowCustomerModal(true)}
                                    className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    Create Customer
                                </button>
                            </div>
                            {/* White card wrapper - consistent with ProductSearch */}
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <CustomerSearch
                                    value={invoice?.customer_details as any || null}
                                    onChange={handleCustomerSelect as any}
                                    displayMode="compact"
                                    placeholder="Search customer by name, phone, or code..."
                                    showCreateButton={false}
                                    clearable={true}
                                    tabIndex={4}
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
                                    onClick={() => setShowProductModal(true)}
                                    className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    Create Product
                                </button>
                            </div>
                            <ProductSearch
                                onAddItem={handleAddItem}
                                onCreateProduct={() => setShowProductModal(true)}
                                ref={productSearchRef}
                                tabIndex={5}
                            />
                        </div>

                        {/* Invoice Items */}
                        {invoice.items && invoice.items.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                                    <Package className="w-4 h-4 mr-2" />
                                    INVOICE ITEMS
                                    <span className="ml-2 text-xs font-normal text-gray-500">
                                        (Use Tab/Enter for quick data entry)
                                    </span>
                                </h3>
                                <ItemsTableKeyboard
                                    ref={itemsTableRef as any}
                                    items={(invoice.items || []) as any}
                                    onUpdateItem={handleUpdateItem as any}
                                    onRemoveItem={handleRemoveItem}
                                    productSearchRef={productSearchRef as any}
                                    currencySymbol="₹"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <InvoiceItemsFooter
                    totalItems={invoice.items?.length || 0}
                    totalAmount={invoice.final_amount || invoice.totals?.final_amount}
                    onReset={onReset}
                    onContinue={onContinue}
                    continueDisabled={continueDisabled}
                />

            </div>

            {/* Modals */}
            {showCustomerModal && (
                <CustomerCreation
                    onClose={() => setShowCustomerModal(false)}
                    onCustomerCreated={(customer: Customer) => {
                        handleCustomerSelect(customer);
                        setShowCustomerModal(false);
                        toast.success('Customer created successfully');
                    }}
                />
            )}

            {showProductModal && (
                <ProductCreationModal
                    show={showProductModal}
                    onClose={() => setShowProductModal(false)}
                    onProductCreated={(product: unknown) => {
                        setShowProductModal(false);
                        // Toast is already shown in ProductCreationModal

                        // Optionally auto-add the product to invoice
                        if (product && typeof handleAddItem === 'function') {
                            handleAddItem(product);
                        }
                    }}
                />
            )}

            {showGSTCalculator && (
                <GSTCalculator
                    orderData={invoice as any}
                    onClose={() => setShowGSTCalculator(false)}
                    showDetails={true}
                />
            )}

            {/* Import Document Modal */}
            {showImportModal && (
                <DocumentImportModal
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onImport={handleImport}
                    documentTypes={[
                        {
                            value: 'sales-order',
                            label: 'Sales Orders',
                            loadFunction: async (searchQuery?: string) => {
                                const response = await ordersApi.getAll({ search: searchQuery, limit: 50 });
                                return extractDocumentCollection(response, ['orders', 'sales_orders']);
                            },
                            resolveDocument: async (document: any) => {
                                const response = await ordersApi.getById(document.order_id || document.id);
                                return extractDocumentDetail(response, ['order', 'sales_order']);
                            },
                        },
                        {
                            value: 'challan',
                            label: 'Delivery Challans',
                            loadFunction: async (searchQuery?: string) => {
                                const response = await challansApi.getAll({ search: searchQuery, limit: 50 });
                                return extractDocumentCollection(response, ['challans', 'delivery_challans']);
                            },
                            resolveDocument: async (document: any) => {
                                const response = await challansApi.getById(document.challan_id || document.id);
                                return extractDocumentDetail(response, ['challan', 'delivery_challan']);
                            },
                        }
                    ]}
                />
            )}

            {/* Marg ERP Style Shortcut Modals */}
            <BillDiscountModal
                isOpen={showBillDiscountModal}
                onClose={() => setShowBillDiscountModal(false)}
                currentDiscount={invoice.bill_discount || 0}
                billAmount={invoice.totals?.subtotal || 0}
                onApply={handleApplyBillDiscount}
            />

            <TaxDetailModal
                isOpen={showTaxDetailModal}
                onClose={() => setShowTaxDetailModal(false)}
                invoice={invoice}
            />

            <CashCalculatorModal
                isOpen={showCashCalculatorModal}
                onClose={() => setShowCashCalculatorModal(false)}
                billAmount={invoice.totals?.total_amount || 0}
            />

            <LastDealModal
                isOpen={showLastDealModal}
                onClose={() => setShowLastDealModal(false)}
                productId={typeof selectedProductForLastDeal?.id === 'number' ? selectedProductForLastDeal.id : undefined}
                productName={selectedProductForLastDeal?.name}
                customerId={typeof selectedCustomer?.id === 'number' ? selectedCustomer.id : undefined}
            />

            <ItemProfitModal
                isOpen={showItemProfitModal}
                onClose={() => setShowItemProfitModal(false)}
                items={invoice.items}
            />

        </div>
    );
};

export default InvoiceItemsStep;
