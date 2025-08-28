import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Search, Package, Calendar, X, AlertCircle, CheckCircle, 
  RotateCcw, FileText, User, ChevronRight, Save, Printer, History, Truck, Plus, Trash2
} from 'lucide-react';
import { 
  CustomerSearch, ProductSearchSimple, ModuleHeader,
  DatePicker, Select, NumberInput, NotesSection, useToast, ViewHistoryButton,
  ProceedToReviewComponent, StandardDatePicker
} from '../global';
import CustomerCreationB2B from '../global/ui/forms/CustomerCreationB2B';
import { returnsApi, customersApi, settingsApi, metadataApi } from '../../services/api';
import InvoiceApiService from '../../services/invoiceApiService';
import ReturnItemsTable from './components/ReturnItemsTable';
import ReturnSummary from './components/ReturnSummary';
import CreditNotePreview from './components/CreditNotePreview';
import offlineStorage from '../../services/offlineStorage';

const SalesReturnFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyButtonRef = useRef(null);
  const toast = useToast();

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const invoiceSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Return data state
  const [returnData, setReturnData] = useState({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    customer_details: null,
    invoice_id: '',
    invoice_no: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    credit_note_no: '',
    status: 'PENDING',
    include_gst: true, // Default to including GST
    credit_adjustment_type: 'future' // 'future' or 'existing_dues'
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnableInvoices, setReturnableInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [customerDues, setCustomerDues] = useState(0);
  const [returnReasons, setReturnReasons] = useState([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [invoiceFilters, setInvoiceFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: 'all',
    minAmount: '',
    maxAmount: ''
  });
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showInvoiceSection, setShowInvoiceSection] = useState(true);
  const [manualItemCounter, setManualItemCounter] = useState(1);

  // Load return reasons from system settings
  useEffect(() => {
    const loadReturnReasons = async () => {
      // First set default reasons immediately to avoid blocking
      const defaultReasons = [
        { value: 'EXPIRED', label: 'Expired Product' },
        { value: 'DAMAGED', label: 'Damaged Product' },
        { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered' },
        { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
        { value: 'NOT_REQUIRED', label: 'Not Required' },
        { value: 'EXCESS_STOCK', label: 'Excess Stock' },
        { value: 'RATE_DIFFERENCE', label: 'Rate Difference' },
        { value: 'CUSTOMER_RETURN', label: 'Customer Return' },
        { value: 'OTHER', label: 'Other' }
      ];
      setReturnReasons(defaultReasons);
      
      // Then try to load from backend in background
      try {
        // Check cache first for faster load
        const cached = await offlineStorage.getOffline('sales_return_reasons', { persistent: true });
        if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
          setReturnReasons(cached.data);
        }
        
        // Get return reasons from metadata API
        const response = await metadataApi.getReturnReasons();
        
        const returnReasons = response.data?.sales_return_reasons || [];
        
        if (Array.isArray(returnReasons) && returnReasons.length > 0) {
          // Use return reasons directly from metadata API
          const reasons = returnReasons;
          
          if (reasons.length > 0) {
            setReturnReasons(reasons);
            // Cache for offline use
            await offlineStorage.storeOffline('sales_return_reasons', reasons, { persistent: true });
          }
        }
      } catch (error) {
        // Silently fail and keep using default reasons
        console.warn('Using default return reasons:', error.message);
      }
    };

    loadReturnReasons();
  }, []);

  // Load customer invoices when filters change
  useEffect(() => {
    if (selectedCustomer) {
      const customerId = selectedCustomer.id || selectedCustomer.customer_id || selectedCustomer.party_id;
      // Add a small debounce to avoid multiple rapid calls
      const timeoutId = setTimeout(() => {
        fetchCustomerInvoices(customerId);
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedCustomer, invoicePage, invoiceFilters]);

  // Generate return number with consistent format
  const generateReturnNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SR-${dateStr}${randomNum}`; // Format: SR-YYMMDD#### (Sales Return)
  };

  // Initialize return number
  useEffect(() => {
    setReturnData(prev => ({
      ...prev,
      return_no: generateReturnNumber()
    }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            if (customerSearchRef.current) {
              customerSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (invoiceSearchRef.current) {
              invoiceSearchRef.current.focus();
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveReturn();
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
        }
      }
      
      // Escape to close modals or go back - Enterprise pattern
      if (e.key === 'Escape') {
        if (showCustomerModal) setShowCustomerModal(false);
        else if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Focus first input on mount
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  // Load customer invoices when customer is selected
  const fetchCustomerInvoices = async (customerId) => {
    if (!customerId) {
      setReturnableInvoices([]);
      setInvoicePagination(null);
      return;
    }

    // Prevent multiple simultaneous calls
    if (loadingInvoices) {
      return;
    }

    setLoadingInvoices(true);
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Use InvoiceApiService to fetch invoices for the customer
      const response = await InvoiceApiService.getInvoices({
        customer_id: customerId,
        limit: 10,
        offset: (invoicePage - 1) * 10,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.success && response.data) {
        let allInvoices = response.data.invoices?.map(invoice => ({
          id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total_amount: parseFloat(invoice.final_amount || invoice.grand_total) || 0,
          outstanding_amount: parseFloat(invoice.final_amount || invoice.grand_total) - parseFloat(invoice.paid_amount || 0),
          status: invoice.payment_status || 'pending',
          items: invoice.items || []
        })) || [];

        // Apply frontend filters
        if (invoiceFilters.dateFrom) {
          allInvoices = allInvoices.filter(invoice => 
            new Date(invoice.invoice_date) >= new Date(invoiceFilters.dateFrom)
          );
        }
        
        if (invoiceFilters.dateTo) {
          allInvoices = allInvoices.filter(invoice => 
            new Date(invoice.invoice_date) <= new Date(invoiceFilters.dateTo)
          );
        }
        
        if (invoiceFilters.status !== 'all') {
          allInvoices = allInvoices.filter(invoice => 
            invoice.status.toLowerCase() === invoiceFilters.status.toLowerCase()
          );
        }
        
        if (invoiceFilters.minAmount) {
          allInvoices = allInvoices.filter(invoice => 
            invoice.total_amount >= parseFloat(invoiceFilters.minAmount)
          );
        }
        
        if (invoiceFilters.maxAmount) {
          allInvoices = allInvoices.filter(invoice => 
            invoice.total_amount <= parseFloat(invoiceFilters.maxAmount)
          );
        }

        setReturnableInvoices(allInvoices);
        setInvoicePagination({
          page: invoicePage,
          limit: 10,
          total_count: response.data.total || allInvoices.length,
          total_pages: Math.ceil((response.data.total || allInvoices.length) / 10),
          has_next: invoicePage < Math.ceil((response.data.total || allInvoices.length) / 10),
          has_prev: invoicePage > 1
        });
      }
    } catch (error) {
      // Don't show error for aborted requests (component unmount or new request)
      if (error.name === 'AbortError') {
        console.log('Invoice fetch aborted');
        setLoadingInvoices(false);
        return;
      }
      
      console.error('Error fetching customer invoices:', error);
      
      // Mock data for UI/UX demonstration
      const mockInvoices = [
        {
          id: 'INV-001',
          invoice_number: 'INV-2024-001',
          invoice_date: '2024-01-15',
          total_amount: 15000,
          outstanding_amount: 15000,
          status: 'paid',
          items: [
            { id: 1, product_name: 'Paracetamol 500mg', quantity: 100, rate: 50, hsn_code: '30049099' },
            { id: 2, product_name: 'Aspirin 75mg', quantity: 50, rate: 100, hsn_code: '30049099' }
          ]
        },
        {
          id: 'INV-002',
          invoice_number: 'INV-2024-002',
          invoice_date: '2024-01-10',
          total_amount: 25000,
          outstanding_amount: 5000,
          status: 'partial',
          items: [
            { id: 3, product_name: 'Vitamin D3 Tablets', quantity: 200, rate: 75, hsn_code: '30049099' }
          ]
        },
        {
          id: 'INV-003',
          invoice_number: 'INV-2024-003',
          invoice_date: '2024-01-05',
          total_amount: 18000,
          outstanding_amount: 18000,
          status: 'paid',
          items: []
        }
      ];

      // Apply frontend filters to mock data
      let filteredInvoices = [...mockInvoices];
      
      if (invoiceFilters.dateFrom) {
        filteredInvoices = filteredInvoices.filter(invoice => 
          new Date(invoice.invoice_date) >= new Date(invoiceFilters.dateFrom)
        );
      }
      
      if (invoiceFilters.dateTo) {
        filteredInvoices = filteredInvoices.filter(invoice => 
          new Date(invoice.invoice_date) <= new Date(invoiceFilters.dateTo)
        );
      }
      
      if (invoiceFilters.status !== 'all') {
        filteredInvoices = filteredInvoices.filter(invoice => 
          invoice.status.toLowerCase() === invoiceFilters.status.toLowerCase()
        );
      }

      setReturnableInvoices(filteredInvoices);
      setInvoicePagination({
        page: 1,
        limit: 10,
        total_count: filteredInvoices.length,
        total_pages: 1,
        has_next: false,
        has_prev: false
      });
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Handle customer selection
  const handleCustomerSelect = async (customer) => {
    console.log('Customer selected:', customer);
    
    // Handle customer clear/removal
    if (!customer) {
      setSelectedCustomer(null);
      setSelectedInvoice(null);
      setShowInvoiceSection(true); // Reset to show invoice section
      setShowManualEntry(false); // Reset manual entry
      setReturnData(prev => ({
        ...prev,
        customer_id: '',
        customer_details: null,
        invoice_id: '',
        items: []
      }));
      return;
    }
    
    // Ensure customer has all needed fields
    const fullCustomer = {
      ...customer,
      customer_name: customer.customer_name || customer.name,
      address: customer.address || customer.billing_address || customer.street_address || '',
      phone: customer.phone || customer.mobile || customer.contact_phone || '',
      email: customer.email || customer.contact_email || '',
      gst_number: customer.gst_number || customer.gstin || customer.gst || '',
      drug_license_number: customer.drug_license_number || customer.drug_license || ''
    };
    
    setSelectedCustomer(fullCustomer);
    setSelectedInvoice(null); // Reset invoice selection
    setShowInvoiceSection(true); // Show invoice section for new customer
    setShowManualEntry(false); // Reset manual entry
    setReturnData(prev => ({
      ...prev,
      customer_id: customer.id || customer.customer_id || customer.party_id,
      customer_details: fullCustomer,
      invoice_id: '',
      items: []
    }));

    const customerId = customer.id || customer.customer_id || customer.party_id;
    
    // Fetch customer outstanding balance
    try {
      const response = await customersApi.getOutstandingBalance(customerId);
      if (response.success) {
        setCustomerDues(response.data.outstanding_amount || 0);
      }
    } catch (error) {
      console.error('Error fetching customer dues:', error);
      setCustomerDues(0);
    }

    // Fetch customer invoices
    await fetchCustomerInvoices(customerId);
  };

  // Handle skipping invoice selection for general return
  const handleSkipInvoiceSelection = () => {
    setSelectedInvoice(null);
    setShowManualEntry(true);
    setShowInvoiceSection(false); // Hide invoice section to avoid clutter
    setReturnData(prev => ({
      ...prev,
      invoice_id: '',
      invoice_no: '',
      invoice_date: '',
      original_invoice: null,
      items: [] // Will be populated manually
    }));
  };

  // Add manual item to return
  const addManualItem = (product) => {
    if (!product) return;
    
    const newItem = {
      id: `manual-${manualItemCounter}`,
      product_id: product.product_id,
      product_name: product.product_name || product.name,
      batch_id: null,
      rate: 0,
      tax_percent: 18, // Default GST rate
      quantity: 0, // Will be set manually
      return_quantity: 0,
      max_returnable_qty: 999999, // No limit for manual items
      return_reason: '',
      selected: true,
      hsn_code: product.hsn_code || '',
      unit: product.unit || '',  // No default unit
      manufacturer: product.manufacturer || '',
      // Additional fields for manual entry
      is_manual: true,
      available_stock: 0 // Not relevant for returns
    };

    setReturnData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
    
    setManualItemCounter(prev => prev + 1);
  };

  // Remove manual item
  const removeManualItem = (itemId) => {
    setReturnData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  // Handle invoice selection
  const handleInvoiceSelect = async (invoice) => {
    setSelectedInvoice(invoice);
    
    // Fetch invoice details if items not included
    let invoiceWithItems = invoice;
    if (!invoice.items || invoice.items.length === 0) {
      try {
        setLoading(true);
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await InvoiceApiService.getInvoiceById(invoice.invoice_id || invoice.id, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.success) {
          invoiceWithItems = response.data;
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          toast.error('Request timed out. Please try again.');
        } else {
          toast.error('Failed to fetch invoice details');
        }
        console.error('Error fetching invoice details:', error);
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }
    
    // Debug: log the invoice data to see what fields we have
    if (invoiceWithItems.items && invoiceWithItems.items.length > 0) {
      console.log('Invoice item fields:', Object.keys(invoiceWithItems.items[0]));
      console.log('First item data:', invoiceWithItems.items[0]);
    }
    
    setReturnData(prev => ({
      ...prev,
      invoice_id: invoiceWithItems.invoice_id || invoiceWithItems.id,
      invoice_no: invoiceWithItems.invoice_number || invoiceWithItems.invoice_no,
      invoice_date: invoiceWithItems.invoice_date,
      original_invoice: invoiceWithItems,
      items: (invoiceWithItems.items || []).map((item, index) => {
        // Use backend data directly - base_quantity is the paid quantity
        const totalQty = parseFloat(item.quantity || 0);
        const freeQty = parseFloat(item.free_quantity || 0);
        
        // Backend sends base_quantity as the actual paid quantity
        let paidQty;
        if (item.base_quantity !== undefined && item.base_quantity !== null) {
          paidQty = parseFloat(item.base_quantity);
        } else if (item.paid_quantity !== undefined && item.paid_quantity !== null) {
          paidQty = parseFloat(item.paid_quantity);
        } else {
          // Calculate paid qty, but ensure it's not negative
          paidQty = Math.max(0, totalQty - freeQty);
        }
        
        // Handle data inconsistency - if free > total, adjust free
        if (freeQty > totalQty) {
          console.warn(`Data inconsistency: free_quantity (${freeQty}) > total quantity (${totalQty}) for ${item.product_name}`);
          // In this case, assume all are free
          paidQty = 0;
        }
        
        // Calculate max returnable (considering already returned items)
        const returnedQty = parseFloat(item.returned_quantity || 0);
        const maxReturnablePaid = Math.max(0, paidQty - returnedQty);
        const maxReturnableTotal = Math.max(0, totalQty - returnedQty);
        
        return {
          ...item,
          id: item.item_id || item.id || `item-${index}`,
          product_id: item.product_id,
          product_name: item.product_name || item.product?.name,
          batch_id: item.batch_id,
          batch_no: item.batch_number || item.batch_no || item.batch?.batch_no,
          batch_number: item.batch_number,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
          rate: parseFloat(item.unit_price || item.rate || item.sale_price || item.price || 0),
          // GST calculation from actual backend data
          // Backend sends cgst_rate and sgst_rate as strings like "6.00"
          tax_percent: (() => {
            // Try direct tax_percent first
            if (item.tax_percent) return parseFloat(item.tax_percent);
            if (item.gst_percent) return parseFloat(item.gst_percent);
            
            // Calculate from CGST + SGST (most common case)
            const cgst = parseFloat(item.cgst_rate || item.cgst_percent || 0);
            const sgst = parseFloat(item.sgst_rate || item.sgst_percent || 0);
            const igst = parseFloat(item.igst_rate || item.igst_percent || 0);
            
            // Return whichever is available
            if (cgst || sgst) return cgst + sgst;
            if (igst) return igst;
            
            return 0; // Default to 0 if no tax info found
          })(),
          cgst_rate: parseFloat(item.cgst_rate || item.cgst_percent || 0),
          sgst_rate: parseFloat(item.sgst_rate || item.sgst_percent || 0),
          igst_rate: parseFloat(item.igst_rate || item.igst_percent || 0),
          discount_percent: parseFloat(item.discount_percent || item.discount || 0),
          discount_amount: parseFloat(item.discount_amount || 0),
          // Quantities - use actual values
          quantity: totalQty,
          paid_quantity: paidQty,
          free_quantity: freeQty,
          // Auto-populate with total returnable (user can return all)
          return_quantity: maxReturnableTotal,
          max_returnable_qty: maxReturnableTotal,
          max_returnable_paid: maxReturnablePaid, // Track paid limit separately
          return_reason: '',
          // Auto-select items that have something to return
          selected: maxReturnableTotal > 0,
          hsn_code: item.hsn_code || ''
        };
      })
    }));
  };

  // Update return item - handle both index and id based updates
  const updateReturnItem = (indexOrId, field, value) => {
    console.log('updateReturnItem called:', { indexOrId, field, value });
    
    // For returns module, we want to update return_quantity when quantity is changed
    const actualField = (field === 'quantity') ? 'return_quantity' : field;
    
    setReturnData(prev => {
      console.log('Current items before update:', prev.items);
      const updatedItems = prev.items.map((item, index) => {
        // Check if it's an index (number) or id match
        if (index === indexOrId || item.id === indexOrId) {
          console.log('Found item to update:', { 
            id: item.id,
            index: index,
            currentValue: item[actualField], 
            newValue: value,
            field: actualField
          });
          const updatedItem = { ...item, [actualField]: value };
          console.log('Updated item:', updatedItem);
          return updatedItem;
        }
        return item;
      });
      console.log('All items after update:', updatedItems);
      return {
        ...prev,
        items: updatedItems
      };
    });
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        // Get quantities, ensuring no negative values
        const returnQty = parseFloat(item.return_quantity) || 0;
        const paidQty = Math.max(0, parseFloat(item.paid_quantity || 0));
        
        // Only paid items being returned have value
        const paidReturnQty = Math.min(returnQty, paidQty);
        
        // Skip calculation if no paid items being returned
        if (paidReturnQty <= 0) {
          return; // Continue to next item
        }
        
        const rate = parseFloat(item.rate) || 0;
        const discountPercent = parseFloat(item.discount_percent) || 0;
        
        const baseAmount = paidReturnQty * rate;
        const discountAmount = (baseAmount * discountPercent) / 100;
        const afterDiscount = baseAmount - discountAmount;
        
        // Always calculate tax for return amount (both GST and non-GST customers paid it)
        // Only exclude if GST customer explicitly chooses to exclude
        const taxPercent = (!selectedCustomer?.gst_number || returnData.include_gst) 
          ? (parseFloat(item.tax_percent) || 0)
          : 0;
        const itemTax = (afterDiscount * taxPercent) / 100;
        
        subtotal += afterDiscount;
        taxAmount += itemTax;
      }
    });

    const total = subtotal + taxAmount;

    setReturnData(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: total
    }));
  };

  // Watch for item changes and recalculate
  useEffect(() => {
    calculateTotals();
  }, [returnData.items, selectedCustomer, returnData.include_gst]);

  // Validate return
  const validateReturn = () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return false;
    }

    // For manual returns, invoice is not required
    if (!selectedInvoice && !showManualEntry) {
      toast.error('Please select an invoice or use manual entry');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => 
      item.selected && item.return_quantity > 0
    );

    if (!hasSelectedItems) {
      toast.error('Please add items to return');
      return false;
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    // Validate quantities and required fields for manual items
    for (const item of returnData.items) {
      if (item.selected) {
        if (item.return_quantity <= 0) {
          toast.error(`Please enter a valid return quantity for ${item.product_name}`);
          return false;
        }
        
        if (item.is_manual && item.rate <= 0) {
          toast.error(`Please enter a valid rate for ${item.product_name}`);
          return false;
        }
        
        if (!item.is_manual && item.return_quantity > item.max_returnable_qty) {
          toast.error(`Return quantity exceeds available quantity for ${item.product_name}`);
          return false;
        }
      }
    }

    return true;
  };

  // Proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Save return
  const handleSaveReturn = async () => {
    if (!validateReturn()) return;

    setSaving(true);
    try {
      const returnPayload = {
        ...returnData,
        // Items will be filtered and transformed in the API transformer
      };

      const response = await returnsApi.createSaleReturn(returnPayload);
      
      if (response.data) {
        const { credit_note_no, has_gst, message } = response.data;
        
        if (credit_note_no) {
          toast.success(`Sales return created successfully with GST Credit Note: ${credit_note_no}`);
        } else if (has_gst === false) {
          toast.success('Sales return created successfully (No GST credit note - customer does not have GST)');
        } else {
          toast.success(message || 'Sales return created successfully');
        }
      } else {
        toast.success('Sales return created successfully');
      }
      
      // Reset form or close
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (error) {
      toast.error(error.message || 'Failed to create return');
      console.error('Error creating return:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Step 1: Create Return
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Sales Return"
            documentNumber={returnData.return_no}
            status="draft"
            icon={RotateCcw}
            iconColor="text-red-600"
            onClose={onClose}
            historyType="return"
          />

          {/* Quick Actions Bar */}
          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-700 border-b border-gray-200">
            Keyboard shortcuts: <strong>Ctrl+R</strong> - Search Customer | <strong>Ctrl+I</strong> - Search Invoice | <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
          </div>

          {/* Loading Overlay */}
          {(loading || saving) && (
            <div className="absolute inset-0 bg-white bg-opacity-75 z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-700 font-medium">
                    {saving ? 'Creating Sales Return...' : 'Loading Invoice Details...'}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">Please wait</p>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
              {/* Return Info Tile - Date and Reason */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-6">
                  {/* Left side - Return Date */}
                  <div className="w-64">
                    <DatePicker
                      value={returnData.return_date}
                      onChange={(date) => setReturnData(prev => ({ ...prev, return_date: date }))}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>
                  
                  {/* Right side - Return Reason and Notes */}
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Reason <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={returnData.return_reason}
                          onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value }))}
                          options={returnReasons}
                          placeholder="Select return reason..."
                          size="lg"
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={returnData.return_reason_notes}
                          onChange={(e) => setReturnData(prev => ({ ...prev, return_reason_notes: e.target.value }))}
                          placeholder="Additional details..."
                          className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer & Invoice Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {/* Customer Section */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    CUSTOMER
                  </h3>
                  <CustomerSearch
                    value={selectedCustomer || null}
                    onChange={handleCustomerSelect}
                    onCreateNew={() => setShowCustomerModal(true)}
                    displayMode="inline"
                    placeholder="Search customer by name, phone, or code..."
                    required
                    clearable={true}
                  />
                </div>

                {/* Show option to select invoice if skipped */}
                {selectedCustomer && !showInvoiceSection && showManualEntry && (
                  <div className="mb-4">
                    <button
                      onClick={() => {
                        setShowInvoiceSection(true);
                        setShowManualEntry(false);
                        setReturnData(prev => ({ ...prev, items: [] }));
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      ← Back to Invoice Selection
                    </button>
                  </div>
                )}

                {/* Invoice Section - Show only when not skipped */}
                {selectedCustomer && showInvoiceSection && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        SELECT INVOICE
                      </h3>
                      <button
                        onClick={handleSkipInvoiceSelection}
                        className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Skip Invoice Selection
                      </button>
                    </div>
                    
                    {/* Show selected invoice if any */}
                    {selectedInvoice && (
                      <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center mb-4">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Invoice #{selectedInvoice.invoice_number || selectedInvoice.invoice_no}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: ₹{selectedInvoice.final_amount || selectedInvoice.total_amount || selectedInvoice.grand_total}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInvoice(null);
                            setReturnData(prev => ({
                              ...prev,
                              invoice_id: '',
                              items: []
                            }));
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    
                    {/* Invoice List */}
                    {!selectedInvoice && (
                      <div>
                        {/* Filters */}
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Search className="w-4 h-4 text-gray-600" />
                              <span className="text-sm font-medium text-gray-700">Filter Invoices</span>
                            </div>
                            <button
                              onClick={() => setInvoiceFilters({
                                dateFrom: '',
                                dateTo: '',
                                status: 'all',
                                minAmount: '',
                                maxAmount: ''
                              })}
                              className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-white transition-colors"
                            >
                              Clear Filters
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <StandardDatePicker
                                label="From Date"
                                value={invoiceFilters.dateFrom}
                                onChange={(value) => setInvoiceFilters(prev => ({ ...prev, dateFrom: value }))}
                                size="sm"
                              />
                            </div>
                            <div>
                              <StandardDatePicker
                                label="To Date"
                                value={invoiceFilters.dateTo}
                                onChange={(value) => setInvoiceFilters(prev => ({ ...prev, dateTo: value }))}
                                size="sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                              <select
                                value={invoiceFilters.status}
                                onChange={(e) => setInvoiceFilters(prev => ({ ...prev, status: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="all">All Status</option>
                                <option value="paid">Paid</option>
                                <option value="partial">Partial</option>
                                <option value="pending">Pending</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        
                        {/* Invoice List */}
                        {loadingInvoices ? (
                          <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-gray-600 mt-2">Loading invoices...</p>
                          </div>
                        ) : returnableInvoices.length > 0 ? (
                          <div className="space-y-2">
                            {returnableInvoices.map((invoice) => (
                              <div
                                key={invoice.id}
                                onClick={() => handleInvoiceSelect(invoice)}
                                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-semibold text-gray-900">
                                      Invoice #{invoice.invoice_number}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                      Date: {new Date(invoice.invoice_date).toLocaleDateString()}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Status: <span className={`font-medium ${
                                        invoice.status === 'paid' ? 'text-green-600' : 
                                        invoice.status === 'partial' ? 'text-yellow-600' : 'text-red-600'
                                      }`}>
                                        {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1) || ''}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-gray-900">
                                      ₹{invoice.total_amount?.toFixed(2) || '0.00'}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Outstanding: ₹{invoice.outstanding_amount?.toFixed(2) || '0.00'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Pagination */}
                            {invoicePagination && invoicePagination.total_pages > 1 && (
                              <div className="flex items-center justify-center space-x-2 mt-4">
                                <button
                                  onClick={() => setInvoicePage(prev => Math.max(1, prev - 1))}
                                  disabled={!invoicePagination.has_prev}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                                >
                                  Previous
                                </button>
                                <span className="text-sm text-gray-600">
                                  Page {invoicePagination.page} of {invoicePagination.total_pages}
                                </span>
                                <button
                                  onClick={() => setInvoicePage(prev => prev + 1)}
                                  disabled={!invoicePagination.has_next}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-lg font-medium">No invoices found</p>
                            <p className="text-sm">This customer has no returnable invoices</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Item Entry - Show when invoice is skipped */}
              {selectedCustomer && showManualEntry && !selectedInvoice && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <Plus className="w-5 h-5 mr-2 text-green-600" />
                        Add Items for Return
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Search and add products to create a return without an invoice
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        Search Products
                      </label>
                      <ProductSearchSimple
                        onSelect={addManualItem}
                        placeholder="Search products by name, code..."
                        className="w-full"
                      />
                    </div>
                    
                    {returnData.items.length > 0 && (
                      <div className="text-sm text-gray-600">
                        {returnData.items.length} item(s) added. Configure quantities and rates below.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Return Items - Show when invoice is selected or manual entry */}
              {(selectedInvoice || showManualEntry) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  {/* GST and Credit Options - Compact Bar */}
                  {returnData.items && returnData.items.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between">
                        {/* GST Toggle */}
                        {selectedCustomer && selectedCustomer.gst_number && (
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={returnData.include_gst}
                              onChange={(e) => setReturnData(prev => ({ ...prev, include_gst: e.target.checked }))}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">
                              Include GST in return amount
                            </span>
                          </label>
                        )}
                        
                        {/* Credit Adjustment */}
                        {customerDues > 0 && (
                          <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-600">Credit:</span>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                name="creditAdj"
                                value="existing_dues"
                                checked={returnData.credit_adjustment_type === 'existing_dues'}
                                onChange={(e) => setReturnData(prev => ({ 
                                  ...prev, 
                                  credit_adjustment_type: e.target.value 
                                }))}
                                className="mr-1.5 text-blue-600"
                              />
                              <span className="text-sm">Adjust dues</span>
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                name="creditAdj"
                                value="future"
                                checked={returnData.credit_adjustment_type === 'future'}
                                onChange={(e) => setReturnData(prev => ({ 
                                  ...prev, 
                                  credit_adjustment_type: e.target.value 
                                }))}
                                className="mr-1.5 text-blue-600"
                              />
                              <span className="text-sm">Future credit</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
                        <Package className="w-4 h-4 mr-2" />
                        {showManualEntry ? 'RETURN ITEMS' : 'ITEMS TO RETURN'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {showManualEntry 
                          ? 'Configure items for return'
                          : 'All items pre-selected. Adjust quantities as needed.'
                        }
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {showManualEntry && (
                        <button
                          onClick={() => {
                            // For manual items, just select all and set minimum required values
                            returnData.items.forEach(item => {
                              updateReturnItem(item.id, 'selected', true);
                              if (item.return_quantity === 0) {
                                updateReturnItem(item.id, 'return_quantity', 1);
                              }
                            });
                          }}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Select All
                        </button>
                      )}
                      {!showManualEntry && (
                        <>
                          <button
                            onClick={() => {
                              // Reset to full quantities
                              returnData.items.forEach(item => {
                                updateReturnItem(item.id, 'selected', true);
                                updateReturnItem(item.id, 'return_quantity', item.max_returnable_qty);
                              });
                            }}
                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Reset Quantities
                          </button>
                          <button
                            onClick={() => {
                              // Clear all selections
                              returnData.items.forEach(item => {
                                updateReturnItem(item.id, 'selected', false);
                                updateReturnItem(item.id, 'return_quantity', 0);
                              });
                            }}
                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Clear All
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Show items table or empty state */}
                  {returnData.items.length > 0 ? (
                    <ReturnItemsTable
                      items={returnData.items}
                      onUpdateItem={updateReturnItem}
                      onRemoveItem={showManualEntry ? removeManualItem : undefined}
                      includeGst={returnData.include_gst}
                      showManualEntry={showManualEntry}
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium">No items to return</p>
                      <p className="text-sm">
                        {showManualEntry 
                          ? 'Add products using the search above' 
                          : 'Loading invoice items...'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer - Using Global Component */}
          <ProceedToReviewComponent
            currentStep={1}
            canProceed={selectedCustomer && (selectedInvoice || showManualEntry) && returnData.items.some(item => item.selected && item.return_quantity > 0)}
            onBack={null}
            onProceed={handleProceedToReview}
            onReset={() => {
              setSelectedCustomer(null);
              setSelectedInvoice(null);
              setReturnData(prev => ({
                ...prev,
                customer_id: '',
                customer_details: null,
                invoice_id: '',
                items: [],
                return_reason: '',
                return_reason_notes: ''
              }));
              setShowManualEntry(false);
            }}
            totalItems={returnData.items.filter(item => item.selected).length}
            totalAmount={returnData.total_amount}
            proceedText="Proceed to Review"
            saving={false}
          />
        </div>
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Review Sales Return"
          subtitle="Confirm and generate credit note"
          onClose={onClose}
          actions={[
            {
              label: 'Back',
              icon: ArrowLeft,
              onClick: () => setCurrentStep(1)
            },
            {
              label: 'Print',
              icon: Printer,
              onClick: handlePrint,
              shortcut: 'Ctrl+P'
            }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            <CreditNotePreview
              returnData={returnData}
              customer={selectedCustomer}
              invoice={selectedInvoice}
              includeGst={returnData.include_gst}
              customerDues={customerDues}
            />
            
            {/* Notes Section */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <NotesSection
                value={returnData.return_reason_notes}
                onChange={(value) => setReturnData(prev => ({ 
                  ...prev, 
                  return_reason_notes: value 
                }))}
                placeholder="Add any additional notes about this return..."
                title="Return Notes"
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={2}
          canProceed={true}
          onBack={() => setCurrentStep(1)}
          onProceed={handleSaveReturn}
          onReset={null}
          totalItems={returnData.items.filter(item => item.selected).length}
          totalAmount={returnData.total_amount}
          proceedText="Generate Credit Note"
          saving={saving}
        />
      </div>
      
      {/* Hidden History Button - Triggered by ModuleHeader action */}
      <div style={{ display: 'none' }}>
        <ViewHistoryButton
          ref={historyButtonRef}
          historyType="returns"
          buttonText=""
        />
      </div>


      {/* Customer Creation Modal */}
      {showCustomerModal && (
        <CustomerCreationB2B
          onClose={() => setShowCustomerModal(false)}
          onCustomerCreated={(customer) => {
            handleCustomerSelect(customer);
            setShowCustomerModal(false);
            toast.success('Customer created successfully');
          }}
        />
      )}
    </div>
  );
};

export default SalesReturnFlow;