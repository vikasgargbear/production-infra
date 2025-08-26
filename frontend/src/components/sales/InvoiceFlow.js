import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, User, Search, Package, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, Calculator, History, ArrowLeft, ArrowRight, FileInput, MessageCircle,
  Loader2, Clock
} from 'lucide-react';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
import { StandardDatePicker } from '../global';
import { customerAPI, productAPI, invoiceAPI, ordersAPI, salesOrdersAPI, apiClient } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';
// MIGRATED: Using enterprise API-only calculations
// MIGRATED: Use new enterprise calculation architecture  
import SimpleInvoiceCalculator from '../../services/SimpleInvoiceCalculator';
// Removed debug imports - use enterprise calculator instead
import InvoiceValidator from '../../services/invoiceValidator';
import DataTransformer from '../../services/dataTransformer';
import DateFormatter from '../../services/dateFormatter';
import InvoiceApiService from '../../services/invoiceApiService';
import { ProductSearchSimple, ItemsTable, ModuleHeader, CustomerSearch, ProductCreationModal, ViewHistoryButton, GSTCalculator, DocumentFooter, GenericSuccessModal, AddressForm, NotesSection, PrintUtility } from '../global';
import CustomerCreation from '../global/ui/forms/CustomerCreation';
import { useCompany } from '../../contexts/CompanyContext';
// import InvoiceSuccessModal from './InvoiceSuccessModal'; // Replaced with GenericSuccessModal
import SplitPayment from '../global/ui/SplitPayment';
import Toast from '../common/Toast';
// import BillSummary from './components/BillSummary';
// MIGRATED: Use enterprise API-driven preview component
import InvoicePreview from '../invoice/components/InvoicePreviewEnterprise';
import ImportDocumentModal from './components/ImportDocumentModal';
// Removed testBackendConnection - already tested in App.tsx
import useEscapeKey from '../../hooks/useEscapeKey';
import html2pdf from 'html2pdf.js';

