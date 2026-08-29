import React from 'react';
import { addExactDecimals } from '../../../../utils/exactDecimal';
import { FileText, AlertCircle } from 'lucide-react';

// Global Components
import { ModuleHeader, DocumentFooter, PrintUtility } from '../../../global';
import InvoicePreview from '../ui/InvoicePreviewEnterprise';

// Shared Types
import { Customer, Invoice, CompanyInfo } from '../types/invoiceTypes';
import { canonicalInvoicePreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';
import { invoicePreviewValidationError } from '../utils/canonicalInvoiceCommand';

// ==================== COMPONENT PROPS ====================

interface InvoicePreviewStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
    companyInfo: CompanyInfo | null;
    onClose: () => void;
    onBack: (step?: number) => void;
    onSave: () => void;
    onSaveDraft: () => void;
    onOpenDrafts: () => void;
    draftSaving: boolean;
    onPrint: () => void;
    onThermalPrint: () => void;
    saving: boolean;
}

const InvoicePreviewStep: React.FC<InvoicePreviewStepProps> = ({
    invoice,
    setInvoice,
    selectedCustomer,
    companyInfo,
    onClose,
    onBack,
    onSave,
    onSaveDraft,
    onOpenDrafts,
    draftSaving,
    onPrint,
    onThermalPrint,
    saving
}) => {
    // Use the same fail-closed boundary as final submission. The calculation
    // preview alone cannot authorize Generate when canonical company, party,
    // address, allocation, or item context is incomplete.
    const previewUnavailableReason = invoicePreviewValidationError(
        companyInfo,
        invoice as any,
        selectedCustomer as any,
    ) || canonicalInvoicePreviewUnavailableReason(invoice);
    if (previewUnavailableReason) {
        return (
            <div className="flex h-full flex-col bg-gray-50">
                <ModuleHeader title="Invoice Preview" documentNumber={invoice.invoice_number}
                    status="unavailable" icon={FileText} iconColor="text-amber-600" onClose={onClose}
                    showSaveDraft onSaveDraft={onSaveDraft} saveDraftDisabled={draftSaving}
                    additionalActions={[
                        { label: 'Open drafts', onClick: onOpenDrafts, disabled: draftSaving, variant: 'secondary' },
                        { label: '← Back to Details', onClick: () => onBack(2), variant: 'secondary' },
                    ]} />
                <div className="m-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900" role="alert">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div><h2 className="font-semibold">Authoritative preview unavailable</h2>
                            <p className="mt-1 text-sm">{previewUnavailableReason} Return to the items step and refresh the live calculation.</p></div>
                    </div>
                </div>
            </div>
        );
    }
    const totals = invoice.totals!;
    return (
        <div className="h-full bg-gray-50">
            <div className="h-full flex flex-col">

                {/* Header - Using Global ModuleHeader */}
                <ModuleHeader
                    title="Invoice Preview"
                    documentNumber={invoice.invoice_number}
                    status="preview"
                    icon={FileText}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    showSaveDraft
                    onSaveDraft={onSaveDraft}
                    saveDraftDisabled={draftSaving}
                    additionalActions={[
                        {
                            label: 'Open drafts',
                            onClick: onOpenDrafts,
                            disabled: draftSaving,
                            variant: 'secondary'
                        },
                        {
                            label: "← Back to Details",
                            onClick: () => onBack(2),
                            variant: "secondary"
                        }
                    ]}
                />

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="max-w-6xl mx-auto px-6 py-6">

                        {/* Invoice Preview */}
                        <PrintUtility
                            documentData={{
                                documentNumber: invoice.invoice_number,
                                date: invoice.invoice_date,
                                customer: {
                                    name: selectedCustomer?.customer_name || selectedCustomer?.name,
                                    phone: selectedCustomer?.phone || selectedCustomer?.primary_phone,
                                    gst_number: selectedCustomer?.gst_number,
                                    drug_license_number: selectedCustomer?.drug_license_number
                                },
                                items: (invoice.items || []).map(item => ({
                                    product_name: item.product_name || item.name,
                                    hsn_code: item.hsn_code,
                                    batch_number: item.batch_number || item.batch_number,
                                    quantity: item.quantity,
                                    free_quantity: item.free_quantity,
                                    unit_price: item.unit_price,
                                    discount_percent: item.discount_percent,
                                    gst_percent: item.gst_percent,
                                    total: item.total || item.line_total
                                })) as any,
                                totals: {
                                    subtotal: totals.taxable_amount,
                                    discount: addExactDecimals(
                                        [totals.discount_amount, totals.scheme_discount],
                                        'Invoice preview discounts',
                                        { scale: 2, maximumWholeDigits: 20 },
                                    ),
                                    tax_amount: totals.total_tax_amount,
                                    cgst_amount: totals.cgst_amount,
                                    sgst_amount: totals.sgst_amount,
                                    igst_amount: totals.igst_amount,
                                    total_amount: totals.final_amount,
                                },
                                addresses: {
                                    billing: invoice.billing_address,
                                    shipping: invoice.shipping_address
                                },
                                notes: invoice.notes
                            }}
                            documentType="invoice"
                            companyInfo={companyInfo as any}
                            showPrintOptions={false}
                        >
                            <InvoicePreview
                                invoice={{
                                    ...invoice,
                                    customer_details: {
                                        ...selectedCustomer,
                                        address: invoice.billing_address,
                                        gst_number: selectedCustomer?.gst_number,
                                        phone: selectedCustomer?.phone || selectedCustomer?.mobile
                                    },
                                    shipping_address: invoice.shipping_address,
                                    billing_address: invoice.billing_address,
                                    is_same_address: invoice.billing_address === invoice.shipping_address
                                }}
                                showAddresses={true}
                                isPrintMode={false}
                                companyInfo={companyInfo as any}
                                onInvoiceUpdate={() => { }}
                            />
                        </PrintUtility>

                        {/* Notes Section */}
                        <div className="w-full mt-6 mb-4">
                            <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3 flex items-center">
                                <FileText className="w-4 h-4 mr-2" />
                                INVOICE NOTES
                            </h3>
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <textarea
                                    value={invoice.notes || ''}
                                    onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    rows={2}
                                    placeholder="Add any additional notes or comments for this invoice..."
                                />
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-xs text-gray-500">These notes will appear on the printed invoice</span>
                                    <span className="text-xs text-gray-400">{(invoice.notes || '').length}/500</span>
                                </div>
                            </div>
                        </div>

                        {selectedCustomer?.gst_number && (
                            <div className="mt-4 w-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                GST e-invoice applicability, IRN, acknowledgment, QR code, and e-way-bill evidence are not part of this canonical sales-invoice command. No compliance status is inferred in the browser.
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer - Print options disabled in preview (only available after generation via success modal) */}
                <DocumentFooter
                    totalItems={(invoice.items || []).length}
                    totalAmount={totals.final_amount}
                    subtotalAmount={totals.taxable_amount}
                    taxAmount={totals.total_tax_amount}
                    discountAmount={addExactDecimals(
                        [totals.discount_amount, totals.scheme_discount],
                        'Invoice total discounts',
                        { scale: 2, maximumWholeDigits: 20, allowNegative: true },
                    )}
                    grandTotal={totals.final_amount}
                    onCancel={() => onBack(2)}
                    onSave={onSave}
                    onGenerate={onSave}
                    isSaving={saving}
                    cancelLabel="← Back to Details"
                    saveLabel="Generate Invoice"
                    generateLabel="Generate Invoice"
                    showPrintOptions={false}  // Print only available after generation
                    showSaveOption={true}
                    showActionButtons={true}
                    documentType="invoice"
                />

            </div>
        </div>
    );
};

export default InvoicePreviewStep;
