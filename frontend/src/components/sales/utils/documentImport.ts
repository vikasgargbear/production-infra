/** Normalize the envelope shapes returned by Sales read APIs. */

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

export interface CanonicalImportLine {
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id: string | number | null;
    batch_number: string;
    expiry_date: string | null;
    quantity: number;
    free_quantity: number;
    unit_price: number;
    sale_price: number;
    mrp?: number;
    unit?: string;
    uom_code?: string;
    manufacturer?: string;
    category?: string;
    gst_percent: number;
    tax_percent?: number;
    discount_percent: number;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    taxable_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    cess_amount?: number;
    tax_amount?: number;
    total_tax_amount?: number;
    line_total?: number;
    total?: number;
    source_line_id?: string | number;
    source_allocation_kind?: CanonicalAllocationSourceKind;
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
}

interface CanonicalExecutedBatchAllocation {
    source_kind: CanonicalAllocationSourceKind;
    allocation_id: string;
    command_request_id?: string | null;
    inventory_document_id: string;
    inventory_document_line_id: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
    batch_id: string | number;
    batch_number: string;
    expiry_date?: string | null;
    billed_quantity?: number | string | null;
    free_quantity?: number | string | null;
    base_quantity?: number | string | null;
    base_billed_quantity?: number | string | null;
    base_free_quantity?: number | string | null;
}

const finiteNumber = (value: unknown): number | null => {
    if (value === undefined || value === null
        || (typeof value === 'string' && value.trim() === '')) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const quantitiesMatch = (left: number, right: number): boolean =>
    Math.abs(left - right) <= 0.000001;

const optionalFreeSupplyTaxTreatment = (
    value: unknown,
    lineIndex: number,
): FreeSupplyTaxTreatment | undefined => {
    if (value === undefined || value === null) return undefined;
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') {
        return value;
    }
    throw new Error(`Line ${lineIndex + 1} has an invalid free-supply tax treatment.`);
};

const moneyFields = [
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount',
    'tax_amount', 'total_tax_amount', 'line_total', 'total',
] as const;

const apportionMinorUnits = (total: number, weights: number[], field: string): number[] => {
    if (total < 0) throw new Error(`The canonical ${field} cannot be negative.`);
    const totalMinor = Math.round(total * 100);
    if (!quantitiesMatch(total, totalMinor / 100)) {
        throw new Error(`The canonical ${field} exceeds minor-unit precision.`);
    }
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (weights.some(weight => !Number.isFinite(weight) || weight < 0)) {
        throw new Error(`The canonical ${field} allocation basis is invalid.`);
    }
    if (totalWeight === 0) {
        if (totalMinor !== 0) {
            throw new Error(`A zero-value allocation basis cannot carry ${field}.`);
        }
        return weights.map(() => 0);
    }

    const exactShares = weights.map(weight => totalMinor * weight / totalWeight);
    const minorShares = exactShares.map(Math.floor);
    const residual = totalMinor - minorShares.reduce((sum, value) => sum + value, 0);
    if (residual < 0 || residual > weights.length) {
        throw new Error(`The canonical ${field} minor-unit apportionment is inconsistent.`);
    }
    const remainderOrder = exactShares
        .map((exact, index) => ({ index, remainder: exact - Math.floor(exact) }))
        .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    for (let index = 0; index < residual; index += 1) {
        minorShares[remainderOrder[index].index] += 1;
    }
    return minorShares.map(value => value / 100);
};

