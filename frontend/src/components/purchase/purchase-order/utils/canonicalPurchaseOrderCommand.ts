import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import type {
    PurchaseOrderData,
    PurchaseOrderItem,
} from '../hooks/usePurchaseOrderLogic';

type FreeSupplyTaxTreatment =
    | 'excluded_from_taxable_value'
    | 'included_at_unit_rate';

export interface PurchaseOrderSupplier {
    supplier_id?: string | number;
    id?: string | number;
    supplier_name?: string;
    name?: string;
}

export interface CanonicalPurchaseOrderReview {
    commandRequestId: string;
    previewHash: string;
    branchId: string;
    supplierId: string;
    supplierCommitment: string;
    cgstTotal: string;
    sgstTotal: string;
    igstTotal: string;
    cessTotal: string;
    gstTotal: string;
    warnings: string[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const UNIT_RATE_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/;

const requiredUuid = (value: unknown, label: string): string => {
    const normalized = String(value ?? '').trim();
    if (!isCanonicalUuid(normalized)) {
        throw new Error(`${label} is missing its canonical UUID. Re-select it and try again.`);
    }
    return normalized;
};

const canonicalDecimal = (
    value: unknown,
    label: string,
    pattern: RegExp,
): string => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a finite non-negative number.`);
    }
    const normalized = String(value);
    if (!pattern.test(normalized)) {
        throw new Error(`${label} exceeds canonical decimal precision.`);
    }
    return normalized;
};

const freeSupplyTreatment = (item: PurchaseOrderItem, index: number): FreeSupplyTaxTreatment => {
    if (
        item.free_supply_tax_treatment === 'excluded_from_taxable_value'
        || item.free_supply_tax_treatment === 'included_at_unit_rate'
    ) {
        return item.free_supply_tax_treatment;
    }
    if (Number(item.free_quantity ?? 0) === 0) {
        // The canonical schema requires the field even when there is no free
        // supply; excluded is then mathematically inert, not a pricing default.
        return 'excluded_from_taxable_value';
    }
    throw new Error(`Item ${index + 1} is missing its free-supply tax treatment.`);
};

export function canonicalPurchaseOrderValidationError(
    order: PurchaseOrderData,
    supplier: PurchaseOrderSupplier | null,
    branchId: unknown,
): string | null {
    try {
        requiredUuid(branchId, 'Purchase-order branch');
        requiredUuid(supplier?.supplier_id ?? supplier?.id, 'Supplier');
        if (!String(supplier?.supplier_name ?? supplier?.name ?? '').trim()) {
            return 'Selected supplier legal name is missing.';
        }
        if (!DATE_PATTERN.test(order.po_date)) return 'Purchase-order date is invalid.';
        if (!DATE_PATTERN.test(order.expected_delivery_date)) {
            return 'Expected delivery date is invalid.';
        }
        if (order.expected_delivery_date < order.po_date) {
            return 'Expected delivery date cannot precede the purchase-order date.';
        }
        if (!order.items.length) return 'Add at least one purchase-order item.';

        order.items.forEach((item, index) => {
            requiredUuid(item.id, `Item ${index + 1} line`);
            requiredUuid(item.product_id, `Item ${index + 1} product`);
            requiredUuid(item.uom_conversion_id, `Item ${index + 1} UOM`);
            const billed = canonicalDecimal(
                item.quantity,
                `Item ${index + 1} billed quantity`,
                QUANTITY_PATTERN,
            );
            const free = canonicalDecimal(
                item.free_quantity ?? 0,
                `Item ${index + 1} free quantity`,
                QUANTITY_PATTERN,
            );
            if (Number(billed) <= 0 && Number(free) <= 0) {
                throw new Error(`Item ${index + 1} needs a positive billed or free quantity.`);
            }
            const rate = canonicalDecimal(
                item.unit_price,
                `Item ${index + 1} quoted rate`,
                UNIT_RATE_PATTERN,
            );
            if (Number(rate) <= 0) {
                throw new Error(`Item ${index + 1} quoted rate must be greater than zero.`);
            }
            const discount = canonicalDecimal(
                item.discount_percent ?? 0,
                `Item ${index + 1} discount`,
                QUANTITY_PATTERN,
            );
            if (Number(discount) > 100) {
                throw new Error(`Item ${index + 1} discount cannot exceed 100%.`);
            }
            freeSupplyTreatment(item, index);
        });
        canonicalDecimal(order.discount_amount, 'Purchase-order discount', MONEY_PATTERN);
        const freight = canonicalDecimal(
            order.freight_charges,
            'Purchase-order freight',
            MONEY_PATTERN,
        );
        if (Number(freight) !== 0) {
            return 'Freight requires a canonical charge-line identity and is not available in this form.';
        }
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Purchase order is invalid.';
    }
}

export function buildCanonicalPurchaseOrderPreparePayload(
    order: PurchaseOrderData,
    supplier: PurchaseOrderSupplier,
    branchId: unknown,
    idempotencyKey: string,
): Record<string, unknown> {
    const validationError = canonicalPurchaseOrderValidationError(order, supplier, branchId);
    if (validationError) throw new Error(validationError);

    const documentDiscount = canonicalDecimal(
        order.discount_amount,
        'Purchase-order discount',
        MONEY_PATTERN,
    );
    return {
        idempotency_key: idempotencyKey,
        branch_id: requiredUuid(branchId, 'Purchase-order branch'),
        order_date: order.po_date,
        expected_on: order.expected_delivery_date,
        supplier_account_id: requiredUuid(
            supplier.supplier_id ?? supplier.id,
            'Supplier',
        ),
        tax_charge_mechanism: 'normal',
        document_discount: Number(documentDiscount) > 0 ? {
            document_discount_kind: 'amount',
            document_discount_basis: 'price_value',
            document_discount_value: documentDiscount,
        } : {
            document_discount_kind: 'none',
            document_discount_basis: 'price_value',
            document_discount_value: '0',
        },
        rounding_policy: 'none',
        zero_rated_payment_mode: 'not_applicable',
        lines: order.items.map((item, index) => {
            const discount = canonicalDecimal(
                item.discount_percent ?? 0,
                `Item ${index + 1} discount`,
                QUANTITY_PATTERN,
            );
            return {
                line_id: requiredUuid(item.id, `Item ${index + 1} line`),
                product_id: requiredUuid(item.product_id, `Item ${index + 1} product`),
                uom_conversion_id: requiredUuid(
                    item.uom_conversion_id,
                    `Item ${index + 1} UOM`,
                ),
                billed_quantity: canonicalDecimal(
                    item.quantity,
                    `Item ${index + 1} billed quantity`,
                    QUANTITY_PATTERN,
                ),
                free_quantity: canonicalDecimal(
                    item.free_quantity ?? 0,
                    `Item ${index + 1} free quantity`,
                    QUANTITY_PATTERN,
                ),
                free_supply_tax_treatment: freeSupplyTreatment(item, index),
                quoted_unit_rate: canonicalDecimal(
                    item.unit_price,
                    `Item ${index + 1} quoted rate`,
                    UNIT_RATE_PATTERN,
                ),
                price_basis: 'tax_exclusive',
                line_discount: Number(discount) > 0 ? {
                    line_discount_kind: 'percent',
                    line_discount_basis: 'price_value',
                    line_discount_value: discount,
                } : {
                    line_discount_kind: 'none',
                    line_discount_basis: 'price_value',
                    line_discount_value: '0',
                },
                document_discount_eligible: true,
            };
        }),
    };
}

export const canonicalMoneyCents = (value: unknown, label: string): number => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`Canonical purchase-order preview is missing ${label}.`);
    }
    const normalized = String(value);
    if (!MONEY_PATTERN.test(normalized)) {
        throw new Error(`Canonical purchase-order preview returned invalid ${label}.`);
    }
    const [whole, fraction = ''] = normalized.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) {
        throw new Error(`Canonical purchase-order ${label} exceeds safe money range.`);
    }
    return cents;
};

export const canonicalMoneyString = (value: unknown, label: string): string => {
    const cents = canonicalMoneyCents(value, label);
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};

const addMoney = (...values: string[]): string => {
    const cents = values.reduce(
        (sum, value) => sum + canonicalMoneyCents(value, 'money total'),
        0,
    );
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};

export function canonicalPurchaseOrderReview(
    preview: CanonicalCommandPreview,
    branchId: unknown,
    supplierId: unknown,
): CanonicalPurchaseOrderReview {
    if (preview.command_type !== 'procurement.purchase_order.approve') {
        throw new Error('Canonical purchase-order prepare returned the wrong command type.');
    }
    const finance = Array.isArray(preview.financial_impact)
        ? preview.financial_impact
        : [];
    const tax = Array.isArray(preview.tax_impact) ? preview.tax_impact : [];
    if (finance.length !== 1 || tax.length !== 1) {
        throw new Error('Canonical purchase-order prepare returned incomplete exact impacts.');
    }
    const financeImpact = finance[0] as Record<string, unknown>;
    const taxImpact = tax[0] as Record<string, unknown>;
    const cgstTotal = canonicalMoneyString(taxImpact.cgst_total, 'CGST total');
    const sgstTotal = canonicalMoneyString(taxImpact.sgst_total, 'SGST total');
    const igstTotal = canonicalMoneyString(taxImpact.igst_total, 'IGST total');
    const cessTotal = canonicalMoneyString(taxImpact.cess_total, 'cess total');
    return {
        commandRequestId: preview.command_request_id,
        previewHash: preview.preview_hash,
        branchId: requiredUuid(branchId, 'Prepared purchase-order branch'),
        supplierId: requiredUuid(supplierId, 'Prepared purchase-order supplier'),
        supplierCommitment: canonicalMoneyString(
            financeImpact.supplier_commitment,
            'supplier commitment',
        ),
        cgstTotal,
        sgstTotal,
        igstTotal,
        cessTotal,
        gstTotal: addMoney(cgstTotal, sgstTotal, igstTotal, cessTotal),
        warnings: Array.isArray(preview.policy_warnings)
            ? preview.policy_warnings.map(warning => {
                if (typeof warning === 'string') return warning;
                if (!warning || typeof warning !== 'object') return String(warning);
                const row = warning as Record<string, unknown>;
                return String(row.message ?? row.code ?? 'Unspecified policy warning');
            })
            : [],
    };
}
