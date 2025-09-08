import React, { useState } from 'react';
import { FileText, User, Package, Calendar } from 'lucide-react';
import {
  DocumentLayout,
  SectionHeader,
  FormGrid,
  FormField,
  ActionButton,
  ContentSection,
  CustomerSearch,
  ProductSearchSimple,
  ItemsTable
} from '../index';

/**
 * Example of how to use the new global components for world-class UX
 * This demonstrates the proper way to build document flows
 */
const RefactoredInvoiceExample = ({ onClose }) => {
  const [invoice, setInvoice] = useState({
    invoice_no: 'INV-12345',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: '',
    items: []
  });

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // Example shortcuts
  const shortcuts = [
    { keys: 'Ctrl+N', action: 'Add Customer' },
    { keys: 'Ctrl+F', action: 'Search Products' },
    { keys: 'Ctrl+S', action: 'Save Draft' },
    { keys: 'Esc', action: 'Close' }
  ];

  return (
    <DocumentLayout
      title="Invoice"
      documentNumber={invoice.invoice_no}
      status="draft"
      icon={FileText}
      iconColor="text-blue-600"
      onClose={onClose}
      historyType="invoice"
      showSaveDraft={true}
      onSaveDraft={() => console.log('Save draft')}
      shortcuts={shortcuts}
      footer="default"
      footerProps={{
        totalItems: invoice.items.length,
        totalAmount: 0,
        onCancel: onClose,
        onContinue: () => console.log('Continue'),
        continueLabel: "Continue",
        continueButtonColor: "blue"
      }}
    >
      {/* Date Section using FormGrid */}
      <FormGrid columns={3} gap="md" className="mb-6">
        <FormField label="Invoice Date" required>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={invoice.invoice_date}
              onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value }))}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </FormField>

        <FormField label="Due Date" required>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={invoice.due_date}
              onChange={(e) => setInvoice(prev => ({ ...prev, due_date: e.target.value }))}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </FormField>

        <FormField label="Import Data">
          <ActionButton
            variant="secondary"
            icon={FileText}
            fullWidth
            onClick={() => console.log('Import')}
          >
            Import from Order/Challan
          </ActionButton>
        </FormField>
      </FormGrid>

      {/* Customer Section using SectionHeader */}
      <div className="mb-6">
        <SectionHeader
          title="CUSTOMER"
          icon={User}
          iconSize="sm"
          color="blue"
          actions={
            <ActionButton
              variant="primary"
              size="sm"
              onClick={() => setShowCustomerModal(true)}
            >
              Create Customer
            </ActionButton>
          }
        />
        <CustomerSearch
          value={null}
          onChange={(customer) => console.log('Customer selected:', customer)}
          onCreateNew={() => setShowCustomerModal(true)}
          displayMode="inline"
          placeholder="Search customer by name, phone, or code..."
          required
        />
      </div>

      {/* Products Section using SectionHeader */}
      <div className="mb-6">
        <SectionHeader
          title="PRODUCTS"
          icon={Package}
          iconSize="sm"
          color="blue"
          actions={
            <ActionButton
              variant="primary"
              size="sm"
              onClick={() => setShowProductModal(true)}
            >
              Create Product
            </ActionButton>
          }
        />
        <ProductSearchSimple
          onAddItem={(item) => console.log('Item added:', item)}
          onCreateProduct={() => setShowProductModal(true)}
        />
      </div>

      {/* Items Table in ContentSection */}
      {invoice.items.length > 0 && (
        <ContentSection
          title="INVOICE ITEMS"
          icon={Package}
          iconColor="blue"
          className="mb-6"
        >
          <ItemsTable
            items={invoice.items}
            onUpdateItem={(index, updates) => console.log('Update item:', index, updates)}
            onRemoveItem={(index) => console.log('Remove item:', index)}
          />
        </ContentSection>
      )}

      {/* Transport Details using ContentSection */}
      <ContentSection
        title="Transport Details"
        icon={Package}
        iconColor="blue"
        collapsible={true}
        defaultExpanded={false}
        className="mb-6"
      >
        <FormGrid columns={4} gap="md">
          <FormField label="Transport Company">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Company name"
            />
          </FormField>
          <FormField label="Vehicle Number">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="KA01AB1234"
            />
          </FormField>
          <FormField label="LR Number">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="LR number"
            />
          </FormField>
          <FormField label="Freight Charges">
            <input
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </FormField>
        </FormGrid>
      </ContentSection>

    </DocumentLayout>
  );
};

export default RefactoredInvoiceExample;