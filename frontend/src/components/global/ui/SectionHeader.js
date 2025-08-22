import React from 'react';

/**
 * SectionHeader - Global component for consistent section headers across all modules
 * Ensures unified styling for form sections throughout the application
 */
const SectionHeader = ({ 
  title, 
  icon: Icon, 
  iconSize = 'sm', // sm: w-4 h-4, md: w-5 h-5, lg: w-6 h-6
  color = 'blue', // blue, gray, purple, green, indigo
  actions = null,
  className = ''
}) => {
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  const colorClasses = {
    blue: 'text-blue-700',
    gray: 'text-gray-700',
    purple: 'text-purple-700',
    green: 'text-green-700',
    indigo: 'text-indigo-700',
    orange: 'text-orange-700',
    red: 'text-red-700'
  };

  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h3 className={`text-sm font-semibold ${colorClasses[color]} uppercase tracking-wider flex items-center`}>
        {Icon && <Icon className={`${iconSizes[iconSize]} mr-2`} />}
        {title}
      </h3>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
};

export default SectionHeader;