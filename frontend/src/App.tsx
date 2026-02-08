import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './queryClient';
import { useAuth } from './contexts/AuthContext';
import { usePermissions } from './hooks/usePermissions';
import LoginPage from './components/auth/LoginPage';
// import Sidebar from './components/Sidebar';
import { ErrorBoundary } from './components/global/utilities';
import { LoadingSpinner } from './components/global/ui';
import Home from './components/Home';
import SalesHub from './components/sales/SalesHub';
import PurchaseHub from './components/purchase/PurchaseHub';
import FinancialHub from './components/payment/FinancialHub';
import { ToastProvider } from './components/global';
import ReturnsHub from './components/returns/ReturnsHub';
import StockHub from './components/inventory/StockHub';
import { LedgerHub } from './components/ledger';
import { NotesHub } from './components/returns/notes';
import GSTHub from './components/gst/GSTHub';
import MasterHub from './components/master/MasterHub';
import PayrollHub from './components/payroll/PayrollHub';
import ReportsHub from './components/reports/ReportsHub';
// OLD AUTH DIAGNOSTIC - Not needed with new AuthContext
// import AuthDiagnostic from './components/AuthDiagnostic';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { EscapeKeyProvider } from './contexts/EscapeKeyContext';
import { PaymentProvider } from './contexts/PaymentContext';
import { SidebarProvider } from './contexts/SidebarContext';
// OLD InitialSetup moved to _OLD - not used with new AuthContext
// import InitialSetup from './components/InitialSetup';
import ModularPaymentEntry from './components/payment/entry/ModularPaymentEntry';
import OfflineIndicator from './components/global/ui/OfflineIndicator';
import SyncStatusIndicator from './components/global/ui/SyncStatusIndicator';

// NEW: Offline-first components for instant UX
import { InitialSyncLoader, OfflineBanner } from './components/offline';

import syncEngine from './services/offline/sync/syncEngine';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
// OLD AUTH REMOVED - Now using AuthContext
// import authService from './services/auth/AuthService';
// import './setupAuth';
// import ReceivablesCollectionCenter from './components/receivables/ReceivablesCollectionCenter';

// Lazy load components for better performance and code splitting
const Dashboard = lazy(() => import('./components/Dashboard'));
const Products = lazy(() => import('./components/master/products/Products'));
const Orders = lazy(() => import('./components/sales/order/Orders'));
// BatchesInventory removed - use StockHub instead
const PaymentTracking = lazy(() => import('./components/payment/tracking/PaymentTracking'));
const PaymentDashboard = lazy(() => import('./components/payment/tracking/PaymentDashboard'));
const CreditManagement = lazy(() => import('./components/ledger/CreditManagement'));
const WhatsAppBusiness = lazy(() => import('./components/global/WhatsApp'));
// OLD EnhancedLogin moved to _OLD - using AuthContext login flow instead
// const EnhancedLogin = lazy(() => import('./components/EnhancedLogin'));
const CompanyProfile = lazy(() => import('./components/master/settings/CompanyProfile'));
// InventoryManagement deleted - now uses StockHub
// AccountingLedgers deleted - was just placeholder stub
// const ComponentsV2Test = lazy(() => import('./pages/ComponentsV2TestFixed'));

// Define types for better TypeScript support
type TabName =
  | 'home'
  | 'sales'
  | 'purchase'
  | 'payment'
  | 'payment-entry'
  | 'dashboard'
  | 'products'
  | 'customers'
  | 'orders'
  | 'batches'
  | 'payments'
  | 'payment-dashboard'
  | 'credit'
  | 'whatsapp'
  | 'profile'
  | 'inventory'
  | 'accounting'
  | 'analytics'
  | 'reports'
  | 'compliance'
  | 'settings'
  | 'sale-return'
  | 'purchase-return'
  | 'returns'
  | 'stock-management'
  | 'party-ledger'
  | 'credit-debit-note'
  | 'gst'
  | 'master'
  | 'payroll'
  | 'receivables-collection'
  | 'components-test';



// Memoized placeholder components for future features
const AnalyticsPlaceholder = React.memo(() => (
  <div className="p-4 bg-gray-50 min-h-screen">
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8 text-center animate-fade-in">
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-pharma-blue-500 to-pharma-blue-600 rounded-xl flex items-center justify-center">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">Analytics Dashboard</h1>
        <p className="text-gray-600 max-w-md mx-auto text-sm">Advanced analytics, business insights, and performance metrics coming soon to help you make data-driven decisions.</p>
      </div>
    </div>
  </div>
));



