import GlobalPDFGenerator from '../components/global/pdf/GlobalPDFGenerator';
import { DocumentType, Theme } from '../components/global/pdf/GlobalPDFGenerator';

interface PDFGenerationOptions {
  theme?: Theme;
  documentType?: DocumentType;
  orientation?: 'portrait' | 'landscape';
  watermark?: string;
  showBatchInfo?: boolean;
  showBankDetails?: boolean;
  showTerms?: boolean;
}

/**
 * Generate and download PDF for any document type
 */
export const generateAndDownloadPDF = async (
  data: any,
  filename: string,
  options: PDFGenerationOptions = {}
): Promise<void> => {
  const {
    theme = 'modern',
    documentType = 'invoice',
    orientation = 'portrait',
    watermark,
    showBatchInfo = true,
    showBankDetails = true,
    showTerms = true
  } = options;

  try {
    // Initialize PDF generator
    const pdfGenerator = new GlobalPDFGenerator(theme, documentType);
    await pdfGenerator.init(theme, documentType, orientation);

    // Add watermark if specified
    if (watermark) {
      pdfGenerator.addWatermark(watermark);
    }

    // Generate PDF based on document type
    if (documentType === 'invoice' || documentType === 'purchase') {
      await generateInvoiceStylePDF(pdfGenerator, data, {
        showBatchInfo,
        showBankDetails,
        showTerms
      });
    } else if (documentType === 'challan') {
      await generateChallanPDF(pdfGenerator, data);
    } else if (documentType === 'quotation') {
      await generateQuotationPDF(pdfGenerator, data);
    } else if (documentType === 'receipt') {
      await generateReceiptPDF(pdfGenerator, data);
    } else if (documentType === 'creditnote' || documentType === 'debitnote') {
      await generateNotePDF(pdfGenerator, data, documentType);
    }

    // Download the PDF
    pdfGenerator.download(filename);
  } catch (error) {
    throw error;
  }
};

/**
 * Generate invoice-style PDF (for invoices and purchases)
 */
const generateInvoiceStylePDF = async (
  pdfGenerator: GlobalPDFGenerator,
  data: any,
  options: any
): Promise<void> => {
  // Add header
  pdfGenerator.addHeader();

  // Add document info
  const docInfo = {
    number: data.invoice_number || data.purchase_number || data.document_number,
    date: formatDate(data.invoice_date || data.purchase_date || data.date),
    dueDate: data.due_date ? formatDate(data.due_date) : undefined,
    status: data.status
  };
  pdfGenerator.addDocumentInfo(docInfo, pdfGenerator.currentY + 10);

  // Add party details
  const partyDetails = {
    name: data.customer_name || data.supplier_name || '',
    phone: data.customer_phone || data.supplier_phone || '',
    address: data.billing_address || data.supplier_address || '',
    gst: data.customer_gstin || data.supplier_gstin || '',
    email: data.customer_email || data.supplier_email || ''
  };
  pdfGenerator.addPartyDetails(
    partyDetails,
    data.customer_name ? 'customer' : 'supplier',
    pdfGenerator.currentY + 10
  );

  // Prepare items
  const items = (data.items || []).map((item: any, index: number) => ({
    srNo: index + 1,
    name: item.product_name || item.item_name || item.name,
    description: item.description,
    hsn: item.hsn_code || item.hsn,
    batch: item.batch_number || item.batch,
    expiry: item.expiry_date || item.expiry,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unit_price || item.rate || item.price,
    discount: item.discount,
    taxPercent: item.tax_percent || item.gst_percent || 0,
    cgstPercent: item.cgst_percent,
    sgstPercent: item.sgst_percent,
    igstPercent: item.igst_percent,
    lineTotal: item.line_total || item.total || (item.quantity * (item.unit_price || 0))
  }));

  // Add items table
  pdfGenerator.currentY += 45;
  pdfGenerator.addEnhancedItemsTable(items, options.showBatchInfo);

  // Add summary
  const summary = {
    subtotal: parseFloat(data.subtotal_amount || data.subtotal || 0),
    discount: parseFloat(data.discount_amount || data.discount || 0),
    cgst: parseFloat(data.cgst_amount || 0),
    sgst: parseFloat(data.sgst_amount || 0),
    igst: parseFloat(data.igst_amount || 0),
    tax: parseFloat(data.total_gst || 0),
    roundOff: parseFloat(data.round_off_amount || data.round_off || 0),
    total: parseFloat(data.final_amount || data.total_amount || data.net_amount || 0)
  };
  pdfGenerator.currentY += 10;
  pdfGenerator.addSummary(summary);

  // Add bank details if available and needed
  if (options.showBankDetails && data.bank_details) {
    pdfGenerator.currentY += 10;
    pdfGenerator.addBankDetails({
      bankName: data.bank_details.bank_name,
      accountNumber: data.bank_details.account_number,
      ifscCode: data.bank_details.ifsc_code,
      branch: data.bank_details.branch,
      upiId: data.bank_details.upi_id
    });
  }

  // Add terms and conditions if available
  if (options.showTerms && data.terms_and_conditions) {
    pdfGenerator.currentY += 10;
    pdfGenerator.addTermsAndConditions(data.terms_and_conditions);
  }

  // Add notes if available
  if (data.notes) {
    pdfGenerator.currentY += 10;
    pdfGenerator.addNotes(data.notes);
  }

  // Add footer
  pdfGenerator.addFooter();
};

