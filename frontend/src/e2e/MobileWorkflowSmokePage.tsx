import React, { useState } from 'react';
import OrganizationOnboarding from '../components/auth/OrganizationOnboarding';
import ProductFlow from '../components/master/products/ProductFlow';
import CustomerFlow from '../components/master/customers/CustomerFlow';
import SupplierFlow from '../components/master/suppliers/SupplierFlow';
import { ReturnItemsTable } from '../components/returns/components/ReturnItemsTable';
import type { ReturnFormItem } from '../components/returns/types/return.types';
import ProceedToReviewComponent from '../components/global/ui/ProceedToReviewComponent';
import { ToastProvider } from '../components/global/ui/feedback/Toast';
import { EscapeKeyProvider } from '../contexts/EscapeKeyContext';

const initialReturnItems: ReturnFormItem[] = [{
  id: 'fixture-line-1',
  product_id: 'fixture-product-1',
  product_name: 'Paracetamol 500 mg',
  batch_id: 'fixture-batch-1',
  batch_number: 'PCM-2408',
  expiry_date: '2027-12-31',
  quantity: '10',
  paid_quantity: '10',
  free_quantity: '0',
  return_quantity: '1',
  return_paid_qty: '1',
  return_free_qty: '0',
  max_returnable_qty: '10',
  unit_price: '18.50',
  discount_percent: '0',
  tax_percent: '5',
  total_amount: '19.43',
  selected: true,
  return_condition: 'sealed_resaleable',
  to_location_id: 'fixture-quarantine-1',
  quarantine_locations: [{ id: 'fixture-quarantine-1', code: 'Q-01', name: 'Returns quarantine' }],
}];

const ReturnFixture: React.FC = () => {
  const [items, setItems] = useState(initialReturnItems);
  return (
    <main className="min-h-[100dvh] bg-gray-50 px-3 py-4">
      <h1 className="mb-4 text-xl font-semibold">Sales return lines</h1>
      <ReturnItemsTable
        items={items}
        selectedInvoice={{} as any}
        onUpdateItem={(indexOrId, field, value) => setItems(current => current.map((item, index) => (
          index === Number(indexOrId) || item.id === indexOrId ? { ...item, [field]: value } : item
        )))}
        onRemoveItem={itemId => setItems(current => current.filter(item => item.id !== itemId))}
      />
      <ProceedToReviewComponent
        canProceed={items.some(item => item.selected)}
        totalItems={items.length}
        totalAmount="19.43"
        proceedText="Review return"
        onProceed={() => undefined}
        onReset={() => setItems(initialReturnItems)}
      />
    </main>
  );
};

const OnboardingFixture: React.FC = () => (
  <main className="min-h-[100dvh] overflow-y-auto bg-slate-100 p-3 sm:p-6">
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
      <h1 className="mb-5 text-2xl font-bold text-slate-900">Set up your pharmacy</h1>
      <OrganizationOnboarding />
    </div>
  </main>
);

const MobileWorkflowSmokePage: React.FC = () => {
  const flow = new URLSearchParams(window.location.search).get('flow') || 'product';
  const content = (() => {
    switch (flow) {
      case 'onboarding': return <OnboardingFixture />;
      case 'customer': return <CustomerFlow open onClose={() => undefined} />;
      case 'supplier': return <SupplierFlow open onClose={() => undefined} />;
      case 'returns': return <ReturnFixture />;
      case 'footer': return <main className="flex min-h-[100dvh] flex-col bg-gray-50"><div className="flex-1 p-4"><h1 className="text-xl font-semibold">Invoice review</h1></div><ProceedToReviewComponent canProceed totalItems={3} totalAmount="680.50" proceedText="Review invoice" onProceed={() => undefined} onReset={() => undefined} /></main>;
      case 'product':
      default: return <ProductFlow open onClose={() => undefined} />;
    }
  })();

  return <EscapeKeyProvider><ToastProvider>{content}</ToastProvider></EscapeKeyProvider>;
};

export default MobileWorkflowSmokePage;
