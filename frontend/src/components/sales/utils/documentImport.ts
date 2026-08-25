/** Normalize the envelope shapes returned by Sales read APIs. */

import {
    addExactDecimals,
    compareExactDecimals,
    exactDecimalString,
    exactDecimalUnits,
    normalizeExactDecimal,
} from '../../../utils/exactDecimal';
import type { CanonicalExecutedBatchAllocation } from '../../../services/api/modules/sales/canonicalSalesDocuments.types';

export function extractDocumentCollection(
    response: unknown,
    collectionKeys: string[],
): unknown[] {
    const outer = response as { data?: unknown } | undefined;
    const payload = outer?.data ?? response;
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    for (const key of collectionKeys) {
        if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [];
}

export function extractDocumentDetail(
    response: unknown,
    detailKeys: string[],
): Record<string, unknown> {
    const outer = response as { data?: unknown } | undefined;
    let payload = outer?.data ?? response;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};

    const record = payload as Record<string, unknown>;
    if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
        payload = record.data;
    }
    const normalized = payload as Record<string, unknown>;
    for (const key of detailKeys) {
        const detail = normalized[key];
        if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
            return detail as Record<string, unknown>;
        }
    }
    return normalized;
}

export type CanonicalAllocationSourceKind = 'direct_issue' | 'dispatch_allocation';
export type FreeSupplyTaxTreatment =
    | 'excluded_from_taxable_value'
    | 'included_at_unit_rate';
export type CanonicalSourceDocumentKind =
    | 'sales_order'
    | 'delivery_challan'
    | 'sales_invoice';

export interface CanonicalImportLine {
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id: string | number | null;
    batch_number: string;
    expiry_date: string | null;
    quantity: string;
    free_quantity: string;
    unit_price: string;
    sale_price: string;
    mrp?: string;
    unit?: string;
    uom_code?: string;
    manufacturer?: string;
    category?: string;
    gst_percent: string;
    tax_percent?: string;
    discount_percent: string;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    branch_id?: string;
    location_id?: string;
    uom_conversion_id?: string;
    available_quantity?: string;
    base_billed_quantity?: string;
    base_free_quantity?: string;
    source_billed_quantity?: string;
    source_free_quantity?: string;
    taxable_amount?: string;
    cgst_amount?: string;
    sgst_amount?: string;
    igst_amount?: string;
    cess_amount?: string;
    tax_amount?: string;
    total_tax_amount?: string;
    line_total?: string;
    total?: string;
    source_line_id?: string | number;
    source_document_kind?: CanonicalSourceDocumentKind;
    source_allocation_kind?: CanonicalAllocationSourceKind;
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
}

const exactOptional = (
    value: unknown,
    label: string,
    scale: number,
): string | null => {
    if (value === undefined || value === null
        || (typeof value === 'string' && value.trim() === '')) return null;
    if (typeof value !== 'string') {
        throw new Error(`${label} must be an exact decimal string from the canonical API.`);
    }
    return normalizeExactDecimal(value, label, { scale });
};

const exactRequired = (
    value: unknown,
    label: string,
    scale: number,
): string => {
    const result = exactOptional(value, label, scale);
    if (result === null) throw new Error(`${label} is missing.`);
    return result;
};

const quantitiesMatch = (left: unknown, right: unknown, label: string): boolean =>
    compareExactDecimals(left, right, label, { scale: 6 }) === 0;

const requiredFreeSupplyTaxTreatment = (
    value: unknown,
    lineIndex: number,
): FreeSupplyTaxTreatment => {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') {
        return value;
    }
    if (value === undefined || value === null || value === '') {
        throw new Error(`Line ${lineIndex + 1} is missing its canonical free-supply tax treatment.`);
    }
    throw new Error(`Line ${lineIndex + 1} has an invalid free-supply tax treatment.`);
};

const moneyFields = [
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount',
    'tax_amount', 'total_tax_amount', 'line_total', 'total',
] as const;

