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
          block w-full rounded-md border-gray-300 shadow-sm
          focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm
          ${leftIcon ? 'pl-10' : 'pl-3'}
          ${rightIcon ? 'pr-10' : 'pr-3'}
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