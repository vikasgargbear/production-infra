import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Calendar, ArrowRight, ArrowLeft,
  CheckCircle, MessageCircle, FileInput, Printer,
  X, AlertCircle, FileText, Truck, User, Package, MapPin
} from 'lucide-react';
import { toast } from 'react-toastify';
import { 
  CustomerSearch, 
  ProductSearchSimple, 
  ProductCreationModal,
  ProceedToReviewComponent,
  ItemsTable,
  NotesSection,
  ModuleHeader,
  DocumentFooter,
  GenericSuccessModal,
  StandardDatePicker,
  AddressForm,
  PrintUtility
} from '../global';
import CustomerCreation from '../global/ui/forms/CustomerCreation';
import BankAccountSelector from '../common/BankAccountSelector';
import { ordersApi, salesApi, api, apiClient, usersApi, authApi } from '../../services/api';
import salesOrdersAPI from '../../services/api/modules/salesOrders.api';
import { invoicesApi as invoicesApiModule } from '../../services/api/modules/invoices.api';
import { challansApi as challansApiModule } from '../../services/api/modules/challans.api';
import EnterpriseCalculator from '../../services/enterpriseCalculator'; // Use unified calculator
import { useCompany } from '../../contexts/CompanyContext';
import ImportFromDocumentModal from './components/ImportFromDocumentModal';
import documentNumberService from '../../services/documentNumberService';

// Function to convert number to words
const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const convertHundreds = (n) => {
    let str = '';
    if (n > 99) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 19) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      str += teens[n - 10] + ' ';
      return str;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str;
  };

  const convertToWords = (n) => {
    if (n === 0) return 'Zero';
    
    let str = '';
    
    // Handle crores
    if (n >= 10000000) {
      str += convertHundreds(Math.floor(n / 10000000)) + 'Crore ';
      n %= 10000000;
    }
    
    // Handle lakhs
    if (n >= 100000) {
      str += convertHundreds(Math.floor(n / 100000)) + 'Lakh ';
      n %= 100000;
    }
    
    // Handle thousands
    if (n >= 1000) {
      str += convertHundreds(Math.floor(n / 1000)) + 'Thousand ';
      n %= 1000;
    }
    
    // Handle hundreds
    if (n > 0) {
      str += convertHundreds(n);
    }
    
    return str.trim();
  };

  const amount = Math.floor(num);
  const paise = Math.round((num - amount) * 100);
  
  let words = convertToWords(amount) + ' Rupees';
  if (paise > 0) {
    words += ' and ' + convertToWords(paise) + ' Paise';
  }
  words += ' Only';
  
  return words;
};

