import React from 'react';
import { X } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type ButtonSize = 'sm' | 'md' | 'lg';

export interface CloseButtonProps {
    onClick: () => void;
    className?: string;
    size?: ButtonSize;
    showTooltip?: boolean;
}

// ==================== COMPONENT ====================

/**
 * CloseButton - A consistent close button component with improved UX
 * 
 * Features:
 * - Hover animations
 * - Better visual feedback
 * - Consistent styling
 * - Keyboard accessibility
 */
const CloseButton: React.FC<CloseButtonProps> = ({
    onClick,
    className = '',
    size = 'md',
    showTooltip = true
}) => {
    const sizeClasses: Record<ButtonSize, string> = {
        sm: 'min-h-11 min-w-11 p-2',
        md: 'min-h-11 min-w-11 p-2',
        lg: 'min-h-12 min-w-12 p-2.5'
    };

    const iconSizes: Record<ButtonSize, string> = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={`
                ${sizeClasses[size]}
                text-gray-400 hover:text-gray-600 
                hover:bg-gray-100 active:bg-gray-200
                rounded-md transition-colors duration-150
                flex items-center justify-center
                focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-50
                ${className}
            `}
            title={showTooltip ? "Close (Esc)" : undefined}
            aria-label="Close"
        >
            <X className={iconSizes[size]} />
        </button>
    );
};

export default CloseButton;
