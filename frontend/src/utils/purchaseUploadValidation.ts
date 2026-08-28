const MAX_PURCHASE_UPLOAD_BYTES = 10 * 1024 * 1024;
const PURCHASE_UPLOAD_MEDIA_TYPE = 'application/pdf';

export interface PurchaseUploadValidationResult {
  valid: boolean;
  error?: string;
}

/** Client preflight only; the backend repeats byte-size and magic-byte checks. */
export function validatePurchasePDF(file: File | null): PurchaseUploadValidationResult {
  if (!file) return { valid: false, error: 'No file selected' };
  if (file.size > MAX_PURCHASE_UPLOAD_BYTES) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }
  if (file.type !== PURCHASE_UPLOAD_MEDIA_TYPE) {
    return { valid: false, error: 'Only PDF files are allowed' };
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'Invalid file extension' };
  }
  return { valid: true };
}
