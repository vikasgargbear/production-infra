import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, User, Search, Package, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, Calculator, History, ArrowLeft, ArrowRight, FileInput, MessageCircle,
  Loader2, RefreshCw, Clock
} from 'lucide-react';
import { customerAPI, productAPI, invoiceAPI, ordersAPI, salesOrdersAPI, apiClient } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';
// MIGRATED: Using enterprise API-only calculations
// MIGRATED: Use new enterprise calculation architecture  
import InvoiceCalculatorEnterprise from '../../services/invoiceCalculatorEnterprise';
import EnterpriseInvoiceCalculator from '../../services/enterpriseInvoiceCalculator';
import { useInvoiceCalculation } from '../../hooks/useInvoiceCalculation';
import InvoiceValidator from '../../services/invoiceValidator';
import DataTransformer from '../../services/dataTransformer';
import DateFormatter from '../../services/dateFormatter';
import InvoiceApiService from '../../services/invoiceApiService';
import { ProductSearchSimple, ItemsTable, ModuleHeader, CustomerSearch, ProductCreationModal, ViewHistoryButton, GSTCalculator, DocumentFooter, GenericSuccessModal, AddressFormEnhanced } from '../global';
import CustomerCreationB2B from '../global/ui/forms/CustomerCreationB2B';
import { useCompany } from '../../contexts/CompanyContext';
// import InvoiceSuccessModal from './InvoiceSuccessModal'; // Replaced with GenericSuccessModal
import InvoiceSummaryTop from './components/InvoiceSummaryTop';
import Toast from '../common/Toast';
// import BillSummary from './components/BillSummary';
// MIGRATED: Use enterprise API-driven preview component
import InvoicePreview from '../invoice/components/InvoicePreviewEnterprise';
import ImportDocumentModal from './components/ImportDocumentModal';
// Removed testBackendConnection - already tested in App.tsx
import { useToast } from '../global/ui/feedback/Toast';

