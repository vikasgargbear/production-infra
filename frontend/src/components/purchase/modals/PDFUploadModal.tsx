import React, { useState, useEffect } from 'react';
import { X, FileText, Loader, Upload, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { purchasesApi } from '../../../services/api';

interface PDFUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataExtracted: (data: ExtractedData) => void;
}

interface ExtractedItem {
  product_name: string;
  hsn_code?: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  free_quantity?: number;
  mrp?: number;
  unit_price: number;
  selling_price?: number;
  discount_percent?: number;
  tax_percent?: number;
  pack_size?: number;
  pack_type?: string;
  total_units?: number;
  amount?: number;
  cost_per_unit?: number;
  // Alias properties for PDF extraction compatibility
  product_id?: string | number | null;
  name?: string;  // alias for product_name
  manufacturing_date?: string;
  sale_price?: number;  // alias for selling_price
  gst_percent?: number;  // alias for tax_percent
}

interface ExtractedData {
  supplier_name?: string;
  supplier_gst_number?: string;
  supplier_address?: string;
  drug_license?: string;
  phone?: string;
  invoice_number?: string;
  invoice_date?: string;
  supplier_exists?: boolean;
  items?: ExtractedItem[];
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  // Vendor aliases (for PDF extraction compatibility)
  supplier_id?: string | number | null;
  vendor_name?: string;
  vendor_gst_number?: string;
  vendor_address?: string;
  gross_amount?: number;
}

