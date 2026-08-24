import type { AxiosResponse } from 'axios';

import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
    approveAndExecuteCanonicalAction,
    canonicalExecutionCompleted,
    prepareCanonicalAction,
    type CanonicalCommandExecution,
    type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';
import { apiHelpers } from '../../apiClient';
import { canonicalMoneyCents } from '../../../../components/purchase/purchase-order/utils/canonicalPurchaseOrderCommand';


export interface CanonicalPurchaseOrderReadbackLine {
    purchase_order_line_id: string;
    line_number: number;
    line_kind: 'product' | 'charge';
    product_id: string | null;
    product_name: string | null;
    product_code: string | null;
    hsn_code: string | null;
    charge_code: string | null;
    uom_code: string | null;
    uom_conversion_id: string | null;
    billed_quantity: string | null;
    free_quantity: string | null;
    free_supply_tax_treatment:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate'
        | null;
    quoted_unit_rate: string | null;
    price_basis: 'tax_exclusive' | 'tax_inclusive';
    gross_amount: string;
    line_discount_amount: string;
    document_discount_amount: string;
    net_value_amount: string;
    gst_taxable_value: string;
    cgst_rate: string;
    sgst_rate: string;
    igst_rate: string;
    cess_rate: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    line_total: string;
}

export interface CanonicalPurchaseOrderReadback {
    purchase_order_id: string;
    branch_id: string;
    supplier_id: string;
    supplier_name: string;
    purchase_order_number: string;
    order_date: string;
    expected_delivery_date: string | null;
    status: 'submitted' | 'approved';
    supply_type: 'intra_state' | 'inter_state';
    currency_code: string;
    subtotal: string;
    discount_total: string;
    charges_total: string;
    net_value_total: string;
    taxable_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    rounding_adjustment: string;
    total_amount: string;
    calculation_ruleset_version: string;
    row_version: number;
    items: CanonicalPurchaseOrderReadbackLine[];
}

export interface CanonicalPurchaseOrderExecutionResult {
    execution: CanonicalCommandExecution;
}

const quantityPattern = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const decimalValue = (value: unknown, label: string): string => {
    const normalized = String(value ?? '');
    if (!quantityPattern.test(normalized)) {
        throw new Error(`Canonical purchase-order readback returned invalid ${label}.`);
    }
    return normalized;
};

const sumMoney = (values: unknown[], label: string): bigint => values.reduce<bigint>(
    (sum, value) => sum + canonicalMoneyCents(value, label),
    0n,
);

const assertMoneyEqual = (actual: bigint, expected: unknown, label: string): void => {
    if (actual !== canonicalMoneyCents(expected, label)) {
        throw new Error(`Canonical purchase-order readback ${label} does not reconcile.`);
    }
};

