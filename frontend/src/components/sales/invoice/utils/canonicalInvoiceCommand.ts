import type { Customer } from '../../../../types/models/customer';
import type { Invoice } from '../hooks/useInvoiceLogic';
import type { FreeSupplyTaxTreatment, InvoiceItem } from '../types/invoiceTypes';
import type { CompanyInfo } from '../../../../types/common/company.types';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
    addExactDecimals,
    compareExactDecimals,
    exactDecimalUnits,
    normalizeExactDecimal,
} from '../../../../utils/exactDecimal';

type CanonicalDiscountKind = 'none' | 'percent' | 'amount';

interface CanonicalDiscount {
    document_discount_kind: CanonicalDiscountKind;
    document_discount_basis: 'price_value';
    document_discount_value: string;
}

const explicitDecimal = (value: unknown, label: string, scale: number): string => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is missing its explicit value`);
    }
    return normalizeExactDecimal(value, label, { scale });
};
const quantity = (value: unknown, label = 'Invoice quantity'): string =>
    explicitDecimal(value, label, 6);
const rate = (value: unknown, label = 'Invoice rate'): string =>
    explicitDecimal(value, label, 4);
const discount = (value: unknown, label = 'Invoice discount'): string =>
    explicitDecimal(value, label, 6);

const requiredUuid = (value: unknown, label: string): string => {
    const normalized = String(value ?? '').trim();
    if (!isCanonicalUuid(normalized)) {
        throw new Error(`${label} is missing its canonical UUID. Re-select it and try again.`);
    }
    return normalized;
};

const requiredQuantity = (value: unknown, label: string): string => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is missing`);
    }
    return quantity(value, label);
};

const nonEmpty = (value: unknown): boolean => String(value ?? '').trim().length > 0;

const fulfillmentSource = (
    item: InvoiceItem,
): 'direct_issue' | 'dispatch_allocated' => {
    if (item.source_allocation_kind === undefined
        || item.source_allocation_kind === 'direct_issue') {
        return 'direct_issue';
    }
    if (item.source_allocation_kind === 'dispatch_allocation') {
        return 'dispatch_allocated';
    }
    throw new Error('Invoice item has an unsupported canonical allocation source');
};

const validateImportedAllocationLineage = (item: InvoiceItem, index: number): void => {
    if (item.source_allocation_kind === undefined) return;

    const prefix = `Item ${index + 1}`;
    const allocationId = requiredUuid(item.allocation_id, `${prefix} allocation`);
    requiredUuid(item.source_line_id, `${prefix} source line`);
    requiredUuid(item.inventory_document_id, `${prefix} inventory document`);
    const inventoryLineId = requiredUuid(
        item.inventory_document_line_id,
        `${prefix} inventory document line`,
    );

    if (item.source_allocation_kind === 'direct_issue') {
        requiredUuid(item.command_request_id, `${prefix} command request`);
        if (allocationId !== inventoryLineId) {
            throw new Error(`${prefix} direct-issue allocation identity is inconsistent`);
        }
        if (item.invoice_dispatch_allocation_id != null
            || item.dispatch_id != null
            || item.dispatch_line_id != null) {
            throw new Error(`${prefix} direct-issue lineage cannot contain dispatch identities`);
        }
        return;
    }

    const dispatchLineId = requiredUuid(item.dispatch_line_id, `${prefix} dispatch line`);
    requiredUuid(item.dispatch_id, `${prefix} dispatch`);
    if (item.command_request_id != null) {
        requiredUuid(item.command_request_id, `${prefix} command request`);
    }
    const expectedAllocationId = item.invoice_dispatch_allocation_id == null
        ? dispatchLineId
        : requiredUuid(
            item.invoice_dispatch_allocation_id,
            `${prefix} invoice dispatch allocation`,
        );
    if (allocationId !== expectedAllocationId
        || String(item.source_line_id) !== dispatchLineId) {
        throw new Error(`${prefix} dispatch allocation lineage is inconsistent`);
    }
    const baseBilled = requiredQuantity(
        item.base_billed_quantity,
        `${prefix} base billed quantity`,
    );
    const baseFree = requiredQuantity(
        item.base_free_quantity,
        `${prefix} base free quantity`,
    );
    const sourceBilled = requiredQuantity(
        item.source_billed_quantity,
        `${prefix} source billed quantity`,
    );
    const sourceFree = requiredQuantity(
        item.source_free_quantity,
        `${prefix} source free quantity`,
    );
    if (compareExactDecimals(item.quantity, sourceBilled, `${prefix} billed quantity`, { scale: 6 }) !== 0
        || compareExactDecimals(item.free_quantity, sourceFree, `${prefix} free quantity`, { scale: 6 }) !== 0) {
        throw new Error(
            `${prefix} dispatch quantity was edited after import. Re-import the canonical dispatch before invoicing.`,
        );
    }
    if (exactDecimalUnits(baseBilled, `${prefix} base billed quantity`, { scale: 6 })
        + exactDecimalUnits(baseFree, `${prefix} base free quantity`, { scale: 6 }) <= 0n) {
        throw new Error(`${prefix} dispatch allocation has no positive base quantity`);
    }
};

const freeSupplyTaxTreatment = (value: unknown): FreeSupplyTaxTreatment => {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') {
        return value;
    }
    throw new Error('Invoice free-supply tax treatment is missing or invalid');
};

const selectedDeliveryAddress = (invoice: Invoice): { id: string; rowVersion: string } => {
    const address = invoice.shipping_address_data;
    const id = requiredUuid(address?.address_id ?? address?.id, 'Delivery address');
    const rowVersion = String(address?.row_version ?? '').trim();
    if (!/^[1-9][0-9]*$/.test(rowVersion)) {
        throw new Error('Delivery address is missing its canonical row version. Re-select it and try again.');
    }
    return { id, rowVersion };
};

export function companyInvoiceValidationError(
    company: CompanyInfo | null,
    invoice?: Invoice,
): string | null {
    if (!company || !nonEmpty(company.name)) {
        return 'Company legal name is missing. Complete Company Settings before generating an invoice.';
    }
    if (!nonEmpty(company.address)) {
        return 'Company registered address is missing. Complete Company Settings before generating an invoice.';
    }
    if (!/^[0-9A-Z]{15}$/.test(String(company.gst_number || '').trim().toUpperCase())) {
        return 'Company GSTIN is missing or invalid. Complete Company Settings before generating a tax invoice.';
    }
    const containsMedicine = invoice?.items.some(
        item => item.product_type === 'medicine' || item.requires_prescription,
    );
    if (containsMedicine && !nonEmpty(company.drug_license_number)) {
        return 'A drug licence is required for medicine invoices. Complete Company Settings first.';
    }
    return null;
}

const documentDiscount = (invoice: Invoice): CanonicalDiscount => {
    const percent = discount(invoice.discount_percent, 'Invoice discount percent');
    const amount = rate(invoice.discount_amount, 'Invoice discount amount');
    if (invoice.discount_type === 'fixed'
        && exactDecimalUnits(amount, 'Invoice discount amount', { scale: 4 }) > 0n) {
        return {
            document_discount_kind: 'amount',
            document_discount_basis: 'price_value',
            document_discount_value: amount,
        };
    }
    if (exactDecimalUnits(percent, 'Invoice discount percent', { scale: 6 }) > 0n) {
        return {
            document_discount_kind: 'percent',
            document_discount_basis: 'price_value',
            document_discount_value: percent,
        };
    }
    return {
        document_discount_kind: 'none',
        document_discount_basis: 'price_value',
        document_discount_value: '0',
    };
};

/**
 * The current invoice command emits one selected batch allocation per line.
 * Until consecutive FEFO lots can be allocated as one audited operation, do
 * not partially submit a quantity that the selected batch cannot fulfill.
 */
