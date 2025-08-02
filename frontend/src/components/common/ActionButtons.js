import React from 'react';
import { Button } from '../global';
import KeyboardShortcut from './KeyboardShortcut';

/**
 * ActionButtons Component
 * Consistent action button layouts (Cancel/Proceed, etc.)
 */
const ActionButtons = ({
  primaryLabel = 'Proceed',
  primaryAction,
  primaryIcon,
  primaryShortcut,
  primaryVariant = 'primary',
  primaryLoading = false,
  secondaryLabel = 'Cancel',
  secondaryAction,
  secondaryIcon,
  secondaryShortcut,
  secondaryVariant = 'secondary',
  additionalActions = [],
  layout = 'right', // 'right', 'center', 'space-between'
  className = ''
}) => {
  const layoutClasses = {
    right: 'flex items-center justify-end space-x-3',
    center: 'flex items-center justify-center space-x-3',
    'space-between': 'flex items-center justify-between'
  };

  return (
    <div className={`${layoutClasses[layout]} ${className}`.trim()}>
      {layout === 'space-between' && additionalActions.length > 0 && (
        <div className="flex items-center space-x-3">
          {additionalActions.map((action, index) => (
            <div key={index} className="relative">
              <Button
                variant={action.variant || 'ghost'}
                onClick={action.onClick}
                icon={action.icon}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
              {action.shortcut && (
                <KeyboardShortcut
                  shortcut={action.shortcut}
                  position="bottom-right"
                  size="xs"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center space-x-3">
        {secondaryAction && (
          <div className="relative">
            <Button
              variant={secondaryVariant}
              onClick={secondaryAction}
              icon={secondaryIcon}
            >
              {secondaryLabel}
            </Button>
            {secondaryShortcut && (
              <KeyboardShortcut
                shortcut={secondaryShortcut}
                position="bottom-right"
                size="xs"
              />
            )}
          </div>
        )}

        {primaryAction && (
          <div className="relative">
            <Button
              variant={primaryVariant}
              onClick={primaryAction}
              icon={primaryIcon}
              loading={primaryLoading}
            >
              {primaryLabel}
            </Button>
            {primaryShortcut && (
              <KeyboardShortcut
                shortcut={primaryShortcut}
                position="bottom-right"
                size="xs"
              />
            )}
          </div>
        )}
      </div>

      {layout !== 'space-between' && additionalActions.length > 0 && (
        <div className="flex items-center space-x-3">
          {additionalActions.map((action, index) => (
            <div key={index} className="relative">
              <Button
                variant={action.variant || 'ghost'}
                onClick={action.onClick}
                icon={action.icon}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
              {action.shortcut && (
                <KeyboardShortcut
                  shortcut={action.shortcut}
                  position="bottom-right"
                  size="xs"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Step Navigation Component
export const StepNavigation = ({
  currentStep,
  totalSteps,
  onNext,
  onPrevious,
  nextLabel = 'Next',
  previousLabel = 'Previous',
  nextDisabled = false,
  previousDisabled = false,
  className = ''
}) => {
  return (
    <div className={`flex items-center justify-between ${className}`.trim()}>
      <div className="text-sm text-gray-600">
        Step {currentStep} of {totalSteps}
      </div>
      <ActionButtons
        primaryLabel={nextLabel}
        primaryAction={onNext}
        primaryIcon={currentStep === totalSteps ? null : '→'}
        primaryVariant={currentStep === totalSteps ? 'success' : 'primary'}
        secondaryLabel={previousLabel}
        secondaryAction={onPrevious}
        secondaryIcon="←"
        secondaryVariant="ghost"
        primaryLoading={nextDisabled}
        layout="right"
      />
    </div>
  );
};

export default ActionButtons;