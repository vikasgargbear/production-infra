import React from 'react';

export interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  showLabel?: boolean;
  label?: string;
  striped?: boolean;
  animated?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantStyles = {
  primary: 'bg-blue-600',
  success: 'bg-green-600',
  warning: 'bg-amber-600',
  error: 'bg-red-600',
  info: 'bg-cyan-600',
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  size = 'md',
  variant = 'primary',
  showLabel = false,
  label,
  striped = false,
  animated = false,
  className = '',
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const displayLabel = label || `${Math.round(percentage)}%`;
  
  const stripedStyles = striped
    ? 'bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:1rem_1rem]'
    : '';
    
  const animatedStyles = animated && striped
    ? 'animate-[progress-stripes_1s_linear_infinite]'
    : '';
  
  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-700">{displayLabel}</span>
        </div>
      )}
      
      <div
        className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeStyles[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`
            h-full rounded-full transition-all duration-300 ease-out
            ${variantStyles[variant]}
            ${stripedStyles}
            ${animatedStyles}
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Circular Progress component
export interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const circularVariantStyles = {
  primary: 'text-blue-600',
  success: 'text-green-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
  info: 'text-cyan-600',
};

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  variant = 'primary',
  showLabel = true,
  label,
  className = '',
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const displayLabel = label || `${Math.round(percentage)}%`;
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className={`relative inline-flex ${className}`}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-300 ease-out ${circularVariantStyles[variant]}`}
        />
      </svg>
      
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-700">
            {displayLabel}
          </span>
        </div>
      )}
    </div>
  );
};

// Steps Progress component
export interface Step {
  key: string;
  title: string;
  description?: string;
  status?: 'completed' | 'active' | 'pending' | 'error';
}

export interface StepsProgressProps {
  steps: Step[];
  currentStep?: number;
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StepsProgress: React.FC<StepsProgressProps> = ({
  steps,
  currentStep = 0,
  orientation = 'horizontal',
  size = 'md',
  className = '',
}) => {
  const stepSizeStyles = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };
  
  const getStepStatus = (index: number): 'completed' | 'active' | 'pending' | 'error' => {
    if (steps[index].status) return steps[index].status;
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'active';
    return 'pending';
  };
  
  const stepStatusStyles = {
    completed: 'bg-green-600 text-white',
    active: 'bg-blue-600 text-white',
    pending: 'bg-gray-200 text-gray-500',
    error: 'bg-red-600 text-white',
  };
  
  return (
    <div
      className={`
        ${orientation === 'horizontal' ? 'flex items-center' : 'flex flex-col'}
        ${className}
      `}
    >
      {steps.map((step, index) => {
        const status = getStepStatus(index);
        const isLast = index === steps.length - 1;
        
        return (
          <div
            key={step.key}
            className={`
              flex items-center
              ${orientation === 'horizontal' ? 'flex-1' : 'w-full'}
            `}
          >
            {/* Step */}
            <div className={orientation === 'vertical' ? 'flex items-start' : ''}>
              <div
                className={`
                  rounded-full flex items-center justify-center font-medium
                  ${stepSizeStyles[size]}
                  ${stepStatusStyles[status]}
                `}
              >
                {status === 'completed' ? '✓' : index + 1}
              </div>
              
              <div className={orientation === 'horizontal' ? 'ml-3' : 'ml-3 flex-1'}>
                <p className={`font-medium text-gray-900 ${size === 'sm' ? 'text-sm' : ''}`}>
                  {step.title}
                </p>
                {step.description && (
                  <p className={`text-gray-500 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
                    {step.description}
                  </p>
                )}
              </div>
            </div>
            
            {/* Connector */}
            {!isLast && (
              <div
                className={`
                  ${
                    orientation === 'horizontal'
                      ? 'flex-1 h-0.5 mx-3'
                      : 'w-0.5 h-12 ml-4 mt-2'
                  }
                  ${
                    index < currentStep
                      ? 'bg-green-600'
                      : 'bg-gray-200'
                  }
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};