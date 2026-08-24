/** Canonical server-backed sales-order calculations. */

import {
    InvoiceCalculationResponse,
    SalesOrderCalculationRequest,
    salesOrderCalculationsApi
} from '../api/modules/sales/calculations.api';
import type { Order } from '../../types/models';


export interface SalesOrderPreviewLine {
    subtotal?: number;
    discount_amount?: number;
    gst_amount?: number;
    tax_amount?: number;
    taxable_amount?: number;
    total_amount?: number;
    total?: number;
    line_total?: number;
    [key: string]: unknown;
}

export interface SalesOrderPreviewTotals {
    subtotal_amount?: number;
    gross_amount?: number;
    discount_amount?: number;
    total_discount?: number;
    total_tax_amount?: number;
    total_tax?: number;
    tax_amount?: number;
    final_amount?: number;
    total_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    round_off_amount?: number;
    round_off?: number;
    [key: string]: number | undefined;
}

export interface SalesOrderPreviewResult {
    items: SalesOrderPreviewLine[];
    totals: SalesOrderPreviewTotals;
    gst_type: string;
}


function numeric(value: unknown, fallback: number = 0): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function canonicalCustomerIdentity(value: string | number): string | number {
    if (typeof value === 'string' && value.trim() !== '' && value.trim() !== '0') {
        return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    throw new Error('Select a valid customer before calculating a sales order.');
}

function toRequest(order: Order): SalesOrderCalculationRequest {
    return {
        customer_id: canonicalCustomerIdentity(order.customer_id),
        gst_type: order.gst_type || 'CGST/SGST',
        order_date: order.order_date,
        delivery_date: order.expected_delivery_date || order.delivery_date,
        items: order.items.map(item => ({
            product_id: item.product_id,
            batch_id: item.batch_id || undefined,
            batch_number: item.batch_number,
            quantity: numeric(item.quantity),
            free_quantity: numeric(item.free_quantity),
            free_supply_tax_treatment: item.free_supply_tax_treatment
                ?? 'excluded_from_taxable_value',
            unit_price: numeric(item.unit_price),
            mrp: numeric(item.mrp, numeric(item.unit_price)),
            discount_percent: numeric(item.discount_percent),
            tax_percent: numeric(item.gst_percent),
            gst_type: order.gst_type || 'CGST/SGST',
            uom: item.uom || item.unit,
            pack_type: item.pack_type
        })),
        delivery_charges: numeric(order.delivery_charges),
        other_charges: numeric(order.other_charges)
    };
}

export function normalizeSalesOrderPreview(
    order: Order,
    data: InvoiceCalculationResponse
): SalesOrderPreviewResult {
    const totals = data.totals;
    const items = data.line_items.map((line, index) => ({
        ...(order.items[index] || {}),
        ...line,
        product_id: order.items[index]?.product_id,
        batch_id: order.items[index]?.batch_id,
        free_quantity: numeric(order.items[index]?.free_quantity),
        free_supply_tax_treatment:
            order.items[index]?.free_supply_tax_treatment
            ?? 'excluded_from_taxable_value',
        gst_amount: line.total_tax_amount,
        tax_amount: line.total_tax_amount,
        total_amount: line.line_total,
        total: line.line_total,
        calculated_total: line.line_total
    }));

    return {
        items,
        totals: {
            ...totals,
            tax_amount: totals.total_tax_amount,
            total_amount: totals.final_amount,
            round_off: totals.round_off_amount
        },
        gst_type: data.gst_type
    };
}

export async function calculateSalesOrderPreview(
    order: Order,
    isOnline: boolean
): Promise<SalesOrderPreviewResult> {
    if (!isOnline) {
        throw new Error('Sales order preview requires the live API');
    }

    const response = await salesOrderCalculationsApi.preview(toRequest(order));
    return normalizeSalesOrderPreview(order, response.data);
}
