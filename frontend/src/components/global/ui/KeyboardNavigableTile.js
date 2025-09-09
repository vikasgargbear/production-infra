import React, { useRef, useEffect } from 'react';

/**
 * KeyboardNavigableTile Component
 * Ensures proper keyboard navigation within a tile/section
 * Tab key moves through all inputs in the tile before moving to next tile
 */
const KeyboardNavigableTile = ({ 
  children, 
  className = '',
  tileIndex = 0,
  onComplete,
  autoFocus = false
}) => {
  const tileRef = useRef(null);
  
  useEffect(() => {
    if (!tileRef.current) return;
    
    const tile = tileRef.current;
    const focusableElements = tile.querySelectorAll(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    
    if (focusableElements.length === 0) return;
    
    // Auto-focus first element if needed
    if (autoFocus && focusableElements[0]) {
      focusableElements[0].focus();
    }
    
    // Set tabindex based on tile order
    focusableElements.forEach((element, index) => {
      // Calculate tab index: (tileIndex * 100) + elementIndex
      // This ensures all elements in tile 1 come before tile 2
      element.setAttribute('tabindex', (tileIndex * 100) + index + 1);
    });
    
    // Handle Tab key navigation
    const handleKeyDown = (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        const currentElement = document.activeElement;
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // If we're on the last element and Tab is pressed
        if (currentElement === lastElement && onComplete) {
          // Let parent know this tile is complete
          setTimeout(() => onComplete(tileIndex), 0);
        }
      }
      
      // Handle Enter key to move to next field within tile
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        const currentElement = document.activeElement;
        const currentIndex = Array.from(focusableElements).indexOf(currentElement);
        
        if (currentIndex >= 0 && currentIndex < focusableElements.length - 1) {
          focusableElements[currentIndex + 1].focus();
        } else if (currentIndex === focusableElements.length - 1 && onComplete) {
          // Move to next tile
          onComplete(tileIndex);
        }
      }
    };
    
    tile.addEventListener('keydown', handleKeyDown);
    
    return () => {
      tile.removeEventListener('keydown', handleKeyDown);
    };
  }, [tileIndex, autoFocus, onComplete]);
  
  return (
    <div ref={tileRef} className={className}>
      {children}
    </div>
  );
};

/**
 * KeyboardNavigableForm Component
 * Manages keyboard navigation across multiple tiles
 */
export const KeyboardNavigableForm = ({ children, className = '' }) => {
  const formRef = useRef(null);
  const [currentTile, setCurrentTile] = React.useState(0);
  
  const handleTileComplete = (tileIndex) => {
    // Move focus to next tile
    const nextTileIndex = tileIndex + 1;
    setCurrentTile(nextTileIndex);
    
    // Find first focusable element in next tile
    if (formRef.current) {
      const nextTile = formRef.current.querySelector(`[data-tile-index="${nextTileIndex}"]`);
      if (nextTile) {
        const firstInput = nextTile.querySelector(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        }
      }
    }
  };
  
  // Clone children and add tile navigation props
  const enhancedChildren = React.Children.map(children, (child, index) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        'data-tile-index': index,
        tileIndex: index,
        onComplete: handleTileComplete,
        autoFocus: index === 0
      });
    }
    return child;
  });
  
  return (
    <div ref={formRef} className={className}>
      {enhancedChildren}
    </div>
  );
};

/**
 * Hook for keyboard shortcuts
 */
export const useKeyboardShortcuts = (shortcuts = {}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl/Cmd combinations
      const modifier = e.ctrlKey || e.metaKey;
      
      Object.entries(shortcuts).forEach(([key, handler]) => {
        const [modifierKey, actionKey] = key.split('+');
        
        if (modifierKey === 'ctrl' && modifier && e.key.toLowerCase() === actionKey.toLowerCase()) {
          e.preventDefault();
          handler();
        } else if (!key.includes('+') && e.key.toLowerCase() === key.toLowerCase()) {
          // Single key shortcuts (only when not in input field)
          const tagName = document.activeElement.tagName;
          if (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT') {
            handler();
          }
        }
      });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

export default KeyboardNavigableTile;