import type { Customer } from '../../../../types/models/customer';
import type { Invoice } from '../hooks/useInvoiceLogic';
import type { CompanyInfo } from '../../../../types/common/company.types';

type CanonicalDiscountKind = 'none' | 'percent' | 'amount';

interface CanonicalDiscount {
    document_discount_kind: CanonicalDiscountKind;
    document_discount_basis: 'price_value';
    document_discount_value: string;
}

const decimal = (value: unknown): string => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Invoice quantities and amounts must be non-negative numbers');
    }
    return String(parsed);
};

const requiredUuid = (value: unknown, label: string): string => {
    const normalized = String(value ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
        throw new Error(`${label} is missing its canonical UUID. Re-select it and try again.`);
    }
    return normalized;
};

const nonEmpty = (value: unknown): boolean => String(value ?? '').trim().length > 0;

export function companyInvoiceValidationError(
    company: CompanyInfo | null,
    invoice?: Invoice,
): string | null {
    if (!company || !nonEmpty(company.name || company.company_name)) {
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
    const percent = Number(invoice.discount_percent || 0);
    const amount = Number(invoice.discount_amount || 0);
    if (invoice.discount_type === 'fixed' && amount > 0) {
        return {
            document_discount_kind: 'amount',
            document_discount_basis: 'price_value',
            document_discount_value: decimal(amount),
        };
    }
    if (percent > 0) {
        return {
            document_discount_kind: 'percent',
            document_discount_basis: 'price_value',
            document_discount_value: decimal(percent),
        };
    }
    return {
        document_discount_kind: 'none',
        document_discount_basis: 'price_value',
        document_discount_value: '0',
    };
};

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
    if (!/^[0-9]{2}$/.test(customer.place_of_supply_state_code || '')) {
        return 'Customer place of supply is missing. Add a valid GST state/address and re-select the customer.';
    }
    if (invoice.delivery_type !== 'PICKUP') {
        return 'Delivery and courier invoices need an exact transport distance. Use Pickup until distance capture is available.';
    }

    let branchId: string | undefined;
    let locationId: string | undefined;
    for (const [index, item] of invoice.items.entries()) {
        try {
            if (!/^[0-9]{4,8}$/.test(String(item.hsn_code || '').trim())) {
                return `Item ${index + 1} HSN code is missing or invalid. Complete the product master first.`;
            }
            const itemBranch = requiredUuid(item.branch_id, `Item ${index + 1} branch`);
            const itemLocation = requiredUuid(item.location_id, `Item ${index + 1} stock location`);
            requiredUuid(item.product_id, `Item ${index + 1} product`);
            requiredUuid(item.batch_id, `Item ${index + 1} batch`);
            requiredUuid(item.uom_conversion_id, `Item ${index + 1} UOM`);
            decimal(item.quantity);
            decimal(item.free_quantity);
            decimal(item.unit_price);
            decimal(item.discount_percent);
            if (Number(item.quantity || 0) <= 0) {
                return `Item ${index + 1} billed quantity must be greater than zero`;
            }
            branchId ??= itemBranch;
            locationId ??= itemLocation;
            if (branchId !== itemBranch) return 'All invoice items must belong to one branch';
            if (locationId !== itemLocation) return 'All direct-issue items must use one stock location';
        } catch (error) {
            return error instanceof Error ? error.message : 'Invoice item is invalid';
        }
    }
    return null;
}

export function buildCanonicalInvoicePreparePayload(
    invoice: Invoice,
    customer: Customer,
    idempotencyKey: string,
): Record<string, unknown> {
    const validationError = canonicalInvoiceValidationError(invoice, customer);
    if (validationError) throw new Error(validationError);

    const firstItem = invoice.items[0];
    const freight = Number(invoice.freight_charges || 0);
    return {
        idempotency_key: idempotencyKey,
        branch_id: requiredUuid(firstItem.branch_id, 'Invoice branch'),
        invoice_date: invoice.invoice_date,
        document_discount: documentDiscount(invoice),
        rounding_policy: 'none',
        zero_rated_payment_mode: 'not_applicable',
        ...(freight > 0 ? {
            charge_lines: [{
                charge_code: 'freight',
                quoted_amount: decimal(freight),
                price_basis: 'tax_exclusive',
                document_discount_eligible: false,
            }],
        } : {}),
        customer_account_id: requiredUuid(customer.customer_id, 'Customer'),
        tax_charge_mechanism: 'normal',
        place_of_supply_state_code: customer.place_of_supply_state_code,
        from_location_id: requiredUuid(firstItem.location_id, 'Stock location'),
        logistics: {
            transport_mode: 'in_person',
            distance_km: '0',
        },
        lines: invoice.items.map((item, index) => {
            const discountPercent = Number(item.discount_percent || 0);
            const billedQuantity = decimal(item.quantity);
            const freeQuantity = decimal(item.free_quantity);
            return {
                product_id: requiredUuid(item.product_id, `Item ${index + 1} product`),
                uom_conversion_id: requiredUuid(item.uom_conversion_id, `Item ${index + 1} UOM`),
                billed_quantity: billedQuantity,
                free_quantity: freeQuantity,
                free_supply_tax_treatment: 'excluded_from_taxable_value',
                quoted_unit_rate: decimal(item.unit_price),
                price_basis: 'tax_exclusive',
                line_discount: discountPercent > 0 ? {
                    line_discount_kind: 'percent',
                    line_discount_basis: 'price_value',
                    line_discount_value: decimal(discountPercent),
                } : {
                    line_discount_kind: 'none',
                    line_discount_basis: 'price_value',
                    line_discount_value: '0',
                },
                document_discount_eligible: true,
                fulfillment_source: 'direct_issue',
                batch_allocations: [{
                    batch_id: requiredUuid(item.batch_id, `Item ${index + 1} batch`),
                    billed_quantity: billedQuantity,
                    free_quantity: freeQuantity,
                }],
            };
        }),
    };
}
