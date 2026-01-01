/**
 * Utility functions for formatting data
 */

/**
 * Format date to local string
 * @param date - Date to format
 * @param locale - Locale string (default: 'en-IN')
 * @returns Formatted date string
 */
export const formatDate = (date: string | Date | null | undefined, locale: string = 'en-IN'): string => {
    if (!date) return '';

    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return String(date);
    }
};

/**
 * Format currency with Indian Rupee symbol
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number | string | null | undefined, decimals: number = 2): string => {
    if (amount === null || amount === undefined) return '₹0.00';

    try {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return '₹0.00';

        return `₹${numAmount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    } catch {
        return '₹0.00';
    }
};

/**
 * Format phone number
 * @param phone - Phone number to format
 * @returns Formatted phone number
 */
export const formatPhone = (phone: string | null | undefined): string => {
    if (!phone) return '';

    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Indian phone number format
    if (cleaned.length === 10) {
        return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return `+91 ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }

    return phone;
};

/**
 * Format percentage
 * @param value - Value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: number | string | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined) return '0%';

    try {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) return '0%';

        return `${numValue.toFixed(decimals)}%`;
    } catch {
        return '0%';
    }
};

/**
 * Format number with thousand separators
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 */
export const formatNumber = (value: number | string | null | undefined, decimals: number = 0): string => {
    if (value === null || value === undefined) return '0';

    try {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) return '0';

        return numValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    } catch {
        return '0';
    }
};

/**
 * Format file size
 * @param bytes - Size in bytes
 * @returns Formatted file size
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format time duration
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds || seconds === 0) return '0s';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(' ');
};

interface AddressObject {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    postal_code?: string;
    country?: string;
}

/**
 * Format address
 * @param address - Address object
 * @returns Formatted address string
 */
export const formatAddress = (address: AddressObject | null | undefined): string => {
    if (!address) return '';

    const parts: string[] = [];
    if (address.address_line1) parts.push(address.address_line1);
    if (address.address_line2) parts.push(address.address_line2);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.pincode || address.postal_code) parts.push(address.pincode || address.postal_code || '');
    if (address.country) parts.push(address.country);

    return parts.join(', ');
};

/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated text
 */
export const truncateText = (text: string | null | undefined, maxLength: number = 50): string => {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
};

/**
 * Format GST number
 * @param gst - GST number
 * @returns Formatted GST number
 */
export const formatGST = (gst: string | null | undefined): string => {
    if (!gst) return '';

    // Remove all non-alphanumeric characters
    const cleaned = gst.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // GST format: 2 digits + 5 chars + 4 digits + 1 char + 3 chars
    if (cleaned.length === 15) {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7, 11)} ${cleaned.slice(11, 12)} ${cleaned.slice(12)}`;
    }

    return gst;
};

/**
 * Convert number to words (Indian Rupees format)
 * @param num - Number to convert
 * @returns Amount in words
 */
export const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const convertHundreds = (n: number): string => {
        let str = '';
        if (n > 99) {
            str += ones[Math.floor(n / 100)] + ' Hundred ';
            n %= 100;
        }
        if (n > 19) {
            str += tens[Math.floor(n / 10)] + ' ';
            n %= 10;
        } else if (n >= 10) {
            str += teens[n - 10] + ' ';
            return str;
        }
        if (n > 0) {
            str += ones[n] + ' ';
        }
        return str;
    };

    const convertToWords = (n: number): string => {
        if (n === 0) return 'Zero';

        let str = '';

        // Handle crores
        if (n >= 10000000) {
            str += convertHundreds(Math.floor(n / 10000000)) + 'Crore ';
            n %= 10000000;
        }

        // Handle lakhs
        if (n >= 100000) {
            str += convertHundreds(Math.floor(n / 100000)) + 'Lakh ';
            n %= 100000;
        }

        // Handle thousands
        if (n >= 1000) {
            str += convertHundreds(Math.floor(n / 1000)) + 'Thousand ';
            n %= 1000;
        }

        // Handle hundreds
        if (n > 0) {
            str += convertHundreds(n);
        }

        return str.trim();
    };

    const amount = Math.floor(num);
    const paise = Math.round((num - amount) * 100);

    let words = convertToWords(amount) + ' Rupees';
    if (paise > 0) {
        words += ' and ' + convertToWords(paise) + ' Paise';
    }
    words += ' Only';

    return words;
};