const PDFUploadModal: React.FC<PDFUploadModalProps> = ({ isOpen, onClose, onDataExtracted }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState('');
  const [editedData, setEditedData] = useState<ExtractedData | null>(null);
  const [forceRender, setForceRender] = useState(0);

  // Debug state changes
  useEffect(() => {
  }, [extractedData]);

  useEffect(() => {
  }, [editedData]);

  // Reset state only when modal is opened fresh (not when closing)
  useEffect(() => {
    if (isOpen) {
      // Don't reset if we have extracted data to show
      if (!extractedData && !file) {
        setError('');
      }
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
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

      // Always show the extracted data, even if it's just a template
      if (response && response.data && response.data.extracted_data) {

        // Get the extracted data
        const extractedInfo = response.data.extracted_data;

        // Directly proceed to verification flow without showing the review UI
        if (response.data.success) {

          // Immediately call onDataExtracted to proceed to verification flow
          onDataExtracted(extractedInfo);
          onClose();

          // Reset state
          setFile(null);
          setExtractedData(null);
          setEditedData(null);
        } else {
          // If extraction wasn't fully successful, show the review UI

          setExtractedData(prevData => {
            return extractedInfo;
          });

          setEditedData(prevData => {
            const newData = { ...extractedInfo };
            return newData;
          });

          if (response.data.message) {
          }
        }
      } else {
        setError('Failed to extract data from PDF - no data returned');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleItemEdit = (index: number, field: string, value: any) => {
    if (!editedData || !editedData.items) return;
    const newItems = [...editedData.items];
    newItems[index] = {
      ...newItems[index],
      [field]: value !== undefined ? value : ''
    };
    setEditedData({ ...editedData, items: newItems });
  };

  const handleItemDelete = (index: number) => {
    if (!editedData || !editedData.items) return;
    const newItems = editedData.items.filter((_, i) => i !== index);
    setEditedData({ ...editedData, items: newItems });
  };

  const handleConfirm = () => {
    if (!editedData) return;
    onDataExtracted(editedData);
    onClose();
    // Reset state
    setFile(null);
    setExtractedData(null);
    setEditedData(null);
    setError('');
  };

  const handleClose = () => {
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
              setForceRender(prev => prev + 1);
            }}
            className="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded mr-2"
          >
            Force Re-render
          </button>
          <button
            onClick={() => {
              const testData: ExtractedData = {
                supplier_name: 'TEST SUPPLIER',
                invoice_number: 'TEST-001',
                items: [{ product_name: 'Test Product', quantity: 1, unit_price: 100 }]
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
                  Extracting & Verifying...
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
                {editedData?.supplier_exists && (
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
                    value={editedData?.supplier_name || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, supplier_name: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData?.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">GSTIN</label>
                  <input
                    type="text"
                    value={editedData?.supplier_gst_number || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, supplier_gst_number: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData?.supplier_exists}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Address</label>
                  <input
                    type="text"
                    value={editedData?.supplier_address || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, supplier_address: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData?.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Drug License</label>
                  <input
                    type="text"
                    value={editedData?.drug_license || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, drug_license: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                    disabled={editedData?.supplier_exists}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Phone</label>
                  <input
                    type="text"
                    value={editedData?.phone || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, phone: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Invoice Number</label>
                  <input
                    type="text"
                    value={editedData?.invoice_number || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, invoice_number: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Invoice Date</label>
                  <input
                    type="date"
                    value={editedData?.invoice_date || ''}
                    onChange={(e) => editedData && setEditedData({ ...editedData, invoice_date: e.target.value })}
                    className="w-full mt-1 p-2 border rounded"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <h5 className="font-medium">Items ({editedData?.items?.length || 0})</h5>
                <button
                  onClick={() => {
                    const newItem = {
                      product_name: '',
                      hsn_code: '',
                      batch_number: '',
                      expiry_date: '',
                      quantity: 1,
                      free_quantity: 0,
                      mrp: 0,
                      unit_price: 0,
                      selling_price: 0,
                      discount_percent: 0,
                      tax_percent: 12
                    };
                    editedData && setEditedData({
                      ...editedData,
                      items: [...(editedData.items || []), newItem]
                    });
                  }}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
                >
                  <span className="text-lg">+</span> Add Item
                </button>
              </div>
              <div className="space-y-2">
                {editedData?.items && editedData.items.map((item, index) => {
                  // Spread item first, apply defaults only for missing values
                  const safeItem = {
                    ...item,
                    product_name: item.product_name ?? '',
                    hsn_code: item.hsn_code ?? '',
                    batch_number: item.batch_number ?? '',
                    expiry_date: item.expiry_date ?? '',
                    unit_price: item.unit_price ?? 0,
                    selling_price: item.selling_price ?? 0,
                    quantity: item.quantity ?? 0,
                    free_quantity: item.free_quantity ?? 0,
                    pack_size: item.pack_size ?? 1,
                    pack_type: item.pack_type ?? 'STRIP',
                    total_units: item.total_units ?? 0,
                    mrp: item.mrp ?? 0,
                    cost_per_unit: item.cost_per_unit ?? 0,
                    tax_percent: item.tax_percent ?? 12,
                    amount: item.amount ?? 0
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
                            className="text-red-600 hover:text-white hover:bg-red-600 p-1.5 border border-red-600 rounded transition-all"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
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

                      {/* Compact multi-column layout */}
                      <div className="grid grid-cols-7 gap-2 text-xs">
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
                          <label className="text-gray-500 text-xs">Cost</label>
                          <input
                            type="number"
                            value={safeItem.unit_price || safeItem.cost_per_unit || safeItem.unit_price || 0}
                            onChange={(e) => handleItemEdit(index, 'unit_price', e.target.value)}
                            className="w-full p-1 border rounded text-xs"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs">Selling</label>
                          <input
                            type="number"
                            value={safeItem.selling_price || ''}
                            onChange={(e) => handleItemEdit(index, 'selling_price', e.target.value)}
                            className="w-full p-1 border rounded text-xs"
                            step="0.01"
                            placeholder="SP"
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
                          <label className="text-gray-500 text-xs">Tax %</label>
                          <input
                            type="number"
                            value={safeItem.tax_percent || 12}
                            onChange={(e) => handleItemEdit(index, 'tax_percent', e.target.value)}
                            className="w-full p-1 border rounded text-xs"
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
                  <span>₹{editedData.total_amount || 0}</span>
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