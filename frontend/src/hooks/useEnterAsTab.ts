import { useEffect, RefObject } from 'react';

interface UseEnterAsTabOptions {
    containerRef?: RefObject<HTMLElement> | null;
    enabled?: boolean;
    excludeSelectors?: string[];
}

/**
 * Custom hook to enable Enter key to work like Tab
 * Similar to Marg ERP behavior
 */
export const useEnterAsTab = ({
    containerRef = null,
    enabled = true,
    excludeSelectors = ['textarea', '[data-no-enter-tab]']
}: UseEnterAsTabOptions = {}): void => {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent): void => {
            if (e.key !== 'Enter') return;

            const target = e.target as HTMLElement;

            const isExcluded = excludeSelectors.some(selector => {
                try {
                    return target.matches(selector);
                } catch {
                    return false;
                }
            });

            if (isExcluded) return;
            if (e.shiftKey) return;

            const container = containerRef?.current || document.body;
            const focusableElements = container.querySelectorAll(
                'input:not([disabled]):not([readonly]), ' +
                'select:not([disabled]), ' +
                'button:not([disabled]):not([type="submit"]), ' +
                '[tabindex]:not([tabindex="-1"]):not([disabled])'
            );

            const focusableArray = Array.from(focusableElements) as HTMLElement[];
            const currentIndex = focusableArray.indexOf(target);

            if (currentIndex > -1 && currentIndex < focusableArray.length - 1) {
                e.preventDefault();
                focusableArray[currentIndex + 1].focus();

                const nextElement = focusableArray[currentIndex + 1] as HTMLInputElement;
                if (nextElement.tagName === 'INPUT' && nextElement.type === 'text') {
                    nextElement.select();
                }
            }
        };

        const container = containerRef?.current || document;
        container.addEventListener('keydown', handleKeyDown as EventListener);

        return () => {
            container.removeEventListener('keydown', handleKeyDown as EventListener);
        };
    }, [containerRef, enabled, excludeSelectors]);
};

export default useEnterAsTab;
