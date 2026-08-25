/** Canonical server-backed sales-order calculations with exact decimals. */

import {
    type InvoiceCalculationRequest,
    type SalesOrderCalculationRequest,
    salesOrderCalculationsApi,
} from '../api/modules/sales/calculations.api';
import type { Order } from '../../types/models';
import { normalizeInvoicePreview } from './invoiceCalculationService';
import {
    inputMoney,
    inputPercent,
    inputQuantity,
    inputRate,
} from './exactCalculationPreview';
import { isCanonicalUuid } from '../../utils/canonicalUuid';

const required = <T>(value: T | null | undefined | '', label: string): T => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is missing its explicit value.`);
    }
    return value;
};

const requiredCanonicalUuid = (value: unknown, label: string): string => {
    const normalized = String(value ?? '').trim();
    if (!isCanonicalUuid(normalized)) {
        throw new Error(`${label} is missing its canonical UUID.`);
    }
    return normalized;
};

const requiredFreeSupplyTreatment = (
    value: unknown,
    label: string,
): 'excluded_from_taxable_value' | 'included_at_unit_rate' => {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') return value;
    throw new Error(`${label} is missing its explicit value.`);
};

export interface SalesOrderPreviewLine extends Record<string, unknown> {
    subtotal: string;
    discount_amount: string;
    gst_amount: string;
    tax_amount: string;
    taxable_amount: string;
    total_amount: string;
    total: string;
    line_total: string;
}

export interface SalesOrderPreviewTotals extends Record<string, string> {
    subtotal_amount: string;
    gross_amount: string;
    discount_amount: string;
    total_discount: string;
    total_tax_amount: string;
    total_tax: string;
    tax_amount: string;
    final_amount: string;
    total_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    round_off_amount: string;
    round_off: string;
}

export interface SalesOrderPreviewResult {
    items: SalesOrderPreviewLine[];
    totals: SalesOrderPreviewTotals;
    gst_type: 'CGST/SGST' | 'IGST';
}

function toRequest(order: Order): SalesOrderCalculationRequest {
    const branchId = requiredCanonicalUuid(
        order.items[0]?.branch_id, 'Sales order branch',
    );
    return {
        branch_id: branchId,
        customer_id: requiredCanonicalUuid(order.customer_id, 'Customer'),
        order_date: required(order.order_date, 'Sales order date'),
        delivery_date: order.expected_delivery_date || order.delivery_date,
        items: order.items.map((item, index) => {
            const label = `Sales order calculation items[${index}]`;
            return {
                product_id: requiredCanonicalUuid(item.product_id, `${label}.product_id`),
                batch_id: item.batch_id == null
                    ? undefined
                    : requiredCanonicalUuid(item.batch_id, `${label}.batch_id`),
                batch_number: item.batch_number,
                quantity: inputQuantity(item.quantity, `${label}.quantity`),
                free_quantity: inputQuantity(required(item.free_quantity, `${label}.free_quantity`), `${label}.free_quantity`),
                free_supply_tax_treatment: requiredFreeSupplyTreatment(item.free_supply_tax_treatment, `${label}.free_supply_tax_treatment`),
                unit_price: inputRate(item.unit_price, `${label}.unit_price`),
                mrp: inputRate(item.mrp ?? item.unit_price, `${label}.mrp`),
                discount_percent: inputPercent(item.discount_percent, `${label}.discount_percent`),
                uom: item.uom || item.unit,
                pack_type: item.pack_type,
            };
        }),
        delivery_charges: inputMoney(order.delivery_charges, 'Sales order delivery charges'),
        other_charges: inputMoney(order.other_charges, 'Sales order other charges'),
        discount_amount: inputMoney(order.discount_amount, 'Sales order discount amount'),
    };
}

export function normalizeSalesOrderPreview(
    order: Order,
    data: Awaited<ReturnType<typeof salesOrderCalculationsApi.preview>>['data'],
    request = toRequest(order),
): SalesOrderPreviewResult {
    const invoiceRequest: InvoiceCalculationRequest = {
        branch_id: request.branch_id,
        customer_id: request.customer_id,
        document_date: request.order_date,
        items: request.items,
        freight_charges: request.delivery_charges,
        insurance_charges: '0.00',
        other_charges: request.other_charges,
        discount_type: request.discount_type,
        discount_percent: request.discount_percent,
        discount_amount: request.discount_amount,
    };
    const normalized = normalizeInvoicePreview({ items: order.items }, data, invoiceRequest);
    return {
        items: normalized.items.map((line, index) => ({
            ...line,
            product_id: order.items[index]?.product_id,
            batch_id: order.items[index]?.batch_id,
            free_quantity: request.items[index].free_quantity,
            free_supply_tax_treatment: request.items[index].free_supply_tax_treatment,
            tax_amount: line.total_tax_amount,
            total: line.line_total,
            calculated_total: line.line_total,
        })) as SalesOrderPreviewLine[],
        totals: {
            ...normalized.totals,
            tax_amount: normalized.totals.total_tax_amount,
            total_amount: normalized.totals.final_amount,
            round_off: normalized.totals.round_off_amount,
        },
        gst_type: normalized.gst_type,
    } as SalesOrderPreviewResult;
}

export async function calculateSalesOrderPreview(
    order: Order,
    isOnline: boolean,
): Promise<SalesOrderPreviewResult> {
    if (!isOnline) throw new Error('Sales order preview requires the live API');
    const request = toRequest(order);
    const response = await salesOrderCalculationsApi.preview(request);
    return normalizeSalesOrderPreview(order, response.data, request);
}
