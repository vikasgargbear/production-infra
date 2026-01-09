/**
 * AlertsPanel Component
 * Displays and manages system alerts/notifications
 * Optimized with React.memo
 */

import React, { useCallback } from 'react';
import {
    Bell,
    Package,
    AlertCircle,
    ShoppingCart,
    DollarSign,
    Check,
    Trash2,
    Filter
} from 'lucide-react';
import type { Alert, AlertFilter } from '../types/dashboard.types';

interface AlertsPanelProps {
    alerts: Alert[];
    filter: AlertFilter;
    onFilterChange: (filter: AlertFilter) => void;
    onMarkAsRead: (alertId: number) => void;
    onDelete: (alertId: number) => void;
}

const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
        case 'stock':
            return Package;
        case 'expiry':
            return AlertCircle;
        case 'order':
            return ShoppingCart;
        case 'payment':
            return DollarSign;
        default:
            return Bell;
    }
};

const getAlertColor = (type: Alert['type'], severity: Alert['severity']): string => {
    const colors = {
        stock: { high: 'red', medium: 'orange', low: 'yellow' },
        expiry: { high: 'red', medium: 'orange', low: 'yellow' },
        order: { high: 'green', medium: 'blue', low: 'gray' },
        payment: { high: 'green', medium: 'blue', low: 'gray' }
    };
    return colors[type]?.[severity] || 'gray';
};

const AlertCard = React.memo<{
    alert: Alert;
    onMarkAsRead: (id: number) => void;
    onDelete: (id: number) => void;
}>(({ alert, onMarkAsRead, onDelete }) => {
    const color = getAlertColor(alert.type, alert.severity);
    const IconComponent = getAlertIcon(alert.type);
    const timeAgo = new Date(alert.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    return (
        <div className={`bg-white rounded-lg border border-gray-100 p-4 ${!alert.read ? 'border-l-4 border-l-blue-500' : ''}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg bg-${color}-50`}>
                        <IconComponent className={`w-5 h-5 text-${color}-500`} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{timeAgo}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {!alert.read && (
                        <button
                            onClick={() => onMarkAsRead(alert.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                            title="Mark as read"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={() => onDelete(alert.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
});

AlertCard.displayName = 'AlertCard';

export const AlertsPanel = React.memo<AlertsPanelProps>(({
    alerts,
    filter,
    onFilterChange,
    onMarkAsRead,
    onDelete
}) => {
    const filteredAlerts = alerts
        .filter(alert => filter === 'all' || alert.type === filter)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const unreadCount = alerts.filter(a => !a.read).length;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <Bell className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                        Alerts {unreadCount > 0 && (
                            <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                {unreadCount} new
                            </span>
                        )}
                    </h3>
                </div>

                {/* Filter Dropdown */}
                <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        value={filter}
                        onChange={(e) => onFilterChange(e.target.value as AlertFilter)}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Alerts</option>
                        <option value="stock">Stock</option>
                        <option value="expiry">Expiry</option>
                        <option value="order">Orders</option>
                        <option value="payment">Payments</option>
                    </select>
                </div>
            </div>

            {/* Alerts List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredAlerts.length > 0 ? (
                    filteredAlerts.map(alert => (
                        <AlertCard
                            key={alert.id}
                            alert={alert}
                            onMarkAsRead={onMarkAsRead}
                            onDelete={onDelete}
                        />
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No alerts to display</p>
                    </div>
                )}
            </div>
        </div>
    );
});

AlertsPanel.displayName = 'AlertsPanel';
