import React, { useState } from 'react';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface GSTFilingProps {
  open?: boolean;
  onClose?: () => void;
}

// Simple button component
const Button: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
}> = ({ children, variant = 'primary', onClick, disabled }) => {
  const baseClass = "px-6 py-3 rounded-lg font-medium transition-colors";
  const variants = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200"
  };

  return (
    <button
      className={`${baseClass} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

// Clean card for each step
const StepCard: React.FC<{
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}> = ({ title, children, onBack }) => {
  return (
    <div className="bg-white rounded-xl p-6 max-w-md mx-auto">
      <div className="flex items-center mb-6">
        {onBack && (
          <button onClick={onBack} className="mr-3 p-1 hover:bg-gray-100 rounded">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
        )}
        <h1 className="text-lg font-medium text-gray-900">{title}</h1>
      </div>
      {children}
    </div>
  );
};

const GSTFilingClean: React.FC<GSTFilingProps> = () => {
  const [step, setStep] = useState('select'); // select -> review -> filing -> done
  const [selectedReturn, setSelectedReturn] = useState('');
  const [filing, setFiling] = useState(false);

  // Effect for filing step - must be at top level
  React.useEffect(() => {
    if (step === 'filing') {
      setFiling(true);
      const timer = setTimeout(() => {
        setFiling(false);
        setStep('done');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Step 1: Select return type
  if (step === 'select') {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <StepCard title="File GST Return">
          <div className="space-y-3">
            <button
              className="w-full p-4 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => {
                setSelectedReturn('GSTR-1');
                setStep('review');
              }}
            >
              <div className="font-medium text-gray-900">GSTR-1</div>
              <div className="text-sm text-gray-500">Outward supplies</div>
              <div className="text-xs text-red-500 mt-1">Due 11 Feb</div>
            </button>
            
            <button
              className="w-full p-4 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => {
                setSelectedReturn('GSTR-3B');
                setStep('review');
              }}
            >
              <div className="font-medium text-gray-900">GSTR-3B</div>
              <div className="text-sm text-gray-500">Summary return</div>
              <div className="text-xs text-red-500 mt-1">Due 20 Feb</div>
            </button>
          </div>
        </StepCard>
      </div>
    );
  }

  // Step 2: Review data
  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <StepCard title={`${selectedReturn} Review`} onBack={() => setStep('select')}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500">Tax Payable</div>
              <div className="text-2xl font-medium text-gray-900">₹60,000</div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-amber-600 mr-2 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-amber-900">2 items need review</div>
                  <div className="text-xs text-amber-700">Check invoice details before filing</div>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                variant="secondary"
                onClick={() => console.log('Review items')}
              >
                Review Items
              </Button>
              <Button
                onClick={() => setStep('filing')}
              >
                File Return
              </Button>
            </div>
          </div>
        </StepCard>
      </div>
    );
  }

  // Step 3: Filing in progress
  if (step === 'filing') {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <StepCard title="Filing Return">
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-base text-gray-900 mb-2">Filing {selectedReturn}</div>
            <div className="text-sm text-gray-500">This may take a few moments</div>
          </div>
        </StepCard>
      </div>
    );
  }

  // Step 4: Success
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <StepCard title="Return Filed">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <div className="text-base text-gray-900 mb-2">{selectedReturn} filed successfully</div>
          <div className="text-sm text-gray-500 mb-6">Reference: GST202501001</div>
          <Button onClick={() => setStep('select')}>
            File Another Return
          </Button>
        </div>
      </StepCard>
    </div>
  );
};

export default GSTFilingClean;