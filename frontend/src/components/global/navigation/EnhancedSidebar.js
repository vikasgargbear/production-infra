import React, { useState } from 'react';
import { 
  Home,
  Plus,
  ShoppingCart,
  Package,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  Settings,
  Archive,
  TrendingUp,
  Shield,
  MessageSquare,
  User,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

/**
 * Enhanced Apple-Inspired Desktop Sidebar
 * Designed for less tech-savvy users with clear, always-visible navigation
 */
const EnhancedSidebar = ({ activeTab, onTabChange, className = '' }) => {
  const [hoveredItem, setHoveredItem] = useState(null);

  // Workflow-based menu organization
  const menuSections = [
    {
      id: 'daily',
      title: 'Daily Work',
      description: 'Your everyday tasks',
      items: [
        {
          id: 'home',
          label: 'Dashboard',
          icon: Home,
          count: null,
          description: 'Overview of your business'
        },
        {
          id: 'quick-sale',
          label: 'Quick Sale',
          icon: Plus,
          count: null,
          description: 'Create new sale quickly',
          highlight: true
        },
        {
          id: 'orders',
          label: 'Today\'s Orders',
          icon: ShoppingCart,
          count: '12',
          description: 'Orders for today',
          status: 'active'
        },
        {
          id: 'payments',
          label: 'Payment Due',
          icon: CreditCard,
          count: '₹2.4L',
          description: 'Pending payments',
          status: 'warning'
        }
      ]
    },
    {
      id: 'inventory',
      title: 'Products & Stock',
      description: 'Manage your inventory',
      items: [
        {
          id: 'products',
          label: 'Products',
          icon: Package,
          count: '1,245',
          description: 'All your products'
        },
        {
          id: 'batches',
          label: 'Stock Check',
          icon: Archive,
          count: '89',
          description: 'Check batch expiry'
        },
        {
          id: 'low-stock',
          label: 'Low Stock Alert',
          icon: AlertCircle,
          count: '15',
          description: 'Products running low',
          status: 'alert'
        }
      ]
    },
    {
      id: 'customers',
      title: 'Customer Management',
      description: 'Handle customer relations',
      items: [
        {
          id: 'customers',
          label: 'All Customers',
          icon: Users,
          count: '456',
          description: 'Customer database'
        },
        {
          id: 'credit',
          label: 'Credit Management',
          icon: Shield,
          count: '23',
          description: 'Customer credit limits'
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp Updates',
          icon: MessageSquare,
          count: 'New',
          description: 'Customer communications',
          status: 'new'
        }
      ]
    },
    {
      id: 'reports',
      title: 'Reports & Analytics',
      description: 'Business insights',
      items: [
        {
          id: 'sales-report',
          label: 'Sales Report',
          icon: TrendingUp,
          count: null,
          description: 'Daily/Monthly sales'
        },
        {
          id: 'gst-reports',
          label: 'GST Reports',
          icon: FileText,
          count: null,
          description: 'Tax compliance reports'
        },
        {
          id: 'analytics',
          label: 'Business Analytics',
          icon: BarChart3,
          count: null,
          description: 'Performance insights'
        }
      ]
    },
    {
      id: 'advanced',
      title: 'Advanced Features',
      description: 'Additional tools',
      items: [
        {
          id: 'inventory-management',
          label: 'Advanced Inventory',
          icon: Package,
          count: null,
          description: 'Detailed inventory tools'
        },
        {
          id: 'accounting',
          label: 'Accounting',
          icon: DollarSign,
          count: null,
          description: 'Financial management'
        },
        {
          id: 'profile',
          label: 'Company Profile',
          icon: User,
          count: null,
          description: 'Business information'
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          count: null,
          description: 'App preferences'
        }
      ]
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'alert': return 'bg-red-100 text-red-800 border-red-200';
      case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getItemBackgroundColor = (itemId, isHovered) => {
    const isActive = activeTab === itemId;
    if (isActive) return 'bg-blue-50 border-blue-200 shadow-sm';
    if (isHovered) return 'bg-gray-50 border-gray-200';
    return 'bg-white border-gray-100';
  };

  return (
    <div className={`w-80 h-screen bg-white border-r border-gray-200 flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-lg">AASO Pharma</div>
            <div className="text-sm text-gray-600">Wholesale Management</div>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-8">
          {menuSections.map((section) => (
            <div key={section.id} className="space-y-3">
              {/* Section Header */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  {section.title}
                </h3>
                <p className="text-xs text-gray-500">{section.description}</p>
              </div>

              {/* Section Items */}
              <div className="space-y-2">
                {section.items.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeTab === item.id;
                  const isHovered = hoveredItem === item.id;
                  
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center p-3 rounded-xl border transition-all duration-200 group ${getItemBackgroundColor(item.id, isHovered)}`}
                      onClick={() => onTabChange(item.id)}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      {/* Icon */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                        isActive 
                          ? 'bg-blue-500 text-white' 
                          : isHovered 
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-gray-50 text-gray-600'
                      }`}>
                        <IconComponent className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="ml-3 flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-sm ${
                            isActive ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {item.label}
                          </span>
                          
                          {/* Count/Badge */}
                          {item.count && (
                            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                              item.status ? getStatusColor(item.status) : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                              {item.count}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.description}
                        </p>
                      </div>

                      {/* Highlight indicator for important items */}
                      {item.highlight && (
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse ml-2"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Status */}
      <div className="p-4 border-t border-gray-100">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="ml-2 text-sm font-medium text-green-800">System Online</span>
          </div>
          <div className="text-xs text-green-600 mt-1">
            Last sync: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedSidebar;