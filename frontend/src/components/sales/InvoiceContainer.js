import React, { useState } from 'react';
import InvoiceSidebar from './InvoiceSidebar';
import InvoiceFlow from './InvoiceFlow';
import InvoiceManagement from './InvoiceManagement';

/**
 * InvoiceContainer - Container component that integrates the new sidebar with invoice components
 * Demonstrates how to use the pharma-themed sidebar with existing invoice functionality
 */
const InvoiceContainer = ({ onClose }) => {
  const [activeView, setActiveView] = useState('create');
  const [showInvoiceFlow, setShowInvoiceFlow] = useState(false);

  const handleSidebarClick = (itemId) => {
    setActiveView(itemId);
    
    // Handle navigation based on selected item
    switch(itemId) {
      case 'create':
        setShowInvoiceFlow(true);
        break;
      case 'list':
      case 'pending':
        setShowInvoiceFlow(false);
        break;
      case 'analytics':
        // Navigate to analytics view
        console.log('Navigate to analytics');
        break;
      case 'customers':
        // Navigate to customers view
        console.log('Navigate to customers');
        break;
      case 'products':
        // Navigate to products view
        console.log('Navigate to products');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar - Fixed width */}
      <div className="w-72 flex-shrink-0">
        <InvoiceSidebar 
          activeItem={activeView}
          onItemClick={handleSidebarClick}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showInvoiceFlow ? (
          <InvoiceFlow 
            onClose={() => {
              setShowInvoiceFlow(false);
              setActiveView('list');
            }}
          />
        ) : (
          <div className="flex-1 overflow-auto">
            {activeView === 'list' && (
              <InvoiceManagement />
            )}
            {activeView === 'pending' && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Pending Invoices</h2>
                <InvoiceManagement filterStatus="pending" />
              </div>
            )}
            {activeView === 'analytics' && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Sales Analytics</h2>
                {/* Analytics component would go here */}
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-gray-600">Analytics dashboard coming soon...</p>
                </div>
              </div>
            )}
            {activeView === 'customers' && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Customer Management</h2>
                {/* Customer management component would go here */}
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-gray-600">Customer management coming soon...</p>
                </div>
              </div>
            )}
            {activeView === 'products' && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Product Catalog</h2>
                {/* Product catalog component would go here */}
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-gray-600">Product catalog coming soon...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceContainer;