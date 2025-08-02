import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Calendar, ArrowRight,
  CheckCircle, MessageCircle, FileInput, Printer,
  X, AlertCircle, FileText, Truck
} from 'lucide-react';
import { 
  CustomerSearch, 
  ProductSearchSimple, 
  ProductCreationModal,
  CustomerCreationModal,
  ItemsTable,
  NotesSection,
  ModuleHeader
} from '../global';
import { ordersApi, salesApi } from '../../services/api';
import salesOrdersAPI from '../../services/api/modules/salesOrders.api';
import { invoicesApi as invoicesApiModule } from '../../services/api/modules/invoices.api';
import { challansApi as challansApiModule } from '../../services/api/modules/challans.api';

// Default org ID for development
const DEFAULT_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

// Function to convert number to words
const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const convertHundreds = (n) => {
    let str = '';
    if (n > 99) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 19) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      str += teens[n - 10] + ' ';
      return str;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str;
  };

  const convertToWords = (n) => {
    if (n === 0) return 'Zero';
    
    let str = '';
    
    // Handle crores
    if (n >= 10000000) {
      str += convertHundreds(Math.floor(n / 10000000)) + 'Crore ';
      n %= 10000000;
    }
    
    // Handle lakhs
    if (n >= 100000) {
      str += convertHundreds(Math.floor(n / 100000)) + 'Lakh ';
      n %= 100000;
    }
    
    // Handle thousands
    if (n >= 1000) {
      str += convertHundreds(Math.floor(n / 1000)) + 'Thousand ';
      n %= 1000;
    }
    
    // Handle hundreds
    if (n > 0) {
      str += convertHundreds(n);
    }
    
    return str.trim();
  };

  const amount = Math.floor(num);
  const paise = Math.round((num - amount) * 100);
  
  let words = convertToWords(amount) + ' Rupees';
  if (paise > 0) {
    words += ' and ' + convertToWords(paise) + ' Paise';
  }
  words += ' Only';
  
  return words;
};

