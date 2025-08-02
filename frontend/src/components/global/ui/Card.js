import React from 'react';
import { theme } from '../../../config/theme.config';

/**
 * Card Component
 * Consistent card styling across the application
 */
const Card = ({
  children,
  title,
  subtitle,
  actions,
  padding = 'md',
  shadow = 'sm',
  className = '',
  headerClassName = '',
  bodyClassName = '',
  ...props
}) => {
  const baseClasses = theme.components.card.base;
  const paddingClasses = theme.components.card.padding[padding];
  const shadowClasses = theme.components.card.shadow[shadow];

  const cardClasses = `
    ${baseClasses}
    ${shadowClasses}
    ${className}
  `.trim();

  return (
    <div className={cardClasses} {...props}>
      {(title || subtitle || actions) && (
        <div className={`${paddingClasses} border-b border-gray-200 ${headerClassName}`.trim()}>
          <div className="flex items-center justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex items-center space-x-3">{actions}</div>
            )}
          </div>
        </div>
      )}
      <div className={`${paddingClasses} ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
};

// Card Section Component for complex layouts
export const CardSection = ({ children, className = '', ...props }) => (
  <div className={`border-t border-gray-200 px-6 py-4 ${className}`.trim()} {...props}>
    {children}
  </div>
);

export default Card;