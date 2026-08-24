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

export interface CanonicalImportLine extends Record<string, unknown> {
    product_id: string | number;
    product_name: string;
    batch_id: string | number;
    batch_number: string;
    quantity: number;
    unit_price: number;
}

const finiteNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

    return value.map((raw, index) => {
        const item = (raw || {}) as Record<string, unknown>;
        const productId = item.product_id ?? item.id;
        const productName = String(item.product_name ?? item.name ?? '').trim();
        const batchId = item.batch_id ?? (item.best_batch as Record<string, unknown> | undefined)?.batch_id;
        const batchNumber = String(
            item.batch_number ?? (item.best_batch as Record<string, unknown> | undefined)?.batch_number ?? '',
        ).trim();
        const quantity = finiteNumber(item.dispatched_quantity ?? item.quantity);
        const unitPrice = finiteNumber(
            item.unit_price ?? item.sale_price ?? item.selling_price ?? item.quoted_unit_rate,
        );

        if (productId === undefined || productId === null || productName === '') {
            throw new Error(`Line ${index + 1} is missing its canonical product identity.`);
        }
        if (options.requireBatch !== false && (batchId === undefined || batchId === null || batchNumber === '')) {
            throw new Error(`Line ${index + 1} is missing its canonical batch allocation.`);
        }
        if (quantity === null || quantity <= 0) {
            throw new Error(`Line ${index + 1} has no positive quantity.`);
        }
        if (unitPrice === null || unitPrice < 0) {
            throw new Error(`Line ${index + 1} is missing its canonical rate.`);
        }

        return {
            ...item,
            product_id: productId as string | number,
            product_name: productName,
            batch_id: batchId as string | number,
            batch_number: batchNumber,
            quantity,
            unit_price: unitPrice,
            sale_price: unitPrice,
            gst_percent: finiteNumber(item.gst_percent ?? item.tax_percent ?? item.tax_rate) ?? 0,
            free_quantity: finiteNumber(item.free_quantity) ?? 0,
            discount_percent: finiteNumber(item.discount_percent) ?? 0,
        };
    });
}
