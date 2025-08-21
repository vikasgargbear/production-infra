import React, { useState, useEffect } from 'react';
import { X, FileText, Loader, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { purchasesApi } from '../services/api';

const PDFUploadModal = ({ isOpen, onClose, onDataExtracted }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState('');
  const [editedData, setEditedData] = useState(null);
  
  // Debug state changes
  useEffect(() => {
    console.log('📊 State Update - extractedData:', extractedData);
  }, [extractedData]);
  
  useEffect(() => {
    console.log('📝 State Update - editedData:', editedData);
  }, [editedData]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please select a PDF file');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await purchasesApi.parseInvoice(formData);
      console.log('Full API Response:', response);
      console.log('Response data:', response.data);
      console.log('Response status:', response.status);
      
      // Always show the extracted data, even if it's just a template
      if (response && response.data && response.data.extracted_data) {
        console.log('Setting extracted data:', response.data.extracted_data);
        console.log('Items in extracted data:', response.data.extracted_data.items);
        
        // Set the extracted data to show the review UI
        const extractedInfo = response.data.extracted_data;
        console.log('📋 About to set state with:', extractedInfo);
        
        // Force state update with new object references
        setExtractedData(prevData => {
          console.log('Previous extractedData:', prevData);
          console.log('New extractedData:', extractedInfo);
          return extractedInfo;
        });
        
        setEditedData(prevData => {
          console.log('Previous editedData:', prevData);
          const newData = {...extractedInfo};
          console.log('New editedData:', newData);
          return newData;
        });
        
        // Log state after setting
        setTimeout(() => {
          console.log('State after setting - extractedData:', extractedData);
          console.log('State after setting - editedData:', editedData);
        }, 100);
        
        // Show message about the extraction status
        if (response.data.success) {
          console.log('✅ Extraction successful with', response.data.extracted_data.items?.length || 0, 'items');
        } else if (response.data.message) {
          // Show as info, not error - user can still fill in manually
          console.log('ℹ️ Parse message:', response.data.message);
        }
      } else {
        console.error('❌ No extracted_data in response:', response);
        setError('Failed to extract data from PDF - no data returned');
      }
    } catch (error) {
      console.error('❌ Upload failed:', error);
      setError(error.response?.data?.detail || 'Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleItemEdit = (index, field, value) => {
    if (!editedData || !editedData.items) return;
    const newItems = [...editedData.items];
    newItems[index] = {
      ...newItems[index],
      [field]: value !== undefined ? value : ''
    };
    setEditedData({ ...editedData, items: newItems });
  };

  const handleConfirm = () => {
    console.log('🚀 Confirming with data:', editedData);
    onDataExtracted(editedData);
    onClose();
    // Reset state
    setFile(null);
    setExtractedData(null);
    setEditedData(null);
    setError('');
  };
  
  const handleClose = () => {
    console.log('❌ Closing modal, resetting state');
    // Reset all state when closing
    setFile(null);
    setExtractedData(null);
    setEditedData(null);
    setError('');
    onClose();
  };

  const handleReset = () => {
    setEditedData(JSON.parse(JSON.stringify(extractedData)));
  };

  if (!isOpen) return null;
  
  console.log('PDFUploadModal State:', { 
    isOpen, 
    hasFile: !!file, 
    hasExtractedData: !!extractedData,
    extractedDataLength: extractedData?.items?.length || 0,
    extractedData: extractedData,
    editedData: editedData
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Upload Purchase Invoice
          </h3>
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {!extractedData ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="pdf-upload"
              />
              <label
                htmlFor="pdf-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Upload className="w-5 h-5" />
                Select PDF Invoice
              </label>
              {file && (
                <p className="mt-4 text-sm text-gray-600">
                  Selected: {file.name}
                </p>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin" size={20} />
                  Processing Invoice...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload and Extract Data
                </>
              )}
            </button>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Upload pharmaceutical invoice PDF</li>
                <li>• System extracts supplier & product details</li>
                <li>• Review and edit extracted data</li>
                <li>• Missing batch numbers are auto-generated</li>
                <li>• Missing expiry dates default to 2 years</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Review Extracted Data
              </h4>
              <button
                onClick={handleReset}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Reset to Original
              </button>
            </div>
            
            {/* Supplier Info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-medium mb-3">
                Supplier Information
                {editedData.supplier_exists && (
                  <span className="ml-2 text-sm text-green-600">
                    ✓ Existing Supplier Found
                  </span>
                )}
              </h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Supplier Name</label>
                  <input
                    type="text"
                    value={editedData.supplier_name || ''}
                    onChange={(e) => setEditedData({...editedData, supplier_name: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">GSTIN</label>
                  <input
                    type="text"
                    value={editedData.supplier_gstin || ''}
                    onChange={(e) => setEditedData({...editedData, supplier_gstin: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData.supplier_exists}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Address</label>
                  <input
                    type="text"
                    value={editedData.supplier_address || ''}
                    onChange={(e) => setEditedData({...editedData, supplier_address: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Drug License</label>
                  <input
                    type="text"
                    value={editedData.drug_license || ''}
                    onChange={(e) => setEditedData({...editedData, drug_license: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Phone</label>
                  <input
                    type="text"
                    value={editedData.phone || ''}
                    onChange={(e) => setEditedData({...editedData, phone: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Invoice Number</label>
                  <input
                    type="text"
                    value={editedData.invoice_number || ''}
                    onChange={(e) => setEditedData({...editedData, invoice_number: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Invoice Date</label>
                  <input
                    type="date"
                    value={editedData.invoice_date || ''}
                    onChange={(e) => setEditedData({...editedData, invoice_date: e.target.value})}
                    className="w-full mt-1 p-2 border rounded"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-medium mb-3">Items ({editedData.items?.length || 0})</h5>
              <div className="space-y-4">
                {editedData.items && editedData.items.map((item, index) => {
                  // Ensure item exists and has all required properties
                  const safeItem = {
                    product_name: '',
                    hsn_code: '',
                    batch_number: '',
                    expiry_date: '',
                    quantity: 0,
                    mrp: 0,
                    cost_price: 0,
                    rate: 0,
                    tax_percent: 12,
                    amount: 0,
                    ...item
                  };
                  return (
                  <div key={index} className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h6 className="font-medium text-gray-700">Item {index + 1}</h6>
                      <span className="text-sm text-gray-500">Amount: ₹{safeItem.amount || 0}</span>
                    </div>
                    
                    {/* Product Name - Full Width */}
                    <div className="mb-3">
                      <label className="text-xs text-gray-600">Product Name</label>
                      <input
                        type="text"
                        value={safeItem.product_name}
                        onChange={(e) => handleItemEdit(index, 'product_name', e.target.value)}
                        className="w-full mt-1 p-2 border rounded text-sm"
                      />
                    </div>
                    
                    {/* Row 1: HSN, Batch, Expiry */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-gray-600">HSN Code</label>
                        <input
                          type="text"
                          value={safeItem.hsn_code || ''}
                          onChange={(e) => handleItemEdit(index, 'hsn_code', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Batch (Auto if empty)</label>
                        <input
                          type="text"
                          value={safeItem.batch_number || ''}
                          onChange={(e) => handleItemEdit(index, 'batch_number', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                          placeholder="AUTO-GENERATED"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Expiry (Auto if empty)</label>
                        <input
                          type="date"
                          value={safeItem.expiry_date || ''}
                          onChange={(e) => handleItemEdit(index, 'expiry_date', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                          placeholder="2 years default"
                        />
                      </div>
                    </div>
                    
                    {/* Row 2: Quantity, MRP, Cost, Tax */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Quantity</label>
                        <input
                          type="number"
                          value={safeItem.quantity || ''}
                          onChange={(e) => handleItemEdit(index, 'quantity', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">MRP</label>
                        <input
                          type="number"
                          value={safeItem.mrp || ''}
                          onChange={(e) => handleItemEdit(index, 'mrp', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Cost Price</label>
                        <input
                          type="number"
                          value={safeItem.cost_price || safeItem.rate || 0}
                          onChange={(e) => handleItemEdit(index, 'cost_price', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Tax %</label>
                        <input
                          type="number"
                          value={safeItem.tax_percent || 12}
                          onChange={(e) => handleItemEdit(index, 'tax_percent', e.target.value)}
                          className="w-full mt-1 p-2 border rounded text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">₹{editedData.subtotal || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span className="font-medium">₹{editedData.tax_amount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span className="font-medium">₹{editedData.discount_amount || 0}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span>₹{editedData.grand_total || 0}</span>
                </div>
              </div>
            </div>

            {/* Note about auto-generation */}
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="text-blue-700">💡 <strong>Tip:</strong> Leave batch number empty for automatic generation (AUTO-YYYYMMDD-PRODUCTID-XXXX)</p>
              <p className="text-blue-700">💡 Empty expiry dates will default to 2 years from today</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Create Purchase Order
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFUploadModal;