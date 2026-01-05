import React, { useState, useEffect } from 'react';
import {
  FileText, CheckCircle, AlertCircle, ChevronRight,
  ChevronLeft, Save, X, Building2, Package, Search,
  Calendar, Hash, DollarSign, Info, Plus, Trash2
} from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { purchasesApi } from '../../services/api';
import { useToast } from '../global';
import SupplierVerificationModal from './modals/SupplierVerificationModal';
import ProductVerificationModal from './modals/ProductVerificationModal';

interface ExtractedItem {
  product_name: string;
  quantity?: number | string;
  unit_price?: number | string;
  mrp?: number | string;
  selling_price?: number | string;
  tax_percent?: number | string;
  discount_percent?: number | string;
  expiry_date?: string;
  batch_number?: string;
  batch_number?: string;
  hsn_code?: string;
  free_quantity?: number | string;
  product_id?: string | number | null;
  [key: string]: any;
}

interface ExtractedData {
  isBulkUpload?: boolean;
  supplier_id?: string;
  supplier_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  items?: ExtractedItem[];
  total_amount?: number | string;
  total_amount?: number | string;
  supplier_gst_number?: string;
  supplier_address?: string;
  [key: string]: any;
}

interface VerifiedProduct extends ExtractedItem {
  verified: boolean;
  hasIssues: boolean;
  skipped?: boolean;
  isNewProduct?: boolean;
}

interface VerifiedSupplier {
  supplier_id?: string;
  supplier_name?: string;
  gst_number?: string;
  gst_number?: string;
  primary_phone?: string;
  phone?: string;
  primary_email?: string;
  email?: string;
  address_line1?: string;
  address?: string;
  city?: string;
  state?: string;
  [key: string]: any;
}

interface PDFVerificationFlowProps {
  extractedData: ExtractedData;
  onComplete: (data: any) => void;
  onCancel: () => void;
}

/**
 * PDFVerificationFlow - Step-by-step verification after PDF extraction
 * 
 * Flow:
 * 1. Supplier verification/creation
 * 2. Product-by-product verification
 * 3. Final review & save
 */