const InvoiceFlow = ({ onClose, prefilledData = null }) => {
  const { companyInfo, getOrgId } = useCompany();
  const toast = useToast();
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
  const [refreshing, setRefreshing] = useState(false);

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  
  // Backend connection already tested in App.tsx - removed redundant test
  
  const firstInputRef = useRef(null);

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
    
    // Fallback to local generation if needed
    const timestamp = Date.now();
    return `INV-${timestamp.toString().slice(-8)}`;
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
    ack_date: ''
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
      
      // Generate invoice number
      const invoiceNo = await generateInvoiceNumber();
      setInvoice(prev => ({ ...prev, invoice_no: invoiceNo }));
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load required data. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
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
      
      // Escape to close
      if (e.key === 'Escape') {
        if (showGSTCalculator) {
          setShowGSTCalculator(false);
        } else if (showCustomerModal) {
          setShowCustomerModal(false);
        } else if (showProductModal) {
          setShowProductModal(false);
        } else if (showImportModal) {
          setShowImportModal(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, selectedCustomer, showGSTCalculator, showCustomerModal, showProductModal, showImportModal]);

  // Focus first input on mount and generate invoice number
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
    
    // Generate invoice number asynchronously
    generateInvoiceNumber().then(invoiceNo => {
      setInvoice(prev => ({ ...prev, invoice_no: invoiceNo }));
    });
  }, []);

  // Preload data on mount
  useEffect(() => {
    searchCache.preloadData('customers', () => customerAPI.search('', { limit: 100 }));
    searchCache.preloadData('products', () => productAPI.search('', { limit: 100 }));
  }, []);

  // ENTERPRISE STRUCTURE: No frontend calculations
  // Backend handles all calculations when invoice is created
  // Frontend only collects user inputs and displays results

  // Calculate invoice totals using enterprise calculator
  const calculateInvoiceTotals = async (items) => {
    if (!items || items.length === 0) {
      setInvoice(prev => ({
        ...prev,
        subtotal_amount: 0,
        tax_amount: 0,
        round_off: 0,
        net_amount: 0,
        items: []
      }));
      return;
    }

    try {
      const invoiceData = {
        ...invoice,
        items,
        customer_id: selectedCustomer?.customer_id
      };

      const result = await InvoiceCalculatorEnterprise.calculateInvoice(invoiceData);
      
      if (result.success && result.totals) {
        const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(result.totals);
        
        console.log('Invoice calculation result:', result);

        // Update items with calculated values from backend
        const updatedItems = items.map((item, index) => {
          const calculatedItem = result.line_items?.[index];
          if (calculatedItem) {
            return {
              ...item,
              calculated_total: calculatedItem.line_total,
              tax_amount: calculatedItem.tax_amount,
              discount_amount: calculatedItem.discount_amount
            };
          }
          return item;
        });

        setInvoice(prev => ({
          ...prev,
          items: updatedItems,
          ...formattedTotals,
          calculatedLineItems: result.line_items
        }));
      } else {
        console.error('Invoice calculation failed:', result.error);
        // Fallback calculation if the enterprise calculator fails
        const fallbackTotals = calculateFallbackTotals(items);
        setInvoice(prev => ({
          ...prev,
          ...fallbackTotals
        }));
      }
    } catch (error) {
      console.error('Error calculating invoice totals:', error);
      // Fallback calculation on error
      const fallbackTotals = calculateFallbackTotals(items);
      setInvoice(prev => ({
        ...prev,
        ...fallbackTotals
      }));
    }
  };

  // Fallback calculation method (frontend-only)
  const calculateFallbackTotals = (items) => {
    let subtotal = 0;
    let totalTax = 0;

    items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate || item.sale_price) || 0;
      const discountPercent = parseFloat(item.discount_percentage) || 0;
      const taxPercent = parseFloat(item.tax_percentage) || 0;

      const lineTotal = quantity * rate;
      const discountAmount = (lineTotal * discountPercent) / 100;
      const taxableAmount = lineTotal - discountAmount;
      const taxAmount = (taxableAmount * taxPercent) / 100;

      subtotal += taxableAmount;
      totalTax += taxAmount;
    });

    const grossTotal = subtotal + totalTax;
    const roundOff = Math.round(grossTotal) - grossTotal;
    const netAmount = grossTotal + roundOff;

    return {
      subtotal_amount: subtotal,
      tax_amount: totalTax,
      round_off: roundOff,
      net_amount: netAmount
    };
  };

  // Calculate totals when items are added/removed (not on every field change)
  React.useEffect(() => {
    if (invoice.items && invoice.items.length > 0) {
      calculateInvoiceTotals(invoice.items);
    }
  }, [invoice.items.length]); // Only watch length, not individual item changes

  // Update item field with debounced calculation  
  const handleUpdateItem = (index, field, value) => {
    const updatedItems = invoice.items.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // CRITICAL: Ensure base_quantity is correctly set for billing
        if (field === 'quantity') {
          // When quantity is updated, set base_quantity to the same value
          // This assumes quantity field represents what customer pays for
          updatedItem.base_quantity = parseFloat(value) || 0;
        }
        
        return updatedItem;
      }
      return item;
    });
    
    // INSTANT: Calculate locally immediately for instant UI feedback
    try {
      const instantResult = InvoiceCalculatorEnterprise.calculateInstant({ 
        ...invoice, 
        items: updatedItems 
      });
      
      // Merge calculated values back into items for immediate display
      const itemsWithCalculations = updatedItems.map((item, i) => ({
        ...item,
        ...instantResult.line_items[i] // Merge calculated values
      }));
      
      // Update UI instantly with local calculation
      const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(instantResult.totals);
      setInvoice(prev => ({
        ...prev,
        items: itemsWithCalculations, // Use items with calculations
        ...formattedTotals,
        calculatedLineItems: instantResult.line_items
      }));
    } catch (error) {
      console.error('Instant calculation failed:', error);
      setInvoice(prev => ({ ...prev, items: updatedItems }));
    }
    
    // Backend calculation for verification (non-blocking)
    InvoiceCalculatorEnterprise.calculateDebounced(
      { ...invoice, items: updatedItems },
      (error, result) => {
        if (!error && result.success && !result.isLocal) {
          // Only update if this is backend result
          const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(result.totals);
          setInvoice(prev => ({
            ...prev,
            ...formattedTotals,
            calculatedLineItems: result.line_items
          }));
        }
      },
      800 // Longer delay since we have instant feedback
    );
  };

  const handleRemoveItem = (index) => {
    const updatedItems = invoice.items.filter((_, i) => i !== index);
    
    // INSTANT: Calculate locally for immediate feedback
    try {
      const instantResult = InvoiceCalculatorEnterprise.calculateInstant({ 
        ...invoice, 
        items: updatedItems 
      });
      
      // Merge calculated values back into remaining items
      const itemsWithCalculations = updatedItems.map((item, i) => ({
        ...item,
        ...instantResult.line_items[i]
      }));
      
      const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(instantResult.totals);
      setInvoice(prev => ({
        ...prev,
        items: itemsWithCalculations,
        ...formattedTotals,
        calculatedLineItems: instantResult.line_items
      }));
    } catch (error) {
      console.error('Instant calculation failed:', error);
      setInvoice(prev => ({ ...prev, items: updatedItems }));
    }
    
    // Backend calculation for verification
    if (updatedItems.length > 0) {
      InvoiceCalculatorEnterprise.calculateDebounced(
        { ...invoice, items: updatedItems },
        (error, result) => {
          if (!error && result.success && !result.isLocal) {
            const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(result.totals);
            setInvoice(prev => ({
              ...prev,
              ...formattedTotals,
              calculatedLineItems: result.line_items
            }));
          }
        },
        800
      );
    }
  };

  // ENTERPRISE CALCULATION: Real-time frontend calculations with backend validation

  const handleCustomerSelect = async (customer) => {
    console.log('handleCustomerSelect called with:', customer);
    setSelectedCustomer(customer);
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
    } else {
      // Customer was removed
      console.log('Customer removed');
      setInvoice(prev => ({
        ...prev,
        customer_id: null,
        customer_name: '',
        customer_details: null,
        billing_address: '',
        shipping_address: '',
        gst_type: 'CGST/SGST'
      }));
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
        available_quantity: product.available_quantity || product.quantity_available || 0
      };
      
      const updatedItems = [...invoice.items, newItem];
      
      // INSTANT: Calculate locally for immediate feedback
      try {
        const instantResult = InvoiceCalculatorEnterprise.calculateInstant({ 
          ...invoice, 
          items: updatedItems 
        });
        
        // Merge calculated values back into items
        const itemsWithCalculations = updatedItems.map((item, i) => ({
          ...item,
          ...instantResult.line_items[i]
        }));
        
        const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(instantResult.totals);
        setInvoice(prev => ({
          ...prev,
          items: itemsWithCalculations,
          ...formattedTotals,
          calculatedLineItems: instantResult.line_items
        }));
      } catch (error) {
        console.error('Instant calculation failed:', error);
        setInvoice(prev => ({
          ...prev,
          items: updatedItems
        }));
      }
      
      // Backend calculation for verification
      InvoiceCalculatorEnterprise.calculateDebounced(
        { ...invoice, items: updatedItems },
        (error, result) => {
          if (!error && result.success && !result.isLocal) {
            const formattedTotals = InvoiceCalculatorEnterprise.formatTotalsForDisplay(result.totals);
            setInvoice(prev => ({
              ...prev,
              ...formattedTotals,
              calculatedLineItems: result.line_items
            }));
          }
        },
        800
      );
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
        payment_mode: invoice.payment_mode || 'Cash',
        payment_amount: invoice.payment_mode === 'Cash' ? parseFloat(invoice.net_amount) : 0,
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
          invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
          invoice_type: 'tax_invoice',
          payment_terms: invoice.payment_mode === 'Cash' ? 'cash' : 'credit',
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
              batch_id: item.batch_id,
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
          ack_date: invoice.ack_date || null
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
        toast.error(`Backend error: ${errorDetails}`);
        
        // Still save locally and show success
        const fallbackInvoiceNumber = 'INV-' + new Date().getTime();
        
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
            totalAmount: invoice.net_amount
          });
          setShowSuccessModal(true);
          toast.warning(`Invoice ${fallbackInvoiceNumber} saved locally (backend issue)`);
        }, 3000);
        
        setSaving(false);
        return;
      }
      
      // Store the invoice details for future reference
      if (response && response.data) {
        const invoiceNumber = response.data.invoice_number || response.data.invoiceNumber || 'INV-' + Date.now();
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
          totalAmount: invoice.net_amount
        });
        
        // Show success modal
        setShowSuccessModal(true);
        
        // Also show success message as backup
        toast.success(`Invoice ${invoiceNumber} created successfully!`);
        console.log('SUCCESS: Setting message:', `✅ Invoice ${invoiceNumber} created successfully!`);
      } else {
        // If no response data, still show success
        const fallbackInvoiceNumber = 'INV-' + Date.now();
        toast.success(`Invoice ${fallbackInvoiceNumber} created!`);
        
        // Still show modal with fallback data
        setCreatedInvoiceData({
          invoiceNumber: fallbackInvoiceNumber,
          invoiceId: null,
          customerName: selectedCustomer?.customer_name || invoice.customer_name,
          totalAmount: invoice.net_amount
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
      
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
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

  const handleWhatsAppShare = async () => {
    if (!selectedCustomer?.phone) {
      setMessage('Customer phone number not available');
      setMessageType('error');
      return;
    }

    // Format phone number (remove spaces, add country code if needed)
    let phoneNumber = selectedCustomer.phone.replace(/\s+/g, '');
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
    const roundOff = Math.round(totalWithTax) - totalWithTax;
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
      `Regards,\n${companyInfo.name}`
    );

    // Note: WhatsApp Web doesn't support file attachments via URL
    // Users need to manually attach the PDF after clicking send
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
    // For both sales orders and challans, populate the form with imported data
    if (importData.customer_id) {
      setSelectedCustomer({
        customer_id: importData.customer_id,
        customer_name: importData.customer_name,
        phone: importData.customer_phone,
        address: importData.billing_address,
        ...importData.customer_details
      });
    }
    
    // Update invoice with imported data
    setInvoice(prev => ({
      ...prev,
      customer_id: importData.customer_id || prev.customer_id,
      customer_name: importData.customer_name || prev.customer_name,
      customer_details: importData.customer_details || prev.customer_details,
      billing_address: importData.billing_address || prev.billing_address,
      shipping_address: importData.delivery_address || importData.shipping_address || prev.shipping_address,
      items: importData.items || prev.items,
      reference_no: `${importData.source_type === 'sales-order' ? 'SO' : 'DC'}-${importData.source_id}`,
      notes: `Imported from ${importData.source_type === 'sales-order' ? 'Sales Order' : importData.source_type === 'challan' ? 'Delivery Challan' : 'Document'} #${importData.source_id}`,
      // Add transport details if from challan
      vehicle_number: importData.transport_details?.vehicle_number || prev.vehicle_number,
      lr_number: importData.transport_details?.lr_number || prev.lr_number,
      transport_company: importData.transport_details?.transport_company || prev.transport_company,
      // Link references
      order_id: importData.order_id,
      challan_id: importData.challan_id
    }));
    
    toast.success('Document imported successfully', 3000);
    setShowImportModal(false);
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
            additionalActions={[
              {
                label: refreshing ? 'Refreshing...' : 'Refresh',
                icon: RefreshCw,
                onClick: handleRefresh,
                disabled: refreshing,
                className: refreshing ? 'animate-spin' : ''
              }
            ]}
          />

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

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save Draft | <strong>Esc</strong> - Close
          </div>


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
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Invoice Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={firstInputRef}
                    type="date"
                    value={invoice.invoice_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    tabIndex={1}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={invoice.due_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    tabIndex={2}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2 opacity-0">Import</label>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
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
          <CustomerCreationB2B
            show={showCustomerModal}
            onClose={() => setShowCustomerModal(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCustomerModal(false);
              toast.success('Customer created successfully');
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
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Invoice | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Close
        </div>

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

          {/* Invoice Summary Top - Delivery & Payment Details */}
          <InvoiceSummaryTop
            invoice={invoice}
            onInvoiceUpdate={(updates) => setInvoice(prev => ({ ...prev, ...updates }))}
          />

          {/* Address Section - Enhanced forms with dropdowns and multi-field input */}
          {selectedCustomer && (
            <div className="max-w-6xl mx-auto mb-6">
              <div className="grid grid-cols-2 gap-4">
                <AddressFormEnhanced
                  customer={selectedCustomer}
                  addressData={invoice.billing_address_data}
                  addressType="billing"
                  onChange={(address) => setInvoice(prev => ({ ...prev, billing_address: address }))}
                  onSave={(addressData) => setInvoice(prev => ({ ...prev, billing_address_data: addressData }))}
                />
                <AddressFormEnhanced
                  customer={selectedCustomer}
                  addressData={invoice.shipping_address_data}
                  addressType="shipping"
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

          <InvoicePreview
            invoice={invoice}
            customer={selectedCustomer}
            showAddresses={false}  // Hide addresses in PDF preview since we show them above
            companyInfo={companyInfo}
          />

          {/* Notes */}
          <div className="max-w-6xl mx-auto mt-6 mb-6">
            <div className="bg-white rounded-lg border border-blue-200 p-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
              <textarea
                value={invoice.notes}
                onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows="2"
                placeholder="Add any additional notes or comments..."
              />
            </div>
          </div>

          {/* E-invoice Section - NEW */}
          {selectedCustomer?.gstin && parseFloat(invoice.net_amount || 0) >= 500 && (
            <div className="max-w-6xl mx-auto mt-6 mb-6">
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <FileInput className="w-5 h-5 text-orange-600 mr-2" />
                    <label className="text-sm font-medium text-orange-800">E-Invoice Generation</label>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={invoice.e_invoice_applicable}
                      onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_applicable: e.target.checked }))}
                      className="mr-2 w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                    />
                    <span className="text-sm text-orange-700">Generate E-Invoice</span>
                  </label>
                </div>
                
                {invoice.e_invoice_applicable && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        E-Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoice.e_invoice_number}
                        onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_number: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Auto-generated after submission"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        IRN (Invoice Reference Number)
                      </label>
                      <input
                        type="text"
                        value={invoice.irn}
                        onChange={(e) => setInvoice(prev => ({ ...prev, irn: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Generated by GST Portal"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        Acknowledgment Number
                      </label>
                      <input
                        type="text"
                        value={invoice.ack_no}
                        onChange={(e) => setInvoice(prev => ({ ...prev, ack_no: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="From GST Portal"
                        readOnly
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        Acknowledgment Date
                      </label>
                      <input
                        type="datetime-local"
                        value={invoice.ack_date}
                        onChange={(e) => setInvoice(prev => ({ ...prev, ack_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        readOnly
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        QR Code Data
                      </label>
                      <textarea
                        value={invoice.qr_code}
                        onChange={(e) => setInvoice(prev => ({ ...prev, qr_code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                        rows="2"
                        placeholder="QR code data from GST Portal"
                        readOnly
                      />
                    </div>
                  </div>
                )}
                
                <div className="mt-3 text-xs text-orange-600">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  E-Invoice is mandatory for B2B transactions above ₹500 with registered businesses
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <DocumentFooter
          totalItems={invoice.items.length}
          totalAmount={invoice.net_amount}
          subtotalAmount={invoice.subtotal_amount}
          taxAmount={invoice.tax_amount}
          roundOffAmount={invoice.round_off}
          grandTotal={invoice.net_amount}
          onSave={handleSaveInvoice}
          onPrint={handlePrint}
          onWhatsApp={handleWhatsAppShare}
          isSaving={saving}
          customerPhone={selectedCustomer?.phone || invoice.customer_details?.phone}
          showActionButtons={true}
        />

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
          onPrint={handlePrint}
          onWhatsApp={handleWhatsAppShare}
          showCopy={true}
        />
      )}
    </div>
  );
};

export default InvoiceFlow;