const apportionMinorUnits = (total: string, weights: string[], field: string): string[] => {
    const totalMinor = exactDecimalUnits(total, `Canonical ${field}`, { scale: 2 });
    if (totalMinor < 0n) throw new Error(`The canonical ${field} cannot be negative.`);
    const weightUnits = weights.map((weight, index) =>
        exactDecimalUnits(weight, `Canonical ${field} weight ${index + 1}`, { scale: 6 }));
    const totalWeight = weightUnits.reduce((sum, weight) => sum + weight, 0n);
    if (weightUnits.some(weight => weight < 0n)) {
        throw new Error(`The canonical ${field} allocation basis is invalid.`);
    }
    if (totalWeight === 0n) {
        if (totalMinor !== 0n) {
            throw new Error(`A zero-value allocation basis cannot carry ${field}.`);
        }
        return weights.map(() => '0.00');
    }

    const numerators = weightUnits.map(weight => totalMinor * weight);
    const minorShares = numerators.map(numerator => numerator / totalWeight);
    const residual = totalMinor - minorShares.reduce((sum, value) => sum + value, 0n);
    if (residual < 0n || residual > BigInt(weights.length)) {
        throw new Error(`The canonical ${field} minor-unit apportionment is inconsistent.`);
    }
    const remainderOrder = numerators
        .map((numerator, index) => ({ index, remainder: numerator % totalWeight }))
        .sort((left, right) => left.remainder === right.remainder
            ? left.index - right.index
            : left.remainder > right.remainder ? -1 : 1);
    remainderOrder.forEach((entry, index) => {
        if (BigInt(index) < residual) minorShares[entry.index] += 1n;
    });
    return minorShares.map(value => exactDecimalString(value, 2));
};

const splitMoney = (
    item: Record<string, unknown>,
    weights: string[],
): Array<Record<string, string>> => {
    const splits = weights.map(() => ({} as Record<string, string>));
    for (const field of moneyFields) {
        if (item[field] === undefined || item[field] === null) continue;
        const total = exactOptional(item[field], `Canonical ${field}`, 2);
        if (total === null) throw new Error(`The canonical ${field} is missing.`);
        apportionMinorUnits(total, weights, field).forEach((amount, index) => {
            splits[index][field] = amount;
        });
    }
    return splits;
};

