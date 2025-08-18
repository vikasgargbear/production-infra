import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Sparkles, Zap, Shield } from 'lucide-react';

// Toast Context
const ToastContext = createContext();

// Toast Provider Component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000, options = {}) => {
    const id = Date.now() + Math.random();
    const newToast = { 
      id, 
      message, 
      type, 
      duration,
      title: options.title,
      action: options.action,
      icon: options.icon
    };
    
    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const toast = {
    success: (message, duration = 4000, options = {}) => addToast(message, 'success', duration, options),
    error: (message, duration = 6000, options = {}) => addToast(message, 'error', duration, options),
    info: (message, duration = 4000, options = {}) => addToast(message, 'info', duration, options),
    warning: (message, duration = 5000, options = {}) => addToast(message, 'warning', duration, options),
    // Modern action-based toasts
    created: (itemName, duration = 4000, options = {}) => addToast(
      `${itemName} has been created`, 
      'success', 
      duration, 
      { 
        title: 'Created Successfully',
        icon: Sparkles,
        ...options 
      }
    ),
    updated: (itemName, duration = 4000, options = {}) => addToast(
      `${itemName} has been updated`, 
      'success', 
      duration, 
      { 
        title: 'Updated Successfully',
        icon: Zap,
        ...options 
      }
    ),
    saved: (itemName, duration = 4000, options = {}) => addToast(
      `${itemName} has been saved`, 
      'success', 
      duration, 
      { 
        title: 'Saved Successfully',
        icon: Shield,
        ...options 
      }
    ),
    deleted: (itemName, duration = 4000, options = {}) => addToast(
      `${itemName} has been removed`, 
      'success', 
      duration, 
      { 
        title: 'Removed Successfully',
        icon: CheckCircle,
        ...options 
      }
    ),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Individual Toast Component
const Toast = ({ toast, removeToast }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
    Sparkles: <Sparkles className="w-5 h-5" />,
    Zap: <Zap className="w-5 h-5" />,
    Shield: <Shield className="w-5 h-5" />
  };

  const colors = {
    success: 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border-green-200/50',
    error: 'bg-gradient-to-r from-red-50 to-rose-50 text-red-800 border-red-200/50',
    warning: 'bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-800 border-yellow-200/50',
    info: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 border-blue-200/50'
  };

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600'
  };

  // Determine the icon to display
  let IconToRender;
  if (toast.icon) {
    // If a custom icon is provided
    if (typeof toast.icon === 'function') {
      // It's a component constructor, render it
      const IconFunc = toast.icon;
      IconToRender = <IconFunc className="w-5 h-5" />;
    } else if (React.isValidElement(toast.icon)) {
      // It's already a React element
      IconToRender = toast.icon;
    } else if (typeof toast.icon === 'string' && icons[toast.icon]) {
      // It's a string key for the icons object
      IconToRender = icons[toast.icon];
    } else {
      // Fallback to type icon
      IconToRender = icons[toast.type];
    }
  } else {
    // No custom icon, use the type icon
    IconToRender = icons[toast.type];
  }

  return (
    <div
      className={`
        flex items-start gap-4 p-4 rounded-xl border backdrop-blur-sm
        ${colors[toast.type]}
        ${isExiting ? 'animate-slide-out' : 'animate-slide-in'}
        transition-all duration-300 ease-out
        min-w-[320px] max-w-[420px]
        shadow-lg hover:shadow-xl
        transform hover:scale-[1.02]
      `}
    >
      <div className={`${iconColors[toast.type]} flex-shrink-0 mt-0.5`}>
        {IconToRender}
      </div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-semibold mb-1">{toast.title}</p>
        )}
        <p className="text-sm leading-relaxed">{toast.message}</p>
        {toast.action && (
          <div className="mt-2">
            {React.isValidElement(toast.action) ? toast.action : null}
          </div>
        )}
      </div>
      <button
        onClick={handleRemove}
        className="p-1 hover:bg-black/10 rounded-lg transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Toast Container Component
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 space-y-3 max-w-md w-full px-4 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} removeToast={removeToast} />
        </div>
      ))}
    </div>
  );
};

// CSS animations
const toastStyles = `
  @keyframes slide-in {
    from {
      transform: translateY(-100%) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @keyframes slide-out {
    from {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    to {
      transform: translateY(-100%) scale(0.95);
      opacity: 0;
    }
  }

  .animate-slide-in {
    animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .animate-slide-out {
    animation: slide-out 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleTag = document.createElement('style');
  styleTag.innerHTML = toastStyles;
  document.head.appendChild(styleTag);
}

export default Toast;