import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * ESC Key Management Context
 * 
 * Provides enterprise-grade ESC key handling that:
 * - Maintains a stack of ESC handlers
 * - Only calls the most recent (top) handler
 * - Automatically cleans up when components unmount
 * - Prevents event bubbling when handled
 * 
 * Usage:
 * const { registerEscHandler, unregisterEscHandler } = useEscapeKey();
 * 
 * useEffect(() => {
 *   const handleId = registerEscHandler(() => {
 *     // Your escape logic here
 *     closeModal();
 *   });
 *   
 *   return () => unregisterEscHandler(handleId);
 * }, []);
 */

const EscapeKeyContext = createContext();

export const useEscapeKey = () => {
  const context = useContext(EscapeKeyContext);
  if (!context) {
    throw new Error('useEscapeKey must be used within EscapeKeyProvider');
  }
  return context;
};

export const EscapeKeyProvider = ({ children }) => {
  const [handlers, setHandlers] = useState([]);
  
  // Global ESC key listener
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        // Get the most recent handler (top of stack)
        if (handlers.length > 0) {
          const topHandler = handlers[handlers.length - 1];
          
          // Prevent default behavior and stop propagation
          event.preventDefault();
          event.stopPropagation();
          
          // Call the handler
          topHandler.callback();
        }
      }
    };

    // Use capture phase to ensure we get the event first
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handlers]);

  // Register a new ESC handler (adds to top of stack)
  const registerEscHandler = useCallback((callback, name = '') => {
    const id = Date.now() + Math.random();
    const handler = { id, callback, name };
    
    setHandlers(prev => [...prev, handler]);
    return id;
  }, []);

  // Unregister an ESC handler
  const unregisterEscHandler = useCallback((id) => {
    setHandlers(prev => {
      const handler = prev.find(h => h.id === id);
      if (handler) {
      }
      return prev.filter(h => h.id !== id);
    });
  }, []);

  // Get current handler count (for debugging)
  const getHandlerCount = useCallback(() => handlers.length, [handlers.length]);

  const value = {
    registerEscHandler,
    unregisterEscHandler,
    getHandlerCount
  };

  return (
    <EscapeKeyContext.Provider value={value}>
      {children}
    </EscapeKeyContext.Provider>
  );
};

/**
 * Custom hook for easier ESC key handling
 * Automatically registers and unregisters the handler
 * 
 * @param {Function} callback - Function to call when ESC is pressed
 * @param {string} name - Optional name for debugging
 * @param {Array} deps - Dependencies array (like useEffect)
 */
export const useEscapeHandler = (callback, name = '', deps = []) => {
  const { registerEscHandler, unregisterEscHandler } = useEscapeKey();

  useEffect(() => {
    if (!callback) return;
    
    const handlerId = registerEscHandler(callback, name);
    
    return () => {
      unregisterEscHandler(handlerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, name, ...deps]); // Removed registerEscHandler and unregisterEscHandler from deps
};

export default EscapeKeyContext;