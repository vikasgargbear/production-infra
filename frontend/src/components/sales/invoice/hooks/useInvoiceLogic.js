import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { searchCache, smartSearch } from '../../../../utils/searchCache';
import DataTransformer from '../../../../services/dataTransformer';
import InvoiceApiService from '../../../../services/invoiceApiService';
import SimpleInvoiceCalculator from '../../../../services/SimpleInvoiceCalculator';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/documentNumberGenerator';
import localInvoiceService from '../../../../services/invoice/localInvoiceService';
import { customerAPI, productAPI, employeesAPI } from '../../../../services/api';

export const useInvoiceLogic = (onClose, prefilledData = null) => {
  // Core State
  const [invoice, setInvoice] = useState({
    invoice_no: '', // Will be generated async in useEffect
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from today
    items: [],
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    gst_type: 'CGST/SGST',
    delivery_type: 'PICKUP',
    transport_company: '',
    vehicle_number: '',
    delivery_charges: 0,
    discount_amount: 0,
    discount_percent: 0,
    discount_type: 'percentage',
    payment_mode: 'credit',
    payment_status: 'pending',
    payments: [{
      id: '1',
      method: 'credit',
      amount: 0,
      reference: ''
    }],
    notes: '',
    sales_person_id: null,
    e_invoice_applicable: false,
    e_invoice_number: '',
    irn: '',
    ack_no: '',
    ack_date: '',
    qr_code: '',
    eway_bill_number: '',
    eway_bill_date: '',
    eway_bill_valid_upto: '',
    net_amount: 0,
    totals: null
  });

  // Supporting State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedMR, setSelectedMR] = useState(null);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoiceData, setCreatedInvoiceData] = useState(null);

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGSTCalculator, setShowGSTCalculator] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBillDiscountModal, setShowBillDiscountModal] = useState(false);
  const [showTaxDetailModal, setShowTaxDetailModal] = useState(false);
  const [showCashCalculatorModal, setShowCashCalculatorModal] = useState(false);
  const [showLastDealModal, setShowLastDealModal] = useState(false);
  const [selectedProductForLastDeal, setSelectedProductForLastDeal] = useState(null);
  const [showItemProfitModal, setShowItemProfitModal] = useState(false);

  // Refs
  const productSearchRef = useRef(null);
  const itemsTableRef = useRef(null);
  const deliveryTypeRef = useRef(null);
  const transportRef = useRef(null);
  const vehicleRef = useRef(null);
  const deliveryChargesRef = useRef(null);

  // Initialize invoice data
  useEffect(() => {
    const initializeInvoice = async () => {
      try {
        setIsLoading(true);

        // Generate invoice number
        const invoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE);
        setInvoice(prev => ({ ...prev, invoice_no: invoiceNo }));

        // Load employees for MR selection
        try {
          const employeeResponse = await employeesAPI.getAll({ limit: 100 });
          if (employeeResponse?.data && Array.isArray(employeeResponse.data)) {
            setEmployees(employeeResponse.data);
          }
        } catch (employeeError) {
          console.warn('Unable to fetch employees:', employeeError.message);
          setEmployees([]);
        }

        // If prefilled data provided, merge it
        if (prefilledData) {
          if (prefilledData.customer) {
            setSelectedCustomer(prefilledData.customer);
            handleCustomerSelect(prefilledData.customer);
          }
          if (prefilledData.items && prefilledData.items.length > 0) {
            const transformedItems = prefilledData.items.map(item => 
              DataTransformer.transformProduct(item, 'invoice')
            );
            setInvoice(prev => ({ ...prev, items: transformedItems }));
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing invoice:', error);
        setError('Failed to initialize invoice. Please try again.');
        setIsLoading(false);
      }
    };

    initializeInvoice();
  }, [prefilledData]);

  // Recalculate totals when items or discounts change
  useEffect(() => {
    SimpleInvoiceCalculator.calculateDebounced(invoice, (error, result) => {
      if (error) {
        console.error('Calculation error:', error);
        return;
      }
      
      if (result) {
        setInvoice(prev => ({
          ...prev,
          items: result.items,
          totals: result.totals,
          net_amount: result.totals.final_amount
        }));
      }
    }, 300, 'invoice');
  }, [invoice.items, invoice.delivery_charges, invoice.discount_amount, invoice.discount_percent]);

  // Handlers
  const handleCustomerSelect = useCallback((customer) => {
    if (!customer) {
      setSelectedCustomer(null);
      setInvoice(prev => ({
        ...prev,
        customer_details: null,
        billing_address: '',
        shipping_address: ''
      }));
      return;
    }

    setSelectedCustomer(customer);
    const billingAddress = customer.billing_address || customer.address || '';
    
    setInvoice(prev => ({
      ...prev,
      customer_details: customer,
      billing_address: billingAddress,
      shipping_address: sameAsShipping ? billingAddress : prev.shipping_address
    }));

    setMessage(`Customer "${customer.customer_name || customer.name}" selected`);
    setMessageType('success');
    setTimeout(() => setMessage(''), 3000);
  }, [sameAsShipping]);

  const handleAddItem = useCallback((product) => {
    if (!product) return;

    const transformedProduct = DataTransformer.transformProduct(product, 'invoice');
    
    if (!transformedProduct || !transformedProduct.product_name) {
      toast.error('Invalid product data');
      return;
    }

    setInvoice(prev => {
      const existingItemIndex = prev.items.findIndex(
        item => item.product_id === transformedProduct.product_id
      );

      if (existingItemIndex >= 0) {
        // Update existing item quantity
        const updatedItems = [...prev.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: parseFloat(updatedItems[existingItemIndex].quantity || 0) + 1
        };
        return { ...prev, items: updatedItems };
      } else {
        // Add new item with default values
        return { 
          ...prev, 
          items: [...prev.items, {
            ...transformedProduct,
            quantity: 1,  // Default quantity
            discount: 0,
            discount_percent: 0,
            free_quantity: 0
          }] 
        };
      }
    });

    setMessage(`Added "${transformedProduct.product_name}" to invoice`);
    setMessageType('success');
    setTimeout(() => setMessage(''), 2000);
  }, []);

  const handleUpdateItem = useCallback((index, field, value) => {
    setInvoice(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value
      };
      return { ...prev, items: updatedItems };
    });
  }, []);

  const handleRemoveItem = useCallback((index) => {
    setInvoice(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }, []);

  const handleImport = useCallback(async (importData) => {
    try {
      if (!importData) return;

      if (importData.customer) {
        handleCustomerSelect(importData.customer);
      }

      if (importData.items && importData.items.length > 0) {
        const transformedItems = importData.items.map(item => 
          DataTransformer.transformProduct(item, 'invoice')
        );
        setInvoice(prev => ({ ...prev, items: transformedItems }));
      }

      if (importData.delivery_details) {
        setInvoice(prev => ({
          ...prev,
          delivery_type: importData.delivery_details.delivery_type || 'PICKUP',
          delivery_charges: importData.delivery_details.delivery_charges || 0
        }));
      }

      setMessage(`Imported ${importData.items?.length || 0} items from ${importData.source}`);
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Import error:', error);
      setMessage('Failed to import data');
      setMessageType('error');
      setTimeout(() => setMessage(''), 5000);
    }
  }, [handleCustomerSelect]);

  const handleApplyBillDiscount = useCallback((discountData) => {
    setInvoice(prev => ({
      ...prev,
      discount_type: discountData.type,
      discount_amount: discountData.type === 'fixed' ? discountData.amount : 0,
      discount_percent: discountData.type === 'percentage' ? discountData.percentage : 0
    }));
  }, []);

  const handleSaveInvoice = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate invoice
      if (!selectedCustomer) {
        throw new Error('Please select a customer');
      }
      if (invoice.items.length === 0) {
        throw new Error('Please add at least one item');
      }

      const invoiceData = {
        ...invoice,
        customer_id: selectedCustomer.customer_id || selectedCustomer.id,
        customer_details: selectedCustomer,
        total_amount: parseFloat(invoice.totals?.final_amount || invoice.net_amount) || 0
      };

      const response = await InvoiceApiService.createInvoice(invoiceData);

      if (response.success) {
        const createdData = {
          invoiceId: response.data.invoice_id,
          invoiceNumber: response.data.invoice_number || invoice.invoice_no,
          customerName: selectedCustomer.customer_name || selectedCustomer.name,
          customerPhone: selectedCustomer.phone || selectedCustomer.primary_phone || '',
          customerEmail: selectedCustomer.email || '',
          totalAmount: response.data.total_amount || invoiceData.total_amount,
          items: response.data.items || invoice.items
        };

        setCreatedInvoiceData(createdData);
        setShowSuccessModal(true);
      } else {
        throw new Error(response.message || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Save invoice error:', error);
      setError(error.message || 'Failed to create invoice');
      toast.error(error.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  }, [invoice, selectedCustomer]);

  const clearMessage = useCallback(() => {
    setMessage('');
    setMessageType('');
  }, []);

  return {
    // State
    invoice,
    setInvoice,
    selectedCustomer,
    setSelectedCustomer,
    employees,
    selectedMR,
    setSelectedMR,
    sameAsShipping,
    setSameAsShipping,
    isLoading,
    error,
    setError,
    message,
    messageType,
    saving,
    showSuccessModal,
    setShowSuccessModal,
    createdInvoiceData,

    // Modal States
    showCustomerModal,
    setShowCustomerModal,
    showProductModal,
    setShowProductModal,
    showGSTCalculator,
    setShowGSTCalculator,
    showImportModal,
    setShowImportModal,
    showBillDiscountModal,
    setShowBillDiscountModal,
    showTaxDetailModal,
    setShowTaxDetailModal,
    showCashCalculatorModal,
    setShowCashCalculatorModal,
    showLastDealModal,
    setShowLastDealModal,
    selectedProductForLastDeal,
    setSelectedProductForLastDeal,
    showItemProfitModal,
    setShowItemProfitModal,

    // Refs
    productSearchRef,
    itemsTableRef,
    deliveryTypeRef,
    transportRef,
    vehicleRef,
    deliveryChargesRef,

    // Handlers
    handleCustomerSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    handleImport,
    handleApplyBillDiscount,
    handleSaveInvoice,
    clearMessage
  };
};