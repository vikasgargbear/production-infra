/**
 * Batch Helper Utilities
 * 
 * Shared utilities for batch operations and expiry calculations.
 * Used across BatchTracking, CurrentStock, StockMovement, etc.
 */

import {
    AlertTriangle,
    Clock,
    CheckCircle,
    XCircle
} from 'lucide-react';
import {
    BaseBatch,
    BatchExpiryStatus,
    BatchStatusInfo,
    EXPIRY_THRESHOLDS
} from '../types/inventorySharedTypes';

/**
 * Calculate days until expiry from expiry date
 * 
 * @param expiryDate - Expiry date string
 * @returns Days remaining (negative if expired)
 */
export const calculateDaysToExpiry = (expiryDate: string | Date): number => {
    if (!expiryDate) return Infinity;

    const expiry = new Date(expiryDate);
    const today = new Date();

    // Reset time to midnight for accurate day calculation
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};

/**
 * Get batch expiry status based on days remaining
 * 
 * @param expiryDate - Expiry date string
 * @returns Batch expiry status
 */
export const getBatchExpiryStatus = (expiryDate: string | Date): BatchExpiryStatus => {
    const daysRemaining = calculateDaysToExpiry(expiryDate);

    if (daysRemaining <= EXPIRY_THRESHOLDS.EXPIRED) {
        return 'expired';
    } else if (daysRemaining <= EXPIRY_THRESHOLDS.EXPIRING_SOON) {
        return 'expiring_soon';
    } else if (daysRemaining <= EXPIRY_THRESHOLDS.NEAR_EXPIRY) {
        return 'near_expiry';
    }
    return 'normal';
};

/**
 * Get batch status display information (color, text, icon)
 * 
 * @param batch - Batch object
 * @returns Status info for UI rendering
 */
export const getBatchStatus = (batch: BaseBatch): BatchStatusInfo => {
    if (!batch.expiry_date) {
        return {
            status: 'normal',
            color: 'gray',
            text: 'No Expiry',
            daysRemaining: undefined
        };
    }

    if ((batch.quantity_available || 0) === 0) {
        return {
            status: 'normal',
            color: 'gray',
            text: 'Out of Stock'
        };
    }

    const daysRemaining = calculateDaysToExpiry(batch.expiry_date);
    const status = getBatchExpiryStatus(batch.expiry_date);

    switch (status) {
        case 'expired':
            return {
                status,
                color: 'red',
                text: 'Expired',
                daysRemaining
            };
        case 'expiring_soon':
            return {
                status,
                color: 'orange',
                text: `Expires in ${daysRemaining} days`,
                daysRemaining
            };
        case 'near_expiry':
            return {
                status,
                color: 'yellow',
                text: `${daysRemaining} days to expiry`,
                daysRemaining
            };
        default:
            return {
                status: 'normal',
                color: 'green',
                text: 'Good',
                daysRemaining
            };
    }
};

/**
 * Get batch status color for UI rendering
 * 
 * @param batch - Batch object
 * @returns Color string (red, orange, yellow, green, gray)
 */
export const getBatchStatusColor = (batch: BaseBatch): string => {
    return getBatchStatus(batch).color;
};

/**
 * Get batch status text for UI rendering
 * 
 * @param batch - Batch object
 * @returns Status text
 */
export const getBatchStatusText = (batch: BaseBatch): string => {
    return getBatchStatus(batch).text;
};

/**
 * Filter batches to get only available ones (quantity > 0, not expired)
 * 
 * @param batches - Array of batches
 * @returns Available batches
 */
export const getAvailableBatches = (batches: BaseBatch[]): BaseBatch[] => {
    return batches.filter(batch => {
        if ((batch.quantity_available || 0) <= 0) return false;
        if (!batch.expiry_date) return true; // No expiry = available

        const daysRemaining = calculateDaysToExpiry(batch.expiry_date);
        return daysRemaining > 0; // Not expired
    });
};

/**
 * Sort batches by expiry date (FEFO - First Expiry, First Out)
 * 
 * Batches without expiry dates are sorted to the end
 * 
 * @param batches - Array of batches
 * @param ascending - Sort ascending (true) or descending (false)
 * @returns Sorted batches
 */
export const sortBatchesByExpiry = (batches: BaseBatch[], ascending: boolean = true): BaseBatch[] => {
    return [...batches].sort((a, b) => {
        // Batches without expiry go to end
        if (!a.expiry_date && !b.expiry_date) return 0;
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;

        const dateA = new Date(a.expiry_date).getTime();
        const dateB = new Date(b.expiry_date).getTime();

        return ascending ? dateA - dateB : dateB - dateA;
    });
};

/**
 * Get batches expiring within specified days
 * 
 * @param batches - Array of batches
 * @param days - Number of days (e.g., 30, 60, 90)
 * @returns Batches expiring within the period
 */
export const getBatchesExpiringWithin = (batches: BaseBatch[], days: number): BaseBatch[] => {
    return batches.filter(batch => {
        if (!batch.expiry_date) return false;
        const daysRemaining = calculateDaysToExpiry(batch.expiry_date);
        return daysRemaining > 0 && daysRemaining <= days;
    });
};

/**
 * Get expired batches
 * 
 * @param batches - Array of batches
 * @returns Expired batches
 */
export const getExpiredBatches = (batches: BaseBatch[]): BaseBatch[] => {
    return batches.filter(batch => {
        if (!batch.expiry_date) return false;
        return calculateDaysToExpiry(batch.expiry_date) <= 0;
    });
};

/**
 * Calculate total quantity across batches
 * 
 * @param batches - Array of batches
 * @param onlyAvailable - Count only available (not expired) batches
 * @returns Total quantity
 */
export const calculateTotalBatchQuantity = (
    batches: BaseBatch[],
    onlyAvailable: boolean = false
): number => {
    const batchesToCount = onlyAvailable ? getAvailableBatches(batches) : batches;
    return batchesToCount.reduce((sum, batch) => sum + (batch.quantity_available || 0), 0);
};

/**
 * Calculate total batch value
 * 
 * @param batches - Array of batches
 * @param onlyAvailable - Count only available batches
 * @returns Total value
 */
export const calculateTotalBatchValue = (
    batches: BaseBatch[],
    onlyAvailable: boolean = false
): number => {
    const batchesToCount = onlyAvailable ? getAvailableBatches(batches) : batches;
    return batchesToCount.reduce((sum, batch) => {
        const qty = batch.quantity_available || 0;
        const cost = batch.cost_price || 0;
        return sum + (qty * cost);
    }, 0);
};

/**
 * Find best batch for sale (FEFO logic)
 * 
 * Returns the batch with earliest expiry that has available quantity
 * 
 * @param batches - Array of batches
 * @param minQuantity - Minimum required quantity
 * @returns Best batch or null
 */
export const findBestBatchForSale = (
    batches: BaseBatch[],
    minQuantity: number = 0
): BaseBatch | null => {
    const available = getAvailableBatches(batches);
    if (available.length === 0) return null;

    const sorted = sortBatchesByExpiry(available, true); // FEFO

    // Find first batch with sufficient quantity
    const batch = sorted.find(b => (b.quantity_available || 0) >= minQuantity);

    return batch || sorted[0]; // Return first if none meet min quantity
};
