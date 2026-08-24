import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
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

const CalculationSmokePage = lazy(() => import('./e2e/CalculationSmokePage'));
const MobileNavigationSmokePage = lazy(() => import('./e2e/MobileNavigationSmokePage'));

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

const isTabName = (value: string): value is TabName =>
  value === 'home' || Object.prototype.hasOwnProperty.call(TAB_MODULE_MAP, value);

const AppContent = (): JSX.Element => {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasModuleAccess } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabName>('home');

  const navigate = useCallback((requestedTab: string) => {
    if (!isTabName(requestedTab)) return;
    const requiredModule = TAB_MODULE_MAP[requestedTab];
    if (requiredModule && !hasModuleAccess(requiredModule)) return;
    setActiveTab(requestedTab);
  }, [hasModuleAccess]);

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

  const renderActiveComponent = (): JSX.Element => {
    switch (activeTab) {
      case 'sales':
        return <SalesHub open onClose={() => setActiveTab('home')} />;
      case 'purchase':
        return <PurchaseHub open onClose={() => setActiveTab('home')} />;
      case 'payment':
        return <FinancialHub open onClose={() => setActiveTab('home')} />;
      case 'payment-entry':
        return (
          <PaymentProvider>
            <ModularPaymentEntry onClose={() => setActiveTab('home')} />
          </PaymentProvider>
        );
      case 'returns':
        return <ReturnsHub open onClose={() => setActiveTab('home')} />;
      case 'stock-management':
        return <StockHub open onClose={() => setActiveTab('home')} />;
      case 'party-ledger':
        return <LedgerHub onClose={() => setActiveTab('home')} />;
      case 'credit-debit-note':
        return <CreditDebitFlow open onClose={() => setActiveTab('home')} />;
      case 'gst':
        return <GSTHub open onClose={() => setActiveTab('home')} />;
      case 'reports':
        return <ReportsHub open onClose={() => setActiveTab('home')} />;
      case 'master':
        return <MasterHub open onClose={() => setActiveTab('home')} />;
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
                  <MobileBottomNavigation activeTab={activeTab} onNavigate={navigate} />
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
