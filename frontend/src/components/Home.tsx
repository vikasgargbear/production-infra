import React, { useState, useEffect } from 'react';
import {
  FileText,
  ShoppingCart,
  ArrowRight,
  RotateCcw,
  Package,
  Users,
  FileEdit,
  BarChart3,
  Warehouse,
  Calculator,
  Settings2,
  Bell,
  Loader2
} from 'lucide-react';
import NotificationCenter from './global/NotificationCenter';
import { usePermissions } from '../hooks/usePermissions';

interface HomeProps {
  setActiveTab: (tab: string) => void;
}

interface ActionItem {
  id: string;
  tab: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<any>;
  shortcut: string;
}

// Map action IDs to permission modules
const ACTION_MODULE_MAP: Record<string, string> = {
  'sales': 'sales',
  'purchase-entry': 'purchase',
  'returns': 'returns',
  'stock-management': 'inventory',
  'financial-hub': 'payment',
  'party-ledger': 'ledger',
  'credit-debit-note': 'notes',
  'gst': 'gst',
  'reports': 'reports',
  'warehouse': 'inventory',
  'master': 'master',
};

const Home: React.FC<HomeProps> = ({ setActiveTab }) => {
  const companyName = localStorage.getItem('companyName') || 'PharmaERP Pro';
  const companyLogo = localStorage.getItem('companyLogo');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { hasModuleAccess } = usePermissions();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load any other required data here
        setError(null); // Clear any previous errors
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // Reduced polling frequency since we're not loading notifications
    const interval = setInterval(loadData, 60000); // Poll every 60 seconds
    return () => clearInterval(interval);
  }, []);

  const coreActions: ActionItem[] = [
    {
      id: 'sales',
      tab: 'sales',
      title: 'Sales',
      subtitle: 'Create invoices, challans, and sales orders',
      icon: FileText,
      shortcut: 'Ctrl+S'
    },
    {
      id: 'purchase-entry',
      tab: 'purchase',
      title: 'Purchase Entry',
      subtitle: 'Record supplier invoices and purchases',
      icon: ShoppingCart,
      shortcut: 'Ctrl+P'
    },
    {
      id: 'returns',
      tab: 'returns',
      title: 'Returns Management',
      subtitle: 'Process customer returns and supplier returns',
      icon: RotateCcw,
      shortcut: 'F8'
    },
    {
      id: 'stock-management',
      tab: 'stock-management',
      title: 'Stock Management',
      subtitle: 'Stock movement, transfers, and adjustments',
      icon: Package,
      shortcut: 'Ctrl+I'
    }
  ];

  const financialActions: ActionItem[] = [
    {
      id: 'financial-hub',
      tab: 'payment',
      title: 'Financial Hub',
      subtitle: 'Complete financial management & accounting',
      icon: Calculator,
      shortcut: 'Ctrl+M'
    },
    {
      id: 'party-ledger',
      tab: 'party-ledger',
      title: 'Party Ledger',
      subtitle: 'View ledger and track party dues',
      icon: Users,
      shortcut: 'Ctrl+L'
    },
    {
      id: 'credit-debit-note',
      tab: 'credit-debit-note',
      title: 'Credit/Debit Note',
      subtitle: 'Financial adjustments without returns',
      icon: FileEdit,
      shortcut: 'Ctrl+N'
    },
    {
      id: 'gst',
      tab: 'gst',
      title: 'GST Management',
      subtitle: 'Tax reports, filing, and compliance',
      icon: Calculator,
      shortcut: 'Ctrl+G'
    }
  ];

  const analyticsActions: ActionItem[] = [
    {
      id: 'reports',
      tab: 'reports',
      title: 'Reports & Analytics',
      subtitle: 'GST reports, sales analysis, and insights',
      icon: BarChart3,
      shortcut: 'Ctrl+Shift+R'
    },
    {
      id: 'warehouse',
      tab: 'master',
      title: 'Warehouse Management',
      subtitle: 'Manage multiple locations and inventory',
      icon: Warehouse,
      shortcut: 'Ctrl+W'
    },
    {
      id: 'master',
      tab: 'master',
      title: 'Master Management',
      subtitle: 'System settings, products, and party data',
      icon: Settings2,
      shortcut: 'Ctrl+Shift+M'
    }
  ];

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Check for Ctrl+Shift+M first
        if (e.shiftKey && e.key.toLowerCase() === 'm') {
          e.preventDefault();
          setActiveTab('master');
          return;
        }

        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            setActiveTab('sales');
            break;
          case 'p':
            e.preventDefault();
            setActiveTab('purchase');
            break;
          case 'm':
            e.preventDefault();
            setActiveTab('payment');
            break;
          case 'i':
            e.preventDefault();
            setActiveTab('stock-management');
            break;
          case 'l':
            e.preventDefault();
            setActiveTab('party-ledger');
            break;
          case 'n':
            e.preventDefault();
            setActiveTab('credit-debit-note');
            break;
          case 'g':
            e.preventDefault();
            setActiveTab('gst');
            break;
          case 'w':
            e.preventDefault();
            setActiveTab('master');
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('navigateToMaster', {
              detail: { module: 'warehouse-master' }
            })), 100);
            break;
          default:
            break;
        }

        // Handle Ctrl+Shift combinations
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'r':
              e.preventDefault();
              setActiveTab('reports');
              break;
            default:
              break;
          }
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setActiveTab('returns');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setActiveTab('returns');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setActiveTab]);

  const renderActionCard = (action: ActionItem) => {
    const Icon = action.icon;

    return (
      <button
        key={action.id}
        onClick={() => {
          if (action.id === 'master' || action.id === 'warehouse') {
            setActiveTab(action.tab);
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('navigateToMaster', {
                detail: action.id === 'warehouse'
                  ? { module: 'warehouse-master' }
                  : { module: 'tax-master', tab: 'gst-config' }
              }));
            }, 100);
          } else {
            setActiveTab(action.tab);
          }
        }}
        className="group min-h-[132px] rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-200 hover:border-blue-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-[140px] sm:p-6"
      >
        {/* Icon with gradient */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 shadow-sm transition-all group-hover:from-blue-600 group-hover:to-blue-700">
          <Icon className="h-7 w-7 text-blue-700 transition-colors group-hover:text-white" />
        </div>

        {/* Text */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {action.title}
        </h3>
        <p className="text-sm text-gray-600 line-clamp-2 h-10">
          {action.subtitle}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3">
          <div className="inline-flex items-center text-xs font-medium text-blue-600 group-hover:text-blue-700">
            <span>Open</span>
            <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
          <span className="hidden text-[10px] font-medium text-gray-400 sm:inline">
            {action.shortcut}
          </span>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Clean Header */}
      <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-8 sm:pt-8">
        <div className="max-w-7xl mx-auto text-center">
          {/* Logo and Brand with Notifications */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center space-x-3 sm:justify-center">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="h-10 w-auto"
                />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-sm">
                  <FileText className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="min-w-0 text-left sm:text-center">
                <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">
                  {companyName}
                </h1>
                <p className="hidden text-sm text-gray-600 sm:block">
                  Enterprise Pharmaceutical Distribution Management
                </p>
              </div>
            </div>

            {/* Notification Bell */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Bell className="w-6 h-6" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="max-w-7xl mx-auto">

          {/* Core Operations Section */}
          {coreActions.filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'sales')).length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
                Core Operations
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {coreActions
                  .filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'sales'))
                  .map(renderActionCard)}
              </div>
            </div>
          )}

          {/* Financial Operations Section */}
          {financialActions.filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'payment')).length > 0 && (
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
                Financial Operations
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {financialActions
                  .filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'payment'))
                  .map(renderActionCard)}
              </div>
            </div>
          )}

          {/* Analytics & Warehouse Section */}
          {analyticsActions.filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'reports')).length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
                Analytics & Warehouse
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {analyticsActions
                  .filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'reports'))
                  .map(renderActionCard)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification Center */}
      <NotificationCenter
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onUnreadCountChange={setUnreadNotifications}
      />
    </div>
  );
};

export default Home;
