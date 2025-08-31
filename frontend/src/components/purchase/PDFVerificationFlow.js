import React, { useState, useEffect } from 'react';
import { 
  FileText, CheckCircle, AlertCircle, ChevronRight, 
  ChevronLeft, Save, X, Building2, Package, Search,
  Calendar, Hash, DollarSign, Info
} from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { purchasesApi } from '../../services/api/modules/purchases.api';
import { useToast } from '../global';
import SupplierVerificationModal from './modals/SupplierVerificationModal';
import ProductVerificationModal from './modals/ProductVerificationModal';

/**
 * PDFVerificationFlow - Step-by-step verification after PDF extraction
 * 
 * Flow:
 * 1. Supplier verification/creation
 * 2. Product-by-product verification
 * 3. Final review & save
 */
const PDFVerificationFlow = ({ 
  extractedData, 
  onComplete, 
  onCancel 
}) => {
  const toast = useToast();
  // For bulk upload, skip supplier verification and go directly to products
  const [currentStep, setCurrentStep] = useState(extractedData?.isBulkUpload ? 'products' : 'supplier'); // 'supplier', 'products', 'review'
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  
  // Verified data - for bulk upload, supplier is already verified
  const [verifiedSupplier, setVerifiedSupplier] = useState(
    extractedData?.isBulkUpload ? {
      supplier_id: extractedData.supplier_id,
      supplier_name: extractedData.supplier_name
    } : null
  );
  const [verifiedProducts, setVerifiedProducts] = useState([]);
  const [verificationStatus, setVerificationStatus] = useState({
    supplier: extractedData?.isBulkUpload || false,
    products: []
  });

  // Initialize products from extracted data
  useEffect(() => {
    if (extractedData?.items) {
      setVerifiedProducts(extractedData.items.map(item => ({
        ...item,
        verified: false,
        hasIssues: false,
        isNewProduct: false
      })));
      setVerificationStatus(prev => ({
        ...prev,
        products: new Array(extractedData.items.length).fill(false)
      }));
    }
  }, [extractedData]);

  // Handle supplier verification
  const handleSupplierVerified = (supplier) => {
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
  const handleProductVerified = (product) => {
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

  // Final save
  const handleFinalSave = () => {
    // Filter out skipped products
    const productsToSave = verifiedProducts.filter(p => !p.skipped);
    
    if (productsToSave.length === 0) {
      toast.error('No products to save');
      return;
    }

    // Compile final data
    const finalData = {
      ...extractedData,
      supplier_id: verifiedSupplier.supplier_id,
      supplier_name: verifiedSupplier.supplier_name,
      items: productsToSave.map(product => ({
        product_id: product.product_id || null,
        product_name: product.product_name,
        batch_number: product.batch_number,
        expiry_date: product.expiry_date,
        quantity: product.quantity,
        cost_price: product.cost_price,
        mrp: product.mrp,
        selling_price: product.selling_price || product.mrp * 0.9,
        tax_percent: product.tax_percent || 12,
        hsn_code: product.hsn_code,
        free_quantity: product.free_quantity || 0,
        discount_percent: product.discount_percent || 0
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
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

        {/* Content */}
        <div className="p-6">
          {currentStep === 'supplier' && (
            <SupplierVerificationModal
              extractedSupplier={{
                name: extractedData.supplier_name,
                gstin: extractedData.supplier_gstin,
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
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Review & Confirm</h3>
                
                {/* Supplier Summary */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">Supplier</span>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium text-gray-900">{verifiedSupplier?.supplier_name}</p>
                    {verifiedSupplier?.gstin && <p>GSTIN: {verifiedSupplier.gstin}</p>}
                  </div>
                </div>

                {/* Products Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Package className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">Products</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {verifiedProducts.filter(p => !p.skipped).length} of {verifiedProducts.length} items
                    </span>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {verifiedProducts.map((product, index) => (
                      <div 
                        key={index}
                        className={`flex items-center justify-between p-2 rounded ${
                          product.skipped ? 'bg-gray-100 opacity-50' : 'bg-white'
                        }`}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {product.product_name}
                            {product.skipped && <span className="ml-2 text-xs text-gray-500">(Skipped)</span>}
                          </p>
                          <p className="text-xs text-gray-500">
                            Qty: {product.quantity} | ₹{product.cost_price} | Batch: {product.batch_number}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {product.verified && !product.skipped && (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                          {product.isNewProduct && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">New</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Invoice Total</span>
                    <span className="text-xl font-semibold text-indigo-600">
                      ₹{extractedData.final_amount || extractedData.total_amount || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    setCurrentStep('products');
                    setCurrentProductIndex(verifiedProducts.length - 1);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  <ChevronLeft className="w-4 h-4 inline mr-1" />
                  Back to Products
                </button>
                
                <div className="space-x-3">
                  <button
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFinalSave}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Purchase</span>
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