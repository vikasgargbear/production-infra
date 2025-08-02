import jsPDF from 'jspdf';

/**
 * Generate invoice PDF from invoice details
 * @param {Object} invoiceData - Invoice details from API
 * @returns {Blob} PDF blob
 */
export const generateInvoicePDF = (invoiceData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let yPosition = 20;

  // Helper function to add centered text
  const addCenteredText = (text, y, fontSize = 12, fontStyle = 'normal') => {
    doc.setFontSize(fontSize);
    doc.setFont(undefined, fontStyle);
    const textWidth = doc.getTextWidth(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
  };

  // Helper function to add line
  const addLine = (startX, startY, endX, endY) => {
    doc.line(startX, startY, endX, endY);
  };

  // Header
  addCenteredText('TAX INVOICE', yPosition, 16, 'bold');
  yPosition += 10;

  // Company Info
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(invoiceData.org_name || 'AASO Pharma', 20, yPosition);
  yPosition += 6;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const orgAddress = invoiceData.org_address || 'Mumbai, Maharashtra';
  doc.text(orgAddress, 20, yPosition);
  yPosition += 5;
  doc.text(`GSTIN: ${invoiceData.org_gstin || '27AABCU9603R1ZM'}`, 20, yPosition);
  yPosition += 5;
  doc.text(`Phone: ${invoiceData.org_phone || '+91 98765 43210'}`, 20, yPosition);
  yPosition += 10;

  // Invoice Details Box
  addLine(20, yPosition, pageWidth - 20, yPosition);
  yPosition += 5;

  // Invoice Number and Date
  doc.setFont(undefined, 'bold');
  doc.text(`Invoice No: ${invoiceData.invoice_number}`, 20, yPosition);
  doc.text(`Date: ${invoiceData.invoice_date}`, pageWidth - 60, yPosition);
  yPosition += 6;
  
  doc.setFont(undefined, 'normal');
  doc.text(`Due Date: ${invoiceData.due_date}`, pageWidth - 60, yPosition);
  yPosition += 8;

  // Customer Details
  doc.setFont(undefined, 'bold');
  doc.text('Bill To:', 20, yPosition);
  yPosition += 6;
  
  doc.setFont(undefined, 'normal');
  doc.text(invoiceData.customer_name, 20, yPosition);
  yPosition += 5;
  
  // Split address into multiple lines if needed
  const addressLines = invoiceData.billing_address.split('\n');
  addressLines.forEach(line => {
    if (line.trim()) {
      doc.text(line.trim(), 20, yPosition);
      yPosition += 5;
    }
  });
  
  if (invoiceData.customer_gstin) {
    doc.text(`GSTIN: ${invoiceData.customer_gstin}`, 20, yPosition);
    yPosition += 5;
  }
  
  doc.text(`Phone: ${invoiceData.customer_phone}`, 20, yPosition);
  yPosition += 10;

  // Items Table Header
  addLine(20, yPosition, pageWidth - 20, yPosition);
  yPosition += 5;
  
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('S.No', 25, yPosition);
  doc.text('Product', 40, yPosition);
  doc.text('HSN', 90, yPosition);
  doc.text('Qty', 110, yPosition);
  doc.text('Rate', 125, yPosition);
  doc.text('Tax%', 145, yPosition);
  doc.text('Amount', 165, yPosition);
  yPosition += 5;
  
  addLine(20, yPosition, pageWidth - 20, yPosition);
  yPosition += 5;

  // Items
  doc.setFont(undefined, 'normal');
  invoiceData.items.forEach((item, index) => {
    // Check if we need a new page
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.text(String(item.sr_no || index + 1), 25, yPosition);
    
    // Truncate product name if too long
    const productName = item.product_name.length > 25 
      ? item.product_name.substring(0, 25) + '...' 
      : item.product_name;
    doc.text(productName, 40, yPosition);
    
    doc.text(item.hsn_code || '', 90, yPosition);
    doc.text(String(item.quantity), 110, yPosition);
    doc.text(`₹${item.unit_price.toFixed(2)}`, 125, yPosition);
    doc.text(`${item.tax_percent}%`, 145, yPosition);
    doc.text(`₹${item.line_total.toFixed(2)}`, 165, yPosition);
    
    yPosition += 6;
    
    // Add batch and expiry info if available
    if (item.batch_number || item.expiry_date) {
      doc.setFontSize(8);
      doc.text(`   Batch: ${item.batch_number || 'N/A'} | Exp: ${item.expiry_date || 'N/A'}`, 40, yPosition);
      doc.setFontSize(10);
      yPosition += 5;
    }
  });

  yPosition += 5;
  addLine(20, yPosition, pageWidth - 20, yPosition);
  yPosition += 8;

  // Summary Section
  const summaryX = pageWidth - 80;
  
  doc.setFont(undefined, 'normal');
  doc.text('Subtotal:', summaryX, yPosition);
  doc.text(`₹${invoiceData.subtotal_amount}`, summaryX + 40, yPosition);
  yPosition += 6;

  if (parseFloat(invoiceData.discount_amount) > 0) {
    doc.text('Discount:', summaryX, yPosition);
    doc.text(`₹${invoiceData.discount_amount}`, summaryX + 40, yPosition);
    yPosition += 6;
  }

  // Tax breakdown
  if (parseFloat(invoiceData.cgst_amount) > 0) {
    doc.text('CGST:', summaryX, yPosition);
    doc.text(`₹${invoiceData.cgst_amount}`, summaryX + 40, yPosition);
    yPosition += 6;
    
    doc.text('SGST:', summaryX, yPosition);
    doc.text(`₹${invoiceData.sgst_amount}`, summaryX + 40, yPosition);
    yPosition += 6;
  }

  if (parseFloat(invoiceData.igst_amount) > 0) {
    doc.text('IGST:', summaryX, yPosition);
    doc.text(`₹${invoiceData.igst_amount}`, summaryX + 40, yPosition);
    yPosition += 6;
  }

  if (parseFloat(invoiceData.round_off_amount) !== 0) {
    doc.text('Round Off:', summaryX, yPosition);
    doc.text(`₹${invoiceData.round_off_amount}`, summaryX + 40, yPosition);
    yPosition += 6;
  }

  // Total
  addLine(summaryX - 5, yPosition, pageWidth - 20, yPosition);
  yPosition += 6;
  
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Total:', summaryX, yPosition);
  doc.text(`₹${invoiceData.total_amount}`, summaryX + 40, yPosition);
  yPosition += 10;

  // Bank Details
  if (invoiceData.bank_details) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Bank Details:', 20, yPosition);
    yPosition += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Bank: ${invoiceData.bank_details.bank_name}`, 20, yPosition);
    yPosition += 5;
    doc.text(`A/C: ${invoiceData.bank_details.account_number}`, 20, yPosition);
    yPosition += 5;
    doc.text(`IFSC: ${invoiceData.bank_details.ifsc_code}`, 20, yPosition);
    yPosition += 10;
  }

  // Terms and Conditions
  if (invoiceData.terms_and_conditions) {
    doc.setFont(undefined, 'bold');
    doc.text('Terms & Conditions:', 20, yPosition);
    yPosition += 6;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const terms = doc.splitTextToSize(invoiceData.terms_and_conditions, pageWidth - 40);
    doc.text(terms, 20, yPosition);
  }

  // Footer
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  addLine(20, footerY - 10, pageWidth - 20, footerY - 10);
  addCenteredText('This is a computer generated invoice', footerY - 5, 8);

  return doc.output('blob');
};

/**
 * Download invoice PDF
 * @param {Object} invoiceData - Invoice details from API
 */
export const downloadInvoicePDF = (invoiceData) => {
  const blob = generateInvoicePDF(invoiceData);
  
  // Create a download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoiceData.invoice_number}.pdf`;
  link.click();
  
  // Clean up
  URL.revokeObjectURL(url);
};

/**
 * Get invoice PDF as base64
 * @param {Object} invoiceData - Invoice details from API
 * @returns {Promise<string>} Base64 encoded PDF
 */
export const getInvoicePDFBase64 = async (invoiceData) => {
  const blob = generateInvoicePDF(invoiceData);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};