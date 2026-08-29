import fs from 'fs';
import path from 'path';

const source = (relativePath: string): string => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

const productCreationCallback = (text: string): string => {
  const start = text.indexOf('onProductCreated={(product');
  if (start < 0) throw new Error('Product creation callback is missing');
  return text.slice(start, start + 550);
};

describe('inline product draft boundary', () => {
  it('forwards the compatibility wrapper callback to the canonical product flow', () => {
    const wrapper = source('../global/creation/ProductCreationModal.tsx');
    expect(wrapper).toContain('onProductCreated,');
    expect(wrapper).toContain('onProductCreated={onProductCreated}');
  });

  it.each([
    ['sales invoice', '../sales/invoice/steps/InvoiceItemsStep.tsx', 'handleAddItem'],
    ['sales order', '../sales/order/SalesOrderFlow.tsx', 'handleProductSelect'],
    ['purchase order', '../purchase/purchase-order/PurchaseOrderFlow.tsx', 'handleAddItem'],
  ])('%s never adds an unusable newly-created draft', (_label, file, addHandler) => {
    const callback = productCreationCallback(source(file));
    expect(callback).not.toContain(`${addHandler}(`);
    expect(callback).toContain('was added with zero stock');
  });

  it('has no manual code field and explains backend ownership in reachable create forms', () => {
    for (const [file, expectedHint] of [
      ['customers/CustomerFlow.tsx', 'Internal customer code is generated automatically after saving.'],
      ['suppliers/SupplierFlow.tsx', 'Internal supplier code is generated automatically after saving.'],
      ['products/ProductFlow.tsx', 'Internal product code is generated automatically after saving.'],
      ['../purchase/modals/SupplierCreationForm.tsx', 'Internal supplier code is generated automatically after saving.'],
    ]) {
      const text = source(file);
      expect(text).not.toContain('will not be generated');
      expect(text).not.toMatch(/(?:customer|supplier)_code\s*:/);
      expect(text).toContain(expectedHint);
    }
  });

  it('does not collect contact facts that canonical master creation discards', () => {
    for (const file of [
      'customers/CustomerFlow.tsx',
      'suppliers/SupplierFlow.tsx',
      '../purchase/modals/SupplierCreationForm.tsx',
    ]) {
      const text = source(file);
      for (const unsupportedField of [
        'whatsapp_number',
        'contact_person_phone',
        'contact_person_email',
        'secondary_phone',
      ]) {
        expect(text).not.toContain(unsupportedField);
      }
    }

    const inlineSupplier = source('../purchase/modals/SupplierCreationForm.tsx');
    const customer = source('customers/CustomerFlow.tsx');
    for (const unsupportedField of [
      'website',
      'country',
      'drug_license_no',
      'drug_license_validity',
      'bank_name',
      'bank_account_no',
      'bank_ifsc_code',
      'account_holder_name',
      'notes',
      'is_active',
    ]) {
      expect(inlineSupplier).not.toContain(unsupportedField);
    }
    expect(customer).not.toContain('country');
    expect(customer).not.toContain('Landmark');
    const creditTerms = customer.slice(
      customer.indexOf('Credit terms are explicit'),
      customer.indexOf('Sticky Footer'),
    );
    expect(creditTerms).not.toContain('{isBusinessCustomer && (');
    expect(customer).toContain('Credit Limit (₹) *');
    expect(customer).toContain('Credit Days *');
    for (const canonicalField of [
      'supplier_name',
      'contact_person',
      'phone',
      'email',
      'address_line1',
      'address_line2',
      'city',
      'state_code',
      'pincode',
      'gst_number',
      'pan_number',
      'payment_days',
    ]) {
      expect(inlineSupplier).toContain(canonicalField);
    }
  });
});
