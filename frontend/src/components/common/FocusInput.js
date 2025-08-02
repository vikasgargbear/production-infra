import React from 'react';

/**
 * FocusInput - A simple input component that works like a regular HTML input
 * This component replaces the previous implementation which had issues with continuous typing
 */
const FocusInput = ({ 
  value, 
  onChange, 
  type = 'text', 
  name, 
  id, 
  className, 
  placeholder,
  required,
  min,
  max,
  step,
  ...props 
}) => {
  // Simply use a regular input element for all types
  // This ensures continuous typing works properly
  return (
    <input
      type={type}
      name={name}
      id={id || name}
      value={value || ''}
      onChange={onChange}
      className={className}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      step={step}
      {...props}
    />
  );
};

export default FocusInput;
