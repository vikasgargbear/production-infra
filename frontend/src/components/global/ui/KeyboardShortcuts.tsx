import React from 'react';
import { Keyboard } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type ShortcutVariant = 'default' | 'compact' | 'expanded' | 'dark';

export interface Shortcut {
    key: string;
    action: string;
}

export interface KeyboardShortcutsProps {
    shortcuts?: Shortcut[];
    variant?: ShortcutVariant;
    showIcon?: boolean;
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * KeyboardShortcuts - Global component for consistent keyboard shortcuts bar
 * Ensures uniform appearance and behavior across all modules
 */
const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
    shortcuts = [],
    variant = 'default',
    showIcon = false,
    className = ''
}) => {
    const defaultShortcuts: Shortcut[] = shortcuts.length > 0 ? shortcuts : [
        { key: 'Esc', action: 'Close' }
    ];

    const variantClasses: Record<ShortcutVariant, string> = {
        default: 'bg-blue-50 text-blue-700 border-b border-blue-200',
        compact: 'bg-gray-50 text-gray-600 border-b border-gray-200',
        expanded: 'bg-white text-gray-700 border-b border-gray-200',
        dark: 'bg-gray-100 text-gray-700 border-b border-gray-200'
    };

    return (
        <div className={`px-4 py-2 text-xs ${variantClasses[variant]} ${className}`}>
            <div className="flex items-center gap-2">
                {showIcon && (
                    <Keyboard className="w-3 h-3 opacity-60" />
                )}
                <span className="font-medium">Keyboard shortcuts:</span>
                <div className="flex items-center gap-2">
                    {defaultShortcuts.map((shortcut, index) => (
                        <span key={index} className="inline-flex items-center gap-1">
                            {index > 0 && <span className="opacity-40">|</span>}
                            <kbd className="px-1.5 py-0.5 bg-white/60 rounded text-[10px] font-mono font-semibold border border-gray-300/50">
                                {shortcut.key}
                            </kbd>
                            <span className="opacity-75">- {shortcut.action}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Predefined shortcut sets for common use cases
export const SHORTCUT_SETS: Record<string, Shortcut[]> = {
    CREATE: [
        { key: 'Ctrl+N', action: 'Add Customer' },
        { key: 'Ctrl+F', action: 'Search Products' },
        { key: 'Ctrl+S', action: 'Proceed to Review' },
        { key: 'Esc', action: 'Close' }
    ],
    REVIEW: [
        { key: 'Ctrl+S', action: 'Save' },
        { key: 'Ctrl+P', action: 'Print' },
        { key: 'Esc', action: 'Back' }
    ],
    LIST: [
        { key: 'Ctrl+N', action: 'New' },
        { key: 'Ctrl+F', action: 'Search' },
        { key: 'Ctrl+E', action: 'Export' },
        { key: 'Esc', action: 'Close' }
    ],
    PURCHASE: [
        { key: 'Ctrl+N', action: 'Add Supplier' },
        { key: 'Ctrl+F', action: 'Search Products' },
        { key: 'Ctrl+U', action: 'Upload PDF' },
        { key: 'Ctrl+G', action: 'GST Calculator' },
        { key: 'Ctrl+S', action: 'Save' },
        { key: 'Esc', action: 'Close' }
    ],
    RETURNS: [
        { key: 'Ctrl+R', action: 'Search Party' },
        { key: 'Ctrl+I', action: 'Search Document' },
        { key: 'Ctrl+S', action: 'Proceed' },
        { key: 'Esc', action: 'Close' }
    ]
};

export default KeyboardShortcuts;