const projectExecutedAllocations = (
    item: Record<string, unknown>,
    allocations: CanonicalExecutedBatchAllocation[],
    index: number,
    sourceQuantity: string,
    sourceFreeQuantity: string,
    unitPrice: string,
): CanonicalImportLine[] => {
    if (allocations.length === 0) {
        throw new Error(`Line ${index + 1} has no executed canonical batch allocations.`);
    }

    const seenAllocationIds = new Set<string>();
    const seenInventoryLines = new Set<string>();
    const seenDispatchLines = new Set<string>();
    const seenDirectCommandIds = new Set<string>();
    const lineSourceKind = allocations[0]?.source_kind;
    const quantities = allocations.map((allocation, allocationIndex) => {
        const prefix = `Line ${index + 1} allocation ${allocationIndex + 1}`;
        if (!['direct_issue', 'dispatch_allocation'].includes(allocation.source_kind)) {
            throw new Error(`${prefix} has an unsupported execution source.`);
        }
        if (allocation.source_kind !== lineSourceKind) {
            throw new Error(`Line ${index + 1} mixes incompatible execution sources.`);
        }
        const allocationId = String(allocation.allocation_id || '');
        if (seenAllocationIds.has(allocationId)) {
            throw new Error(`${prefix} duplicates a canonical allocation identity.`);
        }
        seenAllocationIds.add(allocationId);
        if (allocation.source_kind === 'dispatch_allocation'
            && (!allocation.dispatch_id || !allocation.dispatch_line_id)) {
            throw new Error(`${prefix} has contradictory dispatch lineage identities.`);
        }
        if (allocation.source_kind === 'dispatch_allocation') {
            const dispatchLineId = String(allocation.dispatch_line_id);
            const expectedAllocationId = allocation.invoice_dispatch_allocation_id
                ? String(allocation.invoice_dispatch_allocation_id)
                : dispatchLineId;
            if (allocationId !== expectedAllocationId
                || (allocation.source_line_id !== undefined
                    && String(allocation.source_line_id) !== dispatchLineId)) {
                throw new Error(`${prefix} has contradictory dispatch lineage identities.`);
            }
            if (seenDispatchLines.has(dispatchLineId)) {
                throw new Error(`${prefix} duplicates a dispatch line allocation.`);
            }
            seenDispatchLines.add(dispatchLineId);
        }
        if (allocation.source_kind === 'direct_issue'
            && allocation.invoice_dispatch_allocation_id !== undefined
            && allocation.invoice_dispatch_allocation_id !== null) {
            throw new Error(`${prefix} has contradictory dispatch allocation identity.`);
        }
        for (const [field, value] of [
            ['allocation identity', allocation.allocation_id],
            ['inventory document identity', allocation.inventory_document_id],
            ['inventory document line identity', allocation.inventory_document_line_id],
            ['batch identity', allocation.batch_id],
        ] as const) {
            if (value === undefined || value === null || String(value).trim() === '') {
                throw new Error(`${prefix} is missing its ${field}.`);
            }
        }
        if (!allocation.batch_number || String(allocation.batch_number).trim() === '') {
            throw new Error(`${prefix} is missing its batch number.`);
        }
        const inventoryLineId = String(allocation.inventory_document_line_id);
        if (allocation.source_kind === 'direct_issue'
            && (!allocation.command_request_id
                || allocationId !== inventoryLineId
                || (allocation.dispatch_id !== undefined && allocation.dispatch_id !== null)
                || (allocation.dispatch_line_id !== undefined && allocation.dispatch_line_id !== null))) {
            throw new Error(`${prefix} has contradictory direct-issue lineage identities.`);
        }
        if (allocation.source_kind === 'direct_issue') {
            seenDirectCommandIds.add(String(allocation.command_request_id));
        }
        if (seenInventoryLines.has(inventoryLineId)) {
            throw new Error(`${prefix} duplicates an executed inventory line.`);
        }
        seenInventoryLines.add(inventoryLineId);

        const billed = exactOptional(allocation.billed_quantity, `${prefix} billed quantity`, 6);
        const free = exactOptional(allocation.free_quantity, `${prefix} free quantity`, 6);
        if (billed === null || free === null) {
            throw new Error(`${prefix} does not identify billed and free quantities separately.`);
        }
        if (exactDecimalUnits(billed, `${prefix} billed quantity`, { scale: 6 }) < 0n
            || exactDecimalUnits(free, `${prefix} free quantity`, { scale: 6 }) < 0n
            || exactDecimalUnits(addExactDecimals([billed, free], `${prefix} total quantity`, { scale: 6 }), `${prefix} total quantity`, { scale: 6 }) <= 0n) {
            throw new Error(`${prefix} has invalid executed quantities.`);
        }

        const baseQuantity = exactOptional(allocation.base_quantity, `${prefix} base quantity`, 6);
        const baseBilled = exactOptional(allocation.base_billed_quantity, `${prefix} base billed quantity`, 6);
        const baseFree = exactOptional(allocation.base_free_quantity, `${prefix} base free quantity`, 6);
        if (baseQuantity !== null && exactDecimalUnits(baseQuantity, `${prefix} base quantity`, { scale: 6 }) <= 0n) {
            throw new Error(`${prefix} has no positive executed base quantity.`);
        }
        if (baseQuantity !== null && baseBilled !== null && baseFree !== null
            && !quantitiesMatch(baseQuantity, addExactDecimals([baseBilled, baseFree], `${prefix} base total`, { scale: 6 }), `${prefix} base reconciliation`)) {
            throw new Error(`${prefix} has contradictory executed base quantities.`);
        }
        return { billed, free };
    });

    if (lineSourceKind === 'direct_issue' && seenDirectCommandIds.size !== 1) {
        throw new Error(`Line ${index + 1} mixes allocations from different canonical commands.`);
    }

    const billedTotal = addExactDecimals(quantities.map(allocation => allocation.billed), `Line ${index + 1} billed total`, { scale: 6 });
    const freeTotal = addExactDecimals(quantities.map(allocation => allocation.free), `Line ${index + 1} free total`, { scale: 6 });
    if (!quantitiesMatch(billedTotal, sourceQuantity, `Line ${index + 1} billed reconciliation`)
        || !quantitiesMatch(freeTotal, sourceFreeQuantity, `Line ${index + 1} free reconciliation`)) {
        throw new Error(`Line ${index + 1} batch allocations do not reconcile to its billed and free quantities.`);
    }

    const freeTreatment = item.free_supply_tax_treatment;
    if (!['excluded_from_taxable_value', 'included_at_unit_rate'].includes(
        String(freeTreatment),
    )) {
        throw new Error(`Line ${index + 1} is missing its canonical free-supply tax treatment.`);
    }
    const monetaryWeights = quantities.map(value => addExactDecimals([
        value.billed,
        freeTreatment === 'included_at_unit_rate' ? value.free : '0',
    ], `Line ${index + 1} monetary allocation weight`, { scale: 6 }));
    const monetarySplits = splitMoney(item, monetaryWeights);
    return allocations.map((allocation, allocationIndex) => ({
        ...monetarySplits[allocationIndex],
        source_line_id: allocation.source_line_id
            ?? (allocation.source_kind === 'dispatch_allocation'
                ? allocation.dispatch_line_id ?? undefined
                : item.id as string | number | undefined),
        source_document_kind: item.source_document_kind as (
            CanonicalSourceDocumentKind | undefined
        ),
        source_allocation_kind: allocation.source_kind,
        allocation_id: allocation.allocation_id,
        command_request_id: allocation.command_request_id ?? null,
        inventory_document_id: allocation.inventory_document_id,
        inventory_document_line_id: allocation.inventory_document_line_id,
        invoice_dispatch_allocation_id: allocation.invoice_dispatch_allocation_id ?? null,
        dispatch_id: allocation.dispatch_id ?? null,
        dispatch_line_id: allocation.dispatch_line_id ?? null,
        branch_id: typeof item.branch_id === 'string' ? item.branch_id : undefined,
        location_id: allocation.from_location_id ?? undefined,
        uom_conversion_id: typeof item.uom_conversion_id === 'string'
            ? item.uom_conversion_id
            : undefined,
        available_quantity: exactOptional(item.available_quantity, `Line ${index + 1} availability`, 6) ?? undefined,
        base_billed_quantity: exactOptional(allocation.base_billed_quantity, `Line ${index + 1} base billed quantity`, 6) ?? undefined,
        base_free_quantity: exactOptional(allocation.base_free_quantity, `Line ${index + 1} base free quantity`, 6) ?? undefined,
        source_billed_quantity: quantities[allocationIndex].billed,
        source_free_quantity: quantities[allocationIndex].free,
        product_id: (item.product_id ?? item.id) as string | number,
        product_name: String(item.product_name ?? item.name ?? '').trim(),
        product_code: typeof item.product_code === 'string' ? item.product_code : undefined,
        hsn_code: typeof item.hsn_code === 'string' ? item.hsn_code : undefined,
        batch_id: allocation.batch_id,
        batch_number: String(allocation.batch_number).trim(),
        expiry_date: allocation.expiry_date ?? null,
        quantity: quantities[allocationIndex].billed,
        free_quantity: quantities[allocationIndex].free,
        unit_price: unitPrice,
        sale_price: unitPrice,
        mrp: exactOptional(item.mrp, `Line ${index + 1} MRP`, 4) ?? undefined,
        unit: typeof item.unit === 'string' ? item.unit : undefined,
        uom_code: typeof item.uom_code === 'string' ? item.uom_code : undefined,
        manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        gst_percent: exactRequired(item.gst_percent ?? item.tax_percent ?? item.tax_rate, `Line ${index + 1} GST percent`, 6),
        tax_percent: exactOptional(item.tax_percent ?? item.tax_rate, `Line ${index + 1} tax percent`, 6) ?? undefined,
        discount_percent: exactRequired(item.discount_percent, `Line ${index + 1} discount percent`, 6),
        free_supply_tax_treatment: freeTreatment as FreeSupplyTaxTreatment,
    }));
};

