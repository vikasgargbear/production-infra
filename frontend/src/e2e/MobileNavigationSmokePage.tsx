import React, { useMemo, useState } from 'react';
import { FileText, List, ReceiptText } from 'lucide-react';
import MobileBottomNavigation from '../components/global/navigation/MobileBottomNavigation';
import ModuleHub, { Module } from '../components/global/navigation/ModuleHub';
import { SidebarProvider } from '../contexts/SidebarContext';

const CreateInvoiceFixture: React.FC = () => (
  <div className="h-full overflow-auto bg-gray-50 p-4" data-testid="invoice-fixture">
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h1 className="text-xl font-semibold text-gray-900">Create Invoice</h1>
      <p className="mt-1 text-sm text-gray-600">Mobile module content remains above the bottom navigation.</p>
      <button className="mt-5 min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white">
        Continue
      </button>
    </div>
  </div>
);

const SalesHistoryFixture: React.FC = () => (
  <div className="h-full bg-gray-50 p-4">
    <h1 className="text-xl font-semibold text-gray-900">Sales History</h1>
  </div>
);

const MobileNavigationSmokePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');
  const salesModules: Module[] = useMemo(() => [
    {
      id: 'invoice',
      label: 'Create Invoice',
      fullLabel: 'Create Invoice',
      icon: FileText,
      color: 'blue',
      component: CreateInvoiceFixture,
    },
    {
      id: 'history',
      label: 'Sales History',
      fullLabel: 'Sales History',
      icon: List,
      color: 'gray',
      component: SalesHistoryFixture,
    },
  ], []);

  return (
    <SidebarProvider>
      <main className="min-h-screen bg-gray-50 p-4 pb-24" data-testid="mobile-navigation-harness">
        <h1 className="text-2xl font-semibold text-gray-900">ERP Navigation Test</h1>
        <p className="mt-2 text-gray-600">Current destination: {activeTab}</p>
      </main>

      {activeTab === 'sales' && (
        <ModuleHub
          title="Sales"
          icon={ReceiptText}
          modules={salesModules}
          defaultModule="invoice"
          onClose={() => setActiveTab('home')}
        />
      )}

      <MobileBottomNavigation
        activeTab={activeTab}
        onNavigate={setActiveTab}
        hasModuleAccessOverride={() => true}
      />
    </SidebarProvider>
  );
};

export default MobileNavigationSmokePage;
