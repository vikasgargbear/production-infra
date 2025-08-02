import React, { useState, Suspense, lazy } from 'react';
import { QueryClientProvider } from 'react-query';
import queryClient from './queryClient';
// import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import LoadingSpinner from './components/LoadingSpinner';
import Home from './components/Home';
import SalesHub from './components/sales/SalesHub.tsx';
import PurchaseHub from './components/purchase/PurchaseHub.tsx';
import EnterprisePaymentEntry from './components/payment/EnterprisePaymentEntry';
import CompanySettings from './components/CompanySettings';
import { ToastProvider } from './components/global';
import ReturnsHub from './components/returns/ReturnsHub.tsx';
import StockHub from './components/inventory/StockHub.tsx';
import { LedgerHub } from './components/ledger';
import NotesHub from './components/notes/NotesHub.tsx';
import GSTHub from './components/gst/GSTHub.tsx';
import MasterHub from './components/master/MasterHub.tsx';
import ReceivablesCollectionCenter from './components/receivables/ReceivablesCollectionCenter';

// Lazy load components for better performance and code splitting
const Dashboard = lazy(() => import('./components/Dashboard'));
const Products = lazy(() => import('./components/Products'));
const Customers = lazy(() => import('./components/Customers'));
const Orders = lazy(() => import('./components/Orders'));
const BatchesInventory = lazy(() => import('./components/BatchesInventory'));
const PaymentTracking = lazy(() => import('./components/PaymentTracking'));
const PaymentDashboard = lazy(() => import('./components/PaymentDashboard'));
const CreditManagement = lazy(() => import('./components/CreditManagement'));
const WhatsAppBusiness = lazy(() => import('./components/WhatsAppSimple'));
const EnhancedLogin = lazy(() => import('./components/EnhancedLogin'));
const Profile = lazy(() => import('./components/Profile'));
const InventoryManagement = lazy(() => import('./components/InventoryManagement'));
const AccountingLedgers = lazy(() => import('./components/AccountingLedgers'));
const ComponentsV2Test = lazy(() => import('./pages/ComponentsV2TestFixed'));

// Define types for better TypeScript support
type TabName = 
  | 'home'
  | 'sales'
  | 'purchase'
  | 'payment'
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
  | 'receivables-collection'
  | 'components-test';

interface AppState {
  activeTab: TabName;
  isAuthenticated: boolean;
}

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

const ReportsPlaceholder = React.memo(() => (
  <div className="p-4 bg-gray-50 min-h-screen">
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8 text-center animate-fade-in">
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-pharma-green-500 to-pharma-green-600 rounded-xl flex items-center justify-center">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">Financial Reports</h1>
        <p className="text-gray-600 max-w-md mx-auto text-sm">Comprehensive financial reporting, GST returns, and business performance analysis tools.</p>
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

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true); // Bypass login for development

  // Component renderer - removed useCallback to reduce input lag
  const renderActiveComponent = (): JSX.Element => {
    switch (activeTab) {
      case 'home':
        return <Home key="home" setActiveTab={setActiveTab} />;
      case 'sales':
        return <SalesHub key="sales" open={true} onClose={() => setActiveTab('home')} />;
      case 'purchase':
        return <PurchaseHub key="purchase" open={true} onClose={() => setActiveTab('home')} />;
      case 'payment':
        return <EnterprisePaymentEntry key="payment" open={true} onClose={() => setActiveTab('home')} />;
      case 'dashboard':
        return <Dashboard key="dashboard" />;
      case 'products':
        return <Products key="products" />;
      case 'customers':
        return <Customers key="customers" />;
      case 'orders':
        return <Orders key="orders" />;
      case 'batches':
        return <BatchesInventory key="batches" />;
      case 'payments':
        return <PaymentTracking key="payments" />;
      case 'payment-dashboard':
        return <PaymentDashboard key="payment-dashboard" />;
      case 'credit':
        return <CreditManagement key="credit" />;
      case 'whatsapp':
        return <WhatsAppBusiness key="whatsapp" />;
      case 'profile':
        return <Profile key="profile" />;
      case 'inventory':
        return <InventoryManagement key="inventory" />;
      case 'accounting':
        return <AccountingLedgers key="accounting" />;
      case 'analytics':
        return <AnalyticsPlaceholder key="analytics" />;
      case 'reports':
        return <ReportsPlaceholder key="reports" />;
      case 'compliance':
        return <CompliancePlaceholder key="compliance" />;
      case 'settings':
        return <CompanySettings key="settings" open={true} onClose={() => setActiveTab('home')} />;
      case 'sale-return':
      case 'purchase-return':
      case 'returns':
        return <ReturnsHub key="returns" open={true} onClose={() => setActiveTab('home')} />;
      case 'stock-management':
        return <StockHub key="stock-management" open={true} onClose={() => setActiveTab('home')} />;
      case 'party-ledger':
        return <LedgerHub key="party-ledger" open={true} onClose={() => setActiveTab('home')} />;
      case 'credit-debit-note':
        return <NotesHub key="credit-debit-note" open={true} onClose={() => setActiveTab('home')} />;
      case 'gst':
        return <GSTHub key="gst" open={true} onClose={() => setActiveTab('home')} />;
      case 'master':
        return <MasterHub key="master" open={true} onClose={() => setActiveTab('home')} />;
      case 'receivables-collection':
        return <ReceivablesCollectionCenter key="receivables-collection" open={true} onClose={() => setActiveTab('home')} />;
      case 'components-test':
        return <ComponentsV2Test key="components-test" />;
      default:
        return <Home key="home-default" setActiveTab={setActiveTab} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <EnhancedLogin onLogin={() => setIsAuthenticated(true)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <div className="min-h-screen bg-gray-50">
            <Suspense fallback={<LoadingSpinner />}>
              {renderActiveComponent()}
            </Suspense>
          </div>
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
