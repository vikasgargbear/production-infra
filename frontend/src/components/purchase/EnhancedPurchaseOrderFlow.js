import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Save, Printer, ArrowLeft, X, CheckCircle, AlertCircle, Share2, Calendar, Building2, Plus, Truck, CreditCard } from 'lucide-react';
import { suppliersApi, productsApi, purchaseApi } from '../../services/api';
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
  useToast,
  NumericInput,
  MonthYearPicker,
  StandardDatePicker
} from '../global';
import documentNumberGenerator from '../../services/offline/documents/documentNumberGenerator';
import { PURCHASE_CONFIG } from '../../config/purchase.config';

/**
 * EnhancedPurchaseOrderFlow - Purchase Order using the full global document system
 * Creates purchase orders to request goods from suppliers
 * Uses /purchase-orders/ endpoint
 */
const EnhancedPurchaseOrderFlow = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdPOData, setCreatedPOData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const productSearchRef = useRef(null);

  // Purchase Order data state
  const [purchaseOrder, setPurchaseOrder] = useState({
    po_no: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_terms: '30 days',
    delivery_terms: 'F.O.R. Destination',
    delivery_location: 'Main Warehouse',
    transport_mode: 'By Road',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    freight_charges: 0,
    net_amount: 0,
    final_amount: 0,
    notes: prefilledData?.notes || '',
    status: 'draft'
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Generate PO number on mount
  useEffect(() => {
    const generateAndSetPONumber = async () => {
      try {
        const poNumber = await documentNumberGenerator.generatePONumber();
        setPurchaseOrder(prev => ({ ...prev, po_no: poNumber }));
      } catch (error) {
        const fallbackNumber = `PO-${Date.now().toString().slice(-8)}`;
        setPurchaseOrder(prev => ({ ...prev, po_no: fallbackNumber }));
      }
    };

    generateAndSetPONumber();
  }, []);

  // Calculate totals whenever items change
  useEffect(() => {
    if (purchaseOrder.items) {
      calculateTotals();
    }
  }, [purchaseOrder.items, purchaseOrder.discount_amount, purchaseOrder.freight_charges]);

  const calculateTotals = () => {
    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      setPurchaseOrder(prev => ({
        ...prev,
        gross_amount: 0,
        tax_amount: 0,
        net_amount: 0,
        final_amount: 0
      }));
      return;
    }

    let grossTotal = 0;
    let taxTotal = 0;

    (purchaseOrder.items || []).forEach(item => {
      if (item.product_id) {
        const quantity = parseFloat(item.quantity) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;

        const itemTotal = quantity * unitPrice;
        const itemTax = (itemTotal * taxPercent) / 100;

        grossTotal += itemTotal;
        taxTotal += itemTax;
      }
    });

    const discountAmount = parseFloat(purchaseOrder.discount_amount) || 0;
    const freightCharges = parseFloat(purchaseOrder.freight_charges) || 0;
    const netAmount = grossTotal + taxTotal - discountAmount + freightCharges;

    setPurchaseOrder(prev => ({
      ...prev,
      gross_amount: grossTotal,
      tax_amount: taxTotal,
      net_amount: netAmount,
      final_amount: netAmount
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setPurchaseOrder(prev => ({
      ...prev,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      supplier_details: supplier
    }));
  };

  const handleAddItem = (product) => {
    const newItem = {
      id: Date.now() + Math.random(),
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      batch_number: product.batch_number || '',
      expiry_date: product.expiry_date || '',
      quantity: 1,
      unit: product.unit || product.uom || '',  // No default unit
      unit_price: product.purchase_price || (product.mrp || 0) * 0.7,
      mrp: product.mrp || 0,
      expected_rate: product.sale_price || product.selling_price || product.mrp || 0,
      tax_percent: product.tax_percent || 12,
      discount_percent: 0,
      free_quantity: 0,
      pack_type: 'STRIP',
      pack_size: 10,
      strips_per_box: 10,
      manufacturer: product.manufacturer || '',
      total: product.purchase_price || 0
    };

    setPurchaseOrder(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));

    if (productSearchRef.current) {
      setTimeout(() => productSearchRef.current.focus(), 100);
    }
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchaseOrder(prev => ({
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
    setPurchaseOrder(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index)
    }));
  };

  const handleSavePurchaseOrder = async () => {
    if (!validatePurchaseOrder()) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      const poData = {
        po_no: purchaseOrder.po_no,
        po_date: purchaseOrder.po_date,
        expected_delivery_date: purchaseOrder.expected_delivery_date,
        supplier_id: parseInt(purchaseOrder.supplier_id),
        items: purchaseOrder.items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseFloat(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12
        })),
        payment_terms: purchaseOrder.payment_terms,
        delivery_terms: purchaseOrder.delivery_terms,
        delivery_location: purchaseOrder.delivery_location,
        discount_amount: parseFloat(purchaseOrder.discount_amount) || 0,
        freight_charges: parseFloat(purchaseOrder.freight_charges) || 0,
        notes: purchaseOrder.notes
      };

      const response = await purchaseApi.createPurchaseOrder(poData);

      if (response && response.data) {
        const poNumber = response.data.po_no || purchaseOrder.po_no;

        setCreatedPOData({
          poNumber: poNumber,
          poId: response.data.po_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || purchaseOrder.supplier_name,
          totalAmount: purchaseOrder.final_amount
        });

        setShowSuccessModal(true);
        toast.success(`Purchase Order ${poNumber} created successfully!`);

        searchCache.clear();
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase order';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validatePurchaseOrder = () => {
    const errors = {};

    if (!selectedSupplier) {
      errors.supplier = 'Supplier is required';
    }

    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      errors.items = 'At least one item is required';
    }

    return Object.keys(errors).length === 0;
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };

  // Create content for step 1
  const createContent = (
    <>
      {/* PO Details - Date tiles */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">ORDER INFORMATION</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <StandardDatePicker
                label="PO Date"
                value={purchaseOrder.po_date}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, po_date: value }))}
                required
              />
            </div>
            <div>
              <StandardDatePicker
                label="Expected Delivery"
                value={purchaseOrder.expected_delivery_date}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, expected_delivery_date: value }))}
              />
            </div>
          </div>
        </ContentCard>
      </div>

      {/* Supplier Section */}
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
        <SupplierSearch
          value={selectedSupplier}
          onChange={handleSupplierSelect}
          onCreateNew={(searchQuery) => {
            setShowSupplierModal(true);
          }}
          displayMode="compact"
          placeholder="Search supplier by name, phone, or code..."
          clearable={true}
        />
        {errors.supplier && (
          <p className="text-red-500 text-xs mt-1">{errors.supplier}</p>
        )}
      </div>

      {/* Products Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS</h3>
          </div>
          <button
            onClick={() => setShowProductModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Product
          </button>
        </div>
        <ProductSearchSimple
          onAddItem={handleAddItem}
          onCreateProduct={(searchQuery) => {
            setShowProductModal(true);
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table - Enhanced like Purchase Entry */}
      {purchaseOrder.items && purchaseOrder.items.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">ORDER ITEMS</h3>
          </div>
          <ItemsTable
            items={purchaseOrder.items.map(item => ({
              ...item,
              rate: item.unit_price,
              tax: item.tax_percent,
              discount_percent: item.discount_percent || 0,
              free_quantity: item.free_quantity || 0,
              total: ((item.quantity || 0) * (item.unit_price || 0) * (1 + ((item.tax_percent || 0) / 100))).toFixed(2)
            }))}
            onUpdateItem={(index, field, value) => {
              const mappedField = field === 'rate' ? 'unit_price' :
                field === 'tax' ? 'tax_percent' :
                  field;
              handleUpdateItem(index, mappedField, value);
            }}
            onRemoveItem={handleRemoveItem}
            showTotals={false}
            title=""
            columns={['product', 'pack_type', 'pack_config', 'qty', 'free', 'mrp', 'rate', 'disc', 'tax', 'total']}
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
                    {/* TODO: Fetch pack types from backend categories */}
                    <option value="STRIP">STRIP</option>
                    <option value="BOX">BOX</option>
                    <option value="BOTTLE">BOTTLE</option>
                    <option value="VIAL">VIAL</option>
                    <option value="TUBE">TUBE</option>
                  </select>
                )
              },
              pack_config: {
                label: 'Pack Size',
                align: 'center',
                render: (item, index) => (
                  <div className="flex gap-1">
                    <NumericInput
                      value={item.pack_size}
                      onChange={(value) => handleUpdateItem(index, 'pack_size', value)}
                      min={1}
                      defaultValue={10}
                      width="w-8"
                      align="center"
                      clearable={false}
                      className="text-xs"
                    />
                    <span className="text-xs text-gray-400">×</span>
                    <NumericInput
                      value={item.strips_per_box}
                      onChange={(value) => handleUpdateItem(index, 'strips_per_box', value)}
                      min={1}
                      defaultValue={10}
                      width="w-8"
                      align="center"
                      clearable={false}
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
              rate: {
                label: 'Rate',
                align: 'center',
                render: (item, index) => (
                  <NumericInput
                    value={item.unit_price}
                    onChange={(value) => handleUpdateItem(index, 'unit_price', value)}
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
                  const price = parseFloat(item.unit_price) || 0;
                  const taxPercent = parseFloat(item.tax_percent) || 0;
                  const subtotal = qty * price;
                  const tax = subtotal * (taxPercent / 100);
                  const total = subtotal + tax;
                  return <span className="font-medium">₹{total.toFixed(2)}</span>;
                }
              }
            }}
          />

          {/* Totals Section */}
          {purchaseOrder.items?.length > 0 && (
            <div className="mt-4 bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-end">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span className="font-medium">₹{(purchaseOrder.gross_amount || 0).toFixed(2)}</span>
                  </div>
                  {purchaseOrder.freight_charges > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Freight Charges:</span>
                      <span>₹{purchaseOrder.freight_charges.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Tax Amount:</span>
                    <span>₹{(purchaseOrder.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span>Discount:</span>
                    <NumericInput
                      value={purchaseOrder.discount_amount}
                      onChange={(value) => setPurchaseOrder(prev => ({ ...prev, discount_amount: value }))}
                      min={0}
                      defaultValue={0}
                      decimalPlaces={2}
                      width="w-32"
                      prefix="₹"
                      clearable={true}
                      className="text-red-600"
                    />
                  </div>
                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Total Amount:</span>
                    <span className="text-blue-600">₹{(purchaseOrder.final_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}
    </>
  );

  // Review content for step 2
  const reviewContent = (
    <>
      {/* Delivery & Payment Terms */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">Delivery & Payment Terms</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Payment Terms</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={purchaseOrder.payment_terms || '30 days'}
                  onChange={(e) => setPurchaseOrder(prev => ({ ...prev, payment_terms: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Immediate">Immediate</option>
                  <option value="7 days">7 days</option>
                  <option value="15 days">15 days</option>
                  <option value="30 days">30 days</option>
                  <option value="45 days">45 days</option>
                  <option value="60 days">60 days</option>
                  <option value="90 days">90 days</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Delivery Terms</label>
              <input
                type="text"
                value={purchaseOrder.delivery_terms || ''}
                onChange={(e) => setPurchaseOrder(prev => ({ ...prev, delivery_terms: e.target.value }))}
                placeholder="e.g., F.O.R. Destination"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Freight Charges</label>
              <NumericInput
                value={purchaseOrder.freight_charges}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, freight_charges: value }))}
                min={0}
                defaultValue={0}
                decimalPlaces={2}
                width="w-full"
                prefix="₹"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Delivery Location</label>
              <input
                type="text"
                value={purchaseOrder.delivery_location}
                onChange={(e) => setPurchaseOrder(prev => ({ ...prev, delivery_location: e.target.value }))}
                placeholder="e.g., Main Warehouse"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Transport Mode</label>
              <select
                value={purchaseOrder.transport_mode}
                onChange={(e) => setPurchaseOrder(prev => ({ ...prev, transport_mode: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="By Road">By Road</option>
                <option value="By Rail">By Rail</option>
                <option value="By Air">By Air</option>
                <option value="By Sea">By Sea</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discount Amount</label>
              <NumericInput
                value={purchaseOrder.discount_amount}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, discount_amount: value }))}
                min={0}
                defaultValue={0}
                decimalPlaces={2}
                width="w-full"
                prefix="₹"
              />
            </div>
          </div>
        </ContentCard>
      </div>

      {/* PO Preview */}
      <ContentCard
        title="Purchase Order Preview"
        subtitle={null}
        actions={null}
      >
        <div className="bg-white rounded-lg p-6">
          {/* Company Branding Header */}
          <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold text-blue-600 mb-2">PHARMA SOLUTIONS PVT. LTD.</h1>
            <p className="text-sm text-gray-600">Wholesale Pharmaceutical Distributor</p>
            <p className="text-sm text-gray-600">GST: 27AAACP1234B1Z5 | Drug License: 20B/123456</p>
            <p className="text-sm text-gray-600">123 Business Park, Mumbai - 400001 | Tel: +91-22-12345678</p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">PURCHASE ORDER</h2>
            <p className="text-gray-600">PO No: <span className="font-semibold">{purchaseOrder.po_no}</span></p>
            <p className="text-gray-600">Date: {new Date(purchaseOrder.po_date).toLocaleDateString('en-IN')}</p>
            <p className="text-gray-600">Expected Delivery: {new Date(purchaseOrder.expected_delivery_date).toLocaleDateString('en-IN')}</p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* From (Company) */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-blue-900">From:</h3>
              <p className="text-blue-900 font-medium">Pharma Solutions Pvt. Ltd.</p>
              <p className="text-blue-800 text-sm">123 Business Park</p>
              <p className="text-blue-800 text-sm">Mumbai - 400001</p>
              <p className="text-blue-800 text-sm">Email: purchase@pharmasolutions.com</p>
            </div>

            {/* To (Supplier) */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-gray-700">To (Supplier):</h3>
              <p className="text-gray-900 font-medium">{selectedSupplier?.supplier_name}</p>
              {selectedSupplier?.phone && <p className="text-gray-600 text-sm">Phone: {selectedSupplier.phone}</p>}
              {selectedSupplier?.gst_number && <p className="text-gray-600 text-sm">GST: {selectedSupplier.gst_number}</p>}
              {selectedSupplier?.address && <p className="text-gray-600 text-sm">Address: {selectedSupplier.address}</p>}
            </div>
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2">Item</th>
                <th className="text-center py-2">Pack</th>
                <th className="text-center py-2">Qty</th>
                <th className="text-center py-2">Free</th>
                <th className="text-right py-2">MRP</th>
                <th className="text-right py-2">Rate</th>
                <th className="text-right py-2">Tax</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchaseOrder.items || []).map((item, index) => {
                const quantity = parseFloat(item.quantity) || 0;
                const unitPrice = parseFloat(item.unit_price) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                const itemTotal = quantity * unitPrice;
                const itemTax = (itemTotal * taxPercent) / 100;
                const totalWithTax = itemTotal + itemTax;

                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2 text-sm">
                      {item.pack_type || 'STRIP'} {item.pack_size || 10}×{item.strips_per_box || 10}
                    </td>
                    <td className="text-center py-2">{quantity}</td>
                    <td className="text-center py-2">{item.free_quantity || 0}</td>
                    <td className="text-right py-2">{formatCurrency(item.mrp)}</td>
                    <td className="text-right py-2">{formatCurrency(unitPrice)}</td>
                    <td className="text-right py-2">{taxPercent}%</td>
                    <td className="text-right py-2 font-medium">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan="7" className="text-right py-2 font-medium">Subtotal:</td>
                <td className="text-right py-2 font-medium">{formatCurrency(purchaseOrder.gross_amount)}</td>
              </tr>
              <tr>
                <td colSpan="7" className="text-right py-2">Tax:</td>
                <td className="text-right py-2">{formatCurrency(purchaseOrder.tax_amount)}</td>
              </tr>
              {purchaseOrder.freight_charges > 0 && (
                <tr>
                  <td colSpan="7" className="text-right py-2">Freight Charges:</td>
                  <td className="text-right py-2">{formatCurrency(purchaseOrder.freight_charges)}</td>
                </tr>
              )}
              {purchaseOrder.discount_amount > 0 && (
                <tr>
                  <td colSpan="7" className="text-right py-2">Discount:</td>
                  <td className="text-right py-2 text-red-600">-{formatCurrency(purchaseOrder.discount_amount)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-300">
                <td colSpan="7" className="text-right py-2 text-lg font-bold">Total Amount:</td>
                <td className="text-right py-2 text-lg font-bold">{formatCurrency(purchaseOrder.final_amount)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Terms & Conditions:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Payment Terms: {purchaseOrder.payment_terms || '30 days'}</li>
                <li>• Delivery Terms: {purchaseOrder.delivery_terms || 'F.O.R. Destination'}</li>
                <li>• Delivery Location: {purchaseOrder.delivery_location || 'Main Warehouse'}</li>
                <li>• Transport Mode: {purchaseOrder.transport_mode || 'By Road'}</li>
              </ul>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">Important Notes:</h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• Please ensure all items are properly packed</li>
                <li>• Include batch numbers and expiry dates</li>
                <li>• Send invoice copy with delivery</li>
                <li>• Quality certificate required for all items</li>
              </ul>
            </div>
          </div>

          {purchaseOrder.notes && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">Notes:</h4>
              <p className="text-sm text-yellow-800">{purchaseOrder.notes}</p>
            </div>
          )}
        </div>
      </ContentCard>
    </>
  );

  return (
    <>
      <EnhancedGlobalDocumentFlow
        documentType="purchase-order"
        documentData={purchaseOrder}
        onDocumentUpdate={setPurchaseOrder}
        onClose={onClose}

        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}

        // Step content
        createContent={createContent}
        reviewContent={reviewContent}

        // Validation & Actions
        canProceedToReview={() => {
          return !!selectedSupplier &&
            purchaseOrder.items &&
            purchaseOrder.items.length > 0;
        }}
        onSave={handleSavePurchaseOrder}
        onPrint={handlePrint}
        isSaving={saving}

        // Footer totals
        footerTotals={{
          itemCount: purchaseOrder.items?.length || 0,
          totalAmount: purchaseOrder.final_amount,
          subtotal: purchaseOrder.gross_amount,
          tax: purchaseOrder.tax_amount,
          freight: purchaseOrder.freight_charges,
          grandTotal: purchaseOrder.final_amount
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
            { key: 'Ctrl+S', action: 'Save PO' },
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
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && createdPOData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Purchase Order Created!"
          documentNumber={createdPOData.poNumber}
          documentId={createdPOData.poId}
          documentType="purchase-order"
          customerName={createdPOData.supplierName}
          totalAmount={createdPOData.totalAmount}
          onPrint={handlePrint}
          showCopy={true}
        />
      )}
    </>
  );
};

export default EnhancedPurchaseOrderFlow;