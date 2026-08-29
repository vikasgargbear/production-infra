/** Canonical sales invoice print and PDF rendering. */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
    addExactDecimals, compareExactDecimals, exactDecimalString, exactDecimalUnits,
    formatExactCurrency, formatExactDecimal, normalizeAuthoritativeDecimal,
    subtractExactDecimals,
} from './exactDecimal';
import type { CanonicalInvoiceDetail } from '../services/api/modules/sales/canonicalSalesDocuments.types';

interface InvoiceBatchAllocation {
    batch_number: string;
    expiry_date: string | null;
    billed_quantity: string;
    free_quantity: string;
}

export interface InvoiceItem {
    product_name: string;
    batch_number: string | null;
    expiry_date: string | null;
    batch_allocations: InvoiceBatchAllocation[];
    hsn_code: string;
    sale_unit: string;
    quantity: string;
    free_quantity: string;
    unit_price: string;
    discount_percent: string;
    gst_percent: string;
    taxable_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    line_total: string;
}

export interface InvoiceData {
    invoice_number: string;
    invoice_date: string;
    status: string;
    seller_legal_name: string;
    seller_gstin: string;
    seller_address: string;
    seller_drug_license_numbers: string[];
    customer_name: string;
    customer_phone?: string;
    customer_gst_number?: string;
    customer_drug_license_numbers: string[];
    billing_address: string;
    shipping_address: string;
    supply_type: 'intra_state' | 'inter_state' | 'export' | 'sez';
    place_of_supply_state_code: string;
    place_of_supply_display_name: string;
    tax_charge_mechanism: 'normal' | 'reverse_charge';
    items: InvoiceItem[];
    subtotal_amount: string;
    discount_amount: string;
    charges_amount: string;
    net_value_amount: string;
    taxable_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    rounding_adjustment: string;
    total_amount: string;
}

const archivedText = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is unavailable.`);
    return value.trim();
};

const archivedEvidence = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} is unavailable.`);
    }
    return value as Record<string, unknown>;
};

const archivedLicenceNumbers = (value: unknown, label: string): string[] => {
    const evidence = archivedEvidence(value, label);
    const availability = evidence.availability;
    if (availability === 'none_effective') {
        if (evidence.licences !== undefined
            && (!Array.isArray(evidence.licences) || evidence.licences.length !== 0)) {
            throw new Error(`${label} contradicts its archived availability.`);
        }
        return [];
    }
    if (availability !== 'available' || !Array.isArray(evidence.licences)
        || evidence.licences.length === 0) {
        throw new Error(`${label} is unavailable.`);
    }
    return evidence.licences.map((entry, index) => {
        const licence = archivedEvidence(entry, `${label} ${index + 1}`);
        return archivedText(licence.license_number, `${label} ${index + 1} number`);
    });
};

const archivedSellerGstin = (value: unknown, snapshot: unknown): string => {
    const evidence = archivedEvidence(value, 'Archived seller GST evidence');
    if (evidence.availability !== 'available') {
        throw new Error('Archived seller GST evidence is unavailable.');
    }
    const gstin = archivedText(evidence.gstin, 'Archived seller GSTIN');
    if (gstin !== archivedText(snapshot, 'Seller GSTIN snapshot')) {
        throw new Error('Archived seller GST evidence does not match the invoice snapshot.');
    }
    return gstin;
};

const archivedCustomerGstin = (value: unknown, snapshot: unknown): string | undefined => {
    const evidence = archivedEvidence(value, 'Archived customer GST evidence');
    if (evidence.availability === 'not_registered') {
        if (snapshot !== null && snapshot !== undefined && snapshot !== '') {
            throw new Error('Archived customer GST evidence contradicts the invoice snapshot.');
        }
        return undefined;
    }
    if (evidence.availability !== 'available') {
        throw new Error('Archived customer GST evidence is unavailable.');
    }
    const gstin = archivedText(evidence.registration_number, 'Archived customer GSTIN');
    if (gstin !== archivedText(snapshot, 'Customer GSTIN snapshot')) {
        throw new Error('Archived customer GST evidence does not match the invoice snapshot.');
    }
    return gstin;
};

