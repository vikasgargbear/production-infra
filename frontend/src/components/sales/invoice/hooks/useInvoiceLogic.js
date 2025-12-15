import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { searchCache, smartSearch } from '../../../../utils/searchCache';
import DataTransformer from '../../../../services/dataTransformer';
import { invoicesApi } from '../../../../services/api';
import EnterpriseCalculator from '../../../../services/enterpriseCalculator';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/documentNumberGenerator';
import localInvoiceService from '../../../../services/invoice/localInvoiceService';
import { customerAPI, productAPI, employeesAPI } from '../../../../services/api';
import offlineDB from '../../../../services/offline/offlineDatabase';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { getTodayBusinessDate, getDaysFromToday, getUTCTimestamp } from '../../../../utils/indianDateUtils';

export const useInvoiceLogic = (onClose, prefilledData = null) => {
  // Network Status
  const { isOnline } = useNetworkStatus();

  // Core State - using canonical backend names
  const [invoice, setInvoice] = useState({
    invoice_number: `DRAFT-${getTodayBusinessDate().replace(/-/g, '')}`, // Backend canonical name
    invoice_date: getTodayBusinessDate(), // ✅ Uses company timezone
    due_date: getDaysFromToday(30), // ✅ 30 days from today in company timezone
    items: [],
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    transport_company: '',
    vehicle_number: '',
    freight_charges: 0,  // Backend canonical name (was delivery_charges)
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
    e_way_bill_number: '',  // Backend canonical name (was eway_bill_number)
    eway_bill_date: '',
    eway_bill_valid_upto: '',
    final_amount: 0,  // Backend canonical name (was net_amount)
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
          draft_saved_at: getUTCTimestamp() // ✅ UTC for system timestamps
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

    // DISABLED: Draft auto-restore removed - will build dedicated draft history UI later
    // const loadDraft = () => {
    //   try {
    //     const savedDraft = localStorage.getItem('invoice_draft');
    //     if (savedDraft) {
    //       const draft = JSON.parse(savedDraft);
    //       // Draft functionality disabled - annoying notifications
    //     }
    //   } catch (error) {
    //     console.error('[Invoice] Failed to load draft:', error);
    //   }
    // };

    // Clean up old drafts silently
    try {
      const savedDraft = localStorage.getItem('invoice_draft');
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        const draftAge = Date.now() - new Date(draft.draft_saved_at).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        if (draftAge >= maxAge) {
          localStorage.removeItem('invoice_draft');
        }
      }
    } catch (error) {
      // Silent cleanup
    }
  }, []); // Only on mount

  // Initialize invoice data
  useEffect(() => {
    const initializeInvoice = async () => {
      try {
        setIsLoading(true);

        // ⚠️ DO NOT GENERATE INVOICE NUMBER HERE!
        // Numbers are generated by backend on save to prevent wasting numbers.
        // Invoice starts with DRAFT number, gets real number on successful save.

        // PERFORMANCE: Load employees for MR selection with caching
        try {
          const cacheKey = 'employees_cache';
          const cacheTimeKey = 'employees_cache_time';
          const cached = localStorage.getItem(cacheKey);
          const cacheTime = localStorage.getItem(cacheTimeKey);
          const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

          // Use cache if less than 10 minutes old
          if (cached && cacheAge < 10 * 60 * 1000) {
            console.log('[Invoice] Using cached employees');
            setEmployees(JSON.parse(cached));
          } else {
            console.log('[Invoice] Fetching employees from API');
            const employeeResponse = await employeesAPI.getAll({ limit: 100 });
            if (employeeResponse?.data && Array.isArray(employeeResponse.data)) {
              const employees = employeeResponse.data;
              setEmployees(employees);

              // Cache for 10 minutes
              localStorage.setItem(cacheKey, JSON.stringify(employees));
              localStorage.setItem(cacheTimeKey, Date.now().toString());
              console.log('[Invoice] Cached', employees.length, 'employees');
            }
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

        // CRITICAL FIX: Only merge CALCULATED fields, preserve user-edited fields
        setInvoice(prev => {
          // Enrich items with ONLY calculated values (not user-editable fields)
          const enrichedItems = prev.items.map((item, idx) => {
            const calculatedItem = result.items[idx] || {};

            return {
              ...item,
              // ONLY merge calculated/derived fields - NEVER overwrite user inputs
              line_subtotal: calculatedItem.line_subtotal,
              line_discount: calculatedItem.line_discount,
              line_taxable: calculatedItem.line_taxable,
              line_gst: calculatedItem.line_gst,
              line_total: calculatedItem.line_total,
              cgst_amount: calculatedItem.cgst_amount,
              sgst_amount: calculatedItem.sgst_amount,
              igst_amount: calculatedItem.igst_amount,
              // User editable fields (quantity, rate, discount, gst_percent) are preserved from item
            };
          });

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

  const handleAddItem = useCallback(async (product) => {
    if (!product) return;

    console.log('📦 [ADD ITEM] Raw product from search:', product);

    // CRITICAL: If product already has batch_id, it came from BatchSelector
    // and is already properly formatted. Don't transform it!
    // Only transform products from ProductSearch (no batch info)
    const transformedProduct = product.batch_id
      ? product  // Already has batch fields from BatchSelector - use as-is
      : DataTransformer.transformProduct(product, 'invoice'); // Product search - needs transform

    console.log('📦 [ADD ITEM] Transformed product:', transformedProduct);
    console.log('📦 [ADD ITEM] Batch info:', {
      batch_id: transformedProduct.batch_id,
      batch_number: transformedProduct.batch_number,
      expiry_date: transformedProduct.expiry_date
    });

    // OFFLINE SUPPORT: Cache batch in IndexedDB for offline invoice creation
    if (transformedProduct.batch_id) {
      try {
        await offlineDB.storeBatches([{
          batch_id: transformedProduct.batch_id,
          product_id: transformedProduct.product_id,
          batch_number: transformedProduct.batch_number,
          expiry_date: transformedProduct.expiry_date,
          manufacturing_date: transformedProduct.manufacturing_date,
          quantity_available: transformedProduct.quantity_available || transformedProduct.available_qty || 0,
          mrp: transformedProduct.mrp,
          selling_price: transformedProduct.selling_price || transformedProduct.unit_price,
          cost_per_unit: transformedProduct.cost_per_unit || transformedProduct.purchase_price
        }]);
        console.log('📦 [ADD ITEM] Batch cached in IndexedDB for offline use');
      } catch (e) {
        console.warn('📦 [ADD ITEM] Failed to cache batch:', e);
      }
    }

    if (!transformedProduct || !transformedProduct.product_name) {
      toast.error('Invalid product data');
      return;
    }

    setInvoice(prev => {
      // CRITICAL FIX: Check by BOTH product_id AND batch_id
      // This allows multiple batches of same product to appear as separate rows
      const existingItemIndex = prev.items.findIndex(item => {
        // If both have batch_id, match on both product_id and batch_id
        if (item.batch_id && transformedProduct.batch_id) {
          return item.product_id === transformedProduct.product_id &&
            item.batch_id === transformedProduct.batch_id;
        }
        // If no batch tracking, match only on product_id (legacy behavior)
        return item.product_id === transformedProduct.product_id;
      });

      if (existingItemIndex >= 0) {
        // Update existing item quantity (same product + same batch)
        const updatedItems = [...prev.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: parseFloat(updatedItems[existingItemIndex].quantity || 0) + 1
        };
        toast.info(`Quantity updated for ${transformedProduct.product_name} (Batch: ${transformedProduct.batch_number})`);
        return { ...prev, items: updatedItems };
      } else {
        // Add new item (different product OR different batch)
        const newItem = {
          ...transformedProduct,
          quantity: 1,  // Default quantity
          discount_percent: 0,  // Canonical backend name
          free_quantity: 0
        };

        const message = transformedProduct.batch_number
          ? `Added ${transformedProduct.product_name} (Batch: ${transformedProduct.batch_number})`
          : `Added ${transformedProduct.product_name}`;

        toast.success(message);

        return {
          ...prev,
          items: [...prev.items, newItem]
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

      // Prepare clean invoice data for backend - using canonical backend names
      const invoiceData = {
        customer_id: selectedCustomer.customer_id || selectedCustomer.id,
        invoice_date: invoice.invoice_date || getTodayBusinessDate(),
        due_date: invoice.due_date,
        items: invoice.items.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: parseFloat(item.quantity) || 0,
          free_quantity: parseFloat(item.free_quantity) || 0,
          unit_price: parseFloat(item.unit_price || item.sale_price || item.rate) || 0,  // Canonical name
          mrp: parseFloat(item.mrp) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,  // Canonical name
          gst_percent: parseFloat(item.gst_percent) || 0  // Canonical name
        })),
        discount_type: invoice.discount_type || 'percentage',
        discount_percent: parseFloat(invoice.discount_percent) || 0,
        discount_amount: parseFloat(invoice.discount_amount) || 0,
        freight_charges: parseFloat(invoice.freight_charges) || 0,  // Canonical name (was delivery_charges)
        delivery_type: invoice.delivery_type || 'PICKUP',
        payment_mode: invoice.payment_mode || 'cash',
        payment_status: invoice.payment_status || 'pending',
        payments: (invoice.payments || []).map(p => ({
          method: p.method,
          amount: parseFloat(p.amount) || 0
        })),
        billing_address: invoice.billing_address || '',
        shipping_address: invoice.shipping_address || '',
        notes: invoice.notes || '',
        gst_type: invoice.gst_type || 'CGST/SGST'
      };

      console.log('[Invoice] Prepared invoice data:', JSON.stringify(invoiceData, null, 2));

      // OFFLINE-FIRST: Check network status
      if (!isOnline) {
        console.log('[Invoice] Saving offline - no internet connection');

        // STEP 1: Validate and reserve stock quantities
        const reservationResults = [];
        for (const item of invoiceData.items) {
          if (item.batch_id) {
            const reservation = await offlineDB.reserveBatchQuantity(
              item.batch_id,
              parseFloat(item.quantity) || 0
            );

            if (!reservation.success) {
              // SPECIAL CASE: If batch is missing from cache, we allow saving
              // This handles cases where sync hasn't completed but user needs to sell
              if (reservation.error && reservation.error.includes('Batch not found')) {
                console.warn(`[Invoice] Batch ${item.batch_id} missing from offline cache. Proceeding anyway.`);
                // We still track it, but accept we can't decrement local stock
                reservationResults.push({
                  batch_id: item.batch_id,
                  quantity: parseFloat(item.quantity) || 0,
                  skipped_validation: true
                });
                continue; // Proceed to next item
              }

              // Rollback previous reservations for REAL stock errors
              for (const prevResult of reservationResults) {
                if (!prevResult.skipped_validation) {
                  await offlineDB.clearReservedQuantity(prevResult.batch_id, prevResult.quantity);
                }
              }

              // Show error and stop invoice creation
              toast.error(`❌ ${reservation.error}`, { autoClose: 8000 });
              setError(reservation.error);
              setSaving(false);
              return;
            }

            reservationResults.push({
              batch_id: item.batch_id,
              quantity: parseFloat(item.quantity) || 0
            });
          }
        }

        // STEP 2: Generate local temp ID
        const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // STEP 3: Generate temporary offline invoice number
        const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false); // false = don't try backend

        // STEP 4: Save to IndexedDB with reservation tracking
        const offlineInvoice = {
          ...invoiceData,
          invoice_no: offlineInvoiceNo, // Use offline-generated number
          temp_id: tempId,
          _localId: tempId, // For SyncEngine to track
          sync_status: 'pending',
          created_offline: true,
          reserved_batches: reservationResults // Track what we reserved
        };

        await offlineDB.add('invoices', offlineInvoice);

        // STEP 5: Add to sync queue for auto-sync when back online
        await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice);
        console.log('[Invoice] Added to sync queue for auto-sync');

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
      console.log('[Invoice] Final payload size:', JSON.stringify(invoiceData).length, 'bytes');

      const response = await invoicesApi.create(invoiceData);
      console.log('[Invoice] Save successful!');

      // invoicesApi.create returns the data directly (not wrapped in {success, data})
      console.log('[Invoice] Backend response:', response);

      const createdData = {
        invoiceId: response.invoice_id || response.data?.invoice_id,
        invoiceNumber: response.invoice_number || response.data?.invoice_number, // Real number from backend
        customerName: selectedCustomer.customer_name || selectedCustomer.name,
        customerPhone: selectedCustomer.phone || selectedCustomer.primary_phone || '',
        customerEmail: selectedCustomer.email || '',
        totalAmount: response.total_amount || response.data?.total_amount || invoiceData.total_amount,
        items: response.items || response.data?.items || invoice.items,
        isOffline: false
      };

      // Update invoice with real invoice number from backend
      setInvoice(prev => ({
        ...prev,
        invoice_number: createdData.invoiceNumber,
        invoice_no: createdData.invoiceNumber // Also update invoice_no for consistency
      }));

      setCreatedInvoiceData(createdData);
      setShowSuccessModal(true);

      // Clear draft after successful save
      localStorage.removeItem('invoice_draft');

      toast.success('✅ Invoice created successfully');
    } catch (error) {
      console.error('[Invoice] Save failed:', error);
      console.error('[Invoice] Error status:', error.response?.status);
      console.error('[Invoice] Error data:', error.response?.data);
      console.error('[Invoice] Request URL:', error.config?.url);
      console.error('[Invoice] Request method:', error.config?.method);

      const errorStatus = error.response?.status;

      // FALLBACK: If backend is unreachable (5xx), save offline instead
      if (errorStatus >= 500 || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
        console.log('[Invoice] Backend unreachable, falling back to offline save...');
        toast.warning('⚠️ Server unavailable - saving locally...', { autoClose: 3000 });

        try {
          // Prepare invoice data (same as online path)
          const invoiceData = {
            customer_id: selectedCustomer.customer_id || selectedCustomer.id,
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            items: invoice.items.map(item => ({
              product_id: item.product_id,
              batch_id: item.batch_id,
              quantity: parseFloat(item.quantity) || 0,
              free_quantity: parseFloat(item.free_quantity) || 0,
              unit_price: parseFloat(item.unit_price || item.sale_price || item.rate) || 0,
              mrp: parseFloat(item.mrp) || 0,
              discount_percent: parseFloat(item.discount_percent) || 0,
              gst_percent: parseFloat(item.gst_percent) || 0
            })),
            discount_type: invoice.discount_type || 'percentage',
            discount_percent: parseFloat(invoice.discount_percent) || 0,
            discount_amount: parseFloat(invoice.discount_amount) || 0,
            freight_charges: parseFloat(invoice.freight_charges) || 0,
            delivery_type: invoice.delivery_type || 'PICKUP',
            payment_mode: invoice.payment_mode || 'cash',
            payment_status: invoice.payment_status || 'pending',
            payments: (invoice.payments || []).map(p => ({
              method: p.method,
              amount: parseFloat(p.amount) || 0
            })),
            billing_address: invoice.billing_address || '',
            shipping_address: invoice.shipping_address || '',
            notes: invoice.notes || '',
            gst_type: invoice.gst_type || 'CGST/SGST'
          };

          // Generate offline invoice number
          const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

          const offlineInvoice = {
            ...invoiceData,
            invoice_no: offlineInvoiceNo,
            temp_id: tempId,
            _localId: tempId,
            sync_status: 'pending',
            created_offline: true,
            fallback_reason: `Backend returned ${errorStatus}`
          };

          await offlineDB.add('invoices', offlineInvoice);
          await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice);

          toast.success('✅ Invoice saved locally - will sync when server is back', {
            autoClose: 5000,
            icon: '📱'
          });

          const createdData = {
            invoiceId: tempId,
            invoiceNumber: offlineInvoiceNo,
            customerName: selectedCustomer.customer_name || selectedCustomer.name,
            customerPhone: selectedCustomer.phone || selectedCustomer.primary_phone || '',
            customerEmail: selectedCustomer.email || '',
            totalAmount: invoiceData.total_amount,
            items: invoice.items,
            isOffline: true
          };

          setCreatedInvoiceData(createdData);
          setShowSuccessModal(true);
          localStorage.removeItem('invoice_draft');
          return;
        } catch (offlineError) {
          console.error('[Invoice] Offline fallback also failed:', offlineError);
          setError('Failed to save both online and offline');
          toast.error('❌ Save failed - please try again');
        }
      } else if (errorStatus === 409 && error.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
        // Stock conflict
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