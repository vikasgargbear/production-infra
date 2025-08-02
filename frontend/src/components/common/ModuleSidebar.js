import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ModuleSidebarV2 Component
 * A centered, sophisticated module selector with enterprise design
 */
const ModuleSidebarV2 = ({ 
  modules = [], 
  activeModule, 
  onModuleChange,
  onClose,
  title = "Select Module"
}) => {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (modules[index]) {
          onModuleChange(modules[index].id);
        }
      }
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [modules, onModuleChange, onClose]);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">Press number key to quick select</p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Module Grid */}
        <div className="p-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((module, index) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              const shortcutNumber = index + 1;
              
              return (
                <button
                  key={module.id}
                  onClick={() => onModuleChange(module.id)}
                  className={`
                    group relative p-6 rounded-2xl border-2 transition-all duration-200
                    ${isActive 
                      ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md bg-white'
                    }
                  `}
                >
                  {/* Shortcut Badge */}
                  <div className={`
                    absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    ${isActive 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                    }
                  `}>
                    {shortcutNumber}
                  </div>

                  {/* Icon */}
                  <div className={`
                    w-14 h-14 rounded-2xl flex items-center justify-center mb-4
                    bg-gradient-to-br ${module.gradient || 'from-gray-400 to-gray-500'}
                  `}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  
                  {/* Content */}
                  <div className="text-left">
                    <h3 className={`
                      font-semibold text-lg mb-1
                      ${isActive ? 'text-blue-900' : 'text-gray-900'}
                    `}>
                      {module.label}
                    </h3>
                    {module.description && (
                      <p className={`
                        text-sm
                        ${isActive ? 'text-blue-700' : 'text-gray-500'}
                      `}>
                        {module.description}
                      </p>
                    )}
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-blue-500 ring-offset-2 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Press 1-{modules.length} to select • ESC to close</span>
            {activeModule && (
              <span className="font-medium text-gray-700">
                Current: {modules.find(m => m.id === activeModule)?.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleSidebarV2;