import React, { useState, useEffect } from 'react';
import { 
  Truck, Calendar, ArrowRight,
  CheckCircle, MessageCircle, FileInput, Printer, User, MapPin, Package
} from 'lucide-react';
import { ModuleHeader, CustomerSearch, ProductSearchSimple, ItemsTable, DocumentFooter, ProductCreationModal, NotesSection, AddressForm } from '../global';
import CustomerCreationB2B from '../global/ui/forms/CustomerCreationB2B';
// NotesSection is now imported from global
import ChallanPreview from './components/ChallanPreview';
import ImportFromInvoiceModal from './components/ImportFromInvoiceModal';
import { challansApi } from '../../services/api/modules/challans.api';
import { apiClient } from '../../services/api';

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
  const [fetchingAddress, setFetchingAddress] = useState(false);

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
            console.log('Keyboard shortcut Ctrl+N pressed - opening customer creation');
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

  // Function to fetch customer addresses separately if not in view
  const fetchCustomerAddress = async (customerId) => {
    try {
      // Use the new customer addresses endpoint
      const response = await apiClient.get(`/customers/${customerId}/addresses`);
      
      if (response.data?.success && response.data.data?.length > 0) {
        const addresses = response.data.data;
        
        // Prioritize billing, then shipping, then any default address
        const billingAddr = addresses.find(addr => addr.address_type === 'billing' && addr.is_default);
        const shippingAddr = addresses.find(addr => addr.address_type === 'shipping' && addr.is_default);
        const anyDefaultAddr = addresses.find(addr => addr.is_default);
        
        const preferredAddr = billingAddr || shippingAddr || anyDefaultAddr || addresses[0];
        
        console.log('Found address data:', {
          total: addresses.length,
          types: addresses.map(a => a.address_type),
          selected: preferredAddr.address_type,
          address: preferredAddr
        });
        
        return {
          address: preferredAddr.address_line1 || '',
          city: preferredAddr.city || '',
          state: preferredAddr.state_name || '',
          pincode: preferredAddr.pincode || ''
        };
      }
      
      console.warn(`Customer ${customerId} has no addresses in database`);
      return null;
      
    } catch (error) {
      console.error('Error fetching customer addresses:', error);
      return null;
    }
  };

  const generateChallanNumber = async () => {
    // Generate a proper document-style number instead of timestamp
    try {
      // Try to get a proper number from backend (if endpoint exists)
      // For now, generate a more professional format
      const today = new Date();
      const year = today.getFullYear().toString().slice(-2);
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const serial = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      
      const challanNumber = `DC${year}${month}${day}${serial}`;
      
      setChallan(prev => ({ 
        ...prev, 
        challan_number: challanNumber
      }));
    } catch (error) {
      // Fallback to simple format
      const serial = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      setChallan(prev => ({ 
        ...prev, 
        challan_number: `DC-${serial}`
      }));
    }
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
  const handleCustomerSelect = async (customer) => {
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
    
    // Enhanced address building with fallbacks based on actual schema
    // The customer view only returns billing addresses, but some customers only have shipping addresses
    let address = customer.address || customer.address_line1 || ''; 
    let city = customer.city || '';
    let state = customer.state || customer.state_name || '';
    let pincode = customer.pincode || customer.pin_code || customer.postal_code || '';
    const phone = customer.phone || customer.primary_phone || customer.mobile || customer.contact_number || '';
    
    // Build clean billing address
    let addressParts = [address, city, state, pincode].filter(part => part && part.trim());
    let billingAddress = addressParts.join(', ');
    
    // Debug log to see what customer data we're getting
    console.log('Customer data received:', {
      customerId: customer.customer_id,
      hasAddress: !!address,
      hasCity: !!city,
      hasState: !!state,
      hasPhone: !!phone,
      fullAddress: billingAddress,
      rawCustomer: customer
    });
    
    // If no address data, fetch addresses separately
    // This happens when customers only have shipping addresses (not billing)
    if (!address && !city && customer.customer_id) {
      console.warn(`Customer ${customer.customer_id} has no address in view - fetching addresses separately`);
      
      setFetchingAddress(true);
      
      // Fetch address data separately
      const addressData = await fetchCustomerAddress(customer.customer_id);
      if (addressData) {
        // Update the parsed values with fetched address data
        address = addressData.address;
        city = addressData.city;
        state = addressData.state;
        pincode = addressData.pincode;
        
        // Rebuild billing address with fetched data
        const newAddressParts = [address, city, state, pincode].filter(part => part && part.trim());
        billingAddress = newAddressParts.join(', ');
        
        // Update the customer object with fetched address data
        customer = {
          ...customer,
          address: address,
          city: city,
          state: state,
          pincode: pincode
        };
        
        console.log('Fetched address data:', addressData);
        
        // Update selectedCustomer state so UI shows the fetched address
        setSelectedCustomer(customer);
      }
      setFetchingAddress(false);
    }
    
    setChallan(prev => ({
      ...prev,
      customer_id: customer.customer_id || customer.id,
      customer_name: customer.customer_name || customer.name,
      customer_details: {
        ...customer,
        address: address,
        city: city,
        state: state,
        pincode: pincode,
        phone: phone
      },
      billing_address: billingAddress,
      // Auto-populate delivery address same as billing if checkbox is checked
      delivery_address: sameAsBilling ? address : prev.delivery_address,
      delivery_city: sameAsBilling ? city : prev.delivery_city,
      delivery_state: sameAsBilling ? state : prev.delivery_state,
      delivery_pincode: sameAsBilling ? pincode : prev.delivery_pincode,
      delivery_contact_person: sameAsBilling ? (customer.contact_person || customer.customer_name || customer.name) : prev.delivery_contact_person,
      delivery_contact_phone: sameAsBilling ? phone : prev.delivery_contact_phone
    }));
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    const existingItem = challan.items.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      // Increase quantity if product already exists
      updateItemQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      // Add new item with proper unit and total calculation
      const quantity = 1;
      const unitPrice = product.sale_price || product.mrp || 0;
      const total = quantity * unitPrice;
      
      const newItem = {
        id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        quantity: quantity,
        unit: product.unit || product.base_uom || product.uom_code || '', // Get from backend
        mrp: product.mrp || 0,
        unit_price: unitPrice,
        rate: unitPrice, // For ItemsTable compatibility
        sale_price: unitPrice, // For ItemsTable compatibility
        total: total, // Pre-calculated total
        line_total: total, // For ItemsTable compatibility
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
        
        // Recalculate total when quantity or price changes
        if (field === 'quantity' || field === 'unit_price' || field === 'rate') {
          const quantity = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
          const unitPrice = parseFloat(field === 'unit_price' || field === 'rate' ? value : (item.unit_price || item.rate)) || 0;
          const total = quantity * unitPrice;
          
          updatedItem.total = total;
          updatedItem.line_total = total;
          updatedItem.unit_price = unitPrice;
          updatedItem.rate = unitPrice;
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
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const totalAmount = items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price || item.rate || item.sale_price) || 0;
      return sum + (quantity * unitPrice);
    }, 0);
    
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

      // Prepare challan data with complete delivery address
      const challanData = {
        challan_number: challan.challan_number,
        challan_date: challan.challan_date,
        expected_delivery_date: challan.expected_delivery_date,
        customer_id: challan.customer_id,
        customer_name: challan.customer_name,
        // Complete delivery address data
        delivery_address: challan.delivery_address || '',
        delivery_city: challan.delivery_city || '',
        delivery_state: challan.delivery_state || '',
        delivery_pincode: challan.delivery_pincode || '',
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
      <div className="h-full bg-blue-50">
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                  >
                    <FileInput className="w-4 h-4 text-gray-400" />
                    <span>Import from Invoice</span>
                  </button>
                </div>
              </div>

              {/* Customer Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    CUSTOMER
                  </h3>
                  <button
                    onClick={() => setShowCreateCustomer(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Customer
                  </button>
                </div>
                <CustomerSearch
                  value={selectedCustomer}
                  onChange={handleCustomerSelect}
                  onCreateNew={() => {
                    console.log('Opening customer creation - user can choose B2B or B2C');
                    // Let the component handle the type selection with toggle
                    setShowCreateCustomer(true);
                    console.log('State updated - showCreateCustomer:', true);
                  }}
                  displayMode="inline"
                  placeholder="Search customer by name, phone, or code..."
                  required
                />
              </div>

              {/* Address will now be shown in review step like invoice flow */}

              {/* Products Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    PRODUCTS
                  </h3>
                  <button
                    onClick={() => setShowCreateProduct(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Product
                  </button>
                </div>
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
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    CHALLAN ITEMS
                  </h3>
                  <ItemsTable
                    items={challan.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={(index) => removeItem(challan.items[index]?.id)}
                    showPricing={true}
                    showGST={false} // Simplified for delivery
                    editable={true}
                    columns={['product', 'quantity', 'unit', 'rate', 'total']}
                  />
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <DocumentFooter
            totalItems={challan.total_quantity}
            totalAmount={challan.total_amount}
            additionalInfo={challan.freight_amount > 0 ? `Freight: ₹${challan.freight_amount.toFixed(2)}` : null}
            onCancel={onClose}
            onContinue={() => setCurrentStep(2)}
            cancelLabel="Cancel"
            continueLabel="Continue"
            continueDisabled={!challan.customer_id || challan.items.length === 0}
            continueButtonColor="blue"
          />

        </div>

        {/* Customer Creation Modal */}
        {showCreateCustomer && (
          <CustomerCreationB2B
            onClose={() => setShowCreateCustomer(false)}
            onCustomerCreated={(customer) => {
              console.log('Customer created:', customer);
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
    <div className="h-full bg-blue-50">
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
          <div className="max-w-6xl mx-auto p-6">
            
            {/* Address Section - Two tiles side by side */}
            {selectedCustomer && (
              <div className="max-w-6xl mx-auto mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <AddressForm
                    title="Billing Address"
                    addressType="billing"
                    customer={selectedCustomer}
                    readonly={true}
                    className=""
                  />
                  <AddressForm
                    title="Delivery Address"
                    addressType="shipping"
                    customer={selectedCustomer}
                    sameAsBilling={sameAsBilling}
                    onSameAsBillingChange={(checked) => {
                      setSameAsBilling(checked);
                      if (checked && selectedCustomer) {
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
                    onSave={(addressData) => {
                      setChallan(prev => ({
                        ...prev,
                        delivery_address: addressData.address_line1,
                        delivery_city: addressData.city,
                        delivery_state: addressData.state,
                        delivery_pincode: addressData.pincode,
                        delivery_contact_person: addressData.contact_person,
                        delivery_contact_phone: addressData.contact_phone
                      }));
                    }}
                  />
                </div>
              </div>
            )}
            
            {/* Transport Details - Horizontal tile below addresses */}
            <div className="max-w-6xl mx-auto mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center">
                  <Truck className="w-4 h-4 mr-2" />
                  Transport Details
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            
            {/* Notes Section - Using compact global component */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
              <NotesSection
                value={challan.notes}
                onChange={(value) => setChallan(prev => ({ ...prev, notes: value }))}
                placeholder="Add delivery instructions or special notes..."
                rows={2}
                title="Notes"
                compact={true}
                className=""
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-blue-200 bg-white px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-lg">
              Total: <span className="font-bold text-gray-900">₹{challan.total_amount.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={printChallan}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-blue-700 rounded-lg transition-colors flex items-center gap-2"
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