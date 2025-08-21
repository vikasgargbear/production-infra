import { useEscapeHandler } from '../contexts/EscapeKeyContext';

/**
 * Simple hook for ESC key handling
 * 
 * @param {Function} onEscape - Function to call when ESC is pressed
 * @param {boolean} enabled - Whether the handler is enabled (default: true)
 * @param {string} name - Optional name for debugging
 * 
 * @example
 * // Basic usage
 * useEscapeKey(() => setModalOpen(false));
 * 
 * @example
 * // Conditional usage
 * useEscapeKey(() => closeModal(), modalOpen, 'ProductModal');
 * 
 * @example
 * // With dependencies
 * useEscapeKey(() => {
 *   if (hasUnsavedChanges) {
 *     showConfirmDialog();
 *   } else {
 *     closeForm();
 *   }
 * }, isFormOpen, 'InvoiceForm');
 */
export const useEscapeKey = (onEscape, enabled = true, name = '') => {
  useEscapeHandler(
    enabled ? onEscape : null,
    name,
    [enabled]
  );
};

export default useEscapeKey;