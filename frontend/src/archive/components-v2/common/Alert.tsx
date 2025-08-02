import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

export interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
  icon?: React.ReactNode;
  showIcon?: boolean;
  className?: string;
  action?: React.ReactNode;
}

const typeConfig = {
  info: {
    icon: <Info className="w-5 h-5" />,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-800',
  },
  success: {
    icon: <CheckCircle className="w-5 h-5" />,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    iconColor: 'text-green-600',
    textColor: 'text-green-800',
  },
  warning: {
    icon: <AlertCircle className="w-5 h-5" />,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    textColor: 'text-amber-800',
  },
  error: {
    icon: <XCircle className="w-5 h-5" />,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    textColor: 'text-red-800',
  },
};

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  message,
  closable = false,
  onClose,
  icon,
  showIcon = true,
  className = '',
  action,
}) => {
  const config = typeConfig[type];
  const displayIcon = icon || config.icon;
  
  return (
    <div
      className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor} ${className}`}
      role="alert"
    >
      <div className="flex">
        {showIcon && (
          <div className={`flex-shrink-0 ${config.iconColor}`}>
            {displayIcon}
          </div>
        )}
        
        <div className={`${showIcon ? 'ml-3' : ''} flex-1`}>
          {title && (
            <h3 className={`text-sm font-medium ${config.textColor} mb-1`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${config.textColor}`}>
            {message}
          </div>
          {action && (
            <div className="mt-3">
              {action}
            </div>
          )}
        </div>
        
        {closable && (
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className={`inline-flex rounded-md p-1.5 ${config.textColor} hover:${config.bgColor} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-${config.bgColor} focus:ring-${config.borderColor}`}
            >
              <span className="sr-only">Dismiss</span>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Toast notification component
export interface ToastProps extends AlertProps {
  id?: string;
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

export const Toast: React.FC<ToastProps> = ({
  duration = 5000,
  onClose,
  ...alertProps
}) => {
  React.useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);
  
  return (
    <div className="pointer-events-auto">
      <Alert
        {...alertProps}
        closable={true}
        onClose={onClose}
        className="shadow-lg"
      />
    </div>
  );
};