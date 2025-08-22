import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ContentSection - Global component for consistent content sections
 * Provides unified section styling with optional collapsible functionality
 */
const ContentSection = ({ 
  title,
  icon: Icon,
  iconColor = 'blue', // blue, gray, purple, green, indigo, orange
  collapsible = false,
  defaultExpanded = true,
  badge = null,
  actions = null,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  children
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const colorSchemes = {
    blue: {
      bg: 'from-blue-50 to-blue-100',
      border: 'border-blue-100',
      icon: 'bg-blue-500',
      text: 'text-blue-900'
    },
    gray: {
      bg: 'from-gray-50 to-gray-100',
      border: 'border-gray-100',
      icon: 'bg-gray-500',
      text: 'text-gray-900'
    },
    purple: {
      bg: 'from-purple-50 to-purple-100',
      border: 'border-purple-100',
      icon: 'bg-purple-500',
      text: 'text-purple-900'
    },
    green: {
      bg: 'from-green-50 to-green-100',
      border: 'border-green-100',
      icon: 'bg-green-500',
      text: 'text-green-900'
    },
    indigo: {
      bg: 'from-indigo-50 to-indigo-100',
      border: 'border-indigo-100',
      icon: 'bg-indigo-500',
      text: 'text-indigo-900'
    },
    orange: {
      bg: 'from-orange-50 to-orange-100',
      border: 'border-orange-100',
      icon: 'bg-orange-500',
      text: 'text-orange-900'
    }
  };

  const scheme = colorSchemes[iconColor] || colorSchemes.blue;

  const handleToggle = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div 
        className={`bg-gradient-to-r ${scheme.bg} px-6 py-4 border-b ${scheme.border} ${collapsible ? 'cursor-pointer' : ''} ${headerClassName}`}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {Icon && (
              <div className={`w-8 h-8 ${scheme.icon} rounded-lg flex items-center justify-center mr-3`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
            )}
            <h3 className={`text-sm font-semibold ${scheme.text} uppercase tracking-wider`}>
              {title}
            </h3>
            {badge && (
              <span className="ml-3 px-2 py-1 text-xs font-medium bg-white rounded-full">
                {badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {collapsible && (
              <button
                type="button"
                className={`p-1 hover:bg-white/50 rounded transition-colors ${scheme.text}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle();
                }}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {(!collapsible || isExpanded) && (
        <div className={`p-6 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
};

export default ContentSection;