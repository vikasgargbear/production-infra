import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { searchCache, smartSearch } from '../../../../utils/searchCache';
import DataTransformer from '../../../../services/dataTransformer';
import InvoiceApiService from '../../../../services/invoiceApiService';
import EnterpriseCalculator from '../../../../services/enterpriseCalculator';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/documentNumberGenerator';
import localInvoiceService from '../../../../services/invoice/localInvoiceService';
import { customerAPI, productAPI, employeesAPI } from '../../../../services/api';
import offlineDB from '../../../../services/offline/offlineDatabase';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';

export const useInvoiceLogic = (onClose, prefilledData = null) => {
  // Network Status
  const { isOnline } = useNetworkStatus();
  
  // Core State
  const [invoice, setInvoice] = useState({
    invoice_no: `DRAFT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`, // Temporary draft number
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from today
    items: [],
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    transport_company: '',
    vehicle_number: '',
    delivery_charges: 0,
    discount_amount: 0,
    discount_percent: 0,
    discount_type: 'percentage',
    payment_mode: 'credit',
    payment_status: 'pending',
    payments: [{
      id: '1',
      method: 'credit',
      amount: 0,
      reference: ''
    }],
    notes: '',
    sales_person_id: null,
    e_invoice_applicable: false,
    e_invoice_number: '',
    irn: '',
    ack_no: '',
    ack_date: '',
    qr_code: '',
    eway_bill_number: '',
    eway_bill_date: '',
    eway_bill_valid_upto: '',
    net_amount: 0,
    totals: null
  });

  // Supporting State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedMR, setSelectedMR] = useState(null);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoiceData, setCreatedInvoiceData] = useState(null);

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBillDiscountModal, setShowBillDiscountModal] = useState(false);
  const [showTaxDetailModal, setShowTaxDetailModal] = useState(false);
  const [showCashCalculatorModal, setShowCashCalculatorModal] = useState(false);
  const [showLastDealModal, setShowLastDealModal] = useState(false);
  const [selectedProductForLastDeal, setSelectedProductForLastDeal] = useState(null);
  const [showItemProfitModal, setShowItemProfitModal] = useState(false);

  // Refs
  const productSearchRef = useRef(null);
  const itemsTableRef = useRef(null);
  const deliveryTypeRef = useRef(null);
  const transportRef = useRef(null);
  const vehicleRef = useRef(null);
  const deliveryChargesRef = useRef(null);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    // Don't auto-save if no items or no customer
    if (invoice.items.length === 0 || !selectedCustomer) {
      return;
    }

    const autoSaveInterval = setInterval(async () => {
      try {
        const draftData = {
          ...invoice,
          customer_id: selectedCustomer.customer_id || selectedCustomer.id,
          customer_details: selectedCustomer,
          draft_saved_at: new Date().toISOString()
        };

        // Save to localStorage as backup
        localStorage.setItem('invoice_draft', JSON.stringify(draftData));
        console.log('[Invoice] Auto-saved draft');
        
        // Optional: Show subtle notification
        // toast.info('Draft saved', { autoClose: 1000, position: 'bottom-right' });
      } catch (error) {
        console.error('[Invoice] Auto-save failed:', error);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [invoice, selectedCustomer]);

  // Load draft on mount - use ref to prevent double execution in StrictMode
  const draftLoadedRef = useRef(false);
  
  useEffect(() => {
    // CRITICAL FIX: Prevent double execution in React StrictMode (dev)
    if (draftLoadedRef.current) {
      return;
    }
    draftLoadedRef.current = true;
    
    const loadDraft = () => {
      try {
        const savedDraft = localStorage.getItem('invoice_draft');
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          
          // Only load if draft is less than 24 hours old
          const draftAge = Date.now() - new Date(draft.draft_saved_at).getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (draftAge < maxAge && draft.items.length > 0) {
            const shouldRestore = window.confirm(
              'Found an unsaved invoice draft. Would you like to restore it?'
            );
            
            if (shouldRestore) {
              setInvoice(draft);
              if (draft.customer_details) {
                setSelectedCustomer(draft.customer_details);
              }
              toast.success('Draft restored successfully');
            } else {
              // User clicked Cancel - remove the draft
              localStorage.removeItem('invoice_draft');
              console.log('[Invoice] Draft discarded by user');
            }
          } else {
            // Remove old draft
            localStorage.removeItem('invoice_draft');
          }
        }
      } catch (error) {
        console.error('[Invoice] Failed to load draft:', error);
      }
    };

    loadDraft();
  }, []); // Only on mount

  // Initialize invoice data
  useEffect(() => {
    const initializeInvoice = async () => {
      try {
        setIsLoading(true);

        // ⚠️ DO NOT GENERATE INVOICE NUMBER HERE!
        // Numbers are generated by backend on save to prevent wasting numbers.
        // Invoice starts with DRAFT number, gets real number on successful save.

        // Load employees for MR selection
        try {
          const employeeResponse = await employeesAPI.getAll({ limit: 100 });
          if (employeeResponse?.data && Array.isArray(employeeResponse.data)) {
            setEmployees(employeeResponse.data);
          }
        } catch (employeeError) {
          console.warn('Unable to fetch employees:', employeeError.message);
          setEmployees([]);
        }

        // If prefilled data provided, merge it
        if (prefilledData) {
          if (prefilledData.customer) {
            setSelectedCustomer(prefilledData.customer);
            handleCustomerSelect(prefilledData.customer);
          }
          if (prefilledData.items && prefilledData.items.length > 0) {
            const transformedItems = prefilledData.items.map(item => 
              DataTransformer.transformProduct(item, 'invoice')
            );
            setInvoice(prev => ({ ...prev, items: transformedItems }));
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing invoice:', error);
        setError('Failed to initialize invoice. Please try again.');
        setIsLoading(false);
      }
    };

    initializeInvoice();
  }, [prefilledData]);

  // Recalculate totals when items or discounts change
  // Uses EnterpriseCalculator - single source of truth for all calculations
  useEffect(() => {
    // Skip if no items
    if (!invoice.items || invoice.items.length === 0) {
      return;
    }

    console.log('🧮 Starting calculation with invoice items:', 
      invoice.items?.map(i => ({ 
        name: i.product_name || i.name,
        qty: i.quantity,
        rate: i.rate || i.unit_price,
        discount: i.discount || i.discount_percent
      }))
    );

    EnterpriseCalculator.calculateDebounced(invoice, (error, result) => {
      if (error) {
        console.error('❌ Calculation error:', error);
        return;
      }
      
      if (result && result.totals) {
        console.log('✅ Calculation result:', {
          items: result.items?.map(i => ({ 
            name: i.product_name, 
            qty: i.quantity, 
            rate: i.rate,
            line_total: i.line_total 
          })),
          totals: result.totals
        });

        // CRITICAL FIX: Only update totals, not items
        // Updating items would trigger this useEffect again (infinite loop)
        setInvoice(prev => {
          // Enrich items with calculated values without changing array reference
          const enrichedItems = prev.items.map((item, idx) => ({
            ...item,
            ...(result.items[idx] || {}), // Merge calculated values
          }));

          console.log('📊 Updating invoice with totals:', {
            final_amount: result.totals.final_amount,
            items_count: enrichedItems.length
          });

          return {
            ...prev,
            items: enrichedItems,
            totals: result.totals,
            net_amount: result.totals.final_amount
          };
        });
      }
    }, 300, 'invoice');
    
    // Use stringified items to prevent infinite loops
    // Only recalculate when actual values change, not object references
  }, [
    JSON.stringify(invoice.items?.map(i => ({ 
      quantity: i.quantity, 
      rate: i.rate, 
      discount: i.discount,
      gst_percent: i.gst_percent 
    }))),
    invoice.delivery_charges,
    invoice.discount_amount,
    invoice.discount_percent
  ]);

  // Handlers
  const handleCustomerSelect = useCallback((customer) => {
    if (!customer) {
      setSelectedCustomer(null);
      setInvoice(prev => ({
        ...prev,
        customer_details: null,
        billing_address: '',
        shipping_address: ''
      }));
      return;
    }

    setSelectedCustomer(customer);
    const billingAddress = customer.billing_address || customer.address || '';
    
    setInvoice(prev => ({
      ...prev,
      customer_details: customer,
      billing_address: billingAddress,
      shipping_address: sameAsShipping ? billingAddress : prev.shipping_address
    }));

    setMessage(`Customer "${customer.customer_name || customer.name}" selected`);
    setMessageType('success');
    setTimeout(() => setMessage(''), 3000);
  }, [sameAsShipping]);

  const handleAddItem = useCallback((product) => {
    if (!product) return;

    console.log('📦 [ADD ITEM] Raw product from search:', product);

    const transformedProduct = DataTransformer.transformProduct(product, 'invoice');
    
    console.log('📦 [ADD ITEM] Transformed product:', transformedProduct);
    console.log('📦 [ADD ITEM] Batch info:', {
      batch_number: transformedProduct.batch_number,
      expiry_date: transformedProduct.expiry_date
    });
    
    if (!transformedProduct || !transformedProduct.product_name) {
      toast.error('Invalid product data');
      return;
    }

    setInvoice(prev => {
      const existingItemIndex = prev.items.findIndex(
        item => item.product_id === transformedProduct.product_id
      );

      if (existingItemIndex >= 0) {
        // Update existing item quantity
        const updatedItems = [...prev.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: parseFloat(updatedItems[existingItemIndex].quantity || 0) + 1
        };
        return { ...prev, items: updatedItems };
      } else {
        // Add new item with default values
        return { 
          ...prev, 
          items: [...prev.items, {
            ...transformedProduct,
            quantity: 1,  // Default quantity
            discount: 0,
            discount_percent: 0,
            free_quantity: 0
          }] 
        };
      }
    });

    setMessage(`Added "${transformedProduct.product_name}" to invoice`);
    setMessageType('success');
    setTimeout(() => setMessage(''), 2000);
  }, []);

  const handleUpdateItem = useCallback((index, field, value) => {
    console.log(`🔄 [UPDATE ITEM] Index: ${index}, Field: ${field}, Value: ${value}`);
    
    setInvoice(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value
      };
      
      console.log('🔄 [UPDATE ITEM] Updated item:', updatedItems[index]);
      console.log('🔄 [UPDATE ITEM] All items:', updatedItems.map(i => ({ 
        name: i.product_name, 
        qty: i.quantity 
      })));
      
      return { ...prev, items: updatedItems };
    });
  }, []);

  const handleRemoveItem = useCallback((index) => {
    setInvoice(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }, []);

  const handleImport = useCallback(async (importData) => {
    try {
      if (!importData) return;

      if (importData.customer) {
        handleCustomerSelect(importData.customer);
      }

      if (importData.items && importData.items.length > 0) {
        const transformedItems = importData.items.map(item => 
          DataTransformer.transformProduct(item, 'invoice')
        );
        setInvoice(prev => ({ ...prev, items: transformedItems }));
      }

      if (importData.delivery_details) {
        setInvoice(prev => ({
          ...prev,
          delivery_type: importData.delivery_details.delivery_type || 'PICKUP',
          delivery_charges: importData.delivery_details.delivery_charges || 0
        }));
      }

      setMessage(`Imported ${importData.items?.length || 0} items from ${importData.source}`);
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Import error:', error);
      setMessage('Failed to import data');
      setMessageType('error');
      setTimeout(() => setMessage(''), 5000);
    }
  }, [handleCustomerSelect]);

  const handleApplyBillDiscount = useCallback((discountData) => {
    setInvoice(prev => ({
      ...prev,
      discount_type: discountData.type,
      discount_amount: discountData.type === 'fixed' ? discountData.amount : 0,
      discount_percent: discountData.type === 'percentage' ? discountData.percentage : 0
    }));
  }, []);

  const handleSaveInvoice = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate invoice
      if (!selectedCustomer) {
        throw new Error('Please select a customer');
      }
      if (invoice.items.length === 0) {
        throw new Error('Please add at least one item');
      }

      const invoiceData = {
        ...invoice,
        customer_id: selectedCustomer.customer_id || selectedCustomer.id,
        customer_details: selectedCustomer,
        total_amount: parseFloat(invoice.totals?.final_amount || invoice.net_amount) || 0,
        invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };

      // OFFLINE-FIRST: Check network status
      if (!isOnline) {
        console.log('[Invoice] Saving offline - no internet connection');
        
        // Generate local temp ID
        const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate temporary offline invoice number
        const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false); // false = don't try backend
        
        // Save to IndexedDB
        await offlineDB.add('invoices', {
          ...invoiceData,
          invoice_no: offlineInvoiceNo, // Use offline-generated number
          temp_id: tempId,
          sync_status: 'pending',
          created_offline: true
        });
        
        // Show offline success message
        toast.success('✅ Invoice saved offline - Will sync when online', {
          autoClose: 5000,
          icon: '📱'
        });
        
        // Create mock success data for UI
        const createdData = {
          invoiceId: tempId,
          invoiceNumber: invoice.invoice_no,
          customerName: selectedCustomer.customer_name || selectedCustomer.name,
          customerPhone: selectedCustomer.phone || selectedCustomer.primary_phone || '',
          customerEmail: selectedCustomer.email || '',
          totalAmount: invoiceData.total_amount,
          items: invoice.items,
          isOffline: true
        };

        setCreatedInvoiceData(createdData);
        setShowSuccessModal(true);
        
        // Clear draft after successful save
        localStorage.removeItem('invoice_draft');
        
        setSaving(false);
        return;
      }

      // ONLINE: Normal API save
      // Backend will generate the real sequential invoice number
      console.log('[Invoice] Saving online - backend will assign invoice number');
      const response = await InvoiceApiService.createInvoice(invoiceData);

      if (response.success) {
        // ✅ Backend returns the real invoice number (sequential, no gaps)
        const createdData = {
          invoiceId: response.data.invoice_id,
          invoiceNumber: response.data.invoice_number, // Real number from backend
          customerName: selectedCustomer.customer_name || selectedCustomer.name,
          customerPhone: selectedCustomer.phone || selectedCustomer.primary_phone || '',
          customerEmail: selectedCustomer.email || '',
          totalAmount: response.data.total_amount || invoiceData.total_amount,
          items: response.data.items || invoice.items,
          isOffline: false
        };

        setCreatedInvoiceData(createdData);
        setShowSuccessModal(true);
        
        // Clear draft after successful save
        localStorage.removeItem('invoice_draft');
        
        toast.success('✅ Invoice created successfully');
      } else {
        throw new Error(response.message || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Save invoice error:', error);
      
      // Check if it's a stock conflict
      if (error.response?.status === 409 && error.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
        const details = error.response.data.detail;
        setError(`Insufficient stock: Product ${details.product_id} - Required ${details.required_quantity}, Available ${details.available_quantity}`);
        toast.error(`❌ Insufficient Stock: Only ${details.available_quantity} units available`, {
          autoClose: 8000
        });
      } else {
        setError(error.message || 'Failed to create invoice');
        toast.error(error.message || 'Failed to create invoice');
      }
    } finally {
      setSaving(false);
    }
  }, [invoice, selectedCustomer, isOnline]);

  const clearMessage = useCallback(() => {
    setMessage('');
    setMessageType('');
  }, []);

  return {
    // State
    invoice,
    setInvoice,
    selectedCustomer,
    setSelectedCustomer,
    employees,
    selectedMR,
    setSelectedMR,
    sameAsShipping,
    setSameAsShipping,
    isLoading,
    error,
    setError,
    message,
    messageType,
    saving,
    showSuccessModal,
    setShowSuccessModal,
    createdInvoiceData,

    // Modal States
    showCustomerModal,
    setShowCustomerModal,
    showProductModal,
    setShowProductModal,
    showGSTCalculator,
    setShowGSTCalculator,
    showImportModal,
    setShowImportModal,
    showBillDiscountModal,
    setShowBillDiscountModal,
    showTaxDetailModal,
    setShowTaxDetailModal,
    showCashCalculatorModal,
    setShowCashCalculatorModal,
    showLastDealModal,
    setShowLastDealModal,
    selectedProductForLastDeal,
    setSelectedProductForLastDeal,
    showItemProfitModal,
    setShowItemProfitModal,

    // Refs
    productSearchRef,
    itemsTableRef,
    deliveryTypeRef,
    transportRef,
    vehicleRef,
    deliveryChargesRef,

    // Handlers
    handleCustomerSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    handleImport,
    handleApplyBillDiscount,
    handleSaveInvoice,
    clearMessage
  };
};