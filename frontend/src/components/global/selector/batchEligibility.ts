import { compareExactDecimals, exactDecimalUnits } from '../../../utils/exactDecimal';

export interface BatchEligibilityFacts {
    batch_id?: string | null;
    batch_number?: string | null;
    batch_status?: string | null;
    quantity_available: string;
    days_to_expiry?: number | null;
    expiry_date?: string | null;
    location_id?: string | null;
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
    try {
        if (exactDecimalUnits(batch.quantity_available, 'Batch available quantity', {
            scale: 6,
            maximumWholeDigits: 14,
        }) <= 0n) {
            return 'No saleable stock is available';
        }
    } catch {
        return 'No saleable stock is available';
    }
    return null;
};

const canonicalExpiry = (batch: BatchEligibilityFacts): string => {
    const value = String(batch.expiry_date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-12-31';
};

/**
 * Canonical sales issue resolution applies FEFO within a stock location.
 * Keep the ordering deterministic with batch UUID as the final presentation
 * tie-breaker, matching the command resolver's `expires_on, batch_id` order.
 */
export const compareBatchesByCanonicalFefo = (
    left: BatchEligibilityFacts,
    right: BatchEligibilityFacts,
): number => {
    const leftExpiry = canonicalExpiry(left);
    const rightExpiry = canonicalExpiry(right);
    if (leftExpiry < rightExpiry) return -1;
    if (leftExpiry > rightExpiry) return 1;

    const leftId = String(left.batch_id || '').toLowerCase();
    const rightId = String(right.batch_id || '').toLowerCase();
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

/**
 * Direct-invoice FEFO uses expiry-date tiers within a stock location. Every
 * eligible batch sharing the earliest expiry date is a valid operator choice;
 * only later-expiry tiers remain locked while earlier stock exists.
 */
export const batchSelectionDisabledReason = (
    batch: BatchEligibilityFacts,
    candidates: BatchEligibilityFacts[],
    enforceFefo: boolean,
): string | null => {
    const intrinsicReason = batchDisabledReason(batch);
    if (intrinsicReason || !enforceFefo) return intrinsicReason;

    const locationId = String(batch.location_id || '');
    const eligibleAtLocation = candidates
        .filter(candidate => String(candidate.location_id || '') === locationId)
        .filter(candidate => batchDisabledReason(candidate) === null)
        .sort(compareBatchesByCanonicalFefo);
    const earliest = eligibleAtLocation[0];

    if (!earliest || canonicalExpiry(batch) === canonicalExpiry(earliest)) return null;

    const earliestIdentity = earliest.batch_number
        ? `batch ${earliest.batch_number}`
        : 'the earliest-expiry batch';
    return `FEFO requires ${earliestIdentity} (expires ${earliest.expiry_date}) first`;
};

export const compareBatchAvailability = (
    left: BatchEligibilityFacts,
    right: BatchEligibilityFacts,
): -1 | 0 | 1 => compareExactDecimals(
    left.quantity_available,
    right.quantity_available,
    'Batch availability',
    { scale: 6, maximumWholeDigits: 14 },
);
