import React, { useState } from 'react';
import {
  FileText, Upload, Download, CheckCircle, AlertCircle,
  Calendar, ChevronRight, Save, Send, Eye, Edit,
  RefreshCw, X, Info, Calculator
} from 'lucide-react';
import { Card, Button, DatePicker, StatusBadge, DataTable } from '../global';

interface GSTFilingProps {
  open?: boolean;
  onClose?: () => void;
}

// Step indicator component
const StepIndicator: React.FC<{
  steps: { id: string; title: string; completed: boolean }[];
  currentStep: number;
}> = ({ steps, currentStep }) => {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1">
          <div className="flex items-center">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center font-medium
              ${index < currentStep ? 'bg-green-500 text-white' :
                index === currentStep ? 'bg-blue-500 text-white' :
                'bg-gray-200 text-gray-500'}
            `}>
              {index < currentStep ? <CheckCircle className="w-5 h-5" /> : index + 1}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                index <= currentStep ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {step.title}
              </p>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-4 ${
              index < currentStep ? 'bg-green-500' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
};

// Return card component
const ReturnCard: React.FC<{
  title: string;
  period: string;
  dueDate: string;
  status: 'draft' | 'ready' | 'filed' | 'overdue';
  onAction: () => void;
  actionLabel: string;
}> = ({ title, period, dueDate, status, onAction, actionLabel }) => {
  const statusColors = {
    draft: 'bg-gray-50 border-gray-200',
    ready: 'bg-blue-50 border-blue-200',
    filed: 'bg-green-50 border-green-200',
    overdue: 'bg-red-50 border-red-200',
  };

  const statusVariants = {
    draft: 'light' as const,
    ready: 'light' as const,
    filed: 'solid' as const,
    overdue: 'solid' as const,
  };

  return (
    <div className={`p-6 rounded-lg border-2 ${statusColors[status]} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">Period: {period}</p>
        </div>
        <StatusBadge status={status} variant={statusVariants[status]} />
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center text-sm">
          <Calendar className="w-4 h-4 text-gray-400 mr-2" />
          <span className="text-gray-600">Due Date:</span>
          <span className="ml-2 font-medium text-gray-900">{dueDate}</span>
        </div>
        
        <div className="pt-3 border-t border-gray-200">
          <Button
            onClick={onAction}
            variant={status === 'filed' ? 'outline' : 'primary'}
            size="sm"
            className="w-full"
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

const GSTFilingV2: React.FC<GSTFilingProps> = () => {
  const [selectedReturn, setSelectedReturn] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const filingSteps = [
    { id: 'select', title: 'Select Return', completed: false },
    { id: 'prepare', title: 'Prepare Data', completed: false },
    { id: 'review', title: 'Review & Validate', completed: false },
    { id: 'file', title: 'File Return', completed: false },
  ];

  const returns = [
    {
      id: 'gstr1',
      title: 'GSTR-1',
      period: 'January 2025',
      dueDate: '11 Feb 2025',
      status: 'ready' as const,
      description: 'Details of outward supplies of goods or services',
    },
    {
      id: 'gstr3b',
      title: 'GSTR-3B',
      period: 'January 2025',
      dueDate: '20 Feb 2025',
      status: 'draft' as const,
      description: 'Summary return for outward and inward supplies',
    },
    {
      id: 'gstr9',
      title: 'GSTR-9',
      period: 'FY 2024-25',
      dueDate: '31 Dec 2025',
      status: 'draft' as const,
      description: 'Annual return for regular taxpayers',
    },
  ];

  const handleReturnSelect = (returnId: string) => {
    setSelectedReturn(returnId);
    setCurrentStep(1);
  };

  const handleFileReturn = async () => {
    setLoading(true);
    // Simulate filing
    setTimeout(() => {
      setLoading(false);
      setCurrentStep(3);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GST Return Filing</h1>
              <p className="text-sm text-gray-500 mt-1">File your GST returns easily</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Upload Data
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Step Indicator */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <StepIndicator steps={filingSteps} currentStep={currentStep} />
        </div>

        {/* Return Selection */}
        {currentStep === 0 && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
                <div>
                  <p className="text-sm text-blue-900 font-medium">Quick Tip</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Select the return type you want to file. Make sure all invoices are uploaded before proceeding.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {returns.map((ret) => (
                <ReturnCard
                  key={ret.id}
                  title={ret.title}
                  period={ret.period}
                  dueDate={ret.dueDate}
                  status={ret.status}
                  onAction={() => handleReturnSelect(ret.id)}
                  actionLabel={(ret.status as string) === 'filed' ? 'View Return' : 'Prepare Return'}
                />
              ))}
            </div>
          </div>
        )}

        {/* Data Preparation */}
        {currentStep === 1 && selectedReturn && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Prepare GSTR-1 Data</h2>
              <p className="text-sm text-gray-600 mt-1">Review and prepare your outward supply data</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">B2B Invoices</span>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">245</p>
                <p className="text-xs text-gray-500 mt-1">₹12,45,000 taxable value</p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">B2C Invoices</span>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">89</p>
                <p className="text-xs text-gray-500 mt-1">₹3,45,000 taxable value</p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Export Invoices</span>
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">12</p>
                <p className="text-xs text-gray-500 mt-1">₹8,90,000 taxable value</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-600 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">5 invoices need attention</p>
                    <p className="text-xs text-gray-600 mt-0.5">Missing GSTIN or incorrect tax rates</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Review Issues
                </Button>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(0)}>
                  Back
                </Button>
                <div className="space-x-3">
                  <Button variant="outline">
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button onClick={() => setCurrentStep(2)}>
                    Continue to Review
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Review & Validation */}
        {currentStep === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Review & Validate</h2>
              <p className="text-sm text-gray-600 mt-1">Final review before filing</p>
            </div>

            <div className="space-y-6">
              {/* Summary Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Value</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CGST</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">SGST</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">IGST</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">B2B</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">245</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹12,45,000</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹1,12,050</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹1,12,050</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">-</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">B2C</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">89</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹3,45,000</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹31,050</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹31,050</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">-</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">Total</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">334</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">₹15,90,000</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">₹1,43,100</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">₹1,43,100</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back to Data
                </Button>
                <div className="space-x-3">
                  <Button variant="outline" onClick={() => setShowPreview(true)}>
                    <Eye className="w-4 h-4 mr-2" />
                    Preview Return
                  </Button>
                  <Button onClick={handleFileReturn} loading={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    File Return
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Step */}
        {currentStep === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Return Filed Successfully!</h2>
            <p className="text-gray-600 mb-6">
              Your GSTR-1 for January 2025 has been filed successfully.
            </p>
            <div className="space-y-3 max-w-md mx-auto">
              <Button variant="primary" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Download Acknowledgement
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setCurrentStep(0)}>
                File Another Return
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GSTFilingV2;