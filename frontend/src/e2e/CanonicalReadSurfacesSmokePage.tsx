import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import Outstanding from '../components/ledger/Outstanding';
import CustomerMaster from '../components/master/masters/CustomerMaster';
import SupplierMaster from '../components/master/masters/SupplierMaster';
import ProductMaster from '../components/master/masters/ProductMaster';
import CustomerAnalytics from '../components/reports/CustomerAnalytics';
import FinancialReport from '../components/reports/FinancialReport';
import { CustomerSearch, ProductSearch, ToastProvider } from '../components/global';
import { EscapeKeyProvider } from '../contexts/EscapeKeyContext';
import type { Customer } from '../types/models/customer';

type Surface = 'customer-aging' | 'supplier-aging' | 'products' | 'customers' | 'suppliers' | 'financial' | 'customer-activity' | 'global-search';

const surfaceFromLocation = (): Surface => {
  const requested = new URLSearchParams(window.location.search).get('surface');
  return requested === 'supplier-aging'
    || requested === 'customers'
    || requested === 'products'
    || requested === 'suppliers'
    || requested === 'financial'
    || requested === 'customer-activity'
    || requested === 'global-search'
    ? requested
    : 'customer-aging';
};

const GlobalSearchSmokeSurface: React.FC = () => {
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [productName, setProductName] = React.useState('None');

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" data-testid="global-search-smoke-surface">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Canonical global search</h1>
        <p className="mt-1 text-sm text-gray-600">Keyboard and mobile layout regression harness.</p>
      </header>
      <section aria-labelledby="customer-search-heading">
        <h2 id="customer-search-heading" className="mb-2 text-base font-semibold text-gray-900">Customer</h2>
        <CustomerSearch
          value={customer}
          onChange={setCustomer}
          showCreateButton={false}
          placeholder="Search customer"
        />
        <p className="mt-2 text-sm text-gray-600" data-testid="selected-customer-name">
          Selected: {customer?.customer_name ?? 'None'}
        </p>
      </section>
      <section aria-labelledby="product-search-heading">
        <h2 id="product-search-heading" className="mb-2 text-base font-semibold text-gray-900">Product</h2>
        <ProductSearch
          onAddItem={(product) => setProductName(product.product_name)}
          showBatchSelection={false}
          placeholder="Search product"
        />
        <p className="mt-2 text-sm text-gray-600" data-testid="selected-product-name">
          Selected: {productName}
        </p>
      </section>
    </main>
  );
};

const CanonicalReadSurfacesSmokePage: React.FC = () => {
  const [surface, setSurface] = React.useState<Surface>(surfaceFromLocation);
  const queryClient = React.useMemo(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  }), []);

  const selectSurface = (next: Surface) => {
    const url = new URL(window.location.href);
    url.searchParams.set('surface', next);
    window.history.replaceState(null, '', url);
    queryClient.clear();
    setSurface(next);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <EscapeKeyProvider>
      <div className="min-h-screen bg-gray-50" data-testid="canonical-read-surfaces-harness">
        <nav aria-label="Canonical read surfaces" className="sticky top-0 z-50 flex gap-2 overflow-x-auto border-b border-gray-200 bg-white p-3">
          {([
            ['customer-aging', 'Customer aging'],
            ['supplier-aging', 'Supplier aging'],
            ['products', 'Products'],
            ['customers', 'Customers'],
            ['suppliers', 'Suppliers'],
            ['financial', 'Financial'],
            ['customer-activity', 'Customer activity'],
            ['global-search', 'Global search'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={surface === id ? 'page' : undefined}
              onClick={() => selectSurface(id)}
              className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold ${surface === id ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {surface === 'customer-aging' && <Outstanding embedded partyType="customer" />}
        {surface === 'supplier-aging' && <Outstanding embedded partyType="supplier" />}
        {surface === 'products' && <ProductMaster />}
        {surface === 'customers' && <CustomerMaster />}
        {surface === 'suppliers' && <SupplierMaster />}
        {surface === 'financial' && <FinancialReport />}
        {surface === 'customer-activity' && <CustomerAnalytics />}
        {surface === 'global-search' && <GlobalSearchSmokeSurface />}
      </div>
      </EscapeKeyProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};

export default CanonicalReadSurfacesSmokePage;
