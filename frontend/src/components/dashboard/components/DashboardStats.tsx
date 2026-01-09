/**
 * DashboardStats Component
 * Displays 4-8 key stat cards in a grid
 * Optimized with React.memo for performance
 */

import React from 'react';
import {
    DollarSign,
    ShoppingCart,
    Package,
    Users,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CreditCard,
    ArrowUpRight
} from 'lucide-react';
import type { DashboardStats as DashboardStatsType, StatCardProps } from '../types/dashboard.types';

// ============================================================================
// StatCard Component
// ============================================================================

const StatCard = React.memo<StatCardProps>(({
    title,
    value,
    icon: Icon,
    gradient,
    trend,
    trendValue,
    bgGradient
}) => (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgGradient} border border-white/20 shadow-xl shadow-gray-200/30 p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group`}>
        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-10 rounded-full transform translate-x-16 -translate-y-16`}></div>

        <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-gray-300/30`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
                {trend && trendValue && (
                    <div className="flex items-center space-x-1">
                        <ArrowUpRight className={`w-4 h-4 ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`} />
                        <span className={`text-sm font-semibold ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                            {trendValue}%
                        </span>
                    </div>
                )}
            </div>

            <div>
                <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
            </div>
        </div>
    </div>
));

StatCard.displayName = 'StatCard';

// ============================================================================
// DashboardStats Component
// ============================================================================

interface DashboardStatsProps {
    data: DashboardStatsType | undefined;
    loading?: boolean;
}

export const DashboardStats = React.memo<DashboardStatsProps>(({ data, loading }) => {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (!data) {
        return null;
    }

    const formatCurrency = (amount: number) => {
        if (amount >= 1000000) {
            return `₹${(amount / 1000000).toFixed(1)}M`;
        } else if (amount >= 1000) {
            return `₹${(amount / 1000).toFixed(1)}K`;
        }
        return `₹${amount.toFixed(0)}`;
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
                title="Total Revenue"
                value={formatCurrency(data.totalRevenue)}
                icon={DollarSign}
                gradient="from-blue-500 to-blue-600"
                bgGradient="from-blue-50 to-white"
                trend="up"
                trendValue="12"
            />
            <StatCard
                title="Total Orders"
                value={data.totalOrders}
                icon={ShoppingCart}
                gradient="from-green-500 to-green-600"
                bgGradient="from-green-50 to-white"
                trend="up"
                trendValue="8"
            />
            <StatCard
                title="Products"
                value={data.totalProducts}
                icon={Package}
                gradient="from-purple-500 to-purple-600"
                bgGradient="from-purple-50 to-white"
            />
            <StatCard
                title="Customers"
                value={data.totalCustomers}
                icon={Users}
                gradient="from-orange-500 to-orange-600"
                bgGradient="from-orange-50 to-white"
                trend="up"
                trendValue="5"
            />

            {/* Second row - conditional */}
            {data.lowStockItems > 0 && (
                <StatCard
                    title="Low Stock Items"
                    value={data.lowStockItems}
                    icon={AlertCircle}
                    gradient="from-red-500 to-red-600"
                    bgGradient="from-red-50 to-white"
                    trend="down"
                    trendValue="3"
                />
            )}
            {data.pendingPayments > 0 && (
                <StatCard
                    title="Pending Payments"
                    value={formatCurrency(data.pendingPayments)}
                    icon={CreditCard}
                    gradient="from-yellow-500 to-yellow-600"
                    bgGradient="from-yellow-50 to-white"
                />
            )}
        </div>
    );
});

DashboardStats.displayName = 'DashboardStats';
