import React, { useState } from 'react';
import { 
  FileText,
  ShoppingCart, 
  CreditCard,
  ArrowRight,
  RotateCcw,
  Package,
  Users,
  FileEdit,
  BarChart3,
  Warehouse,
  Calculator,
  Settings2,
  Bell
} from 'lucide-react';
import NotificationCenter from './NotificationCenter';

const Home = ({ setActiveTab }) => {
  const companyName = localStorage.getItem('companyName') || 'PharmaERP Pro';
  const companyLogo = localStorage.getItem('companyLogo');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  
  // Mock unread count - in real app, this would come from API
  const unreadNotifications = 3;
  
  const coreActions = [
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

  const financialActions = [
    {
      id: 'payment-entry',
      tab: 'payment',
      title: 'Payment Entry',
      subtitle: 'Manage payments and financial transactions',
      icon: CreditCard,
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
      id: 'receivables-collection',
      tab: 'receivables-collection',
      title: 'Receivables & Collection',
      subtitle: 'Monitor outstanding receivables and collections',
      icon: CreditCard,
      shortcut: 'Ctrl+R'
    }
  ];

  const analyticsActions = [
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
      tab: 'warehouse',
      title: 'Warehouse Management',
      subtitle: 'Manage multiple locations and inventory',
      icon: Warehouse,
      shortcut: 'Ctrl+W'
    },
    {
      id: 'gst',
      tab: 'gst',
      title: 'GST Management',
      subtitle: 'Tax reports, filing, and compliance',
      icon: Calculator,
      shortcut: 'Ctrl+G'
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
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Check for Ctrl+Shift+M first
        if (e.shiftKey && e.key.toLowerCase() === 'm') {
          e.preventDefault();
          setActiveTab('master');
          return;
        }
        
        switch(e.key.toLowerCase()) {
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
            setActiveTab('warehouse');
            break;
          default:
            break;
        }
        
        // Handle Ctrl+Shift combinations
        if (e.shiftKey) {
          switch(e.key.toLowerCase()) {
            case 'r':
              e.preventDefault();
              setActiveTab('reports');
              break;
            default:
              break;
          }
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          setActiveTab('receivables-collection');
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Clean Header */}
      <div className="px-6 pt-8 pb-8">
        <div className="max-w-7xl mx-auto text-center">
          {/* Logo and Brand with Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-3 flex-1">
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
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {companyName}
                </h1>
                <p className="text-sm text-gray-600">
                  Enterprise Pharmaceutical Distribution Management
                </p>
              </div>
            </div>
            
            {/* Development Tools and Notification Bell */}
            <div className="flex items-center gap-2">
              {process.env.NODE_ENV === 'development' && (
                <button
                  onClick={() => setActiveTab('components-test')}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                >
                  V2 Components Test
                </button>
              )}
              
              {/* Notification Bell */}
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
      <div className="flex-1 px-6 py-8 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* Core Operations Section */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
              Core Operations
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {coreActions.map((action) => {
              const Icon = action.icon;
              
              return (
                <button
                  key={action.id}
                  onClick={() => setActiveTab(action.tab)}
                  className="group bg-white rounded-xl p-6 text-left transition-all duration-200 hover:shadow-xl border border-gray-100 hover:border-gray-200 min-h-[140px]"
                >
                  {/* Icon with gradient */}
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center mb-4 group-hover:from-blue-600 group-hover:to-blue-700 transition-all shadow-sm">
                    <Icon className="w-7 h-7 text-blue-700 group-hover:text-white transition-colors" />
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
                    <span className="text-[10px] text-gray-400 font-medium">
                      {action.shortcut}
                    </span>
                  </div>
                </button>
              );
            })}
            </div>
          </div>

          {/* Financial Operations Section */}
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
              Financial Operations
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {financialActions.map((action) => {
                const Icon = action.icon;
                
                return (
                  <button
                    key={action.id}
                    onClick={() => setActiveTab(action.tab)}
                    className="group bg-white rounded-xl p-6 text-left transition-all duration-200 hover:shadow-xl border border-gray-100 hover:border-gray-200 min-h-[140px]"
                  >
                    {/* Icon with muted green gradient */}
                    <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center mb-4 group-hover:from-green-600 group-hover:to-green-700 transition-all shadow-sm">
                      <Icon className="w-7 h-7 text-green-700 group-hover:text-white transition-colors" />
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
                      <div className="inline-flex items-center text-xs font-medium text-green-600 group-hover:text-green-700">
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {action.shortcut}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Analytics & Warehouse Section */}
          <div>
            <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-4 text-center">
              Analytics & Warehouse
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {analyticsActions.map((action) => {
                const Icon = action.icon;
                
                return (
                  <button
                    key={action.id}
                    onClick={() => setActiveTab(action.tab)}
                    className="group bg-white rounded-xl p-6 text-left transition-all duration-200 hover:shadow-xl border border-gray-100 hover:border-gray-200 min-h-[140px]"
                  >
                    {/* Icon with gradient */}
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center mb-4 group-hover:from-gray-800 group-hover:to-gray-900 transition-all shadow-sm">
                      <Icon className="w-7 h-7 text-gray-700 group-hover:text-white transition-colors" />
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
                      <div className="inline-flex items-center text-xs font-medium text-gray-600 group-hover:text-gray-700">
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {action.shortcut}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div className="bg-gray-100 border-t border-gray-200 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center space-x-8 text-xs text-gray-600">
          <div className="flex items-center space-x-1">
            <span className="font-medium">99.9%</span>
            <span>Uptime</span>
          </div>
          <div className="text-gray-400">•</div>
          <div className="flex items-center space-x-1">
            <span className="font-medium">24/7</span>
            <span>Support</span>
          </div>
          <div className="text-gray-400">•</div>
          <div className="flex items-center space-x-1">
            <span className="font-medium">100+</span>
            <span>Clients</span>
          </div>
        </div>
      </div>
      
      {/* Notification Center */}
      <NotificationCenter 
        isOpen={isNotificationOpen} 
        onClose={() => setIsNotificationOpen(false)} 
      />
    </div>
  );
};

export default Home;