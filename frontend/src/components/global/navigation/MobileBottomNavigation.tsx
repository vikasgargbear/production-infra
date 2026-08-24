import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calculator,
  FileText,
  Home,
  Menu,
  Package,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';

interface MobileBottomNavigationProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  hasModuleAccessOverride?: (module: string) => boolean;
}

interface NavigationItem {
  id: string;
  label: string;
  tab: string;
  module?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_ITEMS: NavigationItem[] = [
  { id: 'home', label: 'Home', tab: 'home', icon: Home },
  { id: 'sales', label: 'Sales', tab: 'sales', module: 'sales', icon: FileText },
  { id: 'purchase', label: 'Purchase', tab: 'purchase', module: 'purchase', icon: ShoppingCart },
  { id: 'stock', label: 'Stock', tab: 'stock-management', module: 'inventory', icon: Package },
];

const MORE_ITEMS: NavigationItem[] = [
  { id: 'returns', label: 'Returns', tab: 'returns', module: 'returns', icon: RotateCcw },
  { id: 'finance', label: 'Finance', tab: 'payment', module: 'payment', icon: WalletCards },
  { id: 'ledger', label: 'Party Ledger', tab: 'party-ledger', module: 'ledger', icon: Users },
  { id: 'gst', label: 'GST', tab: 'gst', module: 'gst', icon: Calculator },
  { id: 'reports', label: 'Reports', tab: 'reports', module: 'reports', icon: BarChart3 },
  { id: 'master', label: 'Master Data', tab: 'master', module: 'master', icon: Settings2 },
];

const TAB_GROUPS: Record<string, string> = {
  home: 'home',
  sales: 'sales',
  orders: 'sales',
  purchase: 'purchase',
  inventory: 'stock',
  batches: 'stock',
  'stock-management': 'stock',
};

const MobileBottomNavigation: React.FC<MobileBottomNavigationProps> = ({
  activeTab,
  onNavigate,
  hasModuleAccessOverride,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { hasModuleAccess } = usePermissions();
  const canAccess = hasModuleAccessOverride || hasModuleAccess;

  const primaryItems = useMemo(
    () => PRIMARY_ITEMS.filter(item => !item.module || canAccess(item.module)),
    [canAccess]
  );
  const moreItems = useMemo(
    () => MORE_ITEMS.filter(item => !item.module || canAccess(item.module)),
    [canAccess]
  );
  const activeGroup = TAB_GROUPS[activeTab] || 'more';

  useEffect(() => {
    setMoreOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  const navigate = (tab: string) => {
    setMoreOpen(false);
    onNavigate(tab);
  };

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="presentation">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-gray-950/40"
            onClick={() => setMoreOpen(false)}
          />
          <section
            id="mobile-more-navigation"
            aria-label="More modules"
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-5 pt-3 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">More modules</h2>
                <p className="text-xs text-gray-500">Choose where you want to go</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close more modules"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.tab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.tab)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isActive
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <nav
        aria-label="Primary mobile navigation"
        className="md:hidden fixed inset-x-0 bottom-0 z-[70] border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,23,42,0.10)] backdrop-blur"
      >
        <div
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))` }}
        >
          {primaryItems.map(item => {
            const Icon = item.icon;
            const isActive = activeGroup === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                  isActive ? 'text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {isActive && <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-blue-600" />}
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(open => !open)}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            aria-current={activeGroup === 'more' ? 'page' : undefined}
            className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
              activeGroup === 'more' || moreOpen
                ? 'text-blue-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            {(activeGroup === 'more' || moreOpen) && (
              <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-blue-600" />
            )}
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default MobileBottomNavigation;
