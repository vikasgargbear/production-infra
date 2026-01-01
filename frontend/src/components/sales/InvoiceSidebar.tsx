import React, { useState } from 'react';
import {
    FileText,
    Plus,
    List,
    Clock,
    Package,
    Users,
    Settings,
    HelpCircle,
    ChevronRight,
    Activity,
    BarChart3,
    LucideIcon
} from 'lucide-react';

interface MenuItem {
    id: string;
    label: string;
    icon: LucideIcon;
    badge: string | null;
    badgeColor?: string;
    description: string;
}

interface QuickStat {
    label: string;
    value: string;
    trend: string;
    color: 'green' | 'orange';
}

interface InvoiceSidebarProps {
    activeItem?: string;
    onItemClick: (itemId: string) => void;
    className?: string;
}

/**
 * InvoiceSidebar - Modern pharma-themed sidebar for Invoice module
 * Clean, professional design optimized for medical/pharma industry
 */
const InvoiceSidebar: React.FC<InvoiceSidebarProps> = ({ activeItem = 'create', onItemClick, className = '' }) => {
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

    const menuItems: MenuItem[] = [
        {
            id: 'create',
            label: 'New Invoice',
            icon: Plus,
            badge: null,
            description: 'Create a new invoice'
        },
        {
            id: 'list',
            label: 'All Invoices',
            icon: List,
            badge: '124',
            description: 'View and manage invoices'
        },
        {
            id: 'pending',
            label: 'Pending',
            icon: Clock,
            badge: '8',
            badgeColor: 'orange',
            description: 'Pending payments'
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: BarChart3,
            badge: null,
            description: 'Sales analytics'
        },
        {
            id: 'customers',
            label: 'Customers',
            icon: Users,
            badge: null,
            description: 'Manage customers'
        },
        {
            id: 'products',
            label: 'Products',
            icon: Package,
            badge: null,
            description: 'Product catalog'
        }
    ];

    const quickStats: QuickStat[] = [
        { label: 'Today', value: '₹24,560', trend: '+12%', color: 'green' },
        { label: 'This Month', value: '₹3.2L', trend: '+8%', color: 'green' },
        { label: 'Pending', value: '₹45,000', trend: '8 invoices', color: 'orange' }
    ];

    return (
        <div className={`h-full bg-gradient-to-b from-blue-50 to-green-50 p-3 ${className}`}>
            <div className="h-full bg-white rounded-2xl shadow-lg border border-blue-100 flex flex-col">

                {/* Header */}
                <div className="p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-xl flex items-center justify-center">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800">Invoice Hub</h3>
                            <p className="text-xs text-gray-500">Sales Management</p>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-green-50">
                    <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Quick Stats</h4>
                    <div className="space-y-2">
                        {quickStats.map((stat, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">{stat.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">{stat.value}</span>
                                    <span className={`text-xs ${stat.color === 'green' ? 'text-green-600' : 'text-orange-600'}`}>
                                        {stat.trend}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Menu Items */}
                <div className="flex-1 overflow-y-auto py-2">
                    <nav className="px-3">
                        {menuItems.map((item) => {
                            const isActive = activeItem === item.id;
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onItemClick(item.id)}
                                    className={`
                    w-full mb-1 px-3 py-2.5 rounded-xl flex items-center justify-between
                    transition-all duration-200 group
                    ${isActive
                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                                            : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'
                                        }
                  `}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-500'}`} />
                                        <span className="text-sm font-medium">{item.label}</span>
                                    </div>
                                    {item.badge && (
                                        <span className={`
                      px-2 py-0.5 text-xs font-semibold rounded-full
                      ${isActive
                                                ? 'bg-white/20 text-white'
                                                : item.badgeColor === 'orange'
                                                    ? 'bg-orange-100 text-orange-600'
                                                    : 'bg-gray-100 text-gray-600'
                                            }
                    `}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Action Section */}
                <div className="p-4 border-t border-gray-100">
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 mb-3">
                        <div className="flex items-center justify-between mb-2">
                            <Activity className="w-5 h-5 text-blue-600" />
                            <span className="text-xs text-gray-500">Pro Tip</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">
                            Use <kbd className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">Ctrl+N</kbd> to quickly create a new invoice
                        </p>
                        <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                            View all shortcuts
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Settings className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <HelpCircle className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default InvoiceSidebar;
