import React, { useState } from 'react';
import { 
  FileText, Plus, CreditCard, Receipt, CheckCircle, AlertTriangle, ArrowLeft
} from 'lucide-react';
import {
  Button,
  Card,
  CardSection,
  Select,
  DatePicker,
  DataTable,
  SummaryCard
} from '../global';
import { theme, classes } from '../../config/theme.config';

interface CreditDebitNoteSimpleProps {
  noteType?: 'credit' | 'debit';
  onClose?: () => void;
}

const CreditDebitNoteSimple: React.FC<CreditDebitNoteSimpleProps> = ({ 
  noteType = 'credit',
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [noteData, setNoteData] = useState({
    note_date: new Date().toISOString().split('T')[0],
    reason: '',
    amount: 0,
    notes: ''
  });

  const isCredit = noteType === 'credit';
  
  // Tab configuration
  const tabs = [
    { 
      id: 'create', 
      label: `Create ${isCredit ? 'Credit' : 'Debit'} Note`,
      icon: Plus 
    },
    { 
      id: 'list', 
      label: `${isCredit ? 'Credit' : 'Debit'} Notes List`,
      icon: FileText 
    }
  ];

  // Reason options
  const reasonOptions = isCredit ? [
    { value: 'RETURN', label: 'Product Return' },
    { value: 'DISCOUNT', label: 'Additional Discount' },
    { value: 'DAMAGE_COMPENSATION', label: 'Damage Compensation' },
    { value: 'PRICE_ADJUSTMENT', label: 'Price Adjustment' },
    { value: 'OTHER', label: 'Other' }
  ] : [
    { value: 'SHORTAGE', label: 'Shortage in Delivery' },
    { value: 'DAMAGE', label: 'Damaged Goods' },
    { value: 'PRICE_INCREASE', label: 'Price Increase' },
    { value: 'ADDITIONAL_CHARGES', label: 'Additional Charges' },
    { value: 'OTHER', label: 'Other' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Note data:', noteData);
  };

  // Sample summary data
  const summaryItems = [
    { label: 'Base Amount', value: noteData.amount * 0.8, isBold: false },
    { label: 'Tax Amount', value: noteData.amount * 0.2, isBold: false },
    { 
      label: `Total ${isCredit ? 'Credit' : 'Debit'} Amount`, 
      value: noteData.amount, 
      isTotal: true,
      color: isCredit ? theme.colors.secondary.DEFAULT : theme.colors.warning.DEFAULT
    }
  ];

  return (
    <div className={classes.pageContainer}>
      <div className={classes.contentWrapper}>
        {/* Header - Using global theme classes */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Back Button */}
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Back to Home"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              )}
              
              {isCredit ? (
                <CreditCard className="w-8 h-8 text-green-600" />
              ) : (
                <Receipt className="w-8 h-8 text-orange-600" />
              )}
              <div>
                <h1 className={classes.pageTitle}>
                  {isCredit ? 'Credit' : 'Debit'} Notes Management
                </h1>
                <p className={classes.bodyText}>
                  Create and manage {isCredit ? 'credit' : 'debit'} notes for your business
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Using global theme */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'create' | 'list')}
                    className={`
                      flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors
                      ${activeTab === tab.id
                        ? `border-${isCredit ? 'green' : 'orange'}-500 text-${isCredit ? 'green' : 'orange'}-600`
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Create Note Tab */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Section - Using global Card component */}
            <div className="lg:col-span-2">
              <Card>
                <CardSection title={`New ${isCredit ? 'Credit' : 'Debit'} Note`}>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Customer/Supplier Selection - Simplified for demo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={classes.formLabel}>
                          {isCredit ? 'Customer' : 'Supplier'} *
                        </label>
                        <input
                          type="text"
                          placeholder={`Search ${isCredit ? 'customer' : 'supplier'}...`}
                          className={`${theme.components.input.base} mt-1`}
                        />
                      </div>

                      <div>
                        <label className={classes.formLabel}>
                          {isCredit ? 'Reference Invoice' : 'Reference Purchase'} *
                        </label>
                        <input
                          type="text"
                          placeholder={isCredit ? "Search invoice..." : "Search purchase..."}
                          className={`${theme.components.input.base} mt-1`}
                        />
                      </div>
                    </div>

                    {/* Note Details - Using global DatePicker and Select */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={classes.formLabel}>Note Date *</label>
                        <DatePicker
                          value={noteData.note_date}
                          onChange={(date) => setNoteData(prev => ({ 
                            ...prev, 
                            note_date: typeof date === 'string' ? date : date?.toISOString().split('T')[0] || '' 
                          }))}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className={classes.formLabel}>Reason *</label>
                        <Select
                          options={reasonOptions}
                          value={noteData.reason}
                          onChange={(reason) => setNoteData(prev => ({ ...prev, reason }))}
                          placeholder="Select reason..."
                          className="mt-1"
                        />
                      </div>
                    </div>

                    {/* Amount and Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={classes.formLabel}>Amount *</label>
                        <div className="mt-1 relative">
                          <input
                            type="number"
                            step="0.01"
                            value={noteData.amount}
                            onChange={(e) => setNoteData(prev => ({ 
                              ...prev, 
                              amount: parseFloat(e.target.value) || 0 
                            }))}
                            className={`${theme.components.input.base} pl-8`}
                            placeholder="0.00"
                            required
                          />
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500">₹</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className={classes.formLabel}>Notes</label>
                        <textarea
                          value={noteData.notes}
                          onChange={(e) => setNoteData(prev => ({ ...prev, notes: e.target.value }))}
                          className={`${theme.components.input.base} h-20 resize-none mt-1`}
                          placeholder="Additional notes..."
                          rows={3}
                        />
                      </div>
                    </div>

                    {/* Action Buttons - Using global Button component */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                      <Button variant="secondary" type="button">
                        Cancel
                      </Button>
                      <Button 
                        variant="primary"
                        type="submit"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Create {isCredit ? 'Credit' : 'Debit'} Note
                      </Button>
                    </div>
                  </form>
                </CardSection>
              </Card>
            </div>

            {/* Summary Section - Using global SummaryCard */}
            <div>
              <Card>
                <CardSection title="Note Summary">
                  {noteData.amount > 0 ? (
                    <div className="space-y-4">
                      {/* Note Amount Summary */}
                      <SummaryCard
                        title={`${isCredit ? 'Credit' : 'Debit'} Amount Breakdown`}
                        items={summaryItems}
                        variant="detailed"
                      />
                      
                      {/* Additional Info */}
                      <div className={`p-3 rounded-lg ${
                        isCredit ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                      }`}>
                        <p className={`text-sm font-medium ${
                          isCredit ? 'text-green-800' : 'text-orange-800'
                        }`}>
                          {isCredit 
                            ? 'This amount will be credited to customer account'
                            : 'This amount will be debited from supplier account'
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className={classes.bodyText}>
                        Enter amount to see summary
                      </p>
                    </div>
                  )}
                </CardSection>
              </Card>
            </div>
          </div>
        )}

        {/* List Tab - Using global DataTable */}
        {activeTab === 'list' && (
          <Card>
            <CardSection title={`${isCredit ? 'Credit' : 'Debit'} Notes`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <input
                    type="text"
                    placeholder={`Search ${isCredit ? 'credit' : 'debit'} notes...`}
                    className={theme.components.input.base}
                  />
                  <Button variant="primary" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    New Note
                  </Button>
                </div>
              </div>
              <div className={classes.bodyText}>
                <p className="mb-4">
                  📝 This demonstrates the updated {isCredit ? 'Credit' : 'Debit'} Note module 
                  now using global UI theme components:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>✅ Global Card and CardSection components</li>
                  <li>✅ Theme-consistent colors and spacing</li>
                  <li>✅ Global Button variants</li>
                  <li>✅ Standardized form inputs</li>
                  <li>✅ Global SummaryCard for totals</li>
                  <li>✅ Consistent typography classes</li>
                </ul>
              </div>
            </CardSection>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CreditDebitNoteSimple;