const SalesOrderFlow = ({ open = true, onClose }) => {
  const { companyInfo, getOrgId } = useCompany();
  const [currentStep, setCurrentStep] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [messageType, setMessageType] = useState('');
  const [employees, setEmployees] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderData, setCreatedOrderData] = useState(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);

  // Generate order number using document number service
  const generateOrderNumber = async () => {
    try {
      const orderNumber = await documentNumberService.generateSalesOrderNumber();
      setOrder(prev => ({ ...prev, order_number: orderNumber }));
      return orderNumber;
    } catch (error) {
      console.error('Failed to generate order number:', error);
      // Use consistent fallback format: SO-YY########
      const now = new Date();
      const year = now.getFullYear() % 100;
      const yearPrefix = year.toString().padStart(2, '0');
      const timestamp = Date.now();
      const uniqueNum = 10000000 + (timestamp % 90000000);
      const orderNumber = `SO-${yearPrefix}${uniqueNum}`;
      setOrder(prev => ({ ...prev, order_number: orderNumber }));
      return orderNumber;
    }
  };

  // Sales Order data state
  const [order, setOrder] = useState({
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: '',
    customer_name: '',
    customer_details: null,
    billing_address: '',
    shipping_address: '',
    billing_address_data: null,
    shipping_address_data: null,
    items: [],
    status: 'pending',
    payment_terms: 'credit',
    reference_no: '',
    sales_person: localStorage.getItem('userName') || 'Admin',
    created_by: localStorage.getItem('userName') || 'Admin',
    terms_conditions: 'Standard terms apply',
    notes: '',
    discount_amount: 0,
    other_charges: 0,
    total_quantity: 0,
    total_amount: 0,
    subtotal_amount: 0,
    tax_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    round_off: 0,
    gst_type: 'CGST/SGST', // Default to CGST/SGST
    place_of_supply: ''
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // Load employees for Created By dropdown
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        // Use usersApi which should be properly configured
        const response = await usersApi.getAll({
          limit: 20,
          role: 'sales'
        });
        
        const users = response.data?.data || response.data?.users || response.data || [];
        
        if (Array.isArray(users) && users.length > 0) {
          setEmployees(users);
          // Set default created_by to first employee if not set
          if (!order.created_by && users.length > 0) {
            setOrder(prev => ({
              ...prev,
              created_by: users[0].user_id || users[0].id,
              created_by_name: users[0].full_name || users[0].name || 'User'
            }));
          }
        } else {
          // Use fallback if no users returned
          throw new Error('No users returned');
        }
      } catch (error) {
        // Try to get current user from auth
        const currentUser = authApi.getCurrentUser();
        
        const fallbackUser = currentUser ? {
          user_id: currentUser.user_id || currentUser.id,
          full_name: currentUser.full_name || currentUser.name || 'Current User',
          email: currentUser.email
        } : {
          user_id: null, // Don't hardcode, let backend handle
          full_name: companyInfo.name ? `${companyInfo.name} User` : 'User',
          email: companyInfo.email || ''
        };
        
        setEmployees([fallbackUser]);
        
        if (!order.created_by && fallbackUser.user_id) {
          setOrder(prev => ({
            ...prev,
            created_by: fallbackUser.user_id,
            created_by_name: fallbackUser.full_name
          }));
        }
      }
    };

    loadEmployees();
  }, [companyInfo]);

  // REMOVED: useEffect for calculation - following invoice component pattern
  // Instead, calculations are triggered directly in event handlers when items change
  // This prevents unnecessary recalculations and follows the proven invoice pattern

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              saveOrder();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              printOrder();
            }
            break;
          case 'n':
            e.preventDefault();
            setShowCustomerModal(true);
            break;
          case 'i':
            e.preventDefault();
            setShowImportModal(true);
            break;
          case 'f':
            e.preventDefault();
            // Focus on product search
            const productSearchInput = document.querySelector('input[placeholder*="Search product"]');
            if (productSearchInput) productSearchInput.focus();
            break;
        }
      }
      
      // Escape to close modals or go back
      if (e.key === 'Escape') {
        if (showCustomerModal) setShowCustomerModal(false);
        else if (showProductModal) setShowProductModal(false);
        else if (showImportModal) setShowImportModal(false);
        else if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showCustomerModal, showProductModal, showImportModal]);

  // Handle import from invoice/challan
  const handleImport = (importData) => {
    
    // Set customer details
    if (importData.customer_id) {
      setSelectedCustomer(importData.customer_details);
      handleCustomerSelect(importData.customer_details);
    }
    
    // Set addresses
    if (importData.billing_address) {
      setOrder(prev => ({
        ...prev,
        billing_address: importData.billing_address,
        shipping_address: importData.shipping_address || importData.billing_address
      }));
    }
    
    // Set items - ensure they have all required fields
    if (importData.items && importData.items.length > 0) {
      const formattedItems = importData.items.map((item, index) => ({
        ...item,
        id: item.id || `imported-${Date.now()}-${index}`,
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        batch_no: item.batch_no || item.batch_number || '',
        batch_number: item.batch_no || item.batch_number || '',
        hsn_code: item.hsn_code || '',
        expiry_date: item.expiry_date || '',
        quantity: parseFloat(item.quantity) || 0,
        free_quantity: parseFloat(item.free_quantity) || 0,
        rate: parseFloat(item.rate || item.sale_price || item.unit_price) || 0,
        sale_price: parseFloat(item.sale_price || item.rate || item.unit_price) || 0,
        unit_price: parseFloat(item.unit_price || item.rate || item.sale_price) || 0,
        discount_percent: parseFloat(item.discount_percent) || 0,
        gst_percent: parseFloat(item.gst_percent || item.tax_rate) || 0,
        mrp: parseFloat(item.mrp) || 0,
        line_total: 0 // Will be recalculated
      }));

      setOrder(prev => {
        const updated = {
          ...prev,
          items: formattedItems,
          notes: importData.notes || prev.notes
        };
        return updated;
      });
      
      // Recalculate totals after a small delay to ensure state is updated
      setTimeout(() => {
        recalculateTotals(formattedItems);
      }, 100);
    } else {
      const warningMsg = 'No items found in the selected document';
      setMessage(warningMsg);
      setMessageType('warning');
      toast.warning(warningMsg);
    }
  };

  // Handle customer selection - with proper address fetching
  const handleCustomerSelect = async (customer) => {
    setSelectedCustomer(customer);
    
    // Handle null customer (removal case)
    if (!customer) {
      setOrder(prev => ({
        ...prev,
        customer_id: null,
        customer_name: '',
        customer_details: null,
        billing_address: '',
        shipping_address: '',
        billing_address_data: null,
        shipping_address_data: null
      }));
      return;
    }
    
    // Build address from customer data
    const addressParts = [];
    if (customer.address) addressParts.push(customer.address);
    if (customer.city) addressParts.push(customer.city);
    if (customer.state) addressParts.push(customer.state);
    if (customer.pincode) addressParts.push(customer.pincode);
    let fullAddress = addressParts.filter(Boolean).join(', ');
    
    // Prepare address data for AddressForm
    let addressData = {
      address_line1: customer.address || '',
      address_line2: customer.address2 || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      country: 'India'
    };
    
    // Fetch customer addresses if not available
    if (!fullAddress && customer.customer_id) {
      try {
        const response = await apiClient.get(`/customers/${customer.customer_id}/addresses`);
        
        if (response.data?.success && response.data.data?.length > 0) {
          const addresses = response.data.data;
          
          // Prioritize billing, then shipping, then any default address
          const billingAddr = addresses.find(addr => addr.address_type === 'billing' && addr.is_default);
          const shippingAddr = addresses.find(addr => addr.address_type === 'shipping' && addr.is_default);
          const anyDefaultAddr = addresses.find(addr => addr.is_default);
          
          const preferredAddr = billingAddr || shippingAddr || anyDefaultAddr || addresses[0];

          // Build full address from fetched data
          const fetchedParts = [];
          if (preferredAddr.address_line1) fetchedParts.push(preferredAddr.address_line1);
          if (preferredAddr.address_line2) fetchedParts.push(preferredAddr.address_line2);
          if (preferredAddr.city) fetchedParts.push(preferredAddr.city);
          if (preferredAddr.state || preferredAddr.state_name) fetchedParts.push(preferredAddr.state || preferredAddr.state_name);
          if (preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code) {
            fetchedParts.push(preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code);
          }
          fullAddress = fetchedParts.filter(Boolean).join(', ');
          
          // Update address data
          addressData = {
            address_line1: preferredAddr.address_line1 || '',
            address_line2: preferredAddr.address_line2 || '',
            city: preferredAddr.city || '',
            state: preferredAddr.state || preferredAddr.state_name || '',
            pincode: preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code || '',
            country: preferredAddr.country || 'India'
          };
          
          // Update customer object with address data
          customer = {
            ...customer,
            address: preferredAddr.address_line1 || '',
            address2: preferredAddr.address_line2 || '',
            city: preferredAddr.city || '',
            state: preferredAddr.state || preferredAddr.state_name || '',
            pincode: preferredAddr.pincode || preferredAddr.pin_code || preferredAddr.postal_code || ''
          };
          
          // Update selectedCustomer with full address data
          setSelectedCustomer(customer);
        }
      } catch (error) {
      }
    }
    
    // Determine GST type based on customer state
    const customerState = addressData.state || customer.state || customer.state_name || '';
    const companyState = companyInfo.state || 'Gujarat';
    
    // Clean up state names for comparison (remove extra spaces, convert to lowercase)
    const cleanCustomerState = customerState.trim().toLowerCase();
    const cleanCompanyState = companyState.trim().toLowerCase();
    
    // If states match, use CGST/SGST, otherwise IGST
    const gstType = (cleanCustomerState === cleanCompanyState || cleanCustomerState === '') ? 'CGST/SGST' : 'IGST';

    setOrder(prev => ({
      ...prev,
      customer_id: customer.customer_id || customer.id,
      customer_name: customer.customer_name || customer.name,
      customer_details: customer,
      billing_address: fullAddress,
      shipping_address: fullAddress, // Initially same as billing
      billing_address_data: addressData,
      shipping_address_data: addressData, // Initially same as billing
      gst_type: gstType,
      place_of_supply: customerState || companyState
    }));
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    const existingItem = order.items.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      // Increase quantity if product already exists
      updateItemQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      // Add new item
      const quantity = 1;
      const unitPrice = product.sale_price || product.mrp || 0;
      const discountPercent = 0;
      const gstPercent = product.gst_percent || 0;
      
      const subtotal = quantity * unitPrice;
      const discountAmount = (subtotal * discountPercent) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = (taxableAmount * gstPercent) / 100;
      const finalAmount = taxableAmount + taxAmount;
      
      const newItem = {
        id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        batch_id: product.batch_id,
        batch_number: product.batch_number || product.batch_no,
        quantity: quantity,
        unit: product.unit || product.uom || 'NOS',
        pack_size: product.pack_size || product.pack_type,
        mrp: product.mrp || 0,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        gst_percent: gstPercent,
        tax_amount: taxAmount,
        subtotal: subtotal,
        total: finalAmount,
        manufacturer: product.manufacturer,
        category: product.category
      };

      const updatedItems = [...order.items, newItem];
      setOrder(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Immediate calculation to update totals
      recalculateTotals(updatedItems);
    }
  };

  // Update item quantity
  const updateItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }

    const updatedItems = order.items.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    );
    
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Update item field
  const updateItem = (index, field, value) => {
    const updatedItems = order.items.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate amounts if needed
        if (field === 'quantity' || field === 'unit_price' || field === 'discount_percent' || field === 'gst_percent') {
          const quantity = parseFloat(updatedItem.quantity) || 0;
          const unitPrice = parseFloat(updatedItem.unit_price) || 0;
          const discountPercent = parseFloat(updatedItem.discount_percent) || 0;
          const gstPercent = parseFloat(updatedItem.gst_percent) || 0;
          
          const subtotal = quantity * unitPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const gstAmount = (taxableAmount * gstPercent) / 100;
          const finalAmount = taxableAmount + gstAmount;
          
          updatedItem.subtotal = subtotal;
          updatedItem.discount_amount = discountAmount;
          updatedItem.tax_amount = gstAmount;
          updatedItem.total = finalAmount;
        }
        
        return updatedItem;
      }
      return item;
    });
    
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Remove item
  const removeItem = (index) => {
    const updatedItems = order.items.filter((_, i) => i !== index);
    setOrder(prev => ({ ...prev, items: updatedItems }));
    recalculateTotals(updatedItems);
  };

  // Recalculate totals using corrected calculation logic
  const recalculateTotals = async (items) => {
    if (!items || items.length === 0) {
      setOrder(prev => ({
        ...prev,
        total_quantity: 0,
        subtotal_amount: 0,
        tax_amount: 0,
        total_amount: 0,
        final_amount: 0
      }));
      return;
    }

    try {
      const orderData = {
        ...order,
        items,
        customer_id: selectedCustomer?.customer_id
      };

      const result = await EnterpriseCalculator.calculateSalesOrder(orderData);
      
      if (result.success && result.totals) {
        const formattedTotals = result.totals; // Use totals directly

        // Update items with calculated line totals from backend
        const updatedItems = items.map((item, index) => {
          const calculatedLineItem = result.line_items && result.line_items[index];
          if (calculatedLineItem) {
            return {
              ...item,
              // Update with backend calculated values
              subtotal: calculatedLineItem.subtotal || calculatedLineItem.line_subtotal,
              discount_amount: calculatedLineItem.discount_amount,
              tax_amount: calculatedLineItem.total_tax || calculatedLineItem.tax_amount,
              total: calculatedLineItem.line_total,
              calculated_total: calculatedLineItem.line_total, // Add explicit field for display
              taxable_amount: calculatedLineItem.taxable_amount
            };
          }
          return item;
        });
        
        setOrder(prev => ({
          ...prev,
          items: updatedItems, // Update items with calculated values
          total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
          ...formattedTotals,
          calculatedLineItems: result.line_items
        }));
      } else {
        // Fallback calculation if the enterprise calculator fails
        const fallbackTotals = calculateFallbackTotals(items);
        setOrder(prev => ({
          ...prev,
          total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
          ...fallbackTotals
        }));
      }
    } catch (error) {
      toast.warning('Using local calculation. Backend calculation unavailable.');
      // Fallback calculation on error
      const fallbackTotals = calculateFallbackTotals(items);
      setOrder(prev => ({
        ...prev,
        total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
        ...fallbackTotals
      }));
    }
  };

  // Fallback calculation function
  const calculateFallbackTotals = (items) => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    
    items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const gstPercent = parseFloat(item.gst_percent) || 0;
      
      const lineSubtotal = quantity * unitPrice;
      const itemDiscount = (lineSubtotal * discountPercent) / 100;
      const taxableAmount = lineSubtotal - itemDiscount;
      const taxAmount = (taxableAmount * gstPercent) / 100;
      
      subtotal += lineSubtotal;
      totalDiscount += itemDiscount;
      totalTax += taxAmount;
    });
    
    const taxableTotal = subtotal - totalDiscount;
    const finalTotal = taxableTotal + totalTax;
    
    return {
      subtotal_amount: taxableTotal,
      discount_amount: totalDiscount,
      tax_amount: totalTax,
      total_amount: finalTotal,
      final_amount: finalTotal,
      cgst_amount: totalTax / 2,
      sgst_amount: totalTax / 2
    };
  };

  // Save order using enterprise API
  const saveOrder = async () => {
    setSaving(true);
    try {
      const orderData = {
        // Customer information (from orders schema)
        customer_id: parseInt(order.customer_id),
        customer_name: order.customer_name,
        customer_phone: order.customer_phone || '',
        
        // Order details
        order_number: await generateOrderNumber(), // Generate number only when saving
        order_date: order.order_date || new Date().toISOString().split('T')[0],
        delivery_date: order.expected_delivery_date || order.order_date || new Date().toISOString().split('T')[0],
        delivery_address: order.shipping_address || order.billing_address || '',
        delivery_type: 'delivery',
        
        // Items (matching order_items schema)
        items: order.items.map(item => {
          const quantity = parseInt(item.quantity) || 1;
          const unitPrice = parseFloat(item.unit_price) || 0;
          const sellingPrice = parseFloat(item.unit_price) || 0;
          const discountPercent = parseFloat(item.discount_percent) || 0;
          const taxPercent = parseFloat(item.gst_percent) || 0;
          
          // Calculate amounts
          const subtotal = quantity * sellingPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = (taxableAmount * taxPercent) / 100;
          const totalPrice = taxableAmount + taxAmount;
          
          return {
            product_id: parseInt(item.product_id),
            product_name: item.product_name || '',
            batch_id: item.batch_id ? parseInt(item.batch_id) : null,
            batch_number: item.batch_number || item.batch_no || null,
            quantity: quantity,
            unit_price: unitPrice,
            selling_price: sellingPrice,
            mrp: parseFloat(item.mrp) || sellingPrice,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount,
            total_price: totalPrice,
            line_total: totalPrice
          };
        }),
        
        // Financial details (from orders schema)
        subtotal_amount: parseFloat(order.subtotal_amount) || 0,
        discount_amount: parseFloat(order.discount_amount) || 0,
        tax_amount: parseFloat(order.tax_amount) || 0,
        round_off_amount: 0,
        final_amount: parseFloat(order.total_amount) || 0,
        
        // Payment details
        paid_amount: 0,
        balance_amount: parseFloat(order.total_amount) || 0,
        
        // Metadata
        notes: order.notes || ''
        // NOTE: org_id comes from auth header, NOT request body (per migration guide)
      };

      // Create sales order data matching the backend OrderCreate schema
      // NOTE: org_id comes from auth header, NOT request body (per migration guide)
      const salesOrderData = {
        // Customer info
        customer_id: parseInt(order.customer_id),
        
        // Dates
        order_date: order.order_date || new Date().toISOString().split('T')[0],
        delivery_date: order.expected_delivery_date || order.order_date || new Date().toISOString().split('T')[0],
        
        // Order type (must be 'sales', not 'sales_order')
        order_type: 'sales',
        payment_terms: 'credit',
        
        // Items matching OrderItemCreate schema
        items: order.items.map(item => {
          const quantity = parseInt(item.quantity) || 1;
          const freeQuantity = parseInt(item.free_quantity) || 0;
          const unitPrice = parseFloat(item.unit_price) || 0;
          const discountPercent = parseFloat(item.discount_percent) || 0;
          const taxPercent = parseFloat(item.gst_percent) || 0;
          
          // Calculate amounts as backend expects
          const subtotal = quantity * unitPrice;
          const discountAmount = (subtotal * discountPercent) / 100;
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = (taxableAmount * taxPercent) / 100;
          
          return {
            product_id: parseInt(item.product_id),
            product_code: item.product_code || null,
            batch_id: item.batch_id ? parseInt(item.batch_id) : null,
            batch_number: item.batch_number || null,
            quantity: quantity,
            free_quantity: freeQuantity,  // Add free quantity!
            unit_price: unitPrice,
            mrp: parseFloat(item.mrp) || unitPrice,  // Add MRP
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount,
            gst_type: order.gst_type || 'CGST/SGST',  // Add GST type!
            uom: item.uom || null,  // Add UOM
            pack_type: item.pack_type || null  // Add pack type
            // pack_size removed - not needed for now
          };
        }),
        
        // Optional fields
        notes: order.notes || '',
        billing_address: order.billing_address || '',
        shipping_address: order.shipping_address || '',
        discount_amount: parseFloat(order.discount_amount) || 0,
        other_charges: parseFloat(order.other_charges) || 0
      };
      
      // Use sales-orders endpoint with proper API client (like invoice does)
      const response = await apiClient.post('/sales-orders/', salesOrderData);
      
      if (response?.data) {
        const createdOrderId = response.data.order_id || response.data.id;
        const createdOrderNumber = response.data.order_number || response.data.order_no || `ORD-${createdOrderId}`;
        
        // Update the order state with the backend-generated order number
        setOrder(prevOrder => ({
          ...prevOrder,
          order_number: createdOrderNumber,
          order_id: createdOrderId
        }));
        
        // Store order data for success modal
        setCreatedOrderData({
          orderId: createdOrderId,
          orderNumber: createdOrderNumber,
          customerName: selectedCustomer?.customer_name || order.customer_name,
          totalAmount: order.total_amount || 0
        });
        
        // Show success modal instead of message
        toast.success('Sales order created successfully!');
        setShowSuccessModal(true);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      toast.error('Failed to create sales order');
      
      // Check for validation errors
      let errorMessage = 'Failed to create sales order';
      
      if (error.response?.data?.detail) {
        const details = error.response.data.detail;
        if (Array.isArray(details)) {
          errorMessage = details.map(err => 
            `${err.loc?.join('.') || 'Field'}: ${err.msg}`
          ).join('\n');
        } else {
          errorMessage = details;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      setMessage(errorMessage);
      setMessageType('error');
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Print order
  const printOrder = () => {
    // Add print-specific class to body
    document.body.classList.add('printing-order');
    
    // Trigger print
    window.print();
    
    // Remove print-specific class after a delay
    setTimeout(() => {
      document.body.classList.remove('printing-order');
    }, 100);
  };

  // Share on WhatsApp
  const shareOnWhatsApp = () => {
    if (!order.customer_details?.phone) {
      alert('Customer phone number not available');
      return;
    }

    const message = `
Sales Order: ${order.order_number}
Date: ${order.order_date}
Customer: ${order.customer_name}
Items: ${order.total_quantity}
Amount: ₹${order.total_amount.toFixed(2)}
Expected Delivery: ${order.expected_delivery_date}
    `.trim();

    const whatsappUrl = `https://wa.me/91${order.customer_details.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (!open) return null;

  // Main component render
  return (
    <>
      {/* Step 1: Create Order */}
      {currentStep === 1 && (
        <div className="h-full bg-blue-50">
          <div className="h-full flex flex-col">
          
          {/* Header */}
          <ModuleHeader
            title="Sales Order"
            documentNumber={order.order_number}
            status={order.status}
            icon={ShoppingCart}
            iconColor="text-purple-600"
            onClose={onClose}
            historyType="order"
            showSaveDraft={true}
            onSaveDraft={() => {
            }}
          />

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+I</strong> - Import | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-blue-50">
            <div className="max-w-6xl mx-auto px-6 py-6">
              
              {/* Message Display */}
              {message && (
                <div className={`mb-4 p-3 rounded flex items-center ${
                  messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                  {message}
                </div>
              )}
              
              {/* Top Section - Dates and Import */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <StandardDatePicker
                  label="Order Date"
                  value={order.order_date}
                  onChange={(value) => setOrder(prev => ({ ...prev, order_date: value }))}
                  required
                  size="sm"
                />
                <StandardDatePicker
                  label="Expected Delivery"
                  value={order.expected_delivery_date}
                  onChange={(value) => setOrder(prev => ({ ...prev, expected_delivery_date: value }))}
                  size="sm"
                />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Import Data</label>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 h-[38px]"
                  >
                    <FileInput className="w-4 h-4 text-gray-400" />
                    <span>Import from Invoice/Challan</span>
                  </button>
                </div>
              </div>

              {/* Customer Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    CUSTOMER
                  </h3>
                  <button
                    onClick={() => setShowCustomerModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Customer
                  </button>
                </div>
                <CustomerSearch
                  value={selectedCustomer}
                  onChange={handleCustomerSelect}
                  onCreateNew={() => setShowCustomerModal(true)}
                  displayMode="inline"
                  placeholder="Search customer by name, phone, or code..."
                  required
                />
              </div>

              {/* Products Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    PRODUCTS
                  </h3>
                  <button
                    onClick={() => setShowProductModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Product
                  </button>
                </div>
                <ProductSearchSimple
                  onAddItem={handleProductSelect}
                  onCreateProduct={(productName) => {
                    setNewProductName(productName || '');
                    setShowProductModal(true);
                  }}
                />
              </div>

              {/* Items Table */}
              {order.items.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    ORDER ITEMS
                  </h3>
                  <ItemsTable
                    items={order.items}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    title="Order Items"
                    columns={['product', 'pack', 'quantity', 'free', 'mrp', 'rate', 'discount', 'tax', 'total']}
                    customColumns={{
                      pack: {
                        label: 'Pack/Unit',
                        align: 'center',
                        render: (item) => {
                          const pack = item.pack_size || item.pack_type || '1x1';
                          const unit = item.unit || item.uom || 'TAB';
                          return `${pack} ${unit}`;
                        }
                      }
                    }}
                  />
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <DocumentFooter
            totalItems={order.total_quantity}
            totalAmount={order.total_amount}
            onCancel={onClose}
            onContinue={() => setCurrentStep(2)}
            cancelLabel="Cancel"
            continueLabel="Continue"
            continueDisabled={!order.customer_id || order.items.length === 0}
            continueButtonColor="purple"
          />

        </div>

        {/* Modals */}
        {showCustomerModal && (
          <CustomerCreation
            onClose={() => setShowCustomerModal(false)}
            onCustomerCreated={(customer) => {
              handleCustomerSelect(customer);
              setShowCustomerModal(false);
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            show={showProductModal}
            onClose={() => {
              setShowProductModal(false);
              setNewProductName('');
            }}
            onProductCreated={(product) => {
              handleProductSelect(product);
              setShowProductModal(false);
              setNewProductName('');
            }}
            initialProductName={newProductName}
          />
        )}

        {showImportModal && (
          <ImportFromDocumentModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            onImport={handleImport}
          />
        )}

        </div>
      )}

      {/* Step 2: Review and Confirm */}
      {currentStep === 2 && (
        <div className="h-full bg-blue-50">
          <div className="h-full flex flex-col">
        
        {/* Header */}
        <ModuleHeader
          title="Review Order"
          documentNumber={order.order_number}
          status={order.status}
          icon={ShoppingCart}
          iconColor="text-purple-600"
          onClose={onClose}
          historyType="order"
          additionalActions={[
            {
              label: "Edit",
              onClick: () => setCurrentStep(1),
              variant: "default"
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Order | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Back
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            
            {/* Removed redundant Review Page Header - already in ModuleHeader */}
            
            {/* Message Display */}
            {message && (
              <div className={`mb-4 p-3 rounded-lg flex items-center ${
                messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                {message}
              </div>
            )}
            
            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                @page {
                  size: A4;
                  margin: 15mm;
                }
                
                /* Hide everything except order preview */
                body.printing-order * {
                  visibility: hidden !important;
                }
                body.printing-order .order-preview-container,
                body.printing-order .order-preview-container * {
                  visibility: visible !important;
                }
                body.printing-order .order-preview-container {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: white !important;
                  border: none !important;
                  box-shadow: none !important;
                }
                
                /* Hide ALL interactive elements during print */
                .no-print,
                button,
                .edit-icon,
                [class*="Edit"],
                [class*="edit"],
                svg[class*="edit"],
                svg.lucide-edit2,
                .lucide-edit2,
                input[type="checkbox"],
                select,
                .text-blue-600,
                .hover\\:text-blue-700,
                [title="Edit address"] {
                  display: none !important;
                  visibility: hidden !important;
                }
                
                /* Make inputs look like plain text */
                input:not([type="checkbox"]),
                textarea {
                  border: none !important;
                  background: transparent !important;
                  padding: 0 !important;
                  resize: none !important;
                }
                
                /* Maintain preview appearance in print */
                .print-container {
                  padding: 24px !important;
                  box-shadow: none !important;
                  border: none !important;
                  outline: none !important;
                  margin: 0 !important;
                }
                
                /* Maintain header proportions */
                .print-header {
                  padding-bottom: 12px !important;
                  margin-bottom: 16px !important;
                }
                
                .print-header h1 {
                  font-size: 20px !important;
                  margin-bottom: 4px !important;
                }
                
                .print-header h2 {
                  font-size: 16px !important;
                  margin-bottom: 8px !important;
                }
                
                /* Maintain proper spacing */
                .mb-4 {
                  margin-bottom: 16px !important;
                }
                
                .mb-3 {
                  margin-bottom: 12px !important;
                }
                
                .mb-2 {
                  margin-bottom: 8px !important;
                }
                
                .p-3 {
                  padding: 12px !important;
                }
                
                .p-4 {
                  padding: 16px !important;
                }
                
                .gap-4 {
                  gap: 16px !important;
                }
                
                /* Table with proper spacing */
                .print-table {
                  border-collapse: collapse !important;
                  border: 1px solid #e5e7eb !important;
                  width: 100% !important;
                  margin: 16px 0 !important;
                }
                .print-table th,
                .print-table td {
                  border: 1px solid #e5e7eb !important;
                  padding: 10px 8px !important;
                  font-size: 11px !important;
                }
                .print-table thead {
                  background-color: #f9fafb !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .no-print {
                  display: none !important;
                }
                .print-header {
                  border-bottom: 2px solid #dbeafe !important;
                  margin-bottom: 16px !important;
                  padding-bottom: 12px !important;
                }
                .print-section {
                  padding: 10px !important;
                  margin-bottom: 10px !important;
                }
                .page-break-avoid {
                  page-break-inside: avoid !important;
                }
                body {
                  margin: 0 !important;
                  padding: 0 !important;
                }
                /* Hide editable inputs in print */
                input, select {
                  border: none !important;
                  background: transparent !important;
                }
                /* Hide calendar icon and make date input look like text in print */
                input[type="date"]::-webkit-calendar-picker-indicator {
                  display: none !important;
                }
                input[type="date"] {
                  -webkit-appearance: none !important;
                  -moz-appearance: none !important;
                  appearance: none !important;
                }
                /* Show text values in print */
                .print\:block {
                  display: block !important;
                }
                .print\:hidden {
                  display: none !important;
                }
                /* Make all sections look uniform in print */
                .bg-gray-50 {
                  background-color: #f9fafb !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                
                /* Enhanced print styling to match preview */
                .bg-blue-50 {
                  background-color: #eff6ff !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                
                .bg-purple-50 {
                  background-color: #faf5ff !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                
                /* Keep rounded corners in print */
                .rounded-lg {
                  border-radius: 0.5rem !important;
                }
                
                /* Soft borders for inner elements only */
                .border {
                  border-width: 1px !important;
                  border-style: solid !important;
                }
                
                .border-gray-200 {
                  border-color: #f3f4f6 !important;
                }
                
                .border-blue-200 {
                  border-color: transparent !important;
                }
                
                .border-purple-200 {
                  border-color: #faf5ff !important;
                }
                
                .border-b-2 {
                  border-bottom-width: 1px !important;
                }
                
                .border-blue-300 {
                  border-bottom-color: #e5e7eb !important;
                }
                
                /* Remove border from main container */
                .bg-white.print-container {
                  border: none !important;
                  outline: none !important;
                }
                
                /* Calendar icon and other UI elements */
                svg.text-blue-400 {
                  display: none !important;
                }
                
                /* Make date input look clean in print */
                input[type="date"] {
                  font-weight: 500 !important;
                  color: #111827 !important;
                }
                
                /* Text colors in print */
                .text-gray-700 {
                  color: #374151 !important;
                }
                
                .text-gray-600 {
                  color: #4b5563 !important;
                }
                
                .text-gray-500 {
                  color: #6b7280 !important;
                }
                
                .text-blue-700 {
                  color: #1d4ed8 !important;
                }
                
                .text-purple-600 {
                  color: #9333ea !important;
                }
                
                /* No shadows in print */
                .shadow-sm {
                  box-shadow: none !important;
                }
                
                /* Logo box styling for print - subtle */
                .border-2.border-gray-300 {
                  border: 1px solid #e5e7eb !important;
                }
                
                /* Text sizes - maintain proportions */
                .text-xs {
                  font-size: 11px !important;
                }
                
                .text-sm {
                  font-size: 13px !important;
                }
                
                .text-lg {
                  font-size: 16px !important;
                }
                
                .text-xl {
                  font-size: 18px !important;
                }
                
                .text-2xl {
                  font-size: 20px !important;
                }
                
                /* Headings */
                h3 {
                  font-size: 11px !important;
                  font-weight: 600 !important;
                  margin-bottom: 8px !important;
                }
              }
            ` }} />
            
            {/* Order Preview with Thermal Print Support */}
            <PrintUtility
              documentData={{
                documentNumber: order.order_number,
                date: order.order_date,
                customer: {
                  name: order.customer_name,
                  phone: selectedCustomer?.phone || selectedCustomer?.primary_phone,
                  gstin: selectedCustomer?.gstin,
                  dl_number: selectedCustomer?.dl_number
                },
                items: order.items.map(item => ({
                  product_name: item.product_name,
                  hsn_code: item.hsn_code,
                  batch_no: item.batch_no || item.batch_number,
                  quantity: item.quantity,
                  free_quantity: item.free_quantity || 0,
                  unit_price: item.unit_price,
                  discount_percent: item.discount_percent || 0,
                  gst_percent: item.gst_percent || 0,
                  total: item.calculated_total || item.total
                })),
                totals: {
                  subtotal: order.subtotal_amount,
                  discount: order.discount_amount || 0,
                  tax_amount: order.tax_amount,
                  cgst_amount: order.cgst_amount || (order.tax_amount / 2),
                  sgst_amount: order.sgst_amount || (order.tax_amount / 2),
                  igst_amount: order.igst_amount || 0,
                  total_amount: order.total_amount,
                  final_amount: order.total_amount
                },
                addresses: {
                  billing: order.billing_address,
                  shipping: order.shipping_address
                },
                notes: order.notes
              }}
              documentType="sales-order"
              companyInfo={companyInfo}
              showPrintOptions={true}
            >
            <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 print-container order-preview-container">
              {/* Professional Header with Logo Space */}
              <div className="mb-4 pb-3 border-b-2 border-blue-300 print-header">
                <div className="flex justify-between items-start">
                  {/* Left: Logo Space + Company Details */}
                  <div className="flex gap-4">
                    {/* Logo Placeholder - Professional space for branding */}
                    <div className="w-24 h-24 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <span className="text-xs text-gray-400 text-center">Company<br/>Logo</span>
                    </div>
                    
                    {/* Company Information */}
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">{companyInfo.name || 'Your Company'}</h1>
                      {/* GST Number - Prominently displayed right after company name */}
                      {companyInfo.gstin && (
                        <p className="text-sm font-semibold text-gray-700 mb-1">
                          GSTIN: {companyInfo.gstin}
                        </p>
                      )}
                      <p className="text-xs text-gray-600">{companyInfo.address || ''}</p>
                      {companyInfo.phone && (
                        <p className="text-xs text-gray-600">
                          Phone: {companyInfo.phone} 
                          {companyInfo.email && ` | Email: ${companyInfo.email}`}
                        </p>
                      )}
                      {/* Additional Registration Numbers if needed */}
                      {companyInfo.pan && (
                        <p className="text-xs text-gray-600">PAN: {companyInfo.pan}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Right: Document Details */}
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-purple-600 mb-2">SALES ORDER</h2>
                    <div className="bg-purple-50 border border-purple-200 rounded p-2">
                      <p className="text-sm font-semibold text-gray-700">Order No: {order.order_number}</p>
                      <p className="text-xs text-gray-600 mt-1">Date: {new Date(order.order_date).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Details Section */}
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Left: Customer Info & Delivery */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Customer Details</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                      <p className="font-medium text-sm text-gray-900">{order.customer_name}</p>
                      {selectedCustomer?.gstin && (
                        <p className="text-xs text-gray-500 mt-1">GSTIN: {selectedCustomer.gstin}</p>
                      )}
                      {selectedCustomer?.dl_number && (
                        <p className="text-xs text-gray-500">D.L. No: {selectedCustomer.dl_number}</p>
                      )}
                      {selectedCustomer?.phone && (
                        <p className="text-xs text-gray-500">Phone: {selectedCustomer.phone}</p>
                      )}
                    </div>
                    
                    {/* Bank Details Tile - Moved Up for better space utilization */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Bank Information</p>
                      {/* Print-friendly display - Use order state which has the bank info */}
                      <div className="hidden print:block text-xs text-gray-600 space-y-1">
                        {order.bank_name ? (
                          <>
                            <div>{order.bank_name}</div>
                            <div>A/c: {order.account_number}</div>
                            <div>IFSC: {order.ifsc_code}</div>
                            {order.upi_id && (
                              <div>UPI: {order.upi_id}</div>
                            )}
                          </>
                        ) : (
                          <div className="text-gray-400">No bank account selected</div>
                        )}
                      </div>
                      {/* Interactive selector for screen */}
                      <div className="print:hidden">
                        <BankAccountSelector
                          selectedAccount={selectedBankAccount}
                          onChange={(account) => {
                            setSelectedBankAccount(account);
                            if (account) {
                              setOrder(prev => ({
                                ...prev,
                                bank_name: account.bank_name,
                                account_number: account.account_number,
                                ifsc_code: account.ifsc_code,
                                upi_id: account.upi_id || ''
                              }));
                            }
                          }}
                          autoSelectDefault={true}
                          className="w-full"
                          compact={true}
                        />
                        {selectedBankAccount && (
                          <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div>A/c: {selectedBankAccount.account_number}</div>
                            <div>IFSC: {selectedBankAccount.ifsc_code}</div>
                            {selectedBankAccount.upi_id && (
                              <div>UPI: {selectedBankAccount.upi_id}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Payment Terms and Bank Details in Separate Tiles */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Payment & Banking</h3>
                    
                    {/* Payment Terms Tile */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                      <label className="text-xs font-semibold text-gray-700 block mb-2">Payment Terms</label>
                      <span className="text-sm font-medium text-gray-900 print:inline hidden print:block">
                        {order.payment_terms === 'net30' ? 'Net 30 Days' : 
                         order.payment_terms === 'net60' ? 'Net 60 Days' :
                         order.payment_terms === 'credit' ? 'Credit' :
                         order.payment_terms === 'cash' ? 'Cash' :
                         order.payment_terms === 'advance' ? 'Advance' : order.payment_terms}
                      </span>
                      <select
                        value={order.payment_terms}
                        onChange={(e) => setOrder(prev => ({ ...prev, payment_terms: e.target.value }))}
                        className="w-full px-2 py-1 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 print:hidden"
                      >
                        <option value="credit">Credit</option>
                        <option value="cash">Cash</option>
                        <option value="advance">Advance</option>
                        <option value="net30">Net 30 Days</option>
                        <option value="net60">Net 60 Days</option>
                      </select>
                    </div>
                    
                    {/* Expected Delivery - Moved Down, No Asterisk (Not Mandatory) */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <label className="text-xs font-semibold text-gray-700 block">
                        Expected Delivery
                      </label>
                      {/* Print-friendly display */}
                      <span className="hidden print:inline text-sm text-gray-900">
                        {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString('en-IN') : 'Not specified'}
                      </span>
                      {/* Interactive input for screen */}
                      <input
                        type="date"
                        value={order.expected_delivery_date}
                        onChange={(e) => setOrder(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border-0 bg-transparent focus:outline-none print:hidden"
                        style={{ WebkitAppearance: 'none' }}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Address Forms - Using proper global component with consistent styling */}
                {selectedCustomer && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <AddressForm
                      customer={selectedCustomer}
                      addressData={order.billing_address_data}
                      addressType="billing"
                      onChange={(address) => setOrder(prev => ({ ...prev, billing_address: address }))}
                      onSave={(addressData) => setOrder(prev => ({ ...prev, billing_address_data: addressData }))}
                      className="bg-gray-50 border border-gray-200 rounded-lg"
                    />
                    <AddressForm
                      customer={selectedCustomer}
                      addressData={order.shipping_address_data}
                      addressType="shipping"
                      onChange={(address) => setOrder(prev => ({ ...prev, shipping_address: address }))}
                      onSave={(addressData) => setOrder(prev => ({ ...prev, shipping_address_data: addressData }))}
                      sameAsBilling={sameAsBilling}
                      billingAddressData={order.billing_address_data} // Pass billing data for display
                      onSameAsBillingChange={(same) => {
                        setSameAsBilling(same);
                        if (same) {
                          setOrder(prev => ({ 
                            ...prev, 
                            shipping_address: prev.billing_address,
                            shipping_address_data: prev.billing_address_data 
                          }));
                        }
                      }}
                      className="bg-gray-50 border border-gray-200 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-4">Order Items</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border border-blue-200 print-table">
                    <thead className="bg-blue-50">
                      <tr>
                        <th className="text-left py-2 px-3 text-xs font-medium text-blue-700 border-b">Item Details</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-blue-700 border-b">HSN</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-blue-700 border-b">Pack/Unit</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-blue-700 border-b">Qty</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-blue-700 border-b">Free</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">MRP</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">Rate</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">Disc %</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">GST %</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-blue-700 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, index) => {
                        const quantity = parseFloat(item.quantity) || 0;
                        const rate = parseFloat(item.unit_price) || 0;
                        const discount = parseFloat(item.discount_percent) || 0;
                        const gst = parseFloat(item.gst_percent) || 0;
                        
                        // Use calculated values from backend if available, otherwise calculate locally
                        const totalAmount = item.calculated_total || item.total || (() => {
                          const amount = quantity * rate;
                          const discountAmount = (amount * discount) / 100;
                          const taxableAmount = amount - discountAmount;
                          const gstAmount = (taxableAmount * gst) / 100;
                          return taxableAmount + gstAmount;
                        })();
                        
                        return (
                          <tr key={index} className="border-b hover:bg-blue-50">
                            <td className="py-2 px-3">
                              <p className="text-sm font-medium">{item.product_name}</p>
                              <p className="text-xs text-gray-500">Batch: {item.batch_no || item.batch_number || 'N/A'}</p>
                              {item.expiry_date && (
                                <p className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</p>
                              )}
                            </td>
                            <td className="text-center py-2 px-3 text-sm font-medium">{item.hsn_code || 'N/A'}</td>
                            <td className="text-center py-2 px-3 text-sm">
                              {item.pack_size || item.pack_type || '1x1'} {item.unit || item.uom || 'TAB'}
                            </td>
                            <td className="text-center py-2 px-3 text-sm font-medium">{quantity}</td>
                            <td className="text-center py-2 px-3 text-sm">{item.free_quantity || 0}</td>
                            <td className="text-right py-2 px-3 text-sm">₹{(item.mrp || item.unit_price || 0).toFixed(2)}</td>
                            <td className="text-right py-2 px-3 text-sm">₹{rate.toFixed(2)}</td>
                            <td className="text-right py-2 px-3 text-sm">{discount}%</td>
                            <td className="text-right py-2 px-3 text-sm">{gst}%</td>
                            <td className="text-right py-2 px-3 text-sm font-medium">₹{totalAmount.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* GST Breakdown and Summary */}
                <div className="mt-4 grid grid-cols-2 gap-4 page-break-avoid">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-700 mb-2">GST Breakdown</h4>
                    <div className="space-y-1">
                      {order.gst_type === 'IGST' ? (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">IGST (18%)</span>
                            <span className="font-medium">₹{(order.igst_amount || order.tax_amount || 0).toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">CGST (9%)</span>
                            <span className="font-medium">₹{(order.cgst_amount || order.tax_amount/2 || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">SGST (9%)</span>
                            <span className="font-medium">₹{(order.sgst_amount || order.tax_amount/2 || 0).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="text-blue-700 font-medium">Total GST</span>
                        <span className="font-semibold">₹{(order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-700 mb-2">Order Summary</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Sub Total</span>
                        <span className="font-medium">₹{(order.subtotal_amount || order.total_amount - order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total GST</span>
                        <span className="font-medium">₹{(order.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      {order.round_off && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Round Off</span>
                          <span className="font-medium">₹{order.round_off.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="text-blue-700 font-semibold">Grand Total</span>
                        <span className="font-bold text-lg text-purple-600">₹{order.total_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Total in Words */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm"><span className="font-medium">Amount in Words:</span> {numberToWords(order.total_amount)}</p>
                </div>
                
                {/* Terms and Signature Section */}
                <div className="grid grid-cols-2 gap-6 mt-4 pt-3 border-t border-gray-200">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">Terms & Conditions</h4>
                    <ol className="text-xs text-gray-600 list-decimal list-inside space-y-0.5">
                      <li>Goods once sold will not be taken back or exchanged</li>
                      <li>Interest @ 18% p.a. will be charged on overdue payments</li>
                      <li>All disputes subject to {companyInfo.city || 'local'} jurisdiction</li>
                      <li>E. & O.E.</li>
                    </ol>
                  </div>
                  <div className="text-center">
                    <div className="h-12 border-b border-gray-300 mb-2"></div>
                    <p className="text-xs font-semibold text-gray-700">Authorized Signatory</p>
                    <p className="text-xs text-gray-500">For {companyInfo.name || 'Your Company Name'}</p>
                  </div>
                </div>
                
                {/* Thank You Message */}
                <div className="text-center mt-4 pt-3 border-t border-gray-100">
                  <p className="text-sm text-gray-600">Thank you for your business!</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {companyInfo.name || 'Your Company'}
                  </p>
                </div>
              </div>

            </div>
            </PrintUtility>
            
            {/* Notes Section - Editable on review page */}
            <div className="mt-6">
              <NotesSection
                value={order.notes}
                onChange={(value) => setOrder(prev => ({ ...prev, notes: value }))}
                placeholder="Add any special instructions or notes..."
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <DocumentFooter
          totalItems={order.total_quantity}
          totalAmount={order.total_amount}
          subtotalAmount={order.subtotal_amount}
          taxAmount={order.tax_amount}
          roundOffAmount={order.round_off}
          grandTotal={order.total_amount}
          onPrint={printOrder}
          onSave={saveOrder}
          saveLabel="Generate Order"
          onWhatsApp={shareOnWhatsApp}
          isSaving={saving}
          customerPhone={selectedCustomer?.phone || order.customer_details?.phone}
          showActionButtons={true}
        />

        </div>
      </div>
    )}

      {/* Success Modal with ShareDocument */}
      {showSuccessModal && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            // Close the entire component after successful creation
            onClose();
          }}
          title="Sales Order Created!"
          documentNumber={createdOrderData?.orderNumber}
          documentId={createdOrderData?.orderId}
          documentType="sales-order"
          customerName={createdOrderData?.customerName}
          totalAmount={createdOrderData?.totalAmount}
          autoCloseDelay={5}
          additionalActions={[
            {
              label: "Create Another Order",
              onClick: () => {
                setShowSuccessModal(false);
                // Reset for new order
                setOrder({
                  order_number: '',
                  order_date: new Date().toISOString().split('T')[0],
                  expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  customer_name: '',
                  customer_id: null,
                  items: [],
                  subtotal_amount: 0,
                  discount_amount: 0,
                  tax_amount: 0,
                  total_amount: 0,
                  cgst_amount: 0,
                  sgst_amount: 0,
                  igst_amount: 0,
                  round_off: 0,
                  gst_type: 'CGST/SGST',
                  place_of_supply: ''
                });
                setSelectedCustomer(null);
                setCurrentStep(1);
              },
              variant: "primary"
            }
          ]}
          onPrint={() => {
            printOrder();
            setShowSuccessModal(false);
          }}
          onWhatsApp={() => {
            shareOnWhatsApp();
            setShowSuccessModal(false);
          }}
          showCopy={true}
          enableShare={true}
          partyDetails={{
            name: selectedCustomer?.customer_name,
            phone: selectedCustomer?.phone,
            email: selectedCustomer?.email,
            customer_id: selectedCustomer?.customer_id
          }}
          documentData={{
            expectedDelivery: order.expected_delivery_date,
            paymentTerms: order.payment_terms,
            itemCount: order.items?.length || 0,
            date: order.order_date
          }}
          companyInfo={companyInfo}
        />
      )}
    </>
  );
};

// ImportFromDocumentModal imported from separate file

export default SalesOrderFlow;