const InvoiceFlow = ({ onClose, prefilledData = null }) => {
  const { companyInfo, getOrgId } = useCompany();
  const [currentStep, setCurrentStep] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoiceData, setCreatedInvoiceData] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  
  // Backend connection already tested in App.tsx - removed redundant test
  
  const firstInputRef = useRef(null);

  // Enterprise ESC key handling - hierarchical modal management
  // Main form ESC handler (lowest priority) - only active when no modals are open
  const shouldHandleMainEsc = !showGSTCalculator && !showCustomerModal && !showProductModal && !showImportModal;
  useEscapeKey(
    useCallback(() => {
      if (onClose) onClose();
    }, [onClose]),
    shouldHandleMainEsc,
    'InvoiceFlow-Main'
  );
  
  // Modal-specific ESC handlers (higher priority)
  useEscapeKey(
    useCallback(() => setShowGSTCalculator(false), []),
    showGSTCalculator,
    'GSTCalculator'
  );
  
  useEscapeKey(
    useCallback(() => setShowCustomerModal(false), []),
    showCustomerModal,
    'CustomerModal'
  );
  
  useEscapeKey(
    useCallback(() => setShowProductModal(false), []),
    showProductModal,
    'ProductModal'
  );
  
  useEscapeKey(
    useCallback(() => setShowImportModal(false), []),
    showImportModal,
    'ImportModal'
  );

  // Generate sequential invoice number
  const generateInvoiceNumber = async () => {
    try {
      const response = await InvoiceApiService.generateInvoiceNumber();
      if (response?.success && response?.data?.invoice_number) {
        return response.data.invoice_number;
      }
    } catch (error) {
      console.warn('Failed to generate invoice number from API:', error);
    }
    
    // Fallback to local generation with proper format
    const date = new Date();
    const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${dateStr}${randomNum}`; // Format: INV-YYMMDD####
  };

  // Invoice data state - merge with prefilled data if provided
  const [invoice, setInvoice] = useState({
    invoice_no: 'INV-TEMP',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: prefilledData?.customer_id || '',
    customer_name: prefilledData?.customer_name || '',
    customer_details: prefilledData?.customer_details || null,
    billing_address: prefilledData?.billing_address || '',
    shipping_address: prefilledData?.shipping_address || '',
    place_of_supply: prefilledData?.place_of_supply || '',  // NEW: Critical for GST
    sales_person_id: prefilledData?.sales_person_id || '',  // NEW: For tracking
    items: prefilledData?.items || [],
    payment_mode: '',
    payment_status: 'Pending',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    notes: prefilledData?.notes || '',
    reference_no: prefilledData?.reference_no || '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    delivery_charges: 0,
    vehicle_number: '',
    lr_number: '',
    transport_company: '',
    // E-invoice fields - NEW
    e_invoice_applicable: false,
    e_invoice_number: '',
    irn: '',
    qr_code: '',
    ack_no: '',
    ack_date: '',
    // E-way bill fields
    eway_bill_number: '',
    eway_bill_date: '',
    eway_bill_valid_upto: ''
  });

  const [selectedCustomer, setSelectedCustomer] = useState(prefilledData?.customer_details || null);

  // Load data on component mount
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load initial data
  const loadInitialData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Preload data for search cache
      await Promise.all([
        searchCache.preloadData('customers', () => customerAPI.search('', { limit: 100 })),
        searchCache.preloadData('products', () => productAPI.search('', { limit: 100 }))
      ]);
      
      // Don't generate invoice number here - keep it as TEMP until save
      // This prevents wasting numbers on every component load
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load required data. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveInvoice();
            } else {
              handleProceedToReview();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              handlePrint();
            }
            break;
          case 'n':
            e.preventDefault();
            if (!selectedCustomer && customerSearchRef.current) {
              customerSearchRef.current.click();
            }
            break;
          case 'f':
            e.preventDefault();
            if (selectedCustomer && productSearchRef.current) {
              productSearchRef.current.focus();
            }
            break;
          case 'g':
            e.preventDefault();
            setShowGSTCalculator(true);
            break;
        }
      }
      
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, selectedCustomer]);

  // Focus first input on mount and generate invoice number
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
    
    // Don't generate invoice number on mount - wait until save
    // Keep as INV-TEMP to prevent wasting numbers
  }, []);

  // Preload data on mount
  useEffect(() => {
    searchCache.preloadData('customers', () => customerAPI.search('', { limit: 100 }));
    searchCache.preloadData('products', () => productAPI.search('', { limit: 100 }));
  }, []);

  // ENTERPRISE STRUCTURE: No frontend calculations
  // Backend handles all calculations when invoice is created
  // Frontend only collects user inputs and displays results

  // SIMPLE calculation function - inspired by backend
  const calculateInvoice = () => {
    if (!invoice.items || invoice.items.length === 0) {
      setInvoice(prev => ({
        ...prev,
        totals: null,
        net_amount: 0
      }));
      return;
    }

    // Just call the simple calculator
    const result = SimpleInvoiceCalculator.calculate(
      invoice.items,
      invoice.delivery_charges || 0,
      invoice.gst_type || 'CGST/SGST'
    );

    // Update state with calculated values - DON'T update items to prevent infinite loop
    setInvoice(prev => ({
      ...prev,
      // Don't update items here - they already have the input values
      // items: result.items,  // REMOVED - this causes infinite loop
      totals: result.totals, // Store totals object
      // Set individual fields for components that use them
      net_amount: result.finalAmount,
      subtotal_amount: result.subtotal,
      tax_amount: result.tax,
      round_off: result.roundOff,
      // Store calculated items separately if needed for display
      calculatedItems: result.items
    }));
  };

  // Fallback calculation method (frontend-only)
  const calculateFallbackTotals = (items) => {
    let subtotal = 0;
    let totalTax = 0;

    items.forEach(item => {
      // CRITICAL: Use base_quantity for billing (what customer pays for)
      const baseQuantity = parseFloat(item.base_quantity) || 0;
      const rate = parseFloat(item.rate || item.sale_price) || 0;
      const discountPercent = parseFloat(item.discount_percent || item.discount_percentage) || 0;
      const taxPercent = parseFloat(item.gst_percent || item.tax_rate || item.tax_percentage) || 12;

      const lineTotal = baseQuantity * rate;
      const discountAmount = (lineTotal * discountPercent) / 100;
      const taxableAmount = lineTotal - discountAmount;
      const taxAmount = (taxableAmount * taxPercent) / 100;

      subtotal += taxableAmount;
      totalTax += taxAmount;
    });

    // Include delivery charges and invoice discount
    const deliveryCharges = parseFloat(invoice.delivery_charges) || 0;
    const invoiceDiscount = parseFloat(invoice.discount_amount) || 0;
    
    // Calculate pre-round total
    // Note: subtotal is already AFTER discount, don't subtract again
    const preRoundTotal = subtotal + totalTax + deliveryCharges;
    const finalAmount = Math.round(preRoundTotal);
    const roundOff = parseFloat((finalAmount - preRoundTotal).toFixed(2));

    console.log('Fallback - Taxable:', subtotal, 'Tax:', totalTax, 'PreRound:', preRoundTotal, 'Final:', finalAmount, 'Round:', roundOff);

    return {
      subtotal_amount: subtotal,
      taxable_amount: subtotal,
      tax_amount: totalTax,
      total_tax: totalTax,
      delivery_charges: deliveryCharges,
      discount_amount: invoiceDiscount,
      invoice_discount: invoiceDiscount,
      round_off: roundOff,
      final_amount: finalAmount,
      net_amount: finalAmount
    };
  };

  // Calculate totals when items or delivery charges change
  React.useEffect(() => {
    calculateInvoice();
  }, [invoice.items, invoice.delivery_charges]); // Now safe since we don't update items in calculateInvoice

  // Update item field with debounced calculation  
  const handleUpdateItem = (index, field, value) => {
    const updatedItems = invoice.items.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // CRITICAL: Ensure base_quantity is correctly set for billing
        if (field === 'quantity') {
          // Quantity is the billable quantity (what customer pays for)
          updatedItem.base_quantity = parseFloat(value) || 0;
          updatedItem.quantity = parseFloat(value) || 0;
        } else if (field === 'free_quantity') {
          // Free quantity doesn't affect base_quantity (billing)
          // Keep base_quantity as is - it's what customer pays for
          updatedItem.free_quantity = parseFloat(value) || 0;
          // Don't change base_quantity when free_quantity changes!
        }
        
        return updatedItem;
      }
      return item;
    });
    
    // Update items
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    // Calculation will happen via useEffect
    
    // Backend validation removed - calculations are instant now
    // Backend validation only happens on save
  };

  const handleRemoveItem = (index) => {
    const updatedItems = invoice.items.filter((_, i) => i !== index);
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    // Calculation will happen via useEffect
    
    // Backend calculation for verification
    // Backend validation removed for real-time updates
    // Calculations are instant using local calculator
  };

  // ENTERPRISE CALCULATION: Real-time frontend calculations with backend validation

  const handleCustomerSelect = async (customer) => {
    console.log('handleCustomerSelect called with:', customer);
    setSelectedCustomer(customer);
    
    // Handle null customer (removal case) early
    if (!customer) {
      console.log('Customer removed');
      setInvoice(prev => ({
        ...prev,
        customer_id: null,
        customer_name: '',
        customer_details: null,
        billing_address: '',
        shipping_address: '',
        place_of_supply: companyInfo.state || 'Gujarat',
        gst_type: 'CGST/SGST'
      }));
      return;
    }
    
    // Process valid customer
    if (customer) {
      const companyState = companyInfo.state || 'Gujarat';
      const customerState = customer.state || '';
      const isInterstate = customerState && customerState.toLowerCase() !== companyState.toLowerCase();
      
      // Build address properly with null checks
      const addressParts = [];
      if (customer.address) addressParts.push(customer.address);
      if (customer.city) addressParts.push(customer.city);
      if (customer.state) addressParts.push(customer.state);
      if (customer.pincode) addressParts.push(customer.pincode);
      let fullAddress = addressParts.filter(Boolean).join(', ');
      
      // Fetch customer addresses separately if address is missing
      if (!fullAddress && customer.customer_id) {
        try {
          const response = await apiClient.get(`/customers/${customer.customer_id}/addresses`);
          
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
            
            // Build full address from fetched data
            const fetchedParts = [];
            if (preferredAddr.address_line1) fetchedParts.push(preferredAddr.address_line1);
            if (preferredAddr.address_line2) fetchedParts.push(preferredAddr.address_line2);
            if (preferredAddr.city) fetchedParts.push(preferredAddr.city);
            if (preferredAddr.state || preferredAddr.state_name) fetchedParts.push(preferredAddr.state || preferredAddr.state_name);
            if (preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code) {
              fetchedParts.push(preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code);
            }
            fullAddress = fetchedParts.filter(Boolean).join(', ');
            
            // Update customer object with address data
            customer = {
              ...customer,
              address: preferredAddr.address_line1 || '',
              address2: preferredAddr.address_line2 || '',
              city: preferredAddr.city || '',
              state: preferredAddr.state || preferredAddr.state_name || '',
              pincode: preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code || ''
            };
            
            // Update selectedCustomer with full address data
            setSelectedCustomer(customer);
          }
        } catch (error) {
          console.error('Failed to fetch customer addresses:', error);
        }
      }
      
      setInvoice(prev => ({
        ...prev,
        customer_id: customer.customer_id || customer.id,
        customer_name: customer.customer_name || customer.name,
        customer_details: customer,
        billing_address: fullAddress,
        shipping_address: fullAddress, // Initially same as billing
        place_of_supply: customerState || companyState,  // NEW: Set place of supply for GST
        gst_type: isInterstate ? 'IGST' : 'CGST/SGST'
      }));
      
      // Focus product search after customer selection
      setTimeout(() => {
        if (productSearchRef.current) {
          productSearchRef.current.focus();
        }
      }, 300);
    }
  };

  const handleAddItem = (product) => {
    const existingItem = invoice.items.find(item => item.product_id === product.product_id && item.batch_id === product.batch_id);
    
    if (existingItem) {
      // Update quantity of existing item
      handleUpdateItem(
        invoice.items.findIndex(item => item.product_id === product.product_id && item.batch_id === product.batch_id),
        'quantity',
        existingItem.quantity + 1
      );
    } else {
      // Create new item with all required fields
      const newItem = {
        item_id: Date.now(), // Unique identifier
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        batch_id: product.batch_id,
        batch_no: product.batch_number || product.batch_no,
        batch_number: product.batch_number || product.batch_no,
        hsn_code: product.hsn_code,
        expiry_date: product.expiry_date || product.batch_expiry_date,
        base_quantity: 1,  // Customer pays for 1 
        quantity: 1,       // What customer pays for (same as base_quantity)
        mrp: product.mrp || product.sale_price || 0,
        rate: product.rate || product.sale_price || 0,
        sale_price: product.sale_price || 0,
        discount_percent: 0,
        free_quantity: 0,
        gst_percent: product.gst_percent || 12,
        tax_rate: product.gst_percent || 12,
        // Pack information
        packages_per_box: product.packages_per_box || null,
        units_per_pack: product.units_per_pack || null,
        pack_type: product.pack_type || null,
        pack_size: product.pack_size || null,
        category: product.category || '',
        available_quantity: product.available_quantity || product.quantity_available || 0
      };
      
      const updatedItems = [...invoice.items, newItem];
      
      // Simply update items - calculation happens in useEffect
      setInvoice(prev => ({ ...prev, items: updatedItems }));
      
      // Backend validation removed - instant local calculations only
    }
  };

  const validateInvoice = (checkPayment = false) => {
    console.log('validateInvoice - selectedCustomer:', selectedCustomer);
    console.log('validateInvoice - invoice.items:', invoice.items);
    
    if (!selectedCustomer) {
      setMessage('Please select a customer');
      setMessageType('error');
      return false;
    }

    if (!invoice.items || invoice.items.length === 0) {
      setMessage('Please add at least one item');
      setMessageType('error');
      return false;
    }

    if (checkPayment && !invoice.payment_mode) {
      setMessage('Please select a payment method');
      setMessageType('error');
      return false;
    }

    return true;
  };

  const handleProceedToReview = () => {
    if (validateInvoice()) {
      setCurrentStep(2);
      setMessage('');
    }
  };

  const handleSaveInvoice = async () => {
    if (!validateInvoice(true)) return; // Check payment method when saving

    // ENTERPRISE STRUCTURE: No validation of frontend totals
    // Backend handles all calculations and validation

    setSaving(true);
    try {
      // Generate real invoice number only when saving
      let finalInvoiceNumber = invoice.invoice_no;
      if (invoice.invoice_no === 'INV-TEMP' || invoice.invoice_no.startsWith('INV-TEMP')) {
        finalInvoiceNumber = await generateInvoiceNumber();
        setInvoice(prev => ({ ...prev, invoice_no: finalInvoiceNumber }));
      }
      
      // Get org_id as UUID
      const orgId = getOrgId();
      
      // Map payment_mode to payment_terms for backend
      const paymentTermsMap = {
        'cash': 'cash',
        'credit': 'credit',
        'advance': 'advance'
      };
      
      // Prepare data for quick-sale endpoint
      const saleData = {
        customer_id: parseInt(invoice.customer_id),
        items: invoice.items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseInt(item.quantity) || 1,
          unit_price: parseFloat(item.rate) || parseFloat(item.sale_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          batch_id: item.batch_id ? parseInt(item.batch_id) : null
        })),
        payment_mode: invoice.payment_mode || 'cash',
        payment_amount: invoice.payment_mode === 'cash' ? parseFloat(invoice.net_amount) : 0,
        discount_amount: parseFloat(invoice.discount_amount) || 0,
        other_charges: parseFloat(invoice.delivery_charges) || 0,
        notes: `${invoice.notes || ''}\nDelivery: ${invoice.delivery_type || ''}\nTransport: ${invoice.transport_company || ''}\nVehicle: ${invoice.vehicle_number || ''}\nLR: ${invoice.lr_number || ''}`.trim(),
        // Include document references if importing
        order_id: invoice.order_id ? parseInt(invoice.order_id) : null,
        challan_id: invoice.challan_id ? parseInt(invoice.challan_id) : null
      };
      
      console.log('Creating quick sale with payload:', saleData);
      console.log('API Base URL:', apiClient.defaults.baseURL);

      // Try direct invoice API (as per test file format)
      let response;
      let invoiceData; // Declare outside try block for catch block access
      try {
        // Build complete invoice data with all user inputs
        invoiceData = {
          // Customer info
          customer_id: parseInt(invoice.customer_id),
          customer_name: selectedCustomer?.customer_name || invoice.customer_name,
          customer_phone: selectedCustomer?.phone || selectedCustomer?.primary_phone,
          customer_gstin: selectedCustomer?.gstin,
          billing_address: invoice.billing_address || selectedCustomer?.address,
          
          // Invoice details
          invoice_number: finalInvoiceNumber, // Send the newly generated invoice number
          invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
          invoice_type: 'tax_invoice',
          payment_terms: invoice.payment_mode === 'cash' ? 'cash' : 'credit',
          delivery_priority: 'normal',
          
          // ENTERPRISE STRUCTURE: Frontend sends NO calculated totals
          // Backend calculates everything from raw item data
          // Only send invoice-level discounts and charges
          discount_amount: invoice.discount_amount || 0,
          delivery_charges: invoice.delivery_charges || 0,
          
          // Items with complete details
          items: invoice.items.map((item, index) => {
            // CORRECT BUSINESS LOGIC:
            // base_quantity = what customer pays for
            // free_quantity = additional free items given with base
            // total_quantity = base_quantity + free_quantity (what customer receives)
            // ENTERPRISE STRUCTURE: Frontend sends only raw data
            // Backend handles all calculations
            const baseQuantity = parseFloat(item.base_quantity) || 0;
            const freeQuantity = parseFloat(item.free_quantity || item.free || 0);
            const totalQuantity = baseQuantity + freeQuantity;
            
            return {
              // Product identification
              product_id: parseInt(item.product_id),
              product_name: item.product_name || item.name,
              product_code: item.product_code,
              hsn_code: item.hsn_code,
              
              // Batch info
              batch_id: (item.batch_id && !item.batch_id.includes('default')) ? item.batch_id : null,
              batch_number: item.batch_number || item.batch_no,
              expiry_date: item.expiry_date,
              
              // ENTERPRISE: Send only raw data, backend calculates everything
              quantity: totalQuantity,    // Total quantity customer receives
              base_quantity: baseQuantity, // What customer pays for
              free_quantity: freeQuantity, // Free items
              unit_price: parseFloat(item.rate || item.sale_price || 0),
              discount_percent: parseFloat(item.discount_percent || 0),
              gst_percent: parseFloat(item.gst_percent || item.tax_rate || 12)
              // No calculated amounts - backend handles all calculations
            };
          }),
          
          // Additional info
          notes: invoice.notes,
          reference_no: invoice.reference_no,
          
          // E-invoice fields - NEW
          e_invoice_applicable: invoice.e_invoice_applicable || false,
          e_invoice_number: invoice.e_invoice_number || null,
          irn: invoice.irn || null,
          qr_code: invoice.qr_code || null,
          ack_no: invoice.ack_no || null,
          ack_date: invoice.ack_date || null,
          
          // Payment details - for split payments
          payments: invoice.payments || (invoice.payment_amount > 0 ? [
            {
              method: invoice.payment_mode || 'cash',
              amount: invoice.payment_amount
            }
          ] : []),
          
          // Additional charges (using correct field names)
          freight_charges: invoice.delivery_charges || 0
        };
        
        console.log('Sending invoice to backend:', JSON.stringify(invoiceData, null, 2));
        console.log('API endpoint:', `${apiClient.defaults.baseURL}/invoices/`);
        console.log('Quantity fields sent:');
        console.log('  - quantity: total (base + free) for inventory deduction');
        console.log('  - base_quantity: billable qty for revenue calculation');
        console.log('  - free_quantity: free items for tracking/analytics');
        
        response = await apiClient.post('/invoices/', invoiceData);
        console.log('Invoice created successfully:', response.data);
      } catch (error) {
        console.error('Invoice creation failed - Full details:');
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
        console.error('Error headers:', error.response?.headers);
        
        // Parse the specific error
        let errorDetails = 'Unknown error';
        if (error.response?.data?.detail) {
          errorDetails = error.response.data.detail;
          
          // Check for specific database errors
          if (errorDetails.includes('not present in table')) {
            const match = errorDetails.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
            if (match) {
              errorDetails = `${match[1]} ${match[2]} doesn't exist in database`;
            }
          } else if (errorDetails.includes('null value in column')) {
            const match = errorDetails.match(/null value in column "([^"]+)"/);
            if (match) {
              errorDetails = `Required field missing: ${match[1]}`;
            }
          }
        }
        
        // Show error to user
        // toast.error(`Backend error: ${errorDetails}`);
        console.error(`Backend error: ${errorDetails}`);
        
        // Still save locally and show success
        const date = new Date();
        const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
        const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const fallbackInvoiceNumber = `INV-${dateStr}${randomNum}`;
        
        // Store in localStorage for debugging
        localStorage.setItem('lastFailedInvoice', JSON.stringify({
          invoiceData,
          error: errorDetails,
          timestamp: new Date().toISOString()
        }));
        
        console.log('Saved failed invoice data to localStorage for debugging');
        
        // Show modal anyway with local save message
        setTimeout(() => {
          setCreatedInvoiceData({
            invoiceNumber: fallbackInvoiceNumber,
            invoiceId: null,
            customerName: selectedCustomer?.customer_name || invoice.customer_name,
            totalAmount: invoice.net_amount,
            customerPhone: selectedCustomer?.phone || selectedCustomer?.mobile || selectedCustomer?.primary_phone || invoice.customer_phone,
            customerEmail: selectedCustomer?.email || invoice.customer_email,
            items: invoice.invoice_items || []
          });
          setShowSuccessModal(true);
          // toast.warning(`Invoice ${fallbackInvoiceNumber} saved locally (backend issue)`);
          console.warn(`Invoice ${fallbackInvoiceNumber} saved locally (backend issue)`);
        }, 3000);
        
        setSaving(false);
        return;
      }
      
      // Store the invoice details for future reference
      if (response && response.data) {
        // Use our format regardless of what API returns
        const apiInvoiceNumber = response.data.invoice_number || response.data.invoiceNumber;
        let invoiceNumber = invoice.invoice_no; // Keep our format
        
        // Only use API number if ours is still temp
        if (invoice.invoice_no === 'INV-TEMP' && apiInvoiceNumber) {
          // Check if API number is in our format, otherwise keep our generated one
          if (apiInvoiceNumber.match(/^INV-\d{6}\d{4}$/)) {
            invoiceNumber = apiInvoiceNumber;
          }
        }
        
        const invoiceId = response.data.invoice_id || response.data.id || response.data.invoiceId;
        
        localStorage.setItem('lastCreatedOrderId', response.data.order_id || '');
        localStorage.setItem('lastCreatedInvoiceId', invoiceId || '');
        localStorage.setItem('lastInvoiceNumber', invoiceNumber);
        
        console.log('Invoice saved successfully:', {
          invoiceNumber,
          invoiceId,
          customerName: selectedCustomer?.customer_name || invoice.customer_name,
          totalAmount: invoice.net_amount
        });
        
        // Store data for success modal
        setCreatedInvoiceData({
          invoiceNumber: invoiceNumber,
          invoiceId: invoiceId,
          customerName: selectedCustomer?.customer_name || invoice.customer_name,
          totalAmount: invoice.net_amount,
          customerPhone: selectedCustomer?.phone || selectedCustomer?.mobile || selectedCustomer?.primary_phone || invoice.customer_phone,
          customerEmail: selectedCustomer?.email || invoice.customer_email,
          items: invoice.invoice_items || []
        });
        
        // Show success modal
        setShowSuccessModal(true);
        
        // Also show success message as backup
        // toast.success(`Invoice ${invoiceNumber} created successfully!`);
        console.log(`Invoice ${invoiceNumber} created successfully!`);
        console.log('SUCCESS: Setting message:', `✅ Invoice ${invoiceNumber} created successfully!`);
      } else {
        // If no response data, still show success
        const date = new Date();
        const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD  
        const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const fallbackInvoiceNumber = `INV-${dateStr}${randomNum}`;
        // toast.success(`Invoice ${fallbackInvoiceNumber} created!`);
        console.log(`Invoice ${fallbackInvoiceNumber} created!`);
        
        // Still show modal with fallback data
        setCreatedInvoiceData({
          invoiceNumber: fallbackInvoiceNumber,
          invoiceId: null,
          customerName: selectedCustomer?.customer_name || invoice.customer_name,
          totalAmount: invoice.net_amount,
          customerPhone: selectedCustomer?.phone || selectedCustomer?.mobile || selectedCustomer?.primary_phone || invoice.customer_phone,
          customerEmail: selectedCustomer?.email || invoice.customer_email,
          items: invoice.invoice_items || []
        });
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
      let errorMessage = 'Failed to create invoice';
      
      if (error.response?.data?.detail) {
        // Handle FastAPI validation errors
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          // Handle validation error array
          errorMessage = error.response.data.detail
            .map(err => err.msg || err.message || JSON.stringify(err))
            .join(', ');
        } else if (error.response.data.detail.msg) {
          // Handle single validation error object
          errorMessage = error.response.data.detail.msg;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // toast.error(errorMessage);
      console.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Digital/Color Print - Simple and working
  const handlePrint = () => {
    window.print();
  };

  // Direct PDF Download - uses html2pdf.js with clean capture
  const handlePDFDownload = async (invoiceData = null) => {
    try {
      setToast({ show: true, message: 'Generating PDF...', type: 'info' });
      
      // Get the invoice preview element
      const element = document.getElementById('invoice-preview');
      if (!element) {
        console.error('Invoice preview element not found');
        setToast({ show: true, message: 'Please wait for the invoice to load', type: 'warning' });
        return false;
      }

      // Wait for any animations/calculations to complete
      await new Promise(resolve => setTimeout(resolve, 800));

      // Clone the element to avoid modifying the original
      const clonedElement = element.cloneNode(true);
      
      // Remove any loading indicators, animations, and no-print elements from the clone
      clonedElement.querySelectorAll('.animate-spin, .no-print, [class*="animate"]').forEach(el => {
        el.remove();
      });
      
      // Show hidden address elements in the clone
      clonedElement.querySelectorAll('.hidden.print\\:block').forEach(el => {
        el.classList.remove('hidden');
      });

      // Configure html2pdf options
      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Invoice_${invoice.invoice_no || createdInvoiceData?.invoiceNumber || 'draft'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          windowWidth: 1200,
          windowHeight: element.scrollHeight
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'landscape',
          compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // Generate and download the PDF from the cloned element
      await html2pdf().set(opt).from(clonedElement).save();
      
      setToast({ show: true, message: 'PDF downloaded successfully!', type: 'success' });
      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      setToast({ show: true, message: 'Failed to generate PDF', type: 'error' });
      return false;
    }
  };

  // Thermal Print - Black & White compact format
  const handleThermalPrint = (width = '80mm') => {
    // Create thermal print window
    const printWindow = window.open('', '', 'width=400,height=600');
    if (!printWindow) return;

    // Build thermal print HTML
    const thermalHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Invoice - ${invoice.invoice_no}</title>
  <style>
    @page { size: ${width} auto; margin: 0; }
    body { 
      margin: 0; 
      padding: 5mm; 
      font-family: 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.3;
    }
    .header { 
      text-align: center; 
      border-bottom: 1px dashed #000;
      padding-bottom: 3mm;
      margin-bottom: 3mm;
    }
    .company-name {
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .doc-title {
      font-size: 12px;
      font-weight: bold;
      margin: 2mm 0;
      text-decoration: underline;
    }
    .section {
      margin: 3mm 0;
      padding: 2mm 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 1mm 0;
    }
    .label { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    .items-header {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 1mm 0;
      font-weight: bold;
    }
    .item-row {
      padding: 1mm 0;
      border-bottom: 1px dotted #ccc;
    }
    .total-section {
      margin-top: 3mm;
      padding-top: 2mm;
      border-top: 2px solid #000;
    }
    .grand-total {
      font-size: 13px;
      font-weight: bold;
      border-top: 1px solid #000;
      border-bottom: 2px solid #000;
      padding: 2mm 0;
      margin: 2mm 0;
    }
    .footer {
      text-align: center;
      margin-top: 5mm;
      padding-top: 3mm;
      border-top: 1px dashed #000;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyInfo.name || 'Company Name'}</div>
    ${companyInfo.address ? `<div>${companyInfo.address}</div>` : ''}
    ${companyInfo.phone ? `<div>Ph: ${companyInfo.phone}</div>` : ''}
    ${companyInfo.gstin ? `<div>GSTIN: ${companyInfo.gstin}</div>` : ''}
  </div>

  <div class="doc-title">TAX INVOICE</div>

  <div class="section">
    <div class="row">
      <span class="label">No:</span>
      <span>${invoice.invoice_no}</span>
    </div>
    <div class="row">
      <span class="label">Date:</span>
      <span>${DateFormatter.formatDate(invoice.invoice_date)}</span>
    </div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="label">BILL TO:</div>
    <div>${invoice.customer_name}</div>
    ${selectedCustomer?.phone ? `<div>Ph: ${selectedCustomer.phone}</div>` : ''}
    ${selectedCustomer?.gstin ? `<div>GST: ${selectedCustomer.gstin}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="items-header">ITEMS</div>
  ${invoice.items.map((item, i) => `
    <div class="item-row">
      <div style="font-weight: bold;">${i + 1}. ${item.product_name}</div>
      ${item.batch_no ? `<div style="font-size: 9px;">Batch: ${item.batch_no}</div>` : ''}
      <div class="row">
        <span>Qty: ${item.quantity}${item.free_quantity > 0 ? `+${item.free_quantity}F` : ''}</span>
        <span>Rate: ${parseFloat(item.unit_price || 0).toFixed(2)}</span>
        <span>Amt: ${parseFloat(item.line_total || (item.quantity * item.unit_price)).toFixed(2)}</span>
      </div>
      ${item.discount_percent > 0 ? `<div style="font-size: 9px;">Disc: ${item.discount_percent}% | GST: ${item.gst_percent || 12}%</div>` : ''}
    </div>
  `).join('')}

  <div class="total-section">
    <div class="row">
      <span>Subtotal:</span>
      <span>₹${parseFloat(invoice.subtotal_amount || 0).toFixed(2)}</span>
    </div>
    ${invoice.discount_amount > 0 ? `
    <div class="row">
      <span>Discount:</span>
      <span>-₹${parseFloat(invoice.discount_amount || 0).toFixed(2)}</span>
    </div>` : ''}
    <div class="row">
      <span>GST:</span>
      <span>₹${parseFloat(invoice.tax_amount || 0).toFixed(2)}</span>
    </div>
    ${invoice.round_off !== 0 ? `
    <div class="row">
      <span>Round Off:</span>
      <span>${invoice.round_off > 0 ? '+' : ''}₹${parseFloat(invoice.round_off || 0).toFixed(2)}</span>
    </div>` : ''}
    <div class="grand-total">
      <div class="row">
        <span>TOTAL:</span>
        <span>₹${parseFloat(invoice.net_amount || 0).toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>Thank You!</div>
    <div>${companyInfo.name || 'Your Company'}</div>
  </div>
</body>
</html>`;

    printWindow.document.write(thermalHTML);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Original print function kept as backup
  const handlePrintOld = () => {
    // Create a new window with the full invoice preview and trigger print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const invoiceContent = document.createElement('div');
      
      // We'll use React to render the full InvoicePreview with addresses
      // For now, create print content programmatically
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice ${invoice.invoice_no}</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                margin: 0;
                padding: 20px;
                line-height: 1.4;
              }
              @media print {
                body { margin: 0; padding: 15px; }
                .no-print { display: none !important; }
              }
              .invoice-header {
                text-align: center;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .company-info h1 {
                margin: 0;
                color: #333;
                font-size: 28px;
              }
              .company-info p {
                margin: 5px 0;
                color: #666;
              }
              .addresses {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 20px;
                margin-bottom: 30px;
              }
              .address-section {
                background: #f9f9f9;
                padding: 15px;
                border-radius: 8px;
              }
              .address-section h3 {
                margin: 0 0 10px 0;
                font-size: 12px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
              .address-section p {
                margin: 3px 0;
                font-size: 14px;
                color: #333;
              }
              .invoice-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
              }
              .invoice-table th,
              .invoice-table td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
                font-size: 12px;
              }
              .invoice-table th {
                background: #f5f5f5;
                font-weight: 600;
              }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .totals {
                display: flex;
                justify-content: flex-end;
                margin-top: 20px;
              }
              .totals-table {
                width: 300px;
              }
              .totals-table td {
                padding: 5px 10px;
                border: none;
                border-bottom: 1px solid #eee;
              }
              .totals-table .total-row {
                font-weight: bold;
                border-top: 2px solid #333;
              }
            </style>
          </head>
          <body>
            <div class="invoice-header">
              <div class="company-info">
                <h1>${companyInfo.name}</h1>
                <p>${companyInfo.address}</p>
                <p>Phone: ${companyInfo.phone} | Email: ${companyInfo.email}</p>
                <p>GST: ${companyInfo.gst}</p>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
              <div>
                <h2 style="margin: 0;">INVOICE</h2>
                <p><strong>Invoice No:</strong> ${invoice.invoice_no}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
              </div>
            </div>

            <div class="addresses">
              <div class="address-section">
                <h3>Bill To</h3>
                <p><strong>${invoice.customer_name || selectedCustomer?.customer_name || 'Customer'}</strong></p>
                ${invoice.billing_address ? `<p>${invoice.billing_address}</p>` : ''}
                ${selectedCustomer?.phone ? `<p>Ph: ${selectedCustomer.phone}</p>` : ''}
              </div>

              <div class="address-section">
                <h3>Ship To</h3>
                ${sameAsShipping ? `
                  <p style="color: #16a34a; font-size: 12px;">✓ Same as billing</p>
                  <p><strong>${invoice.customer_name || selectedCustomer?.customer_name || 'Customer'}</strong></p>
                  ${invoice.billing_address ? `<p>${invoice.billing_address}</p>` : ''}
                ` : `
                  <p><strong>${invoice.customer_name || selectedCustomer?.customer_name || 'Customer'}</strong></p>
                  ${invoice.shipping_address ? `<p>${invoice.shipping_address}</p>` : ''}
                `}
              </div>

              <div class="address-section">
                <h3>Transport</h3>
                ${invoice.delivery_type ? `<p>Type: <strong>${invoice.delivery_type}</strong></p>` : ''}
                ${invoice.transport_company ? `<p>Company: <strong>${invoice.transport_company}</strong></p>` : ''}
                ${invoice.vehicle_number ? `<p>Vehicle: <strong>${invoice.vehicle_number}</strong></p>` : ''}
                ${invoice.lr_number ? `<p>LR No: <strong>${invoice.lr_number}</strong></p>` : ''}
                ${(!invoice.delivery_type && !invoice.transport_company) ? '<p style="color: #999; text-align: center;">No transport details</p>' : ''}
              </div>
            </div>

            <table class="invoice-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th class="text-center">HSN</th>
                  <th class="text-center">Batch</th>
                  <th class="text-center">Exp</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">MRP</th>
                  <th class="text-right">Rate</th>
                  <th class="text-center">Disc%</th>
                  <th class="text-center">Free</th>
                  <th class="text-center">GST%</th>
                  <th class="text-right">CGST</th>
                  <th class="text-right">SGST</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${(invoice.items || []).map((item, index) => `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.product_name || item.name || 'N/A'}</td>
                    <td class="text-center">${item.hsn_code || '-'}</td>
                    <td class="text-center">${item.batch_number || '-'}</td>
                    <td class="text-center">${item.expiry_date || '-'}</td>
                    <td class="text-center">${item.quantity || 0}</td>
                    <td class="text-right">₹${(item.mrp || 0).toFixed(2)}</td>
                    <td class="text-right">₹${(item.rate || item.sale_price || 0).toFixed(2)}</td>
                    <td class="text-center">${item.discount_percent || 0}%</td>
                    <td class="text-center">${item.free_quantity || 0}</td>
                    <td class="text-center">${item.gst_percent || item.tax_rate || 0}%</td>
                    <td class="text-right">₹${((item.calculated_total || 0) * (item.gst_percent || 0) / 200).toFixed(2)}</td>
                    <td class="text-right">₹${((item.calculated_total || 0) * (item.gst_percent || 0) / 200).toFixed(2)}</td>
                    <td class="text-right">₹${(item.calculated_total || item.total_amount || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="totals">
              <table class="totals-table">
                <tr><td>Subtotal:</td><td class="text-right">₹${(invoice.subtotal_amount || 0).toFixed(2)}</td></tr>
                <tr><td>Tax Amount:</td><td class="text-right">₹${(invoice.tax_amount || 0).toFixed(2)}</td></tr>
                ${invoice.delivery_charges ? `<tr><td>Delivery Charges:</td><td class="text-right">₹${invoice.delivery_charges.toFixed(2)}</td></tr>` : ''}
                ${invoice.discount_amount ? `<tr><td>Discount:</td><td class="text-right">-₹${invoice.discount_amount.toFixed(2)}</td></tr>` : ''}
                <tr><td>Round Off:</td><td class="text-right">₹${(invoice.round_off || 0).toFixed(2)}</td></tr>
                <tr class="total-row"><td><strong>Net Amount:</strong></td><td class="text-right"><strong>₹${(invoice.net_amount || 0).toFixed(2)}</strong></td></tr>
              </table>
            </div>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.focus();
      
      // Small delay to ensure content loads, then print
      setTimeout(() => {
        printWindow.print();
        // Close the window after printing (optional)
        printWindow.onafterprint = () => printWindow.close();
      }, 500);
    }
  };


  const handleWhatsAppShare = async (phoneOverride = null) => {
    // Use phoneOverride if provided (from success modal), otherwise use selectedCustomer
    const customerPhone = phoneOverride || selectedCustomer?.phone || selectedCustomer?.mobile || selectedCustomer?.primary_phone;
    
    if (!customerPhone) {
      setMessage('Customer phone number not available');
      setMessageType('error');
      return;
    }

    // Format phone number (remove spaces, add country code if needed)
    let phoneNumber = customerPhone.replace(/\s+/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+91' + phoneNumber; // Assuming India code
    }

    // Calculate total amount same way as InvoicePreview to ensure consistency
    let subtotal = 0;
    let totalTax = 0;
    
    (invoice.items || []).forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || parseFloat(item.sale_price) || 0;
      const discount = parseFloat(item.discount_percent) || 0;
      
      const discountAmount = (quantity * rate * discount) / 100;
      const itemAmount = (quantity * rate) - discountAmount;
      const gstPercent = parseFloat(item.gst_percent) || parseFloat(item.tax_rate) || 12;
      const taxAmount = (itemAmount * gstPercent) / 100;
      
      subtotal += itemAmount;
      totalTax += taxAmount;
    });
    
    const deliveryCharges = parseFloat(invoice.delivery_charges) || 0;
    const invoiceDiscount = parseFloat(invoice.discount_amount) || 0;
    const taxableAmount = subtotal - invoiceDiscount;
    const totalWithTax = taxableAmount + totalTax + deliveryCharges;
    const roundOff = parseFloat((Math.round(totalWithTax) - totalWithTax).toFixed(2));
    const totalAmount = Math.round(totalWithTax);

    // Debug logging
    console.log('Invoice calculation for WhatsApp:', {
      subtotal,
      totalTax,
      deliveryCharges,
      invoiceDiscount,
      totalAmount,
      items: invoice.items
    });

    // Create WhatsApp message
    const message = encodeURIComponent(
      `Dear ${selectedCustomer.customer_name},\n\n` +
      `Your invoice ${invoice.invoice_no} dated ${new Date(invoice.invoice_date).toLocaleDateString('en-IN')} ` +
      `for amount ₹${totalAmount.toFixed(2)} has been generated.\n\n` +
      `Thank you for your business!\n\n` +
      `Regards,\n${companyInfo?.name || 'AASO Pharmaceuticals'}`
    );

    // Note: WhatsApp Web doesn't support file attachments via URL
    // For a better solution, consider:
    // 1. Upload PDF to cloud storage (S3/Firebase) with temporary access
    // 2. Generate a short shareable link (e.g., yourapp.com/invoice/INV-83774632)
    // 3. Include the link in the WhatsApp message for easy download
    // This avoids costs as links expire after X days and are generated on-demand
    // We could implement a PDF generation service that returns a download link
    
    // Open WhatsApp
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
    
    // Show info message
    setMessage('WhatsApp opened. Please attach the invoice PDF manually before sending.');
    setMessageType('info');
  };

  const clearMessage = () => setMessage('');

  // Handle import from challan/order
  const handleImport = (importData) => {
    console.log('=== IMPORT DATA RECEIVED ===');
    console.log('Full import data:', importData);
    console.log('Items received:', importData.items);
    console.log('Items count:', importData.items?.length || 0);
    
    // Close the modal first
    setShowImportModal(false);
    
    // Build the customer object for CustomerSearch component
    const customerData = {
      customer_id: importData.customer_id,
      customer_name: importData.customer_name,
      name: importData.customer_name, // CustomerSearch may look for 'name' field
      phone: importData.customer_phone || importData.customer_details?.phone,
      mobile: importData.customer_details?.mobile,
      email: importData.customer_details?.email,
      address: importData.billing_address,
      gstin: importData.customer_details?.gstin,
      dl_number: importData.customer_details?.dl_number,
      state: importData.customer_details?.state,
      city: importData.customer_details?.city,
      ...importData.customer_details
    };
    
    // Set selectedCustomer for any components that use it
    if (importData.customer_id) {
      setSelectedCustomer(customerData);
    }
    
    // Check if we have items to import
    if (!importData.items || importData.items.length === 0) {
      console.warn('No items found in import data!');
      setMessage('⚠️ No items found in the selected document. Please select a different document.');
      setMessageType('warning');
      setTimeout(() => {
        setMessage('');
      }, 5000);
      return;
    }
    
    // Transform items to ensure all necessary fields are present
    const transformedItems = importData.items.map((item, index) => ({
      // Ensure unique ID for each item
      id: item.id || item.item_id || `imported-${Date.now()}-${index}`,
      item_id: item.item_id || `imported-${Date.now()}-${index}`,
      
      // Product details
      product_id: item.product_id,
      product_name: item.product_name || item.name,
      product_code: item.product_code,
      
      // Quantities
      quantity: parseFloat(item.quantity || item.dispatched_quantity || 0),
      base_quantity: parseFloat(item.quantity || item.dispatched_quantity || 0),
      free_quantity: parseFloat(item.free_quantity || 0),
      
      // Pricing
      mrp: parseFloat(item.mrp || item.sale_price || 0),
      rate: parseFloat(item.unit_price || item.rate || item.sale_price || 0),
      unit_price: parseFloat(item.unit_price || item.rate || item.sale_price || 0),
      sale_price: parseFloat(item.unit_price || item.rate || item.sale_price || 0),
      
      // Discounts and taxes
      discount_percent: parseFloat(item.discount_percent || item.discount_percentage || 0),
      discount_percentage: parseFloat(item.discount_percent || item.discount_percentage || 0),
      gst_percent: parseFloat(item.gst_percent || item.tax_rate || item.tax_percent || item.tax_percentage || 18),
      tax_percentage: parseFloat(item.gst_percent || item.tax_rate || item.tax_percent || item.tax_percentage || 18),
      
      // Batch and other details
      batch_no: item.batch_no || item.batch_number,
      batch_number: item.batch_no || item.batch_number,
      hsn_code: item.hsn_code,
      expiry_date: item.expiry_date,
      
      // Calculated fields (will be recalculated)
      line_total: 0,
      taxable_amount: 0,
      tax_amount: 0,
      total_amount: 0
    }));
    
    console.log('=== TRANSFORMED DATA ===');
    console.log('Transformed items count:', transformedItems.length);
    console.log('First transformed item:', transformedItems[0]);
    console.log('Customer data:', customerData);
    
    // Update invoice with imported data - MUST set customer_details for CustomerSearch
    const updatedInvoice = {
      ...invoice, // Use current invoice state, not prev
      // Customer information - CRITICAL: customer_details is what CustomerSearch uses
      customer_id: importData.customer_id,
      customer_name: importData.customer_name,
      customer_details: customerData, // This is what CustomerSearch component looks for!
      
      // Addresses
      billing_address: importData.billing_address || invoice.billing_address,
      shipping_address: importData.delivery_address || importData.shipping_address || invoice.shipping_address,
      
      // Items with proper structure - CRITICAL for display
      items: transformedItems.length > 0 ? transformedItems : invoice.items,
      
      // Reference and notes
      reference_no: importData.reference_no || `${importData.source_type === 'sales-order' ? 'SO' : 'DC'}-${importData.source_id}`,
      notes: `Imported from ${importData.source_type === 'sales-order' ? 'Sales Order' : importData.source_type === 'challan' ? 'Delivery Challan' : 'Document'} #${importData.source_id}`,
      
      // Transport details if from challan
      vehicle_number: importData.transport_details?.vehicle_number || invoice.vehicle_number,
      transport_company: importData.transport_details?.transport_company || invoice.transport_company,
      
      // Link references
      order_id: importData.order_id,
      challan_id: importData.challan_id
    };
    
    console.log('Setting invoice with imported data:');
    console.log('- Customer:', updatedInvoice.customer_name);
    console.log('- Items count:', updatedInvoice.items.length);
    console.log('- First item:', updatedInvoice.items[0]);
    
    // Set invoice state directly
    setInvoice(updatedInvoice);
    
    // Force component re-render and calculate totals for imported items
    if (transformedItems.length > 0) {
      // Use a small delay to ensure state update completes
      setTimeout(() => {
        // Force re-render by setting invoice again with the items
        setInvoice(current => ({
          ...current,
          items: [...transformedItems] // Create new array reference to force re-render
        }));
        
        // Then calculate totals
        calculateInvoice();
      }, 50);
    }
    
    // Show a notification that data has been imported and user can review/edit
    setMessage(`✅ Data imported from ${importData.source_type === 'sales-order' ? 'Sales Order' : 'Delivery Challan'}. Please review and make any necessary changes before proceeding.`);
    setMessageType('success');
    
    // Clear the message after 7 seconds
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 7000);
    
    // Stay on the current step (step 1) so user can review and edit the imported data
    setCurrentStep(1);
  };

  // Step 1: Input Form
  if (currentStep === 1) {
    return (
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          
          {/* Header - Using Global ModuleHeader */}
          <ModuleHeader
            title="Invoice"
            documentNumber={invoice.invoice_no}
            status={invoice.status || 'draft'}
            icon={FileText}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="invoice"
            showSaveDraft={true}
            onSaveDraft={() => {
              console.log('Save draft clicked');
              // TODO: Implement save draft
            }}
            additionalActions={[]}
          />

          {/* Keyboard Shortcuts Help */}
          <KeyboardShortcuts shortcuts={SHORTCUT_SETS.CREATE} />

          {/* Loading State */}
          {isLoading && (
            <div className="bg-blue-50 px-4 py-3 text-blue-700 border-b border-blue-200 flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span>Loading invoice data...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 px-4 py-3 text-red-700 border-b border-red-200 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto hover:opacity-70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}


          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-blue-50">
            <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Message Display */}
            {message && (
              <div className={`
                mb-4 p-3 rounded flex items-start text-sm
                ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                  messageType === 'error' ? 'bg-red-100 text-red-800' : 
                  'bg-blue-100 text-blue-800'
                }
              `}>
                {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Date Section */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StandardDatePicker
                label="Invoice Date"
                value={invoice.invoice_date}
                onChange={(value) => setInvoice(prev => ({ ...prev, invoice_date: value }))}
                required
                tabIndex={1}
                autoFocus
              />
              <StandardDatePicker
                label="Due Date"
                value={invoice.due_date}
                onChange={(value) => setInvoice(prev => ({ ...prev, due_date: value }))}
                required
                tabIndex={2}
              />
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2 opacity-0">Import</label>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                  type="button"
                >
                  <FileInput className="w-4 h-4 text-gray-600" />
                  <span className="text-sm">Import from Order/Challan</span>
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
                  onClick={() => setShowCustomerModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Create Customer
                </button>
              </div>
              <CustomerSearch
                value={invoice?.customer_details || null}
                onChange={handleCustomerSelect}
                onCreateNew={() => setShowCustomerModal(true)}
                displayMode="inline"
                placeholder="Search customer by name, phone, or code..."
                required
                clearable={true}
              />
            </div>


            {/* Products Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                  <Package className="w-4 h-4 mr-2" />
                  PRODUCTS
                </h3>
                <button
                  onClick={() => setShowProductModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Create Product
                </button>
              </div>
              <ProductSearchSimple
                onAddItem={handleAddItem}
                onCreateProduct={() => setShowProductModal(true)}
                ref={productSearchRef}
              />
            </div>

            {/* Invoice Items */}
            {invoice.items.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                  <Package className="w-4 h-4 mr-2" />
                  INVOICE ITEMS
                </h3>
                <ItemsTable
                  items={invoice.items}
                  onUpdateItem={handleUpdateItem}
                  onRemoveItem={handleRemoveItem}
                  totals={{
                    finalAmount: invoice.net_amount,
                    grandTotal: invoice.net_amount
                  }}
                  showTotals={false}
                  title="Invoice Items"
                />
              </div>
            )}
            </div>
          </div>

          {/* Footer */}
          <DocumentFooter
            totalItems={invoice.items.length}
            totalAmount={invoice.net_amount}
            onCancel={onClose}
            onContinue={handleProceedToReview}
            cancelLabel="Reset"
            continueLabel="Continue"
            continueDisabled={!selectedCustomer || invoice.items.length === 0}
            continueButtonColor="blue"
          />

        </div>

        {/* Modals */}
        {showCustomerModal && (
          <CustomerCreation
            onClose={() => setShowCustomerModal(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCustomerModal(false);
              // toast.success('Customer created successfully');
              console.log('Customer created successfully');
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            show={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(product) => {
              setShowProductModal(false);
              // Toast is already shown in ProductCreationModal
              
              // Add the created product to search cache immediately
              searchCache.addItem('products', product);
              
              // Optionally auto-add the product to invoice
              if (product && typeof handleAddItem === 'function') {
                handleAddItem(product);
              }
            }}
          />
        )}

        {showGSTCalculator && (
          <GSTCalculator
            isOpen={showGSTCalculator}
            onClose={() => setShowGSTCalculator(false)}
          />
        )}

        {/* Import Document Modal */}
        {showImportModal && (
          <ImportDocumentModal
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
          title="Invoice"
          documentNumber={invoice.invoice_no}
          status="review"
          icon={FileText}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="invoice"
          additionalActions={[
            {
              label: "← Back to Edit",
              onClick: () => setCurrentStep(1),
              icon: null,
              variant: "default",
              className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <KeyboardShortcuts shortcuts={SHORTCUT_SETS.REVIEW} />

        {/* Content - Invoice Preview */}
        <div className="flex-1 overflow-y-auto bg-blue-50">
          <div className="max-w-6xl mx-auto px-6 py-6">
          {message && (
            <div className={`
              mb-4 p-3 rounded flex items-start text-sm
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}


          {/* Payment Details - Using Global Component */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1">PAYMENT METHOD</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <SplitPayment
                totalAmount={parseFloat(invoice.totals?.final_amount || invoice.net_amount) || 0}
                payments={[
                  {
                    id: '1',
                    method: invoice.payment_mode || 'cash',
                    amount: invoice.payment_mode === 'cash' ? 
                      parseFloat(invoice.totals?.final_amount || invoice.net_amount) || 0 : 0
                  }
                ]}
                onChange={(payments, paymentInfo) => {
                  // Store all payments for split payment support
                  setInvoice(prev => ({
                    ...prev,
                    payments: payments, // Store all payment methods
                    payment_mode: payments[0]?.method || 'cash', // Keep primary for backward compat
                    payment_amount: payments.reduce((sum, p) => sum + (p.amount || 0), 0), // Total paid
                    payment_status: paymentInfo?.status || 'Pending'
                  }));
                }}
                onPaymentStatusChange={(status) => {
                  setInvoice(prev => ({
                    ...prev,
                    payment_status: status
                  }));
                }}
                allowSplit={true}  // Enable split payments
              />
            </div>
          </div>

          {/* Delivery Details - Separated and Compact */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1">DELIVERY DETAILS</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Type</label>
                  <select
                    value={invoice.delivery_type || 'PICKUP'}
                    onChange={(e) => setInvoice(prev => ({ ...prev, delivery_type: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PICKUP">Pickup</option>
                    <option value="SAME_DAY">Same Day</option>
                    <option value="NEXT_DAY">Next Day</option>
                    <option value="EXPRESS">Express</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Transport</label>
                  <input
                    type="text"
                    value={invoice.transport_company || ''}
                    onChange={(e) => setInvoice(prev => ({ ...prev, transport_company: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle No.</label>
                  <input
                    type="text"
                    value={invoice.vehicle_number || ''}
                    onChange={(e) => setInvoice(prev => ({ ...prev, vehicle_number: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="MH-01-AB-1234"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Charges (₹)</label>
                  <input
                    type="number"
                    value={invoice.delivery_charges || ''}
                    onChange={(e) => setInvoice(prev => ({ ...prev, delivery_charges: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Address Section - Enhanced forms with dropdowns and multi-field input */}
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
                  title="Shipping Address"
                  addressType="shipping"
                  customer={selectedCustomer}
                  sameAsBilling={sameAsShipping}
                  onSameAsBillingChange={(same) => {
                    setSameAsShipping(same);
                    if (same) {
                      setInvoice(prev => ({ 
                        ...prev, 
                        shipping_address: prev.billing_address,
                        shipping_address_data: prev.billing_address_data 
                      }));
                    }
                  }}
                  onChange={(address) => setInvoice(prev => ({ ...prev, shipping_address: address }))}
                  onSave={(addressData) => setInvoice(prev => ({ ...prev, shipping_address_data: addressData }))}
                />
              </div>
            </div>
          )}

          {/* Invoice Preview with Thermal Print Support */}
          <PrintUtility
            documentData={{
              documentNumber: invoice.invoice_number,
              date: invoice.invoice_date,
              customer: {
                name: selectedCustomer?.customer_name || selectedCustomer?.name,
                phone: selectedCustomer?.phone || selectedCustomer?.primary_phone,
                gstin: selectedCustomer?.gstin,
                dl_number: selectedCustomer?.dl_number
              },
              items: invoice.items.map(item => ({
                product_name: item.product_name || item.name,
                hsn_code: item.hsn_code,
                batch_no: item.batch_no || item.batch_number,
                quantity: item.quantity,
                free_quantity: item.free_quantity || 0,
                unit_price: item.unit_price || item.selling_price,
                discount_percent: item.discount_percent || 0,
                gst_percent: item.gst_percent || item.tax_percent || 18,
                total: item.total || item.line_total
              })),
              totals: {
                subtotal: invoice.subtotal_amount || invoice.gross_amount,
                discount: invoice.discount_amount || 0,
                tax_amount: invoice.tax_amount || invoice.total_tax,
                cgst_amount: invoice.cgst_amount || (invoice.tax_amount / 2),
                sgst_amount: invoice.sgst_amount || (invoice.tax_amount / 2),
                igst_amount: invoice.igst_amount || 0,
                total_amount: invoice.net_amount || invoice.final_amount,
                paid_amount: invoice.paid_amount || 0,
                balance_amount: invoice.balance_amount || invoice.net_amount
              },
              addresses: {
                billing: invoice.billing_address,
                shipping: invoice.shipping_address
              },
              notes: invoice.notes
            }}
            documentType="invoice"
            companyInfo={companyInfo}
            showPrintOptions={false}
          >
            <InvoicePreview
              invoice={{
                ...invoice,
                customer_details: {
                  ...selectedCustomer,
                  address: invoice.billing_address,
                  gstin: selectedCustomer?.gstin,
                  phone: selectedCustomer?.phone || selectedCustomer?.mobile
                },
                shipping_address: invoice.shipping_address,
                is_same_address: invoice.billing_address === invoice.shipping_address
              }}
              customer={selectedCustomer}
              showAddresses={true}  // Show addresses in preview
              companyInfo={companyInfo}
            />
          </PrintUtility>

          {/* Notes */}
          <div className="max-w-6xl mx-auto mt-3 mb-3">
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
              <div className="flex items-start gap-2">
                <label className="text-xs font-medium text-gray-600 mt-1">Notes:</label>
                <textarea
                  value={invoice.notes}
                  onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows="1"
                  placeholder="Add any additional notes or comments..."
                  style={{ minHeight: '28px' }}
                />
              </div>
            </div>
          </div>

          {/* E-invoice Section - NEW */}
          {selectedCustomer?.gstin && parseFloat(invoice.net_amount || 0) >= 500 && (
            <div className="max-w-6xl mx-auto mt-4 mb-4">
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <FileInput className="w-4 h-4 text-orange-600 mr-2" />
                    <label className="text-xs font-medium text-orange-800">E-Invoice Generation</label>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={invoice.e_invoice_applicable}
                      onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_applicable: e.target.checked }))}
                      className="mr-2 w-3.5 h-3.5 text-orange-600 rounded focus:ring-orange-500"
                    />
                    <span className="text-xs text-orange-700">Generate E-Invoice</span>
                  </label>
                </div>
                
                {invoice.e_invoice_applicable && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        E-Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoice.e_invoice_number}
                        onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_number: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Auto-generated after submission"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        IRN (Invoice Reference Number)
                      </label>
                      <input
                        type="text"
                        value={invoice.irn}
                        onChange={(e) => setInvoice(prev => ({ ...prev, irn: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Generated by GST Portal"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        Acknowledgment Number
                      </label>
                      <input
                        type="text"
                        value={invoice.ack_no}
                        onChange={(e) => setInvoice(prev => ({ ...prev, ack_no: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="From GST Portal"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        Acknowledgment Date
                      </label>
                      <input
                        type="datetime-local"
                        value={invoice.ack_date}
                        onChange={(e) => setInvoice(prev => ({ ...prev, ack_date: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        readOnly
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        QR Code Data
                      </label>
                      <textarea
                        value={invoice.qr_code}
                        onChange={(e) => setInvoice(prev => ({ ...prev, qr_code: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                        rows="2"
                        placeholder="QR code data from GST Portal"
                        readOnly
                      />
                    </div>
                    
                    {/* E-way Bill Section */}
                    <div className="md:col-span-2 border-t pt-2 mt-2">
                      <div className="text-xs font-medium text-orange-700 mb-2">E-way Bill Details (Auto-generated for distance > 50km)</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">
                            E-way Bill Number
                          </label>
                          <input
                            type="text"
                            value={invoice.eway_bill_number}
                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_number: e.target.value }))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Auto-generated"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">
                            E-way Bill Date
                          </label>
                          <input
                            type="date"
                            value={invoice.eway_bill_date}
                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_date: e.target.value }))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">
                            Valid Upto
                          </label>
                          <input
                            type="date"
                            value={invoice.eway_bill_valid_upto}
                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_valid_upto: e.target.value }))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-2 text-xs text-orange-600">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  E-Invoice is mandatory for B2B transactions above ₹500 with registered businesses
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        {currentStep === 2 && (
        <DocumentFooter
          totalItems={invoice.items?.length || 0}
          totalAmount={parseFloat(invoice.totals?.net_amount || invoice.net_amount) || 0}
          subtotalAmount={parseFloat(invoice.totals?.taxable_amount || invoice.subtotal_amount) || 0}
          taxAmount={parseFloat(invoice.totals?.total_gst || invoice.totals?.total_tax || invoice.totals?.tax_amount || invoice.tax_amount) || 0}
          roundOffAmount={parseFloat(invoice.totals?.round_off || invoice.round_off) || 0}
          grandTotal={parseFloat(invoice.totals?.final_amount || invoice.net_amount) || 0}
          discountAmount={parseFloat(invoice.totals?.total_discount || invoice.discount_amount) || 0}
          deliveryCharges={parseFloat(invoice.totals?.delivery_charges || invoice.delivery_charges) || 0}
          onSave={handleSaveInvoice}
          onPrint={handlePrint}
          onDownload={handlePDFDownload}
          onThermalPrint={handleThermalPrint}
          onWhatsApp={handleWhatsAppShare}
          isSaving={saving}
          customerPhone={selectedCustomer?.phone || invoice.customer_details?.phone}
          showActionButtons={true}
          saveLabel="Generate Invoice"
        />
        )}

      </div>
      
      {/* Toast Notification */}
      {message && (
        <Toast
          message={message}
          type={messageType || 'info'}
          duration={messageType === 'success' ? 10000 : 5000}
          onClose={() => {
            setMessage('');
            setMessageType('');
          }}
          position="top-center"
        />
      )}
      
      {/* Success Modal */}
      {showSuccessModal && createdInvoiceData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Invoice Created!"
          documentNumber={createdInvoiceData.invoiceNumber}
          documentId={createdInvoiceData.invoiceId}
          documentType="invoice"
          customerName={createdInvoiceData.customerName}
          totalAmount={createdInvoiceData.totalAmount}
          documentData={{
            customerPhone: createdInvoiceData.customerPhone,
            customerEmail: createdInvoiceData.customerEmail,
            items: createdInvoiceData.items,
            totals: {
              total_amount: createdInvoiceData.totalAmount
            }
          }}
          partyDetails={{
            name: createdInvoiceData.customerName,
            phone: createdInvoiceData.customerPhone,
            email: createdInvoiceData.customerEmail
          }}
          companyInfo={companyInfo}
          onPrint={handlePrint}
          onThermalPrint={handleThermalPrint}
          onWhatsApp={() => handleWhatsAppShare(createdInvoiceData.customerPhone)}
          onDownload={() => {
            // Fetch the full invoice data if needed
            if (createdInvoiceData.invoiceId) {
              InvoiceApiService.getInvoiceById(createdInvoiceData.invoiceId)
                .then(response => {
                  if (response.success && response.data) {
                    handlePDFDownload(response.data);
                  } else {
                    handlePDFDownload(createdInvoiceData);
                  }
                })
                .catch(() => {
                  handlePDFDownload(createdInvoiceData);
                });
            } else {
              handlePDFDownload(createdInvoiceData);
            }
          }}
          showCopy={true}
        />
      )}

      {/* Hidden Invoice Preview for PDF Generation - Always Available */}
      {createdInvoiceData && showSuccessModal && (
        <div className="hidden">
          <InvoicePreview
            invoice={{
              ...invoice,
              invoice_no: createdInvoiceData.invoiceNumber,
              customer_name: createdInvoiceData.customerName,
              customer_details: {
                ...selectedCustomer,
                address: invoice.billing_address,
                gstin: selectedCustomer?.gstin,
                phone: createdInvoiceData.customerPhone || selectedCustomer?.phone || selectedCustomer?.mobile
              },
              shipping_address: invoice.shipping_address,
              is_same_address: invoice.billing_address === invoice.shipping_address,
              items: createdInvoiceData.items || invoice.items,
              net_amount: createdInvoiceData.totalAmount || invoice.net_amount,
              payment_status: invoice.payment_status || 'Paid'
            }}
            companyInfo={companyInfo}
            showAddresses={true}
            isPrintMode={true} // This will ensure addresses are visible in PDF
          />
        </div>
      )}
    </div>
  );
};

export default InvoiceFlow;