export function invoiceBatchAllocationValidationError(invoice: Invoice): string | null {
    for (const [index, item] of invoice.items.entries()) {
        if (fulfillmentSource(item) === 'dispatch_allocated') continue;
        let availableQuantity: string;
        try {
            availableQuantity = quantity(item.available_quantity ?? item.quantity_available, `Item ${index + 1} selected batch availability`);
        } catch {
            return `Item ${index + 1} selected batch availability is missing. Refresh the batch selection before continuing.`;
        }
        try {
            const requestedQuantity = addExactDecimals([
                requiredQuantity(item.quantity, `Item ${index + 1} billed quantity`),
                requiredQuantity(item.free_quantity, `Item ${index + 1} free quantity`),
            ], `Item ${index + 1} requested quantity`, { scale: 6 });
            if (compareExactDecimals(requestedQuantity, availableQuantity, `Item ${index + 1} availability`, { scale: 6 }) > 0) {
                return `Item ${index + 1} needs ${requestedQuantity} units but the selected batch has ${availableQuantity}. Multi-batch allocation is not available yet; reduce the quantity or stop and refresh stock.`;
            }
        } catch (error) {
            return error instanceof Error ? error.message : `Item ${index + 1} quantity is invalid`;
        }
    }
    return null;
}

export function canonicalInvoiceValidationError(
    invoice: Invoice,
    customer: Customer | null,
): string | null {
    if (!customer) return 'Please select a customer';
    if (invoice.items.length === 0) return 'Please add at least one item';
    if (!nonEmpty(customer.customer_name)) return 'Selected customer legal name is missing';
    if (!nonEmpty(invoice.billing_address)) {
        return 'Customer billing address is missing. Add an address and re-select the customer.';
    }
    if (!nonEmpty(invoice.shipping_address)) {
        return 'Customer delivery address is missing. Select a saved delivery address before previewing the invoice.';
    }
    try {
        selectedDeliveryAddress(invoice);
    } catch (error) {
        return error instanceof Error ? error.message : 'Select a saved delivery address before previewing the invoice.';
    }
    if (invoice.delivery_type !== 'PICKUP') {
        return 'Delivery and courier invoices need an exact transport distance. Use Pickup until distance capture is available.';
    }
    const batchAllocationError = invoiceBatchAllocationValidationError(invoice);
    if (batchAllocationError) return batchAllocationError;

    let branchId: string | undefined;
    let directIssueLocationId: string | undefined;
    for (const [index, item] of invoice.items.entries()) {
        try {
            if (item.source_document_kind === 'sales_order') {
                return 'Order must be dispatched first before it can be invoiced; direct order import cannot consume its stock reservation.';
            }
            if (!/^[0-9]{4,8}$/.test(String(item.hsn_code || '').trim())) {
                return `Item ${index + 1} HSN code is missing or invalid. Complete the product master first.`;
            }
            const itemBranch = requiredUuid(item.branch_id, `Item ${index + 1} branch`);
            requiredUuid(item.product_id, `Item ${index + 1} product`);
            requiredUuid(item.uom_conversion_id, `Item ${index + 1} UOM`);
            const source = fulfillmentSource(item);
            validateImportedAllocationLineage(item, index);
            if (source === 'direct_issue') {
                const itemLocation = requiredUuid(
                    item.location_id,
                    `Item ${index + 1} stock location`,
                );
                requiredUuid(item.batch_id, `Item ${index + 1} batch`);
                directIssueLocationId ??= itemLocation;
                if (directIssueLocationId !== itemLocation) {
                    return 'All direct-issue items must use one stock location';
                }
            }
            const billedQuantity = quantity(item.quantity, `Item ${index + 1} billed quantity`);
            const freeQuantity = quantity(item.free_quantity, `Item ${index + 1} free quantity`);
            rate(item.unit_price, `Item ${index + 1} unit rate`);
            discount(item.discount_percent, `Item ${index + 1} discount`);
            freeSupplyTaxTreatment(item.free_supply_tax_treatment);
            if (exactDecimalUnits(billedQuantity, `Item ${index + 1} billed quantity`, { scale: 6 }) <= 0n
                && exactDecimalUnits(freeQuantity, `Item ${index + 1} free quantity`, { scale: 6 }) <= 0n) {
                return `Item ${index + 1} billed or free quantity must be greater than zero`;
            }
            branchId ??= itemBranch;
            if (branchId !== itemBranch) return 'All invoice items must belong to one branch';
        } catch (error) {
            return error instanceof Error ? error.message : 'Invoice item is invalid';
        }
    }
    return null;
}

