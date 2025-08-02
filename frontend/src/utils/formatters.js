/**
 * Utility functions for formatting data
 */

/**
 * Format date to local string
 * @param {string|Date} date - Date to format
 * @param {string} locale - Locale string (default: 'en-IN')
 * @returns {string} Formatted date string
 */
export const formatDate = (date, locale = 'en-IN') => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(date);
  }
};

/**
 * Format currency with Indian Rupee symbol
 * @param {number|string} amount - Amount to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, decimals = 2) => {
  if (amount === null || amount === undefined) return '₹0.00';
  
  try {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '₹0.00';
    
    return `₹${numAmount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  } catch (error) {
    console.error('Error formatting currency:', error);
    return '₹0.00';
  }
};

/**
 * Format phone number
 * @param {string} phone - Phone number to format
 * @returns {string} Formatted phone number
 */
export const formatPhone = (phone) => {
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
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 2) => {
  if (value === null || value === undefined) return '0%';
  
  try {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '0%';
    
    return `${numValue.toFixed(decimals)}%`;
  } catch (error) {
    console.error('Error formatting percentage:', error);
    return '0%';
  }
};

/**
 * Format number with thousand separators
 * @param {number|string} value - Number to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) return '0';
  
  try {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '0';
    
    return numValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } catch (error) {
    console.error('Error formatting number:', error);
    return '0';
  }
};

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format time duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
};

/**
 * Format address
 * @param {Object} address - Address object
 * @returns {string} Formatted address string
 */
export const formatAddress = (address) => {
  if (!address) return '';
  
  const parts = [];
  if (address.address_line1) parts.push(address.address_line1);
  if (address.address_line2) parts.push(address.address_line2);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.pincode || address.postal_code) parts.push(address.pincode || address.postal_code);
  if (address.country) parts.push(address.country);
  
  return parts.join(', ');
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
};

/**
 * Format GST number
 * @param {string} gst - GST number
 * @returns {string} Formatted GST number
 */
export const formatGST = (gst) => {
  if (!gst) return '';
  
  // Remove all non-alphanumeric characters
  const cleaned = gst.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  // GST format: 2 digits + 5 chars + 4 digits + 1 char + 3 chars
  if (cleaned.length === 15) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7, 11)} ${cleaned.slice(11, 12)} ${cleaned.slice(12)}`;
  }
  
  return gst;
};