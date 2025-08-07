import React from 'react';
import { Search } from 'lucide-react';

interface MinimalInputProps {
  type?: 'text' | 'number' | 'email' | 'password' | 'search' | 'date';
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
}

const MinimalInput: React.FC<MinimalInputProps> = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  className = '',
  icon,
  disabled = false,
  autoFocus = false,
}) => {
  const baseClass = 'w-full py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors';
  const paddingClass = icon ? 'pl-10 pr-4' : 'px-4';

  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
          {icon}
        </div>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`${baseClass} ${paddingClass} ${className}`}
      />
    </div>
  );
};

export default MinimalInput;