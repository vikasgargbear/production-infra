import React from 'react';
import { FileText, User, Package, FileInput, Loader2, AlertCircle, X, CheckCircle } from 'lucide-react';

// Global Components
import { ModuleHeader, StandardDatePicker, CustomerSearch, ProductSearchSimple, ItemsTableKeyboard, DocumentFooter } from '../../../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';

// Modals
import CustomerCreation from '../../../global/ui/forms/CustomerCreation';
import { ProductCreationModal, GSTCalculator, DocumentImportModal } from '../../../global';
import BillDiscountModal from '../../modals/BillDiscountModal';
import TaxDetailModal from '../../modals/TaxDetailModal';
import CashCalculatorModal from '../../modals/CashCalculatorModal';
import LastDealModal from '../../modals/LastDealModal';
import ItemProfitModal from '../../modals/ItemProfitModal';

// Removed - SHORTCUT_SETS now imported from KeyboardShortcuts

// Utils
import { toast } from 'react-toastify';
import { searchCache } from '../../../../utils/searchCache';

const InvoiceItemsStep = ({
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
  message,
  messageType,
  clearMessage,
  onClose,
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
  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Invoice"
          documentNumber={invoice.invoice_no}
          status={invoice.status || 'draft'}
          icon={FileText}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="invoice"
          showSaveDraft={true}
          onSaveDraft={() => {
            // TODO: Implement save draft
          }}
          additionalActions={[
            {
              label: 'Import from Order/Challan',
              icon: FileInput,
              onClick: () => setShowImportModal(true),
              variant: 'secondary',
              className: 'text-sm'
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <KeyboardShortcuts shortcuts={SHORTCUT_SETS.CREATE} />

        {/* Loading State */}
        {isLoading && (
          <div className="bg-blue-50 px-4 py-3 text-blue-700 border-b border-blue-200 flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            <span>Loading invoice data...</span>
          </div>
        )}

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

        {/* Content - FULL WIDTH for desktop software experience */}
        <div className="flex-1 overflow-y-auto bg-blue-50">
          <div className="w-full px-8 py-6">
          
          {/* Message Display */}
          {message && (
            <div className={`
              mb-4 p-3 rounded flex items-start text-sm
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Date Section */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StandardDatePicker
              label="Invoice Date"
              value={invoice.invoice_date}
              onChange={(value) => setInvoice(prev => ({ ...prev, invoice_date: value }))}
              required
              tabIndex={1}
              autoFocus
            />
            <StandardDatePicker
              label="Due Date"
              value={invoice.due_date}
              onChange={(value) => setInvoice(prev => ({ ...prev, due_date: value }))}
              required
              tabIndex={2}
            />
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                M.R. (Medical Representative)
                {employees.length === 0 && (
                  <span className="ml-2 text-xs text-gray-500">
                    (No M.R. assigned yet)
                  </span>
                )}
              </label>
              <select
                value={selectedMR?.employee_id || ''}
                onChange={(e) => {
                  const employeeId = parseInt(e.target.value);
                  const employee = employees.find(emp => emp.employee_id === employeeId);
                  setSelectedMR(employee || null);
                  setInvoice(prev => ({ ...prev, sales_person_id: employeeId || null }));
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                tabIndex={3}
              >
                <option value="">
                  {employees.length === 0 ? 'No Medical Representatives found' : 'Select M.R.'}
                </option>
                {employees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>
                    {employee.employee_name} {employee.employee_code ? `(${employee.employee_code})` : ''}
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Create Customer
              </button>
            </div>
            <CustomerSearch
              value={invoice?.customer_details || null}
              onChange={handleCustomerSelect}
              onCreateNew={() => setShowCustomerModal(true)}
              displayMode="inline"
              placeholder="Search customer by name, phone, or code..."
              required
              clearable={true}
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
                onClick={() => setShowProductModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Create Product
              </button>
            </div>
            <ProductSearchSimple
              onAddItem={handleAddItem}
              onCreateProduct={() => setShowProductModal(true)}
              ref={productSearchRef}
            />
          </div>

          {/* Invoice Items */}
          {invoice.items.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                <Package className="w-4 h-4 mr-2" />
                INVOICE ITEMS
                <span className="ml-2 text-xs font-normal text-gray-500">
                  (Use Tab/Enter for quick data entry)
                </span>
              </h3>
              <ItemsTableKeyboard
                ref={itemsTableRef}
                items={invoice.items}
                onUpdateItem={handleUpdateItem}
                onRemoveItem={handleRemoveItem}
                productSearchRef={productSearchRef}
                currencySymbol="₹"
              />
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <DocumentFooter
          totalItems={invoice.items.length}
          totalAmount={invoice.net_amount}
          onCancel={onClose}
          onContinue={onContinue}
          cancelLabel="Reset"
          continueLabel="Continue"
          continueDisabled={!selectedCustomer || invoice.items.length === 0}
          continueButtonColor="blue"
        />

      </div>

      {/* Modals */}
      {showCustomerModal && (
        <CustomerCreation
          onClose={() => setShowCustomerModal(false)}
          onCustomerCreated={(customer) => {
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
          onProductCreated={(product) => {
            setShowProductModal(false);
            // Toast is already shown in ProductCreationModal
            
            // Add the created product to search cache immediately
            searchCache.addItem('products', product);
            
            // Optionally auto-add the product to invoice
            if (product && typeof handleAddItem === 'function') {
              handleAddItem(product);
            }
          }}
        />
      )}

      {showGSTCalculator && (
        <GSTCalculator
          isOpen={showGSTCalculator}
          onClose={() => setShowGSTCalculator(false)}
        />
      )}

      {/* Import Document Modal */}
      {showImportModal && (
        <DocumentImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          documentTypes={[]}
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
        billAmount={invoice.totals?.grand_total || 0}
      />

      <LastDealModal
        isOpen={showLastDealModal}
        onClose={() => setShowLastDealModal(false)}
        productId={selectedProductForLastDeal?.id}
        productName={selectedProductForLastDeal?.name}
        customerId={selectedCustomer?.id}
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