import { useEscapeHandler } from '../contexts/EscapeKeyContext';

/**
 * Simple hook for ESC key handling
 * 
 * @param onEscape - Function to call when ESC is pressed
 * @param enabled - Whether the handler is enabled (default: true)
 * @param name - Optional name for debugging
 * 
 * @example
 * // Basic usage
 * useEscapeKey(() => setModalOpen(false));
 * 
 * @example
 * // Conditional usage
 * useEscapeKey(() => closeModal(), modalOpen, 'ProductModal');
 */
export const useEscapeKey = (
    onEscape: (() => void) | null,
    enabled: boolean = true,
    name: string = ''
): void => {
    useEscapeHandler(
        enabled ? onEscape : null,
        name,
        [enabled, onEscape]
    );
};

export default useEscapeKey;
