import React from 'react';

/**
 * LoadingState Component
 * Consistent loading state display across the application
 */
const LoadingState = ({
  message = 'Loading...',
  size = 'md',
  fullScreen = false,
  className = ''
}) => {
  const sizeMap = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const spinnerSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div className={`flex flex-col items-center justify-center ${className}`.trim()}>
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${spinnerSize}`} />
      {message && (
        <p className="mt-4 text-sm text-gray-600">{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return (
    <div className="p-8">
      {content}
    </div>
  );
};

// Skeleton loader for content placeholders
export const SkeletonLoader = ({ lines = 3, className = '' }) => (
  <div className={`space-y-3 ${className}`.trim()}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="h-4 bg-gray-200 rounded animate-pulse"
        style={{ width: `${Math.random() * 40 + 60}%` }}
      />
    ))}
  </div>
);

export default LoadingState;