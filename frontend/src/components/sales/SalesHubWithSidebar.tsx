import React, { useState } from 'react';
import { X } from 'lucide-react';
import InvoiceSidebar from './InvoiceSidebar';
import InvoiceFlow from './InvoiceFlow';
import InvoiceListV2 from './InvoiceListV2';
import InvoiceManagement from './InvoiceManagement';
import SalesOrderFlow from './SalesOrderFlow';
import ModularChallanCreatorV5 from '../challan/ModularChallanCreatorV5';

interface SalesHubWithSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

/**
 * SalesHubWithSidebar - Sales Hub with the new pharma-themed sidebar
 * Replaces the generic ModuleHub with a custom medical/pharma aesthetic
 */
const SalesHubWithSidebar: React.FC<SalesHubWithSidebarProps> = ({ 
  open = true, 
  onClose 
}) => {
  const [activeView, setActiveView] = useState<string>('create');
  const [showComponent, setShowComponent] = useState<boolean>(false);

  // Handle sidebar navigation
  const handleSidebarClick = (itemId: string) => {
    setActiveView(itemId);
    
    switch(itemId) {
      case 'create':
        setShowComponent(true);
        break;
      case 'list':
      case 'pending':
        setShowComponent(false);
        break;
      case 'analytics':
      case 'customers':
      case 'products':
        setShowComponent(false);
        break;
      default:
        break;
    }
  };

  // Handle component close
  const handleComponentClose = () => {
    setShowComponent(false);
    setActiveView('list');
  };

  if (!open) return null;

  // If a component is active (full screen mode)
  if (showComponent && activeView === 'create') {
    return (
      <InvoiceFlow 
        onClose={handleComponentClose}
      />
    );
  }

  // Main hub view with sidebar
  return (
    <div className="fixed inset-0 z-50 bg-gray-100">
      <div className="h-full flex">
        
        {/* Sidebar - Fixed width with pharma theme */}
        <div className="w-80 flex-shrink-0 h-full">
          <InvoiceSidebar 
            activeItem={activeView}
            onItemClick={handleSidebarClick}
            className="h-full"
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-white to-blue-50">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sales Operations</h1>
              <p className="text-sm text-gray-600 mt-1">Manage your sales transactions</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Create Invoice Card */}
            {activeView === 'create' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button
                  onClick={() => setShowComponent(true)}
                  className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <div className="text-left">
                    <h3 className="text-lg font-semibold mb-2">Create Invoice</h3>
                    <p className="text-blue-100 text-sm">Generate a new GST invoice</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    // Open Sales Order
                  }}
                  className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <div className="text-left">
                    <h3 className="text-lg font-semibold mb-2">Sales Order</h3>
                    <p className="text-purple-100 text-sm">Create booking order</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    // Open Challan
                  }}
                  className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <div className="text-left">
                    <h3 className="text-lg font-semibold mb-2">Delivery Challan</h3>
                    <p className="text-green-100 text-sm">Create delivery note</p>
                  </div>
                </button>
              </div>
            )}

            {/* Invoice List */}
            {activeView === 'list' && (
              <div>
                <InvoiceManagement />
              </div>
            )}

            {/* Pending Invoices */}
            {activeView === 'pending' && (
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Pending Invoices</h2>
                <InvoiceListV2 filterStatus="pending" />
              </div>
            )}

            {/* Analytics */}
            {activeView === 'analytics' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Sales Analytics</h3>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              </div>
            )}

            {/* Customers */}
            {activeView === 'customers' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Customer Management</h3>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              </div>
            )}

            {/* Products */}
            {activeView === 'products' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Product Catalog</h3>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesHubWithSidebar;