/**
 * Dashboard Calculation Utilities
 * Business logic and data transformations for dashboard
 */

import type { DashboardOrder, OrderSort, Alert, AlertFilter, DashboardStats } from '../types/dashboard.types';

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
    if (amount >= 1000000) {
        return `₹${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
        return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toFixed(0)}`;
}

/**
 * Get chart colors from theme
 */
export function getChartColors(): string[] {
    // These could come from a theme API or user preferences
    return ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
}

/**
 * Get random color for charts
 */
export function getRandomColor(): string {
    const colors = getChartColors();
    return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================================================
// Filtering & Sorting Utilities
// ============================================================================

/**
 * Filter orders by status and search query
 */
export function filterOrders(
    orders: DashboardOrder[],
    filter: string,
    searchQuery: string
): DashboardOrder[] {
    return orders
        .filter(order => {
            if (filter === 'all') return true;
            return order.status.toLowerCase() === filter;
        })
        .filter(order => {
            if (!searchQuery) return true;
            return (
                order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.id.toLowerCase().includes(searchQuery.toLowerCase())
            );
        });
}

/**
 * Sort orders by field and direction
 */
export function sortOrders(
    orders: DashboardOrder[],
    sort: OrderSort
): DashboardOrder[] {
    return [...orders].sort((a, b) => {
        if (sort.field === 'date') {
            return sort.direction === 'desc'
                ? new Date(b.date).getTime() - new Date(a.date).getTime()
                : new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (sort.field === 'amount') {
            return sort.direction === 'desc'
                ? b.amount - a.amount
                : a.amount - b.amount;
        }
        return 0;
    });
}

/**
 * Filter alerts by type
 */
export function filterAlerts(
    alerts: Alert[],
    filter: AlertFilter
): Alert[] {
    return alerts
        .filter(alert => {
            if (filter === 'all') return true;
            return alert.type === filter;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ============================================================================
// Alert Utilities
// ============================================================================

/**
 * Get icon component for alert type
 */
export function getAlertIconName(type: Alert['type']): string {
    switch (type) {
        case 'stock':
            return 'Package';
        case 'expiry':
            return 'AlertCircle';
        case 'order':
            return 'ShoppingCart';
        case 'payment':
            return 'DollarSign';
        default:
            return 'Bell';
    }
}

/**
 * Get color for alert based on type and severity
 */
export function getAlertColor(
    type: Alert['type'],
    severity: Alert['severity']
): string {
    const colors = {
        stock: {
            high: 'red',
            medium: 'orange',
            low: 'yellow'
        },
        expiry: {
            high: 'red',
            medium: 'orange',
            low: 'yellow'
        },
        order: {
            high: 'green',
            medium: 'blue',
            low: 'gray'
        },
        payment: {
            high: 'green',
            medium: 'blue',
            low: 'gray'
        }
    };
    return colors[type]?.[severity] || 'gray';
}

// ============================================================================
// Stats Calculations
// ============================================================================

/**
 * Calculate average order value from orders
 */
export function calculateAverageOrderValue(orders: DashboardOrder[]): number {
    if (orders.length === 0) return 0;
    const total = orders.reduce((sum, order) => sum + order.amount, 0);
    return total / orders.length;
}

/**
 * Calculate daily sales from orders
 */
export function calculateDailySales(orders: DashboardOrder[]): number {
    const today = new Date().toDateString();
    return orders
        .filter(order => new Date(order.date).toDateString() === today)
        .reduce((sum, order) => sum + order.amount, 0);
}
