import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ModuleHub - A reusable hub component with Apple-inspired sidebar
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether the hub is open
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Hub title
 * @param {string} props.subtitle - Hub subtitle
 * @param {React.Component} props.icon - Hub icon component
 * @param {Array} props.modules - Array of module objects
 * @param {string} props.defaultModule - Default active module ID
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
  defaultModule = null
}) => {
  const [activeModule, setActiveModule] = useState(defaultModule || (modules[0]?.id || ''));

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

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Top Right Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
        title="Close (Esc)"
      >
        <X className="w-6 h-6 text-gray-600" />
      </button>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Enhanced Vertical Sidebar */}
        <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col">
          {/* Logo/Title Area */}
          <div className="h-24 px-6 flex items-center bg-white border-b border-gray-100">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
              {HubIcon ? <HubIcon className="w-6 h-6 text-white" /> : null}
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            </div>
          </div>
          
          {/* Module List */}
          <div className="flex-1 px-3 py-4 overflow-y-auto">
            {modules.map((module, index) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              const colors = colorStyles[module.color] || colorStyles.gray;
              
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module.id)}
                  className={`
                    w-full mb-2 px-4 py-4 rounded-xl flex items-center
                    transition-all duration-200 group relative
                    ${isActive 
                      ? 'bg-white shadow-md transform scale-[1.02]' 
                      : 'hover:bg-white/70 hover:shadow-sm'
                    }
                  `}
                >
                  {/* Icon with background */}
                  <div className={`
                    p-3 rounded-xl mr-4 transition-all duration-200 relative overflow-hidden
                    ${isActive 
                      ? `${colors.active} shadow-lg` 
                      : `${colors.inactive} group-hover:${colors.hover}`
                    }
                  `}>
                    {/* Gradient overlay for active state */}
                    {isActive && (
                      <div className={`absolute inset-0 bg-gradient-to-br ${colors.activeOverlay} to-transparent`} />
                    )}
                    <Icon className={`
                      w-5 h-5 relative z-10
                      ${isActive ? 'text-white' : ''}
                    `} />
                  </div>
                  
                  {/* Label and description */}
                  <div className="flex-1 text-left">
                    <div className={`font-semibold text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                      {module.fullLabel}
                    </div>
                    <div className={`text-xs mt-0.5 ${isActive ? 'text-gray-600' : 'text-gray-500'}`}>
                      {module.description}
                    </div>
                  </div>
                  
                  {/* Keyboard shortcut tooltip on hover */}
                  <div className={`
                    absolute -right-1 top-1/2 -translate-y-1/2
                    text-xs font-medium px-2 py-1 rounded-lg
                    bg-gray-900 text-white
                    transition-all duration-200 pointer-events-none
                    ${isActive 
                      ? 'opacity-0' 
                      : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1'
                    }
                  `}>
                    Press {index + 1}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Component Content */}
          <div className="flex-1 overflow-hidden">
            {renderModule()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleHub;