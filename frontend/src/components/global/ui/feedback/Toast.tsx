import React, { useState, createContext, useContext, useCallback, ReactNode, ReactElement } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Sparkles, Zap, Shield, LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    title?: string;
    action?: ReactElement;
    icon?: LucideIcon | ReactElement | string;
}

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    duration: number;
    title?: string;
    action?: ReactElement;
    icon?: LucideIcon | ReactElement | string;
}

interface ToastMethods {
    success: (message: string, duration?: number, options?: ToastOptions) => void;
    error: (message: string, duration?: number, options?: ToastOptions) => void;
    info: (message: string, duration?: number, options?: ToastOptions) => void;
    warning: (message: string, duration?: number, options?: ToastOptions) => void;
    created: (itemName: string, duration?: number, options?: ToastOptions) => void;
    updated: (itemName: string, duration?: number, options?: ToastOptions) => void;
    saved: (itemName: string, duration?: number, options?: ToastOptions) => void;
    deleted: (itemName: string, duration?: number, options?: ToastOptions) => void;
}

interface ToastProviderProps {
    children: ReactNode;
}

interface ToastProps {
    toast: ToastItem;
    removeToast: (id: number) => void;
}

interface ToastContainerProps {
    toasts: ToastItem[];
    removeToast: (id: number) => void;
}

// ==================== CONTEXT ====================

const ToastContext = createContext<ToastMethods | undefined>(undefined);
let nextToastId = 1;

// ==================== PROVIDER ====================

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000, options: ToastOptions = {}) => {
        const id = nextToastId++;
        const newToast: ToastItem = {
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
    }, [removeToast]);

    const toast: ToastMethods = {
        success: (message, duration = 4000, options = {}) => addToast(message, 'success', duration, options),
        error: (message, duration = 6000, options = {}) => addToast(message, 'error', duration, options),
        info: (message, duration = 4000, options = {}) => addToast(message, 'info', duration, options),
        warning: (message, duration = 5000, options = {}) => addToast(message, 'warning', duration, options),
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

// ==================== HOOK ====================

export const useToast = (): ToastMethods => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// ==================== TOAST COMPONENT ====================

const Toast: React.FC<ToastProps> = ({ toast, removeToast }) => {
    const [isExiting, setIsExiting] = useState<boolean>(false);

    // Safety check for undefined toast prop - moved AFTER hooks
    if (!toast) return null;

    const handleRemove = (): void => {
        setIsExiting(true);
        setTimeout(() => {
            removeToast(toast.id);
        }, 300);
    };

    const icons: Record<string, ReactElement> = {
        success: <CheckCircle className="w-5 h-5" />,
        error: <AlertCircle className="w-5 h-5" />,
        warning: <AlertTriangle className="w-5 h-5" />,
        info: <Info className="w-5 h-5" />,
        Sparkles: <Sparkles className="w-5 h-5" />,
        Zap: <Zap className="w-5 h-5" />,
        Shield: <Shield className="w-5 h-5" />
    };

    const colors: Record<ToastType, string> = {
        success: 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border-green-200/50',
        error: 'bg-gradient-to-r from-red-50 to-rose-50 text-red-800 border-red-200/50',
        warning: 'bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-800 border-yellow-200/50',
        info: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 border-blue-200/50'
    };

    const iconColors: Record<ToastType, string> = {
        success: 'text-green-600',
        error: 'text-red-600',
        warning: 'text-yellow-600',
        info: 'text-blue-600'
    };

    let IconToRender: ReactElement;
    if (toast.icon) {
        if (typeof toast.icon === 'function') {
            const IconFunc = toast.icon as LucideIcon;
            IconToRender = <IconFunc className="w-5 h-5" />;
        } else if (React.isValidElement(toast.icon)) {
            IconToRender = toast.icon;
        } else if (typeof toast.icon === 'string' && icons[toast.icon]) {
            IconToRender = icons[toast.icon];
        } else {
            IconToRender = icons[toast.type];
        }
    } else {
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

// ==================== CONTAINER ====================

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
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

// ==================== STYLES ====================

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

if (typeof document !== 'undefined') {
    const styleTag = document.createElement('style');
    styleTag.innerHTML = toastStyles;
    document.head.appendChild(styleTag);
}

export default Toast;

// Re-export types
export type { ToastType, ToastOptions, ToastItem, ToastMethods };
