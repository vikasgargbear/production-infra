import React, { useState, useEffect } from 'react';
import { X, FileText, Loader, Upload, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { purchasesApi } from '../services/api';

const PDFUploadModal = ({ isOpen, onClose, onDataExtracted }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState('');
  const [editedData, setEditedData] = useState(null);
  const [forceRender, setForceRender] = useState(0);
  
  // Debug state changes
  useEffect(() => {
    console.log('📊 State Update - extractedData:', extractedData);
  }, [extractedData]);
  
  useEffect(() => {
    console.log('📝 State Update - editedData:', editedData);
  }, [editedData]);
  
  // Reset state only when modal is opened fresh (not when closing)
  useEffect(() => {
    if (isOpen) {
      console.log('🔓 Modal opened, current extractedData:', extractedData);
      // Don't reset if we have extracted data to show
      if (!extractedData && !file) {
        console.log('🧹 Resetting state for fresh modal open');
        setError('');
      }
    }
  }, [isOpen]);

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
        
        // Get the extracted data
        const extractedInfo = response.data.extracted_data;
        console.log('📋 Extracted data:', extractedInfo);
        
        // Directly proceed to verification flow without showing the review UI
        if (response.data.success) {
          console.log('✅ Extraction successful with', extractedInfo.items?.length || 0, 'items');
          
          // Immediately call onDataExtracted to proceed to verification flow
          onDataExtracted(extractedInfo);
          onClose();
          
          // Reset state
          setFile(null);
          setExtractedData(null);
          setEditedData(null);
        } else {
          // If extraction wasn't fully successful, show the review UI
          console.log('⚠️ Partial extraction, showing review UI');
          
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
          
          if (response.data.message) {
            console.log('ℹ️ Parse message:', response.data.message);
          }
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

  const handleItemDelete = (index) => {
    if (!editedData || !editedData.items) return;
    const newItems = editedData.items.filter((_, i) => i !== index);
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
    console.log('❌ Closing modal');
    // Don't reset extracted data when closing - keep it for review
    // Only reset if user hasn't extracted data yet
    if (!extractedData) {
      setFile(null);
      setError('');
    }
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

        {/* Debug: Show current state */}
        <div className="mb-2 p-2 bg-yellow-50 text-xs border border-yellow-300">
          <div>Debug: extractedData is {extractedData ? 'SET' : 'NULL'}, items: {extractedData?.items?.length || 0}</div>
          <div>Force render count: {forceRender}</div>
          <button 
            onClick={() => {
              console.log('Force render clicked, current extractedData:', extractedData);
              setForceRender(prev => prev + 1);
            }}
            className="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded mr-2"
          >
            Force Re-render
          </button>
          <button 
            onClick={() => {
              console.log('Setting test data');
              const testData = {
                supplier_name: 'TEST SUPPLIER',
                invoice_number: 'TEST-001',
                items: [{product_name: 'Test Product', quantity: 1, cost_price: 100}]
              };
              setExtractedData(testData);
              setEditedData(testData);
            }}
            className="mt-1 px-2 py-1 bg-green-500 text-white text-xs rounded"
          >
            Set Test Data
          </button>
        </div>
        
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
              <div className="space-y-2">
                {editedData.items && editedData.items.map((item, index) => {
                  // Ensure item exists and has all required properties
                  const safeItem = {
                    product_name: '',
                    hsn_code: '',
                    batch_number: '',
                    expiry_date: '',
                    quantity: 0,
                    free_quantity: 0,
                    pack_size: 1,
                    pack_type: 'STRIP',
                    total_units: 0,
                    mrp: 0,
                    cost_price: 0,
                    rate: 0,
                    tax_percent: 12,
                    amount: 0,
                    ...item
                  };
                  return (
                  <div key={index} className="bg-white p-2 rounded border border-gray-200">
                    {/* Compact Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">#{index + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-green-600 font-medium">₹{safeItem.amount || 0}</span>
                        <button
                          onClick={() => handleItemDelete(index)}
                          className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                          title="Delete item"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Product Name - Compact */}
                    <div className="mb-2">
                      <input
                        type="text"
                        value={safeItem.product_name}
                        onChange={(e) => handleItemEdit(index, 'product_name', e.target.value)}
                        className="w-full p-1.5 border rounded text-sm"
                        placeholder="Product name"
                      />
                    </div>
                    
                    {/* Compact 3-column layout */}
                    <div className="grid grid-cols-6 gap-2 text-xs">
                      {/* Row 1 */}
                      <div>
                        <label className="text-gray-500 text-xs">HSN</label>
                        <input
                          type="text"
                          value={safeItem.hsn_code || ''}
                          onChange={(e) => handleItemEdit(index, 'hsn_code', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Batch</label>
                        <input
                          type="text"
                          value={safeItem.batch_number || ''}
                          onChange={(e) => handleItemEdit(index, 'batch_number', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          placeholder="Auto"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Expiry</label>
                        <input
                          type="date"
                          value={safeItem.expiry_date || ''}
                          onChange={(e) => handleItemEdit(index, 'expiry_date', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Qty</label>
                        <input
                          type="number"
                          value={safeItem.quantity || ''}
                          onChange={(e) => handleItemEdit(index, 'quantity', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Free</label>
                        <input
                          type="number"
                          value={safeItem.free_quantity || ''}
                          onChange={(e) => handleItemEdit(index, 'free_quantity', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Pack</label>
                        <select
                          value={safeItem.pack_type || 'STRIP'}
                          onChange={(e) => handleItemEdit(index, 'pack_type', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        >
                          <option value="STRIP">Strip</option>
                          <option value="BOX">Box</option>
                          <option value="BOTTLE">Bottle</option>
                          <option value="VIAL">Vial</option>
                          <option value="TUBE">Tube</option>
                        </select>
                      </div>
                      
                      {/* Row 2 */}
                      <div>
                        <label className="text-gray-500 text-xs">Pack Size</label>
                        <input
                          type="number"
                          value={safeItem.pack_size || ''}
                          onChange={(e) => handleItemEdit(index, 'pack_size', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Total Units</label>
                        <input
                          type="number"
                          value={safeItem.total_units || ''}
                          onChange={(e) => handleItemEdit(index, 'total_units', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">MRP</label>
                        <input
                          type="number"
                          value={safeItem.mrp || ''}
                          onChange={(e) => handleItemEdit(index, 'mrp', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Cost</label>
                        <input
                          type="number"
                          value={safeItem.cost_price || safeItem.rate || 0}
                          onChange={(e) => handleItemEdit(index, 'cost_price', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Tax %</label>
                        <input
                          type="number"
                          value={safeItem.tax_percent || 12}
                          onChange={(e) => handleItemEdit(index, 'tax_percent', e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs">Amount</label>
                        <input
                          type="number"
                          value={safeItem.amount || 0}
                          onChange={(e) => handleItemEdit(index, 'amount', e.target.value)}
                          className="w-full p-1 border rounded text-xs bg-gray-50"
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