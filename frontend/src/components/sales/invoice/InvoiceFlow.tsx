import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useCompany } from '../../../contexts/CompanyContext';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import html2pdf from 'html2pdf.js';
import { calculateInvoicePreview } from '../../../services/calculations/invoiceCalculationService';
import InvoiceItemsStepBase from './steps/InvoiceItemsStep';
import InvoiceDetailsStepBase from './steps/InvoiceDetailsStep';
import InvoicePreviewStepBase from './steps/InvoicePreviewStep';
import {
    useInvoiceLogic,
    Invoice,
    CreatedInvoiceData,
    PrefilledData,
} from './hooks/useInvoiceLogic';
import { GenericSuccessModal } from '../../global';
import InvoicePreview from './ui/InvoicePreviewEnterprise';
import {
    invoiceBatchAllocationValidationError,
    invoicePreviewValidationError,
} from './utils/canonicalInvoiceCommand';

// ==================== TYPE DEFINITIONS ====================

interface InvoiceFlowProps {
    open?: boolean;  // For modal/panel usage
    onClose?: () => void;
    prefilledData?: PrefilledData | null;
}

interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    gst_number?: string;
    [key: string]: unknown;
}

// Memoize expensive step components to prevent unnecessary re-renders
const InvoiceItemsStep = React.memo(InvoiceItemsStepBase);
const InvoiceDetailsStep = React.memo(InvoiceDetailsStepBase);
const InvoicePreviewStep = React.memo(InvoicePreviewStepBase);

// ==================== MAIN COMPONENT ====================

const InvoiceFlow: React.FC<InvoiceFlowProps> = ({ open = true, onClose, prefilledData = null }) => {


    const { companyInfo } = useCompany() as unknown as { companyInfo: CompanyInfo };
    const [currentStep, setCurrentStep] = useState(1); // 1: Items, 2: Details, 3: Preview
    const invoiceFormRef = useRef<HTMLDivElement>(null); // For Enter-as-Tab scoping

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
        isLoading,
        isOnline,
        error,
        setError,
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
        resetInvoice,
        handleSaveInvoice,

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
        // Trigger thermal print using PrintUtility if available
        const printEvent = new CustomEvent('thermalPrint', { detail: { size: '80mm' } });
        document.dispatchEvent(printEvent);
    }, []);

    const handlePDFDownload = useCallback((invoiceData: CreatedInvoiceData) => {
        // Try to find the hidden invoice preview by ID
        const element = document.getElementById('invoice-preview');
        if (!element) {
            toast.error('Unable to generate PDF - preview not found');
            console.error('[PDF] Could not find #invoice-preview element');
            return;
        }

        // Maximum quality settings for html2pdf
        const options = {
            margin: [5, 5, 5, 5] as [number, number, number, number],
            filename: `Invoice-${invoiceData.invoiceNumber || 'draft'}.pdf`,
            image: { type: 'jpeg' as const, quality: 1 },
            html2canvas: {
                scale: 3,  // Reduced scale - too high can cause blurry output
                useCORS: true,
                logging: false,
                letterRendering: true,
                windowWidth: 794,  // A4 width in pixels at 96dpi
                dpi: 300,  // Higher DPI for print quality
                scrollX: 0,
                scrollY: -window.scrollY  // Capture from current scroll position
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait' as const,
                compress: false,  // Disable compression for sharper text
                precision: 16  // Higher precision
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // Silent PDF generation - only show errors
        html2pdf().set(options).from(element).save()
            .catch((err: Error) => toast.error(`PDF generation failed: ${err.message}`));
    }, []);

    const handleWhatsAppShare = useCallback((phone: string | undefined, customerName?: string, amount?: number) => {
        if (!phone) {
            toast.error('No phone number available for WhatsApp');
            return;
        }
        // Clean phone number - remove all non-digits
        let cleanPhone = phone.replace(/[^0-9]/g, '');

        // Add India country code (91) if not present
        if (cleanPhone.length === 10) {
            cleanPhone = '91' + cleanPhone;
        } else if (cleanPhone.startsWith('0')) {
            // Remove leading 0 and add 91
            cleanPhone = '91' + cleanPhone.substring(1);
        }

        // Personalized message with customer name, invoice number, amount, and date
        const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        const formattedAmount = amount ? `₹${amount.toLocaleString('en-IN')}` : '';

        const whatsappMessage = `Dear ${customerName || 'Customer'},

Your invoice ${invoice.invoice_number} dated ${invoiceDate} for ${formattedAmount} is ready.

Thank you for your business!
${companyInfo?.name || 'Your Company'}`;

        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, '_blank');
    }, [invoice.invoice_number, invoice.invoice_date, companyInfo?.name]);

    // Step navigation handlers
    const handleContinueFromStep1 = useCallback(async () => {
        if (!selectedCustomer) {
            toast.error('Please select a customer');
            return;
        }
        if (invoice.items.length === 0) {
            toast.error('Please add at least one item');
            return;
        }
        const batchAllocationError = invoiceBatchAllocationValidationError(invoice);
        if (batchAllocationError) {
            setError(batchAllocationError);
            toast.error(batchAllocationError);
            return;
        }

        try {
            const result = await calculateInvoicePreview(invoice, isOnline);

            // Update invoice with calculated totals
            setInvoice(prev => ({
                ...prev,
                totals: result.totals as Invoice['totals'],
                final_amount: result.totals.final_amount || 0
            }));
            setCurrentStep(2);
        } catch (calcError) {
            toast.error('Calculation error. Please try again.');
        }
    }, [selectedCustomer, invoice, isOnline, setError, setInvoice]);

    const handleContinueFromStep2 = useCallback(async () => {
        const validationError = invoicePreviewValidationError(
            companyInfo as any,
            invoice,
            selectedCustomer,
        );
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            return;
        }
        try {
            const result = await calculateInvoicePreview(invoice, isOnline);

            // Update invoice with latest totals
            setInvoice(prev => ({
                ...prev,
                totals: result.totals as Invoice['totals'],
                final_amount: result.totals.final_amount || 0,
                items: result.items as unknown as Invoice['items']
            }));
            setCurrentStep(3);
        } catch (calcError) {
            toast.error('Calculation error. Please try again.');
        }
    }, [companyInfo, invoice, isOnline, selectedCustomer, setError, setInvoice]);

    const handleBackFromStep3 = useCallback((targetStep: number | React.MouseEvent = 2) => {
        // CRITICAL FIX: Handle if event object passed instead of number
        const stepNumber = typeof targetStep === 'number' ? targetStep : 2;

        console.log('🔙 [NAVIGATION] Going back from step 3 to step:', stepNumber);

        try {
            setCurrentStep(stepNumber);
            console.log('✅ [NAVIGATION] setCurrentStep completed');
        } catch (navError) {
            console.error('❌ [NAVIGATION ERROR] during setCurrentStep:', navError);
            alert('Error navigating back: ' + (navError as Error).message);
        }
    }, []);

    const handleBackFromStep2 = useCallback(() => {
        setCurrentStep(1);
    }, []);

    // Conditional render must stay after all hooks
    if (!open) return null;

    return (
        <div ref={invoiceFormRef} className="h-full bg-white">
            {/* Step 1: Invoice Items */}
            {currentStep === 1 && (
                <InvoiceItemsStep
                    invoice={invoice as any}
                    setInvoice={setInvoice as any}
                    selectedCustomer={selectedCustomer as any}
                    setSelectedCustomer={setSelectedCustomer as any}
                    employees={employees as any}
                    selectedMR={selectedMR as any}
                    setSelectedMR={setSelectedMR as any}
                    isLoading={isLoading}
                    error={error}
                    setError={setError}
                    onClose={onClose as any}
                    onReset={resetInvoice}
                    onContinue={handleContinueFromStep1}
                    productSearchRef={productSearchRef as any}
                    itemsTableRef={itemsTableRef as any}
                    handleCustomerSelect={handleCustomerSelect as any}
                    handleAddItem={handleAddItem as any}
                    handleUpdateItem={handleUpdateItem as any}
                    handleRemoveItem={handleRemoveItem}
                    handleImport={handleImport as any}
                    handleApplyBillDiscount={handleApplyBillDiscount as any}
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
                    selectedProductForLastDeal={selectedProductForLastDeal as any}
                    showItemProfitModal={showItemProfitModal}
                    setShowItemProfitModal={setShowItemProfitModal}
                />
            )}

            {/* Step 2: Invoice Details */}
            {currentStep === 2 && (
                <InvoiceDetailsStep
                    invoice={invoice as any}
                    setInvoice={setInvoice as any}
                    selectedCustomer={selectedCustomer as any}
                    onClose={onClose as any}
                    onContinue={handleContinueFromStep2}
                    onBack={handleBackFromStep2}
                    deliveryTypeRef={deliveryTypeRef as any}
                    transportRef={transportRef as any}
                    vehicleRef={vehicleRef as any}
                    deliveryChargesRef={deliveryChargesRef as any}
                />
            )}

            {/* Step 3: Invoice Preview */}
            {currentStep === 3 && (
                <InvoicePreviewStep
                    invoice={invoice as any}
                    setInvoice={setInvoice as any}
                    selectedCustomer={selectedCustomer as any}
                    companyInfo={companyInfo}
                    onClose={onClose as any}
                    onBack={handleBackFromStep3}
                    onSave={handleSaveInvoice}
                    onPrint={handlePrint}
                    onThermalPrint={handleThermalPrint}
                    saving={saving}
                />
            )}

            {/* Success Modal - Stays open for print/whatsapp actions */}
            {showSuccessModal && createdInvoiceData && (
                <GenericSuccessModal
                    isOpen={showSuccessModal}
                    onClose={() => {
                        setShowSuccessModal(false);
                        if (onClose) onClose();
                    }}
                    title="Invoice Created!"
                    documentNumber={createdInvoiceData.invoiceNumber}
                    documentId={createdInvoiceData.invoiceId}
                    documentType="invoice"
                    customerName={createdInvoiceData.customerName}
                    totalAmount={createdInvoiceData.totalAmount}
                    autoCloseDelay={null}  // No auto-close - user must manually close
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
                    onWhatsApp={() => handleWhatsAppShare(
                        createdInvoiceData.customerPhone,
                        createdInvoiceData.customerName,
                        createdInvoiceData.totalAmount
                    )}
                    onDownload={() => handlePDFDownload(createdInvoiceData)}
                    showCopy={true}
                    showQuickActions={true}
                />
            )}

            {/* Off-screen Invoice Preview for PDF Generation - must be in DOM but not visible */}
            {createdInvoiceData && showSuccessModal && (
                <div className="absolute left-[-9999px] top-0 w-[210mm]">
                    <InvoicePreview
                        invoice={{
                            ...invoice,
                            invoice_number: createdInvoiceData.invoiceNumber,
                            customer_name: createdInvoiceData.customerName,
                            customer_details: {
                                ...selectedCustomer,
                                address: invoice.billing_address,
                                gst_number: selectedCustomer?.gst_number,
                                phone: createdInvoiceData.customerPhone || selectedCustomer?.phone
                            },
                            shipping_address: invoice.shipping_address,
                            is_same_address: invoice.billing_address === invoice.shipping_address,
                            items: createdInvoiceData.items || invoice.items,
                            net_amount: createdInvoiceData.totalAmount || invoice.final_amount,
                            payment_status: invoice.payment_status || 'Paid',
                            totals: invoice.totals || undefined
                        } as any}
                        companyInfo={companyInfo as any}
                        showAddresses={true}
                        isPrintMode={true}
                        onInvoiceUpdate={() => { }}
                    />
                </div>
            )}
        </div>
    );
};

export default InvoiceFlow;
