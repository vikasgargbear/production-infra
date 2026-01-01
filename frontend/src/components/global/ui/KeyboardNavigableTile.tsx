import React, { useRef, useEffect, ReactNode, ReactElement } from 'react';

// ==================== TYPE DEFINITIONS ====================

export interface KeyboardNavigableTileProps {
    children: ReactNode;
    className?: string;
    tileIndex?: number;
    onComplete?: (tileIndex: number) => void;
    autoFocus?: boolean;
    'data-tile-index'?: number;
}

export interface KeyboardNavigableFormProps {
    children: ReactNode;
    className?: string;
}

type ShortcutHandler = () => void;

export interface ShortcutMap {
    [key: string]: ShortcutHandler;
}

// ==================== COMPONENTS ====================

/**
 * KeyboardNavigableTile Component
 * Ensures proper keyboard navigation within a tile/section
 * Tab key moves through all inputs in the tile before moving to next tile
 */
const KeyboardNavigableTile: React.FC<KeyboardNavigableTileProps> = ({
    children,
    className = '',
    tileIndex = 0,
    onComplete,
    autoFocus = false
}) => {
    const tileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tileRef.current) return;

        const tile = tileRef.current;
        const focusableElements = tile.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );

        if (focusableElements.length === 0) return;

        if (autoFocus && focusableElements[0]) {
            focusableElements[0].focus();
        }

        focusableElements.forEach((element, index) => {
            element.setAttribute('tabindex', String((tileIndex * 100) + index + 1));
        });

        const handleKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Tab' && !e.shiftKey) {
                const currentElement = document.activeElement;
                const lastElement = focusableElements[focusableElements.length - 1];

                if (currentElement === lastElement && onComplete) {
                    setTimeout(() => onComplete(tileIndex), 0);
                }
            }

            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                e.preventDefault();
                const currentElement = document.activeElement;
                const currentIndex = Array.from(focusableElements).indexOf(currentElement as HTMLElement);

                if (currentIndex >= 0 && currentIndex < focusableElements.length - 1) {
                    focusableElements[currentIndex + 1].focus();
                } else if (currentIndex === focusableElements.length - 1 && onComplete) {
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
export const KeyboardNavigableForm: React.FC<KeyboardNavigableFormProps> = ({ children, className = '' }) => {
    const formRef = useRef<HTMLDivElement>(null);
    const [, setCurrentTile] = React.useState<number>(0);

    const handleTileComplete = (tileIndex: number): void => {
        const nextTileIndex = tileIndex + 1;
        setCurrentTile(nextTileIndex);

        if (formRef.current) {
            const nextTile = formRef.current.querySelector(`[data-tile-index="${nextTileIndex}"]`);
            if (nextTile) {
                const firstInput = nextTile.querySelector<HTMLElement>(
                    'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
                );
                if (firstInput) {
                    firstInput.focus();
                }
            }
        }
    };

    const enhancedChildren = React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child as ReactElement<KeyboardNavigableTileProps>, {
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
export const useKeyboardShortcuts = (shortcuts: ShortcutMap = {}): void => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent): void => {
            const modifier = e.ctrlKey || e.metaKey;

            Object.entries(shortcuts).forEach(([key, handler]) => {
                const [modifierKey, actionKey] = key.split('+');

                if (modifierKey === 'ctrl' && modifier && e.key.toLowerCase() === actionKey?.toLowerCase()) {
                    e.preventDefault();
                    handler();
                } else if (!key.includes('+') && e.key.toLowerCase() === key.toLowerCase()) {
                    const tagName = (document.activeElement as HTMLElement)?.tagName;
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
