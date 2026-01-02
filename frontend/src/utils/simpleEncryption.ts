/**
 * Simple Encryption Utility
 * Basic encryption for localStorage data (fallback without crypto-js)
 * Note: This is basic encoding, not cryptographically secure
 * For production, install crypto-js and use proper encryption
 */

/**
 * Simple encode function (Base64 + simple transformation)
 * @param text - Text to encode
 * @param key - Encoding key
 * @returns Encoded text
 */
export const simpleEncode = (text: string, key: string = 'default-key'): string => {
    try {
        // Convert to base64 first
        const base64 = btoa(text);

        // Simple character shifting based on key
        const keyCode = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const shift = keyCode % 26;

        // Apply simple character transformation
        const encoded = base64.split('').map(char => {
            const code = char.charCodeAt(0);
            if (code >= 65 && code <= 90) { // A-Z
                return String.fromCharCode(((code - 65 + shift) % 26) + 65);
            } else if (code >= 97 && code <= 122) { // a-z
                return String.fromCharCode(((code - 97 + shift) % 26) + 97);
            }
            return char;
        }).join('');

        return encoded;
    } catch (error) {
        return text; // Fallback to plain text
    }
};

/**
 * Simple decode function
 * @param encodedText - Text to decode
 * @param key - Decoding key
 * @returns Decoded text
 */
export const simpleDecode = (encodedText: string, key: string = 'default-key'): string => {
    try {
        // Calculate reverse shift
        const keyCode = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const shift = keyCode % 26;
        const reverseShift = 26 - shift;

        // Reverse character transformation
        const base64 = encodedText.split('').map(char => {
            const code = char.charCodeAt(0);
            if (code >= 65 && code <= 90) { // A-Z
                return String.fromCharCode(((code - 65 + reverseShift) % 26) + 65);
            } else if (code >= 97 && code <= 122) { // a-z
                return String.fromCharCode(((code - 97 + reverseShift) % 26) + 97);
            }
            return char;
        }).join('');

        // Decode from base64
        const decoded = atob(base64);
        return decoded;
    } catch (error) {
        return encodedText; // Fallback to encoded text
    }
};

/**
 * Generate a simple key from user agent and timestamp
 * @returns Generated key
 */
export const generateSimpleKey = (): string => {
    const userAgent = navigator.userAgent || 'default';
    const timestamp = Date.now().toString();
    return btoa(userAgent + timestamp).substring(0, 16);
};

export default {
    encode: simpleEncode,
    decode: simpleDecode,
    generateKey: generateSimpleKey
};
