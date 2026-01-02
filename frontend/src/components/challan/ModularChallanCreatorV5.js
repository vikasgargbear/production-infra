import React, { useState, useEffect, useRef } from 'react';
import {
  Truck, Calendar, ArrowRight,
  CheckCircle, MessageCircle, FileInput, Printer, User, MapPin, Package
} from 'lucide-react';
import { ModuleHeader, CustomerSearch, ProductSearchSimple, ItemsTable, DocumentFooter, ProductCreationModal, NotesSection, AddressForm, StandardDatePicker, GenericSuccessModal } from '../global';
import ItemsTableKeyboard from '../global/ui/display/ItemsTableKeyboard';
import CustomerCreationB2B from '../global/ui/forms/CustomerCreationB2B';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
// NotesSection is now imported from global
import ChallanPreview from './components/ChallanPreview';
import ImportFromInvoiceModal from './components/ImportFromInvoiceModal';
import { challansApi } from '../../services/api';
import { apiClient, employeesAPI } from '../../services/api';
import { useEnterAsTab } from '../../hooks/useEnterAsTab';
import useEscapeKey from '../../hooks/useEscapeKey';

const ModularChallanCreatorV5 = ({ open = true, onClose }) => {
  const [challan, setChallan] = useState({
    challan_number: '',
    challan_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
    freight_charges: 0,
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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdChallanData, setCreatedChallanData] = useState(null);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [newProductName, setNewProductName] = useState('');
  const [fetchingAddress, setFetchingAddress] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedMR, setSelectedMR] = useState(null);

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  const itemsTableRef = useRef(null);
  const challanFormRef = useRef(null); // For Enter-as-Tab scoping

  // Enable Enter-as-Tab navigation (Marg ERP style)
  useEnterAsTab({
    containerRef: challanFormRef,
    enabled: true,
    excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
  });

  // ESC key handling - hierarchical modal management
  const shouldHandleMainEsc = !showCreateCustomer && !showCreateProduct && !showImportModal;
  useEscapeKey(
    () => { if (onClose) onClose(); },
    shouldHandleMainEsc,
    'ChallanFlow-Main'
  );

  useEscapeKey(
    () => setShowCreateCustomer(false),
    showCreateCustomer,
    'CustomerModal'
  );

  useEscapeKey(
    () => setShowCreateProduct(false),
    showCreateProduct,
    'ProductModal'
  );

  useEscapeKey(
    () => setShowImportModal(false),
    showImportModal,
    'ImportModal'
  );

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
            } else if (challan.customer_id && challan.items.length > 0) {
              setCurrentStep(2);
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
            if (productSearchRef.current) {
              productSearchRef.current.focus();
            } else {
              const productSearchInput = document.querySelector('input[placeholder*="Search product"]');
              if (productSearchInput) productSearchInput.focus();
            }
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

  // Load employees for M.R. dropdown
  const loadEmployees = async () => {
    try {
      const response = await employeesAPI.getAll({ is_active: true, limit: 100 });
      if (response.success) {
        setEmployees(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load employees:', error);
    }
  };

  // Load employees on mount (don't generate number until save)
  useEffect(() => {
    loadEmployees();
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

        return {
          address: preferredAddr.address_line1 || '',
          city: preferredAddr.city || '',
          state: preferredAddr.state_name || '',
          pincode: preferredAddr.pincode || ''
        };
      }

      return null;

    } catch (error) {
      return null;
    }
  };

  const generateChallanNumber = async () => {
    try {
      // Use the document number service for consistent numbering
      const { generateChallanNumber } = await import('../../services/offline/documents/documentNumberGenerator');
      const challanNumber = await generateChallanNumber();

      setChallan(prev => ({
        ...prev,
        challan_number: challanNumber
      }));
    } catch (error) {
      console.error('Failed to generate challan number:', error);
      // Use consistent fallback format: DC-YY########
      const now = new Date();
      const year = now.getFullYear() % 100;
      const yearPrefix = year.toString().padStart(2, '0');
      const timestamp = Date.now();
      const uniqueNum = 10000000 + (timestamp % 90000000);

      setChallan(prev => ({
        ...prev,
        challan_number: `DC-${yearPrefix}${uniqueNum}`
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

    // Set items - ensure they have all required fields
    if (importData.items && importData.items.length > 0) {
      const formattedItems = importData.items.map((item, index) => ({
        ...item,
        id: item.id || `imported-${Date.now()}-${index}`,
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        batch_no: item.batch_no || item.batch_number || '',
        batch_number: item.batch_no || item.batch_number || '',
        hsn_code: item.hsn_code || '',
        expiry_date: item.expiry_date || '',
        quantity: parseFloat(item.quantity || item.dispatched_quantity) || 0,
        unit_price: parseFloat(item.unit_price || item.rate || item.sale_price) || 0,
        rate: parseFloat(item.rate || item.unit_price || item.sale_price) || 0,
        sale_price: parseFloat(item.sale_price || item.rate || item.unit_price) || 0,
        mrp: parseFloat(item.mrp) || 0,
        gst_percent: parseFloat(item.gst_percent || item.tax_rate) || 0,
        line_total: 0 // Will be recalculated
      }));

      setChallan(prev => {
        const updated = {
          ...prev,
          items: formattedItems,
          notes: importData.notes || prev.notes
        };
        return updated;
      });

      // Recalculate totals after a small delay
      setTimeout(() => {
        recalculateTotals(formattedItems);
      }, 100);
    } else {
      setMessage('⚠️ No items found in the selected document');
      setMessageType('warning');
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

    // If no address data, fetch addresses separately
    // This happens when customers only have shipping addresses (not billing)
    if (!address && !city && customer.customer_id) {

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
        gst_percent: product.gst_percent || 0,
        manufacturer: product.manufacturer,
        category: product.category
      };

      setChallan(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));

      recalculateTotals([...challan.items, newItem]);

      // Auto-focus quantity field of newly added item for keyboard data entry
      setTimeout(() => {
        if (itemsTableRef.current) {
          itemsTableRef.current.focusFirstField();
        }
      }, 150);
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
      // Validate required fields
      if (!challan.customer_id) {
        alert('Please select a customer');
        setSaving(false);
        return;
      }

      if (!challan.items || challan.items.length === 0) {
        alert('Please add at least one item');
        setSaving(false);
        return;
      }

      // Transform items for API - matching backend's ChallanItemRequest model
      const apiItems = challan.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        ordered_quantity: null, // For direct challan
        dispatched_quantity: item.quantity,
        unit_price: item.unit_price || item.rate || item.sale_price || 0,
        gst_percent: item.gst_percent || 0,
        cgst_percent: (item.gst_percent || 0) / 2,
        sgst_percent: (item.gst_percent || 0) / 2,
        igst_percent: 0, // Intra-state
        uom: item.unit || item.base_uom || 'NOS',
        package_type: 'UNIT'
      }));

      // Calculate total amount
      const totalAmount = apiItems.reduce((sum, item) =>
        sum + (item.dispatched_quantity * item.unit_price), 0
      ) + (parseFloat(challan.freight_charges) || 0);

      // Debug freight amount

      // Prepare challan data with complete delivery address
      // Generate challan number only when saving
      let finalChallanNumber = challan.challan_number;
      if (!challan.challan_number) {
        await generateChallanNumber();
        finalChallanNumber = challan.challan_number;
      }

      const challanData = {
        challan_number: finalChallanNumber,
        challan_date: challan.challan_date,
        expected_delivery_date: challan.expected_delivery_date || challan.challan_date,
        customer_id: challan.customer_id,
        customer_name: challan.customer_name,
        // Complete delivery address data - with defaults
        delivery_address: challan.delivery_address || selectedCustomer?.address || 'N/A',
        delivery_city: challan.delivery_city || selectedCustomer?.city || 'Mumbai',
        delivery_state: challan.delivery_state || selectedCustomer?.state || 'Maharashtra',
        delivery_pincode: challan.delivery_pincode || selectedCustomer?.pincode || '400001',
        items: apiItems,
        transport_company: challan.transport_company || '',
        vehicle_number: challan.vehicle_number || '',
        driver_phone: challan.driver_phone || '',
        freight_charges: parseFloat(challan.freight_charges) || 0,
        lr_number: challan.lr_number || '',
        notes: challan.notes || '',
        total_amount: totalAmount
      };

      const response = await challansApi.create(challanData);

      if (response.data) {
        const challanNumber = response.data.challan_number || challan.challan_number || `DC-${response.data.challan_id}`;
        const createdData = {
          ...response.data,
          challan_number: challanNumber,
          customer_name: challan.customer_name,
          customer_details: challan.customer_details,
          items: challan.items,
          total_amount: challan.total_amount
        };
        setCreatedChallanData(createdData);
        setShowSuccessModal(true);
      }
    } catch (error) {
      let errorMsg = 'Failed to save challan';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(err =>
            typeof err === 'object' ? `${err.loc?.join('.') || 'Field'}: ${err.msg}` : err
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

  // Thermal print challan
  const thermalPrintChallan = (width = '80mm') => {
    const printWindow = window.open('', '', 'width=400,height=600');
    const challanDate = new Date(challan.challan_date).toLocaleDateString('en-IN');
    const expectedDeliveryDate = new Date(challan.expected_delivery_date).toLocaleDateString('en-IN');

    // Format address helper
    const formatAddress = (addr) => {
      if (!addr) return '';
      if (typeof addr === 'string') return addr;
      const parts = [];
      if (addr.address_line_1) parts.push(addr.address_line_1);
      if (addr.address_line_2) parts.push(addr.address_line_2);
      if (addr.city) parts.push(addr.city);
      if (addr.state) parts.push(addr.state);
      if (addr.pincode) parts.push(addr.pincode);
      return parts.join(', ');
    };

    const thermalHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Challan - ${challan.challan_number}</title>
        <style>
          @page {
            size: ${width} auto;
            margin: 0;
          }
          body {
            font-family: monospace;
            font-size: ${width === '58mm' ? '10px' : '12px'};
            line-height: 1.3;
            margin: 0;
            padding: 5px;
            width: ${width};
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { 
            border-top: 1px dashed #000; 
            margin: 3px 0;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          .total-section {
            margin-top: 5px;
            padding-top: 5px;
            border-top: 1px dashed #000;
          }
          @media print {
            body { margin: 0; padding: 2px; }
          }
        </style>
      </head>
      <body>
        <div class="center bold">DELIVERY CHALLAN</div>
        <div class="center">${challan.challan_number}</div>
        <div class="divider"></div>
        
        <div>Date: ${challanDate}</div>
        <div>Expected: ${expectedDeliveryDate}</div>
        <div class="divider"></div>
        
        <div class="bold">Customer:</div>
        <div>${challan.customer_name || 'N/A'}</div>
        ${selectedCustomer?.gstin ? `<div>GSTIN: ${selectedCustomer.gstin}</div>` : ''}
        
        <div class="divider"></div>
        <div class="bold">Delivery To:</div>
        <div>${formatAddress(challan.delivery_address) || 'N/A'}</div>
        ${challan.delivery_contact_person ? `<div>Contact: ${challan.delivery_contact_person}</div>` : ''}
        ${challan.delivery_contact_phone ? `<div>Phone: ${challan.delivery_contact_phone}</div>` : ''}
        
        <div class="divider"></div>
        <div class="bold">Items:</div>
        ${challan.items.map((item, idx) => `
          <div class="item-row">
            <span>${idx + 1}. ${item.product_name || item.name || 'N/A'}</span>
          </div>
          <div class="item-row">
            <span>  Qty: ${item.quantity} ${item.unit || ''}</span>
            <span>₹${(item.rate || item.unit_price || 0).toFixed(2)}</span>
          </div>
        `).join('')}
        
        <div class="total-section">
          <div class="item-row">
            <span class="bold">Total Items:</span>
            <span>${challan.items.length}</span>
          </div>
          <div class="item-row">
            <span class="bold">Total Qty:</span>
            <span>${challan.total_quantity || challan.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}</span>
          </div>
          ${challan.total_packages ? `
          <div class="item-row">
            <span class="bold">Packages:</span>
            <span>${challan.total_packages}</span>
          </div>
          ` : ''}
        </div>
        
        ${challan.transport_company || challan.vehicle_number ? `
        <div class="divider"></div>
        <div class="bold">Transport:</div>
        ${challan.transport_company ? `<div>${challan.transport_company}</div>` : ''}
        ${challan.vehicle_number ? `<div>Vehicle: ${challan.vehicle_number}</div>` : ''}
        ${challan.lr_number ? `<div>LR: ${challan.lr_number}</div>` : ''}
        ` : ''}
        
        ${challan.notes ? `
        <div class="divider"></div>
        <div class="bold">Notes:</div>
        <div>${challan.notes}</div>
        ` : ''}
        
        <div class="divider"></div>
        <div class="center" style="margin-top: 10px;">Thank You!</div>
      </body>
      </html>
    `;

    printWindow.document.write(thermalHTML);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
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
            }}
          />

          {/* Keyboard Shortcuts Help */}
          <KeyboardShortcuts shortcuts={[
            { key: 'Ctrl+N', action: 'Add Customer' },
            { key: 'Ctrl+F', action: 'Search Products' },
            { key: 'Ctrl+I', action: 'Import from Invoice' },
            { key: 'Ctrl+S', action: 'Proceed' },
            { key: 'Esc', action: 'Close' }
          ]} />

          {/* Content - Single Page */}
          <div className="flex-1 overflow-y-auto bg-blue-50" ref={challanFormRef}>
            <div className="max-w-6xl mx-auto px-6 py-6">

              {/* Top Section - Dates and Import */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <StandardDatePicker
                    label="Challan Date"
                    value={challan.challan_date}
                    onChange={(value) => setChallan(prev => ({ ...prev, challan_date: value }))}
                    size="sm"
                    required
                  />
                </div>
                <div>
                  <StandardDatePicker
                    label="Expected Delivery"
                    value={challan.expected_delivery_date}
                    onChange={(value) => setChallan(prev => ({ ...prev, expected_delivery_date: value }))}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Import Data</label>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                  >
                    <FileInput className="w-4 h-4 text-gray-400" />
                    <span>Import from Invoice</span>
                  </button>
                </div>
              </div>

              {/* M.R. Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  M.R. (Medical Representative)
                </label>
                <select
                  value={selectedMR?.employee_id || ''}
                  onChange={(e) => {
                    const employeeId = parseInt(e.target.value);
                    const employee = employees.find(emp => emp.employee_id === employeeId);
                    setSelectedMR(employee || null);
                    setChallan(prev => ({ ...prev, sales_person_id: employeeId || null }));
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                  <option value="">Select M.R.</option>
                  {employees.map((employee) => (
                    <option key={employee.employee_id} value={employee.employee_id}>
                      {employee.employee_name} {employee.designation ? `(${employee.designation})` : ''}
                    </option>
                  ))}
                </select>
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
                    // Let the component handle the type selection with toggle
                    setShowCreateCustomer(true);
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
                    setNewProductName(productName || '');
                    setShowCreateProduct(true);
                  }}
                />
              </div>

              {/* Items Table - Using Keyboard-Enabled Component */}
              {challan.items.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    CHALLAN ITEMS
                  </h3>
                  <ItemsTableKeyboard
                    ref={itemsTableRef}
                    items={challan.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={(index) => removeItem(challan.items[index]?.id)}
                    productSearchRef={productSearchRef}
                    currencySymbol="₹"
                    showPricing={true}
                    showGST={false} // Simplified for delivery
                    editable={true}
                  />
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <DocumentFooter
            totalItems={challan.total_quantity}
            totalAmount={challan.total_amount}
            additionalInfo={challan.freight_charges > 0 ? `Freight: ₹${challan.freight_charges.toFixed(2)}` : null}
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
                setShowCreateProduct(false);
                setNewProductName('');
              }}
              onProductCreated={(product) => {
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
        <KeyboardShortcuts shortcuts={SHORTCUT_SETS.REVIEW} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-blue-50">
          <div className="max-w-6xl mx-auto px-6 py-6">

            {/* Transport Details Section - Global Tile Style */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-100">
                <h3 className="text-sm font-semibold text-blue-900 uppercase tracking-wider flex items-center">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
                    <Truck className="w-4 h-4 text-white" />
                  </div>
                  Transport Details
                </h3>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Transport Company</label>
                    <input
                      type="text"
                      value={challan.transport_company}
                      onChange={(e) => setChallan(prev => ({ ...prev, transport_company: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Company name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Vehicle Number</label>
                    <input
                      type="text"
                      value={challan.vehicle_number}
                      onChange={(e) => setChallan(prev => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                      placeholder="KA01AB1234"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Driver Phone</label>
                    <input
                      type="tel"
                      value={challan.driver_phone}
                      onChange={(e) => setChallan(prev => ({ ...prev, driver_phone: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Phone number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Freight Charges</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₹</span>
                      <input
                        type="number"
                        value={challan.freight_charges || ''}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setChallan(prev => ({
                            ...prev,
                            freight_charges: value
                          }));
                        }}
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                        step="0.01"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Address Section - Using Global Components */}
            {selectedCustomer && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Billing Address */}
                <AddressForm
                  customer={selectedCustomer}
                  addressType="billing"
                  addressData={{
                    address_line1: selectedCustomer.address || '',
                    city: selectedCustomer.city || '',
                    state: selectedCustomer.state || '',
                    pincode: selectedCustomer.pincode || ''
                  }}
                  onChange={(addressString) => {
                    // Update billing address in challan state
                    setChallan(prev => ({
                      ...prev,
                      billing_address: addressString
                    }));
                  }}
                  className=""
                />

                {/* Delivery Address */}
                <AddressForm
                  customer={selectedCustomer}
                  addressType="shipping"
                  addressData={{
                    address_line1: challan.delivery_address || '',
                    city: challan.delivery_city || '',
                    state: challan.delivery_state || '',
                    pincode: challan.delivery_pincode || ''
                  }}
                  sameAsBilling={sameAsBilling}
                  onSameAsBillingChange={(same) => {
                    setSameAsBilling(same);
                    if (same && selectedCustomer) {
                      setChallan(prev => ({
                        ...prev,
                        delivery_address: selectedCustomer.address || '',
                        delivery_city: selectedCustomer.city || '',
                        delivery_state: selectedCustomer.state || '',
                        delivery_pincode: selectedCustomer.pincode || ''
                      }));
                    }
                  }}
                  onChange={(addressString) => {
                    // For simplicity, store the formatted string
                    // In production, you'd parse this back to individual fields
                    setChallan(prev => ({
                      ...prev,
                      delivery_address: addressString
                    }));
                  }}
                  onSave={(addressData) => {
                    // Update individual fields when saved
                    setChallan(prev => ({
                      ...prev,
                      delivery_address: addressData.address_line1 || '',
                      delivery_city: addressData.city || '',
                      delivery_state: addressData.state || '',
                      delivery_pincode: addressData.pincode || ''
                    }));
                  }}
                  className=""
                />
              </div>
            )}

            {/* Challan Preview */}
            <ChallanPreview
              challan={{
                ...challan,
                // Ensure customer_details is properly structured without circular refs
                customer_details: selectedCustomer ? {
                  address: selectedCustomer.address || '',
                  city: selectedCustomer.city || '',
                  state: selectedCustomer.state || '',
                  pincode: selectedCustomer.pincode || '',
                  phone: selectedCustomer.phone || ''
                } : null,
                // Ensure delivery address fields are clean strings
                delivery_address: challan.delivery_address || '',
                delivery_city: challan.delivery_city || '',
                delivery_state: challan.delivery_state || '',
                delivery_pincode: challan.delivery_pincode || '',
                delivery_contact_person: challan.delivery_contact_person || '',
                delivery_contact_phone: challan.delivery_contact_phone || ''
              }}
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

        {/* Footer with Thermal Print Support */}
        <DocumentFooter
          totalItems={challan.total_quantity || challan.items?.length || 0}
          totalAmount={challan.total_amount}
          subtotalAmount={challan.total_amount || 0}
          taxAmount={0}
          grandTotal={challan.total_amount || 0}
          onPrint={printChallan}
          onThermalPrint={thermalPrintChallan}
          onSave={saveChallan}
          saveLabel="Generate Challan"
          onWhatsApp={shareOnWhatsApp}
          isSaving={saving}
          customerPhone={challan.customer_details?.phone || selectedCustomer?.phone}
          showActionButtons={true}
        />

      </div>

      {/* Success Modal */}
      {showSuccessModal && createdChallanData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          documentType="Delivery Challan"
          documentNumber={createdChallanData.challan_number}
          documentData={createdChallanData}
          onPrint={printChallan}
          onThermalPrint={thermalPrintChallan}
          onWhatsApp={() => shareOnWhatsApp(createdChallanData)}
          phoneNumber={createdChallanData.customer_details?.phone || challan.customer_details?.phone}
        />
      )}
    </div>
  );
};

export default ModularChallanCreatorV5;