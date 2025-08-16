import React, { useState } from 'react';
import { FileText, CreditCard, Receipt, Save, X } from 'lucide-react';
import { ModuleHeader, CustomerSearch, Select, Card } from '../global';

interface CreditDebitFlowProps {
  onClose?: () => void;
  noteType?: 'credit' | 'debit';
}

const CreditDebitFlow: React.FC<CreditDebitFlowProps> = ({ 
  onClose, 
  noteType = 'credit' 
}) => {
  const [noteData, setNoteData] = useState({
    note_number: '',
    note_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    reference_invoice: '',
    reason: '',
    amount: '',
    cgst: '',
    sgst: '',
    igst: '',
    notes: ''
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const isCredit = noteType === 'credit';

  // Generate document number on mount
  React.useEffect(() => {
    const prefix = isCredit ? 'CR' : 'DR';
    const timestamp = Date.now();
    const noteNumber = `${prefix}-${timestamp.toString().slice(-8)}`;
    setNoteData(prev => ({ ...prev, note_number: noteNumber }));
  }, [isCredit]);

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

  const handleFieldChange = (field: string, value: string) => {
    setNoteData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // API call would go here
      console.log('Saving note:', noteData);
      alert(`${isCredit ? 'Credit' : 'Debit'} note saved successfully!`);
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Error saving note');
    } finally {
      setSaving(false);
    }
  };

  const calculateTotal = () => {
    const amount = parseFloat(noteData.amount) || 0;
    const cgst = parseFloat(noteData.cgst) || 0;
    const sgst = parseFloat(noteData.sgst) || 0;
    const igst = parseFloat(noteData.igst) || 0;
    return amount + cgst + sgst + igst;
  };

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title={`${isCredit ? 'Credit' : 'Debit'} Note`}
          documentNumber={noteData.note_number || `${isCredit ? 'CR' : 'DR'}-TEMP`}
          status="draft"
          icon={isCredit ? CreditCard : Receipt}
          iconColor={isCredit ? "text-green-600" : "text-orange-600"}
          onClose={onClose}
          historyType="notes"
          showSaveDraft={true}
          onSaveDraft={() => {
            console.log('Save draft clicked');
            // TODO: Implement save draft
          }}
          additionalActions={[
            {
              label: "Save & Print",
              onClick: () => console.log('Save & Print'),
              variant: "secondary"
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            
            {/* Note Details */}
            <Card>
              <h3 className="text-sm font-medium text-gray-700 mb-4">Note Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Note Number</label>
                  <input
                    type="text"
                    value={noteData.note_number}
                    disabled
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Note Date</label>
                  <input
                    type="date"
                    value={noteData.note_date}
                    onChange={(e) => handleFieldChange('note_date', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <Select
                    options={reasonOptions}
                    value={noteData.reason}
                    onChange={(value) => handleFieldChange('reason', value)}
                    placeholder="Select reason..."
                  />
                </div>
              </div>
            </Card>

            {/* Customer Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                {isCredit ? 'CUSTOMER' : 'SUPPLIER'}
              </h3>
              <CustomerSearch
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                onCreateNew={() => {/* Handle create new */}}
                displayMode="inline"
                placeholder={`Search ${isCredit ? 'customer' : 'supplier'} by name, phone, or code...`}
                required
              />
            </div>

            {/* Reference and Amount */}
            <Card>
              <h3 className="text-sm font-medium text-gray-700 mb-4">Amount Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Reference {isCredit ? 'Invoice' : 'Purchase'}
                  </label>
                  <input
                    type="text"
                    value={noteData.reference_invoice}
                    onChange={(e) => handleFieldChange('reference_invoice', e.target.value)}
                    placeholder={`Enter ${isCredit ? 'invoice' : 'purchase'} number...`}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Base Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={noteData.amount}
                      onChange={(e) => handleFieldChange('amount', e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Tax Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">CGST</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={noteData.cgst}
                      onChange={(e) => handleFieldChange('cgst', e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">SGST</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={noteData.sgst}
                      onChange={(e) => handleFieldChange('sgst', e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">IGST</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={noteData.igst}
                      onChange={(e) => handleFieldChange('igst', e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Total Amount Display */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium text-gray-900">
                    Total {isCredit ? 'Credit' : 'Debit'} Amount
                  </span>
                  <span className="text-2xl font-bold text-amber-900">
                    ₹{calculateTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>

            {/* Notes */}
            <Card>
              <h3 className="text-sm font-medium text-gray-700 mb-4">Additional Notes</h3>
              <textarea
                value={noteData.notes}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                placeholder="Add any additional notes or remarks..."
                rows={3}
              />
            </Card>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>Total: ₹{calculateTotal().toFixed(2)}</span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                <X className="w-4 h-4 mr-2 inline" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !noteData.reason || !noteData.amount}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : `Save ${isCredit ? 'Credit' : 'Debit'} Note`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditDebitFlow;