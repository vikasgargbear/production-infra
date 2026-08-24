export interface BatchEligibilityFacts {
    batch_status?: string | null;
    quantity_available: number;
    days_to_expiry?: number | null;
}

/**
 * Canonical inventory batches are saleable only after release.  Blocked and
 * other lifecycle states remain visible so the operator understands why stock
 * cannot be selected, but they must never cross into an invoice command.
 */
export const batchDisabledReason = (batch: BatchEligibilityFacts): string | null => {
    const status = String(batch.batch_status || '').trim().toLowerCase();

    if (status === 'blocked') {
        return 'Blocked by inventory or quality control';
    }
    if (status !== 'released') {
        return status
            ? `Not saleable while batch status is ${status}`
            : 'Batch release status is unavailable';
    }
    if (batch.days_to_expiry !== null && batch.days_to_expiry !== undefined
        && batch.days_to_expiry <= 0) {
        return 'Expired batch cannot be sold';
    }
    if (!Number.isFinite(batch.quantity_available) || batch.quantity_available <= 0) {
        return 'No saleable stock is available';
    }
    return null;
};
