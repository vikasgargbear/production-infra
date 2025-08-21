import React, { useState, useEffect, useRef } from 'react';
import { 
  RotateCcw, Save, Printer, Building2, FileText, Package, 
  AlertCircle, X, Truck, Search
} from 'lucide-react';
import { 
  EnhancedGlobalDocumentFlow, SupplierSearch, ProductSearchSimple, ItemsTable,
  DatePicker, Select, NumberInput, NotesSection, useToast
} from '../global';
import { returnsApi, purchasesApi, suppliersApi, settingsApi } from '../../services/api';
import PurchaseInvoiceSelector from './components/PurchaseInvoiceSelector';
import DebitNotePreview from './components/DebitNotePreview';
import offlineStorage from '../../services/offlineStorage';

const EnhancedPurchaseReturnFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const purchaseSearchRef = useRef(null);

  // Return data state
  const [returnData, setReturnData] = useState({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    supplier_details: null,
    purchase_id: '',
    purchase_invoice_no: '',
    purchase_date: '',
    original_purchase: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    debit_note_no: '',
    status: 'PENDING',
    transport_details: {
      transport_mode: '',
      vehicle_no: '',
      transporter_name: '',
      lr_no: ''
    }
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [returnablePurchases, setReturnablePurchases] = useState([]);
  const [returnReasons, setReturnReasons] = useState([]);

  // Generate return number
  const generateReturnNumber = () => {
    const timestamp = Date.now();
    return `PRN-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
  };

  // Initialize return number
  useEffect(() => {
    setReturnData(prev => ({
      ...prev,
      return_no: generateReturnNumber()
    }));
  }, []);

  // Load return reasons from system settings
  useEffect(() => {
    const loadReturnReasons = async () => {
      try {
        const response = await settingsApi.system.getByCategory('RETURN_REASONS');
        const settings = response.data || [];
        
        if (Array.isArray(settings) && settings.length > 0) {
          const reasons = settings
            .filter(setting => setting.setting_scope === 'PURCHASE_RETURN' || setting.setting_scope === 'ALL')
            .map(setting => ({
              value: setting.setting_key,
              label: setting.setting_name || setting.setting_value
            }));
          
          setReturnReasons(reasons);
          await offlineStorage.storeOffline('purchase_return_reasons', reasons, { persistent: true });
        } else {
          throw new Error('No return reasons found in system settings');
        }
      } catch (error) {
        console.warn('Could not load return reasons from backend:', error.message);
        
        try {
          const cached = await offlineStorage.getOffline('purchase_return_reasons', { persistent: true });
          if (cached && cached.data && Array.isArray(cached.data)) {
            setReturnReasons(cached.data);
            return;
          }
        } catch (cacheError) {
          console.warn('No cached return reasons available');
        }
        
        // Ultimate fallback to hardcoded values
        setReturnReasons([
          { value: 'EXPIRED', label: 'Expired Product' },
          { value: 'DAMAGED', label: 'Damaged/Defective Product' },
          { value: 'WRONG_PRODUCT', label: 'Wrong Product Received' },
          { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
          { value: 'EXCESS_ORDER', label: 'Excess Order' },
          { value: 'NEAR_EXPIRY', label: 'Near Expiry' },
          { value: 'RATE_DISPUTE', label: 'Rate Dispute' },
          { value: 'SCHEME_ISSUE', label: 'Scheme/Discount Issue' },
          { value: 'SUPPLIER_ISSUE', label: 'Supplier Issue' },
          { value: 'OTHER', label: 'Other' }
        ]);
      }
    };

    loadReturnReasons();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            if (supplierSearchRef.current) {
              supplierSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (purchaseSearchRef.current) {
              purchaseSearchRef.current.focus();
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveReturn();
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
      
      // ESC key handling with stopPropagation
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (currentStep === 2) {
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, onClose]);

  // Handle supplier selection
  const handleSupplierSelect = async (supplier) => {
    setSelectedSupplier(supplier);
    const supplierId = supplier.supplier_id || supplier.id;
    
    setReturnData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_details: supplier
    }));

    // Fetch returnable purchases for this supplier
    try {
      setLoading(true);
      const response = await returnsApi.getReturnablePurchases({ 
        supplier_id: supplierId
      });
      setReturnablePurchases(response.data?.purchases || []);
    } catch (error) {
      toast.error('Failed to fetch purchases: ' + (error.response?.data?.detail || error.message));
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle purchase selection
  const handlePurchaseSelect = async (purchase) => {
    setSelectedPurchase(purchase);
    setReturnData(prev => ({
      ...prev,
      purchase_id: purchase.purchase_id,
      purchase_invoice_no: purchase.invoice_number,
      purchase_date: purchase.invoice_date,
      original_purchase: purchase
    }));

    // Fetch purchase items separately
    try {
      setLoading(true);
      const response = await returnsApi.getPurchaseItems(purchase.purchase_id);
      
      if (response.data.items) {
        setReturnData(prev => ({
          ...prev,
          items: response.data.items.map(item => ({
            ...item,
            id: item.purchase_item_id,
            return_quantity: 0,
            max_returnable_qty: item.quantity - (item.returned_quantity || 0),
            return_reason: '',
            selected: false
          }))
        }));
      }
    } catch (error) {
      toast.error('Failed to fetch purchase items');
      console.error('Error fetching purchase items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update return item
  const updateReturnItem = (itemId, field, value) => {
    setReturnData(prev => ({
      ...prev,
      items: (prev.items || []).map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    (returnData.items || []).forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const itemTotal = item.return_quantity * item.rate;
        const itemTax = (itemTotal * item.tax_percent) / 100;
        subtotal += itemTotal;
        taxAmount += itemTax;
      }
    });

    const total = subtotal + taxAmount;

    setReturnData(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: total
    }));
  };

  // Watch for item changes and recalculate
  useEffect(() => {
    calculateTotals();
  }, [returnData.items]);

  // Validate return
  const validateReturn = () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return false;
    }

    if (!selectedPurchase) {
      toast.error('Please select a purchase invoice');
      return false;
    }

    const hasSelectedItems = (returnData.items || []).some(item => 
      item.selected && item.return_quantity > 0
    );

    if (!hasSelectedItems) {
      toast.error('Please select items to return');
      return false;
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    // Validate quantities
    for (const item of returnData.items || []) {
      if (item.selected && item.return_quantity > item.max_returnable_qty) {
        toast.error(`Return quantity exceeds available quantity for ${item.product_name}`);
        return false;
      }
    }

    return true;
  };

  // Proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Save return
  const handleSaveReturn = async () => {
    if (!validateReturn()) return;

    setSaving(true);
    try {
      const returnPayload = {
        ...returnData,
        items: (returnData.items || [])
          .filter(item => item.selected && item.return_quantity > 0)
          .map(item => ({
            product_id: item.product_id,
            batch_id: item.batch_id,
            quantity: item.return_quantity,
            rate: item.rate,
            tax_percent: item.tax_percent,
            return_reason: item.return_reason || returnData.return_reason
          }))
      };

      const response = await returnsApi.createPurchaseReturn(returnPayload);
      
      toast.success('Purchase return created successfully');
      
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      toast.error(error.message || 'Failed to create return');
      console.error('Error creating return:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Create content for step 1
  const createContent = (
    <div className="space-y-6">
      <div className="text-sm text-blue-700 mb-4">
        Keyboard shortcuts: <strong>Ctrl+R</strong> - Search Supplier | <strong>Ctrl+I</strong> - Search Purchase | <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
      </div>

      {/* Return Date */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-end mb-6">
          <div className="w-64">
            <DatePicker
              value={returnData.return_date}
              onChange={(date) => setReturnData(prev => ({ ...prev, return_date: date }))}
              label="Return Date"
              size="lg"
              className="w-full"
            />
          </div>
        </div>

        {/* Supplier Selection */}
        <div className="mb-6">
          {!selectedSupplier ? (
            <SupplierSearch
              ref={supplierSearchRef}
              onSupplierSelect={handleSupplierSelect}
              placeholder="Search supplier by name, phone..."
              className="w-full"
            />
          ) : (
            <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-gray-900">{selectedSupplier.supplier_name}</h4>
                <p className="text-sm text-gray-600">{selectedSupplier.phone}</p>
                <p className="text-sm text-gray-600">{selectedSupplier.address}</p>
                {selectedSupplier.gst_number && (
                  <p className="text-sm text-gray-600">GSTIN: {selectedSupplier.gst_number}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSupplier(null);
                  setSelectedPurchase(null);
                  setReturnData(prev => ({
                    ...prev,
                    supplier_id: '',
                    supplier_details: null,
                    purchase_id: '',
                    items: []
                  }));
                }}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Purchase Invoice Selection */}
        {selectedSupplier && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Select Purchase Invoice
            </h3>
            {!selectedPurchase ? (
              <PurchaseInvoiceSelector
                ref={purchaseSearchRef}
                purchases={returnablePurchases}
                onPurchaseSelect={handlePurchaseSelect}
                loading={loading}
              />
            ) : (
              <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-900">
                    Invoice #{selectedPurchase.invoice_number}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Date: {new Date(selectedPurchase.invoice_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Amount: ₹{selectedPurchase.total_amount}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPurchase(null);
                    setReturnData(prev => ({
                      ...prev,
                      purchase_id: '',
                      items: []
                    }));
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Return Reason */}
      {selectedPurchase && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
            Return Details
          </h3>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Return Reason <span className="text-red-500">*</span>
            </label>
            <Select
              value={returnData.return_reason}
              onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value }))}
              options={returnReasons}
              placeholder="Select reason..."
            />
          </div>

          {/* Transport Details */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Transport Details (Optional)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transport Mode
                </label>
                <Select
                  value={returnData.transport_details.transport_mode}
                  onChange={(value) => setReturnData(prev => ({
                    ...prev,
                    transport_details: { ...prev.transport_details, transport_mode: value }
                  }))}
                  options={[
                    { value: 'ROAD', label: 'By Road' },
                    { value: 'RAIL', label: 'By Rail' },
                    { value: 'AIR', label: 'By Air' },
                    { value: 'COURIER', label: 'Courier' }
                  ]}
                  placeholder="Select mode..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={returnData.transport_details.vehicle_no}
                  onChange={(e) => setReturnData(prev => ({
                    ...prev,
                    transport_details: { ...prev.transport_details, vehicle_no: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., MH12AB1234"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Items */}
      {selectedPurchase && (returnData.items || []).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Package className="w-5 h-5 mr-2 text-blue-600" />
                Select Items to Return
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Check the items you want to return and specify quantities
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  (returnData.items || []).forEach(item => {
                    updateReturnItem(item.id, 'selected', true);
                    updateReturnItem(item.id, 'return_quantity', item.max_returnable_qty);
                  });
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-blue-50"
              >
                Select All
              </button>
              <button
                onClick={() => {
                  (returnData.items || []).forEach(item => {
                    updateReturnItem(item.id, 'selected', false);
                    updateReturnItem(item.id, 'return_quantity', 0);
                  });
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-blue-50"
              >
                Clear All
              </button>
            </div>
          </div>
          <ItemsTable
            module="returns"
            items={returnData.items || []}
            onUpdateItem={updateReturnItem}
            reasons={returnReasons}
          />
        </div>
      )}
    </div>
  );

  // Review content for step 2
  const reviewContent = (
    <div className="space-y-6">
      <DebitNotePreview
        returnData={returnData}
        supplier={selectedSupplier}
        purchase={selectedPurchase}
      />
      
      {/* Notes Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <NotesSection
          value={returnData.return_reason_notes}
          onChange={(value) => setReturnData(prev => ({ 
            ...prev, 
            return_reason_notes: value 
          }))}
          placeholder="Add any additional notes about this return..."
          title="Return Notes"
          rows={4}
        />
      </div>
    </div>
  );

  const actionButtons = {
    step1: [
      {
        label: 'Cancel',
        variant: 'secondary',
        onClick: onClose
      },
      {
        label: 'Proceed to Review',
        variant: 'primary',
        onClick: handleProceedToReview,
        disabled: !(returnData.items || []).some(item => item.selected && item.return_quantity > 0)
      }
    ],
    step2: [
      {
        label: 'Back to Edit',
        variant: 'secondary',
        onClick: () => setCurrentStep(1)
      },
      {
        label: saving ? 'Processing...' : 'Generate Debit Note',
        variant: 'primary',
        onClick: handleSaveReturn,
        disabled: saving,
        icon: saving ? null : Save,
        loading: saving
      }
    ]
  };

  return (
    <EnhancedGlobalDocumentFlow
      documentType="purchase-return"
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      createContent={createContent}
      reviewContent={reviewContent}
      actionButtons={actionButtons}
      documentNumber={returnData.return_no}
      documentIcon={RotateCcw}
      documentTitle="Purchase Return"
      documentSubtitle={currentStep === 2 ? "Confirm and generate debit note" : undefined}
      onClose={onClose}
      keyboardShortcuts={{
        'Ctrl+R': 'Search Supplier',
        'Ctrl+I': 'Search Purchase',
        'Ctrl+S': currentStep === 2 ? 'Save Return' : 'Proceed',
        'Ctrl+P': currentStep === 2 ? 'Print' : undefined
      }}
      additionalActions={currentStep === 2 ? [
        {
          label: 'Print',
          icon: Printer,
          onClick: handlePrint,
          shortcut: 'Ctrl+P'
        }
      ] : undefined}
      footerContent={currentStep === 2 ? (
        <div className="text-lg font-semibold text-gray-900">
          Total Debit Amount: ₹{returnData.total_amount.toFixed(2)}
        </div>
      ) : undefined}
    />
  );
};

export default EnhancedPurchaseReturnFlow;