/**
 * Universal Keyboard Navigation Hook
 * 
 * Provides consistent keyboard shortcuts across all forms:
 * - Enter: Move to next field or submit
 * - Tab: Natural focus flow
 * - Shift+Tab: Reverse focus
 * - Escape: Close modal/clear
 * - Arrow Up/Down: Navigate dropdowns
 */

import { useEffect, useCallback, useRef } from 'react';

export interface KeyboardNavigationField {
  id: string;
  ref: React.RefObject<any>;
  type: 'input' | 'select' | 'dropdown' | 'button';
  onEnter?: () => void;
  skipOnEnter?: boolean; // Skip this field when pressing Enter
}

export interface UseKeyboardNavigationOptions {
  fields: KeyboardNavigationField[];
  onSubmit?: () => void;
  submitOnLastField?: boolean;
  enabled?: boolean;
}

export function useKeyboardNavigation({
  fields,
  onSubmit,
  submitOnLastField = true,
  enabled = true
}: UseKeyboardNavigationOptions) {
  const currentIndexRef = useRef(0);

  const focusField = useCallback((index: number) => {
    if (index >= 0 && index < fields.length) {
      const field = fields[index];
      if (field.ref.current) {
        // Focus based on field type
        if (field.type === 'dropdown' && field.ref.current.focus) {
          field.ref.current.focus();
        } else if (field.ref.current.focus) {
          field.ref.current.focus();
        } else if (field.ref.current.querySelector) {
          const input = field.ref.current.querySelector('input, select, button');
          input?.focus();
        }
        currentIndexRef.current = index;
      }
    }
  }, [fields]);

  const moveToNext = useCallback(() => {
    let nextIndex = currentIndexRef.current + 1;
    
    // Skip fields that should not receive Enter focus
    while (nextIndex < fields.length && fields[nextIndex].skipOnEnter) {
      nextIndex++;
    }

    if (nextIndex < fields.length) {
      focusField(nextIndex);
    } else if (submitOnLastField && onSubmit) {
      // At last field, submit
      onSubmit();
    }
  }, [fields, focusField, submitOnLastField, onSubmit]);

  const moveToPrevious = useCallback(() => {
    let prevIndex = currentIndexRef.current - 1;
    
    // Skip fields that should not receive focus
    while (prevIndex >= 0 && fields[prevIndex].skipOnEnter) {
      prevIndex--;
    }

    if (prevIndex >= 0) {
      focusField(prevIndex);
    }
  }, [fields, focusField]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    
    // Find current field index
    const currentField = fields.find(f => 
      f.ref.current === target || 
      f.ref.current?.contains(target)
    );
    
    if (currentField) {
      const currentIndex = fields.indexOf(currentField);
      currentIndexRef.current = currentIndex;

      // Handle Enter key
      if (e.key === 'Enter') {
        // Don't interfere with textarea
        if (tagName === 'textarea') return;

        // Don't interfere with button clicks
        if (tagName === 'button') return;

        e.preventDefault();

        // Call field-specific onEnter if defined
        if (currentField.onEnter) {
          currentField.onEnter();
        } else {
          moveToNext();
        }
      }

      // Handle Shift+Tab (reverse)
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        moveToPrevious();
      }

      // Handle Tab (forward) - let browser handle naturally
      // Just update our tracking
      if (e.key === 'Tab' && !e.shiftKey) {
        // Let Tab work naturally, just track it
        setTimeout(() => {
          const activeElement = document.activeElement;
          const activeField = fields.find(f =>
            f.ref.current === activeElement ||
            f.ref.current?.contains(activeElement)
          );
          if (activeField) {
            currentIndexRef.current = fields.indexOf(activeField);
          }
        }, 0);
      }
    }
  }, [enabled, fields, moveToNext, moveToPrevious]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);

  return {
    focusField,
    moveToNext,
    moveToPrevious,
    currentIndex: currentIndexRef.current
  };
}

/**
 * Helper hook for simple linear forms
 * Automatically creates field refs and manages navigation
 */
export function useFormKeyboardNav(fieldCount: number, onSubmit?: () => void) {
  const fieldRefs = useRef<Array<React.RefObject<any>>>([]);

  // Initialize refs
  if (fieldRefs.current.length !== fieldCount) {
    fieldRefs.current = Array(fieldCount)
      .fill(null)
      .map(() => ({ current: null }));
  }

  const fields: KeyboardNavigationField[] = fieldRefs.current.map((ref, index) => ({
    id: `field-${index}`,
    ref,
    type: 'input' as const
  }));

  const navigation = useKeyboardNavigation({
    fields,
    onSubmit,
    submitOnLastField: true
  });

  return {
    fieldRefs: fieldRefs.current,
    ...navigation
  };
}
