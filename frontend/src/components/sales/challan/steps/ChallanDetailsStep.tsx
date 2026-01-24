/**
 * ChallanDetailsStep
 * 
 * Step 1: Customer selection, items entry, and dates
 * Pattern: Matches InvoiceDetailsStep structure
 */

import React, { RefObject } from 'react';
import { Truck, FileInput, User, Package } from 'lucide-react';
import {
    ModuleHeader,
    CustomerSearch,
    ProductSearch,
    DocumentFooter,
    ProductCreationModal,
    StandardDatePicker
} from '../../../global';
import ItemsTableKeyboard from '../../../global/ui/display/ItemsTableUnified';
import CustomerCreationB2B from '../../../global/creation/CustomerCreationB2B';
import KeyboardShortcuts from '../../../global/ui/KeyboardShortcuts';
import ImportFromInvoiceModal from '../ui/ImportFromInvoiceModal';
import { Challan, ChallanItem, CustomerDetails, Employee, ImportData } from '../types/challanTypes';

interface ChallanDetailsStepProps {
    // State
    challan: Challan;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    selectedCustomer: CustomerDetails | null;
    employees: Employee[];
    selectedMR: Employee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<Employee | null>>;

    // Modals
    showCreateCustomer: boolean;
    setShowCreateCustomer: React.Dispatch<React.SetStateAction<boolean>>;
    showCreateProduct: boolean;
    setShowCreateProduct: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
    newProductName: string;
    setNewProductName: React.Dispatch<React.SetStateAction<string>>;

    // Handlers
    handleCustomerSelect: (customer: CustomerDetails | null) => Promise<void>;
    handleProductSelect: (product: any) => void;
    handleImport: (importData: ImportData) => void;
    updateItem: (index: number, field: string, value: any) => void;
    removeItem: (itemId: number | string) => void;

    // Refs
    challanFormRef: RefObject<HTMLFormElement>;
    itemsTableRef: RefObject<any>;
    productSearchRef: RefObject<HTMLInputElement>;

    // Navigation
    onClose?: () => void;
    onContinue: () => void;
}