/** One fail-closed boundary shared by preview navigation and final submission. */
export function invoicePreviewValidationError(
    company: CompanyInfo | null,
    invoice: Invoice,
    customer: Customer | null,
): string | null {
    return companyInvoiceValidationError(company, invoice)
        || canonicalInvoiceValidationError(invoice, customer);
}

export function buildCanonicalInvoicePreparePayload(
    invoice: Invoice,
    customer: Customer,
    idempotencyKey: string,
): Record<string, unknown> {
    const validationError = canonicalInvoiceValidationError(invoice, customer);
    if (validationError) throw new Error(validationError);

    const firstItem = invoice.items[0];
    const firstDirectIssueItem = invoice.items.find(
        item => fulfillmentSource(item) === 'direct_issue',
    );
    const deliveryAddress = selectedDeliveryAddress(invoice);
    const freight = rate(invoice.freight_charges, 'Invoice freight');
    return {
        idempotency_key: idempotencyKey,
        branch_id: requiredUuid(firstItem.branch_id, 'Invoice branch'),
        invoice_date: invoice.invoice_date,
        document_discount: documentDiscount(invoice),
        rounding_policy: 'none',
        zero_rated_payment_mode: 'not_applicable',
        ...(exactDecimalUnits(freight, 'Invoice freight', { scale: 4 }) > 0n ? {
            charge_lines: [{
                charge_code: 'freight',
                quoted_amount: freight,
                price_basis: 'tax_exclusive',
                document_discount_eligible: false,
            }],
        } : {}),
        customer_account_id: requiredUuid(customer.customer_id, 'Customer'),
        delivery_address_id: deliveryAddress.id,
        delivery_address_row_version: deliveryAddress.rowVersion,
        tax_charge_mechanism: 'normal',
        ...(firstDirectIssueItem ? {
            from_location_id: requiredUuid(firstDirectIssueItem.location_id, 'Stock location'),
            logistics: {
                transport_mode: 'in_person',
                distance_km: '0',
            },
        } : {}),
        lines: invoice.items.map((item, index) => {
            const discountPercent = discount(item.discount_percent, `Item ${index + 1} discount`);
            const billedQuantity = quantity(item.quantity, `Item ${index + 1} billed quantity`);
            const freeQuantity = quantity(item.free_quantity, `Item ${index + 1} free quantity`);
            const source = fulfillmentSource(item);
            return {
                product_id: requiredUuid(item.product_id, `Item ${index + 1} product`),
                uom_conversion_id: requiredUuid(item.uom_conversion_id, `Item ${index + 1} UOM`),
                billed_quantity: billedQuantity,
                free_quantity: freeQuantity,
                free_supply_tax_treatment: freeSupplyTaxTreatment(
                    item.free_supply_tax_treatment,
                ),
                quoted_unit_rate: rate(item.unit_price, `Item ${index + 1} unit rate`),
                price_basis: 'tax_exclusive',
                line_discount: exactDecimalUnits(discountPercent, `Item ${index + 1} discount`, { scale: 6 }) > 0n ? {
                    line_discount_kind: 'percent',
                    line_discount_basis: 'price_value',
                    line_discount_value: discountPercent,
                } : {
                    line_discount_kind: 'none',
                    line_discount_basis: 'price_value',
                    line_discount_value: '0',
                },
                document_discount_eligible: true,
                fulfillment_source: source,
                ...(source === 'direct_issue' ? {
                    batch_allocations: [{
                        batch_id: requiredUuid(item.batch_id, `Item ${index + 1} batch`),
                        billed_quantity: billedQuantity,
                        free_quantity: freeQuantity,
                    }],
                } : {
                    dispatch_allocations: [{
                        dispatch_line_id: requiredUuid(
                            item.dispatch_line_id,
                            `Item ${index + 1} dispatch line`,
                        ),
                        allocated_base_billed_quantity: requiredQuantity(
                            item.base_billed_quantity,
                            `Item ${index + 1} base billed quantity`,
                        ),
                        allocated_base_free_quantity: requiredQuantity(
                            item.base_free_quantity,
                            `Item ${index + 1} base free quantity`,
                        ),
                    }],
                }),
            };
        }),
    };
}