const CompliancePlaceholder = React.memo(() => (
  <div className="p-4 bg-gray-50 min-h-screen">
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8 text-center animate-fade-in">
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-pharma-orange-500 to-pharma-orange-600 rounded-xl flex items-center justify-center">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">Regulatory Compliance</h1>
        <p className="text-gray-600 max-w-md mx-auto text-sm">FSSAI licensing, GST compliance, drug licensing, and regulatory documentation management.</p>
      </div>
    </div>
  </div>
));

// Map each tab to the permission module it requires.
// Tabs not listed here (home, dashboard) are always accessible.
const TAB_MODULE_MAP: Partial<Record<TabName, string>> = {
  sales:                   'sales',
  purchase:                'purchase',
  payment:                 'payment',
  'payment-entry':         'payment',
  'payment-dashboard':     'payment',
  payments:                'payment',
  returns:                 'returns',
  'sale-return':           'returns',
  'purchase-return':       'returns',
  'stock-management':      'inventory',
  inventory:               'inventory',
  batches:                 'inventory',
  'party-ledger':          'ledger',
  accounting:              'ledger',
  'credit-debit-note':     'notes',
  gst:                     'gst',
  reports:                 'reports',
  master:                  'master',
  customers:               'master',
  profile:                 'master',
  payroll:                 'master',
};

