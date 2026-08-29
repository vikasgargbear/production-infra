import React, { RefObject, useEffect, useCallback, useRef } from 'react';
import { FileText, User, Package, FileInput, AlertCircle, X } from 'lucide-react';

// Global Components
import { ModuleHeader, StandardDatePicker, CustomerSearch, ProductSearch, ItemsTableKeyboard } from '../../../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';

// Modals
import CustomerCreation from '../../../global/creation/CustomerCreation';
import { ProductCreationModal, DocumentImportModal } from '../../../global';

// Utils
import { toast } from 'react-toastify';
import { challansApi } from '../../../../services/api';
import { extractDocumentDetail } from '../../utils/documentImport';
import {
    freeSupplyTreatmentAfterQuantityEdit,
    invoiceBatchAllocationDisplay,
    invoiceBatchAllocationValidationError,
} from '../utils/canonicalInvoiceCommand';
// Shared Types
import { Customer, Invoice, Employee, InvoiceItem } from '../types/invoiceTypes';
import InvoiceItemsFooter from './InvoiceItemsFooter';
import { usePermissions } from '../../../../hooks/usePermissions';
import { FOUNDATION_CAPABILITIES } from '../../../../config/canonicalCapabilities';

interface InvoiceItemsStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    maximumInvoiceDate: string;
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
    onSaveDraft: () => void;
    onOpenDrafts: () => void;
    draftSaving: boolean;
    // Refs
    productSearchRef: RefObject<HTMLInputElement>;
    itemsTableRef: RefObject<HTMLDivElement>;
    // Handlers
    handleCustomerSelect: (customer: Customer) => void;
    handleAddItem: (product: unknown) => void;
    handleUpdateItem: (index: number, field: string, value: unknown) => void;
    handleRemoveItem: (index: number) => void;
    handleImport: (data: unknown) => void;
    // Modal states
    showCustomerModal: boolean;
    setShowCustomerModal: React.Dispatch<React.SetStateAction<boolean>>;
    showProductModal: boolean;
    setShowProductModal: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const reviewedBatchDisplay = (item: InvoiceItem, index: number): string | undefined => {
    if (item.source_allocation_kind === 'dispatch_allocation') return item.batch_number;
    try {
        return invoiceBatchAllocationDisplay(item, index);
    } catch {
        return item.batch_number;
    }
};