export const printableCanonicalInvoice = (detail: CanonicalInvoiceDetail): InvoiceData => {
    if (detail.archival_snapshot_state !== 'captured') {
        throw new Error('Archived invoice party evidence is unavailable for this invoice.');
    }
    return {
        invoice_number: detail.invoice_number,
        invoice_date: detail.invoice_date,
        status: detail.status,
        seller_legal_name: archivedText(detail.seller_legal_name, 'Seller legal-name snapshot'),
        seller_gstin: archivedSellerGstin(detail.seller_gst_evidence, detail.seller_gstin),
        seller_address: archivedText(detail.seller_address, 'Seller address snapshot'),
        seller_drug_license_numbers: archivedLicenceNumbers(
            detail.seller_drug_licence_evidence, 'Archived seller drug licences',
        ),
        customer_name: archivedText(detail.customer_name, 'Customer legal-name snapshot'),
        customer_phone: undefined,
        customer_gst_number: archivedCustomerGstin(
            detail.customer_gst_evidence, detail.customer_gst_number,
        ),
        customer_drug_license_numbers: archivedLicenceNumbers(
            detail.customer_drug_licence_evidence, 'Archived customer drug licences',
        ),
        billing_address: archivedText(detail.billing_address, 'Billing-address snapshot'),
        shipping_address: archivedText(detail.shipping_address, 'Shipping-address snapshot'),
        supply_type: detail.supply_type,
        place_of_supply_state_code: archivedText(
            detail.place_of_supply_state_code, 'Place-of-supply state code',
        ),
        place_of_supply_display_name: archivedText(
            detail.place_of_supply_display_name, 'Place-of-supply name',
        ),
        tax_charge_mechanism: detail.tax_charge_mechanism,
        items: detail.items.map(item => ({
            product_name: item.product_name,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            batch_allocations: item.batch_allocations.map(allocation => ({
                batch_number: allocation.batch_number,
                expiry_date: allocation.expiry_date,
                billed_quantity: allocation.billed_quantity,
                free_quantity: allocation.free_quantity,
            })),
            hsn_code: item.hsn_code,
            sale_unit: item.unit,
            quantity: item.quantity,
            free_quantity: item.free_quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            gst_percent: item.gst_percent,
            taxable_amount: item.taxable_amount,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            cess_amount: item.cess_amount,
            line_total: item.line_total,
        })),
        subtotal_amount: detail.subtotal_amount,
        discount_amount: detail.pre_tax_discount_amount,
        charges_amount: detail.charges_amount,
        net_value_amount: detail.net_value_amount,
        taxable_amount: detail.taxable_amount,
        cgst_amount: detail.cgst_amount,
        sgst_amount: detail.sgst_amount,
        igst_amount: detail.igst_amount,
        cess_amount: detail.cess_amount,
        rounding_adjustment: detail.rounding_adjustment,
        total_amount: detail.total_amount,
    };
};

const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;

