import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { exactDecimalString, exactDecimalUnits } from '../../../../utils/exactDecimal';
import type {
    PurchaseOrderData,
    PurchaseOrderItem,
} from '../hooks/usePurchaseOrderLogic';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

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
    const normalized = String(value ?? '').trim();
    if (!pattern.test(normalized)) {
        throw new Error(`${label} exceeds canonical decimal precision.`);
    }
    const fractionDigits = pattern === MONEY_PATTERN ? 2 : pattern === UNIT_RATE_PATTERN ? 4 : 6;
    exactDecimalUnits(value, label, {
        scale: fractionDigits,
        maximumWholeDigits: pattern === MONEY_PATTERN ? 18 : pattern === UNIT_RATE_PATTERN ? 16 : 14,
    });
    return normalized;
};

const quantityUnits = (value: string, label: string): bigint => (
    exactDecimalUnits(value, label, { scale: 6, maximumWholeDigits: 14 })
);

const freeSupplyTreatment = (item: PurchaseOrderItem, index: number): FreeSupplyTaxTreatment => {
    if (
        item.free_supply_tax_treatment === 'excluded_from_taxable_value'
        || item.free_supply_tax_treatment === 'included_at_unit_rate'
    ) {
        return item.free_supply_tax_treatment;
    }
    if (quantityUnits(canonicalDecimal(item.free_quantity, 'Free quantity', QUANTITY_PATTERN), 'Free quantity') === 0n) {
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
        requiredUuid(supplier?.supplier_id, 'Supplier');
        if (!String(supplier?.supplier_name ?? '').trim()) {
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
                item.free_quantity,
                `Item ${index + 1} free quantity`,
                QUANTITY_PATTERN,
            );
            if (quantityUnits(billed, 'Billed quantity') <= 0n && quantityUnits(free, 'Free quantity') <= 0n) {
                throw new Error(`Item ${index + 1} needs a positive billed or free quantity.`);
            }
            const rate = canonicalDecimal(
                item.unit_price,
                `Item ${index + 1} quoted rate`,
                UNIT_RATE_PATTERN,
            );
            if (exactDecimalUnits(rate, 'Quoted rate', { scale: 4, maximumWholeDigits: 16 }) <= 0n) {
                throw new Error(`Item ${index + 1} quoted rate must be greater than zero.`);
            }
            const discount = canonicalDecimal(
                item.discount_percent,
                `Item ${index + 1} discount`,
                QUANTITY_PATTERN,
            );
            if (quantityUnits(discount, 'Discount') > 100_000_000n) {
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
        if (exactDecimalUnits(freight, 'Freight', { scale: 2, maximumWholeDigits: 18 }) !== 0n) {
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
    policy: CanonicalDocumentPolicy | null,
): Record<string, unknown> {
    if (!policy) throw new Error('Canonical commercial document policy is unavailable.');
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
            supplier.supplier_id,
            'Supplier',
        ),
        tax_charge_mechanism: policy.default_tax_charge_mechanism,
        document_discount: exactDecimalUnits(documentDiscount, 'Document discount', { scale: 2, maximumWholeDigits: 18 }) > 0n ? {
            document_discount_kind: 'amount',
            document_discount_basis: 'price_value',
            document_discount_value: documentDiscount,
        } : {
            document_discount_kind: 'none',
            document_discount_basis: 'price_value',
            document_discount_value: '0',
        },
        rounding_policy: policy.default_rounding_policy,
        zero_rated_payment_mode: policy.default_zero_rated_payment_mode,
        lines: order.items.map((item, index) => {
            const discount = canonicalDecimal(
                item.discount_percent,
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
                    item.free_quantity,
                    `Item ${index + 1} free quantity`,
                    QUANTITY_PATTERN,
                ),
                free_supply_tax_treatment: freeSupplyTreatment(item, index),
                quoted_unit_rate: canonicalDecimal(
                    item.unit_price,
                    `Item ${index + 1} quoted rate`,
                    UNIT_RATE_PATTERN,
                ),
                price_basis: policy.default_price_basis,
                line_discount: quantityUnits(discount, 'Line discount') > 0n ? {
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

export const canonicalMoneyCents = (value: unknown, label: string): bigint => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`Canonical purchase-order preview is missing ${label}.`);
    }
    const normalized = String(value);
    if (!MONEY_PATTERN.test(normalized)) {
        throw new Error(`Canonical purchase-order preview returned invalid ${label}.`);
    }
    return exactDecimalUnits(value, `Canonical purchase-order ${label}`, {
        scale: 2,
        maximumWholeDigits: 18,
    });
};

export const canonicalMoneyString = (value: unknown, label: string): string => {
    return exactDecimalString(canonicalMoneyCents(value, label), 2);
};

const addMoney = (...values: string[]): string => {
    const cents = values.reduce<bigint>(
        (sum, value) => sum + canonicalMoneyCents(value, 'money total'),
        0n,
    );
    return exactDecimalString(cents, 2);
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