export function requireCanonicalPurchaseOrderReadback(
    value: unknown,
    expectedId?: string,
): CanonicalPurchaseOrderReadback {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Canonical purchase-order readback returned no document.');
    }
    const document = value as Partial<CanonicalPurchaseOrderReadback>;
    if (!isCanonicalUuid(document.purchase_order_id)
        || (expectedId && document.purchase_order_id !== expectedId)) {
        throw new Error('Canonical purchase-order readback returned the wrong document identity.');
    }
    if (!isCanonicalUuid(document.branch_id) || !isCanonicalUuid(document.supplier_id)) {
        throw new Error('Canonical purchase-order readback is missing branch or supplier identity.');
    }
    if (document.status !== 'approved') {
        throw new Error('Canonical purchase-order readback did not confirm approved status.');
    }
    if (!document.purchase_order_number || !document.supplier_name) {
        throw new Error('Canonical purchase-order readback is missing document identity.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(document.order_date ?? ''))
        || (document.expected_delivery_date !== null
            && !/^\d{4}-\d{2}-\d{2}$/.test(String(document.expected_delivery_date)))) {
        throw new Error('Canonical purchase-order readback returned invalid dates.');
    }
    if (!['intra_state', 'inter_state'].includes(String(document.supply_type))
        || document.currency_code !== 'INR'
        || !Number.isInteger(document.row_version)
        || Number(document.row_version) < 1) {
        throw new Error('Canonical purchase-order readback returned invalid document metadata.');
    }
    for (const field of [
        'subtotal', 'discount_total', 'charges_total', 'taxable_amount',
        'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount', 'total_amount',
    ] as const) {
        canonicalMoneyCents(document[field], field);
    }
    if (!Array.isArray(document.items) || document.items.length === 0) {
        throw new Error('Canonical purchase-order readback has no lines.');
    }
    document.items.forEach((line, index) => {
        if (!line || !isCanonicalUuid(line.purchase_order_line_id)) {
            throw new Error(`Canonical purchase-order line ${index + 1} has invalid identity.`);
        }
        for (const field of [
            'gross_amount', 'line_discount_amount', 'document_discount_amount',
            'net_value_amount', 'gst_taxable_value', 'cgst_amount', 'sgst_amount',
            'igst_amount', 'cess_amount', 'line_total',
        ] as const) canonicalMoneyCents(line[field], `line ${index + 1} ${field}`);
        for (const field of ['cgst_rate', 'sgst_rate', 'igst_rate', 'cess_rate'] as const) {
            decimalValue(line[field], `line ${index + 1} ${field}`);
        }
        if (!Number.isInteger(line.line_number) || line.line_number < 1
            || !['tax_exclusive', 'tax_inclusive'].includes(line.price_basis)) {
            throw new Error(`Canonical purchase-order line ${index + 1} has invalid metadata.`);
        }
        if (line.line_kind === 'product') {
            if (!isCanonicalUuid(line.product_id) || !line.uom_code
                || !isCanonicalUuid(line.uom_conversion_id)
                || line.billed_quantity === null || line.free_quantity === null
                || line.quoted_unit_rate === null || !line.free_supply_tax_treatment) {
                throw new Error(`Canonical purchase-order product line ${index + 1} is incomplete.`);
            }
            decimalValue(line.billed_quantity, `line ${index + 1} billed quantity`);
            decimalValue(line.free_quantity, `line ${index + 1} free quantity`);
            decimalValue(line.quoted_unit_rate, `line ${index + 1} quoted rate`);
        } else if (line.line_kind !== 'charge' || !line.charge_code
            || line.product_id !== null || line.uom_code !== null
            || line.uom_conversion_id !== null || line.billed_quantity !== null
            || line.free_quantity !== null || line.quoted_unit_rate !== null
            || line.free_supply_tax_treatment !== null) {
            throw new Error(`Canonical purchase-order line ${index + 1} has invalid kind.`);
        }
    });
    if (new Set(document.items.map(line => line.line_number)).size !== document.items.length) {
        throw new Error('Canonical purchase-order readback returned duplicate line numbers.');
    }

    const items = document.items;
    const products = items.filter(line => line.line_kind === 'product');
    const charges = items.filter(line => line.line_kind === 'charge');
    if (!products.length) throw new Error('Canonical purchase-order readback has no product line.');
    assertMoneyEqual(sumMoney(products.map(line => line.gross_amount), 'subtotal'), document.subtotal, 'subtotal');
    assertMoneyEqual(sumMoney(charges.map(line => line.gross_amount), 'charges total'), document.charges_total, 'charges total');
    assertMoneyEqual(sumMoney(items.flatMap(line => [line.line_discount_amount, line.document_discount_amount]), 'discount total'), document.discount_total, 'discount total');
    assertMoneyEqual(sumMoney(items.map(line => line.net_value_amount), 'net value total'), document.net_value_total, 'net value total');
    assertMoneyEqual(sumMoney(items.map(line => line.gst_taxable_value), 'taxable total'), document.taxable_amount, 'taxable total');
    assertMoneyEqual(sumMoney(items.map(line => line.cgst_amount), 'CGST total'), document.cgst_amount, 'CGST total');
    assertMoneyEqual(sumMoney(items.map(line => line.sgst_amount), 'SGST total'), document.sgst_amount, 'SGST total');
    assertMoneyEqual(sumMoney(items.map(line => line.igst_amount), 'IGST total'), document.igst_amount, 'IGST total');
    assertMoneyEqual(sumMoney(items.map(line => line.cess_amount), 'cess total'), document.cess_amount, 'cess total');
    assertMoneyEqual(
        sumMoney(items.map(line => line.line_total), 'grand total')
            + canonicalMoneyCents(document.rounding_adjustment, 'rounding adjustment'),
        document.total_amount,
        'grand total',
    );
    return document as CanonicalPurchaseOrderReadback;
}

export const canonicalPurchaseOrdersApi = {
    prepare: (payload: Record<string, unknown>): Promise<AxiosResponse<CanonicalCommandPreview>> =>
        prepareCanonicalAction('procurement.purchase_order.prepare', payload),

    executePrepared: async (
        preview: CanonicalCommandPreview,
        lifecycleId: string,
    ): Promise<CanonicalPurchaseOrderExecutionResult> => {
        const { executed } = await approveAndExecuteCanonicalAction(
            'procurement.purchase_order.prepare',
            preview,
            lifecycleId,
        );
        if (!canonicalExecutionCompleted(executed.data)
            || !isCanonicalUuid(executed.data.resource_id)) {
            throw new Error('Canonical purchase-order execution did not confirm a resource.');
        }
        return { execution: executed.data };
    },

    readback: async (purchaseOrderId: string): Promise<CanonicalPurchaseOrderReadback> => {
        if (!isCanonicalUuid(purchaseOrderId)) {
            throw new Error('Canonical purchase-order readback requires a valid document identity.');
        }
        const readback = await apiHelpers.get<CanonicalPurchaseOrderReadback>(
            `/canonical/purchase-orders/${purchaseOrderId}`,
        );
        return requireCanonicalPurchaseOrderReadback(readback.data, purchaseOrderId);
    },
};