const PDFVerificationFlow: React.FC<PDFVerificationFlowProps> = ({
  extractedData,
  onComplete,
  onCancel
}) => {
  const toast = useToast();
  // For bulk upload, skip supplier verification and go directly to products
  const [currentStep, setCurrentStep] = useState<string>(extractedData?.isBulkUpload ? 'products' : 'supplier'); // 'supplier', 'products', 'review'
  const [currentProductIndex, setCurrentProductIndex] = useState<number>(0);

  // Verified data - for bulk upload, supplier is already verified
  const [verifiedSupplier, setVerifiedSupplier] = useState<VerifiedSupplier | null>(
    extractedData?.isBulkUpload ? {
      supplier_id: extractedData.supplier_id,
      supplier_name: extractedData.supplier_name
    } : null
  );
  const [verifiedProducts, setVerifiedProducts] = useState<VerifiedProduct[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<{
    supplier: boolean;
    products: boolean[];
  }>({
    supplier: !!extractedData?.isBulkUpload,
    products: []
  });

  // Initialize products from extracted data
  useEffect(() => {
    if (extractedData?.items) {
      setVerifiedProducts((extractedData.items || []).map(item => ({
        ...item,
        verified: false,
        hasIssues: false,
        isNewProduct: false
      })));
      setVerificationStatus(prev => ({
        ...prev,
        products: new Array((extractedData.items || []).length).fill(false)
      }));
    }
  }, [extractedData]);

  // Handle supplier verification
  const handleSupplierVerified = (supplier: VerifiedSupplier) => {
    setVerifiedSupplier(supplier);
    setVerificationStatus(prev => ({ ...prev, supplier: true }));

    // Move to first product
    if (verifiedProducts.length > 0) {
      setCurrentStep('products');
      setCurrentProductIndex(0);
    } else {
      toast.error('No products found in the invoice');
    }
  };

  // Handle product verification
  const handleProductVerified = (product: VerifiedProduct) => {
    const updatedProducts = [...verifiedProducts];
    updatedProducts[currentProductIndex] = {
      ...product,
      verified: true
    };
    setVerifiedProducts(updatedProducts);

    const updatedStatus = [...verificationStatus.products];
    updatedStatus[currentProductIndex] = true;
    setVerificationStatus(prev => ({ ...prev, products: updatedStatus }));

    // Move to next product or review
    if (currentProductIndex < verifiedProducts.length - 1) {
      setCurrentProductIndex(currentProductIndex + 1);
    } else {
      setCurrentStep('review');
    }
  };

  // Navigate between products
  const goToPreviousProduct = () => {
    if (currentProductIndex > 0) {
      setCurrentProductIndex(currentProductIndex - 1);
    } else if (currentStep === 'products' && !extractedData?.isBulkUpload) {
      // Only go back to supplier if not bulk upload
      setCurrentStep('supplier');
    }
  };

  const goToNextProduct = () => {
    if (currentProductIndex < verifiedProducts.length - 1) {
      setCurrentProductIndex(currentProductIndex + 1);
    } else {
      setCurrentStep('review');
    }
  };

  // Skip current product
  const skipProduct = () => {
    const updatedProducts = [...verifiedProducts];
    updatedProducts[currentProductIndex] = {
      ...updatedProducts[currentProductIndex],
      skipped: true,
      verified: false
    };
    setVerifiedProducts(updatedProducts);
    goToNextProduct();
  };

  // Add new product
  const addNewProduct = () => {
    const newProduct = {
      product_id: null,
      product_name: '',
      batch_number: '',
      expiry_date: '',
      quantity: 1,
      unit_price: 0,
      mrp: 0,
      selling_price: 0,
      tax_percent: 12,
      hsn_code: '',
      free_quantity: 0,
      discount_percent: 0,
      verified: false,
      hasIssues: false,
      isNewProduct: true
    };

    const updatedProducts = [...verifiedProducts, newProduct];
    setVerifiedProducts(updatedProducts);

    // Expand verification status array
    const updatedStatus = [...verificationStatus.products, false];
    setVerificationStatus(prev => ({ ...prev, products: updatedStatus }));

    // Go to the new product for verification
    setCurrentProductIndex(updatedProducts.length - 1);
    setCurrentStep('products');
  };

  // Remove product
  const removeProduct = (index: number) => {
    const updatedProducts = verifiedProducts.filter((_, i) => i !== index);
    setVerifiedProducts(updatedProducts);

    // Update verification status
    const updatedStatus = verificationStatus.products.filter((_, i) => i !== index);
    setVerificationStatus(prev => ({ ...prev, products: updatedStatus }));

    // Adjust current index if needed
    if (currentProductIndex >= updatedProducts.length) {
      if (updatedProducts.length === 0) {
        setCurrentStep('review');
      } else {
        setCurrentProductIndex(updatedProducts.length - 1);
      }
    }
  };

  // Final save
  const handleFinalSave = () => {
    // Filter out skipped products
    const productsToSave = verifiedProducts.filter(p => !p.skipped);

    if (productsToSave.length === 0) {
      toast.error('No products to save');
      return;
    }

    // Compile final data with all supplier info
    if (!verifiedSupplier) {
      toast.error('Supplier verification incomplete');
      return;
    }

    const finalData = {
      ...extractedData,
      supplier_id: verifiedSupplier.supplier_id,
      supplier_name: verifiedSupplier.supplier_name,
      supplier_gst: verifiedSupplier.gst_number || verifiedSupplier.gst_number,
      supplier_gst_number: verifiedSupplier.gst_number || verifiedSupplier.gst_number,
      supplier_phone: verifiedSupplier.primary_phone || verifiedSupplier.phone,
      supplier_email: verifiedSupplier.primary_email || verifiedSupplier.email,
      supplier_address: verifiedSupplier.address_line1 || verifiedSupplier.address,
      fromPDFExtract: !extractedData.isBulkUpload, // Mark as PDF extract if not bulk upload
      items: productsToSave.map(product => ({
        product_id: product.product_id || null,
        product_name: product.product_name,
        batch_number: product.batch_number || product.batch_number,
        expiry_date: product.expiry_date,
        quantity: product.quantity,
        unit_price: product.unit_price,
        mrp: product.mrp,
        selling_price: product.selling_price || (parseFloat(String(product.mrp || 0)) * 0.9),
        tax_percent: product.tax_percent || 12,
        hsn_code: product.hsn_code,
        free_quantity: product.free_quantity || 0,
        discount_percent: product.discount_percent || 0,
        isNewProduct: product.isNewProduct || false
      }))
    };

    onComplete(finalData);
    toast.success('Verification complete! Saving purchase...');
  };

  // Progress indicator
  const getProgress = () => {
    if (extractedData?.isBulkUpload) {
      // For bulk upload, only count products
      const productsDone = verificationStatus.products.filter(p => p).length;
      const total = verifiedProducts.length;
      return total > 0 ? Math.round((productsDone / total) * 100) : 0;
    } else {
      // For PDF upload, count supplier + products
      const supplierDone = verificationStatus.supplier ? 1 : 0;
      const productsDone = verificationStatus.products.filter(p => p).length;
      const total = 1 + verifiedProducts.length;
      return Math.round(((supplierDone + productsDone) / total) * 100);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-white" />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {extractedData?.isBulkUpload ? 'Verify Bulk Upload Data' : 'Verify Invoice Data'}
                </h2>
                <p className="text-indigo-100 text-sm">
                  {extractedData?.isBulkUpload
                    ? `Step ${currentStep === 'products' ? '1' : '2'} of 2`
                    : `Step ${currentStep === 'supplier' ? '1' : currentStep === 'products' ? '2' : '3'} of 3`
                  }
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-full transition-all duration-300"
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        </div>

        {/* Content - flex-1 to take remaining space */}
        <div className="flex-1 p-6 overflow-y-auto">
          {currentStep === 'supplier' && (
            <SupplierVerificationModal
              extractedSupplier={{
                name: extractedData.supplier_name,
                gst_number: extractedData.supplier_gst_number,
                address: extractedData.supplier_address,
                invoice_number: extractedData.invoice_number,
                invoice_date: extractedData.invoice_date
              }}
              onVerified={handleSupplierVerified}
              onCancel={onCancel}
            />
          )}

          {currentStep === 'products' && (
            <ProductVerificationModal
              product={verifiedProducts[currentProductIndex]}
              productIndex={currentProductIndex}
              totalProducts={verifiedProducts.length}
              onVerified={handleProductVerified}
              onSkip={skipProduct}
              onPrevious={goToPreviousProduct}
              onNext={goToNextProduct}
            />
          )}

          {currentStep === 'review' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Review Complete Purchase Entry</h3>

              {/* Invoice Header Info */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Invoice #:</span>
                    <span className="ml-2 font-semibold">{extractedData.invoice_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <span className="ml-2 font-semibold">{extractedData.invoice_date}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="ml-2 font-semibold">₹{extractedData.total_amount || extractedData.total_amount || 0}</span>
                  </div>
                </div>
              </div>

              {/* Supplier Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">Supplier Details</span>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><span className="text-gray-600">Name:</span> <span className="font-medium">{verifiedSupplier?.supplier_name || verifiedSupplier?.name}</span></p>
                    {(verifiedSupplier?.gst_number || verifiedSupplier?.gst_number) && <p><span className="text-gray-600">GSTIN:</span> {verifiedSupplier.gst_number || verifiedSupplier.gst_number}</p>}
                    {(verifiedSupplier?.primary_phone || verifiedSupplier?.phone) && <p><span className="text-gray-600">Phone:</span> {verifiedSupplier.primary_phone || verifiedSupplier.phone}</p>}
                  </div>
                  <div>
                    {(verifiedSupplier?.primary_email || verifiedSupplier?.email) && <p><span className="text-gray-600">Email:</span> {verifiedSupplier.primary_email || verifiedSupplier.email}</p>}
                    {verifiedSupplier?.address_line1 && <p><span className="text-gray-600">Address:</span> {verifiedSupplier.address_line1}</p>}
                    {verifiedSupplier?.city && <p><span className="text-gray-600">City:</span> {verifiedSupplier.city}, {verifiedSupplier.state}</p>}
                  </div>
                </div>
              </div>

              {/* Products Table */}
              <div className="bg-white border rounded-lg">
                <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                  <div className="flex items-center space-x-2">
                    <Package className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">Products ({verifiedProducts.filter(p => !p.skipped).length} items)</span>
                  </div>
                  <button
                    onClick={addNewProduct}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Add new product"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-xs">
                        <th className="text-left px-2 py-2">Product</th>
                        <th className="text-left px-2 py-2">Expiry</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">Free</th>
                        <th className="text-right px-2 py-2">Disc%</th>
                        <th className="text-right px-2 py-2">Cost</th>
                        <th className="text-right px-2 py-2">MRP</th>
                        <th className="text-right px-2 py-2">Rate</th>
                        <th className="text-right px-2 py-2">Tax%</th>
                        <th className="text-right px-2 py-2">Tax Amt</th>
                        <th className="text-right px-2 py-2">Total</th>
                        <th className="text-center px-2 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifiedProducts.filter(p => !p.skipped).map((product, index) => {
                        // Calculate line totals
                        const qty = parseFloat(String(product.quantity || 0));
                        const cost = parseFloat(String(product.unit_price || 0));
                        const discountPercent = parseFloat(String(product.discount_percent || 0));
                        const taxPercent = parseFloat(String(product.tax_percent || 0));

                        // Calculate base amount after discount
                        const baseAmount = qty * cost;
                        const discountAmount = baseAmount * (discountPercent / 100);
                        const discountedAmount = baseAmount - discountAmount;

                        // Calculate tax on discounted amount
                        const taxAmount = discountedAmount * (taxPercent / 100);
                        const totalAmount = discountedAmount + taxAmount;

                        return (
                          <tr key={index} className="border-b hover:bg-gray-50 text-xs">
                            <td className="px-2 py-1">
                              <div>
                                <p className="font-medium truncate max-w-[150px]" title={product.product_name}>
                                  {product.product_name}
                                </p>
                                {product.hsn_code && <p className="text-[10px] text-gray-500">HSN: {product.hsn_code}</p>}
                              </div>
                            </td>
                            <td className="px-2 py-1">{product.expiry_date}</td>
                            <td className="px-2 py-1 text-right font-medium">{product.quantity}</td>
                            <td className="px-2 py-1 text-right">{product.free_quantity || 0}</td>
                            <td className="px-2 py-1 text-right">{product.discount_percent || 0}%</td>
                            <td className="px-2 py-1 text-right">₹{cost.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right">₹{product.mrp || 0}</td>
                            <td className="px-2 py-1 text-right">₹{product.selling_price || (parseFloat(String(product.mrp || 0)) * 0.9) || 0}</td>
                            <td className="px-2 py-1 text-right">{taxPercent}%</td>
                            <td className="px-2 py-1 text-right">₹{taxAmount.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right font-semibold">₹{totalAmount.toFixed(2)}</td>
                            <td className="px-2 py-1 text-center">
                              <button
                                onClick={() => {
                                  const actualIndex = verifiedProducts.findIndex(p => p === product);
                                  removeProduct(actualIndex);
                                }}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 text-xs">
                      <tr>
                        <td colSpan={9} className="px-2 py-1 text-right font-medium">Subtotal:</td>
                        <td className="px-2 py-1 text-right">
                          ₹{verifiedProducts.filter(p => !p.skipped).reduce((sum, p) => {
                            const qty = parseFloat(String(p.quantity || 0));
                            const cost = parseFloat(String(p.unit_price || 0));
                            const discount = parseFloat(String(p.discount_percent || 0));
                            const base = qty * cost;
                            return sum + (base - (base * discount / 100));
                          }, 0).toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                      <tr>
                        <td colSpan={9} className="px-2 py-1 text-right font-medium">Total Tax:</td>
                        <td className="px-2 py-1 text-right">
                          ₹{verifiedProducts.filter(p => !p.skipped).reduce((sum, p) => {
                            const qty = parseFloat(String(p.quantity || 0));
                            const cost = parseFloat(String(p.unit_price || 0));
                            const discount = parseFloat(String(p.discount_percent || 0));
                            const tax = parseFloat(String(p.tax_percent || 0));
                            const base = qty * cost;
                            const discountedAmount = base - (base * discount / 100);
                            return sum + (discountedAmount * tax / 100);
                          }, 0).toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                      <tr className="font-semibold">
                        <td colSpan={10} className="px-2 py-2 text-right">Grand Total:</td>
                        <td className="px-2 py-2 text-right text-indigo-600">
                          ₹{verifiedProducts.filter(p => !p.skipped).reduce((sum, p) => {
                            const qty = parseFloat(String(p.quantity || 0));
                            const cost = parseFloat(String(p.unit_price || 0));
                            const discount = parseFloat(String(p.discount_percent || 0));
                            const tax = parseFloat(String(p.tax_percent || 0));
                            const base = qty * cost;
                            const discountedAmount = base - (base * discount / 100);
                            const taxAmount = discountedAmount * tax / 100;
                            return sum + discountedAmount + taxAmount;
                          }, 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Action Buttons - Better Layout */}
              <div className="flex justify-between items-center pt-4 border-t">
                <button
                  onClick={() => {
                    setCurrentStep('products');
                    setCurrentProductIndex(verifiedProducts.length - 1);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back to Products
                </button>

                <div className="flex space-x-3">
                  <button
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFinalSave}
                    className="px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
                  >
                    <Save className="w-5 h-5" />
                    <span>Confirm & Save Purchase</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFVerificationFlow;