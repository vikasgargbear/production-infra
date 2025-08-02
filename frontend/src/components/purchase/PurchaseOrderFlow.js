import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, User, Search, Package, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, Calculator, History, ArrowLeft, ArrowRight, Phone, MapPin,
  Mail, MessageCircle, FileInput, Upload, Building2, CreditCard,
  Truck, Shield, Clock, DollarSign, Download
} from 'lucide-react';
import { suppliersApi, productsApi, purchaseApi } from '../../services/api';
import { searchCache } from '../../utils/searchCache';
import { SupplierSearch, PurchaseProductSearch, PharmaItemsTable, NotesSection, ProductCreationModal, GSTCalculator, ViewHistoryButton } from '../global';
import PurchaseOrderPreview from './components/PurchaseOrderPreview';
import SupplierCreationModal from '../global/modals/SupplierCreationModal';
import ShareModal from '../common/ShareModal';

const PurchaseOrderFlow = ({ onClose, prefilledData = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Generate sequential PO number
  const generatePONumber = async () => {
    try {
      const response = await purchaseApi.generatePONumber();
      if (response?.data?.po_number) {
        return response.data.po_number;
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
    }
    
    // Fallback to local generation
    const lastPONo = localStorage.getItem('lastPONo') || 'PO-2024-0000';
    const parts = lastPONo.split('-');
    const year = new Date().getFullYear();
    const sequence = parseInt(parts[2] || '0') + 1;
    const newPONo = `PO-${year}-${sequence.toString().padStart(4, '0')}`;
    localStorage.setItem('lastPONo', newPONo);
    return newPONo;
  };

  // Purchase Order state
  const [purchaseOrder, setPurchaseOrder] = useState({
    po_no: '',
    po_date: new Date().toISOString().split('T')[0],
    po_type: 'standard',
    status: 'draft',
    priority: 'normal',
    
    // Supplier details
    supplier_id: '',
    supplier_name: '',
    supplier_details: null,
    billing_address: '',
    shipping_address: '',
    
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
    
    notes: '',
    
    // Items
    items: [],
    
    // Dates
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    
    // Metadata
    created_by: localStorage.getItem('username') || 'system',
    approved_by: null,
    approval_date: null
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);

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

  // Generate PO number on mount
  useEffect(() => {
    generatePONumber().then(poNumber => {
      setPurchaseOrder(prev => ({ ...prev, po_no: poNumber }));
    });
  }, []);

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
      product_id: product.product_id || product.id,
      product_name: product.product_name || product.name,
      hsn_code: product.hsn_code || product.hsn || '',
      pack_size: product.pack_size || '1x10',
      manufacturer: product.manufacturer || '',
      schedule: product.schedule || '',
      purchase_price: parseFloat(product.ptr || product.cost_price || product.mrp * 0.7 || 0),
      mrp: parseFloat(product.mrp || 0),
      quantity: 1,
      free_quantity: 0,
      discount_percent: 0,
      tax_percent: product.gst_percent || product.tax_rate || 18
    };

    setPurchaseOrder(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const updateItem = (itemId, field, value) => {
    setPurchaseOrder(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
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
      console.warn('Supplier drug license number not provided');
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
      console.error('Error creating purchase order:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase order';
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
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
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <h1 className="text-lg font-semibold text-gray-900">Create Purchase Order</h1>
              <span className="text-sm text-gray-500">Step 1: Add Details</span>
            </div>
            
            <div className="flex items-center gap-3">
              <ViewHistoryButton
                entityType="purchase_order"
                entityName="Purchase Order"
              />
              <button
                onClick={() => setShowGSTCalculator(true)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                title="GST Calculator (Ctrl+G)"
              >
                <Calculator className="w-4 h-4" />
                GST Calculator
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="bg-blue-50 px-4 py-2 text-sm text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - New Supplier | <strong>Ctrl+F</strong> - Find Product | <strong>Ctrl+S</strong> - Proceed to Review | <strong>Ctrl+G</strong> - GST Calculator | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
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

              {/* PO Header */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Purchase Order</h2>
                    <p className="text-sm text-gray-600 mt-1">PO No: {purchaseOrder.po_no}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500 mb-1">Company Details</div>
                    <div className="font-semibold text-gray-900">{localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}</div>
                    <div className="text-sm text-gray-600">GSTIN: {localStorage.getItem('company_gstin') || '24XXXXX1234Z5'}</div>
                    <div className="text-sm text-gray-600">DL No: {localStorage.getItem('buyer_drug_license') || '20B/21B-XXX'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PO Date
                    </label>
                    <input
                      ref={firstInputRef}
                      type="date"
                      value={purchaseOrder.po_date}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, po_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expected Delivery
                    </label>
                    <input
                      type="date"
                      value={purchaseOrder.expected_delivery_date}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                      min={purchaseOrder.po_date}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PO Type
                    </label>
                    <select
                      value={purchaseOrder.po_type}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, po_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="standard">Standard PO</option>
                      <option value="blanket">Blanket PO</option>
                      <option value="contract">Contract PO</option>
                      <option value="planned">Planned PO</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Supplier Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Building2 className="w-5 h-5 mr-2 text-gray-600" />
                  Supplier Details
                </h3>

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
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{selectedSupplier.supplier_name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{selectedSupplier.address}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-600">
                          <div>
                            <span className="text-gray-500">Phone:</span>
                            <span className="ml-2 text-gray-700">{selectedSupplier.phone}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">GSTIN:</span>
                            <span className="ml-2 text-gray-700">{selectedSupplier.gst_number}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">DL No:</span>
                            <span className="ml-2 text-gray-700">{selectedSupplier.drug_license_number}</span>
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                  <PharmaItemsTable
                    items={purchaseOrder.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    showBatchSelection={false}
                    showExpiry={false}
                    showManufacturer={true}
                    showSchedule={true}
                    editable={true}
                    isPurchaseOrder={true}
                  />
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No items added yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedSupplier ? 'Search and select products to add' : 'Please select a supplier first'}
                    </p>
                  </div>
                )}

                {/* Summary */}
                {purchaseOrder.items.length > 0 && (
                  <div className="mt-6 bg-gray-50 rounded-lg p-4">
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-gray-600" />
                  Pharmaceutical Requirements
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Buyer Drug License No.
                    </label>
                    <input
                      type="text"
                      value={purchaseOrder.buyer_drug_license_no}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, buyer_drug_license_no: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="20B/21B-XXX"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2 text-gray-600" />
                  Additional Charges
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Amount
                    </label>
                    <input
                      type="number"
                      value={purchaseOrder.discount_amount}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, discount_amount: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Freight Charges
                    </label>
                    <input
                      type="number"
                      value={purchaseOrder.freight_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, freight_charges: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Insurance Charges
                    </label>
                    <input
                      type="number"
                      value={purchaseOrder.insurance_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, insurance_charges: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Other Charges
                    </label>
                    <input
                      type="number"
                      value={purchaseOrder.other_charges}
                      onChange={(e) => setPurchaseOrder(prev => ({ ...prev, other_charges: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-white">
            <div className="text-lg font-semibold text-gray-900">
              Total Amount: ₹{purchaseOrder.total_amount.toFixed(2)}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Purchase Order Review</h1>
            <span className="text-sm text-gray-500">Step 2: Review & Confirm</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Edit
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              title="Print PO (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="bg-blue-50 px-4 py-2 text-sm text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save PO | <strong>Ctrl+P</strong> - Print | <strong>Ctrl+W</strong> - WhatsApp | <strong>Ctrl+M</strong> - Email | <strong>Esc</strong> - Close
        </div>

        {/* Content - PO Preview */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6">
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
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
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-0">
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

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-white">
          <div className="text-lg font-semibold text-gray-900">
            Total Amount: ₹{purchaseOrder.total_amount.toFixed(2)}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              title="Print PO (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleWhatsAppShare}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              title="Send via WhatsApp (Ctrl+W)"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </button>
            <button
              onClick={handleEmailShare}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Send via Email (Ctrl+M)"
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button
              onClick={handleSavePO}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              title="Save Purchase Order (Ctrl+S)"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save PO
                </>
              )}
            </button>
          </div>
        </div>
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