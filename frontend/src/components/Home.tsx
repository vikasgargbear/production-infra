import React from 'react';
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
  LogOut
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

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
  const { companyInfo } = useCompany();
  const companyName = companyInfo?.name || 'Company profile not configured';
  const companyLogo = companyInfo?.logo || null;
  const { hasModuleAccess } = usePermissions();
  const { logout, user } = useAuth();

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
          if (action.id === 'warehouse') {
            setActiveTab(action.tab);
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('navigateToMaster', {
                detail: { module: 'warehouse-master' }
              }));
            }, 100);
          } else {
            setActiveTab(action.tab);
          }
        }}
        className="group min-h-[132px] rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-[140px] sm:p-6"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 transition-colors group-hover:border-blue-300">
          <Icon className="h-6 w-6 text-blue-700" />
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900">
      {/* Clean Header */}
      <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-8 sm:pt-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center space-x-3 sm:justify-center">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="h-10 w-auto"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white">
                  <FileText className="w-5 h-5 text-blue-600" />
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

            <button
              type="button"
              onClick={logout}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={`Sign out${user?.email ? ` ${user.email}` : ''}`}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="max-w-7xl mx-auto">

          {/* Core Operations Section */}
          {coreActions.filter(a => hasModuleAccess(ACTION_MODULE_MAP[a.id] || 'sales')).length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4 text-left">
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
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4 text-left">
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
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4 text-left">
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
      </main>

    </div>
  );
};

export default Home;
