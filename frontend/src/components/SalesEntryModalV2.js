import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  User, 
  Search, 
  Package, 
  Receipt, 
  CreditCard,
  Calendar,
  X,
  Trash2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Printer,
  Share2,
  Plus,
  Truck
} from 'lucide-react';
import api, { customersApi, productsApi, ordersApi, orderItemsApi, batchesApi } from '../services/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { searchCache, cachedSearch } from '../utils/searchCache';

const SalesEntryModalV2 = ({ open = true, onClose }) => {
  const [invoice, setInvoice] = useState({
    // Backend field names
    order_id: null,
    customer_id: '',
    mr_id: '',
    order_date: new Date().toISOString().split('T')[0],
    gross_amount: 0,
    discount: 0,
    tax_amount: 0,
    final_amount: 0,
    payment_status: 'pending',
    status: 'placed',
    
    // UI fields
    invoice_no: 'INV-' + Date.now().toString().slice(-6),
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_code: '',
    customer_name: '',
    customer_details: null,
    items: [],
    total_amount: 0,
    discount_percent: 0,
    discount_amount: 0,
    taxable_amount: 0,
    gst_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    gst_breakup: { '5': 0, '12': 0, '18': 0, '28': 0 },
    round_off: 0,
    net_amount: 0,
    payment_mode: 'CASH',
    medical_rep: '',
    delivery_type: '',
    delivery_charges: 0,
    notes: '',
    // Bank details
    bank_name: localStorage.getItem('bankName') || '',
    account_number: localStorage.getItem('accountNumber') || '',
    ifsc_code: localStorage.getItem('ifscCode') || '',
    // Addresses
    billing_address: '',
    shipping_address: '',
    is_same_address: true,
    // Transport details
    vehicle_number: '',
    lr_number: '',
    transport_company: ''
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showBatchSelection, setShowBatchSelection] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    customer_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    gst_number: '',
    drug_license_number: ''
  });
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    product_code: '',
    manufacturer: '',
    hsn_code: '',
    gst_percent: 12,
    mrp: '',
    sale_price: '',
    category: 'Tablet',
    batch_number: '',
    mfg_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    quantity_available: ''
  });
  const [availableChallans] = useState([]); // No mock data

  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);

  // Sample medical representatives
  const medicalReps = [
    { mr_id: 1, mr_name: 'Dr. Rajesh Kumar' },
    { mr_id: 2, mr_name: 'Dr. Priya Sharma' },
    { mr_id: 3, mr_name: 'Dr. Amit Gupta' },
    { mr_id: 4, mr_name: 'Dr. Sunita Patel' }
  ];

  // Customer data - loaded from API
  const [customers, setCustomers] = useState([]);
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);

  // Load all products initially for quick access
  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await productsApi.getAll();
      const products = response.data.map(product => ({
        ...product,
        // Map backend fields to frontend expected fields
        sale_price: product.sale_price || product.price || product.purchase_price || 0,
        gst_percent: product.gst_percent || product.gst_rate || 12,
        batches: [] // Don't load batches until product is selected
      }));
      setProducts(products);
      console.log('Successfully loaded products:', products.length, 'products');
    } catch (error) {
      console.error('Failed to load products:', error);
      setProducts([]); // No fallback data - show empty list
    } finally {
      setLoadingProducts(false);
    }
  };

  // Search products from backend with caching
  const searchProducts = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      // Use cached search
      const response = await cachedSearch(
        'products',
        { search: query },
        async (params) => await productsApi.getAll(params)
      );
      
      const results = response.data.map(product => ({
        ...product,
        sale_price: product.sale_price || product.price || product.purchase_price || 0,
        gst_percent: product.gst_percent || product.gst_rate || 12,
        batch_count: product.batch_count || 0,
        available_batches: product.available_batches || 0,
        total_stock: product.total_stock || 0,
        batches: []
      }));
      setSearchResults(results);
      console.log('Search results:', results.length, 'products found for query:', query);
      console.log('First product data:', results[0]); // Debug log to see what fields we're getting
    } catch (error) {
      console.error('Failed to search products:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search function - reduced delay for faster feel
  const debounceTimer = useRef(null);
  const debouncedSearch = useCallback((query) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Immediate search for 2+ characters
    if (query.length >= 2) {
      debounceTimer.current = setTimeout(() => {
        searchProducts(query);
      }, 100); // Reduced to 100ms for ultra-fast response
    }
  }, []);

  const getExpiryStatus = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const monthsToExpiry = (expiry - today) / (1000 * 60 * 60 * 24 * 30);
    
    if (expiry < today) {
      return { status: 'expired', color: 'text-red-600', bg: 'bg-red-50' };
    } else if (monthsToExpiry <= 3) {
      return { status: 'expiring-soon', color: 'text-orange-600', bg: 'bg-orange-50' };
    } else {
      return { status: 'valid', color: 'text-green-600', bg: 'bg-green-50' };
    }
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setInvoice({
      ...invoice,
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_code: customer.customer_code,
      customer_details: customer
    });
    setShowCustomerSearch(false);
    setSearchQuery('');
  };

  const handleProductSelect = async (product) => {
    // Load batches for this product if not already loaded
    if (!product.batches || product.batches.length === 0) {
      try {
        const batchesResponse = await batchesApi.getByProduct(product.product_id);
        console.log('Batches response:', batchesResponse.data);
        
        // Handle response structure - could be { total, batches } or just array
        const batchesData = batchesResponse.data.batches || batchesResponse.data;
        const batchesArray = Array.isArray(batchesData) ? batchesData : [];
        
        const productWithBatches = {
          ...product,
          batches: batchesArray.map(batch => ({
            batch_id: batch.batch_id,
            batch_number: batch.batch_number,
            mfg_date: batch.manufacturing_date,
            expiry_date: batch.expiry_date,
            quantity_available: batch.quantity_available,
            selling_price: batch.selling_price || batch.cost_price || batch.mrp || product.sale_price || product.mrp || 0
          }))
        };
        setSelectedProduct(productWithBatches);
        
        // Update the product in the products list too
        setProducts(prev => prev.map(p => 
          p.product_id === product.product_id ? productWithBatches : p
        ));
      } catch (error) {
        console.error('Failed to load batches:', error);
        // Still show batch selection with empty batches
        setSelectedProduct({...product, batches: []});
      }
    } else {
      setSelectedProduct(product);
    }
    
    setShowBatchSelection(true);
    setProductSearchQuery('');
    setShowProductSearch(false);
  };

  const handleBatchSelect = (batch) => {
    if (!selectedProduct) return;
    
    const rate = batch.selling_price || selectedProduct.sale_price || selectedProduct.mrp || 0;
    const gstPercent = selectedProduct.gst_percent || 12;
    const taxableAmount = rate; // Assuming rate is exclusive of tax
    const gstAmount = (taxableAmount * gstPercent) / 100;
    
    // Check if it's inter-state transaction
    const companyState = localStorage.getItem('companyState') || 'Maharashtra';
    const customerState = invoice.customer_details?.state;
    const isInterState = customerState && customerState !== companyState;
    
    const newItem = {
      item_id: Date.now(),
      product_id: selectedProduct.product_id,
      product_name: selectedProduct.product_name,
      product_code: selectedProduct.product_code,
      hsn_code: selectedProduct.hsn_code,
      batch_id: batch.batch_id,
      batch_no: batch.batch_number,
      expiry_date: batch.expiry_date,
      quantity: 1,
      free_quantity: 0,
      rate: rate,
      mrp: selectedProduct.mrp || 0,
      discount_percent: 0,
      gst_percent: gstPercent,
      cgst_percent: isInterState ? 0 : gstPercent / 2,
      sgst_percent: isInterState ? 0 : gstPercent / 2,
      igst_percent: isInterState ? gstPercent : 0,
      amount: rate,
      discount_amount: 0,
      taxable_amount: taxableAmount,
      gst_amount: gstAmount,
      cgst_amount: isInterState ? 0 : gstAmount / 2,
      sgst_amount: isInterState ? 0 : gstAmount / 2,
      igst_amount: isInterState ? gstAmount : 0,
      total_amount: taxableAmount + gstAmount
    };

    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
    
    setShowBatchSelection(false);
    setSelectedProduct(null);
    calculateTotals([...invoice.items, newItem]);
  };

  const updateItemQuantity = (itemId, quantity) => {
    const updatedItems = invoice.items.map(item => {
      if (item.item_id === itemId) {
        const amount = quantity * (item.rate || 0);
        const discount = (amount * item.discount_percent) / 100;
        const taxableAmount = amount - discount;
        const gstAmount = (taxableAmount * (item.gst_percent || 12)) / 100;
        
        // Check if it's inter-state transaction
        const companyState = localStorage.getItem('companyState') || 'Maharashtra';
        const customerState = invoice.customer_details?.state;
        const isInterState = customerState && customerState !== companyState;
        
        return {
          ...item,
          quantity,
          amount,
          discount_amount: discount,
          taxable_amount: taxableAmount,
          gst_amount: gstAmount,
          cgst_amount: isInterState ? 0 : gstAmount / 2,
          sgst_amount: isInterState ? 0 : gstAmount / 2,
          igst_amount: isInterState ? gstAmount : 0,
          total_amount: taxableAmount + gstAmount
        };
      }
      return item;
    });

    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  const updateItemFreeQuantity = (itemId, freeQuantity) => {
    const updatedItems = invoice.items.map(item => {
      if (item.item_id === itemId) {
        return {
          ...item,
          free_quantity: freeQuantity
        };
      }
      return item;
    });

    setInvoice(prev => ({ ...prev, items: updatedItems }));
  };

  const updateItemDiscount = (itemId, discountPercent) => {
    const updatedItems = invoice.items.map(item => {
      if (item.item_id === itemId) {
        const amount = item.quantity * (item.rate || 0);
        const discount = (amount * discountPercent) / 100;
        const taxableAmount = amount - discount;
        const gstAmount = (taxableAmount * (item.gst_percent || 12)) / 100;
        
        // Check if it's inter-state transaction
        const companyState = localStorage.getItem('companyState') || 'Maharashtra';
        const customerState = invoice.customer_details?.state;
        const isInterState = customerState && customerState !== companyState;
        
        return {
          ...item,
          discount_percent: discountPercent,
          discount_amount: discount,
          taxable_amount: taxableAmount,
          gst_amount: gstAmount,
          cgst_amount: isInterState ? 0 : gstAmount / 2,
          sgst_amount: isInterState ? 0 : gstAmount / 2,
          igst_amount: isInterState ? gstAmount : 0,
          total_amount: taxableAmount + gstAmount
        };
      }
      return item;
    });

    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  const removeItem = (itemId) => {
    const updatedItems = invoice.items.filter(item => item.item_id !== itemId);
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  const calculateTotals = (items) => {
    const totals = items.reduce((acc, item) => {
      acc.gross_amount += (item.amount || 0);
      acc.discount_amount += (item.discount_amount || 0);
      acc.taxable_amount += (item.taxable_amount || 0);
      acc.gst_amount += (item.gst_amount || 0);
      acc.cgst_amount += (item.cgst_amount || 0);
      acc.sgst_amount += (item.sgst_amount || 0);
      acc.igst_amount += (item.igst_amount || 0);
      acc.total_amount += (item.total_amount || 0);

      // GST breakup by rate
      const gstRate = (item.gst_percent || 12).toString();
      if (!acc.gst_breakup[gstRate]) {
        acc.gst_breakup[gstRate] = {
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          total: 0
        };
      }
      acc.gst_breakup[gstRate].taxable += (item.taxable_amount || 0);
      acc.gst_breakup[gstRate].cgst += (item.cgst_amount || 0);
      acc.gst_breakup[gstRate].sgst += (item.sgst_amount || 0);
      acc.gst_breakup[gstRate].igst += (item.igst_amount || 0);
      acc.gst_breakup[gstRate].total += (item.gst_amount || 0);

      return acc;
    }, {
      gross_amount: 0,
      discount_amount: 0,
      taxable_amount: 0,
      gst_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_amount: 0,
      gst_breakup: {}
    });

    const finalAmount = totals.total_amount + (invoice.delivery_charges || 0);
    const roundOff = Math.round(finalAmount) - finalAmount;
    const netAmount = finalAmount + roundOff;

    setInvoice(prev => ({
      ...prev,
      gross_amount: totals.gross_amount,
      discount_amount: totals.discount_amount,
      taxable_amount: totals.taxable_amount,
      gst_amount: totals.gst_amount,
      cgst_amount: totals.cgst_amount,
      sgst_amount: totals.sgst_amount,
      igst_amount: totals.igst_amount,
      total_amount: totals.total_amount,
      gst_breakup: totals.gst_breakup,
      round_off: roundOff,
      net_amount: netAmount,
      final_amount: netAmount
    }));
  };

  const goToSummary = () => {
    if (!invoice.customer_id || invoice.items.length === 0) {
      alert('Please select a customer and add at least one product');
      return;
    }
    setCurrentStep(2);
  };

  const createFromChallan = (challan) => {
    // Find customer details
    const customer = customers.find(c => c.customer_id === challan.customer_id);
    if (customer) {
      handleCustomerSelect(customer);
    }
    
    // Convert challan items to invoice items
    const invoiceItems = challan.items.map(item => ({
      item_id: Date.now() + Math.random(),
      product_id: item.product_id,
      product_name: item.product_name,
      product_code: item.product_code,
      hsn_code: item.hsn_code,
      batch_id: item.batch_id,
      batch_no: item.batch_no,
      expiry_date: item.expiry_date,
      quantity: item.quantity,
      free_quantity: 0,
      rate: item.rate,
      mrp: item.mrp,
      discount_percent: item.discount_percent || 0,
      gst_percent: item.gst_percent,
      amount: item.quantity * item.rate,
      discount_amount: (item.quantity * item.rate * (item.discount_percent || 0)) / 100,
      taxable_amount: item.quantity * item.rate * (1 - (item.discount_percent || 0) / 100),
      gst_amount: (item.quantity * item.rate * (1 - (item.discount_percent || 0) / 100) * item.gst_percent) / 100,
      total_amount: item.quantity * item.rate * (1 - (item.discount_percent || 0) / 100) * (1 + item.gst_percent / 100)
    }));
    
    setInvoice(prev => ({
      ...prev,
      items: invoiceItems,
      challan_reference: challan.challan_number
    }));
    
    calculateTotals(invoiceItems);
    setShowChallanModal(false);
  };

  const saveInvoice = async () => {
    setSaving(true);
    try {
      // Prepare data for quick-sale endpoint
      const saleData = {
        customer_id: invoice.customer_id,
        items: invoice.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: parseFloat(item.rate),
          discount_percent: parseFloat(item.discount_percent || 0),
          batch_id: item.batch_id || null
        })),
        payment_mode: invoice.payment_mode === 'cash' ? 'Cash' : 'Credit',
        payment_amount: invoice.payment_mode === 'cash' ? parseFloat(invoice.net_amount) : 0,
        discount_amount: parseFloat(invoice.discount_amount || 0),
        other_charges: parseFloat(invoice.other_charges || 0),
        notes: `${invoice.notes || ''}\nDelivery: ${invoice.delivery_type || ''}\nTransport: ${invoice.transport_company || ''}\nVehicle: ${invoice.vehicle_number || ''}\nLR: ${invoice.lr_number || ''}`.trim()
      };

      // Use quick-sale endpoint for atomic order + invoice creation
      const response = await api.post('/quick-sale/', saleData);
      console.log('Quick sale created:', response.data);
      
      // Store order and invoice IDs for reference
      setInvoice(prev => ({ 
        ...prev, 
        order_id: response.data.order_id,
        invoice_id: response.data.invoice_id,
        invoice_no: response.data.invoice_number,
        order_number: response.data.order_number
      }));
      
      setCurrentStep(3);
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSaving(false);
    }
  };

  const generatePrintPDF = () => {
    window.print();
  };

  const generateWhatsAppPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const element = document.getElementById('invoice-content');
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Invoice-${invoice.invoice_no}.pdf`);
      
      const whatsappText = `Invoice ${invoice.invoice_no} - Amount: ₹${(invoice.net_amount || 0).toFixed(2)}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
      window.open(whatsappUrl, '_blank');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target)) {
        setShowCustomerSearch(false);
      }
      if (productSearchRef.current && !productSearchRef.current.contains(event.target)) {
        setShowProductSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load products and customers when component mounts
  useEffect(() => {
    loadProducts();
    loadCustomers();
  }, []);

  // Load customers from backend
  const loadCustomers = async () => {
    try {
      const response = await customersApi.getAll();
      console.log('Loaded customers from API:', response.data);
      // Handle response structure - could be { customers, total } or just array
      const customerData = response.data.customers || response.data;
      const customersArray = Array.isArray(customerData) ? customerData : [];
      setCustomers(customersArray);
    } catch (error) {
      console.error('Failed to load customers:', error);
      setCustomers([]); // Empty array on error
    }
  };

  // Search customers from backend with caching
  const searchCustomers = async (query) => {
    if (!query || query.length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    
    setCustomerSearchLoading(true);
    try {
      // Use cached search
      const response = await cachedSearch(
        'customers',
        { search: query },
        async (params) => await customersApi.getAll(params)
      );
      
      // Handle response structure - could be { customers, total } or just array
      const customerData = response.data.customers || response.data;
      const resultsArray = Array.isArray(customerData) ? customerData : [];
      setCustomerSearchResults(resultsArray);
      console.log('Customer search results:', resultsArray.length, 'customers found for query:', query);
    } catch (error) {
      console.error('Failed to search customers:', error);
      setCustomerSearchResults([]);
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  // Debounced customer search - ultra-fast
  const customerDebounceTimer = useRef(null);
  const debouncedCustomerSearch = useCallback((query) => {
    if (customerDebounceTimer.current) {
      clearTimeout(customerDebounceTimer.current);
    }
    
    if (query.length >= 2) {
      customerDebounceTimer.current = setTimeout(() => {
        searchCustomers(query);
      }, 100); // Reduced to 100ms for ultra-fast response
    }
  }, []);

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h1 className="text-xl font-semibold text-gray-900">Create Invoice</h1>
                  </div>
                  <div className="ml-4">
                    <span className="text-lg font-medium text-gray-600">{invoice.invoice_no}</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <button
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={() => currentStep === 1 ? goToSummary() : saveInvoice()}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  >
                    {currentStep === 1 ? 'Review Invoice' : 'Create Invoice'}
                  </button>
                  <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg ml-2">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Date Fields and Import from Challan */}
            <div className="px-6 py-4 bg-gray-50">
              <div className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Date</label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={invoice.invoice_date}
                      onChange={(e) => setInvoice({ ...invoice, invoice_date: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                    />
                  </div>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={invoice.due_date}
                      onChange={(e) => setInvoice({ ...invoice, due_date: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                    />
                  </div>
                </div>
                <div className="col-span-6">
                  <button
                    onClick={() => setShowChallanModal(true)}
                    className="w-full flex items-center justify-center space-x-2 px-6 py-2.5 text-gray-700 hover:bg-white rounded-lg font-medium transition-colors border border-gray-300"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Import from Challan</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {currentStep === 1 ? (
            <>
              {/* Main Content - Apple-style minimal */}
              <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
                
                {/* Customer Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Customer</h3>
                    <button
                      onClick={() => setShowCreateCustomer(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + New
                    </button>
                  </div>

                  {selectedCustomer ? (
                    <div className="p-2 bg-gray-50 rounded border-l-2 border-blue-500">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{selectedCustomer.customer_name}</p>
                          <p className="text-xs text-gray-600">{selectedCustomer.phone} • {selectedCustomer.city}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedCustomer(null);
                            setInvoice({ ...invoice, customer_id: '', customer_name: '', customer_details: null });
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative" ref={customerSearchRef}>
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          debouncedCustomerSearch(e.target.value);
                        }}
                        onFocus={() => setShowCustomerSearch(true)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />

                      {showCustomerSearch && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                          {customerSearchLoading ? (
                            <div className="px-3 py-4 text-center text-gray-500">
                              Searching customers...
                            </div>
                          ) : (
                            <>
                              {/* Show message if no query entered */}
                              {(!searchQuery || searchQuery.length < 2) && (
                                <div className="px-3 py-2 text-sm text-gray-500">
                                  Type at least 2 characters to search customers...
                                </div>
                              )}
                              
                              {/* Show search results when searching */}
                              {searchQuery && searchQuery.length >= 2 && Array.isArray(customerSearchResults) && 
                                customerSearchResults.map(customer => (
                              <div
                                key={customer.customer_id}
                                onClick={() => handleCustomerSelect(customer)}
                                className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                              >
                                <div className="text-sm font-medium text-gray-900">{customer.customer_name}</div>
                                <div className="text-xs text-gray-500">{customer.phone} • {customer.city || customer.address_line1 || 'No address'}</div>
                              </div>
                            ))}
                              
                              {/* Show "Create new customer" if no results found */}
                              {searchQuery && searchQuery.length >= 2 && customerSearchResults.length === 0 && !customerSearchLoading && (
                                <div
                                  onClick={() => {
                                    setShowCreateCustomer(true);
                                    setShowCustomerSearch(false);
                                    setNewCustomer({ ...newCustomer, customer_name: searchQuery });
                                  }}
                                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 cursor-pointer border-b border-gray-100 flex items-center justify-between"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-blue-900">Create "{searchQuery}"</div>
                                  </div>
                                  <Plus className="w-4 h-4 text-blue-600" />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100"></div>

                {/* Products Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Products</h3>
                    <button
                      onClick={() => setShowCreateProduct(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + New
                    </button>
                  </div>
                  <div className="relative" ref={productSearchRef}>
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={productSearchQuery}
                      onChange={(e) => {
                        setProductSearchQuery(e.target.value);
                        debouncedSearch(e.target.value);
                      }}
                      onFocus={() => setShowProductSearch(true)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />

                    {showProductSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-64 overflow-y-auto">
                        {searchLoading ? (
                          <div className="px-3 py-4 text-center text-gray-500">
                            Searching products...
                          </div>
                        ) : (
                          <>
                            {/* Show message if no query entered */}
                            {(!productSearchQuery || productSearchQuery.length < 2) && (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                Type at least 2 characters to search products...
                              </div>
                            )}
                            
                            {/* Show search results when searching */}
                            {productSearchQuery && productSearchQuery.length >= 2 && Array.isArray(searchResults) && 
                              searchResults.map(product => (
                                <div 
                                  key={product.product_id} 
                                  onClick={() => handleProductSelect(product)}
                                  className="border-b border-gray-100 last:border-0 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h4 className="text-sm font-medium text-gray-900">{product.product_name}</h4>
                                      <p className="text-xs text-gray-500">
                                        {product.manufacturer || 'Unknown'} • {product.category || 'General'}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <div className="flex items-center gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-gray-700">
                                            {product.total_stock || product.total_quantity || product.quantity || 0}
                                          </p>
                                          <p className="text-xs text-gray-500">in stock</p>
                                        </div>
                                        <div className="border-l border-gray-200 pl-3">
                                          <p className="text-sm font-medium text-gray-900">₹{product.sale_price || product.price || 0}</p>
                                          <p className="text-xs text-gray-500">MRP: ₹{product.mrp || 0}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            
                            {/* Show "Create New Product" if no results found */}
                            {productSearchQuery && productSearchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                              <div
                                onClick={() => {
                                  setShowCreateProduct(true);
                                  setShowProductSearch(false);
                                  setNewProduct({ ...newProduct, product_name: productSearchQuery });
                                }}
                                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 cursor-pointer border-b border-gray-100 flex items-center justify-between"
                              >
                                <div className="flex items-center">
                                  <Plus className="w-4 h-4 text-blue-600 mr-2" />
                                  <span className="text-sm text-blue-600">Create new product "{productSearchQuery}"</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-blue-400" />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Invoice Items */}
              {invoice.items.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm mt-3 p-4">
                  <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-2">Invoice Items</h3>

                  <div className="overflow-x-auto -mx-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase tracking-wide">Product</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">MRP</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Rate</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Disc%</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Free</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.items.map((item, index) => (
                          <tr key={item.item_id} className={index !== invoice.items.length - 1 ? "border-b border-gray-50" : ""}>
                            <td className="py-2 px-4">
                              <p className="font-medium text-gray-900 text-sm">{item.product_name}</p>
                              <p className="text-xs text-gray-500">{item.batch_no}</p>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(item.item_id, parseInt(e.target.value) || 1)}
                                className="w-12 px-1 py-0.5 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-right text-sm">₹{(item.mrp || 0).toFixed(0)}</td>
                            <td className="py-2 px-2 text-right text-sm">₹{(item.rate || 0).toFixed(0)}</td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.discount_percent}
                                onChange={(e) => updateItemDiscount(item.item_id, parseFloat(e.target.value) || 0)}
                                className="w-12 px-1 py-0.5 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                value={item.free_quantity || 0}
                                onChange={(e) => updateItemFreeQuantity(item.item_id, parseInt(e.target.value) || 0)}
                                className="w-12 px-1 py-0.5 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-medium text-sm">₹{(item.total_amount || 0).toFixed(0)}</td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => removeItem(item.item_id)}
                                className="p-0.5 text-gray-400 hover:text-red-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Generate Invoice Button */}
              {invoice.items.length > 0 && (
                <>
                  {/* GST Summary */}
                  <div className="bg-white rounded-lg shadow-sm mt-3 p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">GST Summary</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">₹{(invoice.gross_amount || 0).toFixed(2)}</span>
                      </div>
                      {invoice.discount_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Discount:</span>
                          <span className="font-medium text-red-600">-₹{(invoice.discount_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Taxable Amount:</span>
                        <span className="font-medium">₹{(invoice.taxable_amount || 0).toFixed(2)}</span>
                      </div>
                      {invoice.cgst_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">CGST:</span>
                          <span className="font-medium">₹{(invoice.cgst_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {invoice.sgst_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">SGST:</span>
                          <span className="font-medium">₹{(invoice.sgst_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {invoice.igst_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">IGST:</span>
                          <span className="font-medium">₹{(invoice.igst_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-gray-700">Total GST:</span>
                          <span>₹{(invoice.gst_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Total and Continue Button */}
                  <div className="bg-white rounded-lg shadow-sm mt-3 p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount</p>
                        <p className="text-xl font-semibold text-gray-900">₹{(invoice.net_amount || 0).toFixed(2)}</p>
                      </div>
                      <button
                        onClick={goToSummary}
                        disabled={!invoice.customer_id || invoice.items.length === 0}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                      >
                        <span>Continue</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}

            </>
          ) : currentStep === 2 ? (
            /* Invoice Preview */
            <div className="bg-white rounded-lg shadow-sm p-8" id="invoice-content">
              {/* Payment and Delivery Details */}
              <div className="mb-2 px-6 py-4 bg-gray-50">
                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                    <select
                      value={invoice.payment_mode}
                      onChange={(e) => setInvoice({ ...invoice, payment_mode: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CREDIT">Credit</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Type</label>
                    <select
                      value={invoice.delivery_type}
                      onChange={(e) => setInvoice({ ...invoice, delivery_type: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                    >
                      <option value="">Select Delivery</option>
                      <option value="Express">Express</option>
                      <option value="Regular 2-4 Day">Regular 2-4 Day</option>
                      <option value="No Rush">No Rush</option>
                      <option value="Same Day">Same Day</option>
                      <option value="Next Day">Next Day</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Charges</label>
                    <input
                      type="number"
                      min="0"
                      value={invoice.delivery_charges}
                      onChange={(e) => {
                        const charges = parseFloat(e.target.value) || 0;
                        setInvoice({ ...invoice, delivery_charges: charges });
                        calculateTotals(invoice.items);
                      }}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                      placeholder="₹0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Transport Details */}
              <div className="mb-6 px-6 py-4 bg-gray-50">
                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      value={invoice.vehicle_number}
                      onChange={(e) => setInvoice({ ...invoice, vehicle_number: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                      placeholder="MH-01-AB-1234"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">LR Number</label>
                    <input
                      type="text"
                      value={invoice.lr_number}
                      onChange={(e) => setInvoice({ ...invoice, lr_number: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                      placeholder="LR123456"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Transport Company</label>
                    <input
                      type="text"
                      value={invoice.transport_company}
                      onChange={(e) => setInvoice({ ...invoice, transport_company: e.target.value })}
                      className="text-base font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 w-full"
                      placeholder="Company name"
                    />
                  </div>
                </div>
              </div>

              {/* Company Header with Logo */}
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-200">
                <div className="flex items-start space-x-4">
                  {localStorage.getItem('companyLogo') ? (
                    <img 
                      src={localStorage.getItem('companyLogo')} 
                      alt="Company Logo" 
                      className="h-16 w-auto object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-2xl">
                        {(localStorage.getItem('companyName') || 'A').charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}</h1>
                    <p className="text-gray-600">{localStorage.getItem('companyAddress') || 'Mumbai, Maharashtra'}</p>
                    <p className="text-sm text-gray-500">GSTIN: {localStorage.getItem('companyGST') || '27AAAAA0000A1Z5'}</p>
                    <p className="text-sm text-gray-500">DL No: {localStorage.getItem('companyDL') || 'MH-MUM-123456'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">TAX INVOICE</h2>
                  <p className="text-sm text-gray-600">Invoice No: <span className="font-medium">{invoice.invoice_no}</span></p>
                  <p className="text-sm text-gray-600">Date: <span className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></p>
                </div>
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Bill To:</h3>
                  <div className="text-gray-900">
                    <p className="font-semibold">{invoice.customer_name}</p>
                    {invoice.customer_details && (
                      <>
                        <p className="text-sm">{invoice.customer_details.address}</p>
                        <p className="text-sm">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                        <p className="text-sm">GSTIN: {invoice.customer_details.gst_number || 'N/A'}</p>
                        <p className="text-sm">Phone: {invoice.customer_details.phone}</p>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Ship To:</h3>
                  <div className="mb-2">
                    <label className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={invoice.is_same_address}
                        onChange={(e) => setInvoice({...invoice, is_same_address: e.target.checked, shipping_address: e.target.checked ? '' : invoice.shipping_address})}
                        className="mr-2"
                      />
                      Same as billing address
                    </label>
                  </div>
                  {!invoice.is_same_address ? (
                    <textarea
                      value={invoice.shipping_address}
                      onChange={(e) => setInvoice({...invoice, shipping_address: e.target.value})}
                      placeholder="Enter shipping address"
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  ) : (
                    invoice.customer_details && (
                      <>
                        <p className="text-sm">{invoice.customer_details.address}</p>
                        <p className="text-sm">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                      </>
                    )
                  )}
                </div>
              </div>


              {/* Items Table */}
              <div className="mb-8">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">#</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">HSN</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Batch</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Exp</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Qty</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">MRP</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Rate</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Disc%</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Free</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">GST%</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, index) => (
                      <tr key={item.item_id} className="border-b border-gray-200">
                        <td className="py-3 px-4 text-sm">{index + 1}</td>
                        <td className="py-3 px-4 text-sm">{item.product_name}</td>
                        <td className="py-3 px-4 text-sm text-center">{item.hsn_code}</td>
                        <td className="py-3 px-4 text-sm text-center">{item.batch_no}</td>
                        <td className="py-3 px-4 text-sm text-center">{new Date(item.expiry_date).toLocaleDateString('en-IN')}</td>
                        <td className="py-3 px-4 text-sm text-center">{item.quantity}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{(item.mrp || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{(item.rate || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-center">{item.discount_percent}%</td>
                        <td className="py-3 px-4 text-sm text-center">{item.free_quantity || 0}</td>
                        <td className="py-3 px-4 text-sm text-center">{item.gst_percent}%</td>
                        <td className="py-3 px-4 text-sm text-right font-medium">₹{(item.total_amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tax Breakup and Summary Section */}
              <div className="flex gap-6 mb-8">
                {/* Tax Breakup - Left side */}
                {Object.keys(invoice.gst_breakup).length > 0 && (
                  <div className="w-96">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Tax Breakup</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-1 px-2 text-xs font-medium text-gray-600">Rate</th>
                          <th className="text-right py-1 px-2 text-xs font-medium text-gray-600">Taxable</th>
                          {invoice.customer_details?.state === localStorage.getItem('companyState') ? (
                            <>
                              <th className="text-right py-1 px-2 text-xs font-medium text-gray-600">CGST</th>
                              <th className="text-right py-1 px-2 text-xs font-medium text-gray-600">SGST</th>
                            </>
                          ) : (
                            <th className="text-right py-1 px-2 text-xs font-medium text-gray-600">IGST</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(invoice.gst_breakup || {}).map(([rate, data]) => (
                          <tr key={rate} className="border-b border-gray-100">
                            <td className="py-1 px-2 text-xs">{rate}%</td>
                            <td className="py-1 px-2 text-xs text-right">₹{((data?.taxable || 0)).toFixed(2)}</td>
                            {invoice.customer_details?.state === localStorage.getItem('companyState') ? (
                              <>
                                <td className="py-1 px-2 text-xs text-right">₹{((data?.cgst || 0)).toFixed(2)}</td>
                                <td className="py-1 px-2 text-xs text-right">₹{((data?.sgst || 0)).toFixed(2)}</td>
                              </>
                            ) : (
                              <td className="py-1 px-2 text-xs text-right">₹{((data?.total || 0)).toFixed(2)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary - Right side */}
                <div className="flex-1 flex justify-end">
                  <div className="w-80">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">₹{(invoice.gross_amount || 0).toFixed(2)}</span>
                    </div>
                    {invoice.discount_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Discount:</span>
                        <span className="font-medium">₹{(invoice.discount_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Taxable Amount:</span>
                      <span className="font-medium">₹{(invoice.taxable_amount || 0).toFixed(2)}</span>
                    </div>
                    {invoice.customer_details?.state === localStorage.getItem('companyState') ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">CGST:</span>
                          <span className="font-medium">₹{(invoice.cgst_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">SGST:</span>
                          <span className="font-medium">₹{(invoice.sgst_amount || 0).toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">IGST:</span>
                        <span className="font-medium">₹{(invoice.igst_amount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {invoice.delivery_charges > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Delivery Charges:</span>
                        <span className="font-medium">₹{(invoice.delivery_charges || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {invoice.round_off !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Round Off:</span>
                        <span className="font-medium">₹{(invoice.round_off || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t-2 border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-700">Net Amount:</span>
                        <span className="text-2xl font-bold text-blue-600">₹{(invoice.net_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details and Signature */}
              <div className="grid grid-cols-2 gap-6 mt-4 pt-3 border-t border-gray-200">
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-1">Bank Details</h3>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <p>Bank Name: <span className="font-medium">{invoice.bank_name || localStorage.getItem('bankName') || 'State Bank of India'}</span></p>
                    <p>A/C No: <span className="font-medium">{invoice.account_number || localStorage.getItem('accountNumber') || '1234567890'}</span></p>
                    <p>IFSC: <span className="font-medium">{invoice.ifsc_code || localStorage.getItem('ifscCode') || 'SBIN0001234'}</span></p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-1">Authorized Signatory</h3>
                  <div className="border border-gray-300 rounded p-2 h-12 flex items-center justify-center">
                    {localStorage.getItem('digitalSignature') ? (
                      <img 
                        src={localStorage.getItem('digitalSignature')} 
                        alt="Digital Signature" 
                        className="max-h-8 object-contain"
                      />
                    ) : (
                      <p className="text-xs text-gray-400">Digital Signature</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 text-center">For {localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  Terms & Conditions: Goods once sold will not be taken back or exchanged. 
                  Bills not paid within {invoice.customer_details?.credit_terms_days || 30} days will attract 18% interest.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex justify-between">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <div className="space-x-3">
                  <button
                    onClick={generatePrintPDF}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center space-x-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={generateWhatsAppPDF}
                    disabled={isGeneratingPDF}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center space-x-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{isGeneratingPDF ? 'Generating...' : 'WhatsApp'}</span>
                  </button>
                  <button
                    onClick={saveInvoice}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Invoice'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Success Step */
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Invoice Created Successfully!</h2>
              <p className="text-gray-600 mb-1">Invoice No: {invoice.invoice_no}</p>
              <p className="text-2xl font-bold text-gray-900 mb-8">Amount: ₹{(invoice.net_amount || 0).toFixed(2)}</p>
              
              <div className="flex justify-center space-x-3">
                <button
                  onClick={generatePrintPDF}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
                <button
                  onClick={generateWhatsAppPDF}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center space-x-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
                <button
                  onClick={() => {
                    // Reset form
                    setInvoice({
                      order_id: null,
                      customer_id: '',
                      mr_id: '',
                      order_date: new Date().toISOString().split('T')[0],
                      gross_amount: 0,
                      discount: 0,
                      tax_amount: 0,
                      final_amount: 0,
                      payment_status: 'pending',
                      status: 'placed',
                      invoice_no: 'INV-' + Date.now().toString().slice(-6),
                      invoice_date: new Date().toISOString().split('T')[0],
                      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      customer_code: '',
                      customer_name: '',
                      customer_details: null,
                      items: [],
                      total_amount: 0,
                      discount_percent: 0,
                      discount_amount: 0,
                      taxable_amount: 0,
                      gst_amount: 0,
                      cgst_amount: 0,
                      sgst_amount: 0,
                      igst_amount: 0,
                      gst_breakup: {},
                      round_off: 0,
                      net_amount: 0,
                      payment_mode: 'CASH',
                      medical_rep: '',
                      delivery_type: '',
                      delivery_charges: 0,
                      notes: '',
                      bank_name: localStorage.getItem('bankName') || '',
                      account_number: localStorage.getItem('accountNumber') || '',
                      ifsc_code: localStorage.getItem('ifscCode') || '',
                      billing_address: '',
                      shipping_address: '',
                      is_same_address: true,
                      vehicle_number: '',
                      lr_number: '',
                      transport_company: ''
                    });
                    setSelectedCustomer(null);
                    setCurrentStep(1);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  New Invoice
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    
    {/* Modals - Outside main container */}
    {/* Batch Selection Modal */}
    {showBatchSelection && selectedProduct && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select Batch</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedProduct.product_name}</p>
              </div>
              <button
                onClick={() => {
                  setShowBatchSelection(false);
                  setSelectedProduct(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
          
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              {!selectedProduct.batches || selectedProduct.batches.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No batches available for this product.</p>
                  <p className="text-sm text-gray-400 mt-2">Please create a batch in inventory management.</p>
                </div>
              ) : (selectedProduct.batches || [])
                .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
                .map(batch => {
                  const expiryStatus = getExpiryStatus(batch.expiry_date);
                  return (
                    <div
                      key={batch.batch_id}
                      className={`border rounded-lg p-4 ${
                        expiryStatus.status === 'expired' 
                          ? 'border-red-200 bg-red-50 opacity-60' 
                          : expiryStatus.status === 'expiring-soon'
                          ? 'border-orange-200 bg-orange-50'
                          : 'border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer'
                      }`}
                      onClick={() => expiryStatus.status !== 'expired' && handleBatchSelect(batch)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">Batch: {batch.batch_number}</h4>
                          <div className="mt-2 space-y-1">
                            <p className="text-sm text-gray-600">
                              MFG: {batch.mfg_date || batch.manufacturing_date ? new Date(batch.mfg_date || batch.manufacturing_date).toLocaleDateString('en-IN') : 'N/A'}
                            </p>
                            <p className={`text-sm font-medium ${expiryStatus.color}`}>
                              EXP: {new Date(batch.expiry_date).toLocaleDateString('en-IN')}
                              {expiryStatus.status === 'expired' && ' (EXPIRED)'}
                              {expiryStatus.status === 'expiring-soon' && ' (EXPIRING SOON)'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-gray-900">₹{batch.selling_price}</p>
                          <p className="text-sm text-gray-600 mt-1">Stock: {batch.quantity_available}</p>
                          {expiryStatus.status === 'valid' && (
                            <p className="text-xs text-green-600 mt-2">FIFO Recommended</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Modals simplified for testing */}
    {showCreateCustomer && <div className="fixed inset-0 bg-black bg-opacity-50 z-50"><div className="bg-white p-4 m-4">Customer Modal</div></div>}
    {showCreateProduct && <div className="fixed inset-0 bg-black bg-opacity-50 z-50"><div className="bg-white p-4 m-4">Product Modal</div></div>}
    {showChallanModal && <div className="fixed inset-0 bg-black bg-opacity-50 z-50"><div className="bg-white p-4 m-4">Challan Modal</div></div>}
    </>
  );
};

export default SalesEntryModalV2;