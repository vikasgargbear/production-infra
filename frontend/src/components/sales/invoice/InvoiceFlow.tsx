import React, { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useCompany } from '../../../contexts/CompanyContext';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { calculateInvoicePreview } from '../../../services/calculations/invoiceCalculationService';
import InvoiceItemsStepBase from './steps/InvoiceItemsStep';
import InvoiceDetailsStepBase from './steps/InvoiceDetailsStep';
import InvoicePreviewStepBase from './steps/InvoicePreviewStep';
import {
    useInvoiceLogic,
    PrefilledData,
} from './hooks/useInvoiceLogic';
import { GenericSuccessModal } from '../../global';
import { InvoiceDraftPicker } from '../../global';
import {
    invoiceBatchAllocationValidationError,
    buildCanonicalInvoicePreparePayload,
    invoicePreviewValidationError,
} from './utils/canonicalInvoiceCommand';
import CanonicalSalesCommandReview from '../CanonicalSalesCommandReview';
import { formatExactCurrency } from '../../../utils/exactDecimal';
import { applyCanonicalInvoicePreview } from './utils/invoicePreviewState';
import {
    buildSalesInvoiceDraftPayload,
    requireSalesInvoiceDraftState,
    type SalesInvoiceDraftPayload,
} from './utils/invoiceDraftState';
import {
    invoiceDraftsApi,
    invoiceDraftIdFromLocation,
    invoiceDraftMutationError,
    type InvoiceDraft,
} from '../../../services/api/modules/invoiceDrafts.api';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { useAuth } from '../../../contexts/AuthContext';
import { clientUuid } from '../../../utils/clientUuid';
import { createInitialInvoice, type Invoice } from './hooks/useInvoiceLogic';
import type { Customer } from '../../../types/models/customer';
import {
    downloadCanonicalInvoiceById,
    printCanonicalInvoiceById,
} from './utils/canonicalInvoiceOutput';

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
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(1); // 1: Items, 2: Details, 3: Preview
    const invoiceFormRef = useRef<HTMLDivElement>(null); // For Enter-as-Tab scoping
    const [activeDraft, setActiveDraft] = useState<InvoiceDraft<SalesInvoiceDraftPayload> | null>(null);
    const [drafts, setDrafts] = useState<Array<InvoiceDraft<SalesInvoiceDraftPayload>>>([]);
    const [draftPickerOpen, setDraftPickerOpen] = useState(false);
    const [draftsLoading, setDraftsLoading] = useState(false);
    const [draftBusyId, setDraftBusyId] = useState<string | null>(null);
    const deepLinkedDraftRef = useRef<string | null>(null);
    const prepareDraftHandlerRef = useRef<((payload: Record<string, unknown>) => Promise<CanonicalCommandPreview>) | null>(null);
    const preparePersistedDraft = useCallback((payload: Record<string, unknown>) => {
        if (!prepareDraftHandlerRef.current) {
            throw new Error('Invoice draft preparation is not ready. Please try again.');
        }
        return prepareDraftHandlerRef.current(payload);
    }, []);

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
        documentPolicy,
        businessDate,
        saving,
        showSuccessModal,
        setShowSuccessModal,
        createdInvoiceData,
        preparedPreview,
        reviewOpen,

        // Modal States
        showCustomerModal,
        setShowCustomerModal,
        showProductModal,
        setShowProductModal,
        showImportModal,
        setShowImportModal,

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
        resetInvoice,
        handleSaveInvoice,
        confirmPreparedInvoice,
        closeInvoiceReview,

    } = useInvoiceLogic(onClose, prefilledData, preparePersistedDraft);

    const draftTitle = useCallback(() => {
        const customerName = selectedCustomer?.customer_name || 'Unassigned customer';
        return `${customerName} · ${invoice.invoice_date || 'date pending'}`;
    }, [invoice.invoice_date, selectedCustomer]);

    const saveDraftRevision = useCallback(async (
        commandPayload: Record<string, unknown> | null,
        options: { notify?: boolean } = {},
    ): Promise<InvoiceDraft<SalesInvoiceDraftPayload>> => {
        const branchId = String(
            invoice.items.find(item => item.branch_id)?.branch_id
            || activeDraft?.branch_id
            || user?.branch_id
            || '',
        );
        if (!branchId) throw new Error('Select a branch or stocked item before saving this invoice draft.');
        const payload = buildSalesInvoiceDraftPayload(
            invoice,
            selectedCustomer,
            currentStep,
            commandPayload,
        );
        try {
            const response = activeDraft
                ? await invoiceDraftsApi.update(activeDraft.draft_id, {
                    expected_row_version: activeDraft.row_version,
                    title: draftTitle(),
                    payload,
                })
                : await invoiceDraftsApi.create({
                    document_kind: 'sales_invoice',
                    branch_id: branchId,
                    title: draftTitle(),
                    payload,
                    created_via: 'web',
                });
            const saved = response.data;
            setActiveDraft(saved);
            setDrafts(current => [saved, ...current.filter(item => item.draft_id !== saved.draft_id)]);
            if (options.notify !== false) toast.success('Invoice draft saved.');
            return saved;
        } catch (error) {
            throw invoiceDraftMutationError(error);
        }
    }, [activeDraft, currentStep, draftTitle, invoice, selectedCustomer, user?.branch_id]);

    const handleSaveDraft = useCallback(async () => {
        if (draftBusyId) return;
        setDraftBusyId(activeDraft?.draft_id || 'new');
        try {
            let commandPayload: Record<string, unknown> | null = null;
            try {
                if (selectedCustomer) {
                    commandPayload = buildCanonicalInvoicePreparePayload(
                        invoice,
                        selectedCustomer,
                        `erp-web-invoice-draft:${clientUuid()}`,
                        documentPolicy,
                    );
                }
            } catch {
                // Incomplete drafts remain resumable. /prepare rejects null fail-closed.
            }
            await saveDraftRevision(commandPayload);
        } catch (error: any) {
            const message = error?.response?.data?.detail?.message
                || error?.response?.data?.detail
                || error?.message
                || 'Invoice draft could not be saved.';
            setError(String(message));
            toast.error(String(message));
        } finally {
            setDraftBusyId(null);
        }
    }, [activeDraft?.draft_id, documentPolicy, draftBusyId, invoice, saveDraftRevision, selectedCustomer, setError]);

    const handlePrepareDraft = useCallback(async (commandPayload: Record<string, unknown>) => {
        const saved = await saveDraftRevision(commandPayload, { notify: false });
        const prepared = await invoiceDraftsApi.prepare(saved.draft_id, saved.row_version);
        try {
            const refreshed = await invoiceDraftsApi.get<SalesInvoiceDraftPayload>(saved.draft_id);
            setActiveDraft(refreshed.data);
        } catch {
            // The immutable preview is already authoritative; a later list refresh restores metadata.
        }
        return prepared.data;
    }, [saveDraftRevision]);

    prepareDraftHandlerRef.current = handlePrepareDraft;

    const loadDrafts = useCallback(async () => {
        setDraftsLoading(true);
        try {
            const response = await invoiceDraftsApi.list<SalesInvoiceDraftPayload>('sales_invoice', {
                limit: 50,
            });
            setDrafts(response.data.drafts.filter(draft => draft.status === 'open' || draft.status === 'prepared'));
        } catch (error: any) {
            toast.error(error?.response?.data?.detail?.message || error?.message || 'Unable to load invoice drafts.');
        } finally {
            setDraftsLoading(false);
        }
    }, []);

    const openDraftPicker = useCallback(() => {
        setDraftPickerOpen(true);
        void loadDrafts();
    }, [loadDrafts]);

    const openDraft = useCallback(async (summary: InvoiceDraft) => {
        setDraftBusyId(summary.draft_id);
        try {
            const response = await invoiceDraftsApi.get<SalesInvoiceDraftPayload>(summary.draft_id);
            if (response.data.document_kind !== 'sales_invoice' || response.data.status === 'abandoned') {
                throw new Error('This sales invoice draft is no longer editable.');
            }
            const state = requireSalesInvoiceDraftState(response.data.payload);
            setInvoice({ ...createInitialInvoice(businessDate), ...state.invoice } as Invoice);
            setSelectedCustomer(state.selected_customer as Customer | null);
            setCurrentStep(state.current_step);
            setActiveDraft(response.data);
            setDraftPickerOpen(false);
            setError(null);
            toast.success(response.data.created_via === 'mcp' ? 'ChatGPT draft opened.' : 'Invoice draft opened.');
        } catch (error: any) {
            toast.error(error?.response?.data?.detail?.message || error?.message || 'Unable to open invoice draft.');
        } finally {
            setDraftBusyId(null);
        }
    }, [businessDate, setError, setInvoice, setSelectedCustomer]);

    const abandonDraft = useCallback(async (draft: InvoiceDraft) => {
        setDraftBusyId(draft.draft_id);
        try {
            await invoiceDraftsApi.abandon(draft.draft_id, draft.row_version);
            setDrafts(current => current.filter(item => item.draft_id !== draft.draft_id));
            if (activeDraft?.draft_id === draft.draft_id) {
                setActiveDraft(null);
                resetInvoice();
                setCurrentStep(1);
            }
            toast.success('Invoice draft discarded.');
        } catch (error: any) {
            toast.error(error?.response?.data?.detail?.message || error?.message || 'Unable to discard invoice draft.');
        } finally {
            setDraftBusyId(null);
        }
    }, [activeDraft?.draft_id, resetInvoice]);

    useEffect(() => {
        const draftId = invoiceDraftIdFromLocation(window.location);
        if (draftId && deepLinkedDraftRef.current !== draftId) {
            deepLinkedDraftRef.current = draftId;
            void openDraft({ draft_id: draftId } as InvoiceDraft);
        }
    }, [openDraft]);

    useEffect(() => {
        if (!createdInvoiceData || !activeDraft || activeDraft.status === 'posted') return;
        void invoiceDraftsApi.get<SalesInvoiceDraftPayload>(activeDraft.draft_id).then(response => {
            setActiveDraft(response.data);
            setDrafts(current => current.filter(item => item.draft_id !== response.data.draft_id));
        }).catch(() => {
            // Posting is already server-confirmed; the next draft refresh derives final status.
        });
    }, [activeDraft, createdInvoiceData]);

    // Enable Enter-as-Tab navigation (Marg ERP style)
    useEnterAsTab({
        containerRef: invoiceFormRef,
        enabled: true,
        excludeSelectors: ['textarea', 'button', 'input[type="checkbox"]', '[data-no-enter-tab]']
    });

    // ESC key handling for modal hierarchy
    const anyModalOpen = showCustomerModal || showProductModal || showImportModal || reviewOpen;

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
    const handleDraftPrint = useCallback(() => {
        window.print();
    }, []);

    const handleCanonicalPrint = useCallback(async (invoiceId: string | number) => {
        try {
            await printCanonicalInvoiceById(invoiceId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Canonical invoice print is unavailable.');
        }
    }, []);

    const handleThermalPrint = useCallback(() => {
        // Trigger thermal print using PrintUtility if available
        const printEvent = new CustomEvent('thermalPrint', { detail: { size: '80mm' } });
        document.dispatchEvent(printEvent);
    }, []);

    const handlePDFDownload = useCallback(async (invoiceId: string | number) => {
        try {
            await downloadCanonicalInvoiceById(invoiceId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Canonical invoice PDF is unavailable.');
        }
    }, []);

    const handleWhatsAppShare = useCallback((phone: string | undefined, customerName?: string, amount?: string) => {
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
        if (!amount || !customerName || !companyInfo?.name) return;
        const formattedAmount = formatExactCurrency(amount, 'Posted invoice total');

        const whatsappMessage = `Dear ${customerName},

Your invoice ${invoice.invoice_number} dated ${invoiceDate} for ${formattedAmount} is ready.

Thank you for your business!
${companyInfo.name}`;

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
            setInvoice(prev => applyCanonicalInvoicePreview(
                prev,
                result,
                { replaceItems: false },
            ));
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
            setInvoice(prev => applyCanonicalInvoicePreview(
                prev,
                result,
                { replaceItems: true },
            ));
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
            toast.error('Unable to return to invoice items: ' + (navError as Error).message);
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
                    maximumInvoiceDate={businessDate}
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
                    onSaveDraft={handleSaveDraft}
                    onOpenDrafts={openDraftPicker}
                    draftSaving={Boolean(draftBusyId)}
                    onContinue={handleContinueFromStep1}
                    productSearchRef={productSearchRef as any}
                    itemsTableRef={itemsTableRef as any}
                    handleCustomerSelect={handleCustomerSelect as any}
                    handleAddItem={handleAddItem as any}
                    handleUpdateItem={handleUpdateItem as any}
                    handleRemoveItem={handleRemoveItem}
                    handleImport={handleImport as any}
                    showCustomerModal={showCustomerModal}
                    setShowCustomerModal={setShowCustomerModal}
                    showProductModal={showProductModal}
                    setShowProductModal={setShowProductModal}
                    showImportModal={showImportModal}
                    setShowImportModal={setShowImportModal}
                />
            )}

            {/* Step 2: Invoice Details */}
            {currentStep === 2 && (
                <InvoiceDetailsStep
                    invoice={invoice as any}
                    setInvoice={setInvoice as any}
                    selectedCustomer={selectedCustomer as any}
                    documentPolicy={documentPolicy}
                    onClose={onClose as any}
                    onContinue={handleContinueFromStep2}
                    onBack={handleBackFromStep2}
                    onSaveDraft={handleSaveDraft}
                    onOpenDrafts={openDraftPicker}
                    draftSaving={Boolean(draftBusyId)}
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
                    onSaveDraft={handleSaveDraft}
                    onOpenDrafts={openDraftPicker}
                    draftSaving={Boolean(draftBusyId)}
                    onPrint={handleDraftPrint}
                    onThermalPrint={handleThermalPrint}
                    saving={saving}
                />
            )}

            <CanonicalSalesCommandReview
                title="Review exact sales invoice"
                preview={preparedPreview}
                open={reviewOpen}
                posting={saving}
                onBack={closeInvoiceReview}
                onPost={confirmPreparedInvoice}
            />

            <InvoiceDraftPicker
                open={draftPickerOpen}
                title="Saved sales invoice drafts"
                drafts={drafts}
                loading={draftsLoading}
                busyDraftId={draftBusyId}
                onClose={() => setDraftPickerOpen(false)}
                onOpen={openDraft}
                onAbandon={abandonDraft}
            />

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
                    onPrint={() => { void handleCanonicalPrint(createdInvoiceData.invoiceId); }}
                    onThermalPrint={handleThermalPrint}
                    onWhatsApp={() => handleWhatsAppShare(
                        createdInvoiceData.customerPhone,
                        createdInvoiceData.customerName,
                        createdInvoiceData.totalAmount
                    )}
                    onDownload={() => { void handlePDFDownload(createdInvoiceData.invoiceId); }}
                    showCopy={true}
                    showQuickActions={true}
                />
            )}

        </div>
    );
};

export default InvoiceFlow;
