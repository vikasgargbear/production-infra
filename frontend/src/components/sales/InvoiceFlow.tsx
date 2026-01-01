import React, { useState, useRef, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useCompany } from '../../contexts/CompanyContext';
import useEscapeKey from '../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../hooks/useEnterAsTab';
import html2pdf from 'html2pdf.js';
import EnterpriseCalculator from '../../services/enterpriseCalculator';
import InvoiceItemsStepBase from './invoice/steps/InvoiceItemsStep';
import InvoiceDetailsStepBase from './invoice/steps/InvoiceDetailsStep';
import InvoicePreviewStepBase from './invoice/steps/InvoicePreviewStep';
import { useInvoiceLogic, Invoice, CreatedInvoiceData } from './invoice/hooks/useInvoiceLogic';
import { GenericSuccessModal } from '../global';
import InvoicePreview from './invoice/ui/InvoicePreviewEnterprise';

// ==================== TYPE DEFINITIONS ====================

interface InvoiceFlowProps {
    open?: boolean;  // For modal/panel usage
    onClose?: () => void;
    prefilledData?: {
        customer?: unknown;
        items?: unknown[];
    } | null;
}

interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    [key: string]: unknown;
}

// Memoize expensive step components to prevent unnecessary re-renders
const InvoiceItemsStep = React.memo(InvoiceItemsStepBase);
const InvoiceDetailsStep = React.memo(InvoiceDetailsStepBase);
const InvoicePreviewStep = React.memo(InvoicePreviewStepBase);

// ==================== MAIN COMPONENT ====================

const InvoiceFlow: React.FC<InvoiceFlowProps> = ({ open = true, onClose, prefilledData = null }) => {


    const { companyInfo } = useCompany() as { companyInfo: CompanyInfo };
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
    } = useInvoiceLogic(onClose, prefilledData as any);

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
        console.log('Thermal print not implemented yet');
        toast.info('Thermal print functionality coming soon');
    }, []);

    const handlePDFDownload = useCallback((invoiceData: CreatedInvoiceData) => {
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

    const handleWhatsAppShare = useCallback((phone: string | undefined) => {
        if (!phone) {
            toast.error('No phone number available for WhatsApp');
            return;
        }
        const whatsappMessage = `Your invoice is ready! Invoice #${invoice.invoice_number}`;
        const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, '_blank');
    }, [invoice.invoice_number]);

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

        console.log('🔄 [STEP 1→2] Forcing calculation before continuing...');
        console.log('🔄 [STEP 1→2] Current items:', invoice.items.map(i => ({ name: i.product_name, qty: i.quantity })));

        // CRITICAL FIX: Force synchronous calculation BEFORE moving to next step
        try {
            const result = await new Promise<{ totals: { gross_amount: number; final_amount: number }; items: unknown[] }>((resolve, reject) => {
                EnterpriseCalculator.calculateDebounced(invoice, (error: Error | null, calcResult: unknown) => {
                    if (error) reject(error);
                    else resolve(calcResult as { totals: { gross_amount: number; final_amount: number }; items: unknown[] });
                }, 0, 'invoice');
            });

            console.log('✅ [STEP 1→2] Calculation complete:', {
                gross_amount: result.totals.gross_amount,
                final_amount: result.totals.final_amount
            });

            // Update invoice with calculated totals
            setInvoice(prev => ({
                ...prev,
                totals: result.totals as Invoice['totals'],
                final_amount: result.totals.final_amount
            }));

            // Small delay to ensure state updates
            await new Promise(resolve => setTimeout(resolve, 100));

            setCurrentStep(2);
        } catch (calcError) {
            console.error('❌ [STEP 1→2] Calculation failed:', calcError);
            toast.error('Calculation error. Please try again.');
        }
    }, [selectedCustomer, invoice, setInvoice]);

    const handleContinueFromStep2 = useCallback(async () => {
        console.log('🔄 [STEP 2→3] Forcing calculation before preview...');

        try {
            const result = await new Promise<{ totals: { gross_amount: number; final_amount: number }; items: Invoice['items'] }>((resolve, reject) => {
                EnterpriseCalculator.calculateDebounced(invoice, (error: Error | null, calcResult: unknown) => {
                    if (error) reject(error);
                    else resolve(calcResult as { totals: { gross_amount: number; final_amount: number }; items: Invoice['items'] });
                }, 0, 'invoice');
            });

            console.log('✅ [STEP 2→3] Calculation complete:', {
                gross_amount: result.totals.gross_amount,
                final_amount: result.totals.final_amount
            });

            // Update invoice with latest totals
            setInvoice(prev => ({
                ...prev,
                totals: result.totals as Invoice['totals'],
                final_amount: result.totals.final_amount,
                items: result.items
            }));

            await new Promise(resolve => setTimeout(resolve, 100));

            setCurrentStep(3);
        } catch (calcError) {
            console.error('❌ [STEP 2→3] Calculation failed:', calcError);
            toast.error('Calculation error. Please try again.');
        }
    }, [invoice, setInvoice]);

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
                    message={message}
                    messageType={messageType as any}
                    clearMessage={clearMessage as any}
                    onClose={onClose as any}
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
                    sameAsShipping={sameAsShipping}
                    setSameAsShipping={setSameAsShipping}
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

            {/* Success Modal */}
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
