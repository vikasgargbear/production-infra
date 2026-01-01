import React, { ReactNode } from 'react';
import { Package, FileX, Users, ShoppingCart, Building, FileText, LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type IconType = 'package' | 'file' | 'fileText' | 'users' | 'cart' | 'building';

export interface EmptyStateProps {
    icon?: LucideIcon;
    iconType?: IconType;
    title?: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * EmptyState Component
 * Consistent empty state display across the application
 */
const EmptyState: React.FC<EmptyStateProps> = ({
    icon: CustomIcon,
    iconType = 'package',
    title,
    description,
    action,
    className = ''
}) => {
    // Default icons for common empty states
    const iconMap: Record<IconType, LucideIcon> = {
        package: Package,
        file: FileX,
        fileText: FileText,
        users: Users,
        cart: ShoppingCart,
        building: Building
    };

    // Determine which icon to use
    let IconComponent: LucideIcon = Package;

    if (CustomIcon) {
        IconComponent = CustomIcon;
    } else if (iconType && iconMap[iconType]) {
        IconComponent = iconMap[iconType];
    }

    return (
        <div className={`text-center py-12 ${className}`.trim()}>
            <div className="bg-gray-50 rounded-lg px-6 py-8">
                <div className="w-12 h-12 mx-auto mb-4 text-gray-400">
                    <IconComponent className="w-full h-full" />
                </div>
                <p className="text-gray-600 font-medium">
                    {title || 'No items added yet'}
                </p>
                {description && (
                    <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                        {description}
                    </p>
                )}
                {action && (
                    <div className="mt-6">
                        {action}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmptyState;