const splitMoney = (
    item: Record<string, unknown>,
    weights: number[],
): Array<Record<string, number>> => {
    const splits = weights.map(() => ({} as Record<string, number>));
    for (const field of moneyFields) {
        if (item[field] === undefined || item[field] === null) continue;
        const total = finiteNumber(item[field]);
        if (total === null) throw new Error(`The canonical ${field} is not numeric.`);
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
    sourceQuantity: number,
    sourceFreeQuantity: number,
    unitPrice: number,
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
            && (!allocation.invoice_dispatch_allocation_id
                || String(allocation.invoice_dispatch_allocation_id).trim() === '')) {
            throw new Error(`${prefix} is missing its invoice dispatch allocation identity.`);
        }
        if (allocation.source_kind === 'dispatch_allocation'
            && (allocationId !== String(allocation.invoice_dispatch_allocation_id)
                || !allocation.dispatch_id || !allocation.dispatch_line_id)) {
            throw new Error(`${prefix} has contradictory dispatch lineage identities.`);
        }
        if (allocation.source_kind === 'dispatch_allocation') {
            const dispatchLineId = String(allocation.dispatch_line_id);
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

        const billed = finiteNumber(allocation.billed_quantity);
        const free = finiteNumber(allocation.free_quantity);
        if (billed === null || free === null) {
            throw new Error(`${prefix} does not identify billed and free quantities separately.`);
        }
        if (billed < 0 || free < 0 || billed + free <= 0) {
            throw new Error(`${prefix} has invalid executed quantities.`);
        }

        const baseQuantity = finiteNumber(allocation.base_quantity);
        const baseBilled = finiteNumber(allocation.base_billed_quantity);
        const baseFree = finiteNumber(allocation.base_free_quantity);
        if (baseQuantity !== null && baseQuantity <= 0) {
            throw new Error(`${prefix} has no positive executed base quantity.`);
        }
        if (baseQuantity !== null && baseBilled !== null && baseFree !== null
            && !quantitiesMatch(baseQuantity, baseBilled + baseFree)) {
            throw new Error(`${prefix} has contradictory executed base quantities.`);
        }
        return { billed, free };
    });

    if (lineSourceKind === 'direct_issue' && seenDirectCommandIds.size !== 1) {
        throw new Error(`Line ${index + 1} mixes allocations from different canonical commands.`);
    }

    const billedTotal = quantities.reduce((sum, allocation) => sum + allocation.billed, 0);
    const freeTotal = quantities.reduce((sum, allocation) => sum + allocation.free, 0);
    if (!quantitiesMatch(billedTotal, sourceQuantity)
        || !quantitiesMatch(freeTotal, sourceFreeQuantity)) {
        throw new Error(`Line ${index + 1} batch allocations do not reconcile to its billed and free quantities.`);
    }

    const freeTreatment = item.free_supply_tax_treatment;
    if (!['excluded_from_taxable_value', 'included_at_unit_rate'].includes(
        String(freeTreatment),
    )) {
        throw new Error(`Line ${index + 1} is missing its canonical free-supply tax treatment.`);
    }
    const monetaryWeights = quantities.map(value => value.billed + (
        freeTreatment === 'included_at_unit_rate' ? value.free : 0
    ));
    const monetarySplits = splitMoney(item, monetaryWeights);
    return allocations.map((allocation, allocationIndex) => ({
        ...monetarySplits[allocationIndex],
        source_line_id: item.id as string | number | undefined,
        source_allocation_kind: allocation.source_kind,
        allocation_id: allocation.allocation_id,
        command_request_id: allocation.command_request_id ?? null,
        inventory_document_id: allocation.inventory_document_id,
        inventory_document_line_id: allocation.inventory_document_line_id,
        invoice_dispatch_allocation_id: allocation.invoice_dispatch_allocation_id ?? null,
        dispatch_id: allocation.dispatch_id ?? null,
        dispatch_line_id: allocation.dispatch_line_id ?? null,
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
        mrp: finiteNumber(item.mrp) ?? undefined,
        unit: typeof item.unit === 'string' ? item.unit : undefined,
        uom_code: typeof item.uom_code === 'string' ? item.uom_code : undefined,
        manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        gst_percent: finiteNumber(item.gst_percent ?? item.tax_percent ?? item.tax_rate) ?? 0,
        tax_percent: finiteNumber(item.tax_percent ?? item.tax_rate) ?? undefined,
        discount_percent: finiteNumber(item.discount_percent) ?? 0,
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
        const quantity = finiteNumber(item.dispatched_quantity ?? item.quantity);
        const freeQuantity = finiteNumber(item.free_quantity);
        const unitPrice = finiteNumber(
            item.unit_price ?? item.sale_price ?? item.selling_price ?? item.quoted_unit_rate,
        );

        if (productId === undefined || productId === null || productName === '') {
            throw new Error(`Line ${index + 1} is missing its canonical product identity.`);
        }
        if (quantity === null || freeQuantity === null) {
            throw new Error(`Line ${index + 1} must identify billed and free quantities separately.`);
        }
        if (quantity < 0 || freeQuantity < 0 || quantity + freeQuantity <= 0) {
            throw new Error(`Line ${index + 1} has no positive billed or free quantity.`);
        }
        if (unitPrice === null || unitPrice < 0) {
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
            product_name: productName,
            product_code: typeof item.product_code === 'string' ? item.product_code : undefined,
            hsn_code: typeof item.hsn_code === 'string' ? item.hsn_code : undefined,
            batch_id: (batchId ?? null) as string | number | null,
            batch_number: batchNumber,
            expiry_date: typeof item.expiry_date === 'string' ? item.expiry_date : null,
            quantity,
            unit_price: unitPrice,
            sale_price: unitPrice,
            mrp: finiteNumber(item.mrp) ?? undefined,
            unit: typeof item.unit === 'string' ? item.unit : undefined,
            uom_code: typeof item.uom_code === 'string' ? item.uom_code : undefined,
            manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : undefined,
            category: typeof item.category === 'string' ? item.category : undefined,
            gst_percent: finiteNumber(item.gst_percent ?? item.tax_percent ?? item.tax_rate) ?? 0,
            tax_percent: finiteNumber(item.tax_percent ?? item.tax_rate) ?? undefined,
            free_quantity: freeQuantity,
            discount_percent: finiteNumber(item.discount_percent) ?? 0,
            free_supply_tax_treatment: optionalFreeSupplyTaxTreatment(
                item.free_supply_tax_treatment,
                index,
            ),
        });
    });
    return projected;
}