const SalesOrderFlowV2 = ({ open = true, onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [messageType, setMessageType] = useState('');

  // Generate order number
  const generateOrderNumber = () => {
    const timestamp = new Date().getTime();
    return `SO-${timestamp}`;
  };

  // Sales Order data state
  const [order, setOrder] = useState({
    order_number: generateOrderNumber(),
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: '',
    customer_name: '',
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    items: [],
    status: 'pending',
    payment_terms: 'credit',
    reference_no: '',
    sales_person: localStorage.getItem('userName') || 'Admin',
    created_by: localStorage.getItem('userName') || 'Admin',
    terms_conditions: 'Standard terms apply',
    notes: '',
    discount_amount: 0,
    other_charges: 0,
    total_quantity: 0,
    total_amount: 0,
    subtotal_amount: 0,
    tax_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    round_off: 0
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              saveOrder();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              printOrder();
            }
            break;
          case 'n':
            e.preventDefault();
            setShowCustomerModal(true);
            break;
          case 'i':
            e.preventDefault();
            setShowImportModal(true);
            break;
          case 'f':
            e.preventDefault();
            // Focus on product search
            const productSearchInput = document.querySelector('input[placeholder*="Search product"]');
            if (productSearchInput) productSearchInput.focus();
            break;
        }
      }
      
      // Escape to close modals or go back
      if (e.key === 'Escape') {
        if (showCustomerModal) setShowCustomerModal(false);
        else if (showProductModal) setShowProductModal(false);
        else if (showImportModal) setShowImportModal(false);
        else if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showCustomerModal, showProductModal, showImportModal]);

  // Handle import from invoice/challan
  const handleImport = (importData) => {
    // Set customer details
    if (importData.customer_id) {
      setSelectedCustomer(importData.customer_details);
      handleCustomerSelect(importData.customer_details);
    }
    
    // Set addresses
    if (importData.billing_address) {
      setOrder(prev => ({
        ...prev,
        billing_address: importData.billing_address,
        shipping_address: importData.shipping_address || importData.billing_address
      }));
    }
    
    // Set items
    if (importData.items && importData.items.length > 0) {
      setOrder(prev => ({
        ...prev,
        items: importData.items,
        notes: importData.reference_doc ? `Created from ${importData.reference_doc}` : prev.notes
      }));
      recalculateTotals(importData.items);
    }
  };

  // Handle customer selection
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    const billingAddress = `${customer.address || ''}, ${customer.city || ''}, ${customer.state || ''} ${customer.pincode || ''}`.trim();
    
    setOrder(prev => ({
      ...prev,
      customer_id: customer.customer_id || customer.id,
      customer_name: customer.customer_name || customer.name,
      customer_details: customer,
      billing_address: billingAddress,
      shipping_address: sameAsBilling ? billingAddress : prev.shipping_address
    }));
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    const existingItem = order.items.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      // Increase quantity if product already exists
      updateItemQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      // Add new item
      const quantity = 1;
      const unitPrice = product.sale_price || product.mrp || 0;
      const discountPercent = 0;
      const gstPercent = product.gst_percent || 18;
      
      const subtotal = quantity * unitPrice;
      const discountAmount = (subtotal * discountPercent) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = (taxableAmount * gstPercent) / 100;
      
      const newItem = {
        id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        batch_id: product.batch_id,
        batch_number: product.batch_number || product.batch_no,
        quantity: quantity,
        unit: product.unit || product.uom || 'NOS',
        pack_size: product.pack_size || product.pack_type,
        mrp: product.mrp || 0,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        gst_percent: gstPercent,
        tax_amount: taxAmount,
        subtotal: subtotal,
        total: taxableAmount + taxAmount,
        manufacturer: product.manufacturer,
        category: product.category
      };

      setOrder(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
      
      recalculateTotals([...order.items, newItem]);
    }
  };

  // Update item quantity
  const updateItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }

    const updatedItems = order.items.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    );
    
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Update item field
  const updateItem = (index, field, value) => {
    const updatedItems = order.items.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate amounts if needed
        if (field === 'quantity' || field === 'unit_price' || field === 'discount_percent') {
          const quantity = parseFloat(updatedItem.quantity) || 0;
          const unitPrice = parseFloat(updatedItem.unit_price) || 0;
          const discountPercent = parseFloat(updatedItem.discount_percent) || 0;
          
          const subtotal = quantity * unitPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const gstAmount = (taxableAmount * (updatedItem.gst_percent || 0)) / 100;
          
          updatedItem.subtotal = subtotal;
          updatedItem.discount_amount = discountAmount;
          updatedItem.tax_amount = gstAmount;
          updatedItem.total = taxableAmount + gstAmount;
        }
        
        return updatedItem;
      }
      return item;
    });
    
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Remove item
  const removeItem = (index) => {
    const updatedItems = order.items.filter((_, i) => i !== index);
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Recalculate totals
  const recalculateTotals = (items) => {
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const subtotal = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      return sum + (qty * price);
    }, 0);
    
    const totalDiscount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      return sum + ((qty * price * discountPercent) / 100);
    }, 0) + (parseFloat(order.discount_amount) || 0);
    
    const totalTax = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const taxPercent = parseFloat(item.gst_percent) || 0;
      const taxableAmount = (qty * price) * (1 - discountPercent / 100);
      return sum + ((taxableAmount * taxPercent) / 100);
    }, 0);
    
    const totalAmount = subtotal - totalDiscount + totalTax + (parseFloat(order.other_charges) || 0);
    const cgstAmount = totalTax / 2;
    const sgstAmount = totalTax / 2;
    const roundOff = Math.round(totalAmount) - totalAmount;
    const finalAmount = totalAmount + roundOff;
    
    setOrder(prev => ({
      ...prev,
      total_quantity: totalQuantity,
      subtotal_amount: subtotal,
      discount_amount: totalDiscount,
      tax_amount: totalTax,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      round_off: roundOff,
      total_amount: finalAmount
    }));
  };

  // Save order using enterprise API
  const saveOrder = async () => {
    setSaving(true);
    try {
      const orderData = {
        // Customer information (from orders schema)
        customer_id: parseInt(order.customer_id),
        customer_name: order.customer_name,
        customer_phone: order.customer_phone || '',
        
        // Order details
        order_date: order.order_date || new Date().toISOString().split('T')[0],
        delivery_date: order.expected_delivery_date || order.order_date || new Date().toISOString().split('T')[0],
        delivery_address: order.shipping_address || order.billing_address || '',
        delivery_type: 'delivery',
        
        // Items (matching order_items schema)
        items: order.items.map(item => {
          const quantity = parseInt(item.quantity) || 1;
          const unitPrice = parseFloat(item.unit_price) || 0;
          const sellingPrice = parseFloat(item.unit_price) || 0;
          const discountPercent = parseFloat(item.discount_percent) || 0;
          const taxPercent = parseFloat(item.gst_percent) || 0;
          
          // Calculate amounts
          const subtotal = quantity * sellingPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = (taxableAmount * taxPercent) / 100;
          const totalPrice = taxableAmount + taxAmount;
          
          return {
            product_id: parseInt(item.product_id),
            product_name: item.product_name || '',
            batch_id: item.batch_id ? parseInt(item.batch_id) : null,
            batch_number: item.batch_number || item.batch_no || null,
            quantity: quantity,
            unit_price: unitPrice,
            selling_price: sellingPrice,
            mrp: parseFloat(item.mrp) || sellingPrice,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount,
            total_price: totalPrice,
            line_total: totalPrice
          };
        }),
        
        // Financial details (from orders schema)
        subtotal_amount: parseFloat(order.subtotal_amount) || 0,
        discount_amount: parseFloat(order.discount_amount) || 0,
        tax_amount: parseFloat(order.tax_amount) || 0,
        round_off_amount: 0,
        final_amount: parseFloat(order.total_amount) || 0,
        
        // Payment details
        paid_amount: 0,
        balance_amount: parseFloat(order.total_amount) || 0,
        
        // Metadata
        notes: order.notes || '',
        
        // Organization
        org_id: localStorage.getItem('orgId') || DEFAULT_ORG_ID
      };

      console.log('=== ORDER CREATION DEBUG ===');
      console.log('Raw order state:', order);
      console.log('Order items:', order.items);
      console.log('EXACT object being sent to API:', JSON.stringify(orderData, null, 2));
      console.log('=== END DEBUG ===');

      // Create sales order data matching the backend OrderCreate schema
      const salesOrderData = {
        // Required org_id as UUID
        org_id: localStorage.getItem('orgId') || DEFAULT_ORG_ID,
        
        // Customer info
        customer_id: parseInt(order.customer_id),
        
        // Dates
        order_date: order.order_date || new Date().toISOString().split('T')[0],
        delivery_date: order.expected_delivery_date || order.order_date || new Date().toISOString().split('T')[0],
        
        // Order type (must be 'sales', not 'sales_order')
        order_type: 'sales',
        payment_terms: 'credit',
        
        // Items matching OrderItemCreate schema
        items: order.items.map(item => {
          const quantity = parseInt(item.quantity) || 1;
          const unitPrice = parseFloat(item.unit_price) || 0;
          const discountPercent = parseFloat(item.discount_percent) || 0;
          const taxPercent = parseFloat(item.gst_percent) || 0;
          
          // Calculate amounts as backend expects
          const subtotal = quantity * unitPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = (taxableAmount * taxPercent) / 100;
          
          return {
            product_id: parseInt(item.product_id),
            batch_id: item.batch_id ? parseInt(item.batch_id) : null,
            quantity: quantity,
            unit_price: unitPrice,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount
          };
        }),
        
        // Optional fields
        notes: order.notes || '',
        billing_address: order.billing_address || '',
        shipping_address: order.shipping_address || '',
        discount_amount: parseFloat(order.discount_amount) || 0,
        other_charges: parseFloat(order.other_charges) || 0
      };
      
      console.log('Sales order data to send:', salesOrderData);
      
      // Direct API call to sales-orders endpoint
      const response = await api.post('/sales-orders/', salesOrderData);
      
      if (response?.data) {
        const createdOrderId = response.data.order_id || response.data.id;
        const createdOrderNumber = response.data.order_number || response.data.order_no || `ORD-${createdOrderId}`;
        
        setMessage(`Sales order ${createdOrderNumber} created successfully!`);
        setMessageType('success');
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      
      // Check for validation errors
      let errorMessage = 'Failed to create sales order';
      
      if (error.response?.data?.detail) {
        const details = error.response.data.detail;
        if (Array.isArray(details)) {
          errorMessage = details.map(err => 
            `${err.loc?.join('.') || 'Field'}: ${err.msg}`
          ).join('\n');
        } else {
          errorMessage = details;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.error('Detailed error:', error.response?.data);
      
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  // Print order
  const printOrder = () => {
    // Add print-specific class to body
    document.body.classList.add('printing-order');
    
    // Trigger print
    window.print();
    
    // Remove print-specific class after a delay
    setTimeout(() => {
      document.body.classList.remove('printing-order');
    }, 100);
  };

  // Share on WhatsApp
  const shareOnWhatsApp = () => {
    if (!order.customer_details?.phone) {
      alert('Customer phone number not available');
      return;
    }

    const message = `
Sales Order: ${order.order_number}
Date: ${order.order_date}
Customer: ${order.customer_name}
Items: ${order.total_quantity}
Amount: ₹${order.total_amount.toFixed(2)}
Expected Delivery: ${order.expected_delivery_date}
    `.trim();

    const whatsappUrl = `https://wa.me/91${order.customer_details.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (!open) return null;

  // Step 1: Create Order
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          
          {/* Header */}
          <ModuleHeader
            title="Sales Order"
            documentNumber={order.order_number}
            status={order.status}
            icon={ShoppingCart}
            iconColor="text-purple-600"
            onClose={onClose}
            historyType="order"
            showSaveDraft={true}
            onSaveDraft={() => {
              console.log('Save draft clicked');
            }}
          />

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+I</strong> - Import | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-6xl mx-auto px-6 py-6">
              
              {/* Message Display */}
              {message && (
                <div className={`mb-4 p-3 rounded flex items-center ${
                  messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                  {message}
                </div>
              )}
              
              {/* Top Section - Dates and Import */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={order.order_date}
                      onChange={(e) => setOrder(prev => ({ ...prev, order_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected Delivery</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={order.expected_delivery_date}
                      onChange={(e) => setOrder(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Import Data</label>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                  >
                    <FileInput className="w-4 h-4 text-gray-400" />
                    <span>Import from Invoice/Challan</span>
                  </button>
                </div>
              </div>

              {/* Customer Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">CUSTOMER</h3>
                <CustomerSearch
                  value={selectedCustomer}
                  onChange={handleCustomerSelect}
                  onCreateNew={() => setShowCustomerModal(true)}
                  displayMode="inline"
                  placeholder="Search customer by name, phone, or code..."
                  required
                />
              </div>



              {/* Products Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">PRODUCTS</h3>
                <ProductSearchSimple
                  onAddItem={handleProductSelect}
                  onCreateProduct={(productName) => {
                    setNewProductName(productName || '');
                    setShowProductModal(true);
                  }}
                />
              </div>

              {/* Items Table */}
              {order.items.length > 0 && (
                <div className="mb-6">
                  <ItemsTable
                    items={order.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    title="Order Items"
                    columns={['product', 'pack', 'quantity', 'free', 'mrp', 'rate', 'discount', 'tax', 'total']}
                    customColumns={{
                      pack: {
                        label: 'Pack/Unit',
                        align: 'center',
                        render: (item) => {
                          const pack = item.pack_size || item.pack_type || '1x1';
                          const unit = item.unit || item.uom || 'TAB';
                          return `${pack} ${unit}`;
                        }
                      }
                    }}
                  />
                </div>
              )}


            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 bg-white px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">Items: <strong>{order.total_quantity}</strong></span>
                <span className="text-gray-600">Amount: <strong>₹{order.total_amount.toFixed(2)}</strong></span>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!order.customer_id || order.items.length === 0}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Modals */}
        {showCustomerModal && (
          <CustomerCreationModal
            show={showCustomerModal}
            onClose={() => setShowCustomerModal(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCustomerModal(false);
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            show={showProductModal}
            onClose={() => {
              setShowProductModal(false);
              setNewProductName('');
            }}
            onProductCreated={(product) => {
              handleProductSelect(product);
              setShowProductModal(false);
              setNewProductName('');
            }}
            initialProductName={newProductName}
          />
        )}

        {showImportModal && (
          <ImportFromDocumentModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            onImport={handleImport}
          />
        )}

      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        
        {/* Header */}
        <ModuleHeader
          title="Review Order"
          documentNumber={order.order_number}
          status={order.status}
          icon={ShoppingCart}
          iconColor="text-purple-600"
          onClose={onClose}
          historyType="order"
          additionalActions={[
            {
              label: "Edit",
              onClick: () => setCurrentStep(1),
              variant: "default"
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Order | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Back
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            
            {/* Message Display */}
            {message && (
              <div className={`mb-4 p-3 rounded-lg flex items-center ${
                messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                {message}
              </div>
            )}
            
            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body.printing-order * {
                  visibility: hidden !important;
                }
                body.printing-order .order-preview-container,
                body.printing-order .order-preview-container * {
                  visibility: visible !important;
                }
                body.printing-order .order-preview-container {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 20px !important;
                  background: white !important;
                }
                .print-container {
                  padding: 20px !important;
                  box-shadow: none !important;
                  margin: 0 !important;
                }
                .print-table {
                  border-collapse: collapse !important;
                  border: 1px solid #000 !important;
                  width: 100% !important;
                }
                .print-table th,
                .print-table td {
                  border: 1px solid #000 !important;
                  padding: 8px !important;
                }
                .print-table thead {
                  background-color: #f0f0f0 !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .no-print {
                  display: none !important;
                }
                .print-header {
                  border-bottom: 2px solid #000 !important;
                  margin-bottom: 20px !important;
                  padding-bottom: 10px !important;
                }
                .print-section {
                  border: 1px solid #000 !important;
                  padding: 10px !important;
                  margin-bottom: 10px !important;
                }
                .page-break-avoid {
                  page-break-inside: avoid !important;
                }
                body {
                  margin: 0 !important;
                  padding: 0 !important;
                }
                /* Hide editable inputs in print */
                input, select {
                  border: none !important;
                  background: transparent !important;
                }
              }
            ` }} />
            
            {/* Order Preview */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 print-container order-preview-container">
              {/* Branding Header */}
              <div className="text-center mb-8 print-header">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center shadow-lg">
                    <ShoppingCart className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">AASO Pharma</h1>
                <h2 className="text-xl font-semibold text-purple-600">SALES ORDER</h2>
                <p className="text-gray-600 mt-1">{order.order_number}</p>
                <p className="text-sm text-gray-500">Date: {new Date(order.order_date).toLocaleDateString()}</p>
              </div>

              {/* Order Details Section */}
              <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-600">Order Status</p>
                  <p className="text-sm font-semibold text-purple-600">CONFIRMED</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Expected Delivery</p>
                  <p className="text-sm font-semibold">{new Date(order.expected_delivery_date).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Payment Terms</p>
                  <select
                    value={order.payment_terms || 'credit'}
                    onChange={(e) => setOrder(prev => ({ ...prev, payment_terms: e.target.value }))}
                    className="text-sm font-semibold bg-transparent border-b border-gray-300 focus:border-purple-500 focus:outline-none capitalize cursor-pointer"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit">Credit</option>
                    <option value="advance">Advance</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Sales Person</p>
                  <input
                    type="text"
                    value={order.sales_person || localStorage.getItem('userName') || 'Admin'}
                    onChange={(e) => setOrder(prev => ({ ...prev, sales_person: e.target.value }))}
                    className="text-sm font-semibold bg-transparent border-b border-gray-300 focus:border-purple-500 focus:outline-none"
                    placeholder="Sales person name"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600">Created By</p>
                  <input
                    type="text"
                    value={order.created_by || localStorage.getItem('userName') || 'Admin'}
                    onChange={(e) => setOrder(prev => ({ ...prev, created_by: e.target.value }))}
                    className="text-sm font-semibold bg-transparent border-b border-gray-300 focus:border-purple-500 focus:outline-none"
                    placeholder="Created by"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600">Created On</p>
                  <p className="text-sm font-semibold">{new Date().toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Bill To</h3>
                  <p className="font-medium">{order.customer_name}</p>
                  <p className="text-sm text-gray-600">{order.billing_address}</p>
                  {selectedCustomer?.gstin && (
                    <p className="text-sm text-gray-600">GSTIN: {selectedCustomer.gstin}</p>
                  )}
                  {selectedCustomer?.phone && (
                    <p className="text-sm text-gray-600">Phone: {selectedCustomer.phone}</p>
                  )}
                  {selectedCustomer?.email && (
                    <p className="text-sm text-gray-600">Email: {selectedCustomer.email}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Ship To</h3>
                  <p className="text-sm text-gray-600">{order.shipping_address}</p>
                  {selectedCustomer?.shipping_phone && (
                    <p className="text-sm text-gray-600">Contact: {selectedCustomer.shipping_phone}</p>
                  )}
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Order Items</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-200 print-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 border-b">Item Details</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 border-b">HSN</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 border-b">Pack/Unit</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 border-b">Qty</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 border-b">Free</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 border-b">MRP</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 border-b">Rate</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 border-b">Disc %</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 border-b">GST %</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, index) => {
                        const quantity = parseFloat(item.quantity) || 0;
                        const rate = parseFloat(item.unit_price) || 0;
                        const discount = parseFloat(item.discount_percent) || 0;
                        const gst = parseFloat(item.gst_percent) || 0;
                        const amount = quantity * rate;
                        const discountAmount = (amount * discount) / 100;
                        const taxableAmount = amount - discountAmount;
                        const gstAmount = (taxableAmount * gst) / 100;
                        const totalAmount = taxableAmount + gstAmount;
                        
                        return (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">
                              <p className="text-sm font-medium">{item.product_name}</p>
                              <p className="text-xs text-gray-500">Batch: {item.batch_no || item.batch_number || 'N/A'}</p>
                              {item.expiry_date && (
                                <p className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</p>
                              )}
                            </td>
                            <td className="text-center py-2 px-3 text-sm font-medium">{item.hsn_code || 'N/A'}</td>
                            <td className="text-center py-2 px-3 text-sm">
                              {item.pack_size || item.pack_type || '1x1'} {item.unit || item.uom || 'TAB'}
                            </td>
                            <td className="text-center py-2 px-3 text-sm font-medium">{quantity}</td>
                            <td className="text-center py-2 px-3 text-sm">{item.free_quantity || 0}</td>
                            <td className="text-right py-2 px-3 text-sm">₹{(item.mrp || item.unit_price || 0).toFixed(2)}</td>
                            <td className="text-right py-2 px-3 text-sm">₹{rate.toFixed(2)}</td>
                            <td className="text-right py-2 px-3 text-sm">{discount}%</td>
                            <td className="text-right py-2 px-3 text-sm">{gst}%</td>
                            <td className="text-right py-2 px-3 text-sm font-medium">₹{totalAmount.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* GST Breakdown and Summary */}
                <div className="mt-4 grid grid-cols-2 gap-4 page-break-avoid">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">GST Breakdown</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">CGST (9%)</span>
                        <span className="font-medium">₹{(order.cgst_amount || order.tax_amount/2 || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">SGST (9%)</span>
                        <span className="font-medium">₹{(order.sgst_amount || order.tax_amount/2 || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="text-gray-700 font-medium">Total GST</span>
                        <span className="font-semibold">₹{(order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Order Summary</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Sub Total</span>
                        <span className="font-medium">₹{(order.subtotal_amount || order.total_amount - order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total GST</span>
                        <span className="font-medium">₹{(order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      {order.round_off && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Round Off</span>
                          <span className="font-medium">₹{order.round_off.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="text-gray-700 font-semibold">Grand Total</span>
                        <span className="font-bold text-lg text-purple-600">₹{order.total_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Total in Words */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm"><span className="font-medium">Amount in Words:</span> {numberToWords(order.total_amount)}</p>
                </div>
                
                {/* Terms & Conditions */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Terms & Conditions</h4>
                  <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                    <li>Goods once sold will not be taken back or exchanged</li>
                    <li>Interest @ 18% p.a. will be charged if payment is not made within the stipulated time</li>
                    <li>Our responsibility ceases after goods leave our premises</li>
                    <li>Subject to local jurisdiction only</li>
                    <li>E. & O.E.</li>
                  </ol>
                </div>
                
                {/* Prepared By / Authorized Signatory */}
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="h-16 border-b border-gray-300"></div>
                    <p className="text-sm text-gray-600 mt-2">Prepared By</p>
                    <p className="text-xs text-gray-500">{order.created_by || localStorage.getItem('userName') || 'Sales Team'}</p>
                  </div>
                  <div className="text-center">
                    <div className="h-16 border-b border-gray-300"></div>
                    <p className="text-sm text-gray-600 mt-2">Authorized Signatory</p>
                    <p className="text-xs text-gray-500">For AASO Pharma</p>
                  </div>
                </div>
              </div>

              {/* Footer Branding */}
              <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-600">Thank you for your business!</p>
                <p className="text-xs text-gray-500 mt-2">
                  AASO Pharma | Your trusted healthcare partner
                </p>
                <p className="text-xs text-purple-600 mt-1">
                  Powered by AASO ERP
                </p>
              </div>

            </div>
            
            {/* Notes Section - Editable on review page */}
            <div className="mt-6">
              <NotesSection
                value={order.notes}
                onChange={(value) => setOrder(prev => ({ ...prev, notes: value }))}
                placeholder="Add any special instructions or notes..."
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4 no-print">
          <div className="flex justify-between items-center">
            <div className="text-lg">
              Total: <span className="font-bold text-gray-900">₹{order.total_amount.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={printOrder}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                onClick={shareOnWhatsApp}
                disabled={!order.customer_details?.phone}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={saveOrder}
                disabled={saving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// Import Modal Component
const ImportFromDocumentModal = ({ isOpen, onClose, onImport }) => {
  const [searchType, setSearchType] = useState('invoice');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load recent documents on mount
  React.useEffect(() => {
    if (isOpen) {
      loadRecentDocuments();
    }
  }, [isOpen, searchType]);

  const loadRecentDocuments = async () => {
    setLoading(true);
    try {
      let results = [];
      if (searchType === 'invoice') {
        const response = await invoicesApiModule.getAll({ 
          limit: 10,
          sort: 'invoice_date',
          order: 'desc'
        });
        results = response.data || [];
      } else {
        const response = await challansApiModule.getAll({ 
          limit: 10,
          sort: 'challan_date',
          order: 'desc'
        });
        results = response.data || [];
      }
      setSearchResults(results);
    } catch (error) {
      console.error('Error loading recent documents:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadRecentDocuments();
      return;
    }

    setLoading(true);
    try {
      let results = [];
      if (searchType === 'invoice') {
        const response = await invoicesApiModule.search(searchQuery);
        results = response.data || [];
      } else {
        const response = await challansApiModule.getAll({ 
          search: searchQuery
        });
        results = response.data || [];
      }
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!selectedDoc) return;

    const importData = {
      customer_id: selectedDoc.customer_id,
      customer_name: selectedDoc.customer_name,
      customer_details: selectedDoc.customer_details || {
        customer_id: selectedDoc.customer_id,
        customer_name: selectedDoc.customer_name,
        address: selectedDoc.billing_address,
        city: selectedDoc.billing_city,
        state: selectedDoc.billing_state,
        pincode: selectedDoc.billing_pincode,
        phone: selectedDoc.customer_phone,
        gstin: selectedDoc.customer_gstin
      },
      billing_address: selectedDoc.billing_address,
      shipping_address: selectedDoc.shipping_address || selectedDoc.billing_address,
      items: (selectedDoc.items || selectedDoc.invoice_items || []).map(item => ({
        id: Date.now() + Math.random(),
        product_id: item.product_id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        quantity: item.quantity,
        unit: item.unit || 'NOS',
        mrp: item.mrp,
        unit_price: item.unit_price || item.selling_price,
        discount_percent: item.discount_percent || 0,
        gst_percent: item.tax_percent || item.gst_percent || 18,
        manufacturer: item.manufacturer,
        category: item.category
      })),
      reference_doc: searchType === 'invoice' ? 
        `Invoice: ${selectedDoc.invoice_number}` : 
        `Challan: ${selectedDoc.challan_number}`
    };

    onImport(importData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Import from Document</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Document Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSearchType('invoice');
                  setSearchQuery('');
                }}
                className={`p-3 rounded-lg border-2 ${
                  searchType === 'invoice' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-300'
                }`}
              >
                <FileText className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm">Sales Invoice</span>
              </button>
              <button
                onClick={() => {
                  setSearchType('challan');
                  setSearchQuery('');
                }}
                className={`p-3 rounded-lg border-2 ${
                  searchType === 'challan' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-300'
                }`}
              >
                <Truck className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm">Delivery Challan</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Document</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={`Enter ${searchType === 'invoice' ? 'invoice' : 'challan'} number or customer name`}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {loading ? '...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">
                {searchQuery ? 'Search Results' : `Recent ${searchType === 'invoice' ? 'Invoices' : 'Challans'}`}
              </h4>
              <div className="max-h-64 overflow-y-auto">
                {searchResults.map((doc) => (
                  <div
                    key={doc.invoice_id || doc.challan_id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-3 border rounded-lg cursor-pointer ${
                      selectedDoc?.invoice_id === doc.invoice_id || selectedDoc?.challan_id === doc.challan_id
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          {searchType === 'invoice' ? doc.invoice_number : doc.challan_number}
                        </div>
                        <div className="text-sm text-gray-600">{doc.customer_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(doc.invoice_date || doc.challan_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ₹{(doc.total_amount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {doc.items?.length || doc.invoice_items?.length || 0} items
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedDoc}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
          >
            Import to Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesOrderFlowV2;