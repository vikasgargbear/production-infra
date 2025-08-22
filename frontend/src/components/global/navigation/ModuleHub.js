import React, { useState, useEffect } from 'react';
import { X, Settings, HelpCircle, ChevronRight, Activity } from 'lucide-react';

/**
 * ModuleHub - A reusable hub component with Apple-inspired layout
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether the hub is open
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Hub title
 * @param {string} props.subtitle - Hub subtitle
 * @param {React.Component} props.icon - Hub icon component
 * @param {Array} props.modules - Array of module objects
 * @param {string} props.defaultModule - Default active module ID
 * @param {('sidebar'|'centered')} props.layout - Layout variant
 * 
 * Module object structure:
 * {
 *   id: string,
 *   label: string,
 *   fullLabel: string,
 *   description: string,
 *   icon: React.Component,
 *   color: string (tailwind color name),
 *   component: React.Component
 * }
 */
const ModuleHub = ({ 
  open = true, 
  onClose, 
  title = "Module Hub",
  subtitle = "Select a module",
  icon: HubIcon,
  modules = [],
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
      // Number keys for module selection
      if (e.key >= '1' && e.key <= '9' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (modules[index]) {
          setActiveModule(modules[index].id);
        }
      }
      
      // ESC to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
      {/* Enhanced Sidebar with Pharma Theme */}
      <div className="w-80 h-full bg-gradient-to-b from-blue-50 to-green-50 p-3">
        <div className="h-full bg-white rounded-2xl shadow-lg border border-blue-100 flex flex-col">
          {/* Header - Clean Pharma Design */}
          <div className="p-5 border-b border-gray-100 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-xl flex items-center justify-center shadow-md">
                {HubIcon ? <HubIcon className="w-5 h-5 text-white" /> : null}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{title}</h3>
                <p className="text-xs text-gray-500">Operations Center</p>
              </div>
            </div>
          </div>
        
          {/* Module List - Clean Pharma Design */}
          <div className="flex-1 overflow-y-auto py-2">
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
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md' 
                        : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-500'}`} />
                      <div className="text-left">
                        <div className="text-sm font-medium">
                          {module.label || module.fullLabel}
                        </div>
                        {module.description && (
                          <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                            {module.description}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Keyboard hint */}
                    <span className={`
                      text-xs font-mono px-1.5 py-0.5 rounded
                      ${isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-gray-100 text-gray-500'
                      }
                    `}>
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Pro Tip Section */}
          <div className="p-4 border-t border-gray-100">
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <span className="text-xs text-gray-500">Pro Tip</span>
              </div>
              <p className="text-xs text-gray-600 mb-2">
                Use number keys <kbd className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">1-{modules.length}</kbd> to quickly navigate between modules
              </p>
              <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                View all shortcuts
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 rounded-b-2xl">
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