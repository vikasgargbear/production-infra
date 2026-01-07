import React, { useState } from 'react';
import { Truck, Calendar, CreditCard, FileText, Package, ShoppingCart, RotateCcw, LucideIcon } from 'lucide-react';

interface CustomField {
  label: string;
  key: string;
  type?: 'text' | 'select' | 'number' | 'date';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

interface DocumentSummaryTopProps {
  document: Record<string, any>;
  onDocumentUpdate: (updates: Record<string, any>) => void;
  documentType?: 'invoice' | 'challan' | 'purchase' | 'sales-order' | 'purchase-order' | 'return';
  showDelivery?: boolean;
  showPayment?: boolean;
  showReference?: boolean;
  customFields?: CustomField[];
}

interface SectionState {
  delivery: boolean;
  payment: boolean;
  reference: boolean;
}

/**
 * DocumentSummaryTop - Universal component for document delivery & payment details
 */
const DocumentSummaryTop: React.FC<DocumentSummaryTopProps> = ({
  document,
  onDocumentUpdate,
  documentType = 'invoice',
  showDelivery = true,
  showPayment = true,
  showReference = true,
  customFields = []
}) => {
  const [expandedSections, setExpandedSections] = useState<SectionState>({
    delivery: true,
    payment: true,
    reference: false
  });

  const toggleSection = (section: keyof SectionState) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Document-specific configurations
  const documentConfigs = {
    'invoice': {
      paymentLabel: 'Payment Terms',
      deliveryLabel: 'Delivery Details',
      referenceLabel: 'Reference',
      icon: FileText,
      color: 'blue'
    },
    'challan': {
      paymentLabel: 'Payment Mode',
      deliveryLabel: 'Transport Details',
      referenceLabel: 'Order Reference',
      icon: Truck,
      color: 'indigo'
    },
    'purchase': {
      paymentLabel: 'Payment Terms',
      deliveryLabel: 'Receiving Details',
      referenceLabel: 'PO Reference',
      icon: Package,
      color: 'green'
    },
    'sales-order': {
      paymentLabel: 'Payment Terms',
      deliveryLabel: 'Delivery Schedule',
      referenceLabel: 'Customer PO',
      icon: ShoppingCart,
      color: 'teal'
    },
    'purchase-order': {
      paymentLabel: 'Payment Terms',
      deliveryLabel: 'Expected Delivery',
      referenceLabel: 'Requisition Ref',
      icon: Package,
      color: 'purple'
    },
    'return': {
      paymentLabel: 'Refund Mode',
      deliveryLabel: 'Return Pickup',
      referenceLabel: 'Original Invoice',
      icon: RotateCcw,
      color: 'red'
    }
  };

  const config = documentConfigs[documentType] || documentConfigs['invoice'];
  const IconComponent = config.icon;

  return (
    <div className="mb-6 space-y-4">
      {/* Delivery Section */}
      {showDelivery && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection('delivery')}
            className={`w-full px-4 py-3 flex items-center justify-between bg-${config.color}-50 hover:bg-${config.color}-100 transition-colors`}
          >
            <div className="flex items-center gap-2">
              <Truck className={`w-4 h-4 text-${config.color}-600`} />
              <span className={`text-sm font-medium text-${config.color}-700`}>
                {config.deliveryLabel}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-${config.color}-600 transition-transform ${expandedSections.delivery ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.delivery && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Delivery Type
                </label>
                <select
                  value={document.delivery_type || 'PICKUP'}
                  onChange={(e) => onDocumentUpdate({ delivery_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PICKUP">Pickup</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="COURIER">Courier</option>
                  <option value="TRANSPORT">Transport</option>
                </select>
              </div>

              {document.delivery_type === 'DELIVERY' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Delivery Charges
                    </label>
                    <input
                      type="number"
                      value={document.delivery_charges || 0}
                      onChange={(e) => onDocumentUpdate({ delivery_charges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Priority
                    </label>
                    <select
                      value={document.delivery_priority || 'normal'}
                      onChange={(e) => onDocumentUpdate({ delivery_priority: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="express">Express</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </>
              )}

              {(document.delivery_type === 'TRANSPORT' || documentType === 'challan') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Transport Company
                    </label>
                    <input
                      type="text"
                      value={document.transport_company || ''}
                      onChange={(e) => onDocumentUpdate({ transport_company: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter transport company"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Vehicle Number
                    </label>
                    <input
                      type="text"
                      value={document.vehicle_number || ''}
                      onChange={(e) => onDocumentUpdate({ vehicle_number: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., GJ01AB1234"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      LR Number
                    </label>
                    <input
                      type="text"
                      value={document.lr_number || ''}
                      onChange={(e) => onDocumentUpdate({ lr_number: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="LR/Docket number"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment Section */}
      {showPayment && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection('payment')}
            className={`w-full px-4 py-3 flex items-center justify-between bg-${config.color}-50 hover:bg-${config.color}-100 transition-colors`}
          >
            <div className="flex items-center gap-2">
              <CreditCard className={`w-4 h-4 text-${config.color}-600`} />
              <span className={`text-sm font-medium text-${config.color}-700`}>
                {config.paymentLabel}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-${config.color}-600 transition-transform ${expandedSections.payment ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.payment && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Payment Mode
                </label>
                <select
                  value={document.payment_mode || ''}
                  onChange={(e) => onDocumentUpdate({ payment_mode: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Payment Mode</option>
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              {document.payment_mode === 'Credit' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Credit Days
                  </label>
                  <input
                    type="number"
                    value={document.credit_days || 30}
                    onChange={(e) => onDocumentUpdate({ credit_days: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="30"
                  />
                </div>
              )}

              {document.payment_mode === 'Cheque' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    value={document.cheque_number || ''}
                    onChange={(e) => onDocumentUpdate({ cheque_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter cheque number"
                  />
                </div>
              )}

              {document.payment_mode === 'UPI' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Transaction ID
                  </label>
                  <input
                    type="text"
                    value={document.transaction_id || ''}
                    onChange={(e) => onDocumentUpdate({ transaction_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="UPI transaction ID"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Discount Amount
                </label>
                <input
                  type="number"
                  value={document.discount_amount || 0}
                  onChange={(e) => onDocumentUpdate({ discount_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reference Section */}
      {showReference && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection('reference')}
            className={`w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors`}
          >
            <div className="flex items-center gap-2">
              <IconComponent className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                {config.referenceLabel}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-600 transition-transform ${expandedSections.reference ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSections.reference && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={document.reference_no || ''}
                  onChange={(e) => onDocumentUpdate({ reference_no: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={`Enter ${config.referenceLabel.toLowerCase()}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Reference Date
                </label>
                <input
                  type="date"
                  value={document.reference_date || ''}
                  onChange={(e) => onDocumentUpdate({ reference_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {customFields.map((field, index) => (
              <div key={index}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={document[field.key] || ''}
                    onChange={(e) => onDocumentUpdate({ [field.key]: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {field.options.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={document[field.key] || ''}
                    onChange={(e) => onDocumentUpdate({ [field.key]: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSummaryTop;