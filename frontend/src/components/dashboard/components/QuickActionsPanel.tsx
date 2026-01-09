/**
 * QuickActionsPanel Component
 * FAB (Floating Action Button) with quick action menu
 * Optimized with React.memo
 */

import React, { useCallback } from 'react';
import { ShoppingCart, Truck, Package, CreditCard, Plus, X } from 'lucide-react';
import type { FabAction, PanelType } from '../types/dashboard.types';

const fabActions: FabAction[] = [
    {
        id: 'add-sale',
        label: 'Add Sale',
        icon: ShoppingCart,
        color: 'bg-green-500',
    },
    {
        id: 'create-challan',
        label: 'Create Challan',
        icon: Truck,
        color: 'bg-blue-500',
    },
    {
        id: 'add-purchase',
        label: 'Add Purchase',
        icon: Package,
        color: 'bg-gray-600',
    },
    {
        id: 'add-payment',
        label: 'Add Payment',
        icon: CreditCard,
        color: 'bg-teal-500',
    },
];

interface QuickActionsPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    onActionClick: (panel: PanelType) => void;
}

export const QuickActionsPanel = React.memo<QuickActionsPanelProps>(({
    isOpen,
    onToggle,
    onActionClick
}) => {
    const handleActionClick = useCallback((actionId: string) => {
        onActionClick(actionId as PanelType);
        onToggle(); // Close FAB menu after action
    }, [onActionClick, onToggle]);

    return (
        <>
            {/* FAB Menu Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-20 z-40 transition-opacity"
                    onClick={onToggle}
                />
            )}

            {/* Action Buttons */}
            <div className="fixed bottom-24 right-8 z-50 flex flex-col-reverse items-end space-y-reverse space-y-3">
                {isOpen && fabActions.map((action, index) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={action.id}
                            onClick={() => handleActionClick(action.id)}
                            className={`${action.color} text-white rounded-full p-4 shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center space-x-3 group`}
                            style={{
                                animation: `slideIn 0.2s ease-out ${index * 0.05}s both`
                            }}
                        >
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-medium pr-2">
                                {action.label}
                            </span>
                            <Icon className="w-5 h-5" />
                        </button>
                    );
                })}
            </div>

            {/* Main FAB Button */}
            <button
                onClick={onToggle}
                className={`fixed bottom-8 right-8 z-50 ${isOpen ? 'bg-red-500' : 'bg-blue-600'
                    } text-white rounded-full p-5 shadow-2xl hover:shadow-3xl transform hover:scale-110 transition-all duration-300`}
            >
                {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </button>

            <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </>
    );
});

QuickActionsPanel.displayName = 'QuickActionsPanel';
