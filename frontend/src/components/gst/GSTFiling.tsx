import React, { useState } from 'react';
import {
  FileText, ExternalLink, Calendar, AlertCircle,
  Download, Eye, CheckCircle, Clock, Info
} from 'lucide-react';

interface GSTFilingProps {
  onClose?: () => void;
}

const GSTFiling: React.FC<GSTFilingProps> = () => {
  const [selectedReturn, setSelectedReturn] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'preview' | 'file'; returnName: string } | null>(null);

  const gstReturns = [
    {
      id: 'gstr1',
      name: 'GSTR-1',
      description: 'Outward supplies return (sales)',
      dueDate: '11th of next month',
      status: 'pending',
      lastFiled: null,
      frequency: 'Monthly'
    },
    {
      id: 'gstr3b',
      name: 'GSTR-3B',
      description: 'Summary return with tax payment',
      dueDate: '20th of next month',
      status: 'pending',
      lastFiled: null,
      frequency: 'Monthly'
    },
    {
      id: 'gstr2b',
      name: 'GSTR-2B',
      description: 'Auto-populated purchase return',
      dueDate: '12th of next month',
      status: 'available',
      lastFiled: null,
      frequency: 'Monthly'
    }
  ];

  const handlePreview = (returnType: string) => {
    setActionMessage({ type: 'preview', returnName: returnType });
  };

  const handleFile = (returnType: string) => {
    setActionMessage({ type: 'file', returnName: returnType });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filed': return 'text-green-600 bg-green-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'overdue': return 'text-red-600 bg-red-50';
      case 'available': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'filed': return <CheckCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'overdue': return <AlertCircle className="h-4 w-4" />;
      case 'available': return <Download className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">GST Filing</h2>
        <p className="text-sm text-gray-600 mt-1">File your GST returns with calculated data from your transactions</p>
      </div>

      {/* Important Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Honest Filing Process</p>
            <p>All calculations are based on your real invoice and purchase data. For actual filing, you will be redirected to the official GST portal.</p>
          </div>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                {actionMessage.type === 'preview' ? (
                  <>
                    <p className="font-medium">Preview: {actionMessage.returnName}</p>
                    <p>Data is calculated from your real invoices. View the Reports tab for detailed breakdowns.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Filing: {actionMessage.returnName}</p>
                    <p>For actual filing, visit the official GST portal at{' '}
                      <a href="https://gst.gov.in" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        gst.gov.in
                      </a>
                    </p>
                  </>
                )}
              </div>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-sm text-amber-600 hover:text-amber-800 underline ml-4">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* GST Returns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gstReturns.map((gstReturn) => (
          <div key={gstReturn.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{gstReturn.name}</h3>
                    <p className="text-sm text-gray-500">{gstReturn.frequency}</p>
                  </div>
                </div>
                <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(gstReturn.status)}`}>
                  {getStatusIcon(gstReturn.status)}
                  <span className="ml-1 capitalize">{gstReturn.status}</span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">{gstReturn.description}</p>
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Due Date:</span>
                  <span className="text-gray-900">{gstReturn.dueDate}</span>
                </div>
                {gstReturn.lastFiled && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Last Filed:</span>
                    <span className="text-gray-900">{gstReturn.lastFiled}</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handlePreview(gstReturn.name)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center justify-center"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </button>
                <button
                  onClick={() => handleFile(gstReturn.name)}
                  disabled={gstReturn.status === 'filed'}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  File Return
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filing Calendar */}
      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-blue-600" />
          Filing Calendar
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-yellow-50 rounded-lg">
            <h4 className="font-medium text-yellow-800">GSTR-1</h4>
            <p className="text-sm text-yellow-600 mt-1">Due: 11th of every month</p>
            <p className="text-xs text-yellow-600 mt-2">Quarterly filers: 13th after quarter end</p>
          </div>
          
          <div className="p-4 bg-red-50 rounded-lg">
            <h4 className="font-medium text-red-800">GSTR-3B</h4>
            <p className="text-sm text-red-600 mt-1">Due: 20th of every month</p>
            <p className="text-xs text-red-600 mt-2">Late fee applies after due date</p>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800">GSTR-2B</h4>
            <p className="text-sm text-blue-600 mt-1">Available: 12th of every month</p>
            <p className="text-xs text-blue-600 mt-2">Auto-populated by government</p>
          </div>
        </div>
      </div>

      {/* Filing Tips */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filing Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Before Filing:</h4>
            <ul className="space-y-1">
              <li>• Verify all invoice data is accurate</li>
              <li>• Reconcile with purchase register</li>
              <li>• Check HSN codes and tax rates</li>
              <li>• Ensure customer/vendor details are correct</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">After Filing:</h4>
            <ul className="space-y-1">
              <li>• Download acknowledgment receipt</li>
              <li>• Pay any pending tax liability</li>
              <li>• Update your records</li>
              <li>• Set reminders for next filing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTFiling;