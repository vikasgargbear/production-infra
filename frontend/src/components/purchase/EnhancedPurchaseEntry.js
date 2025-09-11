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
import { PURCHASE_CONFIG, formatCurrency } from '../../config/purchase.config';
import PDFUploadModal from '../PDFUploadModal';
import PDFUploadCard from '../global/ui/PDFUploadCard';
import BulkUploadInline from './BulkUploadInline';
import PDFVerificationFlow from './PDFVerificationFlow';
import PurchaseItemEditModal from './components/PurchaseItemEditModal';

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
  const [showVerificationFlow, setShowVerificationFlow] = useState(false);
  const [extractedPDFData, setExtractedPDFData] = useState(null);
  const [showItemEditModal, setShowItemEditModal] = useState(false);
  const [newProductToAdd, setNewProductToAdd] = useState(null);
  const [currentEditItem, setCurrentEditItem] = useState(null);
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
    payment_methods: [{ id: '1', method: 'cash', amount: 0 }], // Initialize with cash payment
    payment_status: 'pending',
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
        const date = new Date();
        const dateStr = date.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
        const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const fallbackNumber = `PUR-${dateStr}${randomNum}`; // Format: PUR-YYMMDD####
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

  // Update payment amount when final amount changes
  useEffect(() => {
    if (purchase.final_amount > 0 && purchase.payment_methods?.length > 0) {
      // If only one payment method and it's the default cash, update its amount
      if (purchase.payment_methods.length === 1 && purchase.payment_methods[0].method === 'cash') {
        setPurchase(prev => ({
          ...prev,
          payment_methods: [{ 
            id: '1', 
            method: 'cash', 
            amount: prev.final_amount 
          }]
        }));
      }
    }
  }, [purchase.final_amount]);

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
      // Check for product_id or product_name to ensure item is valid
      if (item.product_id || item.product_name) {
        const quantity = parseFloat(item.quantity) || 0;
        // Handle both purchase_price and rate fields
        const purchasePrice = parseFloat(item.purchase_price || item.rate || item.cost) || 0;
        const taxPercent = parseFloat(item.tax_percent || item.tax || item.gst_percent) || 0;
        
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

  // Generate invoice number if not provided
  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}${day}-${random}`;
  };

  const handleAddItem = (product) => {
    // Open modal for batch details instead of directly adding
    setNewProductToAdd({
      id: Date.now() + Math.random(), // Unique ID for tracking
      product_id: product.product_id || null,
      product_name: product.product_name || product.name || '',
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      mrp: parseFloat(product.mrp) || 0,
      selling_price: parseFloat(product.sale_price || product.selling_price) || parseFloat(product.mrp) || 0,
      tax_percent: parseFloat(product.tax_percent || product.gst_percent || product.tax_rate) || 0,
      discount_percent: parseFloat(product.discount_percent || product.discount) || 0,
      tax_amount: parseFloat(product.tax_amount) || 0,
      // Pack information
      pack_type: product.pack_type || product.packaging_type || 'STRIP',
      pack_size: product.pack_size || product.units_per_pack || 10,
      strips_per_box: product.strips_per_box || product.packages_per_box || 10,
      // Additional info
      category: product.category || '',
      brand_name: product.brand_name || product.brand || '',
      unit: product.unit || product.uom || 'Strip'
    });
    
    // Open modal instead of directly adding to table
    setShowItemEditModal(true);
  };

  // Handle saving item from modal
  const handleSaveItemFromModal = (editedItem) => {
    
    setPurchase(prev => {
      const newItems = [...(prev.items || []), editedItem];
      return {
        ...prev,
        items: newItems
      };
    });
    setNewProductToAdd(null);
    setShowItemEditModal(false);
  };

  const handleBulkUpload = (products) => {
    // For bulk upload, skip supplier verification and go directly to product verification
    // Check if supplier is already selected
    if (!purchase.supplier_id) {
      toast.error('Please select a supplier first');
      return;
    }

    const bulkData = {
      supplier_id: purchase.supplier_id,
      supplier_name: purchase.supplier_name,
      invoice_number: purchase.supplier_invoice_number,
      invoice_date: purchase.invoice_date,
      items: products.map((product, index) => ({
        // Core product info
        product_id: product.product_id || null,
        product_name: product.product_name || product.name || '',
        product_code: product.product_code,
        hsn_code: product.hsn_code || '',
        // Batch information
        batch_number: product.batch_no || product.batch_number || product.batch || '',
        expiry_date: product.expiry_date || product.expiry || '',
        manufacturing_date: product.manufacturing_date || product.mfg_date || '',
        // Quantities  
        quantity: parseFloat(product.quantity) || 1,
        free_quantity: parseFloat(product.free_quantity || product.free) || 0,
        // Pricing
        mrp: parseFloat(product.mrp) || 0,
        cost_price: parseFloat(product.purchase_price || product.cost_price || product.rate) || (parseFloat(product.mrp) || 0) * 0.7,
        selling_price: parseFloat(product.selling_price || product.sale_price) || parseFloat(product.mrp) || 0,
        // Discounts and taxes
        discount_percent: parseFloat(product.discount_percent || product.discount) || 0,
        tax_percent: parseFloat(product.tax_percent || product.gst_percent || product.tax_rate) || 0,
        // Pack information
        pack_type: product.pack_type || product.packaging_type || 'STRIP',
        pack_size: product.pack_size || product.units_per_pack || 10,
        // Additional info
        category: product.category || '',
        brand_name: product.brand_name || product.brand || '',
        unit: product.unit || product.uom || 'Strip'
      })),
      isBulkUpload: true // Flag to skip supplier verification in the flow
    };
    
    setExtractedPDFData(bulkData);
    setShowVerificationFlow(true);
    toast.info(`Verify ${products.length} products from bulk upload`);
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchase(prev => ({
      ...prev,
      items: (prev.items || []).map((item, i) => {
        if (i === index) {
          const updatedItem = { ...item, [field]: value };
          // Sync related fields to ensure calculations work
          if (field === 'rate') {
            updatedItem.purchase_price = value;
          } else if (field === 'purchase_price') {
            updatedItem.rate = value;
          } else if (field === 'tax') {
            updatedItem.tax_percent = value;
          } else if (field === 'tax_percent') {
            updatedItem.tax = value;
          } else if (field === 'batch_no') {
            // Sync batch fields
            updatedItem.batch_number = value;
            updatedItem.batch = value;
          } else if (field === 'batch_number' || field === 'batch') {
            updatedItem.batch_no = value;
            updatedItem.batch_number = value;
            updatedItem.batch = value;
          }
          return updatedItem;
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

    // Check if all items have expiry dates
    const itemsWithoutExpiry = purchase.items.filter(item => !item.expiry_date);
    if (itemsWithoutExpiry.length > 0) {
      toast.error(`Please add expiry dates for all items. ${itemsWithoutExpiry.length} item(s) missing expiry date.`);
      return;
    }

    // Auto-generate invoice number if not provided
    const invoiceNumber = purchase.supplier_invoice_number || generateInvoiceNumber();

    setSaving(true);
    try {
      // Prepare data for backend - matching what the transformer expects
      const purchaseData = {
        supplier_invoice_number: invoiceNumber,
        invoice_date: purchase.invoice_date,
        supplier_id: parseInt(purchase.supplier_id),
        // Add amounts for the transformer
        subtotal_amount: purchase.gross_amount || 0,
        tax_amount: purchase.tax_amount || 0,
        discount_amount: purchase.discount_amount || 0,
        final_amount: purchase.final_amount || 0,
        other_charges: purchase.other_charges || 0,
        items: purchase.items.map((item, index) => {
          // Ensure product_id is valid - only use if it's a reasonable database ID
          let productId = null;
          if (item.product_id && item.product_id !== item.id) {
            const parsed = parseInt(item.product_id);
            // Check if it's a valid database ID (not a timestamp)
            if (!isNaN(parsed) && parsed > 0 && parsed < 2147483647) {
              productId = parsed;
            } else {
            }
          }
          
          return {
            product_id: productId, // Send null for new products, let backend create them
            product_name: item.product_name || '', // Add product_name as it's required
            batch_number: item.batch_no || item.batch_number || '',
            expiry_date: item.expiry_date || null,
            manufacturing_date: item.manufacturing_date || null,
            quantity: parseFloat(item.quantity) || 1, // This will be transformed to ordered_quantity
            free_quantity: parseFloat(item.free_quantity) || 0,
            purchase_price: parseFloat(item.purchase_price) || 0, // This will be transformed to cost_price
            mrp: parseFloat(item.mrp) || 0,
            selling_price: parseFloat(item.selling_price || item.sale_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            tax_percent: parseFloat(item.tax_percent) || 12,
            // Pack information
            pack_type: item.pack_type || 'STRIP',
            pack_size: parseInt(item.pack_size) || 10,
            strips_per_box: parseInt(item.strips_per_box) || 10,
            // Additional fields
            hsn_code: item.hsn_code || '',
            category: item.category || '',
            brand_name: item.brand_name || ''
          };
        }),
        // Handle split payments
        payment_methods: purchase.payment_methods && purchase.payment_methods.length > 0 
          ? purchase.payment_methods 
          : [{ method: 'cash', amount: purchase.final_amount }],
        payment_mode: purchase.payment_methods && purchase.payment_methods.length > 0
          ? purchase.payment_methods[0].method.toLowerCase()  // Primary payment method
          : 'cash',
        payment_status: purchase.payment_status || 'pending',
        notes: purchase.notes,
        transport_company: purchase.transport_company,
        vehicle_number: purchase.vehicle_number,
        lr_number: purchase.lr_number
      };

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
        
        // Store extracted data and show verification flow
        setExtractedPDFData({
          ...extractedData,
          supplier_name: extractedData.supplier_name,
          supplier_gstin: extractedData.supplier_gstin,
          supplier_address: extractedData.supplier_address,
          invoice_number: extractedData.invoice_number,
          invoice_date: extractedData.invoice_date,
          items: extractedData.items || [],
          gross_amount: extractedData.gross_amount || 0,
          tax_amount: extractedData.tax_amount || 0,
          final_amount: extractedData.final_amount || extractedData.total_amount || 0
        });
        
        setShowPDFUpload(false); // Close PDF upload modal
        setShowVerificationFlow(true); // Show verification flow
        
        toast.success('PDF parsed! Please verify the extracted information.');
      }
    } catch (error) {
      toast.error('Failed to parse PDF. Please try again.');
    }
  };

  // Handle verified data from verification flow
  const handleVerificationComplete = (verifiedData) => {
    // Map the verified items to the format expected by the purchase form
    const mappedItems = verifiedData.items.map((item, index) => ({
      id: Date.now() + index + Math.random(),
      product_id: item.product_id,
      product_name: item.product_name,
      product_code: item.product_code,
      hsn_code: item.hsn_code,
      // Batch information
      batch_no: item.batch_number,
      batch_number: item.batch_number,
      batch: item.batch_number,
      // Dates
      expiry_date: item.expiry_date,
      manufacturing_date: item.manufacturing_date,
      // Quantities
      quantity: parseFloat(item.quantity) || 0,
      free_quantity: parseFloat(item.free_quantity) || 0,
      // Pricing - ensure all price fields are synced
      mrp: parseFloat(item.mrp) || 0,
      purchase_price: parseFloat(item.cost_price) || 0,
      rate: parseFloat(item.cost_price) || 0,
      cost_price: parseFloat(item.cost_price) || 0,
      selling_price: parseFloat(item.selling_price) || parseFloat(item.mrp) || 0,
      sale_price: parseFloat(item.selling_price) || parseFloat(item.mrp) || 0,
      // Discounts and taxes
      discount_percent: parseFloat(item.discount_percent) || 0,
      tax_percent: parseFloat(item.tax_percent) || 12,
      tax: parseFloat(item.tax_percent) || 12,
      tax_amount: 0, // Will be calculated
      // Pack information
      pack_type: item.pack_type || 'STRIP',
      pack_size: item.pack_size || 10,
      strips_per_box: item.strips_per_box || 10,
      // Additional info
      category: item.category || '',
      brand_name: item.brand_name || '',
      unit: item.unit || 'Strip',
      isNewProduct: item.isNewProduct || false
    }));

    // Calculate totals
    let grossAmount = 0;
    let taxAmount = 0;
    
    mappedItems.forEach(item => {
      const itemAmount = (item.quantity * item.purchase_price);
      const itemTax = itemAmount * (item.tax_percent / 100);
      grossAmount += itemAmount;
      taxAmount += itemTax;
    });

    const netAmount = grossAmount + taxAmount;

    // Update purchase with ALL verified data
    setPurchase(prev => ({
      ...prev,
      supplier_invoice_number: verifiedData.invoice_number || prev.supplier_invoice_number,
      invoice_date: verifiedData.invoice_date || prev.invoice_date,
      supplier_id: verifiedData.supplier_id,
      supplier_name: verifiedData.supplier_name,
      supplier_details: {
        supplier_id: verifiedData.supplier_id,
        supplier_name: verifiedData.supplier_name,
        gst_number: verifiedData.supplier_gst || verifiedData.supplier_gstin,
        primary_phone: verifiedData.supplier_phone,
        primary_email: verifiedData.supplier_email,
        address: verifiedData.supplier_address
      },
      items: mappedItems,
      gross_amount: grossAmount,
      tax_amount: taxAmount,
      net_amount: netAmount,
      final_amount: verifiedData.final_amount || netAmount,
      payment_type: verifiedData.payment_type || 'credit',
      payment_terms: verifiedData.payment_terms || 30,
      notes: verifiedData.notes || ''
    }));
    
    // Update supplier state
    if (verifiedData.supplier_id) {
      setSelectedSupplier({
        supplier_id: verifiedData.supplier_id,
        supplier_name: verifiedData.supplier_name,
        gst_number: verifiedData.supplier_gst || verifiedData.supplier_gstin,
        gstin: verifiedData.supplier_gstin || verifiedData.supplier_gst,
        primary_phone: verifiedData.supplier_phone,
        address: verifiedData.supplier_address
      });
    }
    
    // Close verification flow
    setShowVerificationFlow(false);
    setExtractedPDFData(null);
    
    // For bulk/extract method, show success message
    if (verifiedData.isBulkUpload || verifiedData.fromPDFExtract) {
      toast.success('Data verified! Please review and save the purchase entry.');
    } else {
      toast.success('Data verified and loaded successfully!');
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
          placeholder="Auto-generates if empty"
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
            setShowProductModal(true);
            // TODO: Pass searchQuery to pre-fill product name in modal
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table */}
      {purchase.items && purchase.items.length > 0 && (
        <div className="overflow-visible relative" style={{ minHeight: '300px', zIndex: 50 }}>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PURCHASE ITEMS</h3>
            <span className="ml-auto text-sm text-gray-500">{purchase.items.length} items</span>
          </div>
          
          {/* Using Global ItemsTable with mapped fields for purchase */}
          <ItemsTable
            items={purchase.items.map(item => ({
              ...item,
              // Map purchase fields to what ItemsTable expects
              rate: item.purchase_price || item.cost_price || 0,
              sale_price: item.selling_price || 0,
              discount: item.discount_percent || 0,
              tax: item.tax_percent || 0,
              gst_percent: item.tax_percent || 0,
              free: item.free_quantity || 0
            }))}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            readOnly={false}
            showActions={true}
            columns={['product', 'expiry', 'quantity', 'free', 'cost', 'mrp', 'selling', 'discount', 'tax', 'total', 'actions']}
            customColumns={{
              expiry: {
                label: 'Expiry',
                align: 'center',
                render: (item) => {
                  if (!item.expiry_date) return '-';
                  if (typeof item.expiry_date === 'string' && item.expiry_date.includes('/')) {
                    return item.expiry_date;
                  }
                  try {
                    const date = new Date(item.expiry_date);
                    if (!isNaN(date.getTime())) {
                      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
                    }
                  } catch (e) {}
                  return item.expiry_date;
                }
              },
              cost: {
                label: 'Cost',
                align: 'right',
                render: (item) => formatCurrency(parseFloat(item.purchase_price) || parseFloat(item.cost_price) || 0)
              },
              selling: {
                label: 'S.Price',
                align: 'right',
                render: (item) => formatCurrency(parseFloat(item.selling_price) || 0)
              },
              actions: {
                label: 'Actions',
                align: 'center',
                render: (item, index) => (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => {
                        setCurrentEditItem({ ...item, index });
                        setShowItemEditModal(true);
                      }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              }
            }}
          />
        </div>
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
      <div id="purchase-print-area" className="bg-white rounded-lg shadow-sm border border-green-200 p-6">
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

        {/* Payment Information - Properly Contained */}
        <div className="mb-6 bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
          <SplitPayment
            totalAmount={purchase.final_amount || 0}
            payments={purchase.payment_methods?.length > 0 ? purchase.payment_methods : [{ id: '1', method: 'cash', amount: purchase.final_amount || 0 }]}
            onChange={(payments, summary) => {
              setPurchase(prev => ({
                ...prev,
                payment_methods: payments,
                payment_status: summary?.status || 'pending'
              }));
            }}
            onPaymentStatusChange={(status) => {
              setPurchase(prev => ({ ...prev, payment_status: status }));
            }}
            allowPartial={true}
            allowSplit={true}
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
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-700">Item</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Batch</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Expiry</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Qty</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Free</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Cost</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">MRP</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Rate</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Disc%</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Tax%</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Tax Amt</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.items || []).map((item, index) => {
                const quantity = parseFloat(item.quantity) || 0;
                const freeQty = parseFloat(item.free_quantity) || 0;
                const cost = parseFloat(item.purchase_price) || parseFloat(item.cost_price) || 0;
                const mrp = parseFloat(item.mrp) || 0;
                const sellingPrice = parseFloat(item.selling_price) || 0;
                const discountPercent = parseFloat(item.discount_percent) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                
                // Calculate amounts
                const baseAmount = quantity * cost;
                const discountAmount = (baseAmount * discountPercent) / 100;
                const discountedAmount = baseAmount - discountAmount;
                const taxAmount = (discountedAmount * taxPercent) / 100;
                const totalWithTax = discountedAmount + taxAmount;
                
                // Format expiry date if exists
                const expiryDisplay = (() => {
                  if (!item.expiry_date) return '-';
                  
                  // If it's already in MM/YYYY format, just return it
                  if (typeof item.expiry_date === 'string' && item.expiry_date.includes('/')) {
                    return item.expiry_date;
                  }
                  
                  // If it's a Date object or date string, format it
                  try {
                    const date = new Date(item.expiry_date);
                    if (!isNaN(date.getTime())) {
                      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
                    }
                  } catch (e) {
                    // Fall back to the raw value if parsing fails
                  }
                  
                  return item.expiry_date;
                })();
                
                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2">
                      <div>
                        <p className="text-xs font-medium">{item.product_name}</p>
                        {item.hsn_code && (
                          <p className="text-[10px] text-gray-500">HSN: {item.hsn_code}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{item.batch_number || item.batch_no || item.batch || '-'}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{expiryDisplay}</td>
                    <td className="text-center py-2 px-2 text-xs font-medium">{quantity}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{freeQty > 0 ? freeQty : '-'}</td>
                    <td className="text-right py-2 px-2 text-xs font-medium">{formatCurrency(cost)}</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(mrp)}</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(sellingPrice)}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{discountPercent}%</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{taxPercent}%</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(taxAmount)}</td>
                    <td className="text-right py-2 px-2 text-xs font-bold text-green-600">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Clean Summary Section */}
        <div className="border-t-2 border-gray-200 pt-4">
          <div className="flex justify-between">
            {/* GST Breakdown - Left Side */}
            <div className="w-64">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">GST Breakdown</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                {(() => {
                  const gstBreakdown = {};
                  (purchase.items || []).forEach(item => {
                    const taxPercent = parseFloat(item.tax_percent) || 0;
                    const quantity = parseFloat(item.quantity) || 0;
                    const cost = parseFloat(item.purchase_price) || parseFloat(item.cost_price) || 0;
                    const discountPercent = parseFloat(item.discount_percent) || 0;
                    
                    const baseAmount = quantity * cost;
                    const discountAmount = (baseAmount * discountPercent) / 100;
                    const discountedAmount = baseAmount - discountAmount;
                    const taxAmount = (discountedAmount * taxPercent) / 100;
                    
                    if (taxPercent > 0) {
                      if (!gstBreakdown[taxPercent]) {
                        gstBreakdown[taxPercent] = { taxable: 0, tax: 0 };
                      }
                      gstBreakdown[taxPercent].taxable += discountedAmount;
                      gstBreakdown[taxPercent].tax += taxAmount;
                    }
                  });
                  
                  const gstBands = Object.keys(gstBreakdown).sort((a, b) => a - b);
                  
                  if (gstBands.length === 0) {
                    return <p className="text-xs text-gray-500">No GST applicable</p>;
                  }
                  
                  return gstBands.map(band => (
                    <div key={band} className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        GST @ {band}%
                        <span className="text-[10px] ml-1 text-gray-400">
                          (₹{gstBreakdown[band].taxable.toFixed(2)})
                        </span>
                      </span>
                      <span className="font-medium text-gray-800">
                        {formatCurrency(gstBreakdown[band].tax)}
                      </span>
                    </div>
                  ));
                })()}
                <div className="pt-2 mt-2 border-t border-gray-200">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700">Total GST</span>
                    <span className="font-bold text-gray-900">{formatCurrency(purchase.tax_amount)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Total Summary - Right Side */}
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
                 purchase.items && 
                 purchase.items.length > 0;
        }}
        onSave={handleSavePurchase}
        onPrint={handlePrint}
        isSaving={saving}
        saveLabel="Save Purchase"
        
        // Footer totals
        footerTotals={{
          itemCount: purchase.items?.length || 0,
          totalAmount: purchase.final_amount || 0,
          subtotal: purchase.gross_amount || 0,
          tax: purchase.tax_amount || 0,
          roundOff: purchase.round_off || 0,
          grandTotal: purchase.final_amount || 0
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
            
            // Store extracted data and show verification flow
            const extractedPDFData = {
              supplier_name: data.supplier_name || data.vendor_name || '',
              supplier_gstin: data.supplier_gstin || data.vendor_gstin || '',
              supplier_address: data.supplier_address || data.vendor_address || '',
              supplier_id: data.supplier_id || null,
              invoice_number: data.invoice_number || '',
              invoice_date: data.invoice_date || '',
              items: (data.items || []).map(item => ({
                product_id: item.product_id || null,
                product_name: item.product_name || item.name || '',
                hsn_code: item.hsn_code || '',
                batch_number: item.batch_number || item.batch_no || '',
                expiry_date: item.expiry_date || '',
                manufacturing_date: item.manufacturing_date || '',
                quantity: parseFloat(item.quantity) || 0,
                free_quantity: parseFloat(item.free_quantity) || 0,
                cost_price: parseFloat(item.cost_price || item.rate || item.purchase_price) || 0,
                mrp: parseFloat(item.mrp) || 0,
                selling_price: parseFloat(item.selling_price || item.sale_price) || parseFloat(item.mrp) || 0,
                discount_percent: parseFloat(item.discount_percent) || 0,
                tax_percent: parseFloat(item.tax_percent || item.gst_percent) || 0,
                pack_type: item.pack_type || 'STRIP',
                pack_size: item.pack_size || 10
              })),
              gross_amount: data.subtotal || data.gross_amount || 0,
              tax_amount: data.tax_amount || 0,
              final_amount: data.grand_total || data.total_amount || 0
            };
            
            setExtractedPDFData(extractedPDFData);
            setShowPDFUpload(false); // Close PDF upload modal
            setShowVerificationFlow(true); // Show verification flow
            
            toast.success('PDF parsed! Please verify the extracted information.');
          }}
        />
      )}

      {/* PDF Verification Flow Modal */}
      {showVerificationFlow && extractedPDFData && (
        <PDFVerificationFlow
          extractedData={extractedPDFData}
          onComplete={handleVerificationComplete}
          onCancel={() => {
            setShowVerificationFlow(false);
            setExtractedPDFData(null);
          }}
        />
      )}

      {/* Success Modal with ShareDocument */}
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
          enableShare={true}
          partyDetails={{
            name: selectedSupplier?.supplier_name,
            phone: selectedSupplier?.phone,
            email: selectedSupplier?.email,
            supplier_id: selectedSupplier?.supplier_id
          }}
          documentData={{
            supplierInvoiceNumber: purchase.supplier_invoice_number,
            paymentStatus: purchase.payment_status,
            itemCount: purchase.items?.length || 0,
            date: purchase.invoice_date
          }}
        />
      )}

      {/* Purchase Item Edit Modal - Opens when product is selected or edit clicked */}
      {showItemEditModal && (
        <PurchaseItemEditModal
          isOpen={showItemEditModal}
          onClose={() => {
            setShowItemEditModal(false);
            setNewProductToAdd(null);
            setCurrentEditItem(null);
          }}
          item={currentEditItem || newProductToAdd}
          onSave={(updatedItem) => {
            if (currentEditItem && currentEditItem.index !== undefined) {
              // Editing existing item
              handleUpdateItem(currentEditItem.index, updatedItem);
              setCurrentEditItem(null);
            } else {
              // Adding new item
              handleSaveItemFromModal(updatedItem);
            }
            setShowItemEditModal(false);
          }}
          title={currentEditItem ? "Edit Purchase Item" : "Add Purchase Item - Enter Batch Details"}
          isNewItem={!currentEditItem}
        />
      )}
    </>
  );
};

export default EnhancedPurchaseEntry;