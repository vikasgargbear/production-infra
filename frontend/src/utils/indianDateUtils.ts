/**
 * Simple Date Utilities for Indian Users
 * Defaults to IST (Asia/Kolkata)
 * 
 * Like Flipkart/Swiggy/Zerodha - Keep it simple!
 * Handles timezone based on company settings
 */

/**
 * Get company timezone from localStorage
 * Falls back to IST if not set
 */
const getCompanyTimezone = (): string => {
    if (typeof localStorage === 'undefined') return 'Asia/Kolkata';
    return localStorage.getItem('company_timezone') || 'Asia/Kolkata';
};

/**
 * Get offset hours for a timezone
 * Currently supports common Indian business timezones
 */
const getTimezoneOffset = (timezone: string): number => {
    const offsets: Record<string, number> = {
        'Asia/Kolkata': 5.5,        // IST: UTC+5:30
        'Asia/Dubai': 4,            // GST: UTC+4
        'Asia/Singapore': 8,        // SGT: UTC+8
        'Europe/London': 0,         // GMT: UTC+0 (DST handled separately)
        'America/New_York': -5      // EST: UTC-5 (DST handled separately)
    };

    return offsets[timezone] || 5.5; // Default to IST
};

/**
 * Get current date in company timezone (YYYY-MM-DD)
 * This is what you use for invoice_date, order_date, etc.
 * 
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getTodayBusinessDate = (): string => {
    const timezone = getCompanyTimezone();
    const offsetHours = getTimezoneOffset(timezone);

    // Get current UTC time
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);

    // Apply timezone offset
    const tzTime = new Date(utc + (3600000 * offsetHours));

    const year = tzTime.getFullYear();
    const month = String(tzTime.getMonth() + 1).padStart(2, '0');
    const day = String(tzTime.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * Add days to today (in company timezone)
 * Example: getDaysFromToday(30) for due date
 * 
 * @param {number} days - Number of days to add (can be negative)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getDaysFromToday = (days: number): string => {
    const today = getTodayBusinessDate();
    const date = new Date(today);
    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * Add months to today (in company timezone)
 * Example: getMonthsFromToday(3) for quarterly reports
 * 
 * @param {number} months - Number of months to add
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getMonthsFromToday = (months: number): string => {
    const today = getTodayBusinessDate();
    const date = new Date(today);
    date.setMonth(date.getMonth() + months);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * Format date for display based on company preference
 * Default: DD-MM-YYYY (Indian format)
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
export const formatDateForDisplay = (dateString: string | null | undefined): string => {
    if (!dateString) return '';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    const format = (typeof localStorage !== 'undefined' ? localStorage.getItem('date_format') : null) || 'DD-MM-YYYY';

    switch (format) {
        case 'MM-DD-YYYY':
            return `${month}-${day}-${year}`;
        case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
        case 'DD-MM-YYYY':
        default:
            return `${day}-${month}-${year}`;
    }
};

/**
 * Get UTC timestamp (for created_at, updated_at, synced_at)
 * Keep system timestamps in UTC for sync/audit purposes
 * 
 * @returns {string} ISO timestamp string
 */
export const getUTCTimestamp = (): string => {
    return new Date().toISOString();
};

/**
 * Parse date string to Date object
 * Handles multiple formats
 * 
 * @param {string|Date} input - Date input
 * @returns {Date|null} Date object or null
 */
