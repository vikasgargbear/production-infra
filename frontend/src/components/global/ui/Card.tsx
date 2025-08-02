import React, { ReactNode } from 'react';
import { theme } from '../../../config/theme.config';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';
type CardShadow = 'none' | 'sm' | 'md' | 'lg' | 'xl';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  padding?: CardPadding;
  shadow?: CardShadow;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

/**
 * Card Component
 * Consistent card styling across the application
 */
const Card: React.FC<CardProps> = ({
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
export const CardSection: React.FC<CardSectionProps> = ({ children, className = '', ...props }) => (
  <div className={`border-t border-gray-200 px-6 py-4 ${className}`.trim()} {...props}>
    {children}
  </div>
);

export default Card;