/**
 * Project authoritative document lines into an importable transaction shape.
 * A line without its canonical product, batch, quantity, or rate fails closed;
 * callers must not silently turn incomplete list rows into business drafts.
 */
export function projectCanonicalImportLines(
    value: unknown,
    options: { requireBatch?: boolean } = { requireBatch: true },
): CanonicalImportLine[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('The selected document has no importable line items.');
    }

    const projected: CanonicalImportLine[] = [];
    value.forEach((raw, index) => {
        const item = (raw || {}) as Record<string, unknown>;
        const productId = item.product_id ?? item.id;
        const productName = String(item.product_name ?? item.name ?? '').trim();
        const batchId = item.batch_id ?? (item.best_batch as Record<string, unknown> | undefined)?.batch_id;
        const batchNumber = String(
            item.batch_number ?? (item.best_batch as Record<string, unknown> | undefined)?.batch_number ?? '',
        ).trim();
        const quantity = exactOptional(item.dispatched_quantity ?? item.quantity, `Line ${index + 1} billed quantity`, 6);
        const freeQuantity = exactOptional(item.free_quantity, `Line ${index + 1} free quantity`, 6);
        const unitPrice = exactOptional(
            item.unit_price ?? item.sale_price ?? item.selling_price ?? item.quoted_unit_rate,
            `Line ${index + 1} unit rate`,
            4,
        );

        if (productId === undefined || productId === null || productName === '') {
            throw new Error(`Line ${index + 1} is missing its canonical product identity.`);
        }
        if (quantity === null || freeQuantity === null) {
            throw new Error(`Line ${index + 1} must identify billed and free quantities separately.`);
        }
        if (exactDecimalUnits(quantity, `Line ${index + 1} billed quantity`, { scale: 6 }) < 0n
            || exactDecimalUnits(freeQuantity, `Line ${index + 1} free quantity`, { scale: 6 }) < 0n
            || exactDecimalUnits(addExactDecimals([quantity, freeQuantity], `Line ${index + 1} total quantity`, { scale: 6 }), `Line ${index + 1} total quantity`, { scale: 6 }) <= 0n) {
            throw new Error(`Line ${index + 1} has no positive billed or free quantity.`);
        }
        if (unitPrice === null || exactDecimalUnits(unitPrice, `Line ${index + 1} unit rate`, { scale: 4 }) < 0n) {
            throw new Error(`Line ${index + 1} is missing its canonical rate.`);
        }

        if (Object.prototype.hasOwnProperty.call(item, 'batch_allocations')) {
            if (!Array.isArray(item.batch_allocations)) {
                throw new Error(`Line ${index + 1} has an invalid canonical batch allocation set.`);
            }
            projected.push(...projectExecutedAllocations(
                item,
                item.batch_allocations as CanonicalExecutedBatchAllocation[],
                index,
                quantity,
                freeQuantity,
                unitPrice,
            ));
            return;
        }

        if (options.requireBatch !== false && (batchId === undefined || batchId === null || batchNumber === '')) {
            throw new Error(`Line ${index + 1} is missing its canonical batch allocation.`);
        }

        projected.push({
            product_id: productId as string | number,
            source_line_id: (item.source_line_id ?? item.id) as string | number | undefined,
            source_document_kind: item.source_document_kind as (
                CanonicalSourceDocumentKind | undefined
            ),
            product_name: productName,
            product_code: typeof item.product_code === 'string' ? item.product_code : undefined,
            hsn_code: typeof item.hsn_code === 'string' ? item.hsn_code : undefined,
            batch_id: (batchId ?? null) as string | number | null,
            batch_number: batchNumber,
            expiry_date: typeof item.expiry_date === 'string' ? item.expiry_date : null,
            quantity,
            unit_price: unitPrice,
            sale_price: unitPrice,
            mrp: exactOptional(item.mrp, `Line ${index + 1} MRP`, 4) ?? undefined,
            unit: typeof item.unit === 'string' ? item.unit : undefined,
            uom_code: typeof item.uom_code === 'string' ? item.uom_code : undefined,
            manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : undefined,
            category: typeof item.category === 'string' ? item.category : undefined,
            gst_percent: exactRequired(item.gst_percent ?? item.tax_percent ?? item.tax_rate, `Line ${index + 1} GST percent`, 6),
            tax_percent: exactOptional(item.tax_percent ?? item.tax_rate, `Line ${index + 1} tax percent`, 6) ?? undefined,
            free_quantity: freeQuantity,
            discount_percent: exactRequired(item.discount_percent, `Line ${index + 1} discount percent`, 6),
            free_supply_tax_treatment: requiredFreeSupplyTaxTreatment(
                item.free_supply_tax_treatment,
                index,
            ),
            branch_id: typeof item.branch_id === 'string' ? item.branch_id : undefined,
            location_id: typeof item.location_id === 'string' ? item.location_id : undefined,
            uom_conversion_id: typeof item.uom_conversion_id === 'string'
                ? item.uom_conversion_id
                : undefined,
            available_quantity: exactOptional(item.available_quantity, `Line ${index + 1} availability`, 6) ?? undefined,
        });
    });
    return projected;
}
