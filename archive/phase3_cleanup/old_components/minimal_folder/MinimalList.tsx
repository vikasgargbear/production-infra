import React from 'react';
import { ChevronRight } from 'lucide-react';

interface MinimalListItemProps {
  primary: string;
  secondary?: string;
  value?: string | React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  showArrow?: boolean;
}

export const MinimalListItem: React.FC<MinimalListItemProps> = ({
  primary,
  secondary,
  value,
  onClick,
  icon,
  showArrow = true,
}) => {
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      className={`w-full p-4 flex items-center justify-between ${
        onClick ? 'hover:bg-gray-50 cursor-pointer' : ''
      } transition-colors`}
      onClick={onClick}
    >
      <div className="flex items-center flex-1">
        {icon && <div className="mr-3">{icon}</div>}
        <div className="text-left">
          <div className="font-medium text-gray-900">{primary}</div>
          {secondary && <div className="text-sm text-gray-500">{secondary}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {value && <div className="text-gray-900">{value}</div>}
        {onClick && showArrow && <ChevronRight className="w-5 h-5 text-gray-400" />}
      </div>
    </Component>
  );
};

interface MinimalListProps {
  children: React.ReactNode;
  className?: string;
}

const MinimalList: React.FC<MinimalListProps> = ({ children, className = '' }) => {
  return (
    <div className={`divide-y divide-gray-100 ${className}`}>
      {children}
    </div>
  );
};

export default MinimalList;