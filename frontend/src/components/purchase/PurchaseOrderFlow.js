import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, User, Search, Package, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, Calculator, History, ArrowLeft, ArrowRight, Phone, MapPin,
  Mail, MessageCircle, FileInput, Upload, Building2, CreditCard,
  Truck, Shield, Clock, DollarSign, Download, Loader2, RefreshCw
} from 'lucide-react';
import { suppliersApi, productsApi, purchaseApi } from '../../services/api';
import { searchCache } from '../../utils/searchCache';
import { SupplierSearch, PurchaseProductSearch, ItemsTable, NotesSection, ProductCreationModal, GSTCalculator, ViewHistoryButton, ModuleHeader, StandardDatePicker, DocumentFooter } from '../global';
import ItemsTableKeyboard from '../global/ui/display/ItemsTableKeyboard';
import PurchaseOrderPreview from './components/PurchaseOrderPreview';
import SupplierCreationModal from '../global/modals/SupplierCreationModal';
import ShareModal from '../common/ShareModal';
import { useEnterAsTab } from '../../hooks/useEnterAsTab';
import useEscapeKey from '../../hooks/useEscapeKey';

const PurchaseOrderFlow = ({ onClose, prefilledData = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Print functions
  const printOrder = () => {
    window.print();
  };

  // Thermal print purchase order
  const thermalPrintOrder = (width = '80mm') => {
    const printWindow = window.open('', '', 'width=400,height=600');
    const orderDate = new Date(purchaseOrder.po_date).toLocaleDateString('en-IN');
    const expectedDate = new Date(purchaseOrder.expected_delivery_date).toLocaleDateString('en-IN');
    
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
        <title>PO - ${purchaseOrder.po_no}</title>
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
        <div class="center bold">PURCHASE ORDER</div>
        <div class="center">${purchaseOrder.po_no}</div>
        <div class="divider"></div>
        
        <div>Date: ${orderDate}</div>
        <div>Expected: ${expectedDate}</div>
        <div class="divider"></div>
        
        <div class="bold">Supplier:</div>
        <div>${purchaseOrder.supplier_name || 'N/A'}</div>
        ${purchaseOrder.supplier_details?.gstin ? `<div>GSTIN: ${purchaseOrder.supplier_details.gstin}</div>` : ''}
        
        <div class="divider"></div>
        <div class="bold">Items:</div>
        ${purchaseOrder.items.map((item, idx) => `
          <div class="item-row">
            <span>${idx + 1}. ${item.product_name || item.name || 'N/A'}</span>
          </div>
          <div class="item-row">
            <span>  Qty: ${item.quantity} ${item.unit || ''}</span>
            <span>₹${(item.rate || item.unit_price || 0).toFixed(2)}</span>
          </div>
          ${item.batch_no ? `<div>  Batch: ${item.batch_no}</div>` : ''}
        `).join('')}
        
        <div class="total-section">
          <div class="item-row">
            <span class="bold">Subtotal:</span>
            <span>₹${(purchaseOrder.subtotal_amount || 0).toFixed(2)}</span>
          </div>
          ${purchaseOrder.discount_amount ? `
          <div class="item-row">
            <span class="bold">Discount:</span>
            <span>-₹${purchaseOrder.discount_amount.toFixed(2)}</span>
          </div>
          ` : ''}
          ${purchaseOrder.tax_amount ? `
          <div class="item-row">
            <span class="bold">Tax:</span>
            <span>₹${purchaseOrder.tax_amount.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="divider"></div>
          <div class="item-row">
            <span class="bold">Total:</span>
            <span class="bold">₹${(purchaseOrder.total_amount || 0).toFixed(2)}</span>
          </div>
        </div>
        
        ${purchaseOrder.payment_terms ? `
        <div class="divider"></div>
        <div class="bold">Payment:</div>
        <div>${purchaseOrder.payment_terms}</div>
        ` : ''}
        
        ${purchaseOrder.notes ? `
        <div class="divider"></div>
        <div class="bold">Notes:</div>
        <div>${purchaseOrder.notes}</div>
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

  // Save purchase order
  const saveOrder = async () => {
    setSaving(true);
    try {
      const response = await purchaseApi.createPurchaseOrder(purchaseOrder);
      if (response?.data) {
        setMessage('Purchase order saved successfully!');
        setMessageType('success');
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (error) {
      setMessage('Failed to save purchase order');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  const firstInputRef = useRef(null);
  const itemsTableRef = useRef(null);
  const poFormRef = useRef(null); // For Enter-as-Tab scoping
  
  // Enable Enter-as-Tab navigation (Marg ERP style)
  useEnterAsTab({ 
    containerRef: poFormRef, 
    enabled: true,
    excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
  });

  // ESC key handling - hierarchical modal management
  const shouldHandleMainEsc = !showSupplierModal && !showProductModal && !showGSTCalculator && !showShareModal;
  useEscapeKey(
    () => { if (onClose) onClose(); },
    shouldHandleMainEsc,
    'PurchaseOrderFlow-Main'
  );
  
  useEscapeKey(
    () => setShowSupplierModal(false),
    showSupplierModal,
    'SupplierModal'
  );
  
  useEscapeKey(
    () => setShowProductModal(false),
    showProductModal,
    'ProductModal'
  );
  
  useEscapeKey(
    () => setShowGSTCalculator(false),
    showGSTCalculator,
    'GSTCalculator'
  );
  
  useEscapeKey(
    () => setShowShareModal(false),
    showShareModal,
    'ShareModal'
  );

  // Generate sequential PO number with consistent format
  const generatePONumber = async () => {
    try {
      const response = await purchaseApi.generatePONumber();
      if (response?.data?.po_number) {
        return response.data.po_number;
      }
    } catch (error) {
    }
    
    // Fallback to local generation with consistent format
    const date = new Date();
    const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PO-${dateStr}${randomNum}`; // Format: PO-YYMMDD####
  };

  // Purchase Order state
  const [purchaseOrder, setPurchaseOrder] = useState({
    po_no: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // NEW: 7 days from now
    po_type: 'regular', // NEW: regular|urgent|scheduled
    status: 'draft',
    priority: 'normal',
    
    // Supplier details
    supplier_id: '',
    supplier_name: '',
    supplier_details: null,
    billing_address: '',
    shipping_address: '',
    delivery_location_id: '', // NEW: For specific delivery location
    
    // Reference details
    reference_no: prefilledData?.reference_no || '',
    quotation_no: '',
    requisition_no: '',
    
    // Pharma-specific fields
    drug_license_no: '',
    buyer_drug_license_no: '',
    temperature_conditions: 'Room Temperature',
    quality_standards: 'As per IP/BP/USP',
    return_policy: 'Within 30 days with proper documentation',
    
    // Payment terms
    payment_terms: '30 days',
    credit_period_days: 30,
    advance_payment_percent: 0,
    payment_mode: 'Bank Transfer',
    
    // Delivery terms
    delivery_terms: 'F.O.R. Destination',
    delivery_location: 'Main Warehouse',
    transport_mode: 'By Road',
    insurance_required: false,
    
    // Financial details
    subtotal_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    freight_charges: 0,
    insurance_charges: 0,
    other_charges: 0,
    round_off: 0,
    total_amount: 0,
    
    // Additional info
    terms_conditions: `1. Goods should be as per approved samples and specifications
2. Proper batch number and expiry date must be mentioned
3. All items must have minimum 75% shelf life at the time of delivery
4. Invoice must mention MRP, batch no, expiry date, and HSN code
5. Goods once accepted will not be returned except for quality issues`,
    
    special_instructions: '', // NEW: Special delivery/handling instructions
    notes: '',
    
    // Items
    items: [],
    
    // Dates
    validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    
    // Metadata
    created_by: localStorage.getItem('username') || 'system',
    approved_by: null,
    approval_date: null
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);

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
        searchCache.preloadData('suppliers', () => suppliersApi.getAll()),
        searchCache.preloadData('products', () => productsApi.getAll())
      ]);
      
      // Generate PO number
      const poNo = await generatePONumber();
      setPurchaseOrder(prev => ({ ...prev, po_no: poNo }));
      
    } catch (error) {
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
      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSavePO();
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
            if (!selectedSupplier && supplierSearchRef.current) {
              setShowSupplierModal(true);
            }
            break;
          case 'f':
            e.preventDefault();
            if (selectedSupplier && productSearchRef.current) {
              productSearchRef.current.focus();
            }
            break;
          case 'g':
            e.preventDefault();
            setShowGSTCalculator(true);
            break;
          case 'w':
            e.preventDefault();
            if (currentStep === 2) {
              handleWhatsAppShare();
            }
            break;
          case 'm':
            e.preventDefault();
            if (currentStep === 2) {
              handleEmailShare();
            }
            break;
        }
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        if (showGSTCalculator) {
          setShowGSTCalculator(false);
        } else if (showSupplierModal) {
          setShowSupplierModal(false);
        } else if (showProductModal) {
          setShowProductModal(false);
        } else if (showShareModal) {
          setShowShareModal(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, selectedSupplier, showGSTCalculator, showSupplierModal, showProductModal, showShareModal]);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (purchaseOrder.items.length > 0) {
        localStorage.setItem('purchaseOrderDraft', JSON.stringify(purchaseOrder));
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [purchaseOrder]);

  // Calculate totals whenever items change
  useEffect(() => {
    calculateTotals();
  }, [purchaseOrder.items, purchaseOrder.discount_amount, purchaseOrder.freight_charges, 
      purchaseOrder.insurance_charges, purchaseOrder.other_charges]);

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    purchaseOrder.items.forEach(item => {
      const itemSubtotal = item.quantity * item.purchase_price;
      const itemDiscount = (itemSubtotal * (item.discount_percent || 0)) / 100;
      const taxableAmount = itemSubtotal - itemDiscount;
      const itemTax = (taxableAmount * item.tax_percent) / 100;
      
      subtotal += taxableAmount;
      taxAmount += itemTax;
    });

    const totalBeforeRounding = subtotal + taxAmount + 
                               parseFloat(purchaseOrder.freight_charges || 0) +
                               parseFloat(purchaseOrder.insurance_charges || 0) +
                               parseFloat(purchaseOrder.other_charges || 0) -
                               parseFloat(purchaseOrder.discount_amount || 0);

    const roundOff = Math.round(totalBeforeRounding) - totalBeforeRounding;
    const total = Math.round(totalBeforeRounding);

    setPurchaseOrder(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      round_off: roundOff,
      total_amount: total
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setPurchaseOrder(prev => ({
      ...prev,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      supplier_details: supplier,
      billing_address: supplier.address || '',
      drug_license_no: supplier.drug_license_number || '',
      payment_terms: supplier.payment_terms || '30 days',
      credit_period_days: supplier.credit_period_days || 30
    }));
    
    // Auto-populate buyer drug license from settings
    const buyerLicense = localStorage.getItem('buyer_drug_license') || '';
    setPurchaseOrder(prev => ({ ...prev, buyer_drug_license_no: buyerLicense }));
  };

  const handleAddItem = (product) => {
    const newItem = {
      id: Date.now(),
      product_id: product.product_id || null,
      product_name: product.product_name || product.name,
      hsn_code: product.hsn_code || product.hsn || '',
      pack_size: product.pack_size || '1x10',
      manufacturer: product.manufacturer || '',
      schedule: product.schedule || '',
      purchase_price: parseFloat(product.ptr || product.cost_price || product.mrp * 0.7 || 0),
      rate: parseFloat(product.ptr || product.cost_price || product.mrp * 0.7 || 0),
      mrp: parseFloat(product.mrp || 0),
      quantity: 1,
      free_quantity: 0,
      discount_percent: 0,
      tax_percent: product.gst_percent || product.tax_rate || 0  // No default GST
    };

    setPurchaseOrder(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
    
    // Auto-focus quantity field of newly added item for keyboard data entry
    setTimeout(() => {
      if (itemsTableRef.current) {
        itemsTableRef.current.focusFirstField();
      }
    }, 150);
  };

  const updateItem = (index, field, value) => {
    setPurchaseOrder(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeItem = (itemId) => {
    setPurchaseOrder(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const validatePO = () => {
    if (!selectedSupplier) {
      setMessage('Please select a supplier');
      setMessageType('error');
      return false;
    }

    if (purchaseOrder.items.length === 0) {
      setMessage('Please add at least one item');
      setMessageType('error');
      return false;
    }

    if (!purchaseOrder.expected_delivery_date) {
      setMessage('Please select expected delivery date');
      setMessageType('error');
      return false;
    }

    // Drug license is optional - just log warning if missing
    if (!purchaseOrder.drug_license_no) {
    }

    return true;
  };

  const handleProceedToReview = () => {
    if (validatePO()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  const handleSavePO = async () => {
    if (!validatePO()) return;

    setSaving(true);
    try {
      const response = await purchaseApi.createPurchaseOrder({
        ...purchaseOrder,
        items: purchaseOrder.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          purchase_price: item.purchase_price,
          mrp: item.mrp,
          discount_percent: item.discount_percent || 0,
          tax_percent: item.tax_percent
        }))
      });

      if (response.data) {
        setMessage('Purchase Order created successfully!');
        setMessageType('success');
        
        // Clear draft
        localStorage.removeItem('purchaseOrderDraft');
        
        // Clear cache
        searchCache.clearType('purchase-orders');
        
        // Show success for 2 seconds then close
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase order';
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (!selectedSupplier?.phone) {
      setMessage('Supplier phone number not available');
      setMessageType('error');
      return;
    }

    const orderDetails = purchaseOrder.items.map(item => 
      `• ${item.product_name} - Qty: ${item.quantity} @ ₹${item.purchase_price}`
    ).join('\n');

    const message = `
Dear ${purchaseOrder.supplier_name},

Please find our Purchase Order details:

*PO Number:* ${purchaseOrder.po_no}
*Date:* ${new Date(purchaseOrder.po_date).toLocaleDateString('en-IN')}
*Expected Delivery:* ${new Date(purchaseOrder.expected_delivery_date).toLocaleDateString('en-IN')}

*Items:*
${orderDetails}

*Total Amount:* ₹${purchaseOrder.total_amount.toFixed(2)}
*Payment Terms:* ${purchaseOrder.payment_terms}

Please confirm receipt and expected delivery date.

Thank you,
${localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
    `.trim();

    const whatsappUrl = `https://wa.me/${selectedSupplier.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleEmailShare = () => {
    setShowShareModal(true);
  };

  const sendEmailWithGmail = (emailData) => {
    const orderDetails = purchaseOrder.items.map(item => 
      `${item.product_name} - Qty: ${item.quantity} @ ₹${item.purchase_price}`
    ).join(', ');

    const body = emailData.body || `
Dear ${purchaseOrder.supplier_name},

Please find attached our Purchase Order ${purchaseOrder.po_no} dated ${new Date(purchaseOrder.po_date).toLocaleDateString('en-IN')}.

Order Summary:
- Total Amount: ₹${purchaseOrder.total_amount.toFixed(2)}
- Expected Delivery: ${new Date(purchaseOrder.expected_delivery_date).toLocaleDateString('en-IN')}
- Payment Terms: ${purchaseOrder.payment_terms}
- Items: ${purchaseOrder.items.length}

${orderDetails}

Please confirm receipt and expected delivery date.

Best regards,
${localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
    `.trim();

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${emailData.to}&subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    setShowShareModal(false);
  };

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Step 1: Create PO
  if (currentStep === 1) {
    return (
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          
          {/* Header - Using Global ModuleHeader */}
          <ModuleHeader
            title="Purchase Order"
            documentNumber={purchaseOrder.po_no}
            status="draft"
            icon={FileText}
            iconColor="text-green-600"
            onClose={onClose}
            historyType="purchase_order"
            additionalActions={[
              {
                label: "GST Calculator",
                onClick: () => setShowGSTCalculator(true),
                variant: "default"
              },
              {
                label: refreshing ? "Refreshing..." : "Refresh",
                onClick: handleRefresh,
                variant: "outline",
                disabled: refreshing,
                icon: refreshing ? Loader2 : RefreshCw
              }
            ]}
          />

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - New Supplier | <strong>Ctrl+F</strong> - Find Product | <strong>Ctrl+S</strong> - Proceed to Review | <strong>Ctrl+G</strong> - GST Calculator | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" ref={poFormRef}>
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
              {message && (
                <div className={`rounded-lg p-4 flex items-center gap-3 ${
                  messageType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {messageType === 'error' ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                  <span>{message}</span>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Loading purchase order data...</p>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <p className="text-red-800 font-medium">Error loading data</p>
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* PO Details */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-gray-600" />
                  Order Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <StandardDatePicker
                      label="PO Date"
                      value={purchaseOrder.po_date}
                      onChange={(value) => setPurchaseOrder(prev => ({ ...prev, po_date: value }))}
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <StandardDatePicker
                      label="Expected Delivery"
                      value={purchaseOrder.expected_delivery_date}
                      onChange={(value) => setPurchaseOrder(prev => ({ ...prev, expected_delivery_date: value }))}
                      min={purchaseOrder.po_date}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={purchaseOrder.priority}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      PO Type
                    </label>
                    <select
                      value={purchaseOrder.po_type}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, po_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="regular">Regular PO</option>
                      <option value="urgent">Urgent PO</option>
                      <option value="scheduled">Scheduled PO</option>
                      <option value="blanket">Blanket PO</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Supplier Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">SUPPLIER</h3>

                {!selectedSupplier ? (
                  <div>
                    <SupplierSearch
                      ref={supplierSearchRef}
                      onSupplierSelect={handleSupplierSelect}
                      placeholder="Search suppliers by name, code, or phone..."
                      showCreateButton={true}
                      onCreateNew={() => setShowSupplierModal(true)}
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      Press <strong>Ctrl+N</strong> to add a new supplier
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{selectedSupplier.supplier_name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{selectedSupplier.address}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-600">
                          <div>
                            <span className="text-gray-500">Phone:</span>
                            <span className="ml-2 text-blue-700">{selectedSupplier.phone}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">GSTIN:</span>
                            <span className="ml-2 text-blue-700">{selectedSupplier.gst_number}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">DL No:</span>
                            <span className="ml-2 text-blue-700">{selectedSupplier.drug_license_number}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSupplier(null);
                          setPurchaseOrder(prev => ({
                            ...prev,
                            supplier_id: '',
                            supplier_name: '',
                            supplier_details: null,
                            billing_address: '',
                            drug_license_no: ''
                          }));
                        }}
                        className="text-red-600 hover:text-red-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Selection and Items */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Package className="w-5 h-5 mr-2 text-gray-600" />
                    Order Items
                  </h3>
                  <button
                    onClick={() => setShowProductModal(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Product
                  </button>
                </div>

                {selectedSupplier && (
                  <PurchaseProductSearch
                    ref={productSearchRef}
                    onAddItem={handleAddItem}
                    requireBatch={false}
                    placeholder="Search products by name, code, or HSN..."
                    className="mb-4"
                  />
                )}

                {purchaseOrder.items.length > 0 ? (
                  <ItemsTableKeyboard
                    ref={itemsTableRef}
                    items={purchaseOrder.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    productSearchRef={productSearchRef}
                    currencySymbol="₹"
                    showBatchSelection={false}
                    showExpiry={false}
                    showManufacturer={true}
                    showSchedule={true}
                    editable={true}
                    isPurchaseOrder={true}
                  />
                ) : (
                  <div className="text-center py-12 bg-blue-50 rounded-lg">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No items added yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedSupplier ? 'Search and select products to add' : 'Please select a supplier first'}
                    </p>
                  </div>
                )}

                {/* Summary */}
                {purchaseOrder.items.length > 0 && (
                  <div className="mt-6 bg-blue-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-gray-600">Subtotal</div>
                        <div className="text-lg font-semibold">₹{purchaseOrder.subtotal_amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Tax Amount</div>
                        <div className="text-lg font-semibold">₹{purchaseOrder.tax_amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Round Off</div>
                        <div className="text-lg font-semibold">₹{purchaseOrder.round_off.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Total Amount</div>
                        <div className="text-xl font-bold text-blue-600">₹{purchaseOrder.total_amount.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pharmaceutical Requirements */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-gray-600" />
                  Pharmaceutical Requirements
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Temperature Conditions
                    </label>
                    <select
                      value={purchaseOrder.temperature_conditions}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, temperature_conditions: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Room Temperature">Room Temperature (15-25°C)</option>
                      <option value="Cool Storage">Cool Storage (8-15°C)</option>
                      <option value="Cold Storage">Cold Storage (2-8°C)</option>
                      <option value="Frozen">Frozen (-20°C)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Quality Standards
                    </label>
                    <input
                      type="text"
                      value={purchaseOrder.quality_standards}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, quality_standards: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., As per IP/BP/USP"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Buyer Drug License No.
                    </label>
                    <input
                      type="text"
                      value={purchaseOrder.buyer_drug_license_no}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, buyer_drug_license_no: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter drug license number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Return Policy
                    </label>
                    <input
                      type="text"
                      value={purchaseOrder.return_policy}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, return_policy: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Within 30 days with proper documentation"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Charges */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2 text-gray-600" />
                  Additional Charges
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Discount Amount
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseOrder.discount_amount}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, discount_amount: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Freight Charges
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseOrder.freight_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, freight_charges: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Insurance Charges
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseOrder.insurance_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, insurance_charges: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Other Charges
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseOrder.other_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, other_charges: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-blue-200 bg-white">
            <div className="text-lg font-semibold text-gray-900">
              Total Amount: ₹{purchaseOrder.total_amount.toFixed(2)}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToReview}
                disabled={!selectedSupplier || purchaseOrder.items.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                title="Proceed to Review (Ctrl+S)"
              >
                Proceed to Review
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showSupplierModal && (
          <SupplierCreationModal
            show={showSupplierModal}
            onClose={() => setShowSupplierModal(false)}
            onSupplierCreated={(supplier) => {
              handleSupplierSelect(supplier);
              setShowSupplierModal(false);
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            show={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(product) => {
              handleAddItem(product);
              setShowProductModal(false);
            }}
          />
        )}

        {showGSTCalculator && (
          <GSTCalculator
            show={showGSTCalculator}
            onClose={() => setShowGSTCalculator(false)}
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
          title="Review Purchase Order"
          documentNumber={purchaseOrder.po_no}
          status="draft"
          icon={FileText}
          iconColor="text-green-600"
          onClose={onClose}
          historyType="purchase_order"
          additionalActions={[
            {
              label: "Edit",
              onClick: () => setCurrentStep(1),
              variant: "default"
            },
            {
              label: refreshing ? "Refreshing..." : "Refresh",
              onClick: handleRefresh,
              variant: "outline",
              disabled: refreshing,
              icon: refreshing ? Loader2 : RefreshCw
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save PO | <strong>Ctrl+P</strong> - Print | <strong>Ctrl+W</strong> - WhatsApp | <strong>Ctrl+M</strong> - Email | <strong>Esc</strong> - Close
        </div>

        {/* Content - PO Preview */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">
            {message && (
              <div className={`rounded-lg p-4 flex items-center gap-3 mb-6 ${
                messageType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {messageType === 'error' ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                <span>{message}</span>
                <button
                  onClick={() => {
                    setMessage('');
                    setMessageType('');
                  }}
                  className="ml-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Payment and Delivery Terms - Horizontal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4">
                <h4 className="text-sm font-semibold text-blue-700 mb-2 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2 text-gray-600" />
                  Payment Terms
                </h4>
                <select
                  value={purchaseOrder.payment_terms}
                  onChange={(e) => setPurchaseOrder(prev => ({ ...prev, payment_terms: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Immediate">Immediate Payment</option>
                  <option value="7 days">7 days</option>
                  <option value="15 days">15 days</option>
                  <option value="30 days">30 days</option>
                  <option value="45 days">45 days</option>
                  <option value="60 days">60 days</option>
                </select>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4">
                <h4 className="text-sm font-semibold text-blue-700 mb-2 flex items-center">
                  <Truck className="w-4 h-4 mr-2 text-gray-600" />
                  Delivery Terms
                </h4>
                <select
                  value={purchaseOrder.delivery_terms}
                  onChange={(e) => setPurchaseOrder(prev => ({ ...prev, delivery_terms: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Ex-Warehouse">Ex-Warehouse</option>
                  <option value="Door Delivery">Door Delivery</option>
                  <option value="FOB">FOB (Free on Board)</option>
                  <option value="CIF">CIF (Cost, Insurance & Freight)</option>
                  <option value="DDP">DDP (Delivered Duty Paid)</option>
                </select>
              </div>
            </div>

            {/* Side by side layout for Terms and Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left side - Terms & Conditions */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6 sticky top-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-gray-600" />
                    Terms & Conditions
                  </h3>
                  <textarea
                    value={purchaseOrder.terms_conditions}
                    onChange={(e) => setPurchaseOrder(prev => ({ ...prev, terms_conditions: e.target.value }))}
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Enter terms and conditions..."
                  />
                  
                  {/* Additional Notes */}
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Additional Notes</h4>
                    <textarea
                      value={purchaseOrder.notes}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, notes: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Add any additional notes or special instructions..."
                    />
                  </div>
                </div>
              </div>

              {/* Right side - PO Preview */}
              <div className="lg:col-span-2">
                <PurchaseOrderPreview purchaseOrder={purchaseOrder} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Using DocumentFooter */}
        <DocumentFooter
          documentType="Purchase Order"
          documentNumber={purchaseOrder.po_no}
          totalItems={purchaseOrder.items.length}
          totalAmount={purchaseOrder.total_amount}
          onPrint={printOrder}
          onThermalPrint={thermalPrintOrder}
          onSave={saveOrder}
          onShare={() => setShowShareModal(true)}
          onWhatsApp={handleWhatsAppShare}
          onBack={() => setCurrentStep(1)}
          isSaving={saving}
        />
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          show={showShareModal}
          onClose={() => setShowShareModal(false)}
          onSend={sendEmailWithGmail}
          defaultTo={selectedSupplier?.email || ''}
          subject={`Purchase Order ${purchaseOrder.po_no}`}
          documentType="Purchase Order"
        />
      )}
    </div>
  );
};

export default PurchaseOrderFlow;