const InvoiceItemsStep: React.FC<InvoiceItemsStepProps> = ({
    invoice,
    setInvoice,
    maximumInvoiceDate,
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
    onSaveDraft,
    onOpenDrafts,
    draftSaving,
    // Refs
    productSearchRef,
    itemsTableRef,
    // Handlers
    handleCustomerSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    handleImport,
    // Modal states
    showCustomerModal,
    setShowCustomerModal,
    showProductModal,
    setShowProductModal,
    showImportModal,
    setShowImportModal,
}) => {
    const { hasCapability } = usePermissions();
    const canManageCustomers = hasCapability(FOUNDATION_CAPABILITIES.customer);
    const canManageProducts = hasCapability(FOUNDATION_CAPABILITIES.product);
    const pendingItemFocus = useRef<{ productId?: string; batchId?: string } | null>(null);
    // Ctrl+Enter → Continue shortcut
    const batchAllocationError = invoiceBatchAllocationValidationError(invoice as any);
    const continueDisabled = isLoading || !selectedCustomer || !invoice.items || invoice.items.length === 0
        || Boolean(batchAllocationError);
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

    const handleQuickAddItem = useCallback((product: unknown) => {
        const candidate = product && typeof product === 'object'
            ? product as Record<string, unknown>
            : {};
        pendingItemFocus.current = {
            productId: candidate.product_id === undefined ? undefined : String(candidate.product_id),
            batchId: candidate.batch_id === undefined ? undefined : String(candidate.batch_id),
        };
        handleAddItem(product);
    }, [handleAddItem]);

    useEffect(() => {
        const pending = pendingItemFocus.current;
        if (!pending || !invoice.items?.length) return;
        const rowIndex = invoice.items.findIndex(item => {
            const productMatches = !pending.productId || String(item.product_id) === pending.productId;
            const batchMatches = !pending.batchId || String(item.batch_id) === pending.batchId;
            return productMatches && batchMatches;
        });
        if (rowIndex < 0) return;
        pendingItemFocus.current = null;
        window.setTimeout(() => {
            (itemsTableRef.current as any)?.focusField?.(rowIndex, 'quantity');
        }, 0);
    }, [invoice.items, itemsTableRef]);

    const handleCanonicalItemUpdate = useCallback((
        index: number,
        field: string,
        value: unknown,
    ) => {
        handleUpdateItem(index, field, value);
        if (field !== 'free_quantity') return;
        handleUpdateItem(
            index,
            'free_supply_tax_treatment',
            freeSupplyTreatmentAfterQuantityEdit(value),
        );
    }, [handleUpdateItem]);

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
                    showSaveDraft
                    onSaveDraft={onSaveDraft}
                    saveDraftDisabled={draftSaving}
                    additionalActions={[
                        {
                            label: 'Open drafts',
                            onClick: onOpenDrafts,
                            disabled: draftSaving,
                            variant: 'secondary'
                        },
                        {
                            label: 'Import posted delivery challan',
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
                    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">

                        <p className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                            Required: select a customer, exact saved delivery address, product batch, billed and free quantities, free-supply tax treatment when free quantity is positive, and direct-issue distance.
                        </p>

                        {/* Date Section */}
                        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <StandardDatePicker
                                label="Invoice Date"
                                value={invoice.invoice_date}
                                onChange={(value: string) => setInvoice(prev => ({ ...prev, invoice_date: value }))}
                                max={maximumInvoiceDate || undefined}
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
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                                    <User className="w-4 h-4 mr-2" />
                                    CUSTOMER
                                </h3>
                                {canManageCustomers && <button
                                    onClick={() => setShowCustomerModal(true)}
                                    className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    Create Customer
                                </button>}
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
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                                    <Package className="w-4 h-4 mr-2" />
                                    PRODUCTS
                                </h3>
                                {canManageProducts && <button
                                    onClick={() => setShowProductModal(true)}
                                    className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    Create Product
                                </button>}
                            </div>
                            <ProductSearch
                                onAddItem={handleQuickAddItem}
                                onCreateProduct={() => setShowProductModal(true)}
                                enforceFefo
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
                                    items={(invoice.items || []).map((item, index) => ({
                                        ...item,
                                        batch_display: reviewedBatchDisplay(item, index),
                                    })) as any}
                                    onUpdateItem={handleCanonicalItemUpdate}
                                    onRemoveItem={handleRemoveItem}
                                    productSearchRef={productSearchRef as any}
                                    currencySymbol="₹"
                                    preserveExactDecimals
                                    showFreeSupplyTaxTreatment
                                    quantityDecimalPlaces={2}
                                />
                                {batchAllocationError && (
                                    <div
                                        role="alert"
                                        className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                                    >
                                        {batchAllocationError}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <InvoiceItemsFooter
                    totalItems={invoice.items?.length ?? 0}
                    totalAmount={invoice.final_amount || invoice.totals?.final_amount}
                    onReset={onReset}
                    onContinue={onContinue}
                    continueDisabled={continueDisabled}
                />

            </div>

            {/* Modals */}
            {canManageCustomers && showCustomerModal && (
                <CustomerCreation
                    onClose={() => setShowCustomerModal(false)}
                    onCustomerCreated={(customer: Customer) => {
                        handleCustomerSelect(customer);
                        setShowCustomerModal(false);
                    }}
                />
            )}

            {canManageProducts && showProductModal && (
                <ProductCreationModal
                    show={showProductModal}
                    onClose={() => setShowProductModal(false)}
                    onProductCreated={(product) => {
                        setShowProductModal(false);
                        toast.success(`Product ${product.product_code} was added with zero stock. Create a purchase order and goods receipt before invoicing it.`);
                    }}
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
                            value: 'challan',
                            label: 'Delivery Challans',
                            loadFunction: async (searchQuery?: string) => {
                                return challansApi.listPostedForInvoice(searchQuery);
                            },
                            resolveDocument: async (document: any) => {
                                const response = await challansApi.getById(document.challan_id || document.id);
                                return extractDocumentDetail(response, ['challan', 'delivery_challan']);
                            },
                        }
                    ]}
                />
            )}

        </div>
    );
};

export default InvoiceItemsStep;
