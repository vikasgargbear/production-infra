/** Boundary between delivery-challan UI state and backend-owned calculations. */

import { challanCalculationsApi } from '../api/modules/sales/calculations.api';
import type { Challan } from '../../components/sales/challan/types/challanTypes';


function numeric(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function canonicalIdentity(value: string | number, label: string): string | number {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    throw new Error(`Select a valid ${label} before calculating a delivery challan.`);
}

export async function calculateChallanPreview(challan: Challan, isOnline: boolean) {
    if (!isOnline) {
        throw new Error('Delivery challan preview requires the live API');
    }

    const customerId = canonicalIdentity(challan.customer_id, 'customer');
    const items = challan.items.map(item => ({
        product_id: canonicalIdentity(item.product_id, 'product'),
        quantity: numeric(item.quantity),
        free_quantity: numeric(item.free_quantity),
        free_supply_tax_treatment: item.free_supply_tax_treatment
            ?? 'excluded_from_taxable_value',
        unit_price: numeric(item.unit_price ?? item.sale_price),
        discount_percent: numeric(item.discount_percent),
        gst_percent: numeric(item.gst_percent ?? item.tax_percent)
    }));
    const response = await challanCalculationsApi.preview({
        customer_id: customerId,
        gst_type: challan.gst_type,
        items,
        freight_charges: numeric(challan.freight_charges)
    });
    const data = response.data;
    return {
        items: data.line_items.map((line, index) => ({
            ...(challan.items[index] || {}),
            ...line,
            product_id: challan.items[index]?.product_id,
            batch_id: challan.items[index]?.batch_id,
            free_quantity: numeric(challan.items[index]?.free_quantity),
            free_supply_tax_treatment:
                challan.items[index]?.free_supply_tax_treatment
                ?? 'excluded_from_taxable_value',
            total: numeric(line.line_total),
            line_total: numeric(line.line_total)
        })),
        totals: data.totals,
        gst_type: data.gst_type
    };
}