const requiredText = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is unavailable.`);
    return value.trim();
};

const escapeHTML = (value: unknown, label = 'Printable text'): string => requiredText(value, label)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const money = (value: unknown, label: string): string => formatExactCurrency(
    normalizeAuthoritativeDecimal(value, label, moneyOptions), label,
);

/** Round a non-money display value without crossing through IEEE-754. */
const atMostTwoDecimals = (value: unknown, label: string, sourceScale: number): string => {
    const sourceOptions = { scale: sourceScale, maximumWholeDigits: 20, allowNegative: false } as const;
    const units = exactDecimalUnits(value, label, sourceOptions);
    if (sourceScale <= 2) return formatExactDecimal(value, label, sourceOptions);
    const divisor = 10n ** BigInt(sourceScale - 2);
    const quotient = units / divisor;
    const remainder = units % divisor;
    const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
    return formatExactDecimal(exactDecimalString(rounded, 2), label, {
        scale: 2, maximumWholeDigits: 20, allowNegative: false,
    });
};

const rate = (value: unknown, label: string): string => {
    const units = exactDecimalUnits(value, label, {
        scale: 4, maximumWholeDigits: 20, allowNegative: false,
    });
    const rounded = units / 100n + (units % 100n >= 50n ? 1n : 0n);
    return formatExactCurrency(exactDecimalString(rounded, 2), label);
};

const addressLines = (value: string, label: string): string => {
    const lines = requiredText(value, label).split('\n').map(line => line.trim()).filter(Boolean);
    return lines.map(line => `<div>${escapeHTML(line)}</div>`).join('');
};

const licenceLine = (values: unknown, label: string): string => {
    if (!Array.isArray(values)) throw new Error(`${label} are unavailable.`);
    const licences = values.map((value, index) => requiredText(value, `${label} ${index + 1}`));
    return licences.length
        ? `<div><strong>Drug Licence:</strong> ${licences.map(value => escapeHTML(value)).join(' / ')}</div>`
        : '';
};

const reconcileInvoiceTotals = (invoice: InvoiceData): { gstTotal: string } => {
    const discountedSubtotal = subtractExactDecimals(
        invoice.subtotal_amount, invoice.discount_amount, 'Invoice subtotal less discount', moneyOptions,
    );
    const expectedNet = addExactDecimals(
        [discountedSubtotal, invoice.charges_amount], 'Invoice expected net value', moneyOptions,
    );
    if (compareExactDecimals(expectedNet, invoice.net_value_amount, 'Invoice net reconciliation', moneyOptions) !== 0) {
        throw new Error('Invoice subtotal, discount, charges, and net value do not reconcile.');
    }
    const gstTotal = addExactDecimals(
        [invoice.cgst_amount, invoice.sgst_amount, invoice.igst_amount], 'Invoice GST total', moneyOptions,
    );
    const totalTax = addExactDecimals([gstTotal, invoice.cess_amount], 'Invoice total tax', moneyOptions);
    const payableTax = invoice.tax_charge_mechanism === 'normal' ? totalTax : '0.00';
    const expectedGrandTotal = addExactDecimals(
        [invoice.net_value_amount, payableTax, invoice.rounding_adjustment],
        'Invoice expected grand total', moneyOptions,
    );
    if (compareExactDecimals(expectedGrandTotal, invoice.total_amount, 'Invoice grand total reconciliation', moneyOptions) !== 0) {
        throw new Error('Invoice net value, tax, rounding, and grand total do not reconcile.');
    }
    return { gstTotal };
};

const batchColumns = (item: InvoiceItem, lineNumber: number): { batches: string[]; expiries: string[] } => {
    if (!Array.isArray(item.batch_allocations)) {
        throw new Error(`Invoice line ${lineNumber} batch allocations are unavailable.`);
    }
    if (item.batch_allocations.length > 0) {
        return {
            batches: item.batch_allocations.map((allocation, index) => requiredText(
                allocation.batch_number, `Invoice line ${lineNumber} batch ${index + 1}`,
            )),
            expiries: item.batch_allocations.map((allocation, index) => allocation.expiry_date
                ? requiredText(allocation.expiry_date, `Invoice line ${lineNumber} expiry ${index + 1}`)
                : 'N/A'),
        };
    }
    return {
        batches: [item.batch_number ? requiredText(item.batch_number, `Invoice line ${lineNumber} batch`) : 'N/A'],
        expiries: [item.expiry_date ? requiredText(item.expiry_date, `Invoice line ${lineNumber} expiry`) : 'N/A'],
    };
};

const invoiceLineGst = (item: InvoiceItem, lineNumber: number): string => addExactDecimals(
    [item.cgst_amount, item.sgst_amount, item.igst_amount],
    `Invoice line ${lineNumber} GST amount`, moneyOptions,
);

interface GstBand {
    rate: string;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
}

const invoiceGstBands = (invoice: InvoiceData): GstBand[] => {
    const bands = new Map<string, GstBand>();
    invoice.items.forEach((item, index) => {
        const gstRate = normalizeAuthoritativeDecimal(
            item.gst_percent, `Invoice line ${index + 1} GST rate`,
            { scale: 6, maximumWholeDigits: 20, allowNegative: false },
        );
        const current = bands.get(gstRate) ?? {
            rate: gstRate, taxable: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00',
        };
        bands.set(gstRate, {
            rate: gstRate,
            taxable: addExactDecimals([current.taxable, item.taxable_amount], 'GST band taxable', moneyOptions),
            cgst: addExactDecimals([current.cgst, item.cgst_amount], 'GST band CGST', moneyOptions),
            sgst: addExactDecimals([current.sgst, item.sgst_amount], 'GST band SGST', moneyOptions),
            igst: addExactDecimals([current.igst, item.igst_amount], 'GST band IGST', moneyOptions),
            cess: addExactDecimals([current.cess, item.cess_amount], 'GST band cess', moneyOptions),
        });
    });
    return [...bands.values()];
};

export const generateInvoiceHTML = (invoice: InvoiceData): string => {
    const invoiceNumber = requiredText(invoice.invoice_number, 'Invoice number');
    const invoiceDate = requiredText(invoice.invoice_date, 'Invoice date');
    requiredText(invoice.status, 'Invoice status');
    requiredText(invoice.seller_legal_name, 'Seller legal name');
    requiredText(invoice.seller_gstin, 'Seller GSTIN');
    requiredText(invoice.customer_name, 'Customer legal name');
    if (!Array.isArray(invoice.items) || invoice.items.length === 0) throw new Error('Invoice lines are unavailable.');
    const { gstTotal } = reconcileInvoiceTotals(invoice);
    const gstBands = invoiceGstBands(invoice);

    const itemRows = invoice.items.map((item, index) => {
        const lineNumber = index + 1;
        const { batches, expiries } = batchColumns(item, lineNumber);
        const lineGst = invoiceLineGst(item, lineNumber);
        const cess = compareExactDecimals(item.cess_amount, '0.00', `Invoice line ${lineNumber} cess`, moneyOptions) !== 0
            ? `<div class="muted">Cess ${money(item.cess_amount, `Invoice line ${lineNumber} cess`)}</div>` : '';
        return `<tr>
            <td class="center">${lineNumber}</td>
            <td><strong>${escapeHTML(item.product_name, `Invoice line ${lineNumber} product`)}</strong>
                <div class="muted">HSN ${escapeHTML(item.hsn_code, `Invoice line ${lineNumber} HSN`)} | ${escapeHTML(item.sale_unit, `Invoice line ${lineNumber} unit`)}</div></td>
            <td>${batches.map(value => `<div>${escapeHTML(value)}</div>`).join('')}</td>
            <td>${expiries.map(value => `<div>${escapeHTML(value)}</div>`).join('')}</td>
            <td class="center">${atMostTwoDecimals(item.quantity, `Invoice line ${lineNumber} quantity`, 6)}
                <div class="muted">Free ${atMostTwoDecimals(item.free_quantity, `Invoice line ${lineNumber} free quantity`, 6)}</div></td>
            <td class="right">${rate(item.unit_price, `Invoice line ${lineNumber} rate`)}</td>
            <td class="center">${atMostTwoDecimals(item.discount_percent, `Invoice line ${lineNumber} discount`, 6)}%</td>
            <td class="right">${money(item.taxable_amount, `Invoice line ${lineNumber} taxable amount`)}</td>
            <td class="right"><strong>${atMostTwoDecimals(item.gst_percent, `Invoice line ${lineNumber} GST rate`, 6)}%</strong>
                <div class="muted">${money(lineGst, `Invoice line ${lineNumber} GST amount`)}</div>${cess}</td>
            <td class="right strong">${money(item.line_total, `Invoice line ${lineNumber} total`)}</td>
        </tr>`;
    }).join('');

    const gstBandRows = gstBands.map((band) => `<tr>
        <td>${atMostTwoDecimals(band.rate, 'GST band rate', 6)}%</td>
        <td class="right">${money(band.taxable, 'GST band taxable')}</td>
        <td class="right">${money(band.cgst, 'GST band CGST')}</td>
        <td class="right">${money(band.sgst, 'GST band SGST')}</td>
        <td class="right">${money(band.igst, 'GST band IGST')}</td>
        <td class="right">${money(band.cess, 'GST band cess')}</td>
    </tr>`).join('');

    const summaryRow = (label: string, value: string, className = ''): string =>
        `<div class="summary-row ${className}"><span>${label}</span><span>${value}</span></div>`;
    const customerGstin = invoice.customer_gst_number
        ? `<div><strong>GSTIN:</strong> ${escapeHTML(invoice.customer_gst_number)}</div>` : '';
    const customerPhone = invoice.customer_phone
        ? `<div><strong>Phone:</strong> ${escapeHTML(invoice.customer_phone)}</div>` : '';
    const placeOfSupply = `${requiredText(invoice.place_of_supply_display_name, 'Place-of-supply name')} (${requiredText(invoice.place_of_supply_state_code, 'Place-of-supply state code')})`;
    const supplyType = requiredText(invoice.supply_type, 'Supply type').replace(/_/g, ' ');
    const discountDisplay = compareExactDecimals(
        invoice.discount_amount, '0.00', 'Invoice discount', moneyOptions,
    ) > 0 ? `-${money(invoice.discount_amount, 'Invoice discount')}` : money(invoice.discount_amount, 'Invoice discount');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tax Invoice - ${escapeHTML(invoiceNumber)}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111827}
body{font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.35}
.invoice-page{width:100%;max-width:210mm;margin:0 auto;padding:10mm}
.header,.party-grid,.summary-wrap,.signatures{break-inside:avoid;page-break-inside:avoid}
.header{display:grid;grid-template-columns:1fr 1fr;gap:8mm;border-bottom:2px solid #111827;padding-bottom:4mm}
.seller-name{margin:0 0 1mm;font-size:18px}.invoice-title{margin:0;font-size:17px;text-transform:uppercase;letter-spacing:1px}
.document-meta{text-align:right}.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:5mm 0}
.party-card{border:1px solid #cbd5e1;border-radius:2mm;padding:3mm;min-width:0;overflow-wrap:anywhere}
.party-card h2{margin:0 0 1.5mm;font-size:10px;text-transform:uppercase;color:#475569}.party-name{font-size:11px;font-weight:700}
table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #94a3b8;padding:1.6mm 1mm;vertical-align:top;overflow-wrap:anywhere}
th{background:#e2e8f0;font-size:7.5px;text-transform:uppercase}.items th:nth-child(1){width:3%}.items th:nth-child(2){width:23%}
.items th:nth-child(3){width:9%}.items th:nth-child(4){width:9%}.items th:nth-child(5){width:8%}.items th:nth-child(6){width:10%}
.items th:nth-child(7){width:6%}.items th:nth-child(8){width:11%}.items th:nth-child(9){width:11%}.items th:nth-child(10){width:10%}
.center{text-align:center}.right{text-align:right}.strong{font-weight:700}.muted{color:#475569;font-size:8px;margin-top:.7mm}
.summary-wrap{display:grid;grid-template-columns:1fr 76mm;gap:6mm;margin-top:5mm;align-items:start}
.tax-breakdown{border:1px solid #cbd5e1;border-radius:2mm;overflow:hidden}.tax-breakdown h2{margin:0;padding:2mm 2.5mm;background:#f8fafc;font-size:9px;text-transform:uppercase}
.tax-breakdown th,.tax-breakdown td{padding:1.2mm .8mm;font-size:7.5px}.tax-treatment{padding:2mm 2.5mm;font-size:8px}
.summary{border:1px solid #64748b;border-radius:2mm;padding:2.5mm}
.summary h2{margin:0 0 1.5mm;font-size:10px;text-transform:uppercase}.summary-row{display:flex;justify-content:space-between;gap:4mm;padding:.7mm 0}
.summary-row.grand{border-top:1.5px solid #111827;margin-top:1mm;padding-top:1.5mm;font-size:12px;font-weight:700}
.signatures{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:12mm}.signature{border-top:1px solid #64748b;padding-top:1mm;text-align:center}
.footer{margin-top:5mm;padding-top:2mm;border-top:1px solid #cbd5e1;color:#64748b;text-align:center;font-size:8px}
@media print{@page{size:A4 portrait;margin:9mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.invoice-page{max-width:none;padding:0}
.footer{display:none}}
</style></head><body><main class="invoice-page">
<header class="header"><section><h1 class="seller-name">${escapeHTML(invoice.seller_legal_name)}</h1>
<div><strong>GSTIN:</strong> ${escapeHTML(invoice.seller_gstin)}</div>${addressLines(invoice.seller_address, 'Seller address')}
${licenceLine(invoice.seller_drug_license_numbers, 'Seller drug licences')}</section>
<section class="document-meta"><div><strong>Original for Recipient</strong></div><h2 class="invoice-title">Tax Invoice</h2><div><strong>Invoice No:</strong> ${escapeHTML(invoiceNumber)}</div>
<div><strong>Date:</strong> ${escapeHTML(invoiceDate)}</div><div><strong>Place of Supply:</strong> ${escapeHTML(placeOfSupply)}</div>
<div><strong>Supply:</strong> ${escapeHTML(supplyType)}</div><div><strong>Status:</strong> ${escapeHTML(invoice.status).toUpperCase()}</div></section></header>
<section class="party-grid"><div class="party-card"><h2>Bill To</h2><div class="party-name">${escapeHTML(invoice.customer_name)}</div>
${addressLines(invoice.billing_address, 'Customer billing address')}${customerGstin}${customerPhone}
${licenceLine(invoice.customer_drug_license_numbers, 'Customer drug licences')}</div>
<div class="party-card"><h2>Ship To</h2><div class="party-name">${escapeHTML(invoice.customer_name)}</div>
${addressLines(invoice.shipping_address, 'Customer shipping address')}</div></section>
<table class="items" aria-label="Invoice items"><thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Expiry</th><th>Qty / Free</th><th>Rate</th><th>Disc</th><th>Taxable</th><th>GST % / Amount</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
<section class="summary-wrap"><div class="tax-breakdown"><h2>GST by rate and amount</h2>
<table aria-label="GST breakdown by rate"><thead><tr><th>GST Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Cess</th></tr></thead><tbody>${gstBandRows}</tbody></table>
<div class="tax-treatment"><strong>Tax treatment:</strong> ${invoice.tax_charge_mechanism === 'reverse_charge' ? 'Reverse charge' : 'Normal charge'} | <strong>GST total:</strong> ${money(gstTotal, 'Invoice GST total')}</div></div>
<div class="summary"><h2>Invoice Summary</h2>${summaryRow('Subtotal', money(invoice.subtotal_amount, 'Invoice subtotal'))}
${summaryRow('Discount', discountDisplay)}${summaryRow('Charges', money(invoice.charges_amount, 'Invoice charges'))}
${summaryRow('Net Value', money(invoice.net_value_amount, 'Invoice net value'))}${summaryRow('Taxable Amount', money(invoice.taxable_amount, 'Invoice taxable amount'))}
${summaryRow('CGST', money(invoice.cgst_amount, 'Invoice CGST'))}${summaryRow('SGST', money(invoice.sgst_amount, 'Invoice SGST'))}
${summaryRow('IGST', money(invoice.igst_amount, 'Invoice IGST'))}${summaryRow('Cess', money(invoice.cess_amount, 'Invoice cess'))}
${summaryRow('Round Off', money(invoice.rounding_adjustment, 'Invoice rounding adjustment'))}${summaryRow('Grand Total', money(invoice.total_amount, 'Invoice grand total'), 'grand')}</div></section>
<section class="signatures"><div class="signature">Recipient (name and signature)</div><div class="signature">Competent Person (name and signature)<br>For ${escapeHTML(invoice.seller_legal_name)}</div></section>
<footer class="footer">Computer-generated tax invoice from the canonical posted sales record.</footer></main></body></html>`;
};

