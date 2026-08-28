/**
 * Invoice PDF Generator using HTML/CSS
 * Renders authoritative canonical invoice facts for print and download.
 */

import { jsPDF } from 'jspdf';
import {
    addExactDecimals,
    compareExactDecimals,
    formatExactCurrency,
    formatExactDecimal,
    normalizeAuthoritativeDecimal,
} from './exactDecimal';
import type { CanonicalInvoiceDetail } from '../services/api/modules/sales/canonicalSalesDocuments.types';

// ==================== TYPE DEFINITIONS ====================

export interface InvoiceItem {
    product_name: string;
    batch_number: string | null;
    hsn_code: string;
    sale_unit: string;
    quantity: string;
    unit_price: string;
    gst_percent: string;
    line_total: string;
}

export interface InvoiceData {
    invoice_number: string;
    invoice_date: string;
    status: string;
    seller_legal_name: string;
    seller_gstin: string;
    seller_address: string;
    customer_name: string;
    customer_phone?: string;
    customer_gst_number?: string;
    billing_address: string;
    shipping_address: string;
    items: InvoiceItem[];
    taxable_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    total_amount: string;
}

export const printableCanonicalInvoice = (detail: CanonicalInvoiceDetail): InvoiceData => ({
    invoice_number: detail.invoice_number,
    invoice_date: detail.invoice_date,
    status: detail.status,
    seller_legal_name: detail.seller_legal_name,
    seller_gstin: detail.seller_gstin,
    seller_address: detail.seller_address,
    customer_name: detail.customer_name,
    customer_phone: detail.customer_phone ?? undefined,
    customer_gst_number: detail.customer_gst_number ?? undefined,
    billing_address: detail.billing_address,
    shipping_address: detail.shipping_address,
    items: detail.items.map(item => ({
        product_name: item.product_name,
        batch_number: item.batch_number,
        hsn_code: item.hsn_code,
        sale_unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percent: item.gst_percent,
        line_total: item.line_total,
    })),
    taxable_amount: detail.taxable_amount,
    cgst_amount: detail.cgst_amount,
    sgst_amount: detail.sgst_amount,
    igst_amount: detail.igst_amount,
    cess_amount: detail.cess_amount,
    total_amount: detail.total_amount,
});

// ==================== HELPER FUNCTIONS ====================

