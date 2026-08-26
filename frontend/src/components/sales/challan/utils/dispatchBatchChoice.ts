import {
    addExactDecimals,
    compareExactDecimals,
} from '../../../../utils/exactDecimal';
import type {
    ChallanEligibleBatch,
    ChallanItem,
} from '../types/challanTypes';

/**
 * An explicit choice may replace one allocation only inside its existing FEFO
 * expiry tier. Moving quantity to a later expiry would violate the canonical
 * resolver, while changing quantities would require a new server allocation.
 */
export function eligibleDispatchBatchChoices(
    item: ChallanItem,
    allItems: ChallanItem[],
): ChallanEligibleBatch[] {
    const allocationQuantity = addExactDecimals(
        [item.quantity, item.free_quantity ?? '0'],
        `${item.product_name} allocation quantity`,
        { scale: 6 },
    );
    const allocationBaseQuantity = addExactDecimals(
        [item.base_billed_quantity, item.base_free_quantity],
        `${item.product_name} base allocation quantity`,
        { scale: 6 },
    );
    const usedBySibling = new Set(allItems
        .filter(candidate => candidate.source_order_line_id === item.source_order_line_id
            && candidate.id !== item.id)
        .map(candidate => String(candidate.batch_id)));
    return (item.eligible_batches ?? []).filter(candidate => {
        if (candidate.location_id !== item.location_id
            || candidate.expiry_date !== item.expiry_date
            || (usedBySibling.has(candidate.batch_id) && candidate.batch_id !== item.batch_id)
            || compareExactDecimals(
                candidate.available_quantity,
                allocationQuantity,
                `${item.product_name} batch availability`,
                { scale: 6 },
            ) < 0) return false;

        const maximumBaseAvailability = allItems
            .filter(other => String(other.product_id) === String(item.product_id)
                && other.location_id === item.location_id)
            .flatMap(other => other.eligible_batches ?? [])
            .filter(otherBatch => otherBatch.batch_id === candidate.batch_id)
            .reduce<string | null>((maximum, otherBatch) => (
                maximum === null || compareExactDecimals(
                    otherBatch.available_base_quantity,
                    maximum,
                    `${item.product_name} shared batch availability`,
                    { scale: 6 },
                ) > 0 ? otherBatch.available_base_quantity : maximum
            ), null);
        if (maximumBaseAvailability === null) return false;
        const selectedBaseQuantity = addExactDecimals(
            [allocationBaseQuantity, ...allItems
                .filter(other => other.id !== item.id
                    && String(other.product_id) === String(item.product_id)
                    && other.location_id === item.location_id
                    && String(other.batch_id) === candidate.batch_id)
                .flatMap(other => [other.base_billed_quantity, other.base_free_quantity])],
            `${item.product_name} selected shared batch quantity`,
            { scale: 6 },
        );
        return compareExactDecimals(
            maximumBaseAvailability,
            selectedBaseQuantity,
            `${item.product_name} shared batch capacity`,
            { scale: 6 },
        ) >= 0;
    });
}

export function applyDispatchBatchChoice(
    items: ChallanItem[],
    itemId: string | number,
    batchId: string,
): ChallanItem[] {
    const target = items.find(item => item.id === itemId);
    if (!target) throw new Error('The selected dispatch allocation is no longer available.');
    const selected = eligibleDispatchBatchChoices(target, items)
        .find(candidate => candidate.batch_id === batchId);
    if (!selected) {
        throw new Error('The selected batch does not preserve canonical FEFO and availability.');
    }
    return items.map(item => item.id !== itemId ? item : ({
        ...item,
        id: `${String(item.source_order_line_id)}:${selected.batch_id}`,
        batch_id: selected.batch_id,
        batch_number: selected.batch_number,
        expiry_date: selected.expiry_date,
        location_id: selected.location_id,
        mrp: selected.mrp,
    }));
}
