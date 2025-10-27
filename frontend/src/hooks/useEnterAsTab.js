import { useEffect } from 'react';

/**
 * Custom hook to enable Enter key to work like Tab
 * Similar to Marg ERP behavior
 * 
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.containerRef - Container to scope the behavior
 * @param {boolean} options.enabled - Whether the behavior is enabled
 * @param {Array<string>} options.excludeSelectors - CSS selectors to exclude (e.g., 'textarea')
 */
export const useEnterAsTab = ({ 
  containerRef = null, 
  enabled = true,
  excludeSelectors = ['textarea', '[data-no-enter-tab]']
} = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Only handle Enter key
      if (e.key !== 'Enter') return;

      const target = e.target;

      // Skip if target is excluded
      const isExcluded = excludeSelectors.some(selector => {
        try {
          return target.matches(selector);
        } catch {
          return false;
        }
      });

      if (isExcluded) return;

      // Skip if Shift+Enter (allow new line in textareas if needed)
      if (e.shiftKey) return;

      // Get all focusable elements in scope
      const container = containerRef?.current || document.body;
      const focusableElements = container.querySelectorAll(
        'input:not([disabled]):not([readonly]), ' +
        'select:not([disabled]), ' +
        'button:not([disabled]):not([type="submit"]), ' +
        '[tabindex]:not([tabindex="-1"]):not([disabled])'
      );

      const focusableArray = Array.from(focusableElements);
      const currentIndex = focusableArray.indexOf(target);

      if (currentIndex > -1 && currentIndex < focusableArray.length - 1) {
        e.preventDefault();
        focusableArray[currentIndex + 1].focus();

        // If it's a select or input, select the content for easy editing
        const nextElement = focusableArray[currentIndex + 1];
        if (nextElement.tagName === 'INPUT' && nextElement.type === 'text') {
          nextElement.select();
        }
      }
    };

    const container = containerRef?.current || document;
    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, enabled, excludeSelectors]);
};

export default useEnterAsTab;
