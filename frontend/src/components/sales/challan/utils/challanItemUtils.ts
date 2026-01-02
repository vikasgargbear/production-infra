/**
 * Challan Item Utilities
 * 
 * Challan-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';
import type { ChallanItem } from '../types/challanTypes';

/**
 * Prepare a product for challan item format
 * 
 * This is a thin wrapper around the shared `prepareItemForTransaction` utility,
 * ensuring the result matches the ChallanItem type.
 */
export const prepareItemForChallan = (product: ProductInput): ChallanItem => {
    return prepareItemForTransaction<ChallanItem>(product);
};
