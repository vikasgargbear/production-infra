import React, { useState, useEffect } from 'react';
import { 
  Truck, Calendar, ArrowRight,
  CheckCircle, MessageCircle, FileInput, Printer
} from 'lucide-react';
import { 
  CustomerSearch, 
  ProductSearchSimple, 
  ProductCreationModal, 
  CustomerCreationModal,
  ProceedToReviewComponent,
  ItemsTable, // Using global ItemsTable
  NotesSection, // Using global NotesSection
  ModuleHeader // Using global ModuleHeader
} from '../global';
// NotesSection is now imported from global
import ChallanPreview from './components/ChallanPreview';
import ImportFromInvoiceModal from './components/ImportFromInvoiceModal';
import { challansApi } from '../../services/api';

const ModularChallanCreatorV5 = ({ open = true, onClose }) => {
  const [challan, setChallan] = useState({
    challan_number: '',
    challan_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0],
    customer_id: '',
    customer_name: '',
    customer_details: null,
    billing_address: '',
    delivery_address: '',
    delivery_city: '',
    delivery_state: '',
    delivery_pincode: '',
    delivery_contact_person: '',
    delivery_contact_phone: '',
    items: [],
    // Transport details
    transport_company: '',
    eway_bill_number: '',
    lr_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    freight_amount: 0,
    // Status
    status: 'draft',
    // Totals
    total_packages: 0,
    total_weight: 0,
    total_quantity: 0,
    total_amount: 0,
    notes: ''
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [newProductName, setNewProductName] = useState('');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              saveChallan();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              printChallan();
            }
            break;
          case 'n':
            e.preventDefault();
            setShowCreateCustomer(true);
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
        if (showCreateCustomer) setShowCreateCustomer(false);
        else if (showCreateProduct) setShowCreateProduct(false);
        else if (showImportModal) setShowImportModal(false);
        else if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showCreateCustomer, showCreateProduct, showImportModal]);

  // Generate challan number on mount
  useEffect(() => {
    generateChallanNumber();
  }, []);

  const generateChallanNumber = async () => {
    // Frontend generation for now - backend will assign actual number
    setChallan(prev => ({ 
      ...prev, 
      challan_number: `DC-TEMP-${Date.now()}`
    }));
  };

  // Handle import from invoice/order
  const handleImport = (importData) => {
    // Set customer details
    if (importData.customer_id) {
      setSelectedCustomer(importData.customer_details);
      handleCustomerSelect(importData.customer_details);
    }
    
    // Set delivery address
    if (importData.delivery_address) {
      setSameAsBilling(false);
      setChallan(prev => ({
        ...prev,
        delivery_address: importData.delivery_address,
        delivery_city: importData.delivery_city || '',
        delivery_state: importData.delivery_state || '',
        delivery_pincode: importData.delivery_pincode || ''
      }));
    }
    
    // Set items
    if (importData.items && importData.items.length > 0) {
      setChallan(prev => ({
        ...prev,
        items: importData.items,
        notes: importData.notes || prev.notes
      }));
      recalculateTotals(importData.items);
    }
  };

  // Handle customer selection - Auto-populate billing address
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    
    // Handle null customer (when removing selection)
    if (!customer) {
      setChallan(prev => ({
        ...prev,
        customer_id: '',
        customer_name: '',
        customer_details: null,
        billing_address: '',
        delivery_address: '',
        delivery_city: '',
        delivery_state: '',
        delivery_pincode: '',
        delivery_contact_person: '',
        delivery_contact_phone: ''
      }));
      return;
    }
    
    const billingAddress = `${customer.address || ''}, ${customer.city || ''}, ${customer.state || ''} ${customer.pincode || ''}`.trim();
    
    setChallan(prev => ({
      ...prev,
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_details: customer,
      billing_address: billingAddress,
      // Auto-populate delivery address same as billing if checkbox is checked
      delivery_address: sameAsBilling ? (customer.address || customer.address_line1 || '') : prev.delivery_address,
      delivery_city: sameAsBilling ? (customer.city || '') : prev.delivery_city,
      delivery_state: sameAsBilling ? (customer.state || '') : prev.delivery_state,
      delivery_pincode: sameAsBilling ? (customer.pincode || '') : prev.delivery_pincode,
      delivery_contact_person: sameAsBilling ? (customer.contact_person || customer.customer_name) : prev.delivery_contact_person,
      delivery_contact_phone: sameAsBilling ? (customer.phone || '') : prev.delivery_contact_phone
    }));
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    const existingItem = challan.items.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      // Increase quantity if product already exists
      updateItemQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      // Add new item
      const newItem = {
        id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        quantity: 1,
        unit: product.unit || 'NOS',
        mrp: product.mrp || 0,
        unit_price: product.sale_price || product.mrp || 0,
        gst_percent: product.gst_percent || 18,
        manufacturer: product.manufacturer,
        category: product.category
      };

      setChallan(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
      
      recalculateTotals([...challan.items, newItem]);
    }
  };

  // Update item quantity
  const updateItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }

    const updatedItems = challan.items.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    );
    
    setChallan(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Update item field - for ItemsTable compatibility
  const updateItem = (index, field, value) => {
    const updatedItems = challan.items.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate if quantity changes
        if (field === 'quantity') {
          const quantity = parseFloat(value) || 0;
          const unitPrice = parseFloat(item.unit_price) || 0;
          updatedItem.total = quantity * unitPrice;
        }
        
        return updatedItem;
      }
      return item;
    });
    
    setChallan(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Remove item
  const removeItem = (itemId) => {
    const updatedItems = challan.items.filter(item => item.id !== itemId);
    setChallan(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Recalculate totals
  const recalculateTotals = (items) => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    
    setChallan(prev => ({
      ...prev,
      total_quantity: totalQuantity,
      total_amount: totalAmount
    }));
  };

  // Save challan
  const saveChallan = async () => {
    setSaving(true);
    try {
      // Transform items for API
      const apiItems = challan.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        mrp: item.mrp,
        gst_percent: item.gst_percent,
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null
      }));

      // Prepare challan data
      const challanData = {
        challan_number: challan.challan_number,
        challan_date: challan.challan_date,
        expected_delivery_date: challan.expected_delivery_date,
        customer_id: challan.customer_id,
        customer_name: challan.customer_name,
        delivery_address: challan.delivery_address,
        items: apiItems,
        transport_company: challan.transport_company,
        vehicle_number: challan.vehicle_number,
        lr_number: challan.lr_number,
        notes: challan.notes,
        total_amount: challan.total_amount
      };

      const response = await challansApi.create(challanData);
      
      if (response.data) {
        const challanNumber = response.data.challan_number || challan.challan_number || `DC-${response.data.challan_id}`;
        alert(`Challan ${challanNumber} created successfully!`);
        onClose();
      }
    } catch (error) {
      console.error('Error saving challan:', error);
      let errorMsg = 'Failed to save challan';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(err => 
            typeof err === 'object' ? `${err.loc?.join('.')||'Field'}: ${err.msg}` : err
          ).join('\n');
        } else {
          errorMsg = error.response.data.detail;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      alert(`Error: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  // Share on WhatsApp
  const shareOnWhatsApp = () => {
    if (!challan.customer_details?.phone) {
      alert('Customer phone number not available');
      return;
    }

    const message = `
Delivery Challan: ${challan.challan_number}
Date: ${challan.challan_date}
Customer: ${challan.customer_name}
Items: ${challan.total_quantity}
Amount: ₹${challan.total_amount.toFixed(2)}
Expected Delivery: ${challan.expected_delivery_date}
    `.trim();

    const whatsappUrl = `https://wa.me/91${challan.customer_details.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Print challan
  const printChallan = () => {
    window.print();
  };

  if (!open) return null;

  // Step 1: Create Challan (Everything on one page like Invoice)
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          
          {/* Header - Using Global ModuleHeader */}
          <ModuleHeader
            title="Delivery Challan"
            documentNumber={challan.challan_number}
            status={challan.status}
            icon={Truck}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="challan"
            showSaveDraft={true}
            onSaveDraft={() => {
              // TODO: Implement save draft
              console.log('Save draft clicked');
            }}
          />

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+I</strong> - Import | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
          </div>

          {/* Content - Single Page */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6">
              
              {/* Top Section - Dates and Import */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Challan Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={challan.challan_date}
                      onChange={(e) => setChallan(prev => ({ ...prev, challan_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected Delivery</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={challan.expected_delivery_date}
                      onChange={(e) => setChallan(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    <span>Import from Invoice</span>
                  </button>
                </div>
              </div>

              {/* Customer Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">CUSTOMER</h3>
                <CustomerSearch
                  value={selectedCustomer}
                  onChange={handleCustomerSelect}
                  onCreateNew={() => setShowCreateCustomer(true)}
                  displayMode="inline"
                  placeholder="Search customer by name, phone, or code..."
                  required
                />
              </div>

              {/* Compact Address Section - Only show after customer selection */}
              {selectedCustomer && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">DELIVERY ADDRESS</h3>
                    <label className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={sameAsBilling}
                        onChange={(e) => {
                          setSameAsBilling(e.target.checked);
                          if (e.target.checked && selectedCustomer) {
                            // Copy billing address to delivery
                            setChallan(prev => ({
                              ...prev,
                              delivery_address: selectedCustomer.address || '',
                              delivery_city: selectedCustomer.city || '',
                              delivery_state: selectedCustomer.state || '',
                              delivery_pincode: selectedCustomer.pincode || '',
                              delivery_contact_person: selectedCustomer.contact_person || selectedCustomer.customer_name,
                              delivery_contact_phone: selectedCustomer.phone || ''
                            }));
                          }
                        }}
                        className="mr-2 h-3 w-3 text-blue-600"
                      />
                      <span className="text-gray-600">Same as billing address</span>
                    </label>
                  </div>
                  
                  {/* Show full address if same as billing, otherwise show editable fields */}
                  {sameAsBilling && selectedCustomer ? (
                    <div className="text-sm text-gray-600">
                      <p className="truncate">{selectedCustomer.customer_name} - {selectedCustomer.address || ''}, {selectedCustomer.city || ''}, {selectedCustomer.state || ''} {selectedCustomer.pincode || ''}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={challan.delivery_address}
                        onChange={(e) => setChallan(prev => ({ ...prev, delivery_address: e.target.value }))}
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="Street address"
                      />
                      <input
                        type="text"
                        value={challan.delivery_city}
                        onChange={(e) => setChallan(prev => ({ ...prev, delivery_city: e.target.value }))}
                        className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="City"
                      />
                      <input
                        type="text"
                        value={challan.delivery_state}
                        onChange={(e) => setChallan(prev => ({ ...prev, delivery_state: e.target.value }))}
                        className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="State"
                      />
                      <input
                        type="text"
                        value={challan.delivery_pincode}
                        onChange={(e) => setChallan(prev => ({ ...prev, delivery_pincode: e.target.value }))}
                        className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="PIN"
                      />
                      <input
                        type="tel"
                        value={challan.delivery_contact_phone}
                        onChange={(e) => setChallan(prev => ({ ...prev, delivery_contact_phone: e.target.value }))}
                        className="px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="Phone"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Products Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">PRODUCTS</h3>
                <ProductSearchSimple
                  onAddItem={handleProductSelect}
                  onCreateProduct={(productName) => {
                    console.log('onCreateProduct called with:', productName);
                    setNewProductName(productName || '');
                    setShowCreateProduct(true);
                    console.log('showCreateProduct should be true now');
                  }}
                />
              </div>

              {/* Items Table - Using Global Component */}
              {challan.items.length > 0 && (
                <div className="mb-6">
                  <ItemsTable
                    items={challan.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={(index) => removeItem(challan.items[index]?.id)}
                    showPricing={true}
                    showGST={false} // Simplified for delivery
                    editable={true}
                    columns={['product', 'quantity', 'unit', 'price', 'total', 'actions']}
                  />
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 bg-white px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">Items: <strong>{challan.total_quantity}</strong></span>
                <span className="text-gray-600">Amount: <strong>₹{challan.total_amount.toFixed(2)}</strong></span>
                {challan.freight_amount > 0 && (
                  <span className="text-gray-600">Freight: <strong>₹{challan.freight_amount.toFixed(2)}</strong></span>
                )}
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
                  disabled={!challan.customer_id || challan.items.length === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Modals */}
        {showCreateCustomer && (
          <CustomerCreationModal
            show={showCreateCustomer}
            onClose={() => setShowCreateCustomer(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCreateCustomer(false);
            }}
          />
        )}

        {showCreateProduct && (
          <>
            {console.log('Rendering ProductCreationModal, showCreateProduct:', showCreateProduct)}
            <ProductCreationModal
              show={showCreateProduct}
              onClose={() => {
                console.log('Modal onClose called');
                setShowCreateProduct(false);
                setNewProductName('');
              }}
              onProductCreated={(product) => {
                console.log('Product created:', product);
                handleProductSelect(product);
                setShowCreateProduct(false);
                setNewProductName('');
              }}
              initialProductName={newProductName}
            />
          </>
        )}

        {showImportModal && (
          <ImportFromInvoiceModal
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
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Review Challan"
          documentNumber={challan.challan_number}
          status={challan.status}
          icon={Truck}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="challan"
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
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Challan | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Back
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            {/* Transport Details Section - Simplified */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">TRANSPORT DETAILS</h3>
              
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Transport Company</label>
                  <input
                    type="text"
                    value={challan.transport_company}
                    onChange={(e) => setChallan(prev => ({ ...prev, transport_company: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Company name"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    value={challan.vehicle_number}
                    onChange={(e) => setChallan(prev => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                    placeholder="KA01AB1234"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Driver Phone</label>
                  <input
                    type="tel"
                    value={challan.driver_phone}
                    onChange={(e) => setChallan(prev => ({ ...prev, driver_phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Phone number"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Freight Charges</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input
                      type="text"
                      value={challan.freight_amount || ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setChallan(prev => ({ ...prev, freight_amount: value ? parseFloat(value) : 0 }));
                      }}
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <ChallanPreview 
              challan={challan}
              companyInfo={{
                name: localStorage.getItem('companyName') || 'AASO PHARMACEUTICALS',
                address: localStorage.getItem('companyAddress') || 'Gangapur City, Rajasthan',
                phone: localStorage.getItem('companyPhone') || '7738228969',
                email: localStorage.getItem('companyEmail') || 'info@aasopharma.com',
                gstin: localStorage.getItem('companyGSTIN') || '08AAXCA4042N1Z2',
                drugLicense: localStorage.getItem('companyDrugLicense') || 'DL No: MH-MUM-123456',
                logo: localStorage.getItem('companyLogo') || null
              }}
            />
            
            {/* Notes Section - Moved to bottom */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
              <NotesSection
                value={challan.notes}
                onChange={(value) => setChallan(prev => ({ ...prev, notes: value }))}
                placeholder="Add delivery instructions or special notes..."
                rows={2}
                label="Notes"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-lg">
              Total: <span className="font-bold text-gray-900">₹{challan.total_amount.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={printChallan}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                onClick={shareOnWhatsApp}
                disabled={!challan.customer_details?.phone}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={saveChallan}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Challan'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ModularChallanCreatorV5;