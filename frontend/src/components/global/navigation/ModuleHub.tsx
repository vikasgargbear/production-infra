import React, { useState, useEffect } from 'react';
import { X, Settings, HelpCircle, ChevronRight, Activity, LucideIcon } from 'lucide-react';

// TypeScript interface for module configuration
export interface Module {
  id: string;
  label?: string;
  fullLabel: string;
  description?: string;
  icon: LucideIcon;
  color: string;
  component?: React.ComponentType<{ open?: boolean; onClose?: () => void }>;
  badge?: string;
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
      inactive: 'bg-teal-100 text-teal-600',
      hover: 'bg-teal-200',
      active: 'bg-teal-700', // Darker for better contrast
      activeOverlay: 'from-teal-400/30'
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Number keys for module selection - require Ctrl/Cmd modifier
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (modules[index]) {
          setActiveModule(modules[index].id);
        }
      }

      // ESC to close
      if (e.key === 'Escape') {
        e.preventDefault();
        if (onClose) onClose();
      }
    };

    if (open) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [open, modules, onClose]);

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

  // Sidebar layout (default) - Enhanced with pharma-themed design
  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex">
      {/* Enhanced Sidebar with Medical Theme - Professional Healthcare Aesthetics */}
      <div className="w-80 h-full bg-gradient-to-b from-teal-50 via-cyan-50 to-emerald-50 p-3">
        <div className="h-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-teal-100/50 flex flex-col">
          {/* Header - Professional Medical Design */}
          <div className="p-5 border-b border-teal-100/30 rounded-t-2xl bg-gradient-to-r from-teal-50/50 to-cyan-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                {HubIcon ? <HubIcon className="w-5 h-5 text-white" /> : null}
              </div>
              <div>
                <h3 className="font-semibold text-teal-900">{title}</h3>
                <p className="text-xs text-teal-600">Healthcare Operations</p>
              </div>
            </div>
          </div>

          {/* Module List - Medical Professional Design */}
          <div className="flex-1 overflow-y-auto py-2 bg-gradient-to-b from-transparent to-teal-50/10">
            <nav className="px-3">
              {modules.map((module, index) => {
                const Icon = module.icon;
                const isActive = activeModule === module.id;
                const colors = colorStyles[module.color] || colorStyles.gray;

                return (
                  <button
                    key={module.id}
                    onClick={() => setActiveModule(module.id)}
                    className={`
                      w-full mb-1 px-3 py-2.5 rounded-xl flex items-center justify-between
                      transition-all duration-200 group
                      ${isActive
                        ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25'
                        : 'hover:bg-teal-50/50 text-slate-700 hover:text-teal-900 hover:shadow-sm'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-teal-600 group-hover:text-cyan-600'}`} />
                      <div className="text-left">
                        <div className="text-sm font-medium">
                          {module.label || module.fullLabel}
                        </div>
                        {module.description && (
                          <div className={`text-xs ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>
                            {module.description}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status indicator or badge */}
                    {module.badge && (
                      <span className={`
                        text-xs px-1.5 py-0.5 rounded
                        ${isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-teal-100/50 text-teal-700'
                        }
                      `}>
                        {module.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Medical Tip Section */}
          <div className="p-4 border-t border-teal-100/30">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 mb-3 border border-teal-100/50">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-5 h-5 text-teal-600" />
                <span className="text-xs text-teal-700 font-medium">Healthcare Tip</span>
              </div>
              <p className="text-xs text-slate-600 mb-2">
                Press <kbd className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-mono">Ctrl+1</kbd> to <kbd className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-mono">Ctrl+{modules.length}</kbd> to quickly navigate between modules
              </p>
              <button className="text-xs text-teal-600 hover:text-cyan-700 font-medium flex items-center gap-1 transition-colors">
                View all shortcuts
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Footer - Medical Professional */}
          <div className="p-4 border-t border-teal-100/30 rounded-b-2xl bg-gradient-to-r from-teal-50/30 to-cyan-50/30">
            <div className="flex items-center justify-between">
              <button className="p-2 hover:bg-teal-100/50 rounded-lg transition-all hover:shadow-sm">
                <Settings className="w-4 h-4 text-teal-600" />
              </button>
              <button className="p-2 hover:bg-teal-100/50 rounded-lg transition-all hover:shadow-sm">
                <HelpCircle className="w-4 h-4 text-teal-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 h-full bg-white shadow-xl">
        <div className="h-full overflow-hidden">
          {renderModule()}
        </div>
      </div>
    </div>
  );
};

export default ModuleHub;