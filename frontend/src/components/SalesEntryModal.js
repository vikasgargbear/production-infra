import React, { useState, useEffect, useRef } from 'react';
import { Search, Save, Printer, Plus, X, Calendar, AlertCircle, ChevronRight, ChevronLeft, Package, User, CreditCard, FileText, CheckCircle, Truck } from 'lucide-react';
import { customersApi, productsApi, ordersApi, orderItemsApi, batchesApi } from '../services/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const SalesEntryModal = ({ open, onClose }) => {
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
    gst_breakup: { '5': 0, '12': 0, '18': 0, '28': 0 },
    round_off: 0,
    net_amount: 0,
    payment_mode: 'CASH',
    medical_rep: '',
    transport_mode: '',
    transport_charges: 0,
    notes: ''
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [availableChallans, setAvailableChallans] = useState([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const customerSearchRef = useRef(null);
  const productSearchRef = useRef(null);

  // Sample medical representatives
  const medicalReps = [
    { mr_id: 1, mr_name: 'Dr. Rajesh Kumar' },
    { mr_id: 2, mr_name: 'Dr. Priya Sharma' },
    { mr_id: 3, mr_name: 'Dr. Amit Gupta' },
    { mr_id: 4, mr_name: 'Dr. Sunita Patel' }
  ];

  // Sample challans
  const sampleChallans = [
    {
      challan_id: 'CH001',
      challan_number: 'DC-240101',
      challan_date: '2024-01-15',
      customer_id: 1,
      customer_name: 'Rajesh Medical Store',
      items: [
        {
          product_id: 1,
          product_name: 'Paracetamol 500mg',
          product_code: 'PARA500',
          batch_id: 1,
          batch_no: 'BT240101',
          qty: 50,
          rate: 2.50,
          amount: 125.00,
          gst_percent: 12
        }
      ]
    }
  ];

  // Sample data matching backend customers table schema
  const customers = [
    {
      customer_id: 1,
      customer_code: 'RMS001',
      customer_name: 'Rajesh Medical Store',
      contact_person: 'Rajesh Kumar',
      phone: '+91 98765 43210',
      email: 'rajesh@rms.com',
      address: 'Shop No. 45, Main Market, Gangapur City, Rajasthan - 322201',
      city: 'Gangapur City',
      state: 'Rajasthan',
      gst_number: '08AAXCR1234N1Z5',
      customer_type: 'retail',
      credit_limit: 50000,
      payment_terms: 30,
      drug_license_number: 'DL-RJ-GPC-2024-001',
      credit_terms_days: 30,
      credit_used: 12500,
      is_active: true
    },
    {
      customer_id: 2,
      customer_code: 'CH001',
      customer_name: 'City Hospital Pharmacy',
      contact_person: 'Dr. Sharma',
      phone: '+91 98765 43211',
      email: 'pharmacy@cityhospital.com',
      address: 'City Hospital Complex, Sawai Madhopur, Rajasthan - 322001',
      city: 'Sawai Madhopur',
      state: 'Rajasthan',
      gst_number: '08AAXCH5678N1Z2',
      customer_type: 'hospital',
      credit_limit: 100000,
      payment_terms: 45,
      drug_license_number: 'DL-RJ-SM-2024-002',
      credit_terms_days: 45,
      credit_used: 45000,
      is_active: true
    },
    {
      customer_id: 3,
      customer_code: 'WP001',
      customer_name: 'Wellness Pharmacy',
      contact_person: 'Priya Gupta',
      phone: '+91 98765 43212',
      email: 'info@wellnesspharmacy.com',
      address: 'Plot No. 12, Civil Lines, Karauli, Rajasthan - 322241',
      city: 'Karauli',
      state: 'Rajasthan',
      gst_number: '08AAXCW9012N1Z8',
      customer_type: 'retail',
      credit_limit: 75000,
      payment_terms: 30,
      drug_license_number: 'DL-RJ-KRL-2024-003',
      credit_terms_days: 30,
      credit_used: 25000,
      is_active: true
    }
  ];

  // Sample data matching backend products table schema
  const products = [
    {
      product_id: 1,
      product_code: 'PAR500',
      product_name: 'Paracetamol 500mg',
      category: 'Analgesic',
      manufacturer: 'Cipla Ltd',
      product_type: 'Tablet',
      hsn_code: '30049099',
      gst_percent: 12.00,
      cgst_percent: 6.00,
      sgst_percent: 6.00,
      mrp: 10.00,
      sale_price: 8.50,
      drug_schedule: 'G',
      requires_prescription: false,
      generic_name: 'Paracetamol',
      pack_quantity: 10,
      pack_form: 'Tablet',
      is_discontinued: false
    },
    {
      product_id: 2,
      product_code: 'AMX250',
      product_name: 'Amoxicillin 250mg',
      category: 'Antibiotic',
      manufacturer: 'Sun Pharma',
      product_type: 'Capsule',
      hsn_code: '30041020',
      gst_percent: 5.00,
      cgst_percent: 2.50,
      sgst_percent: 2.50,
      mrp: 45.00,
      sale_price: 38.00,
      drug_schedule: 'H',
      requires_prescription: true,
      generic_name: 'Amoxicillin',
      pack_quantity: 10,
      pack_form: 'Capsule',
      is_discontinued: false
    },
    {
      product_id: 3,
      product_code: 'CROC650',
      product_name: 'Crocin 650mg',
      category: 'Analgesic',
      manufacturer: 'GSK',
      product_type: 'Tablet',
      hsn_code: '30049099',
      gst_percent: 12.00,
      cgst_percent: 6.00,
      sgst_percent: 6.00,
      mrp: 35.00,
      sale_price: 30.00,
      drug_schedule: 'G',
      requires_prescription: false,
      generic_name: 'Paracetamol',
      pack_quantity: 15,
      pack_form: 'Tablet',
      is_discontinued: false
    },
    {
      product_id: 4,
      product_code: 'DOLO650',
      product_name: 'Dolo 650mg Tablet',
      category: 'Analgesic',
      manufacturer: 'Micro Labs',
      product_type: 'Tablet',
      hsn_code: '30049099',
      gst_percent: 18.00,
      cgst_percent: 9.00,
      sgst_percent: 9.00,
      mrp: 30.00,
      sale_price: 25.50,
      drug_schedule: 'G',
      requires_prescription: false,
      generic_name: 'Paracetamol',
      pack_quantity: 15,
      pack_form: 'Tablet',
      is_discontinued: false
    }
  ];

  // Sample data matching backend batches table schema
  const batches = [
    {
      batch_id: 1,
      product_id: 1,
      batch_number: 'B2024A',
      mfg_date: '2024-01-15',
      expiry_date: '2025-08-31',
      purchase_price: 7.00,
      selling_price: 8.50,
      quantity_available: 500,
      location: 'A-12'
    },
    {
      batch_id: 2,
      product_id: 1,
      batch_number: 'B2024B',
      mfg_date: '2024-03-10',
      expiry_date: '2026-02-28',
      purchase_price: 7.00,
      selling_price: 8.50,
      quantity_available: 300,
      location: 'A-13'
    },
    {
      batch_id: 3,
      product_id: 2,
      batch_number: 'AMX2024',
      mfg_date: '2024-02-20',
      expiry_date: '2025-12-31',
      purchase_price: 32.00,
      selling_price: 38.00,
      quantity_available: 200,
      location: 'B-05'
    },
    {
      batch_id: 4,
      product_id: 3,
      batch_number: 'CRO2024',
      mfg_date: '2024-01-05',
      expiry_date: '2025-06-30',
      purchase_price: 25.00,
      selling_price: 30.00,
      quantity_available: 150,
      location: 'C-08'
    },
    {
      batch_id: 5,
      product_id: 4,
      batch_number: 'DOL2024',
      mfg_date: '2024-04-12',
      expiry_date: '2025-10-31',
      purchase_price: 20.00,
      selling_price: 25.50,
      quantity_available: 400,
      location: 'D-15'
    }
  ];

  // Sample challans already defined above

  // medicalReps already defined above

  // Helper functions
  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return { status: 'Unknown', class: 'bg-gray-100 text-gray-600' };
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { status: 'Expired', class: 'bg-red-100 text-red-800 border-red-500' };
    } else if (diffDays <= 30) {
      return { status: 'Expiring Soon', class: 'bg-orange-100 text-orange-800 border-orange-500' };
    } else if (diffDays <= 90) {
      return { status: 'Short Expiry', class: 'bg-yellow-100 text-yellow-800 border-yellow-500' };
    } else {
      return { status: 'Good', class: 'bg-green-100 text-green-800 border-green-500' };
    }
  };

  const createFromChallan = (challan) => {
    const newItems = challan.items.map(item => {
      const product = products.find(p => p.product_id === item.product_id);
      const batch = batches.find(b => b.batch_id === item.batch_id);
      
      return {
        id: Date.now() + Math.random(),
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        hsn_code: product?.hsn_code || '',
        pack_type: `${product?.pack_quantity || 0} ${product?.pack_form || ''}`,
        availableBatches: batches.filter(b => b.product_id === item.product_id),
        selectedBatch: batch,
        batch_id: item.batch_id,
        batch_number: item.batch_number,
        expiry_date: batch?.expiry_date || '',
        expiryStatus: getExpiryStatus(batch?.expiry_date),
        qty: item.qty,
        freeQty: 0,
        mrp: product?.mrp || 0,
        rate: item.rate,
        discount: 0,
        taxPercent: item.gst_percent || product?.gst_percent || 0,
        amount: item.amount,
        taxAmount: (item.amount * (item.gst_percent || product?.gst_percent || 0)) / 100,
        netAmount: item.amount + ((item.amount * (item.gst_percent || product?.gst_percent || 0)) / 100),
        availableStock: batch?.quantity_available || 0
      };
    });

    setInvoice(prev => ({ ...prev, items: newItems }));
    calculateTotals(newItems);
    setShowChallanModal(false);
  };

  // Search functions
  const filteredCustomers = customers.filter(c => 
    searchQuery && (
      c.customer_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
      customer_id: customer.customer_id,
      customer_code: customer.customer_code, 
      customer_name: customer.customer_name,
      customer_details: customer
    }));
    setSearchQuery('');
    setShowCustomerSearch(false);
  };

  // Add product to invoice
  const addProduct = (product) => {
    const productBatches = batches.filter(b => b.product_id === product.product_id);
    
    // Sort batches by expiry date (earliest first)
    const sortedBatches = productBatches.sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date) - new Date(b.expiry_date);
    });

    // Auto-select FIFO batch (oldest expiry date first)
    let selectedBatch = null;
    let batchId = null;
    let batchNo = '';
    let expiryDate = '';
    let expiryStatus = null;
    
    if (sortedBatches.length > 0) {
      // FIFO: Select the batch with the earliest expiry date that has stock
      const fifoBatch = sortedBatches
        .filter(batch => batch.quantity_available > 0)
        .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];
      
      if (fifoBatch) {
        selectedBatch = fifoBatch;
        batchId = fifoBatch.batch_id;
        batchNo = fifoBatch.batch_number;
        expiryDate = fifoBatch.expiry_date;
        expiryStatus = getExpiryStatus(fifoBatch.expiry_date);
      }
    }

    const newItem = {
      id: Date.now(),
      product_id: product.product_id,
      product_code: product.product_code,
      product_name: product.product_name,
      hsn_code: product.hsn_code || '',
      pack_type: `${product.pack_quantity} ${product.pack_form}`,
      availableBatches: sortedBatches,
      selectedBatch,
      batch_id: batchId,
      batch_number: batchNo,
      expiry_date: expiryDate,
      expiryStatus,
      qty: 1,
      freeQty: 0,
      mrp: product.mrp || 0,
      rate: product.sale_price || product.mrp || 0,
      discount: 0,
      taxPercent: product.gst_percent || 0,
      amount: 0,
      taxAmount: 0,
      netAmount: 0,
      availableStock: selectedBatch?.quantity_available || 0
    };

    // Calculate amounts
    const itemTotal = newItem.qty * newItem.rate;
    const itemDiscount = (itemTotal * newItem.discount) / 100;
    const itemTaxableAmount = itemTotal - itemDiscount;
    const itemTaxAmount = (itemTaxableAmount * newItem.taxPercent) / 100;
    const itemNetAmount = itemTaxableAmount + itemTaxAmount;

    newItem.amount = itemTotal;
    newItem.taxAmount = itemTaxAmount;
    newItem.netAmount = itemNetAmount;

    const updatedItems = [...invoice.items, newItem];
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
    setProductSearchQuery('');
  };

  // Select batch for item
  const selectBatch = (itemId, batch) => {
    const updatedItems = invoice.items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { 
          ...item, 
          selectedBatch: batch,
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          expiryStatus: getExpiryStatus(batch.expiry_date),
          availableStock: batch.quantity_available,
          rate: batch.selling_price || item.rate
        };
        
        // Recalculate amounts
        const itemTotal = updatedItem.qty * updatedItem.rate;
        const itemDiscount = (itemTotal * updatedItem.discount) / 100;
        const itemTaxableAmount = itemTotal - itemDiscount;
        const itemTaxAmount = (itemTaxableAmount * updatedItem.taxPercent) / 100;
        const itemNetAmount = itemTaxableAmount + itemTaxAmount;

        updatedItem.amount = itemTotal;
        updatedItem.taxAmount = itemTaxAmount;
        updatedItem.netAmount = itemNetAmount;
        
        return updatedItem;
      }
      return item;
    });
    
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Update item quantity
  const updateItemQty = (itemId, qty) => {
    const updatedItems = invoice.items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, qty: parseInt(qty) || 0 };
        
        // Recalculate amounts
        const itemTotal = updatedItem.qty * updatedItem.rate;
        const itemDiscount = (itemTotal * updatedItem.discount) / 100;
        const itemTaxableAmount = itemTotal - itemDiscount;
        const itemTaxAmount = (itemTaxableAmount * updatedItem.taxPercent) / 100;
        const itemNetAmount = itemTaxableAmount + itemTaxAmount;

        updatedItem.amount = itemTotal;
        updatedItem.taxAmount = itemTaxAmount;
        updatedItem.netAmount = itemNetAmount;
        
        return updatedItem;
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
        const updatedItem = { ...item, discount: parseFloat(discount) || 0 };
        
        // Recalculate amounts
        const itemTotal = updatedItem.qty * updatedItem.rate;
        const itemDiscount = (itemTotal * updatedItem.discount) / 100;
        const itemTaxableAmount = itemTotal - itemDiscount;
        const itemTaxAmount = (itemTaxableAmount * updatedItem.taxPercent) / 100;
        const itemNetAmount = itemTaxableAmount + itemTaxAmount;

        updatedItem.amount = itemTotal;
        updatedItem.taxAmount = itemTaxAmount;
        updatedItem.netAmount = itemNetAmount;
        
        return updatedItem;
      }
      return item;
    });
    
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Remove item from invoice
  const removeItem = (itemId) => {
    const updatedItems = invoice.items.filter(item => item.id !== itemId);
    setInvoice(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  const calculateTotals = (items) => {
    const totals = items.reduce((acc, item) => {
      const itemTotal = item.qty * item.rate;
      const itemDiscount = (itemTotal * item.discount) / 100;
      const itemTaxableAmount = itemTotal - itemDiscount;
      const itemTaxAmount = (itemTaxableAmount * item.taxPercent) / 100;
      const itemNetAmount = itemTaxableAmount + itemTaxAmount;
      
      acc.totalAmount += itemTotal;
      acc.discountAmount += itemDiscount;
      acc.taxableAmount += itemTaxableAmount;
      acc.taxAmount += itemTaxAmount;
      acc.netAmount += itemNetAmount;
      
      // GST breakup
      const gstRate = item.taxPercent;
      if (gstRate > 0) {
        acc.gstBreakup[gstRate] = (acc.gstBreakup[gstRate] || 0) + itemTaxAmount;
      }
      
      return acc;
    }, {
      totalAmount: 0,
      discountAmount: 0,
      taxableAmount: 0,
      taxAmount: 0,
      netAmount: 0,
      gstBreakup: { '5': 0, '12': 0, '18': 0, '28': 0 }
    });

    // Calculate CGST and SGST (split GST equally)
    const cgstAmount = totals.taxAmount / 2;
    const sgstAmount = totals.taxAmount / 2;
    
    // Round off calculation
    const roundOff = Math.round(totals.netAmount) - totals.netAmount;
    const finalAmount = totals.netAmount + roundOff;

    setInvoice(prev => ({
      ...prev,
      gross_amount: totals.totalAmount,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      tax_amount: totals.taxAmount,
      gst_amount: totals.taxAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      gst_breakup: totals.gstBreakup,
      round_off: roundOff,
      net_amount: totals.netAmount,
      final_amount: finalAmount
    }));
  };

  // Generate WhatsApp PDF
  const generateWhatsAppPDF = async () => {
    if (!invoice.customer_details?.phone) {
      alert('Customer phone number is required for WhatsApp sharing');
      return;
    }

    setIsGeneratingPDF(true);
    
    try {
      const element = document.getElementById('invoice-content');
      
      if (!element) {
        throw new Error('Invoice content element not found');
      }

      // Enhanced canvas options for better PDF quality
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: function(clonedDocument) {
          const clonedElement = clonedDocument.getElementById('invoice-content');
          if (clonedElement) {
            clonedElement.style.transform = 'scale(1)';
            clonedElement.style.transformOrigin = 'top left';
            clonedElement.style.webkitFontSmoothing = 'antialiased';
            clonedElement.style.mozOsxFontSmoothing = 'grayscale';
          }
        }
      });

      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('Canvas is empty - content not rendered properly');
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      
      if (!imgData || imgData === 'data:image/png;base64,') {
        throw new Error('Image data is empty');
      }
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      const pageWidthMM = 210;
      const pageHeightMM = 297;
      const margin = 5;
      
      const availableWidth = pageWidthMM - (2 * margin);
      const availableHeight = pageHeightMM - (2 * margin);
      
      const scaleX = availableWidth / (imgWidth / 96 * 25.4);
      const scaleY = availableHeight / (imgHeight / 96 * 25.4);
      const optimalScale = Math.min(scaleX, scaleY) * 0.95;
      
      const finalWidth = (imgWidth / 96 * 25.4) * optimalScale;
      const finalHeight = (imgHeight / 96 * 25.4) * optimalScale;
      
      if (finalHeight <= availableHeight) {
        pdf.addImage(imgData, 'PNG', margin, margin, finalWidth, finalHeight);
      } else {
        const pagesNeeded = Math.ceil(finalHeight / availableHeight);
        const pageSliceHeight = availableHeight;
        
        for (let pageIndex = 0; pageIndex < pagesNeeded; pageIndex++) {
          if (pageIndex > 0) pdf.addPage();
          
          const startY = (pageIndex * pageSliceHeight) / optimalScale * 96 / 25.4;
          const sliceHeight = Math.min(pageSliceHeight / optimalScale * 96 / 25.4, imgHeight - startY);
          
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = imgWidth;
          tempCanvas.height = sliceHeight;
          
          tempCtx.imageSmoothingEnabled = true;
          tempCtx.imageSmoothingQuality = 'high';
          tempCtx.drawImage(canvas, 0, startY, imgWidth, sliceHeight, 0, 0, imgWidth, sliceHeight);
          
          const sliceDataURL = tempCanvas.toDataURL('image/png', 1.0);
          const pdfSliceHeight = sliceHeight / 96 * 25.4 * optimalScale;
          
          pdf.addImage(sliceDataURL, 'PNG', margin, margin, finalWidth, pdfSliceHeight);
        }
      }
      
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      const companyName = localStorage.getItem('companyName') || 'AASO Pharmaceuticals';
      const customerName = invoice.customer_details?.customer_name || 'Customer';
      const message = `Hi ${customerName},\n\nPlease find attached your invoice ${invoice.invoice_no} from ${companyName}.\n\nTotal Amount: ₹${invoice.final_amount.toFixed(2)}\n\nThank you for your business!\n\nBest regards,\n${companyName}`;
      
      const whatsappUrl = `https://wa.me/${invoice.customer_details.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `Invoice_${invoice.invoice_no}_${customerName.replace(/\s+/g, '_')}.pdf`;
      link.click();
      
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
        URL.revokeObjectURL(pdfUrl);
      }, 1000);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Save invoice
  const saveInvoice = async () => {
    if (!invoice.customer_id) {
      alert('Please select a customer');
      return;
    }

    const validItems = invoice.items.filter(item => 
      item.product_id && item.selectedBatch && item.qty > 0
    );

    if (validItems.length === 0) {
      alert('Please add at least one product with batch selected');
      return;
    }

    try {
      setSaving(true);

      // Create order
      const orderData = {
        customer_id: invoice.customer_id,
        order_type: 'SALE',
        gross_amount: invoice.gross_amount,
        discount: invoice.discount_amount,
        tax_amount: invoice.tax_amount,
        final_amount: invoice.final_amount,
        payment_status: 'PENDING',
        notes: invoice.notes || ''
      };

      const orderResponse = await ordersApi.create(orderData);
      const orderId = orderResponse.data.order_id;

      // Create order items
      const orderItemsPromises = validItems.map(item => {
        return orderItemsApi.create({
          order_id: orderId,
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.qty,
          unit_price: item.rate,
          total_price: item.netAmount,
          discount: item.discount
        });
      });

      await Promise.all(orderItemsPromises);

      // Move to step 3 (success page)
      setCurrentStep(3);
      
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        productSearchRef.current?.focus();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Helper functions - moved up to avoid redeclaration

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
                  <p className="text-xs text-gray-500">{localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <span className={`px-2 py-1 text-xs rounded-full ${currentStep === 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                  Step 1: Products
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${currentStep === 2 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                  Step 2: Summary
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${currentStep === 3 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                  Step 3: Complete
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {currentStep === 1 ? (
                <button
                  onClick={() => {
                    if (!invoice.customer_id) {
                      alert('Please select a customer');
                      return;
                    }
                    if (invoice.items.length === 0) {
                      alert('Please add at least one product');
                      return;
                    }
                    const hasInvalidItems = invoice.items.some(item => !item.qty || item.qty <= 0);
                    if (hasInvalidItems) {
                      alert('Please enter valid quantity for all items');
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Next: Summary
                  <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              ) : currentStep === 2 ? (
                <>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </button>
                  <button
                    onClick={saveInvoice}
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save & Finalize'}
                  </button>
                </>
              ) : (
                /* Step 3 buttons are in the content */
                null
              )}
              {currentStep !== 3 && (
                <>
                  <button
                    onClick={() => setShowPrintPreview(true)}
                    disabled={invoice.items.length === 0}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </button>
                  <button
                    onClick={() => setShowWhatsAppPreview(true)}
                    disabled={invoice.items.length === 0 || !invoice.customer_details?.phone}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.487"/>
                    </svg>
                    WhatsApp
                  </button>
                </>
              )}
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
                <h3 className="text-lg font-bold text-gray-900">Customer Details</h3>
              </div>
              
              {!invoice.customer_id ? (
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
                  
                  {showCustomerSearch && filteredCustomers.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-auto">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.customer_id}
                          onClick={() => selectCustomer(customer)}
                          className="p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-gray-900">
                                {customer.customer_code} - {customer.customer_name}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                {customer.phone} | {customer.city || 'N/A'}
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
                      ))}
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
                          {invoice.customer_code} - {invoice.customer_name}
                        </div>
                        <div className="text-xs text-gray-600">
                          Credit: ₹{(invoice.customer_details?.credit_limit || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setInvoice(prev => ({
                          ...prev,
                          customer_id: '',
                          customer_code: '',
                          customer_name: '',
                          customer_details: null
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
                    value={invoice.invoice_no}
                    readOnly
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoice.invoice_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={invoice.due_date}
                    onChange={(e) => setInvoice(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Quick Product Search */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 mb-4">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Add Products to Invoice</h3>
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
              
              {productSearchQuery && filteredProducts.length > 0 && (
                <div className="mt-4 bg-white rounded-lg shadow-lg border border-gray-200 max-h-80 overflow-auto">
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
                          <div className="text-xs text-gray-500 mt-1">Pack: {product.pack_quantity} {product.pack_form} | HSN: {product.hsn_code || 'N/A'}</div>
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
                </div>
              )}
              
              {productSearchQuery && filteredProducts.length === 0 && (
                <div className="mt-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                  <div className="text-yellow-800 font-medium">No products found for "{productSearchQuery}"</div>
                  <div className="text-yellow-600 text-sm mt-1">Try searching with product code or partial name</div>
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
                              <div className="text-sm font-semibold text-gray-900 truncate">{item.product_code}</div>
                              <div className="text-xs text-gray-500 truncate">{item.product_name}</div>
                            </div>
                          </td>
                          <td className="px-3 py-4 align-middle">
                            <div className="text-xs text-gray-700">{item.pack_type}</div>
                          </td>
                          <td className="px-3 py-4 align-middle">
                            <div className="space-y-1">
                              {item.availableBatches.length > 0 ? (
                                <select
                                  value={item.batch_id || ''}
                                  onChange={(e) => {
                                    const batch = item.availableBatches.find(b => b.batch_id === parseInt(e.target.value));
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
                              step="0.1"
                            />
                          </td>
                          <td className="px-2 py-4 align-middle text-center text-xs font-medium">{item.taxPercent}%</td>
                          <td className="px-3 py-4 align-middle text-right text-sm font-bold">₹{item.netAmount.toFixed(2)}</td>
                          <td className="px-3 py-4 align-middle text-center">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No products added yet</p>
                  <p className="text-gray-400">Search and add products to get started</p>
                </div>
              )}
            </div>

            </>
          ) : currentStep === 2 ? (
            /* Invoice Summary Step */
            <div className="max-w-5xl mx-auto">
              {/* Enterprise Invoice Header */}
              <div id="invoice-content" className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-start space-x-4">
                    {/* Company Logo */}
                    {localStorage.getItem('companyLogo') ? (
                      <img 
                        src={localStorage.getItem('companyLogo')} 
                        alt="Company Logo" 
                        className="h-16 w-auto object-contain"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-2xl">
                          {(localStorage.getItem('companyName') || 'AASO').charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">TAX INVOICE</h2>
                      <p className="text-sm text-gray-600">Invoice No: {invoice.invoice_no}</p>
                      <p className="text-sm text-gray-600">Date: {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-lg font-semibold text-gray-900">{localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}</h3>
                    <p className="text-sm text-gray-600">{localStorage.getItem('companyAddress') || 'Mumbai, Maharashtra'}</p>
                    <p className="text-sm text-gray-600">GSTIN: {localStorage.getItem('companyGST') || '27AAAAA0000A1Z5'}</p>
                    <p className="text-sm text-gray-600">DL No: {localStorage.getItem('companyDL') || 'MH-MUM-123456'}</p>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Bill To:</h4>
                    <p className="font-semibold text-gray-900">{invoice.customer_name}</p>
                    {invoice.customer_details && (
                      <>
                        <p className="text-sm text-gray-600">{invoice.customer_details.address}</p>
                        <p className="text-sm text-gray-600">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                        <p className="text-sm text-gray-600">GSTIN: {invoice.customer_details.gst_number || 'N/A'}</p>
                        <p className="text-sm text-gray-600">Phone: {invoice.customer_details.phone || 'N/A'}</p>
                      </>
                    )}
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Invoice Details:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-gray-600">Due Date:</span>
                      <span className="text-gray-900">{new Date(invoice.due_date).toLocaleDateString('en-IN')}</span>
                      <span className="text-gray-600">Payment Mode:</span>
                      <span className="text-gray-900">{invoice.payment_mode}</span>
                      <span className="text-gray-600">Transport:</span>
                      <span className="text-gray-900">{invoice.transport_mode || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="mb-8">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">S.No</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">Product Description</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">HSN</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">Batch</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">Expiry</th>
                        <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold text-gray-700">Qty</th>
                        <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold text-gray-700">Rate</th>
                        <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold text-gray-700">GST%</th>
                        <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold text-gray-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-4 py-2 text-sm">{index + 1}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-xs text-gray-500">{item.manufacturer}</div>
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-sm">{item.hsn_code || 'N/A'}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm">{item.batch_number}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : 'N/A'}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm text-right">{item.qty}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm text-right">₹{item.rate.toFixed(2)}</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm text-right">{item.gst_percent || 0}%</td>
                          <td className="border border-gray-300 px-4 py-2 text-sm text-right">₹{item.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tax Breakup and Summary */}
                <div className="grid grid-cols-2 gap-8">
                  {/* Tax Breakup */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Tax Breakup</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left py-1">GST Rate</th>
                          <th className="text-right py-1">Taxable</th>
                          {invoice.customer_details?.state === localStorage.getItem('companyState') ? (
                            <>
                              <th className="text-right py-1">CGST</th>
                              <th className="text-right py-1">SGST</th>
                            </>
                          ) : (
                            <th className="text-right py-1">IGST</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(invoice.gst_breakup).filter(([rate, amount]) => amount > 0).map(([rate, amount]) => (
                          <tr key={rate} className="border-t">
                            <td className="py-1">{rate}%</td>
                            <td className="text-right py-1">₹{amount.toFixed(2)}</td>
                            {invoice.customer_details?.state === localStorage.getItem('companyState') ? (
                              <>
                                <td className="text-right py-1">₹{(amount * parseFloat(rate) / 200).toFixed(2)}</td>
                                <td className="text-right py-1">₹{(amount * parseFloat(rate) / 200).toFixed(2)}</td>
                              </>
                            ) : (
                              <td className="text-right py-1">₹{(amount * parseFloat(rate) / 100).toFixed(2)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Final Summary */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Invoice Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-medium">₹{invoice.gross_amount.toFixed(2)}</span>
                      </div>
                      {invoice.discount_amount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Discount ({invoice.discount_percent}%):</span>
                          <span>-₹{invoice.discount_amount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Taxable Amount:</span>
                        <span>₹{invoice.taxable_amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total GST:</span>
                        <span>₹{invoice.gst_amount.toFixed(2)}</span>
                      </div>
                      {invoice.transport_charges > 0 && (
                        <div className="flex justify-between">
                          <span>Transport Charges:</span>
                          <span>₹{invoice.transport_charges.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Round Off:</span>
                        <span>₹{invoice.round_off.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold pt-2 border-t">
                        <span>Net Amount:</span>
                        <span className="text-blue-600">₹{Math.round(invoice.net_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment & Additional Details */}
                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                    <select
                      value={invoice.payment_mode}
                      onChange={(e) => setInvoice(prev => ({ ...prev, payment_mode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="CASH">Cash</option>
                      <option value="CREDIT">Credit</option>
                      <option value="CARD">Card</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Transport Charges</label>
                    <input
                      type="number"
                      value={invoice.transport_charges}
                      onChange={(e) => {
                        const charges = parseFloat(e.target.value) || 0;
                        setInvoice(prev => ({ ...prev, transport_charges: charges }));
                        calculateTotals();
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={invoice.notes}
                    onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Step 3: Complete */
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Invoice Created Successfully!</h2>
                <p className="text-gray-600 mb-6">Invoice #{invoice.invoice_no} has been saved.</p>
                
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setShowPrintPreview(true)}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Printer className="w-5 h-5 mr-2" />
                    Print Invoice
                  </button>
                  <button
                    onClick={() => setShowWhatsAppPreview(true)}
                    className="inline-flex items-center px-6 py-3 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.787"/>
                    </svg>
                    Share on WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      // Reset form for new invoice
                      const newInvoiceNo = 'INV-' + Date.now().toString().slice(-6);
                      setInvoice({
                        ...invoice,
                        invoice_no: newInvoiceNo,
                        customer_id: '',
                        customer_name: '',
                        customer_details: null,
                        items: [],
                        gross_amount: 0,
                        discount: 0,
                        tax_amount: 0,
                        final_amount: 0,
                        total_amount: 0,
                        discount_percent: 0,
                        discount_amount: 0,
                        taxable_amount: 0,
                        gst_amount: 0,
                        cgst_amount: 0,
                        sgst_amount: 0,
                        gst_breakup: { '5': 0, '12': 0, '18': 0, '28': 0 },
                        round_off: 0,
                        net_amount: 0,
                        transport_charges: 0,
                        notes: ''
                      });
                      setCurrentStep(1);
                    }}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    New Invoice
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Challan Modal */}
      {showChallanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Select Challan</h3>
              <button
                onClick={() => setShowChallanModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              {sampleChallans.map((challan) => (
                <div
                  key={challan.challan_id}
                  onClick={() => createFromChallan(challan)}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-900">{challan.challan_number}</div>
                      <div className="text-sm text-gray-500">{challan.customer_name}</div>
                      <div className="text-xs text-gray-400">Date: {challan.challan_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{challan.items.length} items</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Invoice Content for PDF Generation */}
      <div id="invoice-whatsapp-content" className="hidden">
        <div className="bg-white p-8 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            {/* Company Logo */}
            <div className="flex justify-center mb-4">
              {localStorage.getItem('companyLogo') ? (
                <img 
                  src={localStorage.getItem('companyLogo')} 
                  alt="Company Logo" 
                  className="h-20 w-auto object-contain"
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-3xl">
                    {(localStorage.getItem('companyName') || 'AASO').charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}
            </h1>
            <p className="text-gray-600">Tax Invoice</p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Bill To:</h3>
              <div className="text-gray-700">
                <div className="font-medium">{invoice.customer_name}</div>
                <div className="text-sm">{invoice.customer_details?.address}</div>
                <div className="text-sm">GST: {invoice.customer_details?.gst_number}</div>
                <div className="text-sm">Phone: {invoice.customer_details?.phone}</div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-gray-600">
                <div>Invoice No: <span className="font-medium">{invoice.invoice_no}</span></div>
                <div>Date: <span className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</span></div>
                <div>Due Date: <span className="font-medium">{new Date(invoice.due_date).toLocaleDateString('en-IN')}</span></div>
              </div>
            </div>
          </div>
          
          <div className="mb-8">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">Item</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">Qty</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Rate</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-4 py-2">
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-sm text-gray-600">Batch: {item.batch_number}</div>
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{item.qty}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">₹{item.rate.toFixed(2)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">₹{item.netAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-end">
            <div className="w-64">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{invoice.gross_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>₹{invoice.discount_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST:</span>
                  <span>₹{invoice.gst_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Round Off:</span>
                  <span>₹{invoice.round_off.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>₹{Math.round(invoice.net_amount).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Preview Modal */}
      {showWhatsAppPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">WhatsApp Invoice Preview</h3>
                <button
                  onClick={() => setShowWhatsAppPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mt-6 flex justify-end space-x-4">
                <button
                  onClick={() => setShowWhatsAppPreview(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={generateWhatsAppPDF}
                  disabled={isGeneratingPDF}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isGeneratingPDF ? 'Generating...' : 'Send WhatsApp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesEntryModal;