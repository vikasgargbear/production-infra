import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Search, Package, Calendar, X, AlertCircle, CheckCircle, 
  RotateCcw, FileText, Building2, ChevronRight, Save, Printer, History, Truck
} from 'lucide-react';
import { 
  SupplierSearch, ProductSearchSimple, ModuleHeader,
  DatePicker, Select, NumberInput, NotesSection, useToast, PurchaseSearch, ViewHistoryButton,
  ProceedToReviewComponent
} from '../global';
import { returnsApi, purchasesApi, suppliersApi, settingsApi, metadataApi } from '../../services/api';
import PurchaseInvoiceSelector from './components/PurchaseInvoiceSelector';
import SupplierInvoiceSelector from './components/SupplierInvoiceSelector';
import ReturnItemsTable from './components/ReturnItemsTable';
import DebitNotePreview from './components/DebitNotePreview';
import offlineStorage from '../../services/offlineStorage';

const PurchaseReturnFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const purchaseSearchRef = useRef(null);
  const firstInputRef = useRef(null);
  const historyButtonRef = useRef(null);

  // Return data state
  const [returnData, setReturnData] = useState({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    supplier_details: null,
    supplier_invoice_id: '',
    purchase_id: '', // Keep for backward compatibility
    purchase_invoice_no: '',
    purchase_date: '',
    original_purchase: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    debit_note_no: '',
    status: 'PENDING',
    transport_details: {
      transport_mode: '',
      vehicle_no: '',
      transporter_name: '',
      lr_no: ''
    }
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnablePurchases, setReturnablePurchases] = useState([]);
  const [returnableInvoices, setReturnableInvoices] = useState([]);
  const [returnReasons, setReturnReasons] = useState([]);

  // Keyboard shortcuts - Enterprise patterns
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + Key combinations
      if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
          case 'r':
            e.preventDefault();
            if (supplierSearchRef.current) {
              supplierSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (purchaseSearchRef.current) {
              purchaseSearchRef.current.focus();
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 1) {
              handleProceedToReview();
            } else if (currentStep === 2) {
              handleSaveReturn();
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
      
      // Escape to close or go back
      if (e.key === 'Escape') {
        if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Load return reasons from metadata API
  useEffect(() => {
    const loadReturnReasons = async () => {
      try {
        // Get return reasons from metadata API
        const response = await metadataApi.getReturnReasons();
        const returnReasons = response.data?.purchase_return_reasons || [];
        
        if (Array.isArray(returnReasons) && returnReasons.length > 0) {
          setReturnReasons(returnReasons);
          // Cache for offline use
          await offlineStorage.storeOffline('purchase_return_reasons', returnReasons, { persistent: true });
        } else {
          throw new Error('No return reasons found in metadata');
        }
        
      } catch (error) {
        console.warn('Could not load return reasons from backend:', error.message);
        
        // Try offline cache first
        try {
          const cached = await offlineStorage.getOffline('purchase_return_reasons', { persistent: true });
          if (cached && cached.data && Array.isArray(cached.data)) {
            setReturnReasons(cached.data);
            return;
          }
        } catch (cacheError) {
          console.warn('No cached return reasons available');
        }
        
        // Ultimate fallback to hardcoded values
        setReturnReasons([
          { value: 'EXPIRED', label: 'Expired Product' },
          { value: 'DAMAGED', label: 'Damaged/Defective Product' },
          { value: 'WRONG_PRODUCT', label: 'Wrong Product Received' },
          { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
          { value: 'EXCESS_ORDER', label: 'Excess Order' },
          { value: 'NEAR_EXPIRY', label: 'Near Expiry' },
          { value: 'RATE_DISPUTE', label: 'Rate Dispute' },
          { value: 'SCHEME_ISSUE', label: 'Scheme/Discount Issue' },
          { value: 'SUPPLIER_ISSUE', label: 'Supplier Issue' },
          { value: 'OTHER', label: 'Other' }
        ]);
      }
    };

    loadReturnReasons();
  }, []);

  // Generate return number with consistent format
  const generateReturnNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PR-${dateStr}${randomNum}`; // Format: PR-YYMMDD#### (Purchase Return)
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
            if (supplierSearchRef.current) {
              supplierSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (purchaseSearchRef.current) {
              purchaseSearchRef.current.focus();
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
      
      // Escape to go back or close - Enterprise pattern
      if (e.key === 'Escape') {
        if (currentStep === 2) setCurrentStep(1);
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

  // Handle supplier selection - comprehensive like sales return
  const handleSupplierSelect = async (supplier) => {
    // Handle supplier clear/removal
    if (!supplier) {
      setSelectedSupplier(null);
      setSelectedInvoice(null);
      setReturnData(prev => ({
        ...prev,
        supplier_id: '',
        supplier_details: null,
        supplier_invoice_id: '',
        items: []
      }));
      return;
    }
    
    // Ensure supplier has all needed fields - comprehensive mapping
    const fullSupplier = {
      ...supplier,
      supplier_name: supplier.supplier_name || supplier.name,
      address: supplier.address || supplier.billing_address || supplier.street_address || '',
      city: supplier.city || supplier.billing_city || '',
      state: supplier.state || supplier.billing_state || '',
      pincode: supplier.pincode || supplier.postal_code || supplier.zip || '',
      phone: supplier.phone || supplier.mobile || supplier.contact_phone || '',
      mobile: supplier.mobile || supplier.phone || '',
      email: supplier.email || supplier.contact_email || '',
      contact_person: supplier.contact_person || supplier.contact_name || '',
      gst_number: supplier.gst_number || supplier.gstin || supplier.gst || '',
      drug_license_number: supplier.drug_license_number || supplier.drug_license || '',
      payment_terms: supplier.payment_terms || supplier.credit_days || 0
    };
    
    setSelectedSupplier(fullSupplier);
    setSelectedInvoice(null); // Reset invoice selection
    const supplierId = supplier.supplier_id || supplier.id || supplier.party_id;
    
    setReturnData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_details: fullSupplier,
      supplier_invoice_id: '',
      items: []
    }));

    // Fetch returnable supplier invoices for this supplier
    try {
      setLoading(true);
      const response = await purchasesApi.getReturnableInvoices({ 
        supplier_id: supplierId
      });
      setReturnableInvoices(response.data?.invoices || []);
    } catch (error) {
      toast.error('Failed to fetch supplier invoices: ' + (error.response?.data?.detail || error.message));
      console.error('Error fetching supplier invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle supplier invoice selection - smooth like sales return
  const handleInvoiceSelect = async (invoice) => {
    if (!invoice) return;
    
    setSelectedInvoice(invoice);
    const invoiceId = invoice.supplier_invoice_id || invoice.invoice_id;
    
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: invoiceId,
      purchase_invoice_no: invoice.supplier_invoice_number || invoice.invoice_number,
      purchase_date: invoice.invoice_date,
      original_purchase: invoice
    }));

    // Fetch returnable items from supplier invoice
    try {
      setLoading(true);
      const response = await returnsApi.getSupplierInvoiceReturnableItems(invoiceId);
      
      if (response.data.items) {
        const processedItems = response.data.items.map(item => {
          // Use values from backend directly - backend now sends both field names for compatibility
          const totalQty = parseFloat(item.invoice_quantity || item.quantity || 0);
          const freeQty = parseFloat(item.free_quantity || 0);
          const paidQty = parseFloat(item.paid_quantity !== undefined ? item.paid_quantity : (totalQty - freeQty));
          
          return {
            ...item,
            id: item.invoice_item_id || item.id,
            invoice_item_id: item.invoice_item_id,
            return_quantity: 0, // Start with 0, let user choose
            return_reason: '',
            selected: false, // Don't pre-select
            restock: true, // Default to restock
            // Backend now sends both 'rate' and 'unit_price' for compatibility
            rate: parseFloat(item.rate || item.unit_price || item.purchase_price || 0),
            purchase_price: parseFloat(item.rate || item.unit_price || item.purchase_price || 0),
            tax_percent: parseFloat(item.tax_percent || item.gst_percent || 18),
            discount_percent: parseFloat(item.discount_percent || 0),
            max_returnable_qty: parseFloat(item.returnable_quantity || item.max_returnable_qty || totalQty),
            quantity: totalQty,
            free_quantity: freeQty,
            paid_quantity: paidQty,
            batch_id: item.batch_id,
            batch_number: item.batch_number || item.batch_no,
            batch_no: item.batch_number || item.batch_no, // Add batch_no for compatibility
            product_name: item.product_name,
            product_id: item.product_id,
            hsn_code: item.hsn_code,
            unit: item.unit || 'PCS'
          };
        });
        
        setReturnData(prev => ({
          ...prev,
          items: processedItems
        }));
        
        // Calculate totals immediately
        let subtotal = 0;
        let taxAmount = 0;
        processedItems.forEach(item => {
          if (item.selected && item.return_quantity > 0) {
            const itemTotal = item.return_quantity * item.rate;
            const itemTax = itemTotal * (item.tax_percent / 100);
            subtotal += itemTotal;
            taxAmount += itemTax;
          }
        });
        
        setReturnData(prev => ({
          ...prev,
          subtotal_amount: subtotal,
          tax_amount: taxAmount,
          total_amount: subtotal + taxAmount
        }));
      }
    } catch (error) {
      toast.error('Failed to fetch invoice items: ' + (error.response?.data?.detail || error.message));
      console.error('Error fetching invoice items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle purchase selection (keep for backward compatibility)
  const handlePurchaseSelect = async (purchase) => {
    setSelectedPurchase(purchase);
    setReturnData(prev => ({
      ...prev,
      purchase_id: purchase.purchase_id,
      purchase_invoice_no: purchase.invoice_number,
      purchase_date: purchase.invoice_date,
      original_purchase: purchase
    }));

    // Fetch purchase items separately
    try {
      setLoading(true);
      const response = await returnsApi.getPurchaseItems(purchase.purchase_id);
      
      if (response.data.items) {
        setReturnData(prev => ({
          ...prev,
          items: response.data.items.map(item => {
            // Use backend data directly
            const totalQty = parseFloat(item.quantity || 0);
            const freeQty = parseFloat(item.free_quantity || 0);
            
            // If backend has paid_quantity, use it directly
            let paidQty;
            if (item.paid_quantity !== undefined && item.paid_quantity !== null) {
              paidQty = Math.max(0, parseFloat(item.paid_quantity));
            } else {
              // Calculate but ensure it's never negative
              paidQty = Math.max(0, totalQty - freeQty);
            }
            
            // Handle data inconsistency
            if (freeQty > totalQty) {
              console.warn(`Data inconsistency: free_quantity (${freeQty}) > total quantity (${totalQty})`);
              paidQty = 0;
            }
            
            // Calculate max returnable
            const returnedQty = parseFloat(item.returned_quantity || 0);
            const maxReturnablePaid = Math.max(0, paidQty - returnedQty);
            const maxReturnableTotal = Math.max(0, totalQty - returnedQty);
            
            return {
              ...item,
              id: item.purchase_item_id, // Normalize ID for ReturnItemsTable compatibility
              // Quantities
              quantity: totalQty,
              paid_quantity: paidQty,
              free_quantity: freeQty,
              // Return settings
              return_quantity: 0,
              max_returnable_qty: maxReturnableTotal,
              max_returnable_paid: maxReturnablePaid,
              return_reason: '',
              selected: false
            };
          })
        }));
      }
    } catch (error) {
      toast.error('Failed to fetch purchase items');
      console.error('Error fetching purchase items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update return item
  // Update return item - handle both index and id based updates
  const updateReturnItem = (indexOrId, field, value) => {
    // For returns, we want to update return_quantity when quantity is changed
    const actualField = (field === 'quantity') ? 'return_quantity' : field;
    
    setReturnData(prev => ({
      ...prev,
      items: prev.items.map((item, index) => {
        // Check if it's an index (number) or id match
        if (index === indexOrId || item.id === indexOrId) {
          return { ...item, [actualField]: value };
        }
        return item;
      })
    }));
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const returnQty = parseFloat(item.return_quantity) || 0;
        const rate = parseFloat(item.rate || item.purchase_price || item.unit_price) || 0;
        const discountPercent = parseFloat(item.discount_percent) || 0;
        
        const baseAmount = returnQty * rate;
        const discountAmount = (baseAmount * discountPercent) / 100;
        const afterDiscount = baseAmount - discountAmount;
        
        const taxPercent = parseFloat(item.tax_percent) || 0;
        const itemTax = (afterDiscount * taxPercent) / 100;
        
        console.log('Return calculation:', {
          product: item.product_name,
          returnQty,
          rate,
          baseAmount,
          discountAmount,
          afterDiscount,
          taxPercent,
          itemTax
        });
        
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
  }, [returnData.items]);

  // Validate return
  const validateReturn = () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return false;
    }

    if (!selectedPurchase) {
      toast.error('Please select a purchase invoice');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => 
      item.selected && item.return_quantity > 0
    );

    if (!hasSelectedItems) {
      toast.error('Please select items to return');
      return false;
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    // Validate quantities
    for (const item of returnData.items) {
      if (item.selected && item.return_quantity > item.max_returnable_qty) {
        toast.error(`Return quantity exceeds available quantity for ${item.product_name}`);
        return false;
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
        supplier_invoice_id: returnData.supplier_invoice_id,
        items: returnData.items
          .filter(item => item.selected && item.return_quantity > 0)
          .map(item => ({
            invoice_item_id: item.invoice_item_id || item.id,
            product_id: item.product_id,
            batch_id: item.batch_id,
            batch_number: item.batch_number,
            quantity: item.return_quantity,
            return_quantity: item.return_quantity,
            unit_price: item.unit_price || item.rate,
            discount_percent: item.discount_percent || 0,
            tax_percent: item.tax_percent,
            return_reason: item.return_reason || returnData.return_reason,
            selected: true,
            restock: item.restock !== false
          }))
      };

      const response = await returnsApi.createPurchaseReturn(returnPayload);
      
      toast.success('Purchase return created successfully');
      
      // Reset form or close
      setTimeout(() => {
        onClose();
      }, 1500);
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
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Purchase Return"
            documentNumber={returnData.return_no}
            status="draft"
            icon={RotateCcw}
            iconColor="text-orange-600"
            onClose={onClose}
            historyType="return"
          />

          {/* Quick Actions Bar */}
          <div className="bg-blue-50 px-4 py-2 text-sm text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+R</strong> - Search Supplier | <strong>Ctrl+I</strong> - Search Purchase | <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Return Date */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <div className="flex justify-end">
                  <div className="w-64">
                    <DatePicker
                      value={returnData.return_date}
                      onChange={(date) => setReturnData(prev => ({ ...prev, return_date: date }))}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Supplier Selection */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-blue-700 mb-2 flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    Select Supplier
                  </h3>
                  {!selectedSupplier ? (
                    <SupplierSearch
                      ref={supplierSearchRef}
                      onSupplierSelect={handleSupplierSelect}
                      placeholder="Search supplier by name, phone..."
                      className="w-full"
                    />
                  ) : (
                    <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{selectedSupplier.supplier_name}</h4>
                        <p className="text-sm text-gray-600">{selectedSupplier.phone}</p>
                        <p className="text-sm text-gray-600">{selectedSupplier.address}</p>
                        {selectedSupplier.gst_number && (
                          <p className="text-sm text-gray-600">GSTIN: {selectedSupplier.gst_number}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSupplier(null);
                          setSelectedPurchase(null);
                          setReturnData(prev => ({
                            ...prev,
                            supplier_id: '',
                            supplier_details: null,
                            purchase_id: '',
                            items: []
                          }));
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Supplier Invoice Selection */}
                {selectedSupplier && (
                  <div>
                    <h3 className="text-sm font-medium text-blue-700 mb-2 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Select Supplier Invoice
                    </h3>
                    {!selectedInvoice ? (
                      <SupplierInvoiceSelector
                        ref={purchaseSearchRef}
                        invoices={returnableInvoices}
                        onInvoiceSelect={handleInvoiceSelect}
                        loading={loading}
                      />
                    ) : (
                      <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Invoice #{selectedInvoice.supplier_invoice_number || selectedInvoice.invoice_number}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: ₹{selectedInvoice.total_amount || selectedInvoice.invoice_amount}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInvoice(null);
                            setReturnData(prev => ({
                              ...prev,
                              supplier_invoice_id: '',
                              purchase_id: '',
                              items: []
                            }));
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Return Reason - Moved Above Items */}
              {selectedInvoice && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                    Return Details
                  </h3>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-blue-700 mb-2">
                      Return Reason <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={returnData.return_reason}
                      onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value }))}
                      options={returnReasons}
                      placeholder="Select reason..."
                      size="lg"
                    />
                  </div>

                  {/* Transport Details */}
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Transport Details (Optional)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-blue-700 mb-1">
                          Transport Mode
                        </label>
                        <Select
                          value={returnData.transport_details.transport_mode}
                          onChange={(value) => setReturnData(prev => ({
                            ...prev,
                            transport_details: { ...prev.transport_details, transport_mode: value }
                          }))}
                          options={[
                            { value: 'ROAD', label: 'By Road' },
                            { value: 'RAIL', label: 'By Rail' },
                            { value: 'AIR', label: 'By Air' },
                            { value: 'COURIER', label: 'Courier' }
                          ]}
                          placeholder="Select mode..."
                          size="md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-blue-700 mb-1">
                          Vehicle Number
                        </label>
                        <input
                          type="text"
                          value={returnData.transport_details.vehicle_no}
                          onChange={(e) => setReturnData(prev => ({
                            ...prev,
                            transport_details: { ...prev.transport_details, vehicle_no: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          placeholder="e.g., MH12AB1234"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Return Items */}
              {selectedInvoice && returnData.items.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <Package className="w-5 h-5 mr-2 text-blue-600" />
                        Select Items to Return
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Check the items you want to return and specify quantities
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Select all items
                          returnData.items.forEach(item => {
                            updateReturnItem(item.id, 'selected', true);
                            updateReturnItem(item.id, 'return_quantity', item.max_returnable_qty);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-blue-50"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          // Deselect all items
                          returnData.items.forEach(item => {
                            updateReturnItem(item.id, 'selected', false);
                            updateReturnItem(item.id, 'return_quantity', 0);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-blue-50"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <ReturnItemsTable
                    items={returnData.items}
                    onUpdateItem={updateReturnItem}
                    includeGst={true}
                    showManualEntry={false}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer - Using Global Component */}
          <ProceedToReviewComponent
            currentStep={1}
            canProceed={selectedSupplier && selectedInvoice && returnData.items.some(item => item.selected && item.return_quantity > 0)}
            onBack={null}
            onProceed={handleProceedToReview}
            onReset={() => {
              setSelectedSupplier(null);
              setSelectedPurchase(null);
              setSelectedInvoice(null);
              setReturnData(prev => ({
                ...prev,
                supplier_id: '',
                supplier_details: null,
                supplier_invoice_id: '',
                purchase_id: '',
                items: [],
                return_reason: '',
                return_reason_notes: ''
              }));
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
          title="Review Purchase Return"
          subtitle="Confirm and generate debit note"
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
            <DebitNotePreview
              returnData={returnData}
              supplier={selectedSupplier}
              purchase={selectedPurchase}
            />
            
            {/* Notes Section */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-blue-200 p-6">
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
          proceedText="Generate Debit Note"
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
    </div>
  );
};

export default PurchaseReturnFlow;