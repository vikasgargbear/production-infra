import React from 'react';
import { Package, Loader2 } from 'lucide-react';

const LoadingSpinner = ({ message = "Loading...", size = "default" }) => {
  const sizeClasses = {
    small: "w-8 h-8",
    default: "w-12 h-12",
    large: "w-16 h-16"
  };

  const containerClasses = {
    small: "p-4",
    default: "p-8",
    large: "p-12"
  };

  return (
    <div className={`min-h-screen bg-gray-50 flex items-center justify-center ${containerClasses[size]}`}>
      <div className="text-center animate-fade-in">
        {/* Logo Container */}
        <div className="relative mb-6">
          {/* Main Logo */}
          <div className={`${sizeClasses[size]} mx-auto bg-gradient-to-br from-pharma-orange-600 to-red-600 rounded-2xl flex items-center justify-center shadow-pharma animate-pulse-slow`}>
            <Package className={`${size === 'large' ? 'w-8 h-8' : size === 'small' ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
          </div>
          
          {/* Loading Indicator */}
          <div className="absolute -bottom-2 -right-2">
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-pharma-green-500">
              <Loader2 className="w-3 h-3 text-pharma-green-600 animate-spin" />
            </div>
          </div>
        </div>

        {/* Brand Text */}
        <div className="mb-4">
          <h1 className="text-xl font-bold bg-gradient-to-br from-gray-800 to-gray-600 bg-clip-text text-transparent mb-1">
            AASO Pharma
          </h1>
          <p className="text-sm text-pharma-orange-600 font-semibold">
            Pharmaceutical Excellence
          </p>
        </div>

        {/* Loading Message */}
        <p className="text-gray-600 font-medium">{message}</p>

        {/* Loading Bar */}
        <div className="mt-6 w-48 mx-auto">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pharma-orange-500 to-pharma-orange-600 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Floating Dots Animation */}
        <div className="flex justify-center items-center gap-1 mt-4">
          <div className="w-2 h-2 bg-pharma-orange-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-pharma-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-pharma-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};

// Alternative minimal spinner for inline loading
export const InlineSpinner = ({ size = "sm", message }) => {
  const spinnerSizes = {
    xs: "w-3 h-3",
    sm: "w-4 h-4", 
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };

  return (
    <div className="flex items-center justify-center gap-3 p-4">
      <Loader2 className={`${spinnerSizes[size]} text-pharma-orange-600 animate-spin`} />
      {message && (
        <span className="text-sm text-gray-600 font-medium">{message}</span>
      )}
    </div>
  );
};

// Skeleton loader for content
export const SkeletonLoader = ({ lines = 3, className = "" }) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="space-y-3">
          <div className="h-4 bg-gray-200 rounded-lg"></div>
          {index < lines - 1 && <div className="h-4 bg-gray-200 rounded-lg w-5/6"></div>}
        </div>
      ))}
    </div>
  );
};

export default LoadingSpinner; 