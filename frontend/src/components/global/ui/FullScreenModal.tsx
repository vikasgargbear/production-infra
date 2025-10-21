/**
 * Full Screen Modal Component
 * 
 * Enterprise-grade modal that covers the entire window for immersive data entry.
 * Better for keyboard navigation and complex forms.
 */

import React, { useEffect } from 'react';
import { X, Minimize2, Maximize2 } from 'lucide-react';

interface FullScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'full' | 'large' | 'medium';
  showMinimize?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'full',
  showMinimize = false,
  footer,
  className = ''
}) => {
  const [isMinimized, setIsMinimized] = React.useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isMinimized) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isMinimized, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    full: 'inset-0',
    large: 'inset-4 md:inset-8 lg:inset-12',
    medium: 'inset-8 md:inset-16 lg:inset-24'
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-white border-2 border-gray-300 rounded-lg shadow-lg px-4 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="font-medium">{title}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div 
        className={`absolute ${sizeClasses[size]} bg-white rounded-lg shadow-2xl flex flex-col animate-fadeIn ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showMinimize && (
              <button
                onClick={() => setIsMinimized(true)}
                className="p-2 hover:bg-white rounded-lg transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Slide-in Panel (Alternative to Full Screen)
 * Slides in from the right side
 */
interface SlideInPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  footer?: React.ReactNode;
}

export const SlideInPanel: React.FC<SlideInPanelProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'xl',
  footer
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-full'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Slide Panel */}
      <div 
        className={`absolute right-0 top-0 bottom-0 ${widthClasses[width]} w-full bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col`}
        style={{ 
          animation: 'slideInRight 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default FullScreenModal;