export const printInvoice = (invoiceData: InvoiceData): void => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) throw new Error('The browser blocked the invoice print window.');
    printWindow.document.write(generateInvoiceHTML(invoiceData));
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); printWindow.close(); };
};

type InvoicePdfDocument = jsPDF & { lastAutoTable?: { finalY: number } };

const pdfMoney = (value: unknown, label: string): string => money(value, label).replace('₹', 'INR ');
const PDF_PAGE_MARGIN_MM = 9;
const INVOICE_TABLE_COLUMN_WIDTHS_MM = [6, 43, 20, 16, 16, 19, 12, 21, 20, 19] as const;
const INVOICE_TABLE_WIDTH_MM = INVOICE_TABLE_COLUMN_WIDTHS_MM.reduce((total, width) => total + width, 0);

/** Build a vector A4 PDF with deterministic pagination and repeated table headers. */
export const buildInvoicePDF = (invoiceData: InvoiceData): jsPDF => {
    generateInvoiceHTML(invoiceData); // Validate required facts and exact reconciliation once.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as InvoicePdfDocument;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = PDF_PAGE_MARGIN_MM;
    const right = pageWidth - margin;

    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    const sellerNameLines = pdf.splitTextToSize(invoiceData.seller_legal_name, 112);
    pdf.text(sellerNameLines, margin, 12);
    const sellerDetailY = 12 + sellerNameLines.length * 6;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text(`GSTIN: ${invoiceData.seller_gstin}`, margin, sellerDetailY);
    const sellerAddressLines = pdf.splitTextToSize(invoiceData.seller_address, 112);
    pdf.text(sellerAddressLines, margin, sellerDetailY + 4);
    const sellerLicenceY = sellerDetailY + 6 + sellerAddressLines.length * 3.2;
    if (invoiceData.seller_drug_license_numbers.length) {
        pdf.text(`Drug Licence: ${invoiceData.seller_drug_license_numbers.join(' / ')}`, margin, sellerLicenceY, { maxWidth: 112 });
    }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text('TAX INVOICE', right, 12, { align: 'right' });
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
    pdf.text('Original for Recipient', right, 17, { align: 'right' });
    pdf.text(`Invoice No: ${invoiceData.invoice_number}`, right, 22, { align: 'right' });
    pdf.text(`Date: ${invoiceData.invoice_date}`, right, 27, { align: 'right' });
    pdf.text(`Place of Supply: ${invoiceData.place_of_supply_display_name} (${invoiceData.place_of_supply_state_code})`, right, 32, { align: 'right' });
    pdf.text(`Supply: ${invoiceData.supply_type.replace(/_/g, ' ')}`, right, 37, { align: 'right' });
    pdf.text(`Status: ${invoiceData.status.toUpperCase()}`, right, 42, { align: 'right' });
    const headerBottom = Math.max(48, sellerLicenceY + (invoiceData.seller_drug_license_numbers.length ? 5 : 1));
    pdf.setDrawColor(30, 41, 59); pdf.setLineWidth(0.5); pdf.line(margin, headerBottom, right, headerBottom);

    const cardTop = headerBottom + 4;
    const cardWidth = (pageWidth - margin * 2 - 4) / 2;
    const billText = [
        invoiceData.customer_name,
        ...invoiceData.billing_address.split('\n'),
        ...(invoiceData.customer_gst_number ? [`GSTIN: ${invoiceData.customer_gst_number}`] : []),
        ...(invoiceData.customer_phone ? [`Phone: ${invoiceData.customer_phone}`] : []),
        ...(invoiceData.customer_drug_license_numbers.length
            ? [`Drug Licence: ${invoiceData.customer_drug_license_numbers.join(' / ')}`] : []),
    ];
    const shipText = [invoiceData.customer_name, ...invoiceData.shipping_address.split('\n')];
    const billLines = pdf.splitTextToSize(billText.join('\n'), cardWidth - 6);
    const shipLines = pdf.splitTextToSize(shipText.join('\n'), cardWidth - 6);
    const cardHeight = Math.max(25, 9 + Math.max(billLines.length, shipLines.length) * 3.4);
    pdf.setDrawColor(203, 213, 225); pdf.setLineWidth(0.25);
    pdf.roundedRect(margin, cardTop, cardWidth, cardHeight, 1.5, 1.5);
    pdf.roundedRect(margin + cardWidth + 4, cardTop, cardWidth, cardHeight, 1.5, 1.5);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
    pdf.text('BILL TO', margin + 3, cardTop + 5);
    pdf.text('SHIP TO', margin + cardWidth + 7, cardTop + 5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text(billLines, margin + 3, cardTop + 9);
    pdf.text(shipLines, margin + cardWidth + 7, cardTop + 9);

    const body = invoiceData.items.map((item, index) => {
        const lineNumber = index + 1;
        const { batches, expiries } = batchColumns(item, lineNumber);
        const gstAmount = invoiceLineGst(item, lineNumber);
        const cess = compareExactDecimals(item.cess_amount, '0.00', `PDF line ${lineNumber} cess`, moneyOptions) !== 0
            ? `\nCess ${pdfMoney(item.cess_amount, `PDF line ${lineNumber} cess`)}` : '';
        return [
            String(lineNumber), `${item.product_name}\nHSN ${item.hsn_code} | ${item.sale_unit}`,
            batches.join('\n'), expiries.join('\n'),
            `${atMostTwoDecimals(item.quantity, 'PDF quantity', 6)}\nFree ${atMostTwoDecimals(item.free_quantity, 'PDF free quantity', 6)}`,
            pdfMoney(rate(item.unit_price, 'PDF rate').replace('₹', ''), 'PDF normalized rate'),
            `${atMostTwoDecimals(item.discount_percent, 'PDF discount', 6)}%`,
            pdfMoney(item.taxable_amount, 'PDF line taxable'),
            `${atMostTwoDecimals(item.gst_percent, 'PDF GST rate', 6)}%\n${pdfMoney(gstAmount, 'PDF line GST amount')}${cess}`,
            pdfMoney(item.line_total, 'PDF line total'),
        ];
    });
    autoTable(pdf, {
        startY: cardTop + cardHeight + 4,
        head: [['#', 'Product', 'Batch', 'Expiry', 'Qty / Free', 'Rate', 'Disc', 'Taxable', 'GST % / Amount', 'Amount']],
        body,
        margin: { left: margin, right: margin, top: margin, bottom: 12 },
        tableWidth: INVOICE_TABLE_WIDTH_MM,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 6.2, cellPadding: 1.4, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [226, 232, 240], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 6 },
        columnStyles: {
            0: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[0], halign: 'center' },
            1: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[1] },
            2: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[2], halign: 'center' },
            3: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[3], halign: 'center' },
            4: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[4], halign: 'right' },
            5: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[5], halign: 'right' },
            6: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[6], halign: 'right' },
            7: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[7], halign: 'right' },
            8: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[8], halign: 'right' },
            9: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[9], halign: 'right', fontStyle: 'bold' },
        },
        horizontalPageBreak: false,
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
    });

    let gstBreakdownY = (pdf.lastAutoTable?.finalY ?? 70) + 5;
    if (gstBreakdownY > 238) { pdf.addPage(); gstBreakdownY = 16; }
    const { gstTotal } = reconcileInvoiceTotals(invoiceData);
    autoTable(pdf, {
        startY: gstBreakdownY,
        head: [['GST Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess']],
        body: invoiceGstBands(invoiceData).map(band => [
            `${atMostTwoDecimals(band.rate, 'PDF GST band rate', 6)}%`,
            pdfMoney(band.taxable, 'PDF GST band taxable'),
            pdfMoney(band.cgst, 'PDF GST band CGST'),
            pdfMoney(band.sgst, 'PDF GST band SGST'),
            pdfMoney(band.igst, 'PDF GST band IGST'),
            pdfMoney(band.cess, 'PDF GST band cess'),
        ]),
        margin: { left: margin, right: margin, top: margin, bottom: 12 },
        tableWidth: INVOICE_TABLE_WIDTH_MM,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 6.2, cellPadding: 1.2, halign: 'right' },
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 6 },
        columnStyles: { 0: { halign: 'left' } },
        showHead: 'everyPage',
    });

    let summaryY = (pdf.lastAutoTable?.finalY ?? gstBreakdownY) + 6;
    if (summaryY > 215) { pdf.addPage(); summaryY = 16; }
    const summaryRows = [
        ['Subtotal', invoiceData.subtotal_amount], ['Discount', invoiceData.discount_amount],
        ['Charges', invoiceData.charges_amount], ['Net Value', invoiceData.net_value_amount],
        ['Taxable Amount', invoiceData.taxable_amount], ['CGST', invoiceData.cgst_amount],
        ['SGST', invoiceData.sgst_amount], ['IGST', invoiceData.igst_amount], ['Cess', invoiceData.cess_amount],
        ['Round Off', invoiceData.rounding_adjustment], ['Grand Total', invoiceData.total_amount],
    ];
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
    pdf.text(`Tax treatment: ${invoiceData.tax_charge_mechanism === 'reverse_charge' ? 'Reverse charge' : 'Normal charge'}`, margin, summaryY);
    pdf.text(`GST total: ${pdfMoney(gstTotal, 'PDF GST total')}`, margin, summaryY + 5);
    const summaryX = 126;
    pdf.text('INVOICE SUMMARY', summaryX, summaryY);
    summaryRows.forEach(([label, value], index) => {
        const y = summaryY + 5 + index * 4.2;
        pdf.setFont('helvetica', index === summaryRows.length - 1 ? 'bold' : 'normal');
        pdf.text(label, summaryX, y);
        const formattedValue = pdfMoney(value, `PDF ${label}`);
        const displayValue = label === 'Discount'
            && compareExactDecimals(value, '0.00', 'PDF discount', moneyOptions) > 0
            ? `-${formattedValue}` : formattedValue;
        pdf.text(displayValue, right, y, { align: 'right' });
    });
    const signatureY = summaryY + 62;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.line(margin, signatureY, 78, signatureY); pdf.line(132, signatureY, right, signatureY);
    pdf.text('Recipient (name and signature)', 43, signatureY + 4, { align: 'center' });
    pdf.text('Competent Person (name and signature)', 167, signatureY + 4, { align: 'center' });
    pdf.text(`For ${invoiceData.seller_legal_name}`, 167, signatureY + 8, { align: 'center', maxWidth: 70 });

    const pageCount = pdf.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pdf.setPage(pageNumber); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(100, 116, 139);
        pdf.text(`Page ${pageNumber} of ${pageCount}`, right, 291, { align: 'right' });
    }
    return pdf;
};

export const downloadInvoicePDF = async (invoiceData: InvoiceData): Promise<void> => {
    const pdf = buildInvoicePDF(invoiceData);
    const safeInvoiceNumber = invoiceData.invoice_number.replace(/[^A-Za-z0-9._-]/g, '-');
    pdf.save(`${safeInvoiceNumber}.pdf`);
};
