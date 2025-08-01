import React, { forwardRef, HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  hoverable?: boolean;
  clickable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

const variantStyles = {
  elevated: 'bg-white shadow-md',
  outlined: 'bg-white border border-gray-200',
  flat: 'bg-gray-50',
};

const paddingStyles = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
};

const roundedStyles = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  children,
  variant = 'elevated',
  padding = 'md',
  rounded = 'lg',
  hoverable = false,
  clickable = false,
  header,
  footer,
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  className = '',
  ...props
}, ref) => {
  const baseStyles = 'transition-all duration-200';
  const hoverStyles = hoverable ? 'hover:shadow-lg' : '';
  const clickableStyles = clickable ? 'cursor-pointer active:scale-[0.98]' : '';
  
  const cardStyles = [
    baseStyles,
    variantStyles[variant],
    roundedStyles[rounded],
    hoverStyles,
    clickableStyles,
    className,
  ].filter(Boolean).join(' ');
  
  const headerPadding = padding === 'none' ? 'px-4 py-3' : '';
  const footerPadding = padding === 'none' ? 'px-4 py-3' : '';
  
  // If no header/footer, render simple card
  if (!header && !footer) {
    return (
      <div
        ref={ref}
        className={`${cardStyles} ${paddingStyles[padding]}`}
        {...props}
      >
        {children}
      </div>
    );
  }
  
  // Render card with sections
  return (
    <div ref={ref} className={cardStyles} {...props}>
      {header && (
        <div className={`border-b border-gray-200 ${headerPadding} ${headerClassName}`}>
          {header}
        </div>
      )}
      
      <div className={`${paddingStyles[padding]} ${bodyClassName}`}>
        {children}
      </div>
      
      {footer && (
        <div className={`border-t border-gray-200 ${footerPadding} ${footerClassName}`}>
          {footer}
        </div>
      )}
    </div>
  );
});

Card.displayName = 'Card';

// Card Header component for convenience
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  ...props
}) => {
  if (children) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }
  
  return (
    <div className={`flex items-center justify-between ${className}`} {...props}>
      <div>
        {title && (
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        )}
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="ml-4 flex-shrink-0">{action}</div>
      )}
    </div>
  );
};

CardHeader.displayName = 'CardHeader';