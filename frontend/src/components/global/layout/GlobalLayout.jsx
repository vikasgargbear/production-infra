import React from 'react';
import { theme, classes } from '../../../config/theme.config';
import { DESIGN_TOKENS, getHeaderClasses, getCardClasses } from '../../../config/design-system.config';

/**
 * GlobalLayout Component
 * Provides consistent spacing and layout structure across all modules
 * Based on the successful Sales module design
 */
const GlobalLayout = ({ 
  children, 
  title,
  subtitle,
  icon: Icon,
  headerActions,
  className = '',
  variant = 'default' // 'default', 'compact', 'spacious'
}) => {
  
  const variants = {
    default: {
      container: 'h-full bg-gray-50',
      inner: 'h-full flex flex-col',
      content: 'flex-1 overflow-y-auto bg-gray-50',
      contentInner: 'max-w-6xl mx-auto px-6 py-6',
      spacing: 'space-y-6'
    },
    compact: {
      container: 'h-full bg-gray-50',
      inner: 'h-full flex flex-col', 
      content: 'flex-1 overflow-y-auto bg-gray-50',
      contentInner: 'max-w-5xl mx-auto px-4 py-4',
      spacing: 'space-y-4'
    },
    spacious: {
      container: 'h-full bg-gray-50',
      inner: 'h-full flex flex-col',
      content: 'flex-1 overflow-y-auto bg-gray-50', 
      contentInner: 'max-w-7xl mx-auto px-8 py-8',
      spacing: 'space-y-8'
    }
  };

  const currentVariant = variants[variant];

  return (
    <div className={`${currentVariant.container} ${className}`}>
      <div className={currentVariant.inner}>
        
        {/* Header Section - Simple like ModuleHeader/Sales */}
        {(title || Icon || headerActions) && (
          <div className="bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-3">
              {/* Left side - Title and info */}
              <div className="flex items-center gap-4">
                {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                  )}
                </div>
              </div>
              
              {/* Right side - Actions */}
              {headerActions && (
                <div className="flex items-center gap-2">
                  {headerActions}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className={currentVariant.content}>
          <div className={currentVariant.contentInner}>
            <div className={currentVariant.spacing}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * ContentCard Component
 * Consistent card styling for content sections
 */
export const ContentCard = ({ 
  children, 
  title, 
  subtitle,
  actions,
  className = '',
  padding = 'standard' // 'compact', 'standard', 'spacious'
}) => {
  const cardClasses = getCardClasses(padding);

  return (
    <div className={`${cardClasses.container} ${className}`}>
      {(title || actions) && (
        <div className={cardClasses.header}>
          <div className="flex items-center justify-between">
            <div>
              {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
              {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            </div>
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      <div className={cardClasses.content}>
        {children}
      </div>
    </div>
  );
};

/**
 * PageHeader Component
 * Consistent header for pages without full GlobalLayout
 */
export const PageHeader = ({ 
  title, 
  subtitle, 
  icon: Icon, 
  actions,
  breadcrumbs,
  className = '' 
}) => {
  return (
    <div className={`bg-white border-b border-gray-200 shadow-sm ${className}`}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        {breadcrumbs && (
          <div className="mb-4">
            <nav className="flex text-sm text-gray-500">
              {breadcrumbs}
            </nav>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {Icon && (
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Icon className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
              )}
            </div>
          </div>
          
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * FormSection Component
 * Consistent form section styling
 */
export const FormSection = ({ 
  title, 
  subtitle,
  icon: Icon,
  children,
  className = '',
  collapsible = false,
  defaultOpen = true
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const SectionWrapper = collapsible ? 'details' : 'div';
  const sectionProps = collapsible ? { open: isOpen } : {};

  return (
    <SectionWrapper 
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}
      {...sectionProps}
    >
      {collapsible ? (
        <summary 
          className="px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
          onClick={(e) => {
            e.preventDefault();
            setIsOpen(!isOpen);
          }}
        >
          <div className="flex items-center space-x-3">
            {Icon && <Icon className="w-5 h-5 text-blue-600" />}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <div className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </summary>
      ) : (
        title && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              {Icon && <Icon className="w-5 h-5 text-blue-600" />}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
              </div>
            </div>
          </div>
        )
      )}
      
      {(!collapsible || isOpen) && (
        <div className="p-6">
          {children}
        </div>
      )}
    </SectionWrapper>
  );
};

/**
 * StatsGrid Component  
 * Consistent stats display
 */
export const StatsGrid = ({ stats, className = '' }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
      {stats.map((stat, index) => (
        <div 
          key={index}
          className="bg-white rounded-lg border border-gray-200 px-6 py-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              {stat.change && (
                <p className={`text-sm ${stat.change.type === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.change.value}
                </p>
              )}
            </div>
            {stat.icon && (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.iconBg || 'bg-blue-100'}`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor || 'text-blue-600'}`} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GlobalLayout;