import React, { useState } from 'react';
import { 
  Package, 
  Users, 
  ShoppingCart, 
  CreditCard, 
  Settings,
  Home,
  TrendingUp,
  Shield,
  Archive,
  ChevronRight,
  Menu,
  X,
  FileText,
  Home as HomeIcon,
  BarChart3,
  Target,
  User,
  MessageSquare,
  LucideIcon
} from 'lucide-react';
import { Button } from './global';

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: string | null;
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  
  const menuItems: MenuItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: HomeIcon,
      count: null
    },
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: Home,
      count: null
    },
    { 
      id: 'products', 
      label: 'Products', 
      icon: Package,
      count: '150+'
    },
    { 
      id: 'customers', 
      label: 'Customers', 
      icon: Users,
      count: '45'
    },
    { 
      id: 'orders', 
      label: 'Orders', 
      icon: ShoppingCart,
      count: '268'
    },
    { 
      id: 'batches', 
      label: 'Batches', 
      icon: Archive,
      count: '89'
    },
    { 
      id: 'payments', 
      label: 'Payment Tracking', 
      icon: CreditCard,
      count: '₹5.2L'
    },
    { 
      id: 'credit', 
      label: 'Credit Management', 
      icon: Shield,
      count: '45'
    },
    { 
      id: 'whatsapp', 
      label: 'WhatsApp Business', 
      icon: MessageSquare,
      count: 'New'
    }
  ];
  
  const advancedItems: MenuItem[] = [
    { id: 'inventory', label: 'Inventory Management', icon: Package },
    { id: 'accounting', label: 'Accounting Ledgers', icon: FileText },
    { id: 'payment-dashboard', label: 'Payment Analytics', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'profile', label: 'Company Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'test-save', label: 'Test Save', icon: Package }
  ];

  const toggleSidebar = () => setCollapsed(!collapsed);
  const toggleMobileSidebar = () => setMobileOpen(!mobileOpen);

  // Mobile sidebar toggle button
  const MobileMenuButton: React.FC = () => (
    <Button
      className="fixed bottom-4 right-4 md:hidden bg-white p-3 rounded-full shadow-lg z-30 border border-gray-200"
      onClick={toggleMobileSidebar}
      variant="ghost"
      size="sm"
    >
      <Menu className="w-5 h-5 text-gray-700" />
    </Button>
  );

  // Sidebar header with logo and toggle buttons
  const SidebarHeader: React.FC = () => (
    <div className="flex items-center justify-between p-4 border-b border-red-700">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
          <Shield className="w-4 h-4 text-red-600" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-white">AASO Pharma</div>
            <div className="text-xs text-white opacity-80">Wholesale Hub</div>
          </div>
        )}
      </div>
      {!collapsed ? (
        <Button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-red-700 text-white hidden md:block"
          variant="ghost"
          size="sm"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      ) : (
        <Button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-red-700 text-white"
          variant="ghost"
          size="sm"
        >
          <Menu className="w-4 h-4" />
        </Button>
      )}
      <Button
        onClick={toggleMobileSidebar}
        className="p-1 rounded-md hover:bg-red-700 text-white md:hidden"
        variant="ghost"
        size="sm"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  // Main navigation menu items
  const MainNavigation: React.FC = () => (
    <div className="mb-2">
      {!collapsed && (
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-white opacity-70 uppercase tracking-wider">Main Menu</div>
        </div>
      )}
      
      <div className="space-y-1">
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive 
                  ? 'bg-red-700 text-white' 
                  : 'hover:bg-red-700 text-white opacity-80 hover:opacity-100'
              }`}
              onClick={() => onTabChange(item.id)}
            >
              <div className="flex items-center justify-center w-6 h-6 text-white">
                <IconComponent className="w-4 h-4" />
              </div>
              
              {!collapsed && (
                <div className="ml-3 flex-1 flex items-center justify-between">
                  <span className="font-medium">{item.label}</span>
                  {item.count && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive 
                        ? 'bg-white text-red-600' 
                        : 'bg-red-700 text-white'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Advanced tools menu items
  const AdvancedTools: React.FC = () => (
    <div className="mt-6">
      {!collapsed && (
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-white opacity-70 uppercase tracking-wider">Advanced</div>
        </div>
      )}
      
      <div className="space-y-1">
        {advancedItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive 
                  ? 'bg-red-700 text-white' 
                  : 'hover:bg-red-700 text-white opacity-80 hover:opacity-100'
              }`}
              onClick={() => onTabChange(item.id)}
            >
              <div className="flex items-center justify-center w-6 h-6 text-white">
                <IconComponent className="w-4 h-4" />
              </div>
              
              {!collapsed && (
                <span className="ml-3 font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Status footer
  const StatusFooter: React.FC = () => (
    !collapsed ? (
      <div className="mt-auto p-3 border-t border-red-700">
        <div className="bg-red-700 rounded-lg p-3 text-xs">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="ml-2 text-white font-medium">All Systems Online</span>
          </div>
        </div>
      </div>
    ) : null
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={toggleMobileSidebar}
        />
      )}
      
      {/* Mobile sidebar */}
      <div className={`fixed top-0 left-0 h-screen bg-red-600 z-50 shadow-xl transition-all duration-300 transform md:hidden ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } w-64`}>
        <div className="flex flex-col h-full">
          <SidebarHeader />
          <div className="p-3 overflow-y-auto flex-1">
            <MainNavigation />
            <AdvancedTools />
          </div>
          <StatusFooter />
        </div>
      </div>
      
      {/* Desktop sidebar */}
      <div className={`hidden md:block h-screen bg-red-600 shadow-sm transition-all duration-300 fixed top-0 left-0 z-10 ${
        collapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="flex flex-col h-full">
          <SidebarHeader />
          <div className="p-3 overflow-y-auto flex-1">
            <MainNavigation />
            <AdvancedTools />
          </div>
          <StatusFooter />
        </div>
      </div>
      
      {/* Mobile menu button */}
      <MobileMenuButton />
    </>
  );
};

export default Sidebar;
