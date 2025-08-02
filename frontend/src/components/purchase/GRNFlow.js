import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, User, Search, Truck, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, ArrowLeft, ArrowRight, FileText, Clipboard
} from 'lucide-react';
import { customersApi, productsApi } from '../../services/api';
import { searchCache } from '../../utils/searchCache';
import { ViewHistoryButton } from '../global';

const GRNFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const productSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Generate sequential GRN number
  const generateGRNNumber = () => {
    const lastGRNNo = localStorage.getItem('lastGRNNo') || 'GRN-2024-0000';
    const parts = lastGRNNo.split('-');
    const year = new Date().getFullYear();
    const sequence = parseInt(parts[2] || '0') + 1;
    const newGRNNo = `GRN-${year}-${sequence.toString().padStart(4, '0')}`;
    localStorage.setItem('lastGRNNo', newGRNNo);
    return newGRNNo;
  };

  // GRN data state
  const [grn, setGrn] = useState({
    grn_no: generateGRNNumber(),
    grn_date: new Date().toISOString().split('T')[0],
    po_reference: '',
    supplier_id: '',
    supplier_name: '',
    supplier_details: null,
    supplier_invoice_no: '',
    supplier_invoice_date: '',
    items: [],
    transport_details: {
      transporter_name: '',
      vehicle_no: '',
      lr_no: '',
      lr_date: '',
      received_by: '',
      received_date: new Date().toISOString().split('T')[0],
      condition_on_receipt: 'Good'
    },
    total_amount: 0,
    tax_amount: 0,
    net_amount: 0,
    notes: '',
    grn_status: 'Received'
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveGRN();
            } else {
              handleProceedToReview();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              handlePrint();
            }
            break;
        }
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Focus first input on mount
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  const validateGRN = () => {
    if (!selectedSupplier) {
      setMessage('Please select a supplier', 'error');
      return false;
    }

    if (!grn.items || grn.items.length === 0) {
      setMessage('Please add at least one item', 'error');
      return false;
    }

    if (!grn.supplier_invoice_no) {
      setMessage('Please enter supplier invoice number', 'error');
      return false;
    }

    return true;
  };

  const handleProceedToReview = () => {
    if (validateGRN()) {
      setCurrentStep(2);
      setMessage('');
    }
  };

  const handleSaveGRN = async () => {
    if (!validateGRN()) return;

    setSaving(true);
    try {
      // TODO: Implement GRN creation API call
      setMessage('Goods Receipt Note created successfully!', 'success');
      
      // Show success for 2 seconds then close
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error creating GRN:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create GRN';
      setMessage(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const clearMessage = () => setMessage('');

  // Step 1: Input Form
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-600" />
              <h1 className="text-lg font-semibold text-gray-900">New Goods Receipt Note - Step 1: Enter Details</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <ViewHistoryButton type="grn" />
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Close (Esc)"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Keyboard Shortcuts Help */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            
            {/* Message Display */}
            {message && (
              <div className={`
                mb-4 p-3 rounded flex items-start text-sm
                ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                  messageType === 'error' ? 'bg-red-100 text-red-800' : 
                  'bg-blue-100 text-blue-800'
                }
              `}>
                {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Professional GRN Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Goods Receipt Note</h2>
                  <p className="text-sm text-gray-600 mb-4">{grn.grn_no}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GRN Date</label>
                      <input
                        type="date"
                        value={grn.grn_date}
                        onChange={(e) => setGrn(prev => ({ ...prev, grn_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        tabIndex={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PO Reference</label>
                      <input
                        type="text"
                        value={grn.po_reference}
                        onChange={(e) => setGrn(prev => ({ ...prev, po_reference: e.target.value }))}
                        placeholder="Purchase Order No"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        tabIndex={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Received By</label>
                      <input
                        type="text"
                        value={grn.transport_details.received_by}
                        onChange={(e) => setGrn(prev => ({ 
                          ...prev, 
                          transport_details: { ...prev.transport_details, received_by: e.target.value }
                        }))}
                        placeholder="Person who received"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        tabIndex={4}
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-8 text-right">
                  <div className="text-sm text-gray-600 mb-1">Company Name</div>
                  <div className="text-lg font-semibold text-gray-900">Your Pharma Co.</div>
                  <div className="text-sm text-gray-600 mt-2">GSTIN: 24XXXXX1234Z5</div>
                </div>
              </div>
            </div>

            {/* Supplier Invoice Details */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Supplier Invoice Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Invoice No *</label>
                  <input
                    type="text"
                    value={grn.supplier_invoice_no}
                    onChange={(e) => setGrn(prev => ({ ...prev, supplier_invoice_no: e.target.value }))}
                    placeholder="Supplier's invoice number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    tabIndex={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Invoice Date</label>
                  <input
                    type="date"
                    value={grn.supplier_invoice_date}
                    onChange={(e) => setGrn(prev => ({ ...prev, supplier_invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    tabIndex={6}
                  />
                </div>
              </div>
            </div>

            {/* Placeholder for Supplier Selection */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Supplier Details</h3>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">Supplier search component</p>
                <p className="text-sm text-gray-400">Coming soon...</p>
              </div>
            </div>

            {/* Placeholder for Received Items */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Received Items</h3>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Clipboard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">Items received table with quantity verification</p>
                <p className="text-sm text-gray-400">Coming soon...</p>
              </div>
            </div>

            {/* Transport & Receipt Details */}
            <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <Truck className="w-4 h-4 mr-2" />
                Transport & Receipt Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Transporter Name</label>
                  <input
                    type="text"
                    value={grn.transport_details.transporter_name}
                    onChange={(e) => setGrn(prev => ({ 
                      ...prev, 
                      transport_details: { ...prev.transport_details, transporter_name: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Transport company"
                    tabIndex={10}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Vehicle No</label>
                  <input
                    type="text"
                    value={grn.transport_details.vehicle_no}
                    onChange={(e) => setGrn(prev => ({ 
                      ...prev, 
                      transport_details: { ...prev.transport_details, vehicle_no: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., GJ01AB1234"
                    tabIndex={11}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Condition on Receipt</label>
                  <select
                    value={grn.transport_details.condition_on_receipt}
                    onChange={(e) => setGrn(prev => ({ 
                      ...prev, 
                      transport_details: { ...prev.transport_details, condition_on_receipt: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Good">Good</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">Items: <strong>{grn.items.length}</strong></span>
              <span className="text-gray-600">Total: <strong>₹{grn.total_amount.toFixed(2)}</strong></span>
              <span className="text-lg font-semibold text-green-600">
                Net: ₹{grn.net_amount.toFixed(2)}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                tabIndex={100}
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToReview}
                disabled={!selectedSupplier || grn.items.length === 0}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                title="Proceed to Review (Ctrl+S)"
                tabIndex={101}
              >
                Proceed to Review
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Goods Receipt Note - Step 2: Review & Confirm</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Edit
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              title="Print (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save GRN | <strong>Ctrl+P</strong> - Print | <strong>Esc</strong> - Close
        </div>

        {/* Content - GRN Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          {message && (
            <div className={`
              mb-4 p-3 rounded flex items-start text-sm
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* GRN Preview */}
          <div className="bg-white rounded-lg shadow-sm p-8 max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">GOODS RECEIPT NOTE</h2>
              <p className="text-gray-600">GRN No: {grn.grn_no}</p>
              <p className="text-gray-600">Date: {new Date(grn.grn_date).toLocaleDateString()}</p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">GRN Preview</h3>
              <p className="text-gray-500 mb-4">Full preview functionality coming soon</p>
              <p className="text-sm text-gray-400">This will include supplier details, received items, transport details, and verification status</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-lg font-semibold text-gray-900">
            Total Amount: ₹{grn.net_amount.toFixed(2)}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSaveGRN}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              title="Save GRN (Ctrl+S)"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save GRN
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GRNFlow;