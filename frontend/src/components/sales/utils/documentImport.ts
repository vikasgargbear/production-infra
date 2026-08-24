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