export const parseDateString = (input: string | Date | null | undefined): Date | null => {
    if (!input) return null;
    if (input instanceof Date) return input;

    // Handle YYYY-MM-DD format (most common from backend)
    if (typeof input === 'string' && input.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = input.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    // Handle DD-MM-YYYY format
    if (typeof input === 'string' && input.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = input.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    // Fallback to standard parsing
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Check if date is today (in company timezone)
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if date is today
 */
export const isToday = (dateString: string): boolean => {
    return dateString === getTodayBusinessDate();
};

/**
 * Check if date is in the past
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if date is in the past
 */
export const isPastDate = (dateString: string): boolean => {
    if (!dateString) return false;
    const today = getTodayBusinessDate();
    return dateString < today;
};

/**
 * Check if date is in the future
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if date is in the future
 */
export const isFutureDate = (dateString: string): boolean => {
    if (!dateString) return false;
    const today = getTodayBusinessDate();
    return dateString > today;
};

interface DateRange {
    start: string;
    end: string;
}

/**
 * Get date range for reports (last N days)
 * 
 * @param {number} daysBack - Number of days to go back
 * @returns {object} Object with start and end dates
 */
export const getDateRange = (daysBack: number): DateRange => {
    const end = getTodayBusinessDate();
    const start = getDaysFromToday(-daysBack);

    return {
        start,
        end
    };
};

interface FinancialYear {
    start: string;
    end: string;
    label: string;
    fullLabel: string;
}

/**
 * Get current financial year dates (April 1 to March 31 for India)
 * 
 * @returns {object} Object with start, end, and label
 */
export const getCurrentFinancialYear = (): FinancialYear => {
    const today = getTodayBusinessDate();
    const [year, month] = today.split('-').map(Number);

    // If current month is Apr-Dec (4-12), FY starts this year
    // If Jan-Mar (1-3), FY started last year
    const fyStartYear = month >= 4 ? year : year - 1;
    const fyEndYear = fyStartYear + 1;

    return {
        start: `${fyStartYear}-04-01`,
        end: `${fyEndYear}-03-31`,
        label: `FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`, // e.g., "FY 2024-25"
        fullLabel: `Financial Year ${fyStartYear}-${fyEndYear}`
    };
};

/**
 * Get previous financial year
 * 
 * @returns {object} Object with start, end, and label
 */
export const getPreviousFinancialYear = (): FinancialYear => {
    const currentFY = getCurrentFinancialYear();
    const startYear = parseInt(currentFY.start.split('-')[0]);

    return {
        start: `${startYear - 1}-04-01`,
        end: `${startYear}-03-31`,
        label: `FY ${startYear - 1}-${String(startYear).slice(-2)}`,
        fullLabel: `Financial Year ${startYear - 1}-${startYear}`
    };
};

/**
 * Get days between two dates
 * 
 * @param {string} date1 - First date (YYYY-MM-DD)
 * @param {string} date2 - Second date (YYYY-MM-DD)
 * @returns {number} Number of days between dates
 */
export const getDaysBetween = (date1: string, date2: string): number => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
        return 0;
    }

    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};

/**
 * Get days until a date (negative if past)
 * 
 * @param {string} dateString - Target date (YYYY-MM-DD)
 * @returns {number} Days until date (negative if past)
 */
export const getDaysUntil = (dateString: string | null | undefined): number => {
    if (!dateString) return 0;

    const today = getTodayBusinessDate();
    const target = new Date(dateString);
    const todayDate = new Date(today);

    if (isNaN(target.getTime())) return 0;

    const diffTime = target.getTime() - todayDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};

/**
 * Format relative date (e.g., "Today", "Yesterday", "2 days ago")
 * 
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {string} Relative date string
 */
export const getRelativeDateString = (dateString: string): string => {
    if (!dateString) return '';

    const daysUntil = getDaysUntil(dateString);

    if (daysUntil === 0) return 'Today';
    if (daysUntil === 1) return 'Tomorrow';
    if (daysUntil === -1) return 'Yesterday';
    if (daysUntil > 0) return `In ${daysUntil} days`;
    return `${Math.abs(daysUntil)} days ago`;
};

interface TimezoneInfo {
    timezone: string;
    currentDate: string;
    dateFormat: string;
    timeFormat: string;
}

/**
 * Get timezone info for debugging
 * 
 * @returns {object} Timezone information
 */
export const getTimezoneInfo = (): TimezoneInfo => {
    const timezone = getCompanyTimezone();
    return {
        timezone,
        currentDate: getTodayBusinessDate(),
        dateFormat: (typeof localStorage !== 'undefined' ? localStorage.getItem('date_format') : null) || 'DD-MM-YYYY',
        timeFormat: (typeof localStorage !== 'undefined' ? localStorage.getItem('time_format') : null) || '12h'
    };
};

/**
 * Validate date string format (YYYY-MM-DD)
 * 
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid
 */
export const isValidDateString = (dateString: any): boolean => {
    if (!dateString) return false;
    if (typeof dateString !== 'string') return false;

    // Check format YYYY-MM-DD
    if (!dateString.match(/^\d{4}-\d{2}-\d{2}$/)) return false;

    // Check if it's a valid date
    const date = new Date(dateString);
    return !isNaN(date.getTime());
};

/**
 * Convert any date input to YYYY-MM-DD format
 * 
 * @param {string|Date} input - Date input
 * @returns {string|null} Date string in YYYY-MM-DD format or null
 */
export const toStandardDateString = (input: string | Date | null | undefined): string | null => {
    const date = parseDateString(input);
    if (!date) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

// Export all functions
export default {
    getTodayBusinessDate,
    getDaysFromToday,
    getMonthsFromToday,
    formatDateForDisplay,
    getUTCTimestamp,
    parseDateString,
    isToday,
    isPastDate,
    isFutureDate,
    getDateRange,
    getCurrentFinancialYear,
    getPreviousFinancialYear,
    getDaysBetween,
    getDaysUntil,
    getRelativeDateString,
    getTimezoneInfo,
    isValidDateString,
    toStandardDateString
};
