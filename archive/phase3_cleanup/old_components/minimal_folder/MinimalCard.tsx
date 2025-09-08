import React from 'react';

interface MinimalCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

const MinimalCard: React.FC<MinimalCardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false,
}) => {
  const baseClass = 'bg-white rounded-lg border border-gray-200';
  const hoverClass = hoverable ? 'hover:bg-gray-50 cursor-pointer transition-colors' : '';

  return (
    <div
      className={`${baseClass} ${hoverClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default MinimalCard;