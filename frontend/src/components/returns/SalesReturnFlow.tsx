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
import { RotateCcw, Download, AlertCircle } from 'lucide-react';
import {
  ModuleHeader, DatePicker, Select, useToast, ProceedToReviewComponent, NotesSection
} from '../global';
import CustomerCreationB2B from '../global/creation/CustomerCreationB2B';
import { returnsApi, customersApi, invoicesApi, metadataApi } from '../../services/api';
import { getApiBaseUrl } from '../../config/apiBase';
import offlineStorage from '../../services/offlineStorage';

// Import extracted components
import { ReturnCustomerSelector } from './components/ReturnCustomerSelector';
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

  // Refs
  const historyButtonRef = useRef(null);
  const customerSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const firstInputRef = useRef<any>(null);

  const toast = useToast();

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

    // Load invoice items
    if (!invoice.items || invoice.items.length === 0) {
      try {
        const response = await invoicesApi.getById((invoice as any).id || (invoice as any).invoice_id);
        const fullInvoice = response?.data || response;
        if (fullInvoice.success && fullInvoice.data) {
          const items = fullInvoice.data.items || [];
          const mappedItems = items.map((item: any) => mapInvoiceItemToReturnItem(item));
          dispatch({ type: 'SET_RETURN_DATA', data: { items: mappedItems } });
        }
      } catch (error) {
        toast.error('Failed to load invoice items');
      }
    } else {
      const mappedItems = invoice.items.map((item: any) => mapInvoiceItemToReturnItem(item));
      dispatch({ type: 'SET_RETURN_DATA', data: { items: mappedItems } });
    }
  }, [dispatch, toast]);

  // Map invoice item to return item
  const mapInvoiceItemToReturnItem = (item: any): ReturnFormItem => {
    const totalQty = parseFloat(item.quantity || 0);
    const freeQty = parseFloat(item.free_quantity || 0);
    const paidQty = totalQty - freeQty;
    const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0);

    return {
      ...item,
      return_quantity: totalQty,
      selected: true,
      paid_quantity: paidQty,
      free_quantity: freeQty,
      quantity: totalQty,
      unit_price: item.unit_price || 0,
      discount_percent: item.discount_percent || 0,
      tax_percent: gstPercent,
      max_returnable_qty: totalQty,
      batch_id: item.batch_id,
      batch_number: item.batch_number,
      manufacturing_date: item.manufacturing_date,
      expiry_date: item.expiry_date,
      invoice_item_id: item.invoice_item_id,
      disposition: 'RESTOCK'
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
        dispatch({
          type: 'SET_AVAILABLE_BATCHES',
          productId,
          batches: batches.filter((b: any) => b.quantity_available > 0)
        });
      }
    } catch (error) {
      // Silent fail
    }
  }, [dispatch]);

  // Add manual item
  const handleAddManualItem = useCallback(async (product: any) => {
    if (!product) return;

    if (ui.showManualEntry) {
      await fetchBatchesForProduct(product.product_id);
    }

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
  }, [ui.showManualEntry, manualItemCounter, returnData.items, dispatch, fetchBatchesForProduct]);

  // Remove item
  const handleRemoveItem = useCallback((itemId: string | number) => {
    const updatedItems = returnData.items.filter(item => item.id !== itemId);
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

        const taxPercent = (!selectedCustomer?.gst_number || returnData.include_gst)
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
  }, [returnData.items, selectedCustomer, returnData.include_gst, dispatch]);

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

      setTimeout(() => {
        onClose();
      }, 2500);
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

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Step 1: Create Return Form
  if (ui.currentStep === 1) {
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
              {/* Return Info */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-6">
                  <div className="w-64">
                    <DatePicker
                      value={typeof returnData.return_date === 'string' ? new Date(returnData.return_date) : returnData.return_date}
                      onChange={(date) => {
                        const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
                        dispatch({ type: 'SET_RETURN_DATA', data: { return_date: dateStr } });
                      }}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>

                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Reason <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={returnData.return_reason || ''}
                          onChange={(value) => dispatch({ type: 'SET_RETURN_DATA', data: { return_reason: String(value || '') } })}
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
                          onChange={(e) => dispatch({ type: 'SET_RETURN_DATA', data: { return_method: e.target.value } })}
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

              {/* Customer Selection */}
              <ReturnCustomerSelector
                selectedCustomer={selectedCustomer}
                onCustomerSelect={handleCustomerSelect}
                onCreateCustomer={() => dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' })}
                customerSearchRef={customerSearchRef}
              />

              {/* Invoice Selection */}
              <ReturnInvoiceSelector
                selectedCustomer={selectedCustomer}
                selectedInvoice={selectedInvoice}
                onInvoiceSelect={handleInvoiceSelect}
                onSkipInvoice={handleSkipInvoice}
                showInvoiceSection={ui.showInvoiceSection}
                invoiceSearchRef={invoiceSearchRef}
              />

              {/* Items Table */}
              <ReturnItemsTable
                items={returnData.items}
                selectedInvoice={selectedInvoice}
                showManualEntry={ui.showManualEntry}
                availableBatches={availableBatches}
                onUpdateItem={handleUpdateItem}
                onAddManualItem={handleAddManualItem}
                onRemoveItem={handleRemoveItem}
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
          <CustomerCreationB2B
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
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Sales Return - Review"
          documentNumber={returnData.return_no}
          status="pending"
          icon={RotateCcw}
          iconColor="text-red-600"
          onClose={onClose}
          historyType="return"
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <ReturnReviewPanel
            returnData={returnData}
            selectedCustomer={selectedCustomer}
            customerDues={customerDues}
            onSave={handleSaveReturn}
            onPrint={handlePrint}
            onBack={() => dispatch({ type: 'SET_STEP', step: 1 })}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
};

export default SalesReturnFlow;