import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import Outstanding from '../components/ledger/Outstanding';
import CustomerMaster from '../components/master/masters/CustomerMaster';
import SupplierMaster from '../components/master/masters/SupplierMaster';
import ProductMaster from '../components/master/masters/ProductMaster';
import CustomerAnalytics from '../components/reports/CustomerAnalytics';
import FinancialReport from '../components/reports/FinancialReport';
import { CustomerSearch, ProductSearch, SupplierSearch, ToastProvider } from '../components/global';
import { EscapeKeyProvider } from '../contexts/EscapeKeyContext';
import AuthContext, { type AuthContextValue } from '../contexts/AuthContext';
import type { Customer } from '../types/models/customer';
import type { Supplier } from '../components/global/search/SupplierSearch';
import { FOUNDATION_CAPABILITIES } from '../config/canonicalCapabilities';

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
  const [supplier, setSupplier] = React.useState<Supplier | null>(null);
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
      <section aria-labelledby="supplier-search-heading">
        <h2 id="supplier-search-heading" className="mb-2 text-base font-semibold text-gray-900">Supplier</h2>
        <SupplierSearch
          value={supplier}
          onChange={setSupplier}
          showCreateButton={false}
          placeholder="Search supplier"
        />
        <p className="mt-2 text-sm text-gray-600" data-testid="selected-supplier-name">
          Selected: {supplier?.supplier_name ?? supplier?.name ?? 'None'}
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

const harnessPermissions = (): Record<string, boolean> => {
  const requested = new URLSearchParams(window.location.search).get('permissions');
  if (requested === 'none') return { 'core.organization.manage': true };
  if (requested === 'product') return { [FOUNDATION_CAPABILITIES.product]: true };
  if (requested === 'customer') return { [FOUNDATION_CAPABILITIES.customer]: true };
  if (requested === 'supplier') return { [FOUNDATION_CAPABILITIES.supplier]: true };
  return {
    [FOUNDATION_CAPABILITIES.product]: true,
    [FOUNDATION_CAPABILITIES.customer]: true,
    [FOUNDATION_CAPABILITIES.supplier]: true,
  };
};

const harnessAuthValue = (): AuthContextValue => {
  const permissions = harnessPermissions();
  const user = {
    user_id: 'd3000000-0000-7000-8000-000000000090',
    email: 'browser-harness@example.invalid',
    org_id: 'd3000000-0000-7000-8000-000000000001',
    role_id: 'd3000000-0000-7000-8000-000000000091',
    permissions,
    is_admin: false,
    data_access_level: 'organization',
  };
  return {
    user, token: 'browser-harness-token', isAuthenticated: true, isLoading: false,
    onboardingRequired: false, isOnline: true, hasCloudSession: true,
    sessionExchangeError: null,
    loginWithGoogle: async () => ({ success: true, user }),
    handleOAuthCallback: async () => ({ success: true, user }),
    logout: () => undefined,
    getOrgId: () => user.org_id,
    getToken: () => 'browser-harness-token',
    retrySessionExchange: async () => ({ success: true, user }),
    createOrganization: async () => ({ success: true, user }),
    acceptInvitation: async () => ({ success: true, user }),
  };
};

const CanonicalReadSurfacesSmokePage: React.FC = () => {
  const [surface, setSurface] = React.useState<Surface>(surfaceFromLocation);
  const queryClient = React.useMemo(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  }), []);
  const authValue = React.useMemo(harnessAuthValue, []);

  const selectSurface = (next: Surface) => {
    const url = new URL(window.location.href);
    url.searchParams.set('surface', next);
    window.history.replaceState(null, '', url);
    queryClient.clear();
    setSurface(next);
  };

  return (
    <AuthContext.Provider value={authValue}>
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
    </AuthContext.Provider>
  );
};

export default CanonicalReadSurfacesSmokePage;
