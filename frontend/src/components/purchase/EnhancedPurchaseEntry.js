import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Save, Printer, ArrowLeft, X, CheckCircle, AlertCircle, Share2, Calendar, Building2, Plus, Upload } from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { purchasesApi } from '../../services/api/modules/purchases.api';
import { searchCache } from '../../utils/searchCache';
import { 
  EnhancedGlobalDocumentFlow,
  DocumentSummaryTop,
  SupplierSearch,
  ProductSearchSimple,
  ItemsTable,
  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  StandardFormInput,
  StandardDatePicker,
  StandardSelect,
  useToast,
  NumericInput,
  MonthYearPicker,
  SplitPayment
} from '../global';
import documentNumberService from '../../services/documentNumberService';
import { PURCHASE_CONFIG } from '../../config/purchase.config';
import PDFUploadModal from '../PDFUploadModal';
import PDFUploadCard from '../global/ui/PDFUploadCard';
import BulkUploadInline from './BulkUploadInline';

/**
 * EnhancedPurchaseEntry - Purchase Entry using the full global document system
 * Maintains exact same functionality as SimplifiedPurchaseEntry but with global UX
 * 
 * Key differences from Purchase Order:
 * - Records RECEIVED invoices (not creating orders)
 * - Updates inventory immediately
 * - Records payment obligations
 * - Uses /purchases/ endpoint (not /purchase-orders/)
 */