/**
 * Generate challan PDF
 */
const generateChallanPDF = async (
  pdfGenerator: GlobalPDFGenerator,
  data: any
): Promise<void> => {
  // Similar to invoice but with challan-specific fields
  await generateInvoiceStylePDF(pdfGenerator, data, {
    showBatchInfo: true,
    showBankDetails: false,
    showTerms: true
  });
};

/**
 * Generate quotation PDF
 */
const generateQuotationPDF = async (
  pdfGenerator: GlobalPDFGenerator,
  data: any
): Promise<void> => {
  // Similar to invoice but with validity date instead of due date
  const modifiedData = {
    ...data,
    due_date: data.validity_date || data.valid_till
  };
  await generateInvoiceStylePDF(pdfGenerator, modifiedData, {
    showBatchInfo: false,
    showBankDetails: false,
    showTerms: true
  });
};

/**
 * Generate receipt PDF
 */
const generateReceiptPDF = async (
  pdfGenerator: GlobalPDFGenerator,
  data: any
): Promise<void> => {
  // Simplified version focusing on payment details
  pdfGenerator.addHeader();

  // Receipt info
  const receiptInfo = {
    number: data.receipt_number || data.payment_number,
    date: formatDate(data.receipt_date || data.payment_date),
    numberLabel: 'Receipt No'
  };
  pdfGenerator.addDocumentInfo(receiptInfo, pdfGenerator.currentY + 10);

  // Party details
  const partyDetails = {
    name: data.received_from || data.customer_name || '',
    phone: data.customer_phone || '',
    address: data.customer_address || ''
  };
  pdfGenerator.addPartyDetails(partyDetails, 'customer', pdfGenerator.currentY + 10);

  // Payment details table
  const headers = ['Description', 'Amount'];
  const rows = [
    ['Payment Amount', formatCurrency(data.amount || 0)],
    ['Payment Mode', data.payment_mode || 'Cash'],
    ['Reference No', data.reference_number || '-']
  ];

  pdfGenerator.currentY += 45;
  pdfGenerator.addTable(headers, rows);

  // Add notes
  if (data.notes || data.remarks) {
    pdfGenerator.currentY += 20;
    pdfGenerator.addNotes(data.notes || data.remarks);
  }

  pdfGenerator.addFooter();
};

/**
 * Generate credit/debit note PDF
 */
const generateNotePDF = async (
  pdfGenerator: GlobalPDFGenerator,
  data: any,
  type: 'creditnote' | 'debitnote'
): Promise<void> => {
  // Similar to invoice but with note-specific fields
  const modifiedData = {
    ...data,
    invoice_number: data.note_number || data[`${type}_number`],
    invoice_date: data.note_date || data[`${type}_date`]
  };

  await generateInvoiceStylePDF(pdfGenerator, modifiedData, {
    showBatchInfo: true,
    showBankDetails: false,
    showTerms: false
  });
};

/**
 * Format date for display
 */
const formatDate = (date: string | Date): string => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

/**
 * Format currency
 */
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
};

/**
 * Preview PDF in new window
 */
export const previewPDF = async (
  data: any,
  options: PDFGenerationOptions = {}
): Promise<void> => {
  const {
    theme = 'modern',
    documentType = 'invoice',
    orientation = 'portrait'
  } = options;

  try {
    const pdfGenerator = new GlobalPDFGenerator(theme, documentType);
    await pdfGenerator.init(theme, documentType, orientation);

    // Generate PDF content based on type
    if (documentType === 'invoice' || documentType === 'purchase') {
      await generateInvoiceStylePDF(pdfGenerator, data, {
        showBatchInfo: true,
        showBankDetails: true,
        showTerms: true
      });
    }

    // Preview in new window
    pdfGenerator.preview();
  } catch (error) {
    throw error;
  }
};

/**
 * Get PDF as base64 for API upload
 */
export const getPDFBase64 = async (
  data: any,
  options: PDFGenerationOptions = {}
): Promise<string> => {
  const {
    theme = 'modern',
    documentType = 'invoice',
    orientation = 'portrait'
  } = options;

  try {
    const pdfGenerator = new GlobalPDFGenerator(theme, documentType);
    await pdfGenerator.init(theme, documentType, orientation);

    // Generate PDF content
    if (documentType === 'invoice' || documentType === 'purchase') {
      await generateInvoiceStylePDF(pdfGenerator, data, {
        showBatchInfo: true,
        showBankDetails: true,
        showTerms: true
      });
    }

    return await pdfGenerator.getBase64();
  } catch (error) {
    throw error;
  }
};