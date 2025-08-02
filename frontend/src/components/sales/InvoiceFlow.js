import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, User, Search, Package, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, Calculator, History, ArrowLeft, ArrowRight, FileInput, MessageCircle
} from 'lucide-react';
import { customerAPI, productAPI, invoiceAPI, ordersAPI, salesOrdersAPI } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';
import InvoiceCalculator from '../../services/invoiceCalculator';
import InvoiceValidator from '../../services/invoiceValidator';
import DataTransformer from '../../services/dataTransformer';
import DateFormatter from '../../services/dateFormatter';
import InvoiceApiService from '../../services/invoiceApiService';
import { ProductSearchSimple, ItemsTable, ModuleHeader, CustomerSearch, ProductCreationModal, CustomerCreationModal, ViewHistoryButton, GSTCalculator } from '../global';
import InvoiceSummaryTop from './components/InvoiceSummaryTop';
// import BillSummary from './components/BillSummary';
import InvoicePreview from '../invoice/components/InvoicePreview';
import ImportDocumentModal from './components/ImportDocumentModal';

// Default org ID for development
const DEFAULT_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

const InvoiceFlow = ({ onClose, prefilledData = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Generate sequential invoice number
  const generateInvoiceNumber = async () => {
    const response = await InvoiceApiService.generateInvoiceNumber();
    if (response?.success && response?.data?.invoice_number) {
      return response.data.invoice_number;
    }
    
    // Fallback to local generation if needed
    const timestamp = Date.now();
    return `INV-${timestamp.toString().slice(-8)}`;
  };

  // Invoice data state - merge with prefilled data if provided
  const [invoice, setInvoice] = useState({
    invoice_no: 'INV-TEMP',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: prefilledData?.customer_id || '',
    customer_name: prefilledData?.customer_name || '',
    customer_details: prefilledData?.customer_details || null,
    billing_address: prefilledData?.billing_address || '',
    shipping_address: prefilledData?.shipping_address || '',
    items: prefilledData?.items || [],
    payment_mode: '',
    payment_status: 'Pending',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    notes: prefilledData?.notes || '',
    reference_no: prefilledData?.reference_no || '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    delivery_charges: 0,
    vehicle_number: '',
    lr_number: '',
    transport_company: ''
  });

  const [selectedCustomer, setSelectedCustomer] = useState(prefilledData?.customer_details || null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveInvoice();
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
            if (!selectedCustomer && customerSearchRef.current) {
              customerSearchRef.current.click();
            }
            break;
          case 'f':
            e.preventDefault();
            if (selectedCustomer && productSearchRef.current) {
              productSearchRef.current.focus();
            }
            break;
          case 'g':
            e.preventDefault();
            setShowGSTCalculator(true);
            break;
        }
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        if (showGSTCalculator) {
          setShowGSTCalculator(false);
        } else if (showCustomerModal) {
          setShowCustomerModal(false);
        } else if (showProductModal) {
          setShowProductModal(false);
        } else if (showImportModal) {
          setShowImportModal(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, selectedCustomer, showGSTCalculator, showCustomerModal, showProductModal, showImportModal]);

  // Focus first input on mount and generate invoice number
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
    
    // Generate invoice number asynchronously
    generateInvoiceNumber().then(invoiceNo => {
      setInvoice(prev => ({ ...prev, invoice_no: invoiceNo }));
    });
  }, []);

  // Preload data on mount
  useEffect(() => {
    searchCache.preloadData('customers', () => customerAPI.search('', { limit: 100 }));
    searchCache.preloadData('products', () => productAPI.search('', { limit: 100 }));
  }, []);

  // Calculate totals using backend API whenever items change
  useEffect(() => {
    if (invoice.items.length > 0 && invoice.customer_id) {
      // Try backend calculation but fallback to frontend if it fails
      calculateTotalsBackend().catch(() => {
        console.warn('Backend calculation failed, using frontend calculation');
        calculateTotals();
      });
    } else {
      calculateTotals(); // Fallback to frontend calculation
    }
  }, [invoice.items, invoice.discount_amount, invoice.delivery_charges, invoice.customer_id]);

  const calculateTotals = () => {
    const totals = InvoiceCalculator.calculateInvoiceTotals(invoice.items, invoice.gst_type);
    
    // Add delivery charges to the net amount (don't subtract discount as it's already in item calculations)
    const totalWithCharges = totals.netAmount + (invoice.delivery_charges || 0);
    
    // Apply additional invoice-level discount if any
    const totalAfterDiscount = totalWithCharges - (invoice.discount_amount || 0);
    
    const roundOff = Math.round(totalAfterDiscount) - totalAfterDiscount;
    const net = totalAfterDiscount + roundOff;

    setInvoice(prev => ({
      ...prev,
      gross_amount: totals.grossAmount,
      tax_amount: totals.gstAmount,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      total_amount: totals.grossAmount,
      round_off: roundOff,
      net_amount: net
    }));
  };

  // Use backend calculation API for security
  const calculateTotalsBackend = async () => {
    try {
      const response = await InvoiceApiService.calculateInvoice({
        customer_id: invoice.customer_id,
        delivery_type: invoice.delivery_type || 'PICKUP',
        payment_mode: invoice.payment_mode,
        invoice_date: invoice.invoice_date,
        items: invoice.items,
        delivery_charges: invoice.delivery_charges || 0,
        additional_discount: invoice.discount_amount || 0
      });

      if (response?.data) {
        const totals = response.data.totals || response.data;
        
        // Update invoice with backend calculated totals
        setInvoice(prev => ({
          ...prev,
          subtotal: parseFloat(totals.subtotal_amount || 0),
          gross_amount: parseFloat(totals.subtotal_amount || 0),
          tax_amount: parseFloat(totals.total_tax_amount || 0),
          cgst_amount: parseFloat(totals.cgst_amount || 0),
          sgst_amount: parseFloat(totals.sgst_amount || 0),
          igst_amount: parseFloat(totals.igst_amount || 0),
          total_amount: parseFloat(totals.final_amount || 0),
          round_off: parseFloat(totals.round_off || 0),
          net_amount: parseFloat(totals.final_amount || 0),
          final_amount: parseFloat(totals.final_amount || 0),
          discount_amount: parseFloat(totals.discount_amount || 0),
          gst_type: response.data.invoice_info?.gst_type || invoice.gst_type
        }));
      }
    } catch (error) {
      console.error('Backend calculation failed, using frontend:', error);
      calculateTotals(); // Fallback to frontend calculation
    }
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    if (customer) {
      const companyState = localStorage.getItem('companyState') || 'Gujarat';
      const isInterstate = customer.state && customer.state.toLowerCase() !== companyState.toLowerCase();
      
      setInvoice(prev => ({
        ...prev,
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        customer_details: customer,
        billing_address: `${customer.address}, ${customer.city}, ${customer.state}`,
        shipping_address: `${customer.address}, ${customer.city}, ${customer.state}`,
        gst_type: isInterstate ? 'IGST' : 'CGST/SGST'
      }));
      
      // Focus product search after customer selection
      setTimeout(() => {
        if (productSearchRef.current) {
          productSearchRef.current.focus();
        }
      }, 300);
    }
  };

  const handleAddItem = (product) => {
    const existingItem = invoice.items.find(item => item.product_id === product.product_id && item.batch_id === product.batch_id);
    
    if (existingItem) {
      // Update quantity of existing item
      handleUpdateItem(
        invoice.items.findIndex(item => item.product_id === product.product_id && item.batch_id === product.batch_id),
        'quantity',
        existingItem.quantity + 1
      );
    } else {
      // Create new item with all required fields
      const newItem = {
        item_id: Date.now(), // Unique identifier
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        batch_id: product.batch_id,
        batch_no: product.batch_number || product.batch_no,
        batch_number: product.batch_number || product.batch_no,
        hsn_code: product.hsn_code,
        expiry_date: product.expiry_date || product.batch_expiry_date,
        quantity: 1,
        mrp: product.mrp || product.sale_price || 0,
        rate: product.rate || product.sale_price || 0,
        sale_price: product.sale_price || 0,
        discount_percent: 0,
        free_quantity: 0,
        gst_percent: product.gst_percent || 12,
        tax_rate: product.gst_percent || 12,
        available_quantity: product.available_quantity || product.quantity_available || 0
      };
      
      // Calculate amounts properly considering quantity
      const quantity = 1;
      const rate = newItem.rate || newItem.sale_price || 0;
      const discountAmount = (quantity * rate * newItem.discount_percent) / 100;
      const baseAmount = (quantity * rate) - discountAmount;
      const taxAmount = (baseAmount * newItem.gst_percent) / 100;
      
      newItem.amount = baseAmount;
      newItem.tax_amount = taxAmount;
      newItem.final_amount = baseAmount + taxAmount;
      newItem.total = baseAmount + taxAmount;
      
      setInvoice(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
    }
  };

  const handleUpdateItem = (index, field, value) => {
    setInvoice(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i === index) {
          // Handle field updates
          const updatedItem = { ...item };
          
          if (field === 'quantity' || field === 'discount_percent' || field === 'free_quantity') {
            updatedItem[field] = parseFloat(value) || 0;
            
            // Recalculate totals using InvoiceCalculator
            const quantity = field === 'quantity' ? parseFloat(value) || 0 : updatedItem.quantity || 0;
            const rate = updatedItem.rate || updatedItem.sale_price || 0;
            const discount = field === 'discount_percent' ? parseFloat(value) || 0 : updatedItem.discount_percent || 0;
            
            const discountAmount = (quantity * rate * discount) / 100;
            const amount = (quantity * rate) - discountAmount;
            const taxAmount = (amount * (updatedItem.gst_percent || updatedItem.tax_rate || 12)) / 100;
            
            updatedItem.amount = amount;
            updatedItem.tax_amount = taxAmount;
            updatedItem.final_amount = amount + taxAmount;
            updatedItem.total = amount + taxAmount;
          } else {
            updatedItem[field] = value;
          }
          
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const handleRemoveItem = (index) => {
    setInvoice(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const validateInvoice = (checkPayment = false) => {
    if (!selectedCustomer) {
      setMessage('Please select a customer');
      setMessageType('error');
      return false;
    }

    if (!invoice.items || invoice.items.length === 0) {
      setMessage('Please add at least one item');
      setMessageType('error');
      return false;
    }

    if (checkPayment && !invoice.payment_mode) {
      setMessage('Please select a payment method');
      setMessageType('error');
      return false;
    }

    return true;
  };

  const handleProceedToReview = () => {
    if (validateInvoice()) {
      setCurrentStep(2);
      setMessage('');
    }
  };

  const handleSaveInvoice = async () => {
    if (!validateInvoice(true)) return; // Check payment method when saving

    setSaving(true);
    try {
      // Get org_id as UUID
      const orgId = localStorage.getItem('orgId') || DEFAULT_ORG_ID;
      
      // Map payment_mode to payment_terms for backend
      const paymentTermsMap = {
        'cash': 'cash',
        'credit': 'credit',
        'advance': 'advance'
      };
      
      // Prepare data for quick-sale endpoint
      const saleData = {
        customer_id: parseInt(invoice.customer_id),
        items: invoice.items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseInt(item.quantity) || 1,
          unit_price: parseFloat(item.rate) || parseFloat(item.sale_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          batch_id: item.batch_id ? parseInt(item.batch_id) : null
        })),
        payment_mode: invoice.payment_mode || 'Cash',
        payment_amount: invoice.payment_mode === 'Cash' ? parseFloat(invoice.net_amount) : 0,
        discount_amount: parseFloat(invoice.discount_amount) || 0,
        other_charges: parseFloat(invoice.delivery_charges) || 0,
        notes: `${invoice.notes || ''}\nDelivery: ${invoice.delivery_type || ''}\nTransport: ${invoice.transport_company || ''}\nVehicle: ${invoice.vehicle_number || ''}\nLR: ${invoice.lr_number || ''}`.trim(),
        // Include document references if importing
        order_id: invoice.order_id ? parseInt(invoice.order_id) : null,
        challan_id: invoice.challan_id ? parseInt(invoice.challan_id) : null
      };
      
      console.log('Creating quick sale with payload:', saleData);

      // Use enterprise-grade order API for atomic order + invoice creation
      const response = await apiClient.post('/enterprise-orders/quick-sale', saleData);
      
      console.log('Quick sale created successfully:', response.data);
      
      // Store the invoice details for future reference
      if (response.data) {
        localStorage.setItem('lastCreatedOrderId', response.data.order_id);
        localStorage.setItem('lastCreatedInvoiceId', response.data.invoice_id);
        localStorage.setItem('lastInvoiceNumber', response.data.invoice_number);
      }
      
      setMessage(`Invoice ${response.data.invoice_number} created successfully!`);
      setMessageType('success');
      
      // Show success for 2 seconds then close
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error creating invoice:', error);
      let errorMessage = 'Failed to create invoice';
      
      if (error.response?.data?.detail) {
        // Handle FastAPI validation errors
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          // Handle validation error array
          errorMessage = error.response.data.detail
            .map(err => err.msg || err.message || JSON.stringify(err))
            .join(', ');
        } else if (error.response.data.detail.msg) {
          // Handle single validation error object
          errorMessage = error.response.data.detail.msg;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = async () => {
    if (!selectedCustomer?.phone) {
      setMessage('Customer phone number not available');
      setMessageType('error');
      return;
    }

    // Format phone number (remove spaces, add country code if needed)
    let phoneNumber = selectedCustomer.phone.replace(/\s+/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+91' + phoneNumber; // Assuming India code
    }

    // Calculate total amount same way as InvoicePreview to ensure consistency
    let subtotal = 0;
    let totalTax = 0;
    
    (invoice.items || []).forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || parseFloat(item.sale_price) || 0;
      const discount = parseFloat(item.discount_percent) || 0;
      
      const discountAmount = (quantity * rate * discount) / 100;
      const itemAmount = (quantity * rate) - discountAmount;
      const gstPercent = parseFloat(item.gst_percent) || parseFloat(item.tax_rate) || 12;
      const taxAmount = (itemAmount * gstPercent) / 100;
      
      subtotal += itemAmount;
      totalTax += taxAmount;
    });
    
    const deliveryCharges = parseFloat(invoice.delivery_charges) || 0;
    const invoiceDiscount = parseFloat(invoice.discount_amount) || 0;
    const taxableAmount = subtotal - invoiceDiscount;
    const totalWithTax = taxableAmount + totalTax + deliveryCharges;
    const roundOff = Math.round(totalWithTax) - totalWithTax;
    const totalAmount = Math.round(totalWithTax);

    // Debug logging
    console.log('Invoice calculation for WhatsApp:', {
      subtotal,
      totalTax,
      deliveryCharges,
      invoiceDiscount,
      totalAmount,
      items: invoice.items
    });

    // Create WhatsApp message
    const message = encodeURIComponent(
      `Dear ${selectedCustomer.customer_name},\n\n` +
      `Your invoice ${invoice.invoice_no} dated ${new Date(invoice.invoice_date).toLocaleDateString('en-IN')} ` +
      `for amount ₹${totalAmount.toFixed(2)} has been generated.\n\n` +
      `Thank you for your business!\n\n` +
      `Regards,\nAASO Pharma`
    );

    // Note: WhatsApp Web doesn't support file attachments via URL
    // Users need to manually attach the PDF after clicking send
    // We could implement a PDF generation service that returns a download link
    
    // Open WhatsApp
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
    
    // Show info message
    setMessage('WhatsApp opened. Please attach the invoice PDF manually before sending.');
    setMessageType('info');
  };

  const clearMessage = () => setMessage('');

  // Handle import from challan/order
  const handleImport = (importData) => {
    // For both sales orders and challans, populate the form with imported data
    if (importData.customer_id) {
      setSelectedCustomer({
        customer_id: importData.customer_id,
        customer_name: importData.customer_name,
        phone: importData.customer_phone,
        address: importData.billing_address,
        ...importData.customer_details
      });
    }
    
    // Update invoice with imported data
    setInvoice(prev => ({
      ...prev,
      customer_id: importData.customer_id || prev.customer_id,
      customer_name: importData.customer_name || prev.customer_name,
      customer_details: importData.customer_details || prev.customer_details,
      billing_address: importData.billing_address || prev.billing_address,
      shipping_address: importData.delivery_address || importData.shipping_address || prev.shipping_address,
      items: importData.items || prev.items,
      reference_no: `${importData.source_type === 'sales-order' ? 'SO' : 'DC'}-${importData.source_id}`,
      notes: `Imported from ${importData.source_type === 'sales-order' ? 'Sales Order' : importData.source_type === 'challan' ? 'Delivery Challan' : 'Document'} #${importData.source_id}`,
      // Add transport details if from challan
      vehicle_number: importData.transport_details?.vehicle_number || prev.vehicle_number,
      lr_number: importData.transport_details?.lr_number || prev.lr_number,
      transport_company: importData.transport_details?.transport_company || prev.transport_company,
      // Link references
      order_id: importData.order_id,
      challan_id: importData.challan_id
    }));
    
    setMessage('Document imported successfully');
    setMessageType('success');
    setShowImportModal(false);
  };

  // Step 1: Input Form
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          
          {/* Header - Using Global ModuleHeader */}
          <ModuleHeader
            title="Invoice"
            documentNumber={invoice.invoice_no}
            status={invoice.status || 'draft'}
            icon={FileText}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="invoice"
            showSaveDraft={true}
            onSaveDraft={() => {
              console.log('Save draft clicked');
              // TODO: Implement save draft
            }}
            additionalActions={[]}
          />

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save Draft | <strong>Esc</strong> - Close
          </div>


          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Message Display */}
            {message && (
              <div className={`
                mb-4 p-3 rounded flex items-start text-sm
                ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                  messageType === 'error' ? 'bg-red-100 text-red-800' : 
                  'bg-blue-100 text-blue-800'
                }
              `}>
                {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Date Section */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Invoice Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={firstInputRef}
                    type="date"
                    value={invoice.invoice_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    tabIndex={1}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={invoice.due_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    tabIndex={2}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2 opacity-0">Import</label>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <FileInput className="w-4 h-4 text-gray-600" />
                  <span className="text-sm">Import from Order/Challan</span>
                </button>
              </div>
            </div>

            {/* Customer Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">CUSTOMER</h3>
              <CustomerSearch
                value={invoice?.customer_details || null}
                onChange={handleCustomerSelect}
                onCreateNew={() => setShowCustomerModal(true)}
                displayMode="full"
                placeholder="Search customer by name, phone, or code..."
                required
              />
            </div>

            {/* Products Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">PRODUCTS</h3>
              <ProductSearchSimple
                onAddItem={handleAddItem}
                onCreateProduct={() => setShowProductModal(true)}
                ref={productSearchRef}
              />
            </div>

            {/* Invoice Items */}
            {invoice.items.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">INVOICE ITEMS</h3>
                <ItemsTable
                  items={invoice.items}
                  onUpdateItem={handleUpdateItem}
                  onRemoveItem={handleRemoveItem}
                  totals={{
                    finalAmount: invoice.net_amount,
                    grandTotal: invoice.net_amount
                  }}
                  title="Invoice Items"
                />
              </div>
            )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 bg-white px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Total Items: {invoice.items.length} | Total Amount: <span className="text-2xl font-bold text-gray-900">₹{invoice.net_amount.toFixed(2)}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  tabIndex={100}
                >
                  Reset
                </button>
                <button
                  onClick={handleProceedToReview}
                  disabled={!selectedCustomer || invoice.items.length === 0}
                  className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                  tabIndex={101}
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Modals */}
        {showCustomerModal && (
          <CustomerCreationModal
            show={showCustomerModal}
            onClose={() => setShowCustomerModal(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCustomerModal(false);
              setMessage('Customer created successfully');
              setMessageType('success');
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            show={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(product) => {
              setShowProductModal(false);
              setMessage('Product created successfully');
              setMessageType('success');
              searchCache.clearCache('products');
            }}
          />
        )}

        {showGSTCalculator && (
          <GSTCalculator
            isOpen={showGSTCalculator}
            onClose={() => setShowGSTCalculator(false)}
          />
        )}

        {/* Import Document Modal */}
        {showImportModal && (
          <ImportDocumentModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            onImport={handleImport}
          />
        )}

      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Invoice"
          documentNumber={invoice.invoice_no}
          status="review"
          icon={FileText}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="invoice"
          additionalActions={[
            {
              label: "Back to Edit",
              onClick: () => setCurrentStep(1),
              icon: ArrowLeft,
              variant: "default"
            },
            {
              label: "Print",
              onClick: handlePrint,
              icon: Printer,
              variant: "default"
            },
            {
              label: "WhatsApp",
              onClick: handleWhatsAppShare,
              icon: MessageCircle,
              variant: "success"
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Invoice | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Close
        </div>

        {/* Content - Invoice Preview */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-6">
          {message && (
            <div className={`
              mb-4 p-3 rounded flex items-start text-sm
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Invoice Summary Top - Delivery & Payment Details */}
          <InvoiceSummaryTop
            invoice={invoice}
            onInvoiceUpdate={(updates) => setInvoice(prev => ({ ...prev, ...updates }))}
          />

          <InvoicePreview
            invoice={invoice}
            customer={selectedCustomer}
            companyInfo={{
              name: 'AASO Pharma',
              address: '123 Business Street, City, State',
              phone: '+91 98765 43210',
              email: 'info@aasopharma.com',
              gst: '07AABCU9603R1ZN',
              logo: null
            }}
          />

          {/* Notes */}
          <div className="max-w-6xl mx-auto mt-6 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
              <textarea
                value={invoice.notes}
                onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows="2"
                placeholder="Add any additional notes or comments..."
              />
            </div>
          </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total Amount: <span className="text-2xl font-bold text-gray-900">₹{invoice.net_amount.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back to Edit
              </button>
              <button
                onClick={handlePrint}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 border border-gray-300"
              >
                <Printer className="w-5 h-5 text-gray-700" />
                <span className="font-medium">Print</span>
              </button>
              <button
                onClick={handleWhatsAppShare}
                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="font-medium">WhatsApp</span>
              </button>
              <button
                onClick={handleSaveInvoice}
                disabled={saving}
                className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Save Invoice'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceFlow;