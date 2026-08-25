import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { Order } from '../../../types/models';
import type { Challan } from '../challan/types/challanTypes';
import { exactDecimalUnits, normalizeExactDecimal } from '../../../utils/exactDecimal';
import type { CanonicalDocumentPolicy } from '../../../services/api/modules/org/canonicalBusinessContext.api';

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
    freeQuantity: string,
    label: string,
): 'excluded_from_taxable_value' | 'included_at_unit_rate' {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') {
        return value;
    }
    if (exactDecimalUnits(freeQuantity, `${label} free quantity`, { scale: 6 }) === 0n) {
        return 'excluded_from_taxable_value';
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

function deliveryAddress(value: Order['shipping_address_data']): { id: string; rowVersion: string } {
    const record = value as (Record<string, unknown> | null);
    const id = uuid(record?.address_id, 'Delivery address');
    const rowVersion = String(record?.row_version ?? '').trim();
    if (!/^[1-9][0-9]*$/.test(rowVersion)) {
        throw new Error('Delivery address is missing its canonical row version. Re-select it and try again.');
    }
    return { id, rowVersion };
}

export function buildCanonicalSalesOrderCommand(
    order: Order,
    idempotencyKey: string,
    policy: CanonicalDocumentPolicy | null,
): Record<string, unknown> {
    if (!policy) throw new Error('Canonical commercial document policy is unavailable');
    if (!order.items.length) throw new Error('Add at least one product before preparing the order');
    requireZero(order.discount_amount, 'Order document discount', 2);
    requireZero(order.delivery_charges, 'Order delivery charges', 2, true);
    requireZero(order.other_charges, 'Order other charges', 2);
    const branchId = uuid(order.items[0].branch_id, 'Order branch');
    const customerId = uuid(order.customer_id, 'Customer');
    const selectedDeliveryAddress = deliveryAddress(order.shipping_address_data);
    return {
        idempotency_key: idempotencyKey,
        branch_id: branchId,
        order_date: order.order_date,
        ...(order.expected_delivery_date ? { requested_delivery_date: order.expected_delivery_date } : {}),
        customer_account_id: customerId,
        delivery_address_id: selectedDeliveryAddress.id,
        delivery_address_row_version: selectedDeliveryAddress.rowVersion,
        lines: order.items.map((item, index) => {
            if (uuid(item.branch_id, `Item ${index + 1} branch`) !== branchId) {
                throw new Error('All order items must belong to one branch');
            }
            const discount = decimal(item.discount_percent, `Item ${index + 1} discount`, 6);
            const freeQuantity = decimal(item.free_quantity, `Item ${index + 1} free quantity`, 6);
            return {
                product_id: uuid(item.product_id, `Item ${index + 1} product`),
                uom_conversion_id: uuid(item.uom_conversion_id, `Item ${index + 1} UOM`),
                billed_quantity: decimal(item.quantity, `Item ${index + 1} billed quantity`, 6, true),
                free_quantity: freeQuantity,
                free_supply_tax_treatment: freeSupplyTaxTreatment(
                    item.free_supply_tax_treatment,
                    freeQuantity,
                    `Item ${index + 1} free-supply tax treatment`,
                ),
                quoted_unit_rate: decimal(item.unit_price, `Item ${index + 1} unit rate`, 4),
                price_basis: policy.default_price_basis,
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
        rounding_policy: policy.default_rounding_policy,
        zero_rated_payment_mode: policy.default_zero_rated_payment_mode,
    };
}

export function buildCanonicalSalesDispatchCommand(
    challan: Challan,
    idempotencyKey: string,
    policy: CanonicalDocumentPolicy | null,
): Record<string, unknown> {
    if (!policy) throw new Error('Canonical physical logistics policy is unavailable');
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
                sales_order_line_id: uuid(item.source_order_line_id, `Item ${index + 1} sales-order line`),
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
            transport_mode: policy.default_transport_mode,
            distance_km: decimal(challan.distance_km, 'Dispatch transport distance', 2),
        },
    };
}
