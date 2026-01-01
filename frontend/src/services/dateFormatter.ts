/**
 * Date Formatter Service
 * Single source of truth for all date formatting
 */

type DateInput = string | Date | null | undefined;
type DateFormat = 'short' | 'long' | 'full' | 'monthYear' | 'time' | 'datetime';

interface ExpiryStatus {
    status: 'unknown' | 'expired' | 'critical' | 'warning' | 'good';
    color: string;
    bg: string;
    border: string;
    label: string;
    days?: string;
}

class DateFormatter {
    /**
     * Format date for display in UI
     * @param date - Date to format
     * @param format - Format type (short, long, full)
     * @returns Formatted date string
     */
    static formatDate(date: DateInput, format: DateFormat = 'short'): string {
        if (!date) return '';

        const dateObj = date instanceof Date ? date : new Date(date);

        if (isNaN(dateObj.getTime())) {
            return '';
        }

        switch (format) {
            case 'short':
                // DD-MM-YYYY
                return dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }).replace(/\//g, '-');

            case 'long':
                // DD MMM YYYY (e.g., 15 Jan 2024)
                return dateObj.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });

            case 'full':
                // Monday, 15 January 2024
                return dateObj.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });

            case 'monthYear':
                // Jan 2024
                return dateObj.toLocaleDateString('en-IN', {
                    month: 'short',
                    year: 'numeric'
                });

            case 'time':
                // 3:45 PM
                return dateObj.toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

            case 'datetime':
                // 15-01-2024 3:45 PM
                return `${this.formatDate(dateObj, 'short')} ${this.formatDate(dateObj, 'time')}`;

            default:
                return this.formatDate(dateObj, 'short');
        }
    }

    /**
     * Format date for API submission (ISO format)
     * @param date - Date to format
     * @returns ISO date string (YYYY-MM-DD)
     */
    static formatForAPI(date: DateInput): string | null {
        if (!date) return null;

        const dateObj = date instanceof Date ? date : new Date(date);

        if (isNaN(dateObj.getTime())) {
            return null;
        }

        return dateObj.toISOString().split('T')[0];
    }

    /**
     * Parse date from various formats
     * @param dateString - Date string to parse
     * @returns Parsed Date object
     */
    static parseDate(dateString: string | null | undefined): Date | null {
        if (!dateString) return null;

        // Try direct parsing first
        let date = new Date(dateString);

        // If invalid, try common Indian formats
        if (isNaN(date.getTime())) {
            // Try DD-MM-YYYY format
            const ddmmyyyy = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
            if (ddmmyyyy) {
                date = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
            }

            // Try DD/MM/YYYY format
            const ddmmyyyySlash = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (ddmmyyyySlash) {
                date = new Date(parseInt(ddmmyyyySlash[3]), parseInt(ddmmyyyySlash[2]) - 1, parseInt(ddmmyyyySlash[1]));
            }
        }

        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * Calculate days between two dates
     * @param date1 - First date
     * @param date2 - Second date
     * @returns Number of days between dates
     */
    static daysBetween(date1: DateInput, date2: DateInput): number {
        if (!date1 || !date2) return 0;

        const d1 = date1 instanceof Date ? date1 : new Date(date1);
        const d2 = date2 instanceof Date ? date2 : new Date(date2);

        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return 0;
        }

        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * Get relative time (e.g., "2 days ago", "in 3 months")
     * @param date - Date to compare
     * @returns Relative time string
     */
    static getRelativeTime(date: DateInput): string {
        if (!date) return '';

        const dateObj = date instanceof Date ? date : new Date(date);

        if (isNaN(dateObj.getTime())) {
            return '';
        }

        const now = new Date();
        const diffMs = dateObj.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const absDiffDays = Math.abs(diffDays);

        if (absDiffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Tomorrow';
        } else if (diffDays === -1) {
            return 'Yesterday';
        } else if (absDiffDays < 7) {
            return diffDays > 0 ? `In ${absDiffDays} days` : `${absDiffDays} days ago`;
        } else if (absDiffDays < 30) {
            const weeks = Math.floor(absDiffDays / 7);
            return diffDays > 0 ? `In ${weeks} week${weeks > 1 ? 's' : ''}` : `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else if (absDiffDays < 365) {
            const months = Math.floor(absDiffDays / 30);
            return diffDays > 0 ? `In ${months} month${months > 1 ? 's' : ''}` : `${months} month${months > 1 ? 's' : ''} ago`;
        } else {
            const years = Math.floor(absDiffDays / 365);
            return diffDays > 0 ? `In ${years} year${years > 1 ? 's' : ''}` : `${years} year${years > 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Get expiry status info based on date
     * @param expiryDate - Expiry date
     * @returns Status info with color, label, etc.
     */
    static getExpiryStatus(expiryDate: DateInput): ExpiryStatus {
        if (!expiryDate) {
            return {
                status: 'unknown',
                color: 'text-gray-500',
                bg: 'bg-gray-50',
                border: 'border-gray-200',
                label: 'No Expiry Date'
            };
        }

        const dateObj = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
        const today = new Date();
        const daysToExpiry = this.daysBetween(today, dateObj);
        const isExpired = dateObj < today;

        if (isExpired) {
            return {
                status: 'expired',
                color: 'text-red-700',
                bg: 'bg-red-50',
                border: 'border-red-300',
                label: 'Expired',
                days: `${daysToExpiry} days ago`
            };
        } else if (daysToExpiry <= 30) {
            return {
                status: 'critical',
                color: 'text-red-600',
                bg: 'bg-red-50',
                border: 'border-red-200',
                label: 'Expiring Soon',
                days: `${daysToExpiry} days`
            };
        } else if (daysToExpiry <= 90) {
            return {
                status: 'warning',
                color: 'text-amber-600',
                bg: 'bg-amber-50',
                border: 'border-amber-200',
                label: 'Near Expiry',
                days: `${Math.floor(daysToExpiry / 30)} months`
            };
        } else {
            return {
                status: 'good',
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                label: 'Fresh Stock',
                days: `${Math.floor(daysToExpiry / 30)} months`
            };
        }
    }

    /**
     * Get current date in various formats
     */
    static today(format: DateFormat = 'short'): string {
        return this.formatDate(new Date(), format);
    }

    /**
     * Get date for invoice (defaults to today)
     */
    static getInvoiceDate(): string | null {
        return this.formatForAPI(new Date());
    }
}

export default DateFormatter;
