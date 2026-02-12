import React, { useState, useEffect } from 'react';
import { X, Settings, HelpCircle, ChevronRight, Activity, LucideIcon, Lock, Unlock } from 'lucide-react';
import { useSidebar } from '../../../contexts/SidebarContext';

// TypeScript interface for module configuration
export interface Module {
  id: string;
  label?: string;
  fullLabel: string;
  description?: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  color: string;
  component?: React.ComponentType<{ open?: boolean; onClose?: () => void }>;
  badge?: string;
  group?: string; // Optional section header for sidebar grouping
}

interface ModuleHubProps {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  modules?: Module[];
  defaultModule?: string | null;
  layout?: 'sidebar' | 'centered';
}

/**
 * ModuleHub - A reusable hub component with Apple-inspired layout
 */
const ModuleHub: React.FC<ModuleHubProps> = ({
  open = true,
  onClose,
  title = "Module Hub",
  subtitle = "Select a module",
  icon: HubIcon,
  modules = [] as Module[],
  defaultModule = null,
  layout = 'sidebar'
}) => {
  const [activeModule, setActiveModule] = useState(
    defaultModule || (layout === 'centered' ? '' : (modules[0]?.id || ''))
  );

  // Sidebar collapse/expand state (must be called before any conditional returns)
  const { settings: sidebarSettings, setIsHovering, toggleLockExpanded } = useSidebar();
  const { isExpanded, lockExpanded } = sidebarSettings;

  // Color mapping for consistent styling and good contrast
  const colorStyles = {
    blue: {
      inactive: 'bg-blue-100 text-blue-600',
      hover: 'bg-blue-200',
      active: 'bg-blue-600',
      activeOverlay: 'from-blue-400/30'
    },
    purple: {
      inactive: 'bg-purple-100 text-purple-600',
      hover: 'bg-purple-200',
      active: 'bg-purple-600',
      activeOverlay: 'from-purple-400/30'
    },
    green: {
      inactive: 'bg-green-100 text-green-600',
      hover: 'bg-green-200',
      active: 'bg-green-600',
      activeOverlay: 'from-green-400/30'
    },
    teal: {
      inactive: 'bg-blue-100 text-blue-600',
      hover: 'bg-blue-200',
      active: 'bg-blue-700', // Darker for better contrast
      activeOverlay: 'from-blue-400/30'
    },
    amber: {
      inactive: 'bg-amber-100 text-amber-600',
      hover: 'bg-amber-200',
      active: 'bg-amber-600',
      activeOverlay: 'from-amber-400/30'
    },
    red: {
      inactive: 'bg-red-100 text-red-600',
      hover: 'bg-red-200',
      active: 'bg-red-600',
      activeOverlay: 'from-red-400/30'
    },
    orange: {
      inactive: 'bg-orange-100 text-orange-600',
      hover: 'bg-orange-200',
      active: 'bg-orange-600',
      activeOverlay: 'from-orange-400/30'
    },
    gray: {
      inactive: 'bg-gray-100 text-gray-600',
      hover: 'bg-gray-200',
      active: 'bg-gray-700', // Darker for better contrast
      activeOverlay: 'from-gray-400/30'
    },
    indigo: {
      inactive: 'bg-indigo-100 text-indigo-600',
      hover: 'bg-indigo-200',
      active: 'bg-indigo-700', // Darker for better contrast
      activeOverlay: 'from-indigo-400/30'
    },
    emerald: {
      inactive: 'bg-emerald-100 text-emerald-600',
      hover: 'bg-emerald-200',
      active: 'bg-emerald-600',
      activeOverlay: 'from-emerald-400/30'
    }
  };

  // Keyboard navigation (Ctrl+1-9 for module switching only — ESC is handled by child modules via EscapeKeyContext)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Number keys for module selection - require Ctrl/Cmd modifier
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (modules[index]) {
          setActiveModule(modules[index].id);
        }
      }
    };

    if (open) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [open, modules]);

  if (!open) return null;

  // Render the appropriate module
  const renderModule = () => {
    const activeModuleConfig = modules.find(m => m.id === activeModule);

    if (activeModuleConfig && activeModuleConfig.component) {
      const Component = activeModuleConfig.component;
      return (
        <Component
          onClose={onClose}
          key={activeModule}
          open={true}
        />
      );
    }

    // Placeholder for modules not yet implemented
    const moduleInfo = modules.find(m => m.id === activeModule);
    const Icon = moduleInfo?.icon;

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          {Icon && <Icon className={`w-16 h-16 text-${moduleInfo?.color || 'gray'}-400 mx-auto mb-4`} />}
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            {moduleInfo?.fullLabel || 'Module'}
          </h2>
          <p className="text-gray-500 mb-4">{moduleInfo?.description || 'Module description'}</p>
          <p className="text-sm text-gray-400">Coming soon...</p>
        </div>
      </div>
    );
  };

  // Centered layout (no header/title; modules in the middle like Apple)
  if (layout === 'centered') {
    const isGrid = !activeModule;
    return (
      <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
          title="Close (Esc)"
        >
          <X className="w-6 h-6 text-gray-600" />
        </button>

        {/* Back Button when a module is active */}
        {!isGrid && (
          <button
            onClick={() => setActiveModule('')}
            className="absolute top-4 left-4 z-10 px-3 py-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow text-sm text-gray-700"
            title="Back to modules"
          >
            ← Modules
          </button>
        )}

        <div className="flex-1 flex items-center justify-center p-6">
          {isGrid ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
              {modules.map((module) => {
                const Icon = module.icon;
                const colors = colorStyles[module.color] || colorStyles.gray;
                return (
                  <button
                    key={module.id}
                    onClick={() => setActiveModule(module.id)}
                    className="group relative bg-white/80 backdrop-blur border border-gray-200 rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-center">
                      <div className={`p-3 rounded-xl mr-4 ${colors.inactive} group-hover:${colors.hover} transition-colors`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-gray-900">{module.fullLabel}</div>
                        <div className="text-sm text-gray-500">{module.description}</div>
                      </div>
                    </div>
                    {/* Subtle underline on hover */}
                    <div className="absolute left-6 right-6 -bottom-2 h-0.5 bg-gradient-to-r from-gray-200 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="w-full h-full overflow-hidden">
              {renderModule()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sidebar layout - Clean minimal design (no internal horizontal borders — alignment comes from border-r only)
  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex">
      {/* Sidebar — continuous strip, no header/footer borders (like Figma/Linear) */}
      <div
        className={`${isExpanded ? 'w-52' : 'w-14'} h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out flex-shrink-0`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Hub Icon + Title */}
        <div className={`flex items-center pt-5 pb-6 ${isExpanded ? 'px-4 justify-between' : 'px-3 justify-center'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 bg-blue-50 rounded-xl">
              {HubIcon ? <HubIcon className="w-5 h-5 text-blue-600" /> : (
                <div className="flex items-center gap-0.5">
                  <div className="w-1.5 h-5 bg-gray-900 rounded-full"></div>
                  <div className="w-1.5 h-5 bg-gray-900 rounded-full"></div>
                  <div className="w-1.5 h-5 bg-gray-900 rounded-full"></div>
                </div>
              )}
            </div>
            {isExpanded && <span className="font-semibold text-gray-900 text-sm">{title}</span>}
          </div>
          {isExpanded && (
            <button
              onClick={toggleLockExpanded}
              className={`p-1.5 rounded transition-colors ${lockExpanded ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title={lockExpanded ? 'Unlock sidebar' : 'Lock sidebar open'}
            >
              {lockExpanded ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Module Navigation */}
        <nav className={`flex-1 overflow-y-auto px-1.5 pt-2`}>
          {modules.map((module, index) => {
            const Icon = module.icon;
            const isActive = activeModule === module.id;
            const prevGroup = index > 0 ? modules[index - 1].group : null;
            const showGroupHeader = module.group && module.group !== prevGroup;

            return (
              <React.Fragment key={module.id}>
                {showGroupHeader && isExpanded && (
                  <div className={`px-3 ${index > 0 ? 'pt-4' : 'pt-1'} pb-1.5`}>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{module.group}</span>
                  </div>
                )}
                {showGroupHeader && !isExpanded && index > 0 && (
                  <div className="mx-2 my-2 border-t border-gray-100" />
                )}
                <button
                  onClick={() => setActiveModule(module.id)}
                  className={`
                    w-full mb-1 rounded-lg flex items-center transition-all duration-150
                    ${isExpanded ? 'px-3 py-2.5 gap-3' : 'p-3 justify-center'}
                    ${isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                  title={!isExpanded ? (module.label || module.fullLabel) : undefined}
                >
                  <Icon className={`w-6 h-6 flex-shrink-0 ${isActive ? 'text-blue-600' : ''}`} />
                  {isExpanded && (
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : ''}`}>
                      {module.label || module.fullLabel}
                    </span>
                  )}
                  {isExpanded && module.badge && (
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                      {module.badge}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className={`pb-4 pt-2 ${isExpanded ? 'px-3' : 'px-1.5'}`}>
          <button className={`w-full rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex items-center ${isExpanded ? 'px-3 py-2.5 gap-3' : 'p-3 justify-center'}`}>
            <Settings className="w-5 h-5" />
            {isExpanded && <span className="text-sm">Settings</span>}
          </button>
          <button className={`w-full rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex items-center ${isExpanded ? 'px-3 py-2.5 gap-3' : 'p-3 justify-center'}`}>
            <HelpCircle className="w-5 h-5" />
            {isExpanded && <span className="text-sm">Help</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area — scaled to 90% for compact, information-dense UI */}
      <div className="flex-1 h-full overflow-hidden" style={{ zoom: 0.9 }}>
        {renderModule()}
      </div>
    </div>
  );
};

export default ModuleHub;