import React, { useState, useEffect } from 'react';
import { 
  Package, Truck, Calendar, ArrowRight, CheckCircle,
  FileText, Clipboard, User, AlertCircle, X
} from 'lucide-react';
import { 
  PartySearch,
  ProductSearchSimple, 
  ProductCreationModal,
  ItemsTable,
  NotesSection,
  ModuleHeader,
  DatePicker,
  Select,
  NumberInput,
  useToast
} from '../global';
import AddNewSupplierModal from '../modals/AddNewSupplierModal';
import { purchasesApi } from '../../services/api';

const ModernGRNFlow = ({ onClose, purchaseOrderId = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Generate GRN number
  const generateGRNNumber = () => {
    const timestamp = Date.now();
    return `GRN-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
  };

  // GRN data state
  const [grn, setGrn] = useState({
    grn_no: generateGRNNumber(),
    grn_date: new Date().toISOString().split('T')[0],
    po_reference: purchaseOrderId || '',
    supplier_id: '',
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
      received_date: new Date().toISOString().split('T')[0]
    },
    quality_check: {
      checked_by: '',
      check_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      remarks: ''
    },
    notes: ''
  });

  // Load PO details if provided
  useEffect(() => {
    if (purchaseOrderId) {
      loadPurchaseOrder();
    }
  }, [purchaseOrderId]);

  const loadPurchaseOrder = async () => {
    try {
      // TODO: Implement purchase order API
      const response = { success: false }; // await purchaseOrdersApi.get(purchaseOrderId);
      if (response.success && response.data) {
        const po = response.data;
        setGrn(prev => ({
          ...prev,
          supplier_id: po.supplier_id,
          supplier_details: po.supplier_details,
          items: po.items.map(item => ({
            ...item,
            received_quantity: item.quantity,
            accepted_quantity: item.quantity,
            rejected_quantity: 0,
            reason_for_rejection: ''
          }))
        }));
      }
    } catch (error) {
      showToast('error', 'Failed to load purchase order details');
    }
  };

  const handleSupplierSelect = (supplier) => {
    setGrn(prev => ({
      ...prev,
      supplier_id: supplier.supplier_id || supplier.party_id,
      supplier_details: supplier
    }));
  };

  const handleProductSelect = (product, batchInfo) => {
    const newItem = {
      id: Date.now(),
      product_id: product.product_id,
      product_name: product.product_name,
      batch_number: batchInfo?.batch_number || '',
      expiry_date: batchInfo?.expiry_date || '',
      mrp: batchInfo?.mrp || product.mrp || 0,
      purchase_rate: batchInfo?.purchase_rate || product.purchase_rate || 0,
      ordered_quantity: 0,
      received_quantity: 0,
      accepted_quantity: 0,
      rejected_quantity: 0,
      reason_for_rejection: '',
      pack_size: product.pack_size || 1,
      pack_type: product.pack_type || 'STRIP'
    };

    setGrn(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const updateItem = (itemId, field, value) => {
    setGrn(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const updated = { ...item, [field]: value };
          
          // Auto-calculate rejected quantity
          if (field === 'received_quantity' || field === 'accepted_quantity') {
            updated.rejected_quantity = Math.max(0, 
              (updated.received_quantity || 0) - (updated.accepted_quantity || 0)
            );
          }
          
          return updated;
        }
        return item;
      })
    }));
  };

  const removeItem = (itemId) => {
    setGrn(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const handleProceedToReview = () => {
    // Validation
    if (!grn.supplier_id) {
      showToast('error', 'Please select a supplier');
      return;
    }
    if (grn.items.length === 0) {
      showToast('error', 'Please add at least one item');
      return;
    }
    if (!grn.supplier_invoice_no) {
      showToast('error', 'Please enter supplier invoice number');
      return;
    }
    
    setCurrentStep(2);
  };

  const handleSaveGRN = async () => {
    setSaving(true);
    try {
      const grnData = {
        ...grn,
        items: grn.items.map(({ id, ...item }) => item)
      };

      // TODO: Implement GRN API endpoint
      const response = await purchasesApi.create({
        ...grnData,
        type: 'grn'
      });
      
      if (response.success) {
        showToast('success', 'GRN created successfully');
        onClose();
      } else {
        showToast('error', response.message || 'Failed to create GRN');
      }
    } catch (error) {
      showToast('error', error.message || 'Failed to create GRN');
    } finally {
      setSaving(false);
    }
  };

  // Step 1: GRN Entry Form
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <ModuleHeader
          title="Goods Receipt Note"
          subtitle="Record receipt of goods from supplier"
          onClose={onClose}
          actions={[
            {
              label: 'Proceed to Review',
              icon: ArrowRight,
              onClick: handleProceedToReview,
              variant: 'primary',
              disabled: grn.items.length === 0 || !grn.supplier_id
            }
          ]}
        />

        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* GRN Details Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">GRN Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GRN Number
                  </label>
                  <input
                    type="text"
                    value={grn.grn_no}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GRN Date
                  </label>
                  <DatePicker
                    value={grn.grn_date}
                    onChange={(date) => setGrn(prev => ({ ...prev, grn_date: date }))}
                    placeholder="Select date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier Invoice No.
                  </label>
                  <input
                    type="text"
                    value={grn.supplier_invoice_no}
                    onChange={(e) => setGrn(prev => ({ ...prev, supplier_invoice_no: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter invoice number"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Date
                  </label>
                  <DatePicker
                    value={grn.supplier_invoice_date}
                    onChange={(date) => setGrn(prev => ({ ...prev, supplier_invoice_date: date }))}
                    placeholder="Select date"
                  />
                </div>
              </div>
              
              {grn.po_reference && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Purchase Order Reference: {grn.po_reference}
                  </p>
                </div>
              )}
            </div>

            {/* Supplier Selection */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Supplier Details</h3>
              <PartySearch
                value={grn.supplier_details}
                onChange={handleSupplierSelect}
                onCreateNew={() => setShowSupplierModal(true)}
                partyType="supplier"
                placeholder="Search supplier by name, phone, or code..."
                required
                disabled={!!purchaseOrderId}
              />
            </div>

            {/* Items Section */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Received Items</h3>
                {!purchaseOrderId && (
                  <ProductSearchSimple
                    onProductSelect={handleProductSelect}
                    onCreateProduct={() => setShowProductModal(true)}
                    placeholder="Search and add products..."
                    className="w-96"
                  />
                )}
              </div>

              {grn.items.length > 0 ? (
                <ItemsTable
                  items={grn.items}
                  onUpdateItem={updateItem}
                  onRemoveItem={removeItem}
                  columns={[
                    { key: 'product_name', label: 'Product', width: '25%' },
                    { key: 'batch_number', label: 'Batch', width: '15%', editable: true },
                    { key: 'expiry_date', label: 'Expiry', width: '15%', editable: true, type: 'date' },
                    { key: 'received_quantity', label: 'Received', width: '10%', editable: true, type: 'number' },
                    { key: 'accepted_quantity', label: 'Accepted', width: '10%', editable: true, type: 'number' },
                    { key: 'rejected_quantity', label: 'Rejected', width: '10%', className: 'text-red-600' },
                    { key: 'reason_for_rejection', label: 'Rejection Reason', width: '15%', editable: true }
                  ]}
                  showTotals={false}
                  hideRemove={!!purchaseOrderId}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No items added yet. Search and add products above.</p>
                </div>
              )}
            </div>

            {/* Transport Details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Transport Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transporter Name
                  </label>
                  <input
                    type="text"
                    value={grn.transport_details.transporter_name}
                    onChange={(e) => setGrn(prev => ({
                      ...prev,
                      transport_details: { ...prev.transport_details, transporter_name: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter transporter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={grn.transport_details.vehicle_no}
                    onChange={(e) => setGrn(prev => ({
                      ...prev,
                      transport_details: { ...prev.transport_details, vehicle_no: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter vehicle number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    LR Number
                  </label>
                  <input
                    type="text"
                    value={grn.transport_details.lr_no}
                    onChange={(e) => setGrn(prev => ({
                      ...prev,
                      transport_details: { ...prev.transport_details, lr_no: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter LR number"
                  />
                </div>
              </div>
            </div>

            {/* Quality Check */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Quality Check</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Checked By
                  </label>
                  <input
                    type="text"
                    value={grn.quality_check.checked_by}
                    onChange={(e) => setGrn(prev => ({
                      ...prev,
                      quality_check: { ...prev.quality_check, checked_by: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Name of quality checker"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Check Status
                  </label>
                  <Select
                    value={grn.quality_check.status}
                    onChange={(value) => setGrn(prev => ({
                      ...prev,
                      quality_check: { ...prev.quality_check, status: value }
                    }))}
                    options={[
                      { value: 'pending', label: 'Pending' },
                      { value: 'passed', label: 'Passed' },
                      { value: 'failed', label: 'Failed' },
                      { value: 'partial', label: 'Partially Passed' }
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Received By
                  </label>
                  <input
                    type="text"
                    value={grn.transport_details.received_by}
                    onChange={(e) => setGrn(prev => ({
                      ...prev,
                      transport_details: { ...prev.transport_details, received_by: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Name of receiver"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <NotesSection
                  value={grn.quality_check.remarks}
                  onChange={(value) => setGrn(prev => ({
                    ...prev,
                    quality_check: { ...prev.quality_check, remarks: value }
                  }))}
                  placeholder="Quality check remarks..."
                  label="Quality Remarks"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <NotesSection
                value={grn.notes}
                onChange={(value) => setGrn(prev => ({ ...prev, notes: value }))}
                placeholder="Additional notes about this GRN..."
              />
            </div>
          </div>
        </div>

        {/* Modals */}
        {showSupplierModal && (
          <AddNewSupplierModal
            isOpen={showSupplierModal}
            onClose={() => setShowSupplierModal(false)}
            onSupplierCreated={(supplier) => {
              handleSupplierSelect(supplier);
              setShowSupplierModal(false);
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            isOpen={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(product) => {
              handleProductSelect(product, null);
              setShowProductModal(false);
            }}
          />
        )}
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <ModuleHeader
        title="Review GRN"
        subtitle="Verify all details before saving"
        onBack={() => setCurrentStep(1)}
        actions={[
          {
            label: 'Edit',
            onClick: () => setCurrentStep(1),
            variant: 'secondary'
          },
          {
            label: 'Save GRN',
            icon: CheckCircle,
            onClick: handleSaveGRN,
            variant: 'primary',
            loading: saving
          }
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-sm">
            {/* GRN Header */}
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-1">Goods Receipt Note</h2>
                  <p className="text-gray-600">GRN No: {grn.grn_no}</p>
                  <p className="text-sm text-gray-500">Date: {grn.grn_date}</p>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    <Clipboard className="w-4 h-4 mr-1" />
                    {grn.quality_check.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Supplier Info */}
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold mb-3">Supplier Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Supplier Name</p>
                  <p className="font-medium">{grn.supplier_details?.party_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Details</p>
                  <p className="font-medium">
                    {grn.supplier_invoice_no} ({grn.supplier_invoice_date})
                  </p>
                </div>
              </div>
            </div>

            {/* Items Summary */}
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold mb-4">Received Items</h3>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Product</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Batch</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Received</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Accepted</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Rejected</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {grn.items.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-gray-500">Exp: {item.expiry_date || 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3 text-center">{item.batch_number}</td>
                      <td className="px-4 py-3 text-center">{item.received_quantity}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium">
                        {item.accepted_quantity}
                      </td>
                      <td className="px-4 py-3 text-center text-red-600 font-medium">
                        {item.rejected_quantity}
                      </td>
                      <td className="px-4 py-3">
                        {item.rejected_quantity > 0 ? (
                          <span className="text-red-600">
                            <AlertCircle className="w-4 h-4 inline mr-1" />
                            Partial
                          </span>
                        ) : (
                          <span className="text-green-600">
                            <CheckCircle className="w-4 h-4 inline mr-1" />
                            Complete
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Transport & Quality Info */}
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Transport Details</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">Transporter:</span> {grn.transport_details.transporter_name || 'N/A'}</p>
                    <p><span className="text-gray-600">Vehicle No:</span> {grn.transport_details.vehicle_no || 'N/A'}</p>
                    <p><span className="text-gray-600">LR No:</span> {grn.transport_details.lr_no || 'N/A'}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Quality Check</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">Checked By:</span> {grn.quality_check.checked_by || 'N/A'}</p>
                    <p><span className="text-gray-600">Received By:</span> {grn.transport_details.received_by || 'N/A'}</p>
                    <p><span className="text-gray-600">Status:</span> {grn.quality_check.status}</p>
                  </div>
                </div>
              </div>
              
              {grn.quality_check.remarks && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Quality Remarks:</strong> {grn.quality_check.remarks}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernGRNFlow;