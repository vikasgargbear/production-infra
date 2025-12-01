import React, { useState, useRef, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useCompany } from '../../contexts/CompanyContext';
import useEscapeKey from '../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../hooks/useEnterAsTab';
import html2pdf from 'html2pdf.js';

// Step Components (will memoize for performance)
import InvoiceItemsStepBase from './invoice/steps/InvoiceItemsStep';
import InvoiceDetailsStepBase from './invoice/steps/InvoiceDetailsStep';
import InvoicePreviewStepBase from './invoice/steps/InvoicePreviewStep';

// Memoize expensive step components to prevent unnecessary re-renders
const InvoiceItemsStep = React.memo(InvoiceItemsStepBase);
const InvoiceDetailsStep = React.memo(InvoiceDetailsStepBase);
const InvoicePreviewStep = React.memo(InvoicePreviewStepBase);

// Shared Logic
import { useInvoiceLogic } from './invoice/hooks/useInvoiceLogic';

// Components
import { GenericSuccessModal } from '../global';
import InvoicePreview from '../invoice/components/InvoicePreviewEnterprise';
import Toast from '../common/Toast';

const InvoiceFlow = ({ onClose, prefilledData = null }) => {
  const { companyInfo } = useCompany();
  const [currentStep, setCurrentStep] = useState(1); // 1: Items, 2: Details, 3: Preview
  const invoiceFormRef = useRef(null); // For Enter-as-Tab scoping

  // Use shared invoice logic hook
  const {
    // State
    invoice,
    setInvoice,
    selectedCustomer,
    setSelectedCustomer,
    employees,
    selectedMR,
    setSelectedMR,
    sameAsShipping,
    setSameAsShipping,
    isLoading,
    error,
    setError,
    message,
    messageType,
    saving,
    showSuccessModal,
    setShowSuccessModal,
    createdInvoiceData,
    
    // Modal States
    showCustomerModal,
    setShowCustomerModal,
    showProductModal,
    setShowProductModal,
    showGSTCalculator,
    setShowGSTCalculator,
    showImportModal,
    setShowImportModal,
    showBillDiscountModal,
    setShowBillDiscountModal,
    showTaxDetailModal,
    setShowTaxDetailModal,
    showCashCalculatorModal,
    setShowCashCalculatorModal,
    showLastDealModal,
    setShowLastDealModal,
    selectedProductForLastDeal,
    setSelectedProductForLastDeal,
    showItemProfitModal,
    setShowItemProfitModal,
    
    // Refs
    productSearchRef,
    itemsTableRef,
    deliveryTypeRef,
    transportRef,
    vehicleRef,
    deliveryChargesRef,
    
    // Handlers
    handleCustomerSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    handleImport,
    handleApplyBillDiscount,
    handleSaveInvoice,
    clearMessage
  } = useInvoiceLogic(onClose, prefilledData);

  // Enable Enter-as-Tab navigation (Marg ERP style)
  useEnterAsTab({ 
    containerRef: invoiceFormRef, 
    enabled: true,
    excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
  });

  // ESC key handling for modal hierarchy
  const anyModalOpen = showGSTCalculator || showCustomerModal || showProductModal || showImportModal ||
                       showBillDiscountModal || showTaxDetailModal || showCashCalculatorModal ||
                       showLastDealModal || showItemProfitModal;

  useEscapeKey(
    useCallback(() => {
      if (currentStep === 3) {
        setCurrentStep(2);
      } else if (currentStep === 2) {
        setCurrentStep(1);
      } else {
        if (onClose) onClose();
      }
    }, [onClose, currentStep]),
    !anyModalOpen,
    'InvoiceFlow-Main'
  );

  // Print handlers
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleThermalPrint = useCallback(() => {
    // Thermal print functionality
    console.log('Thermal print not implemented yet');
    toast.info('Thermal print functionality coming soon');
  }, []);

  const handlePDFDownload = useCallback((invoiceData) => {
    const element = document.querySelector('.invoice-preview');
    if (!element) return;

    const options = {
      margin: 1,
      filename: `Invoice-${invoiceData.invoiceNumber || 'draft'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(options).from(element).save();
  }, []);

  const handleWhatsAppShare = useCallback((phone) => {
    if (!phone) {
      toast.error('No phone number available for WhatsApp');
      return;
    }
    const message = `Your invoice is ready! Invoice #${invoice.invoice_no}`;
    const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [invoice.invoice_no]);

  // Step navigation handlers
  const handleContinueFromStep1 = useCallback(() => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    if (invoice.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    setCurrentStep(2);
  }, [selectedCustomer, invoice.items.length]);

  const handleContinueFromStep2 = useCallback(() => {
    setCurrentStep(3);
  }, []);

  const handleBackFromStep3 = useCallback((targetStep = 2) => {
    console.log('🔙 [NAVIGATION] Going back from step 3 to step:', targetStep);
    console.log('🔙 [NAVIGATION] Current invoice state:', invoice);
    try {
      setCurrentStep(targetStep);
    } catch (error) {
      console.error('❌ [NAVIGATION ERROR]:', error);
      alert('Error navigating back: ' + error.message);
    }
  }, [invoice]);

  const handleBackFromStep2 = useCallback(() => {
    setCurrentStep(1);
  }, []);

  return (
    <div ref={invoiceFormRef} className="h-full bg-white">
      {/* Step 1: Invoice Items */}
      {currentStep === 1 && (
        <InvoiceItemsStep
          invoice={invoice}
          setInvoice={setInvoice}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          employees={employees}
          selectedMR={selectedMR}
          setSelectedMR={setSelectedMR}
          isLoading={isLoading}
          error={error}
          setError={setError}
          message={message}
          messageType={messageType}
          clearMessage={clearMessage}
          onClose={onClose}
          onContinue={handleContinueFromStep1}
          // Refs
          productSearchRef={productSearchRef}
          itemsTableRef={itemsTableRef}
          // Handlers
          handleCustomerSelect={handleCustomerSelect}
          handleAddItem={handleAddItem}
          handleUpdateItem={handleUpdateItem}
          handleRemoveItem={handleRemoveItem}
          handleImport={handleImport}
          handleApplyBillDiscount={handleApplyBillDiscount}
          // Modal states
          showCustomerModal={showCustomerModal}
          setShowCustomerModal={setShowCustomerModal}
          showProductModal={showProductModal}
          setShowProductModal={setShowProductModal}
          showGSTCalculator={showGSTCalculator}
          setShowGSTCalculator={setShowGSTCalculator}
          showImportModal={showImportModal}
          setShowImportModal={setShowImportModal}
          showBillDiscountModal={showBillDiscountModal}
          setShowBillDiscountModal={setShowBillDiscountModal}
          showTaxDetailModal={showTaxDetailModal}
          setShowTaxDetailModal={setShowTaxDetailModal}
          showCashCalculatorModal={showCashCalculatorModal}
          setShowCashCalculatorModal={setShowCashCalculatorModal}
          showLastDealModal={showLastDealModal}
          setShowLastDealModal={setShowLastDealModal}
          selectedProductForLastDeal={selectedProductForLastDeal}
          showItemProfitModal={showItemProfitModal}
          setShowItemProfitModal={setShowItemProfitModal}
        />
      )}

      {/* Step 2: Invoice Details */}
      {currentStep === 2 && (
        <InvoiceDetailsStep
          invoice={invoice}
          setInvoice={setInvoice}
          selectedCustomer={selectedCustomer}
          sameAsShipping={sameAsShipping}
          setSameAsShipping={setSameAsShipping}
          onClose={onClose}
          onContinue={handleContinueFromStep2}
          onBack={handleBackFromStep2}
          // Refs
          deliveryTypeRef={deliveryTypeRef}
          transportRef={transportRef}
          vehicleRef={vehicleRef}
          deliveryChargesRef={deliveryChargesRef}
        />
      )}

      {/* Step 3: Invoice Preview */}
      {currentStep === 3 && (
        <InvoicePreviewStep
          invoice={invoice}
          setInvoice={setInvoice}
          selectedCustomer={selectedCustomer}
          companyInfo={companyInfo}
          onClose={onClose}
          onBack={handleBackFromStep3}
          onSave={handleSaveInvoice}
          onPrint={handlePrint}
          onThermalPrint={handleThermalPrint}
          saving={saving}
        />
      )}

      {/* Toast Notification */}
      {message && (
        <Toast
          message={message}
          type={messageType || 'info'}
          duration={messageType === 'success' ? 10000 : 5000}
          onClose={clearMessage}
          position="top-center"
        />
      )}
      
      {/* Success Modal */}
      {showSuccessModal && createdInvoiceData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Invoice Created!"
          documentNumber={createdInvoiceData.invoiceNumber}
          documentId={createdInvoiceData.invoiceId}
          documentType="invoice"
          customerName={createdInvoiceData.customerName}
          totalAmount={createdInvoiceData.totalAmount}
          autoCloseDelay={5}
          documentData={{
            customerPhone: createdInvoiceData.customerPhone,
            customerEmail: createdInvoiceData.customerEmail,
            items: createdInvoiceData.items,
            totals: {
              total_amount: createdInvoiceData.totalAmount
            }
          }}
          partyDetails={{
            name: createdInvoiceData.customerName,
            phone: createdInvoiceData.customerPhone,
            email: createdInvoiceData.customerEmail
          }}
          companyInfo={companyInfo}
          onPrint={handlePrint}
          onThermalPrint={handleThermalPrint}
          onWhatsApp={() => handleWhatsAppShare(createdInvoiceData.customerPhone)}
          onDownload={() => handlePDFDownload(createdInvoiceData)}
          showCopy={true}
        />
      )}

      {/* Hidden Invoice Preview for PDF Generation */}
      {createdInvoiceData && showSuccessModal && (
        <div className="hidden">
          <InvoicePreview
            invoice={{
              ...invoice,
              invoice_no: createdInvoiceData.invoiceNumber,
              customer_name: createdInvoiceData.customerName,
              customer_details: {
                ...selectedCustomer,
                address: invoice.billing_address,
                gstin: selectedCustomer?.gstin,
                phone: createdInvoiceData.customerPhone || selectedCustomer?.phone || selectedCustomer?.mobile
              },
              shipping_address: invoice.shipping_address,
              is_same_address: invoice.billing_address === invoice.shipping_address,
              items: createdInvoiceData.items || invoice.items,
              net_amount: createdInvoiceData.totalAmount || invoice.net_amount,
              payment_status: invoice.payment_status || 'Paid'
            }}
            companyInfo={companyInfo}
            showAddresses={true}
            isPrintMode={true}
          />
        </div>
      )}
    </div>
  );
};

export default InvoiceFlow;