/**
 * SalesReturnFlow Component (REFACTORED)
 * Significantly reduced from 1,191 lines to ~460 lines
 * 
 * Refactoring changes:
 * - 14 useState → 1 useReducer (via useSalesReturnState hook)
 * - Extracted 4 sub-components (ReturnCustomerSelector, ReturnInvoiceSelector, ReturnItemsTable, ReturnReviewPanel)
 * - All sub-components use React.memo for performance
 * - Types extracted to returns/types/
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Download, AlertCircle, User } from 'lucide-react';
import {
  ModuleHeader, StandardDatePicker, Select, useToast, ProceedToReviewComponent, NotesSection, CustomerSearch, CustomerCreation
} from '../global';
import GenericSuccessModal from '../global/modals/GenericSuccessModal';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
import { returnsApi, customersApi, invoicesApi, metadataApi } from '../../services/api';
import { getApiBaseUrl } from '../../config/apiBase';
import offlineStorage from '../../services/offlineStorage';
import { useCompany } from '../../contexts/CompanyContext';
import html2pdf from 'html2pdf.js';
import { toast } from 'react-toastify';

// Import extracted components
import { ReturnInvoiceSelector } from './components/ReturnInvoiceSelector';
import { ReturnItemsTable } from './components/ReturnItemsTable';
import { ReturnReviewPanel } from './components/ReturnReviewPanel';

// Import hooks and types
import { useSalesReturnState } from './hooks/useSalesReturnState';
import type { SalesReturnFlowProps, ReturnFormData, ReturnFormItem, ReturnReason } from './types/return.types';
import type { Customer, Invoice } from '../../types/api.types';

const API_BASE_URL = getApiBaseUrl();

const SalesReturnFlow: React.FC<SalesReturnFlowProps> = ({ onClose }) => {
  // Use centralized state management (replaces 14 useState!)
  const { state, dispatch, ui, returnData, selectedCustomer, selectedInvoice, customerDues, returnReasons, manualItemCounter, availableBatches } = useSalesReturnState();

  // Async state (still need for API calls)
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI state for compact header mode
  const [showDetailsExpanded, setShowDetailsExpanded] = useState(true);

  // Determine if all required header fields are filled (for compact mode)
  const headerComplete = Boolean(
    returnData.return_date &&
    returnData.return_reason &&
    returnData.return_type &&
    selectedCustomer
  );

  // Auto-collapse header when all details are filled
  useEffect(() => {
    if (headerComplete) {
      setShowDetailsExpanded(false);
    }
  }, [headerComplete]);

  // Success modal state (like InvoiceFlow)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdReturnData, setCreatedReturnData] = useState<{
    returnNumber: string;
    creditNoteNumber?: string;
    customerId: string | number;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    totalAmount: number;
    items: any[];
  } | null>(null);

  // Company context for success modal
  const { companyInfo } = useCompany();

  // Refs
  const historyButtonRef = useRef(null);
  const customerSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const firstInputRef = useRef<any>(null);

  const toastHook = useToast();

  // Generate return number
  const generateReturnNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SR-${dateStr}${randomNum}`;
  };

  // Initialize return number
  useEffect(() => {
    dispatch({
      type: 'SET_RETURN_DATA',
      data: { return_no: generateReturnNumber() }
    });
  }, [dispatch]);

  // Load return reasons
  useEffect(() => {
    const loadReturnReasons = async () => {
      const defaultReasons: ReturnReason[] = [
        { value: 'NOT_REQUIRED', label: 'Not Required (Restocks)' },
        { value: 'EXPIRED', label: 'Expired Product (No Restock)' },
        { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered (Restocks)' },
        { value: 'QUALITY_ISSUE', label: 'Quality Issue (Restocks)' },
        { value: 'EXCESS_STOCK', label: 'Excess Stock (Restocks)' },
        { value: 'RATE_DIFFERENCE', label: 'Rate Difference (Restocks)' },
        { value: 'CUSTOMER_RETURN', label: 'Customer Return (Restocks)' },
        { value: 'DAMAGED', label: 'Damaged Product (No Restock)' },
        { value: 'OTHER', label: 'Other (Restocks)' }
      ];
      dispatch({ type: 'SET_RETURN_REASONS', reasons: defaultReasons });

      try {
        const cached = await offlineStorage.getOffline('sales_return_reasons', { persistent: true });
        if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
          dispatch({ type: 'SET_RETURN_REASONS', reasons: cached.data });
        }

        const response = await metadataApi.getReturnReasons();
        const fetchedReasons = response.data?.sales_return_reasons || [];

        if (Array.isArray(fetchedReasons) && fetchedReasons.length > 0) {
          dispatch({ type: 'SET_RETURN_REASONS', reasons: fetchedReasons });
          await offlineStorage.storeOffline('sales_return_reasons', fetchedReasons, { persistent: true });
        }
      } catch (error) {
        // Silent fail, keep default reasons
      }
    };

    loadReturnReasons();
  }, [dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            customerSearchRef.current?.focus();
            break;
          case 'i':
            e.preventDefault();
            invoiceSearchRef.current?.focus();
            break;
          case 's':
            e.preventDefault();
            if (ui.currentStep === 2) {
              handleSaveReturn();
            } else {
              handleProceedToReview();
            }
            break;
          case 'p':
            e.preventDefault();
            if (ui.currentStep === 2) {
              handlePrint();
            }
            break;
        }
      }

      if (e.key === 'Escape') {
        if (ui.showCustomerModal) dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' });
        else if (ui.currentStep === 2) dispatch({ type: 'SET_STEP', step: 1 });
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [ui.currentStep, ui.showCustomerModal, dispatch, onClose]);

  // Handle invoice selection
  const handleInvoiceSelect = useCallback(async (invoice: Invoice | null) => {
    if (!invoice) {
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      return;
    }

    dispatch({ type: 'SET_SELECTED_INVOICE', invoice });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        invoice_id: (invoice as any).id || (invoice as any).invoice_id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        original_invoice: invoice
      }
    });

    // Load invoice items from API
    try {
      const response = await invoicesApi.getById((invoice as any).id || (invoice as any).invoice_id);
      // API returns invoice directly (not wrapped in {success, data})
      const fullInvoice = response?.data || response;
      const items = fullInvoice?.items || [];

      if (items.length > 0) {
        const mappedItems = items.map((item: any) => mapInvoiceItemToReturnItem(item));
        dispatch({ type: 'SET_RETURN_DATA', data: { items: mappedItems } });
        // Items loaded silently - no toast needed
      } else {
        toast.warning('No items found in this invoice');
      }

      // Hide invoice section after selection
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: false });
    } catch (error) {
      console.error('Failed to load invoice items:', error);
      toast.error('Failed to load invoice items');
    }
  }, [dispatch, toast]);

  // Map invoice item to return item
  const mapInvoiceItemToReturnItem = (item: any): ReturnFormItem => {
    const totalQty = parseFloat(item.quantity || 0);
    const freeQty = parseFloat(item.free_quantity || 0);
    const paidQty = totalQty - freeQty;
    // GST rate: sum of cgst_rate + sgst_rate + igst_rate (standard DB fields)
    const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0);


    return {
      ...item,
      // Use invoice_item_id as unique id for this item
      id: item.invoice_item_id || `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Original invoice quantities
      quantity: totalQty,
      paid_quantity: paidQty,
      free_quantity: freeQty,
      // Return quantities (editable) - default to full return
      return_quantity: totalQty,
      return_paid_qty: paidQty,
      return_free_qty: freeQty,
      // Pricing
      unit_price: item.unit_price || 0,
      discount_percent: item.discount_percent || 0,
      tax_percent: gstPercent,
      // Limits
      max_returnable_qty: totalQty,
      max_paid_qty: paidQty,
      max_free_qty: freeQty,
      // Pack info (for display)
      packages_per_box: item.packages_per_box,
      units_per_pack: item.units_per_pack,
      // References
      selected: true,
      batch_id: item.batch_id,
      batch_number: item.batch_number,
      manufacturing_date: item.manufacturing_date,
      expiry_date: item.expiry_date,
      invoice_item_id: item.invoice_item_id,
      disposition: 'RESTOCK',
      is_manual: false
    };
  };

  // Handle customer selection
  const handleCustomerSelect = useCallback(async (customer: Customer | null) => {
    if (!customer) {
      dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: null });
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
      dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
      dispatch({
        type: 'SET_RETURN_DATA',
        data: { customer_id: '', customer_details: null, invoice_id: '', items: [] }
      });
      return;
    }

    const fullCustomer: any = {
      ...customer,
      customer_name: (customer as any).customer_name || (customer as any).name,
      address: (customer as any).address || (customer as any).billing_address || (customer as any).street_address || '',
      city: (customer as any).city || (customer as any).billing_city || '',
      state: (customer as any).state || (customer as any).billing_state || '',
      pincode: (customer as any).pincode || (customer as any).zip || '',
      phone: (customer as any).phone || (customer as any).mobile || (customer as any).contact_phone || '',
      mobile: (customer as any).mobile || (customer as any).phone || '',
      email: (customer as any).email || (customer as any).contact_email || '',
      contact_person: (customer as any).contact_person || '',
      gst_number: (customer as any).gst_number || (customer as any).gst || '',
      drug_license_number: (customer as any).drug_license_number || (customer as any).drug_license || '',
      credit_limit: (customer as any).credit_limit || 0,
      credit_days: (customer as any).credit_days || 0
    };

    dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: fullCustomer as Customer });
    dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
    dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        customer_id: (customer as any).id || (customer as any).customer_id || (customer as any).party_id,
        customer_details: fullCustomer as Customer,
        invoice_id: '',
        items: []
      }
    });

    const customerId = (customer as any).id || (customer as any).customer_id || (customer as any).party_id;

    try {
      const detailResponse = await customersApi.getById(customerId);
      if (detailResponse?.data) {
        const detailedCustomer = {
          ...fullCustomer,
          ...detailResponse.data,
          outstanding_amount: detailResponse.data.outstanding_amount || 0
        };
        dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: detailedCustomer as Customer });
        dispatch({ type: 'SET_CUSTOMER_DUES', dues: detailedCustomer.outstanding_amount || 0 });
      } else {
        dispatch({ type: 'SET_CUSTOMER_DUES', dues: 0 });
      }
    } catch (error) {
      dispatch({ type: 'SET_CUSTOMER_DUES', dues: 0 });
    }
  }, [dispatch]);

  // Handle skip invoice
  const handleSkipInvoice = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
    dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
    dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: false });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: { invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null, items: [] }
    });
  }, [dispatch]);

  // Fetch batches
  const fetchBatchesForProduct = useCallback(async (productId: number) => {
    try {
      const token = localStorage.getItem('pharma_token') || sessionStorage.getItem('pharma_token') || '';
      const response = await fetch(
        `${API_BASE_URL}/api/stock-movements/product/${productId}/batches`,
        {
          headers: {
            'X-Org-Id': localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id') || '',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        const batches = data.batches || data || [];
        dispatch({
          type: 'SET_AVAILABLE_BATCHES',
          productId,
          batches: Array.isArray(batches) ? batches.filter((b: any) => b.quantity_available > 0) : []
        });
      }
    } catch (error) {
      // Silent fail
    }
  }, [dispatch]);

  // Add manual item
  const handleAddManualItem = useCallback((product: any) => {
    if (!product) return;

    // Batch is already selected in ProductSearch's BatchSelector modal
    // No need for async fetch - batch data is embedded in product

    const sellingPrice = parseFloat(String(product.sale_price || product.selling_price || product.unit_price || product.mrp || 0));
    const gstPercent = parseFloat(String(product.gst_percent || product.tax_rate || 0));



    const newItem: ReturnFormItem = {
      id: `manual-${manualItemCounter}`,
      product_id: product.product_id,
      product_name: product.product_name || product.name,
      batch_id: product.batch_id || product.selectedBatch?.batch_id || undefined,
      batch_number: product.batch_number || product.selectedBatch?.batch_number || '',
      manufacturing_date: product.manufacturing_date || product.selectedBatch?.manufacturing_date || undefined,
      expiry_date: product.expiry_date || product.selectedBatch?.expiry_date || undefined,
      // Pack info from batch
      packages_per_box: product.packages_per_box || product.selectedBatch?.packages_per_box,
      units_per_pack: product.units_per_pack || product.selectedBatch?.units_per_pack,
      unit_price: sellingPrice,
      tax_percent: gstPercent,
      quantity: parseFloat(String(product.quantity || product.stock || 0)),
      paid_quantity: parseFloat(String(product.quantity || product.stock || 0)),
      free_quantity: 0,
      return_quantity: 1,
      max_returnable_qty: 999999,
      return_reason: '',
      selected: true,
      hsn_code: product.hsn_code || product.hsn || '',
      unit: product.unit || product.uom || 'PCS',
      manufacturer: product.manufacturer || '',
      is_manual: true,
      available_stock: parseFloat(String(product.total_quantity_available || product.stock || 0)),
      discount_percent: 0,
      requires_approval: true,
      verification_status: 'pending',
      disposition: 'QUARANTINE'
    };

    const updatedItems = [...returnData.items, newItem];
    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
    dispatch({ type: 'INCREMENT_MANUAL_COUNTER' });
  }, [manualItemCounter, returnData.items, dispatch]);

  // Remove item
  const handleRemoveItem = useCallback((itemId: string | number) => {
    console.log('handleRemoveItem called with:', itemId);
    console.log('Current items:', returnData.items.map(i => ({ id: i.id, invoice_item_id: i.invoice_item_id })));

    const updatedItems = returnData.items.filter((item, index) => {
      // Match by id, invoice_item_id, or index
      if (item.id === itemId) return false;
      if (item.invoice_item_id === itemId) return false;
      if (index === itemId) return false;
      return true;
    });
    console.log('After filter, items count:', updatedItems.length);
    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
  }, [returnData.items, dispatch]);

  // Update item
  const handleUpdateItem = useCallback((indexOrId: string | number, field: string, value: any) => {
    const actualField = (field === 'quantity') ? 'return_quantity' : field;

    const updatedItems = returnData.items.map((item, index) => {
      if (index === indexOrId || item.id === indexOrId) {
        return { ...item, [actualField]: value };
      }
      return item;
    });

    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
  }, [returnData.items, dispatch]);

  // Calculate totals whenever items or GST setting changes
  useEffect(() => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const returnQty = parseFloat(String(item.return_quantity || 0));
        const paidQty = Math.max(0, parseFloat(String(item.paid_quantity || 0)));
        const paidReturnQty = Math.min(returnQty, paidQty);

        if (paidReturnQty <= 0) return;

        const unitPrice = parseFloat(String(item.unit_price || 0));
        const discountPercent = parseFloat(String(item.discount_percent || 0));

        const baseAmount = paidReturnQty * unitPrice;
        const discountAmount = (baseAmount * discountPercent) / 100;
        const afterDiscount = baseAmount - discountAmount;

        // CRITICAL: If withhold_gst is true for B2B, do NOT add GST to credit amount
        // GST stays with the company when goods are returned from GST customer
        const shouldIncludeGst = !returnData.withhold_gst && selectedCustomer?.gst_number;
        const taxPercent = shouldIncludeGst
          ? parseFloat(String(item.tax_percent || 0))
          : 0;
        const itemTax = (afterDiscount * taxPercent) / 100;

        subtotal += afterDiscount;
        taxAmount += itemTax;
      }
    });

    const total = subtotal + taxAmount;

    dispatch({
      type: 'SET_RETURN_DATA',
      data: { subtotal_amount: subtotal, tax_amount: taxAmount, total_amount: total }
    });
  }, [returnData.items, selectedCustomer, returnData.withhold_gst, dispatch]);

  // Validate return
  const validateReturn = (): boolean => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return false;
    }

    if (!selectedInvoice && !ui.showManualEntry) {
      toast.error('Please select an invoice or use manual entry');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => item.selected && item.return_quantity > 0);
    if (!hasSelectedItems) {
      toast.error('Please add items to return');
      return false;
    }

    if (ui.showManualEntry) {
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

    for (const item of returnData.items) {
      if (item.selected) {
        if (item.return_quantity <= 0) {
          toast.error(`Please enter a valid return quantity for ${item.product_name}`);
          return false;
        }

        if (item.is_manual && item.unit_price <= 0) {
          toast.error(`Please enter a valid unit price for ${item.product_name}`);
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

  // Handle proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      dispatch({ type: 'SET_STEP', step: 2 });
      window.scrollTo(0, 0);
    }
  };

  // Handle save
  const handleSaveReturn = async () => {
    if (!validateReturn()) return;

    setSaving(true);
    try {
      const response = await returnsApi.createSaleReturn(returnData);

      if (response.data) {
        const { credit_note_no, return_no } = response.data;

        // Set success modal data instead of toast + auto-close
        setCreatedReturnData({
          returnNumber: return_no || returnData.return_no,
          creditNoteNumber: credit_note_no,
          customerId: (selectedCustomer as any)?.id || (selectedCustomer as any)?.customer_id || '',
          customerName: (selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name || 'Customer',
          customerPhone: (selectedCustomer as any)?.phone || (selectedCustomer as any)?.mobile || '',
          customerEmail: (selectedCustomer as any)?.email || '',
          totalAmount: returnData.total_amount || 0,
          items: returnData.items.filter(item => item.selected && item.return_quantity > 0)
        });
        setShowSuccessModal(true);
      }
    } catch (error: any) {
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

  // Handle print (from success modal)
  const handlePrint = () => {
    window.print();
  };

  // Handle PDF download (like InvoiceFlow)
  const handlePDFDownload = useCallback(() => {
    if (!createdReturnData) return;

    const element = document.getElementById('return-preview');
    if (!element) {
      toast.error('Unable to generate PDF - preview not found');
      return;
    }

    const options = {
      margin: [5, 5, 5, 5],  // Smaller margins for more content space
      filename: `CreditNote-${createdReturnData.creditNoteNumber || createdReturnData.returnNumber}.pdf`,
      image: { type: 'jpeg', quality: 1 },  // JPEG with max quality often renders better
      html2canvas: {
        scale: 3,  // Reduced scale - too high can cause blurry output
        useCORS: true,
        logging: false,
        letterRendering: true,
        windowWidth: 794,  // A4 width in pixels at 96dpi
        dpi: 300,  // Higher DPI for print quality
        scrollX: 0,
        scrollY: -window.scrollY  // Capture from current scroll position
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: false,  // Disable compression for sharper text
        precision: 16  // Higher precision
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(options).from(element).save()
      .catch((err: Error) => toast.error(`PDF generation failed: ${err.message}`));
  }, [createdReturnData]);

  // Handle WhatsApp share (like InvoiceFlow)
  const handleWhatsAppShare = useCallback((phone: string | undefined, customerName?: string, amount?: number) => {
    if (!phone) {
      toast.error('No phone number available for WhatsApp');
      return;
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    const returnDate = new Date(returnData.return_date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const formattedAmount = amount ? `₹${amount.toLocaleString('en-IN')}` : '';
    const docNumber = createdReturnData?.creditNoteNumber || createdReturnData?.returnNumber || returnData.return_no;

    const whatsappMessage = `Dear ${customerName || 'Customer'},

Your credit note ${docNumber} dated ${returnDate} for ${formattedAmount} has been created.

This amount will be adjusted against your future purchases.

Thank you for your business!
${companyInfo?.name || 'Your Company'}`;

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank');
  }, [returnData.return_date, companyInfo?.name, createdReturnData]);

  // Handle thermal print (dispatch event for PrintUtility)
  const handleThermalPrint = useCallback(() => {
    window.dispatchEvent(new CustomEvent('thermalPrint', {
      detail: { type: 'credit_note', data: createdReturnData }
    }));
  }, [createdReturnData]);

  // Step 1: Create Return Form
  if (ui.currentStep === 1) {
    return (
      <div className="h-full bg-blue-50">
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

          {/* Keyboard Shortcuts Bar */}
          <KeyboardShortcuts shortcuts={SHORTCUT_SETS.RETURNS} />

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
          <div className="flex-1 overflow-y-auto bg-blue-50">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
              {/* Header Section - Compact when details filled, Expanded for editing */}
              {headerComplete && !showDetailsExpanded ? (
                /* COMPACT HEADER - Preview mode with edit button */
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 flex-wrap">
                      {/* Customer */}
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-gray-900">{(selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name}</span>
                        {(selectedCustomer as any)?.gst_number && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">GST</span>
                        )}
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Date */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Date:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(returnData.return_date || '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Reason */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Reason:</span>
                        <span className="font-medium text-gray-900">{returnData.return_reason}</span>
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Resolution */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Resolution:</span>
                        <span className="font-medium text-gray-900">
                          {returnData.return_type === 'credit_note' && '📝 Credit Note'}
                          {returnData.return_type === 'replacement' && '🔄 Replacement'}
                          {returnData.return_type === 'refund' && '💰 Refund'}
                          {returnData.return_type === 'no_adjustment' && '📦 No Adjustment'}
                        </span>
                      </div>
                    </div>

                    {/* Edit Button */}
                    <button
                      onClick={() => setShowDetailsExpanded(true)}
                      className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Details
                    </button>
                  </div>
                </div>
              ) : (
                /* EXPANDED HEADER - Full form for editing */
                <>
                  {/* Return Info - 3-column grid with consistent h-10 heights */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <StandardDatePicker
                      label="Return Date"
                      value={returnData.return_date || ''}
                      onChange={(dateStr) => {
                        dispatch({ type: 'SET_RETURN_DATA', data: { return_date: dateStr } });
                      }}
                      required
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Return Reason <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={returnData.return_reason || ''}
                        onChange={(value) => dispatch({ type: 'SET_RETURN_DATA', data: { return_reason: String(value || '') } })}
                        options={returnReasons}
                        placeholder="Select reason..."
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Return Resolution <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={returnData.return_type || 'credit_note'}
                        onChange={(e) => dispatch({
                          type: 'SET_RETURN_DATA',
                          data: {
                            return_type: e.target.value as any,
                            return_method: e.target.value // Keep legacy field in sync
                          }
                        })}
                        className="w-full h-10 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="credit_note">Credit Note (Recommended)</option>
                        <option value="replacement">Replacement</option>
                        <option value="refund">Refund (Requires Approval)</option>
                        <option value="no_adjustment">No Financial Adjustment</option>
                      </select>
                    </div>
                  </div>

                  {/* Customer Section - Using global CustomerSearch like Invoice */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        CUSTOMER
                      </h3>
                      <button
                        onClick={() => dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' })}
                        className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                      >
                        Create Customer
                      </button>
                    </div>
                    {/* White card wrapper - consistent with ProductSearch */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <CustomerSearch
                        ref={customerSearchRef}
                        value={selectedCustomer as any}
                        onChange={handleCustomerSelect as any}
                        displayMode="compact"
                        placeholder="Search customer by name, phone, or code..."
                        showCreateButton={false}
                        clearable={true}
                      />
                    </div>
                  </div>

                  {/* Collapse to compact button - only when all fields are filled */}
                  {headerComplete && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => setShowDetailsExpanded(false)}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        Collapse Details
                      </button>
                    </div>
                  )}
                </>
              )}

              <ReturnInvoiceSelector
                selectedCustomer={selectedCustomer}
                selectedInvoice={selectedInvoice}
                onInvoiceSelect={handleInvoiceSelect}
                onSkipInvoice={handleSkipInvoice}
                onChangeInvoice={() => {
                  dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
                  dispatch({ type: 'SET_RETURN_DATA', data: { items: [] } });
                  dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                }}
                showInvoiceSection={ui.showInvoiceSection}
                invoiceSearchRef={invoiceSearchRef}
              />

              {/* GST Withholding Option - Moved closer to items table, only for B2B */}
              {selectedCustomer && (selectedCustomer as any).gst_number && (
                <div className="mb-4 bg-white border border-gray-300 rounded-lg p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">GST Treatment</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {returnData.withhold_gst
                        ? 'GST will NOT be included in return amount'
                        : 'GST will be included in return amount (standard)'
                      }
                    </p>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <span className="text-sm text-gray-700 mr-3 font-medium">Withhold GST</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={returnData.withhold_gst || false}
                        onChange={(e) => dispatch({
                          type: 'SET_RETURN_DATA',
                          data: { withhold_gst: e.target.checked }
                        })}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors border ${returnData.withhold_gst ? 'bg-orange-500 border-orange-600' : 'bg-gray-200 border-gray-300'
                        }`}>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${returnData.withhold_gst ? 'translate-x-5' : ''
                          }`}></div>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Items Table */}
              <ReturnItemsTable
                items={returnData.items}
                selectedInvoice={selectedInvoice}
                showManualEntry={ui.showManualEntry}
                availableBatches={availableBatches}
                onUpdateItem={handleUpdateItem}
                onAddManualItem={handleAddManualItem}
                onRemoveItem={handleRemoveItem}
                onBackToInvoice={ui.showManualEntry && !ui.showInvoiceSection ? () => {
                  dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                  dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
                  dispatch({ type: 'SET_RETURN_DATA', data: { items: [] } });
                } : undefined}
              />
            </div>
          </div>

          {/* Footer */}
          <ProceedToReviewComponent
            currentStep={1}
            canProceed={Boolean(selectedCustomer && (selectedInvoice || ui.showManualEntry) && returnData.items.some(item => item.selected && item.return_quantity > 0))}
            onBack={undefined}
            onProceed={handleProceedToReview}
            onReset={() => {
              dispatch({ type: 'RESET' });
            }}
          />
        </div>

        {/* Customer Creation Modal */}
        {ui.showCustomerModal && (
          <CustomerCreation
            onClose={() => dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' })}
            onCustomerCreated={(newCustomer) => {
              handleCustomerSelect(newCustomer);
              dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' });
            }}
          />
        )}
      </div>
    );
  }

  // Step 2: Review Panel
  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Sales Return"
          documentNumber={returnData.return_no}
          status="pending"
          icon={RotateCcw}
          iconColor="text-red-600"
          onClose={onClose}
          additionalActions={[
            {
              label: "← Back to Items",
              onClick: () => dispatch({ type: 'SET_STEP', step: 1 }),
              variant: "default",
              className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
            }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <ReturnReviewPanel
            returnData={returnData}
            selectedCustomer={selectedCustomer}
            selectedInvoice={selectedInvoice}
            customerDues={customerDues}
            onSave={handleSaveReturn}
            onPrint={handlePrint}
            onBack={() => dispatch({ type: 'SET_STEP', step: 1 })}
            saving={saving}
          />
        </div>
      </div>

      {/* Success Modal - Same pattern as InvoiceFlow */}
      {showSuccessModal && createdReturnData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            if (onClose) onClose();
          }}
          title="Credit Note Created!"
          documentNumber={createdReturnData.creditNoteNumber || createdReturnData.returnNumber}
          documentId={createdReturnData.returnNumber}
          documentType="credit_note"
          customerName={createdReturnData.customerName}
          totalAmount={createdReturnData.totalAmount}
          autoCloseDelay={null}
          documentData={{
            customerPhone: createdReturnData.customerPhone,
            customerEmail: createdReturnData.customerEmail,
            items: createdReturnData.items,
            totals: {
              total_amount: createdReturnData.totalAmount
            }
          }}
          partyDetails={{
            name: createdReturnData.customerName,
            phone: createdReturnData.customerPhone,
            email: createdReturnData.customerEmail
          }}
          companyInfo={companyInfo as any}
          onPrint={handlePrint}
          onThermalPrint={handleThermalPrint}
          onWhatsApp={() => handleWhatsAppShare(createdReturnData.customerPhone, createdReturnData.customerName, createdReturnData.totalAmount)}
          onDownload={handlePDFDownload}
          showCopy={true}
          showQuickActions={true}
        />
      )}

      {/* Off-screen Preview for PDF Generation */}
      {createdReturnData && showSuccessModal && (
        <div className="absolute left-[-9999px] top-0 w-[210mm]" id="return-preview">
          <ReturnReviewPanel
            returnData={returnData}
            selectedCustomer={selectedCustomer}
            selectedInvoice={selectedInvoice}
            customerDues={customerDues}
            onSave={() => { }}
            onPrint={() => { }}
            onBack={() => { }}
            saving={false}
          />
        </div>
      )}
    </div>
  );
};

export default SalesReturnFlow;