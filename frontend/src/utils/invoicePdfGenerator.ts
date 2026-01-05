/**
 * Invoice PDF Generator using HTML/CSS
 * Generates beautiful invoice documents for print and download
 */

// ==================== TYPE DEFINITIONS ====================

export interface InvoiceItem {
    product_name?: string;
    batch_number?: string;
    batch_number?: string;
    hsn_code?: string;
    pack_type?: string;
    pack_size?: number;
    pack_unit?: string;
    units_per_pack?: number;  // Backend standard: units in one pack
    packages_per_box?: number;  // Backend standard: packs in one box
    sale_unit?: string;
    quantity?: number;
    mrp?: number;
    unit_price?: number;
    tax_percent?: number;
    gst_percent?: number;
    line_total?: number;
    total?: number;
}

export interface InvoiceData {
    invoice_number?: string;
    order_number?: string;
    invoice_date?: string;
    order_date?: string;
    org_name?: string;
    customer_name?: string;
    customer_phone?: string;
    customer_gst_number?: string;
    billing_address?: string;
    shipping_address?: string;
    shipping_contact_name?: string;
    shipping_phone?: string;
    is_same_address?: boolean;
    items?: InvoiceItem[];
    subtotal_amount?: number;
    cgst_amount?: number | string;
    sgst_amount?: number | string;
    igst_amount?: number | string;
    round_off_amount?: number | string;
    final_amount?: number | string;
    total_amount?: number | string;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert number to words (Indian numbering system)
 */
const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const convertHundreds = (n: number): string => {
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

    const convertToWords = (n: number): string => {
        if (n === 0) return 'Zero';
        let str = '';
        if (n >= 10000000) {
            str += convertHundreds(Math.floor(n / 10000000)) + 'Crore ';
            n %= 10000000;
        }
        if (n >= 100000) {
            str += convertHundreds(Math.floor(n / 100000)) + 'Lakh ';
            n %= 100000;
        }
        if (n >= 1000) {
            str += convertHundreds(Math.floor(n / 1000)) + 'Thousand ';
            n %= 1000;
        }
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

// ==================== HTML GENERATION ====================

/**
 * Generate HTML content for invoice
 */
const generateInvoiceHTML = (invoiceData: InvoiceData): string => {
    const totalAmount = parseFloat(String(invoiceData.final_amount || 0));
    const totalGst = (parseFloat(String(invoiceData.cgst_amount || 0))) + (parseFloat(String(invoiceData.sgst_amount || 0)));

    const documentTitle = invoiceData.invoice_number ? 'INVOICE' : 'SALES ORDER';
    const documentNumber = invoiceData.invoice_number || invoiceData.order_number || 'DOC-' + Date.now();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentTitle} - ${documentNumber}</title>
    <style>
        /* Reset and base styles */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.4; color: #1f2937; }
        
        /* Digital-first styles - continuous page flow */
        @media print {
            @page { 
                size: A4; 
                margin: 1cm 0.8cm; 
            }
            body { 
                margin: 0 !important; 
                padding: 0 !important; 
                background: white !important;
                font-size: 13px !important;
                line-height: 1.5 !important;
            }
            .print-container { 
                padding: 20px !important; 
                box-shadow: none !important; 
                margin: 0 !important; 
                max-width: none !important;
                width: 100% !important;
                page-break-inside: avoid;
            }
            .print-table { 
                border-collapse: collapse !important; 
                border: 1px solid #ddd !important; 
                width: 100% !important;
                font-size: 12px !important;
            }
            .print-table th, .print-table td { 
                border: 1px solid #000 !important; 
                padding: 4px !important;
                font-size: 10px !important;
            }
            .print-table thead { 
                background-color: #f0f0f0 !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .pack-info { 
                font-size: 9px !important; 
                color: #666 !important; 
            }
            .no-print { display: none !important; }
            .print-header { 
                border-bottom: 2px solid #000 !important; 
                margin-bottom: 10px !important; 
                padding-bottom: 8px !important; 
            }
            .company-name { font-size: 1.5rem !important; }
            .document-title { font-size: 1.1rem !important; }
            .page-break-avoid { page-break-inside: avoid !important; }
            input, select { border: none !important; background: transparent !important; }
            .order-details { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8px !important; }
            .summary-box { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8px !important; }
            .amount-words { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 6px !important; }
            .terms-section { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8px !important; }
            .summary-section { gap: 8px !important; }
            .customer-section { gap: 1rem !important; margin-bottom: 1rem !important; }
            .signature-section { margin-bottom: 1rem !important; }
        }
        
        /* Layout styles - continuous digital flow */
        .print-container { 
            max-width: 850px; 
            margin: 0 auto; 
            background: white; 
            padding: 2.5rem; 
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 14px;
            line-height: 1.6;
        }
        .print-header { 
            text-align: center; 
            margin-bottom: 2.5rem; 
            padding-bottom: 1.5rem; 
            border-bottom: 3px solid #667eea;
            background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }
        .company-logo { 
            width: 5rem; 
            height: 5rem; 
            background: linear-gradient(135deg, #667eea, #764ba2); 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin: 0 auto 1.5rem; 
            color: white; 
            font-size: 2.5rem;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .company-name { 
            font-size: 2.2rem; 
            font-weight: bold; 
            color: #1f2937; 
            margin-bottom: 0.8rem;
            letter-spacing: 1px;
        }
        .document-title { 
            font-size: 1.4rem; 
            font-weight: 600; 
            color: #667eea; 
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .document-number { 
            color: #6b7280; 
            margin-bottom: 0.5rem;
            font-size: 1.1rem;
            font-weight: 500;
        }
        .document-date { 
            font-size: 1rem; 
            color: #9ca3af;
        }
        
        /* Order details grid - enhanced for digital viewing */
        .order-details { 
            display: grid; 
            grid-template-columns: repeat(2, 1fr); 
            gap: 2rem; 
            margin-bottom: 2rem; 
            padding: 1.5rem; 
            background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
            border-radius: 12px;
            border: 2px solid #667eea;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
        }
        .detail-label { 
            font-size: 0.9rem; 
            color: #667eea; 
            margin-bottom: 0.3rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .detail-value { 
            font-size: 1.1rem; 
            font-weight: 600; 
            color: #1f2937;
            line-height: 1.4;
        }
        
        /* Customer info - improved spacing and alignment */
        .customer-section { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 3rem; 
            margin-bottom: 2.5rem;
            background: #f8f9ff;
            padding: 2rem;
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }
        .section-title { 
            font-size: 1.1rem; 
            font-weight: 700; 
            color: #667eea; 
            text-transform: uppercase; 
            letter-spacing: 1px; 
            margin-bottom: 1rem;
            border-bottom: 2px solid #667eea;
            padding-bottom: 0.5rem;
        }
        .customer-name { 
            font-weight: 600; 
            margin-bottom: 0.5rem;
            font-size: 1.1rem;
            color: #1f2937;
        }
        .customer-detail { 
            font-size: 1rem; 
            color: #6b7280; 
            margin-bottom: 0.3rem;
            line-height: 1.5;
        }
        
        /* Items table - enhanced for digital viewing */
        .items-section { 
            margin-bottom: 2.5rem;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .print-table { 
            width: 100%; 
            border: none;
            border-collapse: collapse;
            background: white;
        }
        .print-table thead { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .print-table th { 
            text-align: left; 
            padding: 1.2rem 1rem; 
            font-size: 0.95rem; 
            font-weight: 600; 
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: none;
        }
        .print-table td { 
            padding: 1rem; 
            font-size: 1rem;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
        }
        .print-table tr:nth-child(even) { 
            background: #f8f9ff; 
        }
        .print-table tr:hover {
            background: #e3f2fd;
            transition: background-color 0.2s ease;
        }
        .product-name { 
            font-weight: 600; 
            margin-bottom: 0.3rem;
            color: #1f2937;
            font-size: 1.1rem;
        }
        .product-batch { 
            font-size: 0.9rem; 
            color: #667eea;
            font-weight: 500;
        }
        
        /* Summary sections - enhanced for digital viewing */
        .summary-section { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 2rem; 
            margin-bottom: 2rem;
        }
        .summary-box { 
            background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
            padding: 1.5rem; 
            border-radius: 12px;
            border: 2px solid #667eea;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
        }
        .summary-title { 
            font-size: 1.1rem; 
            font-weight: 700; 
            color: #667eea; 
            margin-bottom: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 0.5rem;
        }
        .summary-item { 
            display: flex; 
            justify-content: space-between; 
            font-size: 1rem; 
            margin-bottom: 0.5rem;
            padding: 0.3rem 0;
            align-items: center;
        }
        .summary-item.total { 
            border-top: 2px solid #667eea; 
            padding-top: 1rem; 
            margin-top: 1rem;
            font-weight: 700; 
            color: #667eea;
            font-size: 1.2rem;
        }
        
        /* Amount in words - enhanced styling */
        .amount-words { 
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 1.5rem; 
            border-radius: 12px; 
            margin-bottom: 2rem; 
            font-size: 1.1rem;
            font-weight: 600;
            text-align: center;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.2);
            letter-spacing: 0.5px;
        }
        
        /* Terms - enhanced for better readability */
        .terms-section { 
            background: #f8f9ff; 
            padding: 1.5rem; 
            border-radius: 12px;
            margin-bottom: 2rem;
            border-left: 4px solid #667eea;
        }
        .terms-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .terms-list { 
            font-size: 1rem; 
            color: #4b5563; 
            list-style: decimal inside;
            line-height: 1.6;
        }
        .terms-list li { 
            margin-bottom: 0.8rem;
            padding-left: 0.5rem;
        }
        
        /* Signatures - enhanced styling */
        .signature-section { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 3rem; 
            margin-bottom: 2rem;
            background: #f8f9ff;
            padding: 2rem;
            border-radius: 12px;
        }
        .signature-box { 
            text-align: center;
            padding: 1rem;
        }
        .signature-line { 
            height: 5rem; 
            border-bottom: 2px solid #667eea; 
            margin-bottom: 1rem;
            position: relative;
        }
        .signature-label { 
            font-size: 1.1rem; 
            color: #667eea; 
            margin-bottom: 0.5rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .signature-sublabel { 
            font-size: 0.9rem; 
            color: #6b7280;
        }
        
        /* Footer - enhanced branding */
        .footer { 
            text-align: center; 
            padding: 2rem 0; 
            border-top: 3px solid #667eea;
            background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
            border-radius: 12px;
            margin-top: 2rem;
        }
        .footer-text { 
            font-size: 1.1rem; 
            color: #667eea; 
            margin-bottom: 0.8rem;
            font-weight: 600;
        }
        .footer-subtext { 
            font-size: 1rem; 
            color: #6b7280; 
            margin-bottom: 0.5rem;
        }
        .footer-brand { 
            font-size: 0.9rem; 
            color: #667eea;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="print-container">
        <!-- Header -->
        <div class="print-header">
            <div class="company-logo">🛒</div>
            <h1 class="company-name">${invoiceData.org_name || 'Your Company Name'}</h1>
            <h2 class="document-title">${documentTitle}</h2>
            <p class="document-number">${documentNumber}</p>
            <p class="document-date">Date: ${invoiceData.invoice_date || invoiceData.order_date || new Date().toLocaleDateString('en-IN')}</p>
        </div>

        <!-- Essential Details Only -->
        <div class="order-details">
            <div class="detail-item">
                <p class="detail-label">Document Status</p>
                <p class="detail-value">CONFIRMED</p>
            </div>
            <div class="detail-item">
                <p class="detail-label">Payment Terms</p>
                <p class="detail-value">Credit</p>
            </div>
        </div>

        <!-- Customer Section -->
        <div class="customer-section">
            <div>
                <h3 class="section-title">Bill To</h3>
                <p class="customer-name">${invoiceData.customer_name || 'Customer Name'}</p>
                ${invoiceData.billing_address ? invoiceData.billing_address.split('\n').map(line => `<p class="customer-detail">${line}</p>`).join('') : ''}
                ${invoiceData.customer_phone ? `<p class="customer-detail">Phone: ${invoiceData.customer_phone}</p>` : ''}
                ${invoiceData.customer_gst_number ? `<p class="customer-detail">GSTIN: ${invoiceData.customer_gst_number}</p>` : ''}
            </div>
            <div>
                <h3 class="section-title">Ship To</h3>
                ${invoiceData.is_same_address !== false ?
            `<p class="customer-detail" style="color: #10b981; font-weight: 500;">✓ Same as billing</p>
                   <p class="customer-name">${invoiceData.customer_name || 'Customer Name'}</p>
                   ${invoiceData.billing_address ? invoiceData.billing_address.split('\n').map(line => `<p class="customer-detail">${line}</p>`).join('') : ''}
                   ${invoiceData.customer_phone ? `<p class="customer-detail">Phone: ${invoiceData.customer_phone}</p>` : ''}` :
            `<p class="customer-name">${invoiceData.shipping_contact_name || invoiceData.customer_name || 'Customer Name'}</p>
                   ${invoiceData.shipping_address ? invoiceData.shipping_address.split('\n').map(line => `<p class="customer-detail">${line}</p>`).join('') : ''}
                   ${invoiceData.shipping_phone ? `<p class="customer-detail">Phone: ${invoiceData.shipping_phone}</p>` : ''}`}
            </div>
        </div>

        <!-- Items Section -->
        <div class="items-section">
            <h3 class="section-title">Order Items</h3>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>Item Details</th>
                        <th style="text-align: center;">HSN</th>
                        <th style="text-align: center;">Pack</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">MRP</th>
                        <th style="text-align: right;">Rate</th>
                        <th style="text-align: right;">GST %</th>
                        <th style="text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${(invoiceData.items || []).map((item: InvoiceItem) => `
                        <tr>
                            <td>
                                <div class="product-name">${item.product_name || 'Unknown Product'}</div>
                                <div class="product-batch">Batch: ${item.batch_number || item.batch_number || 'N/A'}</div>
                            </td>
                            <td style="text-align: center;">${item.hsn_code || '3004'}</td>
                            <td style="text-align: center;">
                                <span class="pack-info">
                                    ${item.pack_type ||
                (item.pack_size && item.pack_unit ? `1×${item.pack_size}${item.pack_unit}` : '') ||
                (item.units_per_pack && item.packages_per_box ? `${item.units_per_pack}×${item.packages_per_box}` : '') ||
                (item.sale_unit ? item.sale_unit : '-')}
                                </span>
                            </td>
                            <td style="text-align: center;">${item.quantity || 1}</td>
                            <td style="text-align: right;">₹${(item.mrp || item.unit_price || 0).toFixed(2)}</td>
                            <td style="text-align: right;">₹${(item.unit_price || 0).toFixed(2)}</td>
                            <td style="text-align: right;">${item.tax_percent || item.gst_percent || 0}%</td>
                            <td style="text-align: right; font-weight: 500;">₹${(item.line_total || item.total || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Summary Section -->
        <div class="summary-section">
            <div class="summary-box">
                <h4 class="summary-title">GST Breakdown</h4>
                <div class="summary-item">
                    <span>CGST (6%)</span>
                    <span>₹${(parseFloat(String(invoiceData.cgst_amount)) || 0).toFixed(2)}</span>
                </div>
                <div class="summary-item">
                    <span>SGST (6%)</span>
                    <span>₹${(parseFloat(String(invoiceData.sgst_amount)) || 0).toFixed(2)}</span>
                </div>
                <div class="summary-item total">
                    <span>Total GST</span>
                    <span>₹${totalGst.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="summary-box">
                <h4 class="summary-title">Order Summary</h4>
                <div class="summary-item">
                    <span>Sub Total</span>
                    <span>₹${(invoiceData.subtotal_amount || 0).toFixed(2)}</span>
                </div>
                <div class="summary-item">
                    <span>Total GST</span>
                    <span>₹${totalGst.toFixed(2)}</span>
                </div>
                ${invoiceData.round_off_amount ? `
                <div class="summary-item">
                    <span>Round Off</span>
                    <span>₹${invoiceData.round_off_amount}</span>
                </div>
                ` : ''}
                <div class="summary-item total">
                    <span>Grand Total</span>
                    <span>₹${totalAmount.toFixed(2)}</span>
                </div>
            </div>
        </div>

        <!-- Amount in Words -->
        <div class="amount-words">
            <strong>Amount in Words:</strong> ${numberToWords(totalAmount)}
        </div>

        <!-- Terms & Conditions -->
        <div class="terms-section">
            <h4 class="summary-title">Terms & Conditions</h4>
            <ol class="terms-list">
                <li>Goods once sold will not be taken back or exchanged</li>
                <li>Interest @ 36% p.a will be charged if payment is not made within the stipulated time</li>
                <li>Subject to our standard terms of credit</li>
                <li>All disputes are subject to local jurisdiction only</li>
                <li>E.&O.E.</li>
            </ol>
        </div>

        <!-- Signatures -->
        <div class="signature-section">
            <div class="signature-box">
                <div class="signature-line"></div>
                <p class="signature-label">Prepared By</p>
                <p class="signature-sublabel">Authorized Signatory</p>
            </div>
            <div class="signature-box">
                <div class="signature-line"></div>
                <p class="signature-label">For ${invoiceData.org_name || 'Your Company Name'}</p>
                <p class="signature-sublabel">Authorized Signatory</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p class="footer-text">Thank you for your business!</p>
            <p class="footer-subtext">${invoiceData.org_name || 'Your Company Name'} | Your trusted healthcare partner</p>
            <p class="footer-brand">Powered by AASO ERP</p>
        </div>
    </div>
</body>
</html>`;
};

// ==================== PUBLIC API ====================

/**
 * Print invoice using browser's print functionality
 */
export const printInvoice = (invoiceData: InvoiceData): void => {
    const invoiceHTML = generateInvoiceHTML(invoiceData);

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        console.error('Could not open print window');
        return;
    }

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
};

/**
 * Download invoice as PDF file
 */
export const downloadInvoicePDF = (invoiceData: InvoiceData): void => {
    const invoiceHTML = generateInvoiceHTML(invoiceData);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-10000px';
    iframe.style.top = '-10000px';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
        document.body.removeChild(iframe);
        console.error('Could not access iframe document');
        return;
    }

    iframeDoc.open();
    iframeDoc.write(invoiceHTML);
    iframeDoc.close();

    iframe.onload = () => {
        setTimeout(() => {
            try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();

                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            } catch (error) {
                // Fallback to new window approach
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(invoiceHTML);
                    printWindow.document.close();
                    printWindow.onload = () => {
                        printWindow.focus();
                        printWindow.print();
                        printWindow.close();
                    };
                }
                document.body.removeChild(iframe);
            }
        }, 500);
    };
};

/**
 * Generate invoice PDF blob (for backward compatibility)
 */
export const generateInvoicePDF = (invoiceData: InvoiceData): Blob => {
    downloadInvoicePDF(invoiceData);
    return new Blob([''], { type: 'application/pdf' });
};

/**
 * Get invoice PDF as base64 (for backward compatibility)
 */
export const getInvoicePDFBase64 = async (invoiceData: InvoiceData): Promise<string> => {
    downloadInvoicePDF(invoiceData);
    return '';
};

// Default export for backward compatibility
export default {
    printInvoice,
    downloadInvoicePDF,
    generateInvoicePDF,
    getInvoicePDFBase64
};
