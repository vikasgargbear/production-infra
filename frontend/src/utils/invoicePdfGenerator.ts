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
    manufacturer_name: string;
    batch_number: string | null;
    expiry_date: string | null;
    batch_allocations: InvoiceBatchAllocation[];
    hsn_code: string;
    sale_unit: string;
    quantity: string;
    free_quantity: string;
    free_supply_tax_treatment: 'excluded_from_taxable_value' | 'included_at_unit_rate';
    unit_price: string;
    line_discount_kind: 'none' | 'percent' | 'amount';
    line_discount_basis: 'taxable_value' | 'price_value';
    line_discount_value: string;
    line_discount_amount: string;
    line_taxable_discount_amount: string;
    document_discount_amount: string;
    document_taxable_discount_amount: string;
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
    due_date: string | null;
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

const canonicalFreeSupplyTaxTreatment = (
    value: unknown,
    label: string,
): InvoiceItem['free_supply_tax_treatment'] => {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') return value;
    throw new Error(`${label} is unavailable.`);
};

export const printableCanonicalInvoice = (detail: CanonicalInvoiceDetail): InvoiceData => {
    if (detail.archival_snapshot_state !== 'captured') {
        throw new Error('Archived invoice party evidence is unavailable for this invoice.');
    }
    return {
        invoice_number: detail.invoice_number,
        invoice_date: detail.invoice_date,
        due_date: detail.due_date,
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
            manufacturer_name: archivedText(
                item.manufacturer_name, `Manufacturer for ${item.product_name}`,
            ),
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
            free_supply_tax_treatment: canonicalFreeSupplyTaxTreatment(
                item.free_supply_tax_treatment,
                `Invoice line ${item.product_name} free-supply tax treatment`,
            ),
            unit_price: item.unit_price,
            line_discount_kind: item.line_discount_kind,
            line_discount_basis: item.line_discount_basis,
            line_discount_value: item.line_discount_value,
            line_discount_amount: item.line_discount_amount,
            line_taxable_discount_amount: item.line_taxable_discount_amount,
            document_discount_amount: item.document_discount_amount,
            document_taxable_discount_amount: item.document_taxable_discount_amount,
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

const lineDiscountDisplay = (
    item: InvoiceItem,
    lineNumber: number,
    currency: (value: unknown, label: string) => string,
): string => {
    const label = `Invoice line ${lineNumber} discount`;
    const value = normalizeAuthoritativeDecimal(
        item.line_discount_value, `${label} input`,
        { scale: 6, maximumWholeDigits: 20, allowNegative: false },
    );
    const percent = normalizeAuthoritativeDecimal(
        item.discount_percent, `${label} compatibility percent`,
        { scale: 6, maximumWholeDigits: 20, allowNegative: false },
    );
    if (item.line_discount_kind === 'none' && value !== '0.000000') {
        throw new Error(`${label} contradicts its none kind.`);
    }
    if (item.line_discount_kind === 'percent' && value !== percent) {
        throw new Error(`${label} percent does not match its immutable input.`);
    }
    if (item.line_discount_kind !== 'percent' && percent !== '0.000000') {
        throw new Error(`${label} cannot expose a percentage for its immutable kind.`);
    }
    if (item.line_discount_kind === 'amount'
        && exactDecimalUnits(value, `${label} amount input`, {
            scale: 6, maximumWholeDigits: 20, allowNegative: false,
        }) % 10000n !== 0n) {
        throw new Error(`${label} fixed amount must have two-decimal precision.`);
    }
    currency(item.line_taxable_discount_amount, `${label} before-tax allocation`);
    currency(item.document_discount_amount, `${label} invoice allocation`);
    const primary = item.line_discount_kind === 'percent'
        ? `${atMostTwoDecimals(value, `${label} percent`, 6)}%`
        : item.line_discount_kind === 'amount'
            ? 'Fixed'
            : '-';
    return primary;
};

const displayDate = (value: string, label: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(requiredText(value, label));
    if (!match) throw new Error(`${label} must use YYYY-MM-DD.`);
    return `${match[3]}/${match[2]}/${match[1]}`;
};

const batchPresentationRows = (item: InvoiceItem, lineNumber: number): string[][] => {
    if (!Array.isArray(item.batch_allocations)) {
        throw new Error(`Invoice line ${lineNumber} batch allocations are unavailable.`);
    }
    if (!item.batch_allocations.length) {
        return [[item.batch_number || '-', item.expiry_date
            ? displayDate(item.expiry_date, `Invoice line ${lineNumber} expiry`) : '-',
        atMostTwoDecimals(item.quantity, `Invoice line ${lineNumber} quantity`, 6),
        atMostTwoDecimals(item.free_quantity, `Invoice line ${lineNumber} free quantity`, 6)]];
    }
    // Validate the authoritative aggregate too, without displaying it twice.
    atMostTwoDecimals(item.quantity, `Invoice line ${lineNumber} quantity`, 6);
    atMostTwoDecimals(item.free_quantity, `Invoice line ${lineNumber} free quantity`, 6);
    return item.batch_allocations.map((allocation, allocationIndex) => {
        const allocationLabel = `Invoice line ${lineNumber} batch ${allocationIndex + 1}`;
        const expiry = allocation.expiry_date
            ? displayDate(allocation.expiry_date, `${allocationLabel} expiry`) : '-';
        const billed = atMostTwoDecimals(
            allocation.billed_quantity, `${allocationLabel} billed quantity`, 6,
        );
        const free = atMostTwoDecimals(
            allocation.free_quantity, `${allocationLabel} free quantity`, 6,
        );
        return [requiredText(allocation.batch_number, allocationLabel), expiry, billed, free];
    });
};

const freeSupplyFootnote = (invoice: InvoiceData): string | null => {
    const treatments = new Set(invoice.items
        .map((item, index) => ({ item, lineNumber: index + 1 }))
        .filter(({ item, lineNumber }) => compareExactDecimals(
            item.free_quantity, '0', `Invoice line ${lineNumber} free quantity`,
            { scale: 6, maximumWholeDigits: 14, allowNegative: false },
        ) > 0)
        .map(({ item, lineNumber }) => canonicalFreeSupplyTaxTreatment(
            item.free_supply_tax_treatment,
            `Invoice line ${lineNumber} free-supply tax treatment`,
        )));
    if (!treatments.size) return null;
    if (treatments.size === 1 && treatments.has('excluded_from_taxable_value')) {
        return 'Bonus/free units are supplied at no charge and excluded from taxable value.';
    }
    if (treatments.size === 1 && treatments.has('included_at_unit_rate')) {
        return 'Free units are included at the item rate in taxable value.';
    }
    return 'Free-unit tax treatment varies by line and is preserved in the posted invoice record.';
};

const roundedRate = (value: unknown, label: string): string => {
    const units = exactDecimalUnits(value, label, {
        scale: 4, maximumWholeDigits: 20, allowNegative: false,
    });
    const rounded = units / 100n + (units % 100n >= 50n ? 1n : 0n);
    return exactDecimalString(rounded, 2);
};

const tableMoney = (value: unknown, label: string): string => money(value, label).replace('₹', '');
const ITEM_HEADERS = ['#', 'Product', 'Batch', 'Expiry', 'Qty', 'Free', 'Rate', 'Disc %', 'Disc amt', 'GST %', 'Amount'];
const invoicePresentationRows = (invoice: InvoiceData): string[][] => invoice.items.flatMap((item, index) => {
    const label = `Invoice line ${index + 1}`;
    const discount = lineDiscountDisplay(item, index + 1, tableMoney);
    const fixedNote = item.line_discount_kind === 'amount'
        ? `\nFixed discount ${tableMoney(exactDecimalString(exactDecimalUnits(item.line_discount_value, `${label} fixed discount`, { scale: 6, maximumWholeDigits: 20, allowNegative: false }) / 10000n, 2), `${label} fixed discount`)} (${item.line_discount_basis === 'taxable_value' ? 'before tax' : 'quoted price basis'})` : '';
    return batchPresentationRows(item, index + 1).map((batch, batchIndex) => [
        String(index + 1),
        `${requiredText(item.product_name, `${label} product`)}\nMfr ${requiredText(item.manufacturer_name, `${label} manufacturer`)}\nHSN ${requiredText(item.hsn_code, `${label} HSN`)} | ${requiredText(item.sale_unit, `${label} unit`)}${fixedNote}`,
        ...batch,
        batchIndex === 0 ? tableMoney(roundedRate(item.unit_price, `${label} rate`), `${label} rate`) : '',
        batchIndex === 0 ? discount : '',
        batchIndex === 0 ? tableMoney(item.line_taxable_discount_amount, `${label} discount before tax`) : '',
        batchIndex === 0 ? `${atMostTwoDecimals(item.gst_percent, `${label} GST rate`, 6)}%` : '',
        batchIndex === 0 ? tableMoney(item.line_total, `${label} total`) : '',
    ]);
});

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

const reconcileInvoiceTotals = (invoice: InvoiceData): { gstTotal: string; itemDiscount: string; invoiceDiscount: string } => {
    const itemDiscount = addExactDecimals(invoice.items.map(item => item.line_taxable_discount_amount), 'Item discounts before tax', moneyOptions);
    const invoiceDiscount = addExactDecimals(invoice.items.map(item => item.document_taxable_discount_amount), 'Invoice discount before tax', moneyOptions);
    if (compareExactDecimals(addExactDecimals([itemDiscount, invoiceDiscount], 'Discount allocations', moneyOptions), invoice.discount_amount, 'Discount reconciliation', moneyOptions) !== 0) {
        throw new Error('Invoice before-tax discount allocations do not reconcile.');
    }
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
    return { gstTotal, itemDiscount, invoiceDiscount };
};

const invoiceSummaryRows = (invoice: InvoiceData): string[][] => {
    const { itemDiscount, invoiceDiscount } = reconcileInvoiceTotals(invoice);
    return [
        ['Subtotal', invoice.subtotal_amount], ['Item discounts', itemDiscount],
        ['Invoice discount', invoiceDiscount], ['Charges', invoice.charges_amount],
        ...(compareExactDecimals(invoice.net_value_amount, invoice.taxable_amount, 'Net and taxable value', moneyOptions) !== 0
            ? [['Net Value', invoice.net_value_amount]] : []),
        ['Taxable Amount', invoice.taxable_amount], ['CGST', invoice.cgst_amount],
        ['SGST', invoice.sgst_amount], ['IGST', invoice.igst_amount], ['Cess', invoice.cess_amount],
        ['Round Off', invoice.rounding_adjustment], ['Grand Total', invoice.total_amount],
    ].filter(([label, value]) => ['Subtotal', 'Net Value', 'Taxable Amount', 'Grand Total'].includes(label)
        || compareExactDecimals(value, '0.00', label, moneyOptions) !== 0);
};

export const generateInvoiceHTML = (invoice: InvoiceData): string => {
    const invoiceNumber = requiredText(invoice.invoice_number, 'Invoice number');
    const invoiceDate = requiredText(invoice.invoice_date, 'Invoice date');
    requiredText(invoice.status, 'Invoice status');
    requiredText(invoice.seller_legal_name, 'Seller legal name');
    requiredText(invoice.seller_gstin, 'Seller GSTIN');
    requiredText(invoice.customer_name, 'Customer legal name');
    if (!Array.isArray(invoice.items) || invoice.items.length === 0) throw new Error('Invoice lines are unavailable.');
    const summaryRows = invoiceSummaryRows(invoice);

    const itemRows = invoicePresentationRows(invoice).map(row => `<tr>${row.map((cell, column) =>
        `<td class="${column >= 4 ? 'right' : column === 0 ? 'center' : ''}">${cell ? cell.split('\n').map((line, index) =>
            `<div${column === 1 && index > 0 ? ' class="muted"' : ''}>${escapeHTML(line)}</div>`).join('') : ''}</td>`
    ).join('')}</tr>`).join('');

    const summaryRow = (label: string, value: string, className = ''): string =>
        `<div class="summary-row ${className}"><span>${label}</span><span>${value}</span></div>`;
    const customerGstin = invoice.customer_gst_number
        ? `<div><strong>GSTIN:</strong> ${escapeHTML(invoice.customer_gst_number)}</div>` : '';
    const customerPhone = invoice.customer_phone
        ? `<div><strong>Phone:</strong> ${escapeHTML(invoice.customer_phone)}</div>` : '';
    const placeOfSupply = `${requiredText(invoice.place_of_supply_display_name, 'Place-of-supply name')} (${requiredText(invoice.place_of_supply_state_code, 'Place-of-supply state code')})`;
    const showPlaceOfSupply = requiredText(invoice.supply_type, 'Supply type') !== 'intra_state';
    const freeFootnote = freeSupplyFootnote(invoice);
    const discountDisplay = (value: string) => compareExactDecimals(value, '0.00', 'Discount', moneyOptions) > 0
        ? `-${money(value, 'Discount')}` : money(value, 'Discount');

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
th{background:#e2e8f0;font-size:8px;text-transform:uppercase}th:nth-child(1){width:2.6%}th:nth-child(2){width:22.4%}
th:nth-child(3){width:11.5%}th:nth-child(4){width:8.3%}th:nth-child(5),th:nth-child(6){width:5.2%}
th:nth-child(7){width:9.9%}th:nth-child(8){width:6.3%}th:nth-child(9){width:9.4%}th:nth-child(10){width:6.2%}th:nth-child(11){width:13%}
.center{text-align:center}.right{text-align:right}.strong{font-weight:700}.muted{color:#475569;font-size:8px;margin-top:.7mm}
.tax-detail{color:#334155;font-size:7.5px;margin-top:1mm}.summary-wrap{display:grid;grid-template-columns:1fr 76mm;gap:6mm;margin-top:5mm;align-items:start}
.tax-note{border:1px solid #cbd5e1;padding:3mm;border-radius:2mm}
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
<div><strong>Date:</strong> ${escapeHTML(displayDate(invoiceDate, 'Invoice date'))}</div><div><strong>Due Date:</strong> ${invoice.due_date ? escapeHTML(displayDate(invoice.due_date, 'Invoice due date')) : 'Not specified'}</div>
${showPlaceOfSupply ? `<div><strong>Place of Supply:</strong> ${escapeHTML(placeOfSupply)}</div>` : ''}</section></header>
<section class="party-grid"><div class="party-card"><h2>Bill To</h2><div class="party-name">${escapeHTML(invoice.customer_name)}</div>
${addressLines(invoice.billing_address, 'Customer billing address')}${customerGstin}${customerPhone}
${licenceLine(invoice.customer_drug_license_numbers, 'Customer drug licences')}</div>
<div class="party-card"><h2>Ship To</h2><div class="party-name">${escapeHTML(invoice.customer_name)}</div>
${addressLines(invoice.shipping_address, 'Customer shipping address')}</div></section>
<p class="muted">Amounts in INR. Disc amt shows the before-tax reduction. Amounts apply once per product line; quantities are shown by batch.</p>
<table aria-label="Invoice items"><thead><tr>${ITEM_HEADERS.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${itemRows}</tbody></table>
<section class="summary-wrap"><div class="tax-note"><strong>Reverse charge:</strong> ${invoice.tax_charge_mechanism === 'reverse_charge' ? 'Yes' : 'No'}${freeFootnote ? `<br><br><strong>Free units:</strong> ${escapeHTML(freeFootnote)}` : ''}</div>
<div class="summary"><h2>Invoice Summary</h2>${summaryRows.map(([label, value]) => summaryRow(label,
    label === 'Item discounts' || label === 'Invoice discount' ? discountDisplay(value) : money(value, label),
    label === 'Grand Total' ? 'grand' : '')).join('')}</div></section>
<section class="signatures"><div class="signature">Recipient (name and signature)</div><div class="signature">Competent Person (name and signature)<br>For ${escapeHTML(invoice.seller_legal_name)}</div></section>
<footer class="footer">Computer-generated tax invoice from the posted sales record.</footer></main></body></html>`;
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
const INVOICE_TABLE_COLUMN_WIDTHS_MM = [5, 43, 22, 16, 10, 10, 19, 12, 18, 12, 25] as const;
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
    pdf.text(`Date: ${displayDate(invoiceData.invoice_date, 'Invoice date')}`, right, 27, { align: 'right' });
    pdf.text(`Due Date: ${invoiceData.due_date
        ? displayDate(invoiceData.due_date, 'Invoice due date')
        : 'Not specified'}`, right, 32, { align: 'right' });
    const showPlaceOfSupply = invoiceData.supply_type !== 'intra_state';
    if (showPlaceOfSupply) {
        pdf.text(`Place of Supply: ${invoiceData.place_of_supply_display_name} (${invoiceData.place_of_supply_state_code})`, right, 37, { align: 'right' });
    }
    const headerBottom = Math.max(showPlaceOfSupply ? 43 : 38, sellerLicenceY + (invoiceData.seller_drug_license_numbers.length ? 5 : 1));
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

    const body = invoicePresentationRows(invoiceData);
    pdf.setFontSize(6.5);
    pdf.text('Amounts in INR. Disc amt shows the before-tax reduction. Amounts apply once per product line; quantities are shown by batch.', margin, cardTop + cardHeight + 4);
    autoTable(pdf, {
        startY: cardTop + cardHeight + 7,
        head: [ITEM_HEADERS],
        body,
        margin: { left: margin, right: margin, top: 15, bottom: 12 },
        tableWidth: INVOICE_TABLE_WIDTH_MM,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7, cellPadding: 1, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [226, 232, 240], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 6.5 },
        columnStyles: {
            0: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[0], halign: 'center' },
            1: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[1] },
            2: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[2] },
            3: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[3], halign: 'center' },
            4: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[4], halign: 'right' },
            5: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[5], halign: 'center' },
            6: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[6], halign: 'right' },
            7: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[7], halign: 'right' },
            8: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[8], halign: 'right' },
            9: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[9], halign: 'right' },
            10: { cellWidth: INVOICE_TABLE_COLUMN_WIDTHS_MM[10], halign: 'right', fontStyle: 'bold' },
        },
        horizontalPageBreak: false,
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
    });

    let summaryY = (pdf.lastAutoTable?.finalY ?? 70) + 6;
    if (summaryY > 207) { pdf.addPage(); summaryY = 16; }
    const freeFootnote = freeSupplyFootnote(invoiceData);
    const summaryRows = invoiceSummaryRows(invoiceData);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
    pdf.text(`Reverse charge: ${invoiceData.tax_charge_mechanism === 'reverse_charge' ? 'Yes' : 'No'}`, margin, summaryY);
    if (freeFootnote) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
        pdf.text(`Free units: ${freeFootnote}`, margin, summaryY + 5, { maxWidth: 104 });
    }
    const summaryX = 126;
    pdf.text('INVOICE SUMMARY', summaryX, summaryY);
    summaryRows.forEach(([label, value], index) => {
        const y = summaryY + 5 + index * 4.2;
        pdf.setFont('helvetica', index === summaryRows.length - 1 ? 'bold' : 'normal');
        pdf.text(label, summaryX, y);
        const formattedValue = pdfMoney(value, `PDF ${label}`);
        const displayValue = (label === 'Item discounts' || label === 'Invoice discount')
            && compareExactDecimals(value, '0.00', 'PDF discount', moneyOptions) > 0
            ? `-${formattedValue}` : formattedValue;
        pdf.text(displayValue, right, y, { align: 'right' });
    });
    const signatureY = summaryY + Math.max(38, summaryRows.length * 4.2 + 14);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.line(margin, signatureY, 78, signatureY); pdf.line(132, signatureY, right, signatureY);
    pdf.text('Recipient (name and signature)', 43, signatureY + 4, { align: 'center' });
    pdf.text('Competent Person (name and signature)', 167, signatureY + 4, { align: 'center' });
    pdf.text(`For ${invoiceData.seller_legal_name}`, 167, signatureY + 8, { align: 'center', maxWidth: 70 });

    const pageCount = pdf.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pdf.setPage(pageNumber);
        if (pageNumber > 1) {
            pdf.setTextColor(17, 24, 39); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
            pdf.text(`TAX INVOICE | ${invoiceData.invoice_number} | ${displayDate(invoiceData.invoice_date, 'Invoice date')}`, margin, 8);
            pdf.setDrawColor(148, 163, 184); pdf.setLineWidth(0.2); pdf.line(margin, 11, right, 11);
        }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(100, 116, 139);
        pdf.text(`Page ${pageNumber} of ${pageCount}`, right, 291, { align: 'right' });
    }
    return pdf;
};

export const downloadInvoicePDF = async (invoiceData: InvoiceData): Promise<void> => {
    const pdf = buildInvoicePDF(invoiceData);
    const safeInvoiceNumber = invoiceData.invoice_number.replace(/[^A-Za-z0-9._-]/g, '-');
    pdf.save(`${safeInvoiceNumber}.pdf`);
};
