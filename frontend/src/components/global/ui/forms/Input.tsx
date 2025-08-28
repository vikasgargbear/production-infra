import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ 
  leftIcon, 
  rightIcon, 
  className = '', 
  ...props 
}) => {
  return (
    <div className="relative">
      {leftIcon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {leftIcon}
        </div>
      )}
      <input
        className={`
          block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm
          focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none
          text-sm transition-colors
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${leftIcon ? 'pl-10' : ''}
          ${rightIcon ? 'pr-10' : ''}
          ${className}
        `}
        {...props}
      />
      {rightIcon && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          {rightIcon}
        </div>
      )}
    </div>
  );
};

export default Input;