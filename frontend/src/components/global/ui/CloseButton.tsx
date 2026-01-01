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
        sm: 'p-1.5 w-7 h-7',
        md: 'p-2 w-9 h-9',
        lg: 'p-2.5 w-10 h-10'
    };

    const iconSizes: Record<ButtonSize, string> = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    };

    return (
        <button
            onClick={onClick}
            className={`
                ${sizeClasses[size]}
                text-gray-400 hover:text-gray-600 
                hover:bg-gray-100 active:bg-gray-200
                rounded-lg transition-all duration-200 
                hover:shadow-sm active:scale-95
                flex items-center justify-center
                focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-50
                ${className}
            `}
            title={showTooltip ? "Close (Esc)" : undefined}
        >
            <X className={`${iconSizes[size]} transition-transform duration-200 hover:rotate-90`} />
        </button>
    );
};

export default CloseButton;
