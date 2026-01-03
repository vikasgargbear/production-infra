/**
 * Return Steps Component
 * Displays the step indicator for return flow
 */
import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Step {
    id: number;
    name: string;
    icon: string;
}

interface ReturnStepsProps {
    currentStep: number;
    onStepClick?: (stepId: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

const STEPS: Step[] = [
    { id: 1, name: 'Select Source', icon: '📋' },
    { id: 2, name: 'Select Items', icon: '📦' },
    { id: 3, name: 'Review & Submit', icon: '✅' }
];

// ============================================================================
// Component
// ============================================================================

const ReturnSteps: React.FC<ReturnStepsProps> = ({ currentStep, onStepClick }) => {
    const getStepStyles = (step: Step) => {
        if (currentStep > step.id) return { text: 'text-green-600', bg: 'bg-green-100 border-green-600' };
        if (currentStep === step.id) return { text: 'text-blue-600', bg: 'bg-blue-100 border-blue-600' };
        return { text: 'text-gray-400', bg: 'bg-gray-100 border-gray-300' };
    };

    return (
        <div className="flex items-center justify-center mb-6">
            {STEPS.map((step, index) => {
                const styles = getStepStyles(step);
                return (
                    <React.Fragment key={step.id}>
                        <div
                            className={`flex items-center cursor-pointer ${styles.text}`}
                            onClick={() => onStepClick?.(step.id)}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-2 border-2 ${styles.bg}`}>
                                {currentStep > step.id ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    <span className="text-lg">{step.icon}</span>
                                )}
                            </div>
                            <span className={`font-medium ${styles.text}`}>
                                {step.name}
                            </span>
                        </div>
                        {index < STEPS.length - 1 && (
                            <ChevronRight className="w-5 h-5 mx-4 text-gray-400" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default ReturnSteps;
