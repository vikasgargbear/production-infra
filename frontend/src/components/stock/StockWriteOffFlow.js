import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, Calendar, Package, FileText, Trash2, 
  Save, X, Search, Filter, ChevronRight, AlertCircle
} from 'lucide-react';
import { 
  ModuleHeader, ProductSearchSimple, DatePicker, Select, 
  NotesSection, useToast, DataTable
} from '../global';
import { stockApi, productsApi } from '../../services/api';

// Write-off reasons as per GST requirements
const WRITE_OFF_REASONS = [
  { value: 'EXPIRED', label: 'Expired Products', gstAction: 'ITC_REVERSAL' },
  { value: 'DAMAGED', label: 'Damaged/Broken', gstAction: 'ITC_REVERSAL' },
  { value: 'THEFT', label: 'Theft/Loss', gstAction: 'ITC_REVERSAL' },
  { value: 'SAMPLE', label: 'Free Sample Distribution', gstAction: 'NO_REVERSAL' },
  { value: 'PERSONAL_USE', label: 'Personal Use', gstAction: 'ITC_REVERSAL' },
  { value: 'DESTROYED', label: 'Destroyed by Authority', gstAction: 'ITC_REVERSAL' },
  { value: 'OTHER', label: 'Other', gstAction: 'ITC_REVERSAL' }
];

const StockWriteOffFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Write-off data state
  const [writeOffData, setWriteOffData] = useState({
    write_off_no: '',
    write_off_date: new Date().toISOString().split('T')[0],
    reason: '',
    reason_notes: '',
    items: [],
    total_cost_value: 0,
    total_itc_reversal: 0,
    approved_by: '',
    approval_date: null,
    supporting_documents: []
  });

  const [expiringProducts, setExpiringProducts] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterExpired, setFilterExpired] = useState(true);
  const [filterExpiring, setFilterExpiring] = useState(true);

  // Generate write-off number
  const generateWriteOffNumber = () => {
    const timestamp = Date.now();
    return `WO-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
  };

  // Initialize
  useEffect(() => {
    setWriteOffData(prev => ({
      ...prev,
      write_off_no: generateWriteOffNumber()
    }));
    loadExpiringStock();
  }, []);

  // Load expiring/expired stock
  const loadExpiringStock = async () => {
    setLoading(true);
    try {
      const response = await stockApi.getExpiryReport({
        days_ahead: 90,
        include_expired: true
      });

      if (response.data) {
        const items = response.data.items || [];
        // Transform items for write-off
        const transformedItems = items.map(item => ({
          id: `${item.product_id}_${item.batch_id}`,
          product_id: item.product_id,
          product_name: item.product_name,
          batch_id: item.batch_id,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          current_stock: item.current_stock || item.quantity,
          cost_price: item.cost_price || item.purchase_price || 0,
          mrp: item.mrp,
          gst_percent: item.gst_percent || 18,
          write_off_quantity: 0,
          selected: false,
          is_expired: new Date(item.expiry_date) < new Date(),
          days_to_expiry: Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
        }));

        setExpiringProducts(transformedItems);
      }
    } catch (error) {
      toast.error('Failed to load expiring stock');
      console.error('Error loading expiring stock:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter products based on status
  const getFilteredProducts = () => {
    return expiringProducts.filter(item => {
      if (filterExpired && item.is_expired) return true;
      if (filterExpiring && !item.is_expired && item.days_to_expiry <= 90) return true;
      return false;
    });
  };

  // Update write-off item
  const updateWriteOffItem = (itemId, field, value) => {
    setExpiringProducts(prev => prev.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        
        // Auto-select if quantity > 0
        if (field === 'write_off_quantity' && value > 0 && !item.selected) {
          updated.selected = true;
        }
        // Auto-deselect if quantity is 0
        if (field === 'write_off_quantity' && value === 0) {
          updated.selected = false;
        }
        
        return updated;
      }
      return item;
    }));
  };

  // Calculate totals
  const calculateTotals = () => {
    let totalCost = 0;
    let totalITC = 0;
    const selectedReason = WRITE_OFF_REASONS.find(r => r.value === writeOffData.reason);
    const requiresITCReversal = selectedReason?.gstAction === 'ITC_REVERSAL';

    expiringProducts.forEach(item => {
      if (item.selected && item.write_off_quantity > 0) {
        const itemCost = item.write_off_quantity * item.cost_price;
        totalCost += itemCost;
        
        if (requiresITCReversal) {
          // Calculate ITC to be reversed
          const itcAmount = (itemCost * item.gst_percent) / 100;
          totalITC += itcAmount;
        }
      }
    });

    setWriteOffData(prev => ({
      ...prev,
      total_cost_value: totalCost,
      total_itc_reversal: totalITC
    }));
  };

  // Watch for changes
  useEffect(() => {
    calculateTotals();
  }, [expiringProducts, writeOffData.reason]);

  // Validate write-off
  const validateWriteOff = () => {
    const selectedItems = expiringProducts.filter(item => 
      item.selected && item.write_off_quantity > 0
    );

    if (selectedItems.length === 0) {
      toast.error('Please select items to write off');
      return false;
    }

    if (!writeOffData.reason) {
      toast.error('Please select a write-off reason');
      return false;
    }

    // Validate quantities
    for (const item of selectedItems) {
      if (item.write_off_quantity > item.current_stock) {
        toast.error(`Write-off quantity exceeds available stock for ${item.product_name}`);
        return false;
      }
    }

    return true;
  };

  // Save write-off
  const handleSaveWriteOff = async () => {
    if (!validateWriteOff()) return;

    setSaving(true);
    try {
      const selectedReason = WRITE_OFF_REASONS.find(r => r.value === writeOffData.reason);
      const payload = {
        ...writeOffData,
        requires_itc_reversal: selectedReason?.gstAction === 'ITC_REVERSAL',
        items: expiringProducts
          .filter(item => item.selected && item.write_off_quantity > 0)
          .map(item => ({
            product_id: item.product_id,
            batch_id: item.batch_id,
            quantity: item.write_off_quantity,
            cost_price: item.cost_price,
            gst_percent: item.gst_percent,
            reason: writeOffData.reason
          }))
      };

      const response = await stockApi.createWriteOff(payload);
      
      if (response.data?.requires_itc_reversal) {
        toast.success(`Stock write-off created successfully. ITC reversal of ₹${writeOffData.total_itc_reversal.toFixed(2)} will be processed.`);
      } else {
        toast.success('Stock write-off created successfully');
      }
      
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      toast.error(error.message || 'Failed to create write-off');
      console.error('Error creating write-off:', error);
    } finally {
      setSaving(false);
    }
  };

  // Step 1: Select Items and Reason
  if (currentStep === 1) {
    const filteredProducts = getFilteredProducts();

    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Stock Write-Off"
            subtitle="Write off expired, damaged or lost inventory"
            onClose={onClose}
            actions={[
              {
                label: 'History',
                icon: History,
                onClick: () => {},
                shortcut: 'Ctrl+H'
              }
            ]}
          />

          {/* Filters */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filterExpired}
                    onChange={(e) => setFilterExpired(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Expired Items
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filterExpiring}
                    onChange={(e) => setFilterExpiring(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Expiring Soon (90 days)
                  </span>
                </label>
              </div>
              <div className="text-sm text-gray-500">
                {filteredProducts.length} items found
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Write-off Details */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Write-Off Details</h2>
                    <p className="text-sm text-gray-600 mt-1">Write-Off No: {writeOffData.write_off_no}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Date</div>
                    <DatePicker
                      value={writeOffData.write_off_date}
                      onChange={(date) => setWriteOffData(prev => ({ ...prev, write_off_date: date }))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Write-Off Reason <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={writeOffData.reason}
                      onChange={(value) => setWriteOffData(prev => ({ ...prev, reason: value }))}
                      options={WRITE_OFF_REASONS}
                      placeholder="Select reason..."
                    />
                    {writeOffData.reason && (
                      <div className="mt-2">
                        {WRITE_OFF_REASONS.find(r => r.value === writeOffData.reason)?.gstAction === 'ITC_REVERSAL' ? (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            ITC reversal required for this reason
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            No ITC reversal required
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes
                    </label>
                    <textarea
                      value={writeOffData.reason_notes}
                      onChange={(e) => setWriteOffData(prev => ({ 
                        ...prev, 
                        reason_notes: e.target.value 
                      }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      placeholder="Additional details about the write-off..."
                    />
                  </div>
                </div>
              </div>

              {/* Items Table */}
              {loading ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
                  </div>
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Select Items to Write Off</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          filteredProducts.forEach(item => {
                            updateWriteOffItem(item.id, 'selected', true);
                            updateWriteOffItem(item.id, 'write_off_quantity', item.current_stock);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          filteredProducts.forEach(item => {
                            updateWriteOffItem(item.id, 'selected', false);
                            updateWriteOffItem(item.id, 'write_off_quantity', 0);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Select
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Product
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Batch
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Expiry
                          </th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            Available
                          </th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            Write-off Qty
                          </th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Cost/Unit
                          </th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            GST%
                          </th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Total Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredProducts.map((item) => {
                          const totalValue = item.write_off_quantity * item.cost_price;
                          const itcAmount = (totalValue * item.gst_percent) / 100;

                          return (
                            <tr key={item.id} className={item.selected ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-4">
                                <input
                                  type="checkbox"
                                  checked={item.selected || false}
                                  onChange={(e) => updateWriteOffItem(item.id, 'selected', e.target.checked)}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                />
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex items-center gap-2">
                                  {item.is_expired && (
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                  )}
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                                    <div className="text-xs text-gray-500">MRP: ₹{item.mrp}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-4 text-sm text-gray-600">
                                {item.batch_number}
                              </td>
                              <td className="px-3 py-4">
                                <div className={`text-sm ${item.is_expired ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                  {new Date(item.expiry_date).toLocaleDateString()}
                                  {!item.is_expired && (
                                    <div className="text-xs text-orange-600">
                                      {item.days_to_expiry} days left
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-4 text-center text-sm text-gray-900">
                                {item.current_stock}
                              </td>
                              <td className="px-3 py-4">
                                <input
                                  type="number"
                                  value={item.write_off_quantity || 0}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    updateWriteOffItem(item.id, 'write_off_quantity', value);
                                  }}
                                  min={0}
                                  max={item.current_stock}
                                  className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                              </td>
                              <td className="px-3 py-4 text-right text-sm text-gray-900">
                                ₹{item.cost_price.toFixed(2)}
                              </td>
                              <td className="px-3 py-4 text-center text-sm text-gray-600">
                                {item.gst_percent}%
                              </td>
                              <td className="px-3 py-4 text-right">
                                {item.write_off_quantity > 0 && (
                                  <>
                                    <div className="text-sm font-medium text-gray-900">
                                      ₹{totalValue.toFixed(2)}
                                    </div>
                                    {WRITE_OFF_REASONS.find(r => r.value === writeOffData.reason)?.gstAction === 'ITC_REVERSAL' && (
                                      <div className="text-xs text-red-600">
                                        ITC: ₹{itcAmount.toFixed(2)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                  <div className="text-center">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No expiring or expired stock found</p>
                  </div>
                </div>
              )}

              {/* Summary */}
              {expiringProducts.some(item => item.selected && item.write_off_quantity > 0) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Write-Off Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Items to Write-Off</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {expiringProducts.filter(item => item.selected && item.write_off_quantity > 0).length}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Total Cost Value</div>
                      <div className="text-2xl font-bold text-gray-900">
                        ₹{writeOffData.total_cost_value.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <div className="text-sm text-red-600">ITC to be Reversed</div>
                      <div className="text-2xl font-bold text-red-600">
                        ₹{writeOffData.total_itc_reversal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!expiringProducts.some(item => item.selected && item.write_off_quantity > 0) || !writeOffData.reason}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Review Write-Off
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
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
        <ModuleHeader
          title="Review Stock Write-Off"
          subtitle="Confirm write-off and ITC reversal"
          onClose={onClose}
          actions={[
            {
              label: 'Back',
              icon: ArrowLeft,
              onClick: () => setCurrentStep(1)
            }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-8 h-8 text-red-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Stock Write-Off Confirmation</h2>
                  <p className="text-gray-600">Write-Off No: {writeOffData.write_off_no}</p>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-semibold mb-1">Important GST Compliance Notice:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This write-off will reduce your inventory permanently</li>
                      {writeOffData.total_itc_reversal > 0 && (
                        <>
                          <li>ITC of ₹{writeOffData.total_itc_reversal.toFixed(2)} will be reversed</li>
                          <li>You must report this ITC reversal in your next GST return</li>
                        </>
                      )}
                      <li>Maintain proper documentation for GST audit purposes</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Date</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {new Date(writeOffData.write_off_date).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reason</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {WRITE_OFF_REASONS.find(r => r.value === writeOffData.reason)?.label}
                    </p>
                  </div>
                </div>

                {writeOffData.reason_notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Notes</label>
                    <p className="text-gray-700 mt-1">{writeOffData.reason_notes}</p>
                  </div>
                )}

                {/* Items Summary */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Items to be Written Off</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {expiringProducts
                          .filter(item => item.selected && item.write_off_quantity > 0)
                          .map((item, index) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 text-sm">{item.product_name}</td>
                              <td className="px-4 py-3 text-sm">{item.batch_number}</td>
                              <td className="px-4 py-3 text-sm text-center">{item.write_off_quantity}</td>
                              <td className="px-4 py-3 text-sm text-right">
                                ₹{(item.write_off_quantity * item.cost_price).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right font-semibold">Total Cost Value:</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            ₹{writeOffData.total_cost_value.toFixed(2)}
                          </td>
                        </tr>
                        {writeOffData.total_itc_reversal > 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-right font-semibold text-red-600">
                              ITC to be Reversed:
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">
                              ₹{writeOffData.total_itc_reversal.toFixed(2)}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-white">
          <div className="text-sm text-gray-600">
            {writeOffData.total_itc_reversal > 0 ? (
              <span className="text-red-600 font-medium">
                This action will reverse ITC of ₹{writeOffData.total_itc_reversal.toFixed(2)}
              </span>
            ) : (
              <span className="text-green-600 font-medium">
                No ITC reversal required for this write-off
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSaveWriteOff}
              disabled={saving}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Confirm Write-Off
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockWriteOffFlow;