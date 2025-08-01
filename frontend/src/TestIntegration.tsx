/**
 * Test Integration Component
 * Tests PostgreSQL functions through REST API with Railway/Supabase
 */

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CustomerSearchV2 } from './shared/components/business/CustomerSearchV2';
import { ProductSearchV2 } from './shared/components/business/ProductSearchV2';
import { customerAPI, productAPI, invoiceAPI, dashboardAPI } from './services/api/apiClient';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function TestIntegrationInner() {
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const testDashboardStats = async () => {
    try {
      setIsLoading(true);
      addResult('Testing dashboard stats...');
      const stats = await dashboardAPI.getStats();
      addResult(`✅ Dashboard stats loaded: ${JSON.stringify(stats).substring(0, 100)}...`);
    } catch (error: any) {
      addResult(`❌ Dashboard stats failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testCustomerOutstanding = async () => {
    if (!selectedCustomer) {
      addResult('❌ Please select a customer first');
      return;
    }
    try {
      setIsLoading(true);
      addResult(`Testing outstanding for customer ${selectedCustomer.customer_name}...`);
      const outstanding = await customerAPI.getOutstanding(selectedCustomer.customer_id);
      addResult(`✅ Outstanding loaded: Total ₹${outstanding.total_outstanding || 0}, ${outstanding.invoices?.length || 0} invoices`);
    } catch (error: any) {
      addResult(`❌ Outstanding failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testProductStock = async () => {
    if (!selectedProduct) {
      addResult('❌ Please select a product first');
      return;
    }
    try {
      setIsLoading(true);
      addResult(`Testing stock for product ${selectedProduct.product_name}...`);
      const stock = await productAPI.getStock(selectedProduct.product_id);
      addResult(`✅ Stock loaded: ${stock.total_available || 0} units available in ${stock.batches?.length || 0} batches`);
    } catch (error: any) {
      addResult(`❌ Stock check failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testInvoiceCreation = async () => {
    if (!selectedCustomer || !selectedProduct) {
      addResult('❌ Please select both customer and product first');
      return;
    }
    try {
      setIsLoading(true);
      addResult('Testing invoice creation...');
      const invoiceData = {
        customer_id: selectedCustomer.customer_id,
        invoice_date: new Date().toISOString().split('T')[0],
        items: [{
          product_id: selectedProduct.product_id,
          quantity: 10,
          rate: selectedProduct.sale_price,
          discount_percent: 5,
        }],
        payment_terms: 'credit',
        due_days: 30,
        notes: 'Test invoice from Railway/Supabase integration',
      };
      
      const result = await invoiceAPI.create(invoiceData);
      addResult(`✅ Invoice created: ${result.invoice_number} - Total ₹${result.total_amount}`);
    } catch (error: any) {
      addResult(`❌ Invoice creation failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">PostgreSQL Function Integration Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Search Test */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Customer Search (api.search_customers)</h2>
          <CustomerSearchV2
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              addResult(`✅ Customer selected: ${customer.customer_name} (ID: ${customer.customer_id})`);
            }}
            placeholder="Type at least 2 characters..."
          />
          {selectedCustomer && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
              <div><strong>Selected:</strong> {selectedCustomer.customer_name}</div>
              <div><strong>Code:</strong> {selectedCustomer.customer_code}</div>
              <div><strong>Phone:</strong> {selectedCustomer.phone}</div>
              {selectedCustomer.gst_number && (
                <div><strong>GST:</strong> {selectedCustomer.gst_number}</div>
              )}
            </div>
          )}
        </div>

        {/* Product Search Test */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Product Search (api.search_products)</h2>
          <ProductSearchV2
            onSelect={(product, batch) => {
              setSelectedProduct(product);
              addResult(`✅ Product selected: ${product.product_name} (ID: ${product.product_id})${batch ? ` with batch ${batch.batch_number}` : ''}`);
            }}
            placeholder="Type at least 2 characters..."
            showStock={true}
          />
          {selectedProduct && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
              <div><strong>Selected:</strong> {selectedProduct.product_name}</div>
              <div><strong>Code:</strong> {selectedProduct.product_code}</div>
              <div><strong>Price:</strong> ₹{selectedProduct.sale_price} (MRP: ₹{selectedProduct.mrp})</div>
              <div><strong>GST:</strong> {selectedProduct.gst_percent}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Test Actions */}
      <div className="mt-6 bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Test Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={testDashboardStats}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Test Dashboard Stats
          </button>
          <button
            onClick={testCustomerOutstanding}
            disabled={isLoading || !selectedCustomer}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            Test Customer Outstanding
          </button>
          <button
            onClick={testProductStock}
            disabled={isLoading || !selectedProduct}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            Test Product Stock
          </button>
          <button
            onClick={testInvoiceCreation}
            disabled={isLoading || !selectedCustomer || !selectedProduct}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
          >
            Test Invoice Creation
          </button>
        </div>
      </div>

      {/* Test Results */}
      <div className="mt-6 bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Test Results</h2>
        <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
          {testResults.length === 0 ? (
            <div className="text-gray-500">No tests run yet. Try searching for customers or products above.</div>
          ) : (
            testResults.map((result, index) => (
              <div key={index} className="mb-1">{result}</div>
            ))
          )}
        </div>
      </div>

      {/* API Endpoint Info */}
      <div className="mt-6 bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">API Endpoints Being Tested:</h3>
        <ul className="text-sm space-y-1">
          <li>• <code>/api/v2/pg/customers/search</code> → <code>api.search_customers()</code></li>
          <li>• <code>/api/v2/pg/products/search</code> → <code>api.search_products()</code></li>
          <li>• <code>/api/v2/pg/products/{'{id}'}/stock</code> → <code>api.get_stock_availability()</code></li>
          <li>• <code>/api/v2/pg/customers/{'{id}'}/outstanding</code> → <code>api.get_outstanding_invoices()</code></li>
          <li>• <code>/api/v2/pg/invoices</code> → <code>api.create_invoice()</code></li>
          <li>• <code>/api/v2/pg/dashboard/stats</code> → <code>api.get_dashboard_summary()</code></li>
        </ul>
      </div>
    </div>
  );
}

export function TestIntegration() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestIntegrationInner />
    </QueryClientProvider>
  );
}