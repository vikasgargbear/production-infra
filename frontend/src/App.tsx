import React, { Suspense, lazy, useCallback, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import queryClient from './queryClient';
import LoginPage from './components/auth/LoginPage';
import OAuthConsentPage from './components/auth/OAuthConsentPage';
import Home from './components/Home';
import SalesHub from './components/sales/SalesHub';
import PurchaseHub from './components/purchase/PurchaseHub';
import FinancialHub from './components/payment/FinancialHub';
import ModularPaymentEntry from './components/payment/entry/ModularPaymentEntry';
import ReturnsHub from './components/returns/ReturnsHub';
import StockHub from './components/inventory/StockHub';
import { LedgerHub } from './components/ledger';
import CreditDebitFlow from './components/payment/flows/CreditDebitFlow';
import GSTHub from './components/gst/GSTHub';
import MasterHub from './components/master/MasterHub';
import ReportsHub from './components/reports/ReportsHub';
import MobileBottomNavigation from './components/global/navigation/MobileBottomNavigation';
import { ErrorBoundary } from './components/global/utilities';
import { LoadingSpinner } from './components/global/ui';
import { ToastProvider } from './components/global';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { EscapeKeyProvider } from './contexts/EscapeKeyContext';
import { PaymentProvider } from './contexts/PaymentContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { usePermissions } from './hooks/usePermissions';
import { useHashRouter } from './hooks/useHashRouter';

const CalculationSmokePage = lazy(() => import('./e2e/CalculationSmokePage'));
const MobileNavigationSmokePage = lazy(() => import('./e2e/MobileNavigationSmokePage'));

// ---------------------------------------------------------------------------
// Tab / module definitions
// ---------------------------------------------------------------------------

type TabName =
  | 'home'
  | 'sales'
  | 'purchase'
  | 'payment'
  | 'payment-entry'
  | 'returns'
  | 'stock-management'
  | 'party-ledger'
  | 'credit-debit-note'
  | 'gst'
  | 'reports'
  | 'master';

/** All valid tab names in insertion order — used by the hash router. */
const ALL_TABS: readonly TabName[] = [
  'home',
  'sales',
  'purchase',
  'payment',
  'payment-entry',
  'returns',
  'stock-management',
  'party-ledger',
  'credit-debit-note',
  'gst',
  'reports',
  'master',
];

const TAB_MODULE_MAP: Partial<Record<TabName, string>> = {
  sales: 'sales',
  purchase: 'purchase',
  payment: 'payment',
  'payment-entry': 'payment',
  returns: 'returns',
  'stock-management': 'inventory',
  'party-ledger': 'ledger',
  'credit-debit-note': 'notes',
  gst: 'gst',
  reports: 'reports',
  master: 'master',
};

// ---------------------------------------------------------------------------
// AppContent
// ---------------------------------------------------------------------------

const AppContent = (): JSX.Element => {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasModuleAccess } = usePermissions();

  /**
   * hasAccess is called by useHashRouter to gate tab transitions.
   * Home is always accessible; every other tab is gated by its module permission.
   */
  const hasAccess = useCallback(
    (tab: string): boolean => {
      if (tab === 'home') return true;
      const requiredModule = TAB_MODULE_MAP[tab as TabName];
      return !requiredModule || hasModuleAccess(requiredModule);
    },
    [hasModuleAccess]
  );

  const { tab: activeTab, subpage, navigateTo, setSubpage } = useHashRouter(ALL_TABS, hasAccess);

  // Cast is safe because useHashRouter only allows values from ALL_TABS
  const activeTabName = activeTab as TabName;

  // Legacy custom-event bridge — keeps old callers (keyboard shortcuts, Home buttons) working
  const navigate = useCallback(
    (requestedTab: string) => navigateTo(requestedTab),
    [navigateTo]
  );

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab) navigate(tab);
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, [navigate]);

  if (
    process.env.REACT_APP_ENABLE_E2E_HARNESS === 'true'
    && window.location.pathname === '/e2e/calculation-smoke'
  ) {
    return <Suspense fallback={<LoadingSpinner />}><CalculationSmokePage /></Suspense>;
  }
  if (
    process.env.REACT_APP_ENABLE_E2E_HARNESS === 'true'
    && window.location.pathname === '/e2e/mobile-navigation'
  ) {
    return <Suspense fallback={<LoadingSpinner />}><MobileNavigationSmokePage /></Suspense>;
  }
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }
  if (!isAuthenticated) return <LoginPage />;
  if (window.location.pathname === '/oauth/consent') return <OAuthConsentPage />;

  const goHome = () => navigateTo('home');

  const renderActiveComponent = (): JSX.Element => {
    switch (activeTabName) {
      case 'sales':
        return (
          <SalesHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'purchase':
        return (
          <PurchaseHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'payment':
        return (
          <FinancialHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'payment-entry':
        return (
          <PaymentProvider>
            <ModularPaymentEntry onClose={goHome} />
          </PaymentProvider>
        );
      case 'returns':
        return <ReturnsHub open onClose={goHome} />;
      case 'stock-management':
        return (
          <StockHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'party-ledger':
        return <LedgerHub onClose={goHome} />;
      case 'credit-debit-note':
        return <CreditDebitFlow open onClose={goHome} />;
      case 'gst':
        return (
          <GSTHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'reports':
        return (
          <ReportsHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'master':
        return (
          <MasterHub
            open
            onClose={goHome}
            initialSubpage={subpage}
            onSubpageChange={setSubpage}
          />
        );
      case 'home':
      default:
        return <Home setActiveTab={navigate} />;
    }
  };

  return (
    <QueryClientProvider client={queryClient as any}>
      <CompanyProvider>
        <SidebarProvider>
          <EscapeKeyProvider>
            <ToastProvider>
              <ErrorBoundary>
                <div className="min-h-screen bg-gray-50">
                  <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
                    <Suspense fallback={<LoadingSpinner />}>{renderActiveComponent()}</Suspense>
                  </div>
                  <MobileBottomNavigation activeTab={activeTabName} onNavigate={navigate} />
                  <ToastContainer position="top-right" />
                </div>
              </ErrorBoundary>
            </ToastProvider>
          </EscapeKeyProvider>
        </SidebarProvider>
      </CompanyProvider>
    </QueryClientProvider>
  );
};

const App = (): JSX.Element => <AuthProvider><AppContent /></AuthProvider>;

export default App;
