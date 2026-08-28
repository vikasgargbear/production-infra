import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Keep keyboard focus inside an open dialog and restore its trigger on close. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
    isOpen: boolean,
    initialFocusRef?: RefObject<HTMLElement | null>,
): RefObject<T> {
    const dialogRef = useRef<T>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = () => Array.from(
            dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
        const initialTarget = initialFocusRef?.current || focusable()[0] || dialog;
        initialTarget.focus();

        const trapFocus = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const targets = focusable();
            if (!targets.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = targets[0];
            const last = targets[targets.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        dialog.addEventListener('keydown', trapFocus);

        return () => {
            dialog.removeEventListener('keydown', trapFocus);
            const previous = previousFocusRef.current;
            if (previous?.isConnected) previous.focus();
        };
    }, [initialFocusRef, isOpen]);

    return dialogRef;
}

export default useDialogFocus;