const ChallanDetailsStep: React.FC<ChallanDetailsStepProps> = ({
    challan,
    setChallan,
    selectedCustomer,
    employees,
    selectedMR,
    setSelectedMR,
    showCreateCustomer,
    setShowCreateCustomer,
    showCreateProduct,
    setShowCreateProduct,
    showImportModal,
    setShowImportModal,
    newProductName,
    setNewProductName,
    handleCustomerSelect,
    handleProductSelect,
    handleImport,
    updateItem,
    removeItem,
    challanFormRef,
    itemsTableRef,
    productSearchRef,
    onClose,
    onContinue
}) => {
    return (
        <div className="h-full bg-blue-50">
            <div className="h-full flex flex-col">

                {/* Header */}
                <ModuleHeader {...{ title: "Delivery Challan", documentData: challan, status: challan.status, icon: Truck, iconColor: "text-blue-600", onClose, historyType: "challan", showSaveDraft: true, onSaveDraft: () => { } } as any} />

                {/* Keyboard Shortcuts */}
                <KeyboardShortcuts shortcuts={[
                    { key: 'Ctrl+N', action: 'Add Customer' },
                    { key: 'Ctrl+F', action: 'Search Products' },
                    { key: 'Ctrl+I', action: 'Import from Invoice' },
                    { key: 'Ctrl+S', action: 'Proceed' },
                    { key: 'Esc', action: 'Close' }
                ]} />

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-blue-50" ref={challanFormRef as unknown as React.RefObject<HTMLDivElement>}>
                    <div className="max-w-6xl mx-auto px-6 py-6">

                        {/* Top Section - Dates and Import */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div>
                                <StandardDatePicker
                                    label="Challan Date"
                                    value={challan.challan_date}
                                    onChange={(value: string) => setChallan(prev => ({ ...prev, challan_date: value }))}
                                    size="sm"
                                    required
                                />
                            </div>
                            <div>
                                <StandardDatePicker
                                    label="Expected Delivery"
                                    value={challan.expected_delivery_date}
                                    onChange={(value: string) => setChallan(prev => ({ ...prev, expected_delivery_date: value }))}
                                    size="sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Import Data</label>
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                                >
                                    <FileInput className="w-4 h-4 text-gray-400" />
                                    <span>Import from Invoice</span>
                                </button>
                            </div>
                        </div>

                        {/* M.R. Selection */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-600 mb-2">
                                M.R. (Medical Representative)
                            </label>
                            <select
                                value={String(selectedMR?.employee_id || '')}
                                onChange={(e) => {
                                    const employeeId = parseInt(e.target.value);
                                    const employee = employees.find(emp => emp.employee_id === employeeId);
                                    setSelectedMR(employee || null);
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            >
                                <option value="">Select M.R.</option>
                                {Array.isArray(employees) && employees.map((employee) => (
                                    <option key={String(employee.employee_id)} value={String(employee.employee_id)}>
                                        {employee.full_name} {employee.designation ? `(${employee.designation})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Customer Section */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                                    <User className="w-4 h-4 mr-2" />
                                    CUSTOMER
                                </h3>
                                <button
                                    onClick={() => setShowCreateCustomer(true)}
                                    className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    Create Customer
                                </button>
                            </div>
                            {/* White card wrapper - consistent with ProductSearch */}
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <CustomerSearch
                                    value={selectedCustomer as any}
                                    onChange={handleCustomerSelect as any}
                                    displayMode="compact"
                                    placeholder="Search customer by name, phone, or code..."
                                    showCreateButton={false}
                                    clearable={true}
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
                                    onClick={() => setShowCreateProduct(true)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    Create Product
                                </button>
                            </div>
                            <ProductSearch
                                onAddItem={handleProductSelect}
                                onCreateProduct={(productName: string) => {
                                    setNewProductName(productName || '');
                                    setShowCreateProduct(true);
                                }}
                            />
                        </div>

                        {/* Items Table */}
                        {challan.items.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                                    <Package className="w-4 h-4 mr-2" />
                                    CHALLAN ITEMS
                                </h3>
                                <ItemsTableKeyboard
                                    ref={itemsTableRef}
                                    items={challan.items as any}
                                    onUpdateItem={updateItem}
                                    onRemoveItem={(index: number) => removeItem(challan.items[index]?.id)}
                                    productSearchRef={productSearchRef as any}
                                    currencySymbol="₹"
                                />
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer */}
                <DocumentFooter
                    totalItems={challan.total_quantity}
                    totalAmount={challan.total_amount}
                    additionalInfo={challan.freight_charges > 0 ? `Freight: ₹${challan.freight_charges.toFixed(2)}` : undefined}
                    onCancel={onClose}
                    onContinue={onContinue}
                    cancelLabel="Cancel"
                    continueLabel="Continue"
                    continueDisabled={!challan.customer_id || challan.items.length === 0}
                    continueButtonColor="blue"
                />

            </div>

            {/* Customer Creation Modal */}
            {showCreateCustomer && (
                <CustomerCreationB2B
                    onClose={() => setShowCreateCustomer(false)}
                    onCustomerCreated={(customer: any) => {
                        handleCustomerSelect(customer);
                        setShowCreateCustomer(false);
                    }}
                />
            )}

            {/* Product Creation Modal */}
            {showCreateProduct && (
                <ProductCreationModal
                    show={showCreateProduct}
                    onClose={() => {
                        setShowCreateProduct(false);
                        setNewProductName('');
                    }}
                    onProductCreated={(product: any) => {
                        handleProductSelect(product);
                        setShowCreateProduct(false);
                        setNewProductName('');
                    }}
                    initialProductName={newProductName}
                />
            )}

            {/* Import Modal */}
            {showImportModal && (
                <ImportFromInvoiceModal
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onImport={handleImport}
                />
            )}
        </div>
    );
};

export default ChallanDetailsStep;