const EnhancedPurchaseEntry = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPDFUpload, setShowPDFUpload] = useState(false);
  const [createdPurchaseData, setCreatedPurchaseData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const productSearchRef = useRef(null);
  
  // Purchase data state - matching SimplifiedPurchaseEntry structure
  const [purchase, setPurchase] = useState({
    purchase_number: '',
    supplier_invoice_number: '', // Required for purchase entry
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_methods: [], // Split payment support
    payment_status: 'Pending',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_type: 'DELIVERY',
    transport_company: '',
    vehicle_number: '',
    lr_number: '',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    final_amount: 0,
    notes: prefilledData?.notes || ''
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Generate purchase number on mount
  useEffect(() => {
    const generateAndSetPurchaseNumber = async () => {
      try {
        const purchaseNumber = await documentNumberService.generatePurchaseNumber();
        setPurchase(prev => ({ ...prev, purchase_number: purchaseNumber }));
      } catch (error) {
        console.warn('Failed to generate purchase number:', error);
        const fallbackNumber = `PUR-${Date.now().toString().slice(-8)}`;
        setPurchase(prev => ({ ...prev, purchase_number: fallbackNumber }));
      }
    };
    
    generateAndSetPurchaseNumber();
  }, []);

  // Calculate totals whenever items change
  useEffect(() => {
    if (purchase.items) {
      calculateTotals();
    }
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  const calculateTotals = () => {
    if (!purchase.items || purchase.items.length === 0) {
      setPurchase(prev => ({
        ...prev,
        gross_amount: 0,
        tax_amount: 0,
        round_off: 0,
        net_amount: 0,
        final_amount: 0
      }));
      return;
    }

    let grossTotal = 0;
    let taxTotal = 0;

    (purchase.items || []).forEach(item => {
      if (item.product_id) {
        const quantity = parseFloat(item.quantity) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;
        
        const itemTotal = quantity * purchasePrice;
        const itemTax = (itemTotal * taxPercent) / 100;
        
        grossTotal += itemTotal;
        taxTotal += itemTax;
      }
    });

    const discountAmount = parseFloat(purchase.discount_amount) || 0;
    const otherCharges = parseFloat(purchase.other_charges) || 0;
    
    const netAmount = grossTotal + taxTotal - discountAmount + otherCharges;
    const roundOff = Math.round(netAmount) - netAmount;
    const finalAmount = Math.round(netAmount);

    setPurchase(prev => ({
      ...prev,
      gross_amount: grossTotal,
      tax_amount: taxTotal,
      round_off: roundOff,
      net_amount: netAmount,
      final_amount: finalAmount
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    if (supplier) {
      setPurchase(prev => ({
        ...prev,
        supplier_id: supplier.supplier_id || supplier.id,
        supplier_name: supplier.supplier_name || supplier.name,
        supplier_details: supplier
      }));
    } else {
      setPurchase(prev => ({
        ...prev,
        supplier_id: null,
        supplier_name: '',
        supplier_details: null
      }));
    }
  };

  const handleAddItem = (product) => {
    // Create new item with unique ID
    const newItem = {
      id: Date.now() + Math.random(), // Unique ID for tracking
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      batch_no: product.batch_number || product.batch_no || '',
      batch_number: product.batch_number || product.batch_no || '',
      expiry_date: product.expiry_date || '',
      quantity: 1,
      free_quantity: 0,
      mrp: product.mrp || 0,
      purchase_price: product.purchase_price || (product.mrp || 0) * 0.7, // Default 30% discount
      selling_price: product.sale_price || product.selling_price || product.mrp || 0,
      sale_price: product.sale_price || product.selling_price || product.mrp || 0,
      discount_percent: 0,
      tax_percent: product.gst_percent || product.tax_rate || 12,
      tax_amount: 0
    };
    
    setPurchase(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const handleBulkUpload = (products) => {
    // Process multiple products from bulk upload
    const newItems = products.map((product, index) => ({
      id: Date.now() + index + Math.random(), // Unique ID for tracking
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      batch_no: product.batch_no || '',
      batch_number: product.batch_no || '',
      expiry_date: product.expiry_date || '',
      quantity: product.quantity || 1,
      free_quantity: product.free_quantity || 0,
      mrp: product.mrp || 0,
      purchase_price: product.purchase_price || (product.mrp || 0) * 0.7,
      selling_price: product.selling_price || product.mrp || 0,
      discount_percent: product.discount_percent || 0,
      tax_percent: product.tax_percent || product.gst_percent || 12,
      tax_amount: product.tax_amount || 0
    }));
    
    setPurchase(prev => ({
      ...prev,
      items: [...(prev.items || []), ...newItems]
    }));
    
    toast.success(`Added ${products.length} products from bulk upload`);
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchase(prev => ({
      ...prev,
      items: (prev.items || []).map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      })
    }));
  };

  const handleRemoveItem = (index) => {
    setPurchase(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSavePurchase = async () => {
    // Validate before saving
    if (!validatePurchase()) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      // Prepare data for backend - matching SimplifiedPurchaseEntry format
      const purchaseData = {
        supplier_invoice_number: purchase.supplier_invoice_number,
        invoice_date: purchase.invoice_date,
        supplier_id: parseInt(purchase.supplier_id),
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_no || item.batch_number,
          expiry_date: item.expiry_date,
          quantity: parseFloat(item.quantity) || 1,
          free_quantity: parseFloat(item.free_quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          mrp: parseFloat(item.mrp) || 0,
          selling_price: parseFloat(item.selling_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12
        })),
        // Handle split payments
        payment_methods: purchase.payment_methods && purchase.payment_methods.length > 0 
          ? purchase.payment_methods 
          : [{ method: 'Cash', amount: purchase.final_amount }],
        payment_mode: purchase.payment_methods && purchase.payment_methods.length > 0
          ? purchase.payment_methods[0].method  // Primary payment method
          : 'Cash',
        payment_status: purchase.payment_status || 'Pending',
        discount_amount: parseFloat(purchase.discount_amount) || 0,
        other_charges: parseFloat(purchase.other_charges) || 0,
        notes: purchase.notes,
        transport_company: purchase.transport_company,
        vehicle_number: purchase.vehicle_number,
        lr_number: purchase.lr_number
      };

      console.log('Saving purchase with data:', purchaseData);
      const response = await purchasesApi.create(purchaseData);
      
      if (response && response.data) {
        const purchaseNumber = response.data.purchase_number || purchase.purchase_number;
        
        setCreatedPurchaseData({
          purchaseNumber: purchaseNumber,
          purchaseId: response.data.purchase_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
          totalAmount: purchase.final_amount
        });
        
        setShowSuccessModal(true);
        toast.success(`Purchase ${purchaseNumber} created successfully!`);
        
        // Clear search cache after successful save
        searchCache.clear();
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validatePurchase = () => {
    const errors = {};
    
    if (!selectedSupplier) {
      errors.supplier = 'Supplier is required';
    }
    
    if (!purchase.supplier_invoice_number) {
      errors.invoice_number = 'Supplier invoice number is required';
    }
    
    if (!purchase.items || purchase.items.length === 0) {
      errors.items = 'At least one item is required';
    }
    
    return Object.keys(errors).length === 0;
  };

  const handlePrint = () => {
    const printContent = document.getElementById('purchase-print-area');
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload();
  };

  const formatCurrency = (amount) => {
    const numAmount = parseFloat(amount) || 0;
    return `₹${numAmount.toFixed(2)}`;
  };

  // Handle PDF Upload
  const handlePDFUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await purchasesApi.parseInvoice(formData);
      if (response && response.data) {
        const extractedData = response.data;
        
        // Update purchase with extracted data
        setPurchase(prev => ({
          ...prev,
          supplier_invoice_number: extractedData.invoice_number || prev.supplier_invoice_number,
          invoice_date: extractedData.invoice_date || prev.invoice_date,
          items: extractedData.items || prev.items,
          gross_amount: extractedData.gross_amount || prev.gross_amount,
          tax_amount: extractedData.tax_amount || prev.tax_amount,
          net_amount: extractedData.net_amount || prev.net_amount,
          final_amount: extractedData.final_amount || prev.final_amount
        }));
        
        // Update supplier if extracted
        if (extractedData.supplier_id) {
          setSelectedSupplier(extractedData.supplier_details);
          setPurchase(prev => ({
            ...prev,
            supplier_id: extractedData.supplier_id,
            supplier_name: extractedData.supplier_name
          }));
        }
        
        toast.success('PDF data extracted successfully!');
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast.error('Failed to parse PDF. Please try again.');
    }
  };

  // Create content for step 1
  const createContent = (
    <>
      {/* Compact PDF Upload Option */}
      <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-purple-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">Quick Import from PDF</p>
              <p className="text-xs text-gray-600">Upload supplier invoice to auto-fill details</p>
            </div>
          </div>
          <div>
            <button
              onClick={() => setShowPDFUpload(true)}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
            >
              Upload PDF
            </button>
          </div>
        </div>
      </div>


      {/* Invoice Details - Standardized Components */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StandardFormInput
          label="Supplier Invoice Number"
          value={purchase.supplier_invoice_number}
          onChange={(e) => setPurchase(prev => ({ ...prev, supplier_invoice_number: e.target.value }))}
          placeholder="Invoice number"
          required
          error={errors.invoice_number}
        />
        <StandardDatePicker
          label="Invoice Date"
          value={purchase.invoice_date}
          onChange={(value) => setPurchase(prev => ({ ...prev, invoice_date: value }))}
        />
        <StandardDatePicker
          label="Delivery Date"
          value={purchase.delivery_date}
          onChange={(value) => setPurchase(prev => ({ ...prev, delivery_date: value }))}
        />
      </div>

      {/* Supplier Section - Clean and Separate */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">SUPPLIER</h3>
          </div>
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Supplier
          </button>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <SupplierSearch
            value={selectedSupplier}
            onChange={handleSupplierSelect}
            displayMode="compact"
            placeholder="Search supplier by name, phone, or code..."
            clearable={true}
          />
          {errors.supplier && (
            <p className="text-red-500 text-xs mt-1">{errors.supplier}</p>
          )}
        </ContentCard>
      </div>

      {/* Products Section - With Label and Create Button Outside */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS</h3>
          </div>
          <div className="flex gap-2">
            <BulkUploadInline 
              onProductsUploaded={handleBulkUpload}
            />
            <button
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Create Product
            </button>
          </div>
        </div>
        <ProductSearchSimple
          onAddItem={handleAddItem}
          onCreateProduct={(searchQuery) => {
            console.log('Creating product with name:', searchQuery);
            setShowProductModal(true);
            // TODO: Pass searchQuery to pre-fill product name in modal
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table - With Label Outside */}
      {purchase.items && purchase.items.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PURCHASE ITEMS</h3>
          </div>
          <div className="overflow-visible relative" style={{ minHeight: '300px', zIndex: 50 }}>
            <ItemsTable
            items={purchase.items.map(item => ({
              ...item,
              rate: item.purchase_price,
              tax: item.tax_percent,
              batch_number: item.batch_no || item.batch_number,
              unit: item.unit || 'Strip',
              total: (item.quantity * item.purchase_price * (1 + (item.tax_percent || 0) / 100)).toFixed(2)
            }))}
            onUpdateItem={(index, field, value) => {
              const mappedField = field === 'rate' ? 'purchase_price' : 
                                field === 'tax' ? 'tax_percent' :
                                field === 'batch' ? 'batch_no' :
                                field;
              handleUpdateItem(index, mappedField, value);
            }}
            onRemoveItem={handleRemoveItem}
            showTotals={false}
            title=""
            columns={['product', 'pack_type', 'pack_config', 'expiry', 'qty', 'free', 'mrp', 'cost', 'rate', 'disc', 'tax', 'total']}
            customColumns={{
              pack_type: {
                label: 'Pack',
                align: 'center',
                render: (item, index) => (
                  <select
                    value={item.pack_type || 'STRIP'}
                    onChange={(e) => handleUpdateItem(index, 'pack_type', e.target.value)}
                    className="w-16 text-xs border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md"
                  >
                    <option value="STRIP">STRIP</option>
                    <option value="BOX">BOX</option>
                    <option value="BOTTLE">BOTTLE</option>
                    <option value="VIAL">VIAL</option>
                    <option value="TUBE">TUBE</option>
                  </select>
                )
              },
              pack_config: {
                label: 'Pack Type',
                align: 'center',
                render: (item, index) => (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={item.pack_size || 10}
                      onChange={(e) => handleUpdateItem(index, 'pack_size', parseInt(e.target.value) || 1)}
                      className="w-8 text-xs text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="U"
                      title="Units per pack"
                    />
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      type="number"
                      value={item.strips_per_box || 10}
                      onChange={(e) => handleUpdateItem(index, 'strips_per_box', parseInt(e.target.value) || 1)}
                      className="w-8 text-xs text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="P"
                      title="Packs per box"
                    />
                  </div>
                )
              },
              expiry: {
                label: 'Expiry',
                align: 'center',
                render: (item, index) => (
                  <div className="relative">
                    <MonthYearPicker
                      value={item.expiry_date}
                      onChange={(value) => handleUpdateItem(index, 'expiry_date', value)}
                      width="w-20"
                      className="text-xs"
                    />
                  </div>
                )
              },
              qty: {
                label: 'Qty',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.quantity}
                    onChange={(value) => handleUpdateItem(index, 'quantity', value)}
                    min={0}
                    defaultValue={1}
                    width="w-12"
                    align="center"
                    clearable={true}
                  />
                )
              },
              free: {
                label: 'Free',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.free_quantity}
                    onChange={(value) => handleUpdateItem(index, 'free_quantity', value)}
                    min={0}
                    defaultValue={0}
                    width="w-10"
                    align="center"
                    clearable={true}
                  />
                )
              },
              mrp: {
                label: 'MRP',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.mrp}
                    onChange={(value) => handleUpdateItem(index, 'mrp', value)}
                    min={0}
                    defaultValue={0}
                    decimalPlaces={2}
                    width="w-16"
                    align="center"
                    clearable={true}
                    prefix="₹"
                  />
                )
              },
              cost: {
                label: 'Cost',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.purchase_price}
                    onChange={(value) => handleUpdateItem(index, 'purchase_price', value)}
                    min={0}
                    defaultValue={0}
                    decimalPlaces={2}
                    width="w-16"
                    align="center"
                    clearable={true}
                    prefix="₹"
                  />
                )
              },
              rate: {
                label: 'Rate',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.sale_price || item.selling_price}
                    onChange={(value) => handleUpdateItem(index, 'sale_price', value)}
                    min={0}
                    defaultValue={item.mrp || 0}
                    decimalPlaces={2}
                    width="w-16"
                    align="center"
                    clearable={true}
                    prefix="₹"
                  />
                )
              },
              disc: {
                label: 'Disc%',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.discount_percent}
                    onChange={(value) => handleUpdateItem(index, 'discount_percent', value)}
                    min={0}
                    max={100}
                    defaultValue={0}
                    decimalPlaces={1}
                    width="w-12"
                    align="center"
                    clearable={true}
                    suffix="%"
                  />
                )
              },
              tax: {
                label: 'Tax%',
                align: 'center',
                render: (item, index) => (
                  <select
                    value={item.tax_percent || 12}
                    onChange={(e) => handleUpdateItem(index, 'tax_percent', parseFloat(e.target.value))}
                    className="w-12 text-xs text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md"
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                )
              },
              total: {
                label: 'Total',
                align: 'right',
                render: (item) => {
                  const qty = parseFloat(item.quantity) || 0;
                  const price = parseFloat(item.purchase_price) || 0;
                  const taxPercent = parseFloat(item.tax_percent) || 0;
                  const subtotal = qty * price;
                  const tax = subtotal * (taxPercent / 100);
                  const total = subtotal + tax;
                  return <span className="font-medium">₹{total.toFixed(2)}</span>;
                }
              }
            }}
          />
          </div>
        </>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}
    </>
  );

  // Review content for step 2 - Simplified like Sales Order
  const reviewContent = (
    <>
      {/* Clean Purchase Preview - Matching Sales Order Style */}
      <div id="purchase-print-area" className="bg-white rounded-lg shadow-sm border border-green-200 p-8">
        {/* Compact Header Section */}
        <div className="mb-4 pb-3 border-b-2 border-green-300">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Entry</h2>
              <div className="text-sm">
                <span className="text-gray-600">Purchase No:</span>
                <span className="ml-2 font-semibold text-gray-900">{purchase.purchase_number}</span>
              </div>
            </div>
            
            {/* Supplier Invoice Info with Date - Right Side */}
            <div className="text-right">
              <div className="bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-gray-900">
                  Supplier Invoice: {purchase.supplier_invoice_number}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Date: {new Date(purchase.invoice_date).toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Split Payment Component - Moved to Top */}
        <div className="mb-6">
          <SplitPayment
            totalAmount={purchase.final_amount || 0}
            payments={purchase.payment_methods || []}
            onChange={(payments, summary) => {
              setPurchase(prev => ({
                ...prev,
                payment_methods: payments,
                payment_status: summary.status
              }));
            }}
            onPaymentStatusChange={(status) => {
              setPurchase(prev => ({ ...prev, payment_status: status }));
            }}
            allowPartial={true}
            className=""
          />
        </div>

        {/* Simplified Supplier Section with GST and DL */}
        <div className="mb-6">
          <div className="bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Supplier</h3>
                <p className="text-base font-semibold text-gray-900">{selectedSupplier?.supplier_name}</p>
                <div className="mt-1 space-y-0.5">
                  {selectedSupplier?.gst_number && (
                    <p className="text-sm text-gray-600">GST: {selectedSupplier.gst_number}</p>
                  )}
                  {selectedSupplier?.dl_number && (
                    <p className="text-sm text-gray-600">D.L. No: {selectedSupplier.dl_number}</p>
                  )}
                </div>
              </div>
              {selectedSupplier?.phone && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">{selectedSupplier.phone}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clean Items Table */}
        <div className="mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Item</th>
                <th className="text-center py-3 px-2 text-sm font-medium text-gray-700">Batch</th>
                <th className="text-center py-3 px-2 text-sm font-medium text-gray-700">Qty</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-700">Rate</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-700">Tax</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.items || []).map((item, index) => {
                const quantity = parseFloat(item.quantity) || 0;
                const purchasePrice = parseFloat(item.purchase_price) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                const itemTotal = quantity * purchasePrice;
                const itemTax = (itemTotal * taxPercent) / 100;
                const totalWithTax = itemTotal + itemTax;
                
                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 text-sm">{item.product_name}</td>
                    <td className="text-center py-3 px-2 text-sm text-gray-600">{item.batch_no || '-'}</td>
                    <td className="text-center py-3 px-2 text-sm font-medium">{quantity}</td>
                    <td className="text-right py-3 px-2 text-sm">{formatCurrency(purchasePrice)}</td>
                    <td className="text-right py-3 px-2 text-sm text-gray-600">{taxPercent}%</td>
                    <td className="text-right py-3 px-2 text-sm font-medium">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Clean Summary Section */}
        <div className="border-t-2 border-gray-200 pt-4">
          <div className="flex justify-end">
            <div className="w-64">
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-medium">{formatCurrency(purchase.gross_amount)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Tax</span>
                <span className="text-sm">{formatCurrency(purchase.tax_amount)}</span>
              </div>
              {purchase.discount_amount > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Discount</span>
                  <span className="text-sm text-red-600">-{formatCurrency(purchase.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-base font-bold text-green-600">{formatCurrency(purchase.final_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <EnhancedGlobalDocumentFlow
        documentType="purchase"
        documentData={purchase}
        onDocumentUpdate={setPurchase}
        onClose={onClose}
        
        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        
        // Step content
        createContent={createContent}
        reviewContent={reviewContent}
        
        // Additional actions for header
        additionalActions={[]}
        
        // Validation & Actions
        canProceedToReview={() => {
          return !!selectedSupplier && 
                 !!purchase.supplier_invoice_number && 
                 purchase.items && 
                 purchase.items.length > 0;
        }}
        onSave={handleSavePurchase}
        onPrint={handlePrint}
        isSaving={saving}
        
        // Footer totals
        footerTotals={{
          itemCount: purchase.items?.length || 0,
          totalAmount: purchase.final_amount,
          subtotal: purchase.gross_amount,
          tax: purchase.tax_amount,
          roundOff: purchase.round_off,
          grandTotal: purchase.final_amount
        }}
        
        // Keyboard shortcuts
        keyboardShortcuts={{
          1: [
            { key: 'Ctrl+N', action: 'Add Supplier' },
            { key: 'Ctrl+F', action: 'Search Products' },
            { key: 'Ctrl+S', action: 'Proceed to Review' },
            { key: 'Esc', action: 'Close' }
          ],
          2: [
            { key: 'Ctrl+S', action: 'Save Purchase' },
            { key: 'Ctrl+P', action: 'Print' },
            { key: 'Esc', action: 'Back to Edit' }
          ]
        }}
      />

      {/* Modals */}
      {showSupplierModal && (
        <SupplierCreationModal
          isOpen={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSupplierCreated={(supplier) => {
            handleSupplierSelect(supplier);
            setShowSupplierModal(false);
            toast.success('Supplier created successfully');
            searchCache.clear();
          }}
        />
      )}

      {showProductModal && (
        <ProductCreationModal
          show={showProductModal}
          onClose={() => setShowProductModal(false)}
          onProductCreated={(product) => {
            setShowProductModal(false);
            toast.success('Product created successfully');
            searchCache.clear();
            // Optionally auto-add the product
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {showPDFUpload && (
        <PDFUploadModal
          isOpen={showPDFUpload}
          onClose={() => setShowPDFUpload(false)}
          onDataExtracted={(data) => {
            console.log('📥 Received extracted data:', data);
            
            // Handle PDF data extraction
            if (data.invoice_number) {
              setPurchase(prev => ({ ...prev, supplier_invoice_number: data.invoice_number }));
            }
            
            if (data.invoice_date) {
              setPurchase(prev => ({ ...prev, invoice_date: data.invoice_date }));
            }
            
            // Handle supplier information
            if (data.supplier_name) {
              setPurchase(prev => ({ ...prev, supplier_name: data.supplier_name }));
              // If supplier exists in the system, set it
              if (data.supplier_exists && data.supplier_id) {
                setSelectedSupplier({
                  supplier_id: data.supplier_id,
                  supplier_name: data.supplier_name,
                  gstin: data.supplier_gstin
                });
              } else {
                // New supplier - just set the name for now
                setSelectedSupplier(null);
                setPurchase(prev => ({ 
                  ...prev, 
                  supplier_name: data.supplier_name,
                  supplier_gstin: data.supplier_gstin 
                }));
              }
            }
            
            // Handle items
            if (data.items && data.items.length > 0) {
              // Map extracted items to the format expected by the component
              const mappedItems = data.items.map(item => ({
                product_id: item.product_id || '',
                product_name: item.product_name || '',
                hsn_code: item.hsn_code || '',
                batch_number: item.batch_number || '',
                expiry_date: item.expiry_date || '',
                quantity: item.quantity || 0,
                purchase_price: item.cost_price || item.rate || 0,
                selling_price: item.mrp || 0,
                mrp: item.mrp || 0,
                discount_percent: item.discount_percent || 0,
                tax_percent: item.tax_percent || 12,
                amount: item.amount || 0
              }));
              setPurchase(prev => ({ ...prev, items: mappedItems }));
            }
            
            // Update totals if provided
            if (data.grand_total) {
              setPurchase(prev => ({ ...prev, final_amount: data.grand_total }));
            }
            if (data.subtotal) {
              setPurchase(prev => ({ ...prev, gross_amount: data.subtotal }));
            }
            if (data.tax_amount) {
              setPurchase(prev => ({ ...prev, tax_amount: data.tax_amount }));
            }
            
            toast.success('PDF data extracted successfully! Review the details below.');
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && createdPurchaseData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Purchase Entry Created!"
          documentNumber={createdPurchaseData.purchaseNumber}
          documentId={createdPurchaseData.purchaseId}
          documentType="purchase"
          customerName={createdPurchaseData.supplierName}
          totalAmount={createdPurchaseData.totalAmount}
          onPrint={handlePrint}
          showCopy={true}
        />
      )}
    </>
  );
};

export default EnhancedPurchaseEntry;