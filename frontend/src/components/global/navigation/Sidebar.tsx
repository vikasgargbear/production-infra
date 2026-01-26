import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  // Medical/Pharma Icons
  Pill,
  Heart,
  Stethoscope,
  Activity,
  Zap,
  Bell,
  Search,
  Calendar,
  FileCheck,
  AlertTriangle,
  UserCheck,
  Timer,
  Target,
  Atom,
  Cross,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Star,
  RotateCw,
  Globe,
  MapPin,
  Phone,
  Mail,
  BadgeCheck,
  Lock,
  Unlock,
  Thermometer,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { useSidebar } from '../../../contexts/SidebarContext';

/**
 * Enhanced Collapsible Sidebar Component
 * Collapses to icons by default, expands on hover
 * Can be locked open via toggle or master settings
 */
const Sidebar = ({ activeTab, onTabChange, className = '' }) => {
  const { settings: sidebarSettings, setIsHovering, toggleLockExpanded } = useSidebar();
  const { isExpanded, lockExpanded } = sidebarSettings;

  // Debounce hover to prevent flicker
  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };
  const [hoveredItem, setHoveredItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    quickStats: true,
    quickActions: true,
    compliance: true,
    notifications: true
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Mock data for demonstration
  const quickStats = {
    prescriptions: { count: 47, trend: '+12%', color: 'teal' },
    lowStock: { count: 8, trend: 'urgent', color: 'red' },
    pendingOrders: { count: 23, trend: '+5', color: 'blue' },
    expiryAlerts: { count: 12, trend: '7 days', color: 'amber' }
  };

  const complianceStatus = {
    dgft: { status: 'valid', expiry: '2024-12-31', color: 'green' },
    gst: { status: 'filed', expiry: '2024-09-15', color: 'green' },
    narcotic: { status: 'updated', expiry: '2024-10-01', color: 'green' },
    license: { status: 'expires', expiry: '2024-11-15', color: 'amber' }
  };

  const recentSearches = ['Paracetamol', 'Amoxicillin', 'Insulin', 'Metformin'];
  const notifications = [
    { id: 1, type: 'stock', message: 'Paracetamol 500mg running low', urgent: true },
    { id: 2, type: 'expiry', message: '5 batches expiring in 7 days', urgent: false },
    { id: 3, type: 'order', message: 'New order from City Hospital', urgent: false },
    { id: 4, type: 'compliance', message: 'Drug License renewal due', urgent: true }
  ];

  // Pharma-specific menu organization
  const menuSections = [
    {
      id: 'prescription',
      title: 'Prescription Management',
      description: 'Handle prescriptions & dispensing',
      icon: Stethoscope,
      items: [
        {
          id: 'home',
          label: 'Dashboard',
          icon: Activity,
          count: null,
          description: 'Medical overview dashboard'
        },
        {
          id: 'quick-prescription',
          label: 'Quick Prescription',
          icon: Plus,
          count: null,
          description: 'Rapid prescription entry',
          highlight: true
        },
        {
          id: 'prescriptions',
          label: 'Today\'s Prescriptions',
          icon: FileCheck,
          count: '47',
          description: 'Daily prescription log',
          status: 'active'
        },
        {
          id: 'drug-interaction',
          label: 'Drug Interaction Check',
          icon: AlertTriangle,
          count: null,
          description: 'Safety verification tool'
        }
      ]
    },
    {
      id: 'inventory',
      title: 'Pharmaceutical Inventory',
      description: 'Drug stock & batch management',
      icon: Pill,
      items: [
        {
          id: 'products',
          label: 'Drug Catalog',
          icon: Package,
          count: '2,456',
          description: 'Complete medicine database'
        },
        {
          id: 'batches',
          label: 'Batch Tracking',
          icon: Archive,
          count: '189',
          description: 'Batch expiry monitoring'
        },
        {
          id: 'low-stock',
          label: 'Critical Stock Alerts',
          icon: AlertCircle,
          count: '8',
          description: 'Urgent restocking needed',
          status: 'alert'
        },
        {
          id: 'expiry-tracker',
          label: 'Expiry Tracker',
          icon: Timer,
          count: '12',
          description: 'Near-expiry medicines',
          status: 'warning'
        }
      ]
    },
    {
      id: 'customers',
      title: 'Patient & Customer Care',
      description: 'Customer relationship management',
      icon: Heart,
      items: [
        {
          id: 'customers',
          label: 'Patient Database',
          icon: Users,
          count: '1,234',
          description: 'Patient medical records'
        },
        {
          id: 'credit',
          label: 'Credit & Insurance',
          icon: Shield,
          count: '156',
          description: 'Insurance claim management'
        },
        {
          id: 'loyalty',
          label: 'Loyalty Program',
          icon: Star,
          count: '89%',
          description: 'Patient retention program'
        },
        {
          id: 'whatsapp',
          label: 'Patient Communication',
          icon: MessageSquare,
          count: 'New',
          description: 'WhatsApp notifications',
          status: 'new'
        }
      ]
    },
    {
      id: 'compliance',
      title: 'Regulatory Compliance',
      description: 'Legal & regulatory requirements',
      icon: BadgeCheck,
      items: [
        {
          id: 'dgft-compliance',
          label: 'DGFT Compliance',
          icon: Globe,
          count: 'Valid',
          description: 'Export-import compliance',
          status: 'active'
        },
        {
          id: 'gst-pharma',
          label: 'Pharma GST Filing',
          icon: FileText,
          count: 'Filed',
          description: 'Tax compliance status',
          status: 'active'
        },
        {
          id: 'narcotic-register',
          label: 'Narcotic Register',
          icon: Lock,
          count: 'Updated',
          description: 'Controlled substance tracking'
        },
        {
          id: 'license-tracker',
          label: 'License Management',
          icon: FileCheck,
          count: '45 days',
          description: 'License renewal alerts',
          status: 'warning'
        }
      ]
    },
    {
      id: 'reports',
      title: 'Medical Analytics',
      description: 'Healthcare business insights',
      icon: BarChart3,
      items: [
        {
          id: 'sales-report',
          label: 'Drug Sales Analysis',
          icon: TrendingUp,
          count: null,
          description: 'Pharmaceutical sales trends'
        },
        {
          id: 'patient-analytics',
          label: 'Patient Analytics',
          icon: Activity,
          count: null,
          description: 'Patient behavior insights'
        },
        {
          id: 'inventory-reports',
          label: 'Inventory Reports',
          icon: Package,
          count: null,
          description: 'Stock movement analysis'
        }
      ]
    },
    {
      id: 'advanced',
      title: 'Advanced Medical Tools',
      description: 'Professional healthcare tools',
      icon: Atom,
      items: [
        {
          id: 'formulary',
          label: 'Drug Formulary',
          icon: Pill,
          count: null,
          description: 'Comprehensive drug database'
        },
        {
          id: 'clinical-decision',
          label: 'Clinical Decision Support',
          icon: Stethoscope,
          count: null,
          description: 'Medical decision assistance'
        },
        {
          id: 'cold-chain',
          label: 'Cold Chain Monitoring',
          icon: Thermometer,
          count: '2°C',
          description: 'Temperature-sensitive drugs'
        },
        {
          id: 'settings',
          label: 'System Settings',
          icon: Settings,
          count: null,
          description: 'Application preferences'
        }
      ]
    }
  ];

  // Helper functions for styling - UPDATED TO BLUE THEME
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'alert': return 'bg-red-100 text-red-800 border-red-200';
      case 'new': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getItemBackgroundColor = (itemId, isHovered) => {
    const isActive = activeTab === itemId;
    if (isActive) return 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm';
    if (isHovered) return 'bg-gradient-to-r from-gray-50 to-blue-50 border-gray-200';
    return 'bg-white border-gray-100';
  };

  const getStatCardColor = (color) => {
    const colors = {
      teal: 'from-blue-500 to-blue-600',
      red: 'from-red-500 to-pink-500',
      blue: 'from-blue-500 to-indigo-500',
      amber: 'from-amber-500 to-orange-500',
      green: 'from-green-500 to-emerald-500'
    };
    return colors[color] || colors.blue;
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Quick Stats Component
  const QuickStatsSection = () => (
    <div className="mb-6">
      <button
        onClick={() => toggleSection('quickStats')}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Today's Overview</span>
        </div>
        {expandedSections.quickStats ?
          <ChevronDown className="w-4 h-4 text-gray-500" /> :
          <ChevronRight className="w-4 h-4 text-gray-500" />
        }
      </button>

      {expandedSections.quickStats && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {Object.entries(quickStats).map(([key, stat]) => (
            <div key={key} className={`relative p-3 rounded-xl bg-gradient-to-br ${getStatCardColor(stat.color)} text-white overflow-hidden`}>
              <div className="relative z-10">
                <div className="text-lg font-bold">{stat.count}</div>
                <div className="text-xs opacity-90 capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                <div className="text-xs opacity-75">{stat.trend}</div>
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white/20 rounded-full"></div>
              <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-white/10 rounded-full"></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Quick Actions Component
  const QuickActionsSection = () => (
    <div className="mb-6">
      <button
        onClick={() => toggleSection('quickActions')}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Quick Actions</span>
        </div>
        {expandedSections.quickActions ?
          <ChevronDown className="w-4 h-4 text-gray-500" /> :
          <ChevronRight className="w-4 h-4 text-gray-500" />
        }
      </button>

      {expandedSections.quickActions && (
        <div className="space-y-2 mt-3">
          {[
            { id: 'quick-prescription', label: 'New Prescription', icon: Plus, color: 'teal' },
            { id: 'emergency-stock', label: 'Emergency Stock', icon: AlertCircle, color: 'red' },
            { id: 'drug-interaction', label: 'Drug Checker', icon: Shield, color: 'blue' },
            { id: 'batch-expiry', label: 'Batch Expiry', icon: Timer, color: 'amber' }
          ].map((action) => {
            const IconComponent = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onTabChange(action.id)}
                className="w-full flex items-center p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getStatCardColor(action.color)} flex items-center justify-center mr-3`}>
                  <IconComponent className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Drug Search Component
  const DrugSearchSection = () => (
    <div className="mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search drugs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
        />
      </div>

      {searchQuery === '' && (
        <div className="mt-3">
          <div className="text-xs font-medium text-gray-500 mb-2">Recent Searches</div>
          <div className="flex flex-wrap gap-1">
            {recentSearches.map((drug) => (
              <button
                key={drug}
                onClick={() => setSearchQuery(drug)}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition-colors"
              >
                {drug}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Compliance Status Component
  const ComplianceSection = () => (
    <div className="mb-6">
      <button
        onClick={() => toggleSection('compliance')}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <BadgeCheck className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold text-gray-900">Compliance Status</span>
        </div>
        {expandedSections.compliance ?
          <ChevronDown className="w-4 h-4 text-gray-500" /> :
          <ChevronRight className="w-4 h-4 text-gray-500" />
        }
      </button>

      {expandedSections.compliance && (
        <div className="space-y-2 mt-3">
          {Object.entries(complianceStatus).map(([key, status]) => (
            <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${status.color === 'green' ? 'bg-green-500' :
                  status.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                  }`}></div>
                <span className="text-xs font-medium text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${status.color === 'green' ? 'bg-green-100 text-green-800' :
                status.color === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                }`}>
                {status.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Notifications Component
  const NotificationsSection = () => (
    <div className="mb-6">
      <button
        onClick={() => toggleSection('notifications')}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Notifications</span>
          {notifications.filter(n => n.urgent).length > 0 && (
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          )}
        </div>
        {expandedSections.notifications ?
          <ChevronDown className="w-4 h-4 text-gray-500" /> :
          <ChevronRight className="w-4 h-4 text-gray-500" />
        }
      </button>

      {expandedSections.notifications && (
        <div className="space-y-2 mt-3 max-h-40 overflow-y-auto">
          {notifications.map((notification) => (
            <div key={notification.id} className={`p-2 rounded-lg border-l-4 ${notification.urgent ? 'border-red-500 bg-red-50' : 'border-blue-500 bg-blue-50'
              }`}>
              <div className="text-xs font-medium text-gray-700">{notification.message}</div>
              {notification.urgent && (
                <div className="flex items-center mt-1">
                  <AlertCircle className="w-3 h-3 text-red-500 mr-1" />
                  <span className="text-xs text-red-600">Urgent</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // User Profile Section
  const UserProfileSection = () => (
    <div className="mb-6">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-xl text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">Dr. Rajesh Kumar</div>
              <div className="text-xs opacity-90">Licensed Pharmacist</div>
              <div className="text-xs opacity-75">License: DL-12345678</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <div>
              <div className="opacity-75">Shift: 9 AM - 9 PM</div>
              <div className="opacity-75">Time: {currentTime.toLocaleTimeString()}</div>
            </div>
            <button className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors">
              <Settings className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/10 rounded-full"></div>
        <div className="absolute -bottom-2 -left-2 w-8 h-8 bg-white/5 rounded-full"></div>
      </div>
    </div>
  );

  return (
    <div
      className={`${isExpanded ? 'w-80' : 'w-20'} h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border-r border-gray-200 flex flex-col ${className} relative overflow-hidden transition-all duration-300 ease-in-out`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background Pattern - Only show when expanded */}
      {isExpanded && (
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10">
            <Cross className="w-16 h-16 text-blue-600 rotate-12" />
          </div>
          <div className="absolute top-32 right-8">
            <Atom className="w-12 h-12 text-blue-600 -rotate-12" />
          </div>
          <div className="absolute bottom-32 left-6">
            <Heart className="w-14 h-14 text-red-400 rotate-6" />
          </div>
          <div className="absolute bottom-20 right-16">
            <Pill className="w-10 h-10 text-blue-500 -rotate-45" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 p-4 border-b border-gray-200/50 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <Cross className="w-5 h-5 text-white" />
            </div>
            {isExpanded && (
              <div className="transition-opacity duration-200">
                <div className="font-bold text-gray-900 text-base">AASO Pharma+</div>
                <div className="text-xs text-gray-600 flex items-center">
                  <Heart className="w-3 h-3 mr-1 text-red-500" />
                  Healthcare
                </div>
              </div>
            )}
          </div>
          {/* Lock/Unlock Toggle */}
          <button
            onClick={toggleLockExpanded}
            className={`p-2 rounded-lg transition-colors ${lockExpanded ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
            title={lockExpanded ? 'Unlock sidebar (auto-collapse)' : 'Lock sidebar (always expanded)'}
          >
            {lockExpanded ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative z-10">
        {isExpanded ? (
          /* Full expanded view */
          <div className="p-4 space-y-6">
            {/* User Profile Section */}
            <UserProfileSection />

            {/* Quick Stats Section */}
            <QuickStatsSection />

            {/* Drug Search Section */}
            <DrugSearchSection />

            {/* Quick Actions Section */}
            <QuickActionsSection />

            {/* Compliance Section */}
            <ComplianceSection />

            {/* Notifications Section */}
            <NotificationsSection />

            {/* Navigation Sections */}
            {menuSections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <div key={section.id} className="space-y-3">
                  {/* Section Header with Medical Icons */}
                  <div className="flex items-center space-x-2 p-3 bg-white/70 backdrop-blur-sm rounded-lg border border-gray-200">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <SectionIcon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {section.title}
                      </h3>
                      <p className="text-xs text-gray-500">{section.description}</p>
                    </div>
                  </div>

                  {/* Section Items with Enhanced Medical Styling */}
                  <div className="space-y-2 ml-4">
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
                          {/* Icon with Medical Theme */}
                          <div className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-300 ${isActive
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md'
                            : isHovered
                              ? 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700'
                              : 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-600'
                            }`}>
                            <IconComponent className="w-5 h-5" />
                          </div>

                          {/* Content */}
                          <div className="ml-3 flex-1 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`font-medium text-sm ${isActive ? 'text-blue-900' : 'text-gray-900'
                                }`}>
                                {item.label}
                              </span>

                              {/* Count/Badge with Medical Colors */}
                              {item.count && (
                                <span className={`text-xs px-2 py-1 rounded-full border font-medium transition-all duration-200 ${item.status ? getStatusColor(item.status) : 'bg-blue-100 text-blue-700 border-blue-200'
                                  }`}>
                                  {item.count}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.description}
                            </p>
                          </div>

                          {/* Pulse indicator for important items */}
                          {item.highlight && (
                            <div className="flex items-center ml-2">
                              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                              <div className="w-3 h-3 bg-blue-400/30 rounded-full animate-ping absolute"></div>
                            </div>
                          )}

                          {/* Medical urgency indicators */}
                          {item.status === 'alert' && (
                            <div className="ml-2">
                              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Collapsed icon-only view */
          <div className="p-2 space-y-2">
            {menuSections.flatMap(section =>
              section.items.slice(0, 2).map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-center p-3 rounded-lg transition-all duration-200 ${isActive
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md'
                        : 'hover:bg-gray-100 text-gray-600'
                      }`}
                    title={item.label}
                  >
                    <IconComponent className="w-5 h-5" />
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Enhanced Footer */}
      <div className="relative z-10 p-4 border-t border-gray-200/50 bg-white/80 backdrop-blur-sm">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="relative">
                <Heart className="w-4 h-4 text-blue-600" />
                <div className="absolute -inset-1 w-6 h-6 bg-blue-400/20 rounded-full animate-ping"></div>
              </div>
              <span className="ml-2 text-sm font-medium text-blue-800">System Healthy</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <Activity className="w-3 h-3" />
              <span>Live</span>
            </div>
          </div>
          <div className="text-xs text-blue-600 mt-1 flex items-center justify-between">
            <span>Last health check: {new Date().toLocaleTimeString()}</span>
            <div className="flex items-center space-x-1">
              <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
              <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
              <div className="w-1 h-1 bg-green-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;