const requiredText = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is unavailable.`);
    return value;
};

const escapeHTML = (value: unknown): string => requiredText(value, 'Printable text')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const money = (value: unknown, label: string): string => formatExactCurrency(
    normalizeAuthoritativeDecimal(value, label, {
        scale: 2, maximumWholeDigits: 20, allowNegative: true,
    }),
    label,
);

const quantity = (value: unknown, label: string): string => formatExactDecimal(value, label, {
    scale: 6, maximumWholeDigits: 20, allowNegative: false,
});

const rate = (value: unknown, label: string): string => formatExactDecimal(value, label, {
    scale: 4, maximumWholeDigits: 20, allowNegative: false,
}, 2);

const addressLines = (value: string): string => {
    const lines = requiredText(value, 'Printable address').split('\n')
        .map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error('Printable address is unavailable.');
    return lines.map(line => `<p class="customer-detail">${escapeHTML(line)}</p>`).join('');
};

const percent = (value: unknown, label: string): string => formatExactDecimal(value, label, {
    scale: 6, maximumWholeDigits: 3, allowNegative: false,
});

// ==================== HTML GENERATION ====================

/**
 * Generate HTML content for invoice
 */
export const generateInvoiceHTML = (invoiceData: InvoiceData): string => {
    const documentNumber = requiredText(invoiceData.invoice_number, 'Invoice number');
    requiredText(invoiceData.invoice_date, 'Invoice date');
    requiredText(invoiceData.status, 'Invoice status');
    requiredText(invoiceData.seller_legal_name, 'Seller legal name');
    requiredText(invoiceData.seller_gstin, 'Seller GSTIN');
    requiredText(invoiceData.seller_address, 'Seller address');
    requiredText(invoiceData.customer_name, 'Customer legal name');
    requiredText(invoiceData.billing_address, 'Customer billing address');
    requiredText(invoiceData.shipping_address, 'Customer shipping address');
    if (!Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
        throw new Error('Invoice lines are unavailable.');
    }
    const totalGst = addExactDecimals([
        invoiceData.cgst_amount,
        invoiceData.sgst_amount,
        invoiceData.igst_amount,
        invoiceData.cess_amount,
    ], 'Invoice total tax', { scale: 2, maximumWholeDigits: 20, allowNegative: false });
    const isIGST = compareExactDecimals(invoiceData.igst_amount, '0.00', 'Invoice IGST', {
        scale: 2, maximumWholeDigits: 20, allowNegative: false,
    }) > 0;
    const documentTitle = 'TAX INVOICE';

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
            <h1 class="company-name">${escapeHTML(invoiceData.seller_legal_name)}</h1>
            <p class="document-number">GSTIN: ${escapeHTML(invoiceData.seller_gstin)}</p>
            ${addressLines(invoiceData.seller_address)}
            <h2 class="document-title">${documentTitle}</h2>
            <p class="document-number">${escapeHTML(documentNumber)}</p>
            <p class="document-date">Date: ${escapeHTML(invoiceData.invoice_date)}</p>
        </div>

        <div class="order-details">
            <div class="detail-item">
                <p class="detail-label">Document Status</p>
                <p class="detail-value">${escapeHTML(invoiceData.status).toUpperCase()}</p>
            </div>
        </div>

        <!-- Customer Section -->
        <div class="customer-section">
            <div>
                <h3 class="section-title">Bill To</h3>
                <p class="customer-name">${escapeHTML(invoiceData.customer_name)}</p>
                ${addressLines(invoiceData.billing_address)}
                ${invoiceData.customer_phone ? `<p class="customer-detail">Phone: ${escapeHTML(invoiceData.customer_phone)}</p>` : ''}
                ${invoiceData.customer_gst_number ? `<p class="customer-detail">GSTIN: ${escapeHTML(invoiceData.customer_gst_number)}</p>` : ''}
            </div>
            <div>
                <h3 class="section-title">Ship To</h3>
                <p class="customer-name">${escapeHTML(invoiceData.customer_name)}</p>
                ${addressLines(invoiceData.shipping_address)}
                ${invoiceData.customer_phone ? `<p class="customer-detail">Phone: ${escapeHTML(invoiceData.customer_phone)}</p>` : ''}
            </div>
        </div>

        <!-- Items Section -->
        <div class="items-section">
            <h3 class="section-title">Invoice Items</h3>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>Item Details</th>
                        <th style="text-align: center;">HSN</th>
                        <th style="text-align: center;">Unit</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Rate</th>
                        <th style="text-align: right;">GST %</th>
                        <th style="text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceData.items.map((item: InvoiceItem, index) => `
                        <tr>
                            <td>
                                <div class="product-name">${escapeHTML(requiredText(item.product_name, `Invoice line ${index + 1} product name`))}</div>
                                ${item.batch_number ? `<div class="product-batch">Batch: ${escapeHTML(item.batch_number)}</div>` : ''}
                            </td>
                            <td style="text-align: center;">${escapeHTML(requiredText(item.hsn_code, `Invoice line ${index + 1} HSN`))}</td>
                            <td style="text-align: center;">${escapeHTML(requiredText(item.sale_unit, `Invoice line ${index + 1} unit`))}</td>
                            <td style="text-align: center;">${quantity(item.quantity, `Invoice line ${index + 1} quantity`)}</td>
                            <td style="text-align: right;">₹${rate(item.unit_price, `Invoice line ${index + 1} rate`)}</td>
                            <td style="text-align: right;">${percent(item.gst_percent, `Invoice line ${index + 1} GST rate`)}%</td>
                            <td style="text-align: right; font-weight: 500;">${money(item.line_total, `Invoice line ${index + 1} total`)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Summary Section -->
        <div class="summary-section">
            <div class="summary-box">
                <h4 class="summary-title">GST Breakdown ${isIGST ? '(Inter-State)' : '(Intra-State)'}</h4>
                ${isIGST ? `
                <div class="summary-item">
                    <span>IGST</span>
                    <span>${money(invoiceData.igst_amount, 'Invoice IGST')}</span>
                </div>
                ` : `
                <div class="summary-item">
                    <span>CGST</span>
                    <span>${money(invoiceData.cgst_amount, 'Invoice CGST')}</span>
                </div>
                <div class="summary-item">
                    <span>SGST</span>
                    <span>${money(invoiceData.sgst_amount, 'Invoice SGST')}</span>
                </div>
                `}
                <div class="summary-item total">
                    <span>Total GST</span>
                    <span>${money(totalGst, 'Invoice total GST')}</span>
                </div>
            </div>
            
            <div class="summary-box">
                <h4 class="summary-title">Invoice Summary</h4>
                <div class="summary-item">
                    <span>Sub Total</span>
                    <span>${money(invoiceData.taxable_amount, 'Invoice taxable amount')}</span>
                </div>
                <div class="summary-item">
                    <span>Total GST</span>
                    <span>${money(totalGst, 'Invoice total GST')}</span>
                </div>
                ${compareExactDecimals(invoiceData.cess_amount, '0.00', 'Invoice cess', {
                    scale: 2, maximumWholeDigits: 20, allowNegative: false,
                }) > 0 ? `
                <div class="summary-item">
                    <span>Cess</span>
                    <span>${money(invoiceData.cess_amount, 'Invoice cess')}</span>
                </div>
                ` : ''}
                <div class="summary-item total">
                    <span>Grand Total</span>
                    <span>${money(invoiceData.total_amount, 'Invoice grand total')}</span>
                </div>
            </div>
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
                <p class="signature-label">For ${escapeHTML(invoiceData.seller_legal_name)}</p>
                <p class="signature-sublabel">Authorized Signatory</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p class="footer-subtext">${escapeHTML(invoiceData.seller_legal_name)}</p>
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
        throw new Error('The browser blocked the invoice print window.');
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
export const downloadInvoicePDF = async (invoiceData: InvoiceData): Promise<void> => {
    const invoiceHTML = generateInvoiceHTML(invoiceData);
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-10000px';
    container.innerHTML = invoiceHTML;
    document.body.appendChild(container);
    try {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        await pdf.html(container, {
            autoPaging: 'text',
            html2canvas: { scale: 0.75, useCORS: true },
            margin: [8, 8, 8, 8],
            windowWidth: 794,
        });
        const safeInvoiceNumber = invoiceData.invoice_number.replace(/[^A-Za-z0-9._-]/g, '-');
        pdf.save(`${safeInvoiceNumber}.pdf`);
    } finally {
        document.body.removeChild(container);
    }
};