const AppContent = (): JSX.Element => {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasModuleAccess } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabName>('home');

  // Guarded tab setter: only navigate if user has module access
  const setActiveTabGuarded = useCallback((tab: string) => {
    const requiredModule = TAB_MODULE_MAP[tab as TabName];
    if (requiredModule && !hasModuleAccess(requiredModule)) {
      // User lacks access — stay on home
      return;
    }
    setActiveTab(tab as TabName);
  }, [hasModuleAccess]);

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Authentication handled by AuthContext - no manual initialization needed

  // NOTE: Product sync is handled by syncEngine.startAutoSync() which calls syncPullService internally
  // No separate useEffect needed for product sync

  useEffect(() => {
    // Only start auto-sync when authenticated
    if (!isAuthenticated) {
      console.log('[SyncEngine] Not authenticated, skipping auto-sync setup');
      return;
    }

    // OFFLINE SYNC: Start auto-sync when authenticated AND online
    if (navigator.onLine) {
      console.log('🔄 [SyncEngine] Starting auto-sync (30s interval)');
      syncEngine.startAutoSync(30000); // Every 30 seconds

      // ALSO: Trigger immediate sync on login to populate cache
      console.log('🔄 [SyncPull] Triggering immediate sync on login...');
      import('./services/offline/sync/syncPullService').then(({ default: syncPullService }) => {
        syncPullService.syncProducts({ fullSync: false }).then(result => {
          if (result.success) {
            console.log(`✅ [SyncPull] Initial sync complete: ${result.itemsSynced} products`);
          }
        });
        syncPullService.syncCustomers().then(result => {
          if (result.success) {
            console.log(`✅ [SyncPull] Customer sync complete: ${result.itemsSynced} customers`);
          }
        });
      });

      // COMPANY PROFILE: Warm cache for instant access in previews
      import('./services/offline/modules/company').then(({ CompanyDataService }) => {
        CompanyDataService.warmCache().then(() => {
          console.log('✅ [CompanyDataService] Company profile cache warmed');
        });
      });
    }

    // OFFLINE SYNC: Trigger sync when coming back online
    const handleOnline = () => {
      console.log('🌐 [SyncEngine] Back online - triggering sync');
      syncEngine.forceSync();

      // syncEngine.forceSync already triggers syncPullService via triggerPullSync()
      // No need for duplicate call here
    };

    window.addEventListener('online', handleOnline);

    // Listen for navigation events from Settings buttons
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.tab) {
        setActiveTabGuarded(customEvent.detail.tab);
      }
    };

    window.addEventListener('navigate', handleNavigate as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('navigate', handleNavigate as EventListener);
      syncEngine.stopAutoSync();
    };
  }, [isAuthenticated, setActiveTabGuarded]);

  // Component renderer - removed useCallback to reduce input lag
  const renderActiveComponent = (): JSX.Element => {
    switch (activeTab) {
      case 'home':
        return <Home key="home" setActiveTab={setActiveTabGuarded} />;
      case 'sales':
        return <SalesHub key="sales" open={true} onClose={() => setActiveTab('home')} />;
      case 'purchase':
        return <PurchaseHub key="purchase" open={true} onClose={() => setActiveTab('home')} />;
      case 'payment':
        return <FinancialHub key="payment" open={true} onClose={() => setActiveTab('home')} />;
      case 'payment-entry':
        return (
          <PaymentProvider>
            <ModularPaymentEntry key="payment-entry" onClose={() => setActiveTab('home')} />
          </PaymentProvider>
        );
      case 'dashboard':
        return <Dashboard key="dashboard" />;
      case 'products':
        return <Products key="products" />;
      case 'customers':
        return <MasterHub key="customers" />;
      case 'orders':
        return <Orders key="orders" />;
      case 'batches':
        return <StockHub key="batches" open={true} onClose={() => setActiveTab('home')} />;
      case 'payments':
        return <PaymentTracking key="payments" />;
      case 'payment-dashboard':
        return <PaymentDashboard key="payment-dashboard" />;
      case 'credit':
        return <CreditManagement key="credit" />;
      case 'whatsapp':
        return <WhatsAppBusiness key="whatsapp" />;
      case 'profile':
        return <CompanyProfile key="company-profile" open={true} onClose={() => setActiveTab('dashboard')} />;
      case 'inventory':
        return <StockHub key="inventory" open={true} onClose={() => setActiveTab('home')} />;
      case 'accounting':
        return <LedgerHub key="accounting" open={true} onClose={() => setActiveTab('home')} />;
      case 'analytics':
        return <AnalyticsPlaceholder key="analytics" />;
      case 'reports':
        return <ReportsHub key="reports" open={true} onClose={() => setActiveTab('home')} />;
      case 'compliance':
        return <CompliancePlaceholder key="compliance" />;
      // Settings removed from sidebar - handled by settings icon in header
      case 'sale-return':
      case 'purchase-return':
      case 'returns':
        return <ReturnsHub key="returns" open={true} onClose={() => setActiveTab('home')} />;
      case 'stock-management':
        return <StockHub key="stock-management" open={true} onClose={() => setActiveTab('home')} />;
      case 'party-ledger':
        return <LedgerHub key="party-ledger" onClose={() => setActiveTab('home')} />;
      case 'credit-debit-note':
        return <NotesHub key="credit-debit-note" open={true} onClose={() => setActiveTab('home')} />;
      case 'gst':
        return <GSTHub key="gst" open={true} onClose={() => setActiveTab('home')} />;
      case 'master':
        return <MasterHub key="master" open={true} onClose={() => setActiveTab('home')} />;
      case 'payroll':
        return <PayrollHub key="payroll" open={true} onClose={() => setActiveTab('home')} />;
      case 'receivables-collection':
        return <div key="receivables-collection">Receivables Collection - Use Ledger Module → Collection Center</div>;
      case 'components-test':
        return <div key="components-test">Component Test Page Removed</div>;
      default:
        return <Home key="home-default" setActiveTab={setActiveTabGuarded} />;
    }
  };

  // Check if user wants to see auth diagnostic
  if (window.location.pathname === '/auth-diagnostic' || window.location.hash === '#auth-diagnostic') {
    // OLD AUTH DIAGNOSTIC REMOVED
    return <div>Diagnostic removed</div>;
  }

  // Loading handled by AuthContext - no need for setup check

  // Show loading while AuthContext initializes
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // User is authenticated - show main app with offline support
  return (
    <InitialSyncLoader>
      <QueryClientProvider client={queryClient as any}>
        <CompanyProvider>
          <SidebarProvider>
            <EscapeKeyProvider>
              <ToastProvider>
                <ErrorBoundary>
                  <div className="min-h-screen bg-gray-50">
                    {/* Offline banner at top */}
                    <OfflineBanner />

                    <Suspense fallback={<LoadingSpinner />}>
                      {renderActiveComponent()}
                    </Suspense>
                    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-40">
                      <SyncStatusIndicator />
                      <OfflineIndicator />
                    </div>
                    <ToastContainer position="top-right" />
                  </div>
                </ErrorBoundary>
              </ToastProvider>
            </EscapeKeyProvider>
          </SidebarProvider>
        </CompanyProvider>
      </QueryClientProvider>
    </InitialSyncLoader>
  );
};

// Wrap everything in AuthProvider at the top level
function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
