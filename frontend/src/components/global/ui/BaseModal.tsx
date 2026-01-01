import React, { ReactNode } from 'react';
import { X, LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type IconColor = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'emerald';

export interface BaseModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    iconColor?: IconColor;
    children: ReactNode;
    footerActions?: ReactNode;
    width?: string;
}

// ==================== COMPONENT ====================

const BaseModal: React.FC<BaseModalProps> = ({
    open,
    onClose,
    title,
    subtitle,
    icon: Icon,
    iconColor = 'blue',
    children,
    footerActions,
    width = 'max-w-4xl'
}) => {
    if (!open) return null;

    const iconColorClasses: Record<IconColor, string> = {
        blue: 'from-blue-600 to-blue-700',
        green: 'from-green-600 to-green-700',
        purple: 'from-purple-600 to-purple-700',
        amber: 'from-amber-600 to-amber-700',
        red: 'from-red-600 to-red-700',
        emerald: 'from-emerald-600 to-emerald-700'
    };

    return (
        <div className="fixed inset-0 bg-gray-100 z-50 flex flex-col">
            {/* Header */}
            <div className={`bg-gradient-to-r ${iconColorClasses[iconColor]} p-6 text-white flex-shrink-0`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        {Icon && (
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                                <Icon className="w-6 h-6" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold">{title}</h2>
                            {subtitle && (
                                <p className="text-white/80 mt-1">{subtitle}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className={`mx-auto ${width} space-y-6`}>
                    {children}
                </div>
            </div>

            {/* Footer */}
            {footerActions && (
                <div className="border-t p-6 bg-white flex-shrink-0">
                    <div className={`mx-auto ${width} flex items-center justify-between`}>
                        {footerActions}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BaseModal;
