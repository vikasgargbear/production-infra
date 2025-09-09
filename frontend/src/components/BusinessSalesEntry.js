import React, { useState, useEffect, useRef } from 'react';
import { Search, Save, Printer, Plus, X, Calendar, AlertCircle, ChevronRight, ChevronLeft, Package, User, CreditCard, FileText, CheckCircle, Truck, Loader2, RefreshCw } from 'lucide-react';
import { customersApi, productsApi, ordersApi, orderItemsApi, batchesApi } from '../services/api';
import documentNumberService from '../services/documentNumberService';
import CustomerCreationB2B from './global/ui/forms/CustomerCreationB2B';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from './global/ui/feedback/Toast';
import { useCompany } from '../contexts/CompanyContext';

const BusinessSalesEntry = ({ open, onClose }) => {
  const toast = useToast();
  const { companyInfo } = useCompany();
  const [invoice, setInvoice] = useState({
    invoiceNo: 'INV-DRAFT', // Keep as draft until save
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerId: '',
    customerCode: '',
    customerName: '',
    customerDetails: null,
    items: [],
    totalAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    taxableAmount: 0,
    gstAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    gstBreakup: { '5': 0, '12': 0, '18': 0, '28': 0 },
    roundOff: 0,
    netAmount: 0,
    paymentMode: 'CASH',
    medicalRep: '',
    transportMode: '',
    transportCharges: 0,
    notes: ''
  });

  // State for real data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [challans, setChallans] = useState([]);
  const [transportModes, setTransportModes] = useState([]);
  const [medicalReps, setMedicalReps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Additional state variables
  const [saving, setSaving] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1: Invoice Details, 2: Payment & Summary
  const [companyLogo, setCompanyLogo] = useState(localStorage.getItem('companyLogo') || null);
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [availableChallans, setAvailableChallans] = useState([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);

  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);

  // Load data on component mount
  useEffect(() => {
    if (open) {
      loadAllData();
    }
  }, [open]);

  // Load all required data
  const loadAllData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Don't fetch invoice number on load - use temporary placeholder
      setInvoice(prev => ({ ...prev, invoiceNo: 'INV-DRAFT' }));
      
      await Promise.all([
        loadCustomers(),
        loadProducts(),
        loadChallans(),
        loadTransportModes(),
        loadMedicalReps()
      ]);
    } catch (error) {
      setError('Failed to load required data. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load customers from API
  const loadCustomers = async () => {
    try {
      const response = await customersApi.getAll();
      if (response?.data && Array.isArray(response.data)) {
        setCustomers(response.data);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      setCustomers([]);
    }
  };

  // Load products from API
  const loadProducts = async () => {
    try {
      const response = await productsApi.getAll();
      if (response?.data && Array.isArray(response.data)) {
        setProducts(response.data);
      } else {
        setProducts([]);
      }
    } catch (error) {
      setProducts([]);
    }
  };

  // Load challans from API
  const loadChallans = async () => {
    try {
      // Assuming there's a challans API endpoint
      const response = await ordersApi.getAll(); // Using orders as fallback
      if (response?.data && Array.isArray(response.data)) {
        // Filter for challans or use orders as challans
        setChallans(response.data.filter(order => order.order_type === 'challan' || order.type === 'challan'));
      } else {
        setChallans([]);
      }
    } catch (error) {
      setChallans([]);
    }
  };

  // Load transport modes from API or use defaults
  const loadTransportModes = async () => {
    try {
      const response = await ordersApi.getTransportModes();
      if (response?.data && Array.isArray(response.data)) {
        setTransportModes(response.data);
      } else {
        // Fallback to basic transport modes if API fails
        const fallbackTransportModes = [
          {
            transport_id: 'SELF',
            name: 'Self Pickup',
            description: 'Customer will collect from store'
          },
          {
            transport_id: 'LOCAL_DELIVERY',
            name: 'Local Delivery',
            description: 'Within city delivery'
          },
          {
            transport_id: 'COURIER_STD',
            name: 'Standard Courier',
            description: '3-5 business days'
          },
          {
            transport_id: 'COURIER_EXPRESS',
            name: 'Express Courier',
            description: '1-2 business days'
          },
          {
            transport_id: 'DEDICATED_VEHICLE',
            name: 'Dedicated Vehicle',
            description: 'Same day delivery'
          }
        ];
        setTransportModes(fallbackTransportModes);
      }
    } catch (error) {
      // Use minimal fallback if API fails
      const fallbackTransportModes = [
        {
          transport_id: 'SELF',
          name: 'Self Pickup',
          description: 'Customer will collect from store'
        },
        {
          transport_id: 'LOCAL_DELIVERY',
          name: 'Local Delivery',
          description: 'Within city delivery'
        }
      ];
      setTransportModes(fallbackTransportModes);
    }
  };

  // Load medical representatives from API or use defaults
  const loadMedicalReps = async () => {
    try {
      const response = await ordersApi.getMedicalReps();
      if (response?.data && Array.isArray(response.data)) {
        setMedicalReps(response.data);
      } else {
        setMedicalReps([]);
      }
    } catch (error) {
      setMedicalReps([]);
    }
  };

  // Reset form to initial state
  const resetForm = async () => {
    // Don't fetch new invoice number - use temporary placeholder
    
    setInvoice({
      invoiceNo: 'INV-DRAFT',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customerId: '',
      customerCode: '',
      customerName: '',
      customerDetails: null,
      items: [],
      totalAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 0,
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      gstBreakup: { '5': 0, '12': 0, '18': 0, '28': 0 },
      roundOff: 0,
      netAmount: 0,
      paymentMode: 'CASH',
      medicalRep: '',
      transportMode: '',
      transportCharges: 0,
      notes: ''
    });
    setSearchQuery('');
    setProductSearchQuery('');
    setSelectedItemIndex(null);
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // Helper functions
  const filteredCustomers = customers.filter(c => 
    searchQuery && (
      c.customer_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery)
    )
  );

  const filteredProducts = products.filter(p => 
    productSearchQuery && (
      p.product_code?.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      p.product_name?.toLowerCase().includes(productSearchQuery.toLowerCase())
    )
  );

  // Select customer
  const selectCustomer = (customer) => {
    setInvoice(prev => ({ 
      ...prev, 
      customerId: customer.customer_id,
      customerCode: customer.customer_code, 
      customerName: customer.name,
      customerDetails: customer
    }));
    setSearchQuery('');
    setShowCustomerSearch(false);
  };

  // Add product to invoice
  const addProduct = (product) => {
    const newItem = {
      id: Date.now(),
      productId: product.product_id,
      productCode: product.product_code,
      productName: product.product_name,
      hsnCode: product.hsn_code || '',
      packType: product.pack_type || '',
      qty: 1,
      freeQty: 0,
      mrp: product.mrp || 0,
      rate: product.sale_price || product.mrp || 0,
      discount: 0,
      taxPercent: product.gst_percent || 0,
      amount: 0,
      taxAmount: 0,
      netAmount: 0
    };

    // Calculate initial amounts for the new item
    const amount = newItem.qty * newItem.rate;
    const discountAmount = (amount * newItem.discount) / 100;
    const taxableAmount = amount - discountAmount;
    const taxAmount = (taxableAmount * newItem.taxPercent) / 100;
    const netAmount = taxableAmount + taxAmount;
    
    newItem.amount = amount;
    newItem.taxAmount = taxAmount;
    newItem.netAmount = netAmount;

    const updatedItems = [...invoice.items, newItem];
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
    setProductSearchQuery('');
    setShowProductSearch(false);
  };

  // Calculate totals with GST breakup
  const calculateTotals = (items) => {
    let totalAmount = 0;
    let totalTaxAmount = 0;
    let gstBreakup = { '5': 0, '12': 0, '18': 0, '28': 0 };

    const updatedItems = items.map(item => {
      const amount = item.qty * item.rate;
      const discountAmount = (amount * item.discount) / 100;
      const taxableAmount = amount - discountAmount;
      const taxAmount = (taxableAmount * item.taxPercent) / 100;
      const netAmount = taxableAmount + taxAmount;

      totalAmount += amount;
      totalTaxAmount += taxAmount;
      
      // Add to GST breakup
      if (gstBreakup[item.taxPercent.toString()]) {
        gstBreakup[item.taxPercent.toString()] += taxAmount;
      }

      return {
        ...item,
        amount,
        taxAmount,
        netAmount
      };
    });

    const discountAmount = (totalAmount * invoice.discountPercent) / 100;
    const taxableAmount = totalAmount - discountAmount;
    const transportCharges = parseFloat(invoice.transportCharges) || 0;
    const finalAmount = taxableAmount + totalTaxAmount + transportCharges;
    const roundOff = Math.round(finalAmount) - finalAmount;
    const netAmount = finalAmount + roundOff;

    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      totalAmount,
      discountAmount,
      taxableAmount,
      gstAmount: totalTaxAmount,
      cgstAmount: totalTaxAmount / 2,
      sgstAmount: totalTaxAmount / 2,
      gstBreakup,
      roundOff,
      netAmount
    }));
  };

  // Update item quantity
  const updateItemQty = (itemId, qty) => {
    const requestedQty = parseFloat(qty) || 0;
    
    const updatedItems = invoice.items.map(item => {
      if (item.id === itemId) {
        return { ...item, qty: requestedQty };
      }
      return item;
    });
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Update item rate
  const updateItemRate = (itemId, rate) => {
    const updatedItems = invoice.items.map(item => {
      if (item.id === itemId) {
        return { ...item, rate: parseFloat(rate) || 0 };
      }
      return item;
    });
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Update item discount
  const updateItemDiscount = (itemId, discount) => {
    const updatedItems = invoice.items.map(item => {
      if (item.id === itemId) {
        return { ...item, discount: parseFloat(discount) || 0 };
      }
      return item;
    });
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Remove item
  const removeItem = (itemId) => {
    const updatedItems = invoice.items.filter(item => item.id !== itemId);
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Save invoice
  const handleSaveInvoice = async () => {
    if (!invoice.customerId) {
      toast.error('Please select a customer');
      return;
    }

    if (invoice.items.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    setIsLoading(true);

    try {
      // Generate real invoice number only when saving
      let finalInvoice = { ...invoice };
      if (invoice.invoiceNo === 'INV-DRAFT' || invoice.invoiceNo.startsWith('INV-DRAFT')) {
        const invoiceNumber = await documentNumberService.generateInvoiceNumber();
        finalInvoice.invoiceNo = invoiceNumber;
        setInvoice(prev => ({ ...prev, invoiceNo: invoiceNumber }));
      }
      
      const response = await ordersApi.create(finalInvoice);
      
      if (response.success) {
        toast.created('Invoice', 4000, {
          action: (
            <button 
              onClick={() => window.print()}
              className="text-sm font-medium text-green-700 hover:text-green-800 underline"
            >
              Print Invoice
            </button>
          )
        });
        resetForm();
      } else {
        toast.error('Failed to save invoice. Please check your data and try again.');
      }
    } catch (error) {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate PDF for Download/Print
  const handleGeneratePDF = async () => {
    try {
      toast.info('PDF generation feature coming soon!', 3000);
    } catch (error) {
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  // Generate WhatsApp PDF
  const handleWhatsAppPDF = async () => {
    try {
      toast.info('WhatsApp PDF generation feature coming soon!', 3000);
    } catch (error) {
      toast.error('Failed to generate WhatsApp PDF. Please try again.');
    }
  };

  // Create invoice from challan
  const createFromChallan = (challan) => {
    // Find and set customer
    const customer = customers.find(c => c.customer_id === challan.customer_id);
    if (customer) {
      selectCustomer(customer);
    }

    // Add challan items to invoice
    const newItems = challan.items.map(item => {
      // Find product details
      const product = products.find(p => p.product_id === item.product_id);
      
      return {
        id: Date.now() + Math.random(),
        productId: item.product_id,
        productCode: item.product_code,
        productName: item.product_name,
        hsnCode: product?.hsn_code || '',
        packType: product?.pack_type || '',
        qty: item.qty,
        freeQty: 0,
        mrp: product?.mrp || item.rate,
        rate: item.rate,
        discount: 0,
        taxPercent: item.gst_percent || product?.gst_percent || 0,
        amount: item.amount,
        taxAmount: (item.amount * (item.gst_percent || product?.gst_percent || 0)) / 100,
        netAmount: item.amount + ((item.amount * (item.gst_percent || product?.gst_percent || 0)) / 100)
      };
    });

    setInvoice(prev => ({ ...prev, items: newItems }));
    calculateTotals(newItems);
    setShowChallanModal(false);
  };

  // Select batch for item (placeholder function)
  const selectBatch = (itemId, batch) => {
    // This function can be implemented later when batch functionality is needed
  };

  // Get expiry status (placeholder function)
  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return { color: 'gray', status: 'No Expiry' };
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const monthsUntilExpiry = (expiry - today) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsUntilExpiry < 0) {
      return { color: 'red', status: 'Expired', class: 'bg-red-100 text-red-800 border-red-300' };
    } else if (monthsUntilExpiry < 3) {
      return { color: 'orange', status: 'Expiring Soon', class: 'bg-orange-100 text-orange-800 border-orange-300' };
    } else if (monthsUntilExpiry < 6) {
      return { color: 'yellow', status: 'Short Expiry', class: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    } else {
      return { color: 'green', status: 'Good', class: 'bg-green-100 text-green-800 border-green-300' };
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex items-center mr-6">
                {localStorage.getItem('companyLogo') ? (
                  <img 
                    src={localStorage.getItem('companyLogo')} 
                    alt="Company Logo" 
                    className="h-10 w-10 object-contain rounded-lg mr-3"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-white font-bold text-lg">A</span>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">New Sales Invoice</h1>
                  <p className="text-xs text-gray-500">{companyInfo.name || 'Your Company'}</p>
                </div>
              </div>
              <span className="ml-4 text-sm text-gray-500">
                {invoice.invoiceNo} | {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              {currentStep === 1 ? (
                <button
                  onClick={() => {
                    if (!invoice.customerId) {
                      toast.error('Please select a customer');
                      return;
                    }
                    if (invoice.items.length === 0) {
                      toast.error('Please add at least one product');
                      return;
                    }
                    const hasInvalidItems = invoice.items.some(item => !item.qty || item.qty <= 0);
                    if (hasInvalidItems) {
                      toast.error('Please enter valid quantity for all items');
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Next: Payment Details
                  <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Back to Invoice
                  </button>
                  <button
                    onClick={handleSaveInvoice}
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save & Finalize'}
                  </button>
                </>
              )}
              <button
                onClick={handleWhatsAppPDF}
                disabled={invoice.items.length === 0 || !invoice.customerDetails?.phone}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.487"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center p-2 border border-transparent rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Loading State */}
      {isLoading && (
        <div className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          <span className="text-blue-800">Loading sales data...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {currentStep === 1 ? (
            <>
            {/* Customer Selection */}
            <div className="bg-gradient-to-r from-blue-50 to-white rounded-lg shadow-sm border border-blue-100 p-4 mb-4">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2">
                  <User className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">CUSTOMER</h3>
              </div>
              
              {!invoice.customerId ? (
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        ref={customerSearchRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowCustomerSearch(true);
                        }}
                        onFocus={() => setShowCustomerSearch(true)}
                        placeholder="Search customer by code, name or phone..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={() => setShowChallanModal(true)}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center"
                    >
                      <Truck className="w-4 h-4 mr-2" />
                      From Challan
                    </button>
                  </div>
                  
                  {showCustomerSearch && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((customer) => (
                          <div
                            key={customer.customer_id}
                            onClick={() => selectCustomer(customer)}
                            className="p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-gray-900">
                                  {customer.customer_code} - {customer.name}
                                </div>
                                <div className="text-sm text-gray-500 mt-1">
                                  {customer.phone} | {customer.area || 'N/A'}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium text-gray-900">
                                  Credit Limit: ₹{(customer.credit_limit || 0).toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  GST: {customer.gst_number || 'N/A'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center">
                          <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
                          <p className="text-gray-500 mb-4">
                            {searchQuery 
                              ? 'Try adjusting your search terms'
                              : 'No customers available in the system'
                            }
                          </p>
                          <div className="flex flex-col gap-2">
                            {!searchQuery && (
                              <button
                                onClick={handleRefresh}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center justify-center"
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Refresh Data
                              </button>
                            )}
                            <button
                              onClick={() => setShowCustomerModal(true)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Create New Customer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-300 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">
                          {invoice.customerCode} - {invoice.customerName}
                        </div>
                        <div className="text-xs text-gray-600">
                          Credit: ₹{(invoice.customerDetails?.credit_limit || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setInvoice(prev => ({
                          ...prev,
                          customerId: '',
                          customerCode: '',
                          customerName: '',
                          customerDetails: null
                        }));
                      }}
                      className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice Details - Compact */}
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice No.</label>
                  <input
                    type="text"
                    value={invoice.invoiceNo}
                    readOnly
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoice.invoiceDate}
                    onChange={(e) => setInvoice(prev => ({ ...prev, invoiceDate: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={invoice.dueDate}
                    onChange={(e) => setInvoice(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Quick Product Search */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 mb-4">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">PRODUCTS</h3>
              </div>
              
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  ref={productSearchRef}
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Type product name or code... (Press Ctrl+P to focus)"
                  className="w-full pl-14 pr-6 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-md"
                  autoFocus
                />
                {productSearchQuery && (
                  <button
                    onClick={() => setProductSearchQuery('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {productSearchQuery && (
                <div className="mt-4 bg-white rounded-lg shadow-lg border border-gray-200 max-h-80 overflow-auto">
                  {filteredProducts.length > 0 ? (
                    <>
                      {filteredProducts.slice(0, 10).map((product, index) => (
                        <div
                          key={product.product_id}
                          onClick={() => {
                            addProduct(product);
                            setProductSearchQuery('');
                          }}
                          className="p-4 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">{product.product_code}</div>
                              <div className="text-sm text-gray-600 mt-1">{product.product_name}</div>
                              <div className="text-xs text-gray-500 mt-1">Pack: {product.pack_type || 'N/A'} | HSN: {product.hsn_code || 'N/A'}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-blue-600">₹{product.sale_price || product.mrp}</div>
                              <div className="text-xs text-gray-500">MRP: ₹{product.mrp}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredProducts.length > 10 && (
                        <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                          Showing top 10 results. Keep typing to narrow down...
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center">
                      <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                      <p className="text-gray-500 mb-4">
                        {productSearchQuery 
                          ? 'Try adjusting your search terms'
                          : 'No products available in the system'
                        }
                      </p>
                      {!productSearchQuery && (
                        <button
                          onClick={handleRefresh}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Refresh Data
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Products List */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Added Products ({invoice.items.length})</h3>
              </div>

              {/* Products Table */}
              {invoice.items.length > 0 ? (
                <div className="overflow-x-auto bg-white rounded-lg shadow-inner">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-600 to-gray-700 text-white">
                        <th className="w-56 px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Product</th>
                        <th className="w-20 px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Pack</th>
                        <th className="w-44 px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Batch & Stock</th>
                        <th className="w-20 px-3 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Qty</th>
                        <th className="w-14 px-2 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Free</th>
                        <th className="w-20 px-3 py-3 text-right text-xs font-medium text-white uppercase tracking-wider">MRP</th>
                        <th className="w-20 px-3 py-3 text-right text-xs font-medium text-white uppercase tracking-wider">Rate</th>
                        <th className="w-16 px-2 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Disc%</th>
                        <th className="w-14 px-2 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">GST%</th>
                        <th className="w-24 px-3 py-3 text-right text-xs font-medium text-white uppercase tracking-wider">Amount</th>
                        <th className="w-12 px-3 py-3 text-center text-xs font-medium text-white uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {invoice.items.map((item, index) => (
                        <tr key={item.id} className={`border-b border-gray-200 transition-colors ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-purple-50`} style={{ minHeight: '80px' }}>
                          <td className="px-3 py-4 align-middle">
                            <div>
                              <div className="text-sm font-semibold text-gray-900 truncate">{item.productCode}</div>
                              <div className="text-xs text-gray-500 truncate">{item.productName}</div>
                            </div>
                          </td>
                          <td className="px-3 py-4 align-middle">
                            <div className="text-xs text-gray-700">{item.packType}</div>
                          </td>
                          <td className="px-3 py-4 align-middle">
                            <div className="space-y-1">
                              {item.availableBatches.length > 0 ? (
                                <select
                                  value={item.batchId || ''}
                                  onChange={(e) => {
                                    const batch = item.availableBatches.find(b => b.batch_id === e.target.value);
                                    if (batch) selectBatch(item.id, batch);
                                  }}
                                  className={`w-full px-2 py-1.5 border rounded text-xs ${
                                    item.expiryStatus?.class || 'border-gray-300'
                                  }`}
                                >
                                  <option value="">Select Batch (Optional)</option>
                                  {item.availableBatches.map((batch) => {
                                    const status = getExpiryStatus(batch.expiry_date);
                                    return (
                                      <option 
                                        key={batch.batch_id} 
                                        value={batch.batch_id}
                                        className={status.class}
                                      >
                                        {batch.batch_number} - Exp: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : 'N/A'}
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-500">No batches</span>
                              )}
                              {item.selectedBatch && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${item.expiryStatus?.class}`}>
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {item.expiryStatus?.status}
                                  </span>
                                  <span className="text-gray-600">Stock: {item.availableStock}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 align-middle">
                            <input
                              type="number"
                              value={item.qty}
                              onChange={(e) => updateItemQty(item.id, e.target.value)}
                              className={`w-full px-2 py-1.5 border rounded text-sm text-center font-medium ${
                                item.selectedBatch && item.qty > item.availableStock 
                                  ? 'border-red-500 bg-red-50' 
                                  : 'border-gray-300'
                              }`}
                              min="1"
                              max={item.availableStock || 999999}
                            />
                          </td>
                          <td className="px-2 py-4 align-middle">
                            <input
                              type="number"
                              value={item.freeQty}
                              onChange={(e) => {
                                const updatedItems = invoice.items.map(i => 
                                  i.id === item.id ? { ...i, freeQty: parseInt(e.target.value) || 0 } : i
                                );
                                setInvoice(prev => ({ ...prev, items: updatedItems }));
                              }}
                              className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-center"
                              min="0"
                            />
                          </td>
                          <td className="px-3 py-4 align-middle text-right text-xs font-medium">₹{item.mrp.toFixed(2)}</td>
                          <td className="px-3 py-4 align-middle">
                            <div className="w-full px-1 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-right font-medium">
                              ₹{item.rate.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-2 py-4 align-middle">
                            <input
                              type="number"
                              value={item.discount}
                              onChange={(e) => updateItemDiscount(item.id, e.target.value)}
                              className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-center"
                              min="0"
                              max="100"
                            />
                          </td>
                          <td className="px-2 py-4 align-middle">
                            <div className="text-sm text-gray-700 text-center font-semibold">{item.taxPercent}%</div>
                          </td>
                          <td className="px-3 py-4 align-middle text-right text-sm font-bold text-gray-700">₹{item.netAmount.toFixed(2)}</td>
                          <td className="px-3 py-4 align-middle text-center">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-lg">
                  <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Package className="w-10 h-10 text-purple-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-700">No products added yet</p>
                  <p className="text-sm text-gray-500 mt-2">Click "Add Product" to start building your invoice</p>
                </div>
              )}
            </div>
            </>
          ) : (
            /* Step 2: Payment & Summary */
            <>
              {/* Customer Summary Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Customer Summary
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Customer</p>
                    <p className="font-semibold">{invoice.customerName}</p>
                    <p className="text-sm text-gray-600">{invoice.customerCode}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Credit Limit</p>
                    <p className="font-semibold text-blue-600">₹{(invoice.customerDetails?.credit_limit || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Area</p>
                    <p className="font-semibold">{invoice.customerDetails?.area || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">GST Number</p>
                    <p className="font-semibold text-sm">{invoice.customerDetails?.gst_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Payment Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Mode
                    </label>
                    <select
                      value={invoice.paymentMode}
                      onChange={(e) => setInvoice(prev => ({ ...prev, paymentMode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="CASH">Cash</option>
                      <option value="CREDIT">Credit</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="NEFT">NEFT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Medical Representative <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    <select
                      value={invoice.medicalRep}
                      onChange={(e) => setInvoice(prev => ({ ...prev, medicalRep: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Medical Representative</option>
                      {medicalReps.map((rep) => (
                        <option key={rep.rep_id} value={rep.rep_id}>
                          {rep.name} - {rep.zone}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transport Mode <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    <select
                      value={invoice.transportMode}
                      onChange={(e) => setInvoice(prev => ({ ...prev, transportMode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Transport Mode</option>
                      {transportModes.map((transport) => (
                        <option key={transport.transport_id} value={transport.transport_id}>
                          {transport.name}
                        </option>
                      ))}
                    </select>
                    {invoice.transportMode && (
                      <p className="text-xs text-gray-500 mt-1">
                        {transportModes.find(t => t.transport_id === invoice.transportMode)?.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transport Charges <span className="text-gray-400 text-xs">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    value={invoice.transportCharges === 0 ? '' : invoice.transportCharges}
                    onChange={(e) => {
                      setInvoice(prev => ({ ...prev, transportCharges: parseFloat(e.target.value) || 0 }));
                      calculateTotals(invoice.items);
                    }}
                    placeholder="Enter transport charges"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Invoice Summary */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Invoice Summary
                </h2>
                
                {/* Items Summary */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Items ({invoice.items.length})</h3>
                  <div className="space-y-2">
                    {invoice.items.map((item, index) => (
                      <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.productName}</p>
                          <p className="text-xs text-gray-500">Batch: {item.batchNo} | Qty: {item.qty} | Rate: ₹{item.rate}</p>
                        </div>
                        <p className="font-semibold text-sm">₹{item.netAmount.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">₹{invoice.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Discount:</span>
                      <span className="font-medium">₹{invoice.discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">CGST:</span>
                      <span className="font-medium">₹{invoice.cgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">SGST:</span>
                      <span className="font-medium">₹{invoice.sgstAmount.toFixed(2)}</span>
                    </div>
                    {parseFloat(invoice.transportCharges) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Transport Charges:</span>
                        <span className="font-medium">₹{parseFloat(invoice.transportCharges).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Round Off:</span>
                      <span className="font-medium">₹{invoice.roundOff.toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-lg font-semibold">Net Amount:</span>
                        <span className="text-lg font-bold text-blue-600">₹{invoice.netAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* GST Breakup */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">GST Breakup</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(invoice.gstBreakup || {}).map(([rate, amount]) => 
                        amount > 0 && (
                          <div key={rate} className="text-xs">
                            <span className="text-gray-600">GST {rate}%:</span>
                            <span className="font-medium ml-1">₹{amount.toFixed(2)}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes Section - Moved to Bottom */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Additional Notes</h2>
                <textarea
                  value={invoice.notes}
                  onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes or special instructions..."
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

            </>
          )}
        </div>
      </div>

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Invoice Preview</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleGeneratePDF}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Download PDF
                </button>
                <button
                  onClick={handleWhatsAppPDF}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                >
                  WhatsApp PDF
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-8 bg-gray-50">
              <div id="invoice-print-content" className="bg-white p-4 shadow-lg mx-auto" style={{ maxWidth: '210mm', fontSize: '12px' }}>
                {/* Invoice Header */}
                <div className="border-b-2 border-gray-300 pb-6 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center mb-1">
                        {companyLogo ? (
                          <img 
                            src={companyLogo} 
                            alt="Company Logo" 
                            className="h-10 w-auto object-contain mr-3"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center mr-2">
                            <span className="text-white font-bold text-sm">A</span>
                          </div>
                        )}
                        <h1 className="text-xl font-bold text-gray-900">AASO PHARMACEUTICALS</h1>
                      </div>
                      <p className="text-xs text-gray-600">Gangapur City, Rajasthan | GST: 08AAXCA4042N1Z2</p>
                      <p className="text-xs text-gray-600">Phone: +91 98765 43210</p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-lg font-bold text-gray-900">INVOICE</h2>
                      <p className="text-xs text-gray-600">No: {invoice.invoiceNo}</p>
                      <p className="text-xs text-gray-600">Date: {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Bill To:</h3>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="font-semibold text-gray-900">{invoice.customerName || 'N/A'}</p>
                    <p className="text-sm text-gray-600">{invoice.customerDetails?.phone || 'N/A'}</p>
                    <p className="text-sm text-gray-600">{invoice.customerDetails?.address || invoice.customerDetails?.area || 'N/A'}</p>
                    <p className="text-sm text-gray-600">GSTIN: {invoice.customerDetails?.gst_number || 'N/A'}</p>
                  </div>
                </div>

                {/* Items Table */}
                <div className="mb-6">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-y-2 border-gray-300">
                        <th className="text-left py-2 px-3 text-sm font-semibold">#</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold">Product</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold">Batch</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold">Qty</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold">MRP</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold">Rate</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold">Disc%</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold">GST%</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 px-3 text-sm">{index + 1}</td>
                          <td className="py-2 px-3 text-sm">
                            <div>
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-xs text-gray-600">{item.hsnCode ? `HSN: ${item.hsnCode}` : ''}</p>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-sm">
                            {item.batchNo}
                            {item.expiryDate && (
                              <p className="text-xs text-gray-600">
                                Exp: {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm text-center">{item.qty}</td>
                          <td className="py-2 px-3 text-sm text-right">₹{item.mrp.toFixed(2)}</td>
                          <td className="py-2 px-3 text-sm text-right">₹{item.rate.toFixed(2)}</td>
                          <td className="py-2 px-3 text-sm text-center">{item.discount}%</td>
                          <td className="py-2 px-3 text-sm text-center">{item.taxPercent}%</td>
                          <td className="py-2 px-3 text-sm text-right font-medium">₹{item.netAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary and Bank Details Side by Side */}
                <div className="flex justify-between items-start mt-6">
                  {/* Bank Details - Left Side */}
                  <div className="w-1/2 pr-4">
                    <div className="bg-gray-50 p-3 rounded border">
                      <h4 className="font-semibold text-sm mb-2">Bank Details</h4>
                      <div className="text-xs space-y-1">
                        <p><strong>Bank:</strong> State Bank of India</p>
                        <p><strong>Branch:</strong> Gangapur City</p>
                        <p><strong>A/C No:</strong> 20012345678</p>
                        <p><strong>IFSC:</strong> SBIN0001234</p>
                        <p><strong>UPI ID:</strong> aaso@sbi</p>
                      </div>
                    </div>
                    <div className="mt-3 text-xs">
                      <p className="text-gray-600">Payment Mode: {invoice.paymentMode}</p>
                      {invoice.notes && (
                        <p className="text-gray-600 mt-1">Notes: {invoice.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Summary - Right Side */}
                  <div className="w-1/2 pl-4">
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <div className="flex justify-between py-1">
                        <span className="text-sm">Subtotal:</span>
                        <span className="text-sm font-medium">₹{invoice.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-sm">Discount:</span>
                        <span className="text-sm font-medium">₹{invoice.discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-sm">CGST:</span>
                        <span className="text-sm font-medium">₹{invoice.cgstAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-sm">SGST:</span>
                        <span className="text-sm font-medium">₹{invoice.sgstAmount.toFixed(2)}</span>
                      </div>
                      {parseFloat(invoice.transportCharges) > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-sm">Transport Charges:</span>
                          <span className="text-sm font-medium">₹{parseFloat(invoice.transportCharges).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1">
                        <span className="text-sm">Round Off:</span>
                        <span className="text-sm font-medium">₹{invoice.roundOff.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t-2 border-blue-300 mt-2">
                        <span className="text-lg font-semibold text-blue-800">Total:</span>
                        <span className="text-lg font-bold text-blue-800">₹{invoice.netAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-right mt-3">
                      <p className="text-sm text-gray-600 mb-6">Authorized Signatory</p>
                      <div className="border-t border-gray-400 w-32 ml-auto"></div>
                    </div>
                  </div>
                </div>

                {/* GST Breakup for PDF */}
                <div className="mt-6 bg-gray-50 p-4 rounded border">
                  <h4 className="font-semibold text-sm mb-2">GST Breakup</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(invoice.gstBreakup || {}).map(([rate, amount]) => 
                      amount > 0 && (
                        <div key={rate} className="text-xs">
                          <span className="text-gray-600">GST {rate}%:</span>
                          <span className="font-medium ml-1">₹{amount.toFixed(2)}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Terms */}
                <div className="mt-6 text-xs text-gray-500">
                  <p>Terms & Conditions:</p>
                  <p>1. Goods once sold will not be taken back or exchanged</p>
                  <p>2. All disputes are subject to Gangapur City jurisdiction only</p>
                  <p>3. Payment due date: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'N/A'}</p>
                  <p>4. E. & O.E.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Beautiful PDF Preview Modal */}
      {showWhatsAppPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">WhatsApp Invoice Preview</h3>
              <button
                onClick={() => setShowWhatsAppPreview(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-8 bg-gray-50">
              <div 
                id="invoice-whatsapp-content" 
                className="bg-white p-8 shadow-lg mx-auto break-inside-avoid" 
                style={{ 
                  maxWidth: '210mm', 
                  pageBreakInside: 'avoid',
                  minHeight: '297mm',
                  position: 'relative',
                  zIndex: 1
                }}
              >
                {/* Beautiful Header with Gradient */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-8 rounded-t-lg mb-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center mb-4">
                        {companyLogo ? (
                          <img 
                            src={companyLogo} 
                            alt="Company Logo" 
                            className="h-16 w-auto object-contain mr-4 bg-white/90 p-2 rounded-xl shadow-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-white bg-opacity-20 rounded-xl flex items-center justify-center mr-4">
                            <span className="text-white font-bold text-2xl">A</span>
                          </div>
                        )}
                        <div>
                          <h1 className="text-3xl font-bold">AASO PHARMACEUTICALS</h1>
                          <p className="text-blue-100 text-lg">Wholesale & Distribution</p>
                        </div>
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="text-blue-100">📍 Gangapur City, Rajasthan - 322201</p>
                        <p className="text-blue-100">📞 +91 98765 43210 | 📧 info@aasopharma.com</p>
                        <p className="text-blue-100">🏛️ GSTIN: 08AAXCA4042N1Z2</p>
                      </div>
                    </div>
                    <div className="text-right bg-white bg-opacity-15 p-6 rounded-xl shadow-lg">
                      <h2 className="text-4xl font-bold mb-2">TAX INVOICE</h2>
                      <p className="text-blue-100 mt-2">Invoice No: {invoice.invoiceNo}</p>
                      <p className="text-blue-100">Date: {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</p>
                      {invoice.dueDate && (
                        <p className="text-blue-100">Due: {new Date(invoice.dueDate).toLocaleDateString('en-IN')}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Beautiful Customer Section */}
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-lg border-l-4 border-blue-600">
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                      <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mr-3 text-sm">👤</span>
                      Bill To
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="font-bold text-lg text-gray-900">{invoice.customerName || 'N/A'}</p>
                        <p className="text-gray-600 mt-1">{invoice.customerDetails?.address || invoice.customerDetails?.area || 'N/A'}</p>
                        <p className="text-gray-600">📞 {invoice.customerDetails?.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600"><strong>GSTIN:</strong> {invoice.customerDetails?.gst_number || 'N/A'}</p>
                        <p className="text-gray-600"><strong>Credit Limit:</strong> ₹{(invoice.customerDetails?.credit_limit || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Beautiful Items Table */}
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                    <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center mr-3 text-sm">📦</span>
                    Items Details
                  </h3>
                  <div className="overflow-hidden">
                    <table className="w-full border-collapse bg-white shadow-lg rounded-lg">
                      <thead>
                        <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                          <th className="text-center py-4 px-2 font-semibold text-sm w-10 align-middle">#</th>
                          <th className="text-left py-4 px-3 font-semibold text-sm align-middle">PRODUCT</th>
                          <th className="text-left py-4 px-2 font-semibold text-sm w-24 align-middle">Pack</th>
                          <th className="text-left py-4 px-3 font-semibold text-sm w-36 align-middle">Batch Info</th>
                          <th className="text-center py-4 px-2 font-semibold text-sm w-16 align-middle">Qty</th>
                          <th className="text-right py-4 px-3 font-semibold text-sm w-24 align-middle">MRP</th>
                          <th className="text-right py-4 px-3 font-semibold text-sm w-24 align-middle">Rate</th>
                          <th className="text-center py-4 px-3 font-semibold text-sm w-20 align-middle">GST%</th>
                          <th className="text-right py-4 px-3 font-semibold text-sm align-middle">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.items.map((item, index) => (
                          <tr key={item.id} className={`${index % 2 === 0 ? "bg-gray-50" : "bg-white"} border-b border-gray-200`}>
                            <td className="py-3 px-2 text-center font-medium text-sm">{index + 1}</td>
                            <td className="py-3 px-3">
                              <div>
                                <p className="font-semibold text-gray-900 text-sm leading-tight">{item.productName}</p>
                                <p className="text-xs text-gray-600 mt-1">Code: {item.productCode}</p>
                                <p className="text-xs text-gray-500">HSN: {item.hsnCode}</p>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <p className="text-xs font-medium text-blue-600">{item.packType}</p>
                            </td>
                            <td className="py-3 px-3">
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{item.batchNo}</p>
                                {item.expiryDate && (
                                  <p className="text-xs text-gray-600 mt-1">
                                    Exp: {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center font-semibold text-lg">{item.qty}</td>
                            <td className="py-3 px-2 text-right font-medium text-sm">₹{item.mrp.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right font-medium text-sm">₹{item.rate.toFixed(2)}</td>
                            <td className="py-3 px-3 text-center">
                              <span className="text-sm font-medium text-gray-700">{item.taxPercent}%</span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-lg text-green-700">₹{item.netAmount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Beautiful Summary Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* GST Breakup */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
                    <h4 className="text-lg font-bold text-green-800 mb-4 flex items-center">
                      <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">%</span>
                      Tax Breakup
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-green-700">CGST:</span>
                        <span className="font-bold text-green-800">₹{invoice.cgstAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-700">SGST:</span>
                        <span className="font-bold text-green-800">₹{invoice.sgstAmount.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-green-300 pt-2">
                        <div className="flex justify-between text-lg">
                          <span className="font-bold text-green-800">Total Tax:</span>
                          <span className="font-bold text-green-800">₹{invoice.gstAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-green-300">
                      <h5 className="font-semibold text-green-800 mb-2">Rate-wise Breakup:</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(invoice.gstBreakup || {}).map(([rate, amount]) => 
                          amount > 0 && (
                            <div key={rate} className="bg-white bg-opacity-60 p-2 rounded text-xs">
                              <span className="text-green-700">GST {rate}%:</span>
                              <span className="font-semibold ml-1">₹{amount.toFixed(2)}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Amount Summary */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
                    <h4 className="text-lg font-bold text-blue-800 mb-4 flex items-center">
                      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">₹</span>
                      Amount Summary
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-blue-700">Subtotal:</span>
                        <span className="font-medium">₹{invoice.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">Discount:</span>
                        <span className="font-medium">₹{invoice.discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">Tax Amount:</span>
                        <span className="font-medium">₹{invoice.gstAmount.toFixed(2)}</span>
                      </div>
                      {parseFloat(invoice.transportCharges) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-blue-700">Transport:</span>
                          <span className="font-medium">₹{parseFloat(invoice.transportCharges).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-blue-700">Round Off:</span>
                        <span className="font-medium">₹{invoice.roundOff.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-blue-300 pt-3">
                        <div className="flex justify-between text-xl">
                          <span className="font-bold text-blue-800">Net Amount:</span>
                          <span className="font-bold text-blue-800">₹{invoice.netAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment & Additional Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-lg border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-800 mb-4">Payment Information</h4>
                    <div className="space-y-2">
                      <p className="text-gray-700"><strong>Mode:</strong> {invoice.paymentMode}</p>
                      {invoice.medicalRep && (
                        <p className="text-gray-700"><strong>Medical Rep:</strong> {
                          medicalReps.find(rep => rep.rep_id === invoice.medicalRep)?.name || invoice.medicalRep
                        }</p>
                      )}
                      {invoice.transportMode && (
                        <p className="text-gray-700"><strong>Transport:</strong> {
                          transportModes.find(t => t.transport_id === invoice.transportMode)?.name || invoice.transportMode
                        }</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
                    <h4 className="text-lg font-bold text-orange-800 mb-4">Bank Details</h4>
                    <div className="space-y-1 text-sm">
                      <p className="text-orange-700"><strong>Bank:</strong> State Bank of India</p>
                      <p className="text-orange-700"><strong>A/C:</strong> 20012345678</p>
                      <p className="text-orange-700"><strong>IFSC:</strong> SBIN0001234</p>
                      <p className="text-orange-700"><strong>UPI:</strong> aaso@sbi</p>
                    </div>
                  </div>
                </div>

                {/* Notes & Terms */}
                {invoice.notes && (
                  <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                    <h4 className="font-semibold text-yellow-800 mb-2">Special Notes:</h4>
                    <p className="text-yellow-700">{invoice.notes}</p>
                  </div>
                )}

                <div className="bg-gray-50 p-6 rounded-lg border">
                  <h4 className="font-semibold text-gray-800 mb-3">Terms & Conditions:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    <div>
                      <p>• Goods once sold will not be taken back</p>
                      <p>• All disputes subject to Gangapur City jurisdiction</p>
                    </div>
                    <div>
                      <p>• Payment due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'On delivery'}</p>
                      <p>• E. & O.E.</p>
                    </div>
                  </div>
                </div>

                {/* Beautiful Footer */}
                <div className="mt-8 text-center p-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-b-lg">
                  <p className="text-lg font-semibold">Thank you for your business! 🙏</p>
                  <p className="text-blue-100 mt-2">Generated with ❤️ by {companyInfo.name || 'Your Company'}</p>
                  <div className="mt-4 pt-4 border-t border-blue-400">
                    <p className="text-sm text-blue-100">For any queries, contact us at {companyInfo.phone || '+91 XXXXX XXXXX'} or {companyInfo.email || 'info@company.com'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Challan Selection Modal */}
      {showChallanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center">
                <Truck className="w-6 h-6 text-purple-600 mr-3" />
                <h3 className="text-xl font-semibold text-gray-900">Select Delivery Challan</h3>
              </div>
              <button
                onClick={() => setShowChallanModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {challans.length > 0 ? (
                <div className="space-y-4">
                  {challans.map((challan) => (
                    <div
                      key={challan.challan_id}
                      className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => createFromChallan(challan)}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center">
                            <h4 className="text-lg font-semibold text-gray-900">{challan.challan_no}</h4>
                            <span className="ml-3 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                              {challan.delivery_status === 'pending' ? 'Pending' : 'Delivered'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Date: {new Date(challan.challan_date).toLocaleDateString('en-IN')}
                          </p>
                          <p className="text-sm font-medium text-purple-600 mt-1">
                            {challan.customer_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">₹{challan.total_amount.toFixed(2)}</p>
                          <p className="text-sm text-gray-500">{challan.items.length} items</p>
                        </div>
                      </div>
                      
                      <div className="border-t border-purple-100 pt-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Items:</h5>
                        <div className="space-y-1">
                          {challan.items.slice(0, 3).map((item, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                {item.product_name} ({item.qty} units)
                              </span>
                              <span className="text-gray-900 font-medium">₹{item.amount.toFixed(2)}</span>
                            </div>
                          ))}
                          {challan.items.length > 3 && (
                            <p className="text-sm text-gray-500 italic">...and {challan.items.length - 3} more items</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            createFromChallan(challan);
                          }}
                          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Convert to Invoice
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Truck className="w-10 h-10 text-purple-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-700">No pending challans found</p>
                  <p className="text-sm text-gray-500 mt-2">All delivery challans have been converted to invoices</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Creation Modal */}
      {showCustomerModal && (
        <CustomerCreationB2B
          onClose={() => setShowCustomerModal(false)}
          onCustomerCreated={(customer) => {
            // Add the new customer to the local state
            setCustomers(prev => [...prev, customer]);
            // Select the newly created customer
            setInvoice(prev => ({
              ...prev,
              customerId: customer.id || customer.customer_id || customer.party_id,
              customerCode: customer.customer_code || customer.code || '',
              customerName: customer.customer_name || customer.name || '',
              customerDetails: customer
            }));
            setShowCustomerModal(false);
            toast.success('Customer created successfully');
          }}
        />
      )}
    </div>
  );
};

export default BusinessSalesEntry;