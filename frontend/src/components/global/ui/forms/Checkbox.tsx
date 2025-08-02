import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({ 
  label, 
  indeterminate = false,
  className = '', 
  ...props 
}) => {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className="flex items-center">
      <input
        ref={ref}
        type="checkbox"
        className={`
          h-4 w-4 text-indigo-600 focus:ring-indigo-500 
          border-gray-300 rounded
          ${className}
        `}
        {...props}
      />
      {label && <span className="ml-2 text-sm text-gray-700">{label}</span>}
    </label>
  );
};

export default Checkbox;