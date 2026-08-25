import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { Order } from '../../../types/models';
import type { Challan } from '../challan/types/challanTypes';
import { exactDecimalUnits, normalizeExactDecimal } from '../../../utils/exactDecimal';

function uuid(value: unknown, label: string): string {
    const result = String(value ?? '').trim();
    if (!isCanonicalUuid(result)) throw new Error(`${label} is missing its canonical UUID`);
    return result;
}

function decimal(value: unknown, label: string, scale: number, positive = false): string {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is missing its explicit canonical value`);
    }
    const result = normalizeExactDecimal(value, label, { scale });
    if (positive && exactDecimalUnits(result, label, { scale }) <= 0n) {
        throw new Error(`${label} must be greater than zero`);
    }
    return result;
}

function freeSupplyTaxTreatment(
    value: unknown,
    label: string,
): 'excluded_from_taxable_value' | 'included_at_unit_rate' {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') {
        return value;
    }
    throw new Error(`${label} is missing its explicit canonical value`);
}

function requireZero(value: unknown, label: string, scale: number, optional = false): void {
    if (optional && (value === undefined || value === null || value === '')) return;
    const normalized = decimal(value, label, scale);
    if (exactDecimalUnits(normalized, label, { scale }) !== 0n) {
        throw new Error(`${label} is not supported by canonical sales-order posting`);
    }
}

export function buildCanonicalSalesOrderCommand(order: Order, idempotencyKey: string): Record<string, unknown> {
    if (!order.items.length) throw new Error('Add at least one product before preparing the order');
    requireZero(order.discount_amount, 'Order document discount', 2);
    requireZero(order.delivery_charges, 'Order delivery charges', 2, true);
    requireZero(order.other_charges, 'Order other charges', 2);
    const branchId = uuid(order.items[0].branch_id, 'Order branch');
    const customerId = uuid(order.customer_id, 'Customer');
    return {
        idempotency_key: idempotencyKey,
        branch_id: branchId,
        order_date: order.order_date,
        ...(order.expected_delivery_date ? { requested_delivery_date: order.expected_delivery_date } : {}),
        customer_account_id: customerId,
        lines: order.items.map((item, index) => {
            if (uuid(item.branch_id, `Item ${index + 1} branch`) !== branchId) {
                throw new Error('All order items must belong to one branch');
            }
            const discount = decimal(item.discount_percent, `Item ${index + 1} discount`, 6);
            return {
                product_id: uuid(item.product_id, `Item ${index + 1} product`),
                uom_conversion_id: uuid(item.uom_conversion_id, `Item ${index + 1} UOM`),
                billed_quantity: decimal(item.quantity, `Item ${index + 1} billed quantity`, 6, true),
                free_quantity: decimal(item.free_quantity, `Item ${index + 1} free quantity`, 6),
                free_supply_tax_treatment: freeSupplyTaxTreatment(
                    item.free_supply_tax_treatment,
                    `Item ${index + 1} free-supply tax treatment`,
                ),
                quoted_unit_rate: decimal(item.unit_price, `Item ${index + 1} unit rate`, 4),
                price_basis: 'tax_exclusive',
                line_discount: {
                    line_discount_kind: /^0(?:\.0+)?$/.test(discount) ? 'none' : 'percent',
                    line_discount_basis: 'taxable_value',
                    line_discount_value: discount,
                },
                document_discount_eligible: true,
            };
        }),
        document_discount: {
            document_discount_kind: 'none',
            document_discount_basis: 'taxable_value',
            document_discount_value: '0',
        },
        rounding_policy: 'none',
        zero_rated_payment_mode: 'not_applicable',
    };
}

export function buildCanonicalSalesDispatchCommand(challan: Challan, idempotencyKey: string): Record<string, unknown> {
    const salesOrderId = uuid(challan.source_order_id, 'Source sales order');
    if (!challan.items.length) throw new Error('Import an approved sales order before preparing the dispatch');
    const branchId = uuid(challan.items[0].branch_id, 'Dispatch branch');
    const fromLocationId = uuid(challan.items[0].location_id, 'Dispatch stock location');
    return {
        idempotency_key: idempotencyKey,
        branch_id: branchId,
        dispatch_date: challan.challan_date,
        sales_order_id: salesOrderId,
        from_location_id: fromLocationId,
        lines: challan.items.map((item, index) => {
            if (uuid(item.branch_id, `Item ${index + 1} branch`) !== branchId
                || uuid(item.location_id, `Item ${index + 1} location`) !== fromLocationId) {
                throw new Error('All dispatch allocations must use one branch and stock location');
            }
            return {
                sales_order_line_id: uuid(item.source_order_line_id ?? item.id, `Item ${index + 1} sales-order line`),
                billed_quantity: decimal(item.quantity, `Item ${index + 1} billed quantity`, 6, true),
                free_quantity: decimal(item.free_quantity, `Item ${index + 1} free quantity`, 6),
                batch_allocations: [{
                    batch_id: uuid(item.batch_id, `Item ${index + 1} batch`),
                    billed_quantity: decimal(item.quantity, `Item ${index + 1} batch billed quantity`, 6, true),
                    free_quantity: decimal(item.free_quantity, `Item ${index + 1} batch free quantity`, 6),
                }],
            };
        }),
        logistics: {
            transport_mode: 'road',
            ...(challan.transport_company ? { transporter_name: challan.transport_company } : {}),
            ...(challan.vehicle_number ? { vehicle_number: challan.vehicle_number } : {}),
            ...(challan.lr_number ? { transport_document_number: challan.lr_number } : {}),
        },
    };
}
