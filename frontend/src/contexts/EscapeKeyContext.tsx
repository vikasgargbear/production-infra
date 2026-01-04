import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

/**
 * ESC Key Management Context
 * 
 * Provides enterprise-grade ESC key handling that:
 * - Maintains a stack of ESC handlers
 * - Only calls the most recent (top) handler
 * - Automatically cleans up when components unmount
 * - Prevents event bubbling when handled
 */

interface EscHandler {
    id: number;
    callback: () => void;
    name: string;
}

interface EscapeKeyContextValue {
    registerEscHandler: (callback: () => void, name?: string) => number;
    unregisterEscHandler: (id: number) => void;
    getHandlerCount: () => number;
}

const EscapeKeyContext = createContext<EscapeKeyContextValue | null>(null);

export const useEscapeKey = (): EscapeKeyContextValue => {
    const context = useContext(EscapeKeyContext);
    if (!context) {
        throw new Error('useEscapeKey must be used within EscapeKeyProvider');
    }
    return context;
};

interface EscapeKeyProviderProps {
    children: ReactNode;
}

export const EscapeKeyProvider: React.FC<EscapeKeyProviderProps> = ({ children }) => {
    const [handlers, setHandlers] = useState<EscHandler[]>([]);

    // Global ESC key listener
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
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
    const registerEscHandler = useCallback((callback: () => void, name: string = ''): number => {
        const id = Date.now() + Math.random();
        const handler: EscHandler = { id, callback, name };

        setHandlers(prev => [...prev, handler]);
        return id;
    }, []);

    // Unregister an ESC handler
    const unregisterEscHandler = useCallback((id: number) => {
        setHandlers(prev => prev.filter(h => h.id !== id));
    }, []);

    // Get current handler count (for debugging)
    const getHandlerCount = useCallback(() => handlers.length, [handlers.length]);

    const value: EscapeKeyContextValue = {
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
 */
export const useEscapeHandler = (
    callback: (() => void) | null,
    name: string = '',
    deps: React.DependencyList = []
): void => {
    const { registerEscHandler, unregisterEscHandler } = useEscapeKey();

    useEffect(() => {
        if (!callback) return;

        const handlerId = registerEscHandler(callback, name);

        return () => {
            unregisterEscHandler(handlerId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callback, name, ...deps]);
};

export default EscapeKeyContext;
