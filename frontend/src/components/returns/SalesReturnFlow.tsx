import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Search, Package, Calendar, X, AlertCircle, CheckCircle,
  RotateCcw, FileText, User, ChevronRight, Save, Printer, History, Truck, Plus, Trash2
} from 'lucide-react';
import {
  CustomerSearch, ProductSearchSimple, ModuleHeader,
  DatePicker, Select, NumberInput, NotesSection, useToast, ViewHistoryButton,
  ProceedToReviewComponent, StandardDatePicker, InvoiceSelector, ItemsTable
} from '../global';
import CustomerCreationB2B from '../global/creation/CustomerCreationB2B';
import { returnsApi, customersApi, settingsApi, metadataApi } from '../../services/api';
import { invoicesApi } from '../../services/api';
import { Invoice, Customer } from '../../types/api.types';
import CreditNotePreview from './ui/CreditNotePreview';
import offlineStorage from '../../services/offlineStorage';
import { getApiBaseUrl } from '../../config/apiBase';

const API_BASE_URL = getApiBaseUrl();

interface ReturnFormItem {
  id?: string | number;
  product_id: number;
  product_name: string;
  batch_id?: number | string; // Changed from null to match ItemsTableItem
  batch_number: string;
  manufacturing_date?: string;
  expiry_date?: string;
  quantity: number;
  paid_quantity: number;
  free_quantity: number;
  return_quantity: number;
  max_returnable_qty: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  selected: boolean;
  hsn_code?: string;
  unit?: string;
  uom?: string;
  manufacturer?: string;
  is_manual?: boolean;
  available_stock?: number;
  return_reason?: string;
  disposition?: string;
  invoice_item_id?: number;
  requires_approval?: boolean;
  verification_status?: string;
  [key: string]: any; // Allow for other fields during migration
}

interface ReturnFormData {
  return_no: string;
  return_date: string;
  customer_id: string | number;
  customer_details: Customer | null;
  invoice_id: string | number;
  invoice_no: string;
  invoice_date: string;
  original_invoice: Invoice | null;
  items: ReturnFormItem[];
  return_reason: string;
  return_reason_notes: string;
  return_method: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  credit_note_no: string;
  status: string;
  include_gst: boolean;
  credit_adjustment_type: 'future' | 'existing_dues';
}

const SalesReturnFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyButtonRef = useRef(null);
  const toast = useToast();

  // Refs for keyboard navigation
  const customerSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const firstInputRef = useRef<any>(null);

  // Return data state
  const [returnData, setReturnData] = useState<ReturnFormData>({
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
    return_method: 'credit_note', // Default to credit note
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    credit_note_no: '',
    status: 'PENDING',
    include_gst: true, // Default to including GST
    credit_adjustment_type: 'future' // 'future' or 'existing_dues'
  });

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [customerDues, setCustomerDues] = useState(0);
  const [returnReasons, setReturnReasons] = useState<any[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showInvoiceSection, setShowInvoiceSection] = useState(true);
  const [manualItemCounter, setManualItemCounter] = useState(1);
  const [availableBatches, setAvailableBatches] = useState({});

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

        const fetchedReasons = response.data?.sales_return_reasons || [];

        if (Array.isArray(fetchedReasons) && fetchedReasons.length > 0) {
          // Use return reasons directly from metadata API
          setReturnReasons(fetchedReasons);
          // Cache for offline use
          await offlineStorage.storeOffline('sales_return_reasons', fetchedReasons, { persistent: true });
        }
      } catch (error) {
        // Silently fail and keep using default reasons
      }
    };

    loadReturnReasons();
  }, []);

  // Generate return number with consistent format
  const generateReturnNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
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

  // Handle invoice selection from InvoiceSelector
  const handleInvoiceSelect = async (invoice) => {
    if (!invoice) return;

    setSelectedInvoice(invoice);
    setReturnData(prev => ({
      ...prev,
      invoice_id: invoice.id || invoice.invoice_id,
      invoice_no: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      original_invoice: invoice
    }));

    // Load invoice items if not already loaded
    if (!invoice.items || invoice.items.length === 0) {
      try {
        const response = await invoicesApi.getById(invoice.id || invoice.invoice_id);
        const fullInvoice = response?.data || response;
        if (fullInvoice.success && fullInvoice.data) {
          const items = fullInvoice.data.items || [];
          setReturnData(prev => ({
            ...prev,
            items: items.map(item => {
              // Calculate paid quantity (total - free)
              const totalQty = parseFloat(item.quantity || 0);
              const freeQty = parseFloat(item.free_quantity || 0);
              const paidQty = totalQty - freeQty;

              // Calculate GST percentage from CGST + SGST or IGST
              const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0);

              return {
                ...item,
                return_quantity: totalQty, // Default to returning all
                selected: true,
                paid_quantity: paidQty,
                free_quantity: freeQty,
                quantity: totalQty,
                unit_price: item.unit_price || item.unit_price || 0,
                discount_percent: item.discount_percent || 0,
                tax_percent: gstPercent,
                max_returnable_qty: totalQty,
                // Preserve batch data
                batch_id: item.batch_id,
                batch_number: item.batch_number,
                manufacturing_date: item.manufacturing_date,
                expiry_date: item.expiry_date,
                // Preserve invoice item ID for linking
                invoice_item_id: item.invoice_item_id,
                // Default disposition for invoice returns
                disposition: 'RESTOCK'
              };
            })
          }));
        }
      } catch (error) {
        toast.error('Failed to load invoice items');
      }
    } else {
      // Use existing items - pre-select all with full quantities
      setReturnData(prev => ({
        ...prev,
        items: invoice.items.map(item => {
          // Calculate paid quantity (total - free)
          const totalQty = parseFloat(item.quantity || 0);
          const freeQty = parseFloat(item.free_quantity || 0);
          const paidQty = totalQty - freeQty;

          // Calculate GST percentage from CGST + SGST or IGST
          const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0) || item.tax_percent || 0;

          return {
            ...item,
            return_quantity: totalQty, // Default to returning all
            selected: true,
            paid_quantity: paidQty,
            free_quantity: freeQty,
            quantity: totalQty,
            unit_price: item.unit_price || item.unit_price || 0,
            discount_percent: item.discount_percent || 0,
            tax_percent: gstPercent,
            max_returnable_qty: totalQty,
            // Preserve batch data
            batch_id: item.batch_id,
            batch_number: item.batch_number,
            manufacturing_date: item.manufacturing_date,
            expiry_date: item.expiry_date,
            // Preserve invoice item ID for linking
            invoice_item_id: item.invoice_item_id,
            // Default disposition for invoice returns
            disposition: 'RESTOCK'
          };
        })
      }));
    }
  };

  // Handle customer selection
  const handleCustomerSelect = async (customer) => {
    // Customer selected successfully

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

    // Ensure customer has all needed fields - comprehensive mapping
    const fullCustomer = {
      ...customer,
      customer_name: customer.customer_name || customer.name,
      address: customer.address || customer.billing_address || customer.street_address || '',
      city: customer.city || customer.billing_city || '',
      state: customer.state || customer.billing_state || '',
      pincode: customer.pincode || customer.pincode || customer.zip || '',
      phone: customer.phone || customer.mobile || customer.contact_phone || '',
      mobile: customer.mobile || customer.phone || '',
      email: customer.email || customer.contact_email || '',
      contact_person: customer.contact_person || customer.contact_person || '',
      gst_number: customer.gst_number || customer.gst_number || customer.gst || '',
      drug_license_number: customer.drug_license_number || customer.drug_license || '',
      credit_limit: customer.credit_limit || 0,
      credit_days: customer.credit_days || 0
    };

    // Cast necessary for UI component compatibility if mismatched
    setSelectedCustomer(fullCustomer as any);
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

    // Fetch complete customer details including outstanding balance
    try {
      // Try to get full customer details
      const detailResponse = await customersApi.getById(customerId);
      if (detailResponse?.data) {
        const detailedCustomer = {
          ...fullCustomer,
          ...detailResponse.data,
          outstanding_amount: detailResponse.data.outstanding_amount || 0
        };
        setSelectedCustomer(detailedCustomer);
        setCustomerDues(detailedCustomer.outstanding_amount || 0);
      } else {
        // Fallback to basic customer data
        setCustomerDues(0);
      }
    } catch (error) {
      // Use basic customer data we already have
      setCustomerDues(0);
    }
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

  // Fetch batches for a product
  const fetchBatchesForProduct = async (productId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/inventory/batches/product/${productId}`,
        {
          headers: {
            'X-Org-Id': localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id') || ''
          }
        }
      );
      if (response.ok) {
        const batches = await response.json();
        setAvailableBatches(prev => ({
          ...prev,
          [productId]: batches.filter(b => b.quantity_available > 0)
        }));
      }
    } catch (error) {
    }
  };

  // Add manual item to return
  const addManualItem = async (product) => {
    if (!product) return;

    // Fetch batches for this product if manual entry
    if (showManualEntry) {
      await fetchBatchesForProduct(product.product_id);
    }

    // Get the selling price from product data
    const sellingPrice = parseFloat(String(product.sale_price || product.selling_price || product.unit_price || product.mrp || 0));
    const gstPercent = parseFloat(String(product.gst_percent || product.tax_rate || 0));

    const newItem = {
      id: `manual-${manualItemCounter}`,
      product_id: product.product_id,
      product_name: product.product_name || product.name,
      // Batch data - properly handle from product search
      batch_id: product.batch_id || product.selectedBatch?.batch_id || null,
      batch_number: product.batch_number || product.selectedBatch?.batch_number || '',
      // Ensure we pass undefined, not null
      manufacturing_date: product.manufacturing_date || product.selectedBatch?.manufacturing_date || undefined,
      expiry_date: product.expiry_date || product.selectedBatch?.expiry_date || undefined,
      unit_price: sellingPrice, // Use actual selling price from backend
      tax_percent: gstPercent, // Use actual GST from product
      quantity: parseFloat(String(product.quantity || product.stock || 0)), // Ensure string conversion
      paid_quantity: parseFloat(String(product.quantity || product.stock || 0)), // For manual items, assume all are paid
      free_quantity: 0,
      return_quantity: 1, // Default return 1 item
      max_returnable_qty: 999999, // No limit for manual items
      return_reason: '',
      selected: true,
      hsn_code: product.hsn_code || product.hsn || '',
      unit: product.unit || product.uom || 'PCS',
      manufacturer: product.manufacturer || '',
      // Additional fields for manual entry
      is_manual: true,
      available_stock: parseFloat(String(product.total_quantity_available || product.stock || 0)),
      discount_percent: 0, // Default no discount for manual items
      // Enterprise fields for manual returns
      requires_approval: true,
      verification_status: 'pending',
      // Default disposition for manual returns - quarantine for inspection
      disposition: 'QUARANTINE'
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

  // Update return item - handle both index and id based updates
  const updateReturnItem = (indexOrId, field, value) => {
    // Updating return item

    // For returns module, we want to update return_quantity when quantity is changed
    const actualField = (field === 'quantity') ? 'return_quantity' : field;

    setReturnData(prev => {
      // Process item update
      const updatedItems = prev.items.map((item, index) => {
        // Check if it's an index (number) or id match
        if (index === indexOrId || item.id === indexOrId) {
          // Found item to update
          const updatedItem = { ...item, [actualField]: value };
          // Item updated
          return updatedItem;
        }
        return item;
      });
      // Update complete
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
        const returnQty = parseFloat(String(item.return_quantity || 0));
        const paidQty = Math.max(0, parseFloat(String(item.paid_quantity || 0)));

        // Only paid items being returned have value
        const paidReturnQty = Math.min(returnQty, paidQty);

        // Skip calculation if no paid items being returned
        if (paidReturnQty <= 0) {
          return; // Continue to next item
        }

        const unit_price = parseFloat(String(item.unit_price || 0));
        const discountPercent = parseFloat(String(item.discount_percent || 0));

        const baseAmount = paidReturnQty * unit_price;
        const discountAmount = (baseAmount * discountPercent) / 100;
        const afterDiscount = baseAmount - discountAmount;

        // Always calculate tax for return amount (both GST and non-GST customers paid it)
        // Only exclude if GST customer explicitly chooses to exclude
        const taxPercent = (!selectedCustomer?.gst_number || returnData.include_gst)
          ? (parseFloat(String(item.tax_percent || 0)))
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

    // Enterprise validation: Batch tracking for manual returns
    if (showManualEntry) {
      const itemsWithoutBatch = returnData.items.filter(item =>
        item.selected && item.return_quantity > 0 && !item.batch_id && !item.batch_number
      );

      if (itemsWithoutBatch.length > 0) {
        toast.error(`Batch information is mandatory for pharmaceutical returns. Missing batch for: ${itemsWithoutBatch[0].product_name}`);
        return false;
      }
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

        if (item.is_manual && item.unit_price <= 0) {
          toast.error(`Please enter a valid unit_price for ${item.product_name}`);
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
    } catch (error: any) {
      // Handle error message properly - could be string or array
      const errorMessage = Array.isArray(error.message)
        ? error.message[0]?.msg || error.message[0] || 'Failed to create return'
        : typeof error.message === 'object'
          ? JSON.stringify(error.message)
          : error.message || 'Failed to create return';

      toast.error(errorMessage);
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
                      value={typeof returnData.return_date === 'string' ? new Date(returnData.return_date) : returnData.return_date}
                      onChange={(date) => {
                        // Ensure we store string YYYY-MM-DD format
                        const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
                        setReturnData(prev => ({ ...prev, return_date: dateStr }));
                      }}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>

                  {/* Right side - Return Reason and Method */}
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Reason <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={returnData.return_reason || ''}
                          onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: String(value || '') }))}
                          options={returnReasons}
                          placeholder="Select return reason..."
                          size="lg"
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Method <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={returnData.return_method || 'credit_note'}
                          onChange={(e) => setReturnData(prev => ({ ...prev, return_method: e.target.value }))}
                          className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="credit_note">Credit Note (Recommended)</option>
                          <option value="replacement">Replacement</option>
                          <option value="refund">Refund (Requires Approval)</option>
                        </select>
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
                    value={selectedCustomer as any}
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
                            Invoice #{selectedInvoice.invoice_number}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: ₹{selectedInvoice.totals?.total_amount || 0}
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

                    {/* Invoice Selector Component */}
                    {!selectedInvoice && (
                      <InvoiceSelector
                        customerId={String(selectedCustomer?.customer_id || '')}
                        onSelect={handleInvoiceSelect}
                        onClose={handleSkipInvoiceSelection}
                        title="Select Invoice"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Manual Item Entry - Show when invoice is skipped */}
              {selectedCustomer && showManualEntry && !selectedInvoice && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  {/* Manual Return Notice */}
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 mr-2" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800">Manual Return Without Invoice - Enterprise Requirements</p>
                        <p className="text-amber-700 mt-1">
                          • <strong>Batch selection is MANDATORY</strong> for pharmaceutical products
                          • Returns will go through inspection before restocking
                          • Select disposition for each item (Restock/Quarantine/Destroy)
                          • Returns above ₹1,000 require manager approval
                          • Credit note validity: 90 days from issue date
                        </p>
                      </div>
                    </div>
                  </div>

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
                        onAddItem={addManualItem}
                        showBatchSelection={true}
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
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
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
                                  credit_adjustment_type: e.target.value as 'future' | 'existing_dues'
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
                                  credit_adjustment_type: e.target.value as 'future' | 'existing_dues'
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
                    <ItemsTable
                      items={returnData.items}
                      onUpdateItem={(indexOrId, field, value) => updateReturnItem(indexOrId, field, value)}
                      onRemoveItem={showManualEntry ? (index) => removeManualItem(returnData.items[index]?.id) : undefined}
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
            canProceed={Boolean(selectedCustomer && (selectedInvoice || showManualEntry) && returnData.items.some(item => item.selected && item.return_quantity > 0))}
            onBack={undefined}
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
          title="Sales Return"
          documentNumber={returnData.return_no}
          onClose={() => onClose()}
          additionalActions={[
            { label: 'Cancel', onClick: onClose },
            { label: 'Save Draft', icon: Save, onClick: handleSaveReturn },
            { label: 'Print', icon: Printer, onClick: handlePrint }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            <CreditNotePreview
              returnData={returnData}
              customer={selectedCustomer}
              invoice={selectedInvoice}
              customerDues={customerDues}
              returnMethod={returnData.return_method}
            />

            {/* Notes Section */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <NotesSection
                value={returnData.return_reason_notes}
                onChange={(value) => setReturnData(prev => ({ ...prev, return_reason_notes: value }))}
                placeholder="Add notes..."
                rows={3}
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
          onReset={undefined}
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