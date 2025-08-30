/**
 * Return Steps Component
 * Displays the step indicator for return flow
 */
import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

const STEPS = [
  { id: 1, name: 'Select Source', icon: '📋' },
  { id: 2, name: 'Select Items', icon: '📦' },
  { id: 3, name: 'Review & Submit', icon: '✅' }
];

export default function ReturnSteps({ currentStep, onStepClick }) {
  return (
    <div className="flex items-center justify-center mb-6">
      {STEPS.map((step, index) => (
        <React.Fragment key={step.id}>
          <div 
            className={`flex items-center cursor-pointer ${
              currentStep === step.id ? 'text-blue-600' : 
              currentStep > step.id ? 'text-green-600' : 'text-gray-400'
            }`}
            onClick={() => onStepClick && onStepClick(step.id)}
          >
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center mr-2
              ${currentStep === step.id ? 'bg-blue-100 border-2 border-blue-600' : 
                currentStep > step.id ? 'bg-green-100 border-2 border-green-600' : 
                'bg-gray-100 border-2 border-gray-300'}
            `}>
              {currentStep > step.id ? (
                <Check className="w-5 h-5" />
              ) : (
                <span className="text-lg">{step.icon}</span>
              )}
            </div>
            <span className={`font-medium ${
              currentStep === step.id ? 'text-blue-600' : 
              currentStep > step.id ? 'text-green-600' : 'text-gray-500'
            }`}>
              {step.name}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <ChevronRight className="w-5 h-5 mx-4 text-gray-400" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}