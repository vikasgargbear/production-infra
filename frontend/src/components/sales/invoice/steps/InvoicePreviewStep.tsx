import React from 'react';
import { FileText, AlertCircle, FileInput } from 'lucide-react';

// Global Components
import { ModuleHeader, DocumentFooter, PrintUtility } from '../../../global';
import InvoicePreview from '../ui/InvoicePreviewEnterprise';

// Shared Types
import { Customer, Invoice, InvoiceItem, InvoiceTotals, CompanyInfo } from '../types/invoiceTypes';

// ==================== COMPONENT PROPS ====================

interface InvoicePreviewStepProps {
    invoice: Invoice;
    setInvoice: React.Dispatch<React.SetStateAction<Invoice>>;
    selectedCustomer: Customer | null;
    companyInfo: CompanyInfo | null;
    onClose: () => void;
    onBack: (step?: number) => void;
    onSave: () => void;
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
    onPrint,
    onThermalPrint,
    saving
}) => {
    return (
        <div className="h-full bg-blue-50">
            <div className="h-full flex flex-col">

                {/* Header - Using Global ModuleHeader */}
                <ModuleHeader
                    title="Invoice Preview"
                    documentNumber={invoice.invoice_number}
                    status="preview"
                    icon={FileText}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    additionalActions={[
                        {
                            label: "← Back to Details",
                            onClick: () => onBack(2), // FIXED: Pass step number, not event
                            icon: undefined,
                            variant: "default",
                            className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
                        }
                    ]}
                />

                {/* Content - White background for seamless preview, matching step 1/2 width */}
                <div className="flex-1 overflow-y-auto bg-white">
                    <div className="max-w-6xl mx-auto px-8 py-6">

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
                                    free_quantity: item.free_quantity || 0,
                                    unit_price: item.unit_price || item.selling_price,
                                    discount_percent: item.discount_percent || 0,
                                    gst_percent: item.gst_percent || item.tax_percent || 0,
                                    total: item.total || item.line_total
                                })),
                                totals: {
                                    subtotal: invoice.subtotal_amount || invoice.gross_amount,
                                    discount: invoice.discount_amount || 0,
                                    tax_amount: invoice.tax_amount || invoice.total_tax,
                                    cgst_amount: invoice.cgst_amount || ((invoice.tax_amount || 0) / 2),
                                    sgst_amount: invoice.sgst_amount || ((invoice.tax_amount || 0) / 2),
                                    igst_amount: invoice.igst_amount || 0,
                                    total_amount: invoice.final_amount || invoice.totals?.final_amount,
                                    paid_amount: invoice.paid_amount || 0,
                                    balance_amount: invoice.balance_amount || invoice.final_amount
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
                        <div className="w-full mt-4 mb-4">
                            <div className="border border-gray-300 rounded-lg overflow-hidden">
                                <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
                                    <h3 className="text-xs font-bold text-gray-800 uppercase">Invoice Notes</h3>
                                </div>
                                <div className="p-3">
                                    <textarea
                                        value={invoice.notes || ''}
                                        onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                        rows={2}
                                        placeholder="Add any additional notes or comments for this invoice..."
                                    />
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-xs text-gray-500">These notes will appear on the printed invoice</span>
                                        <span className="text-xs text-gray-400">{(invoice.notes || '').length}/500</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* E-invoice Section */}
                        {selectedCustomer?.gst_number && parseFloat(String(invoice.final_amount || 0)) >= 500 && (
                            <div className="w-full mt-4 mb-4">
                                <div className="bg-orange-50 rounded-lg border border-orange-200 p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center">
                                            <FileInput className="w-4 h-4 text-orange-600 mr-2" />
                                            <label className="text-xs font-medium text-orange-800">E-Invoice Generation</label>
                                        </div>
                                        <label className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={invoice.e_invoice_applicable || false}
                                                onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_applicable: e.target.checked }))}
                                                className="mr-2 w-3.5 h-3.5 text-orange-600 rounded focus:ring-orange-500"
                                            />
                                            <span className="text-xs text-orange-700">Generate E-Invoice</span>
                                        </label>
                                    </div>

                                    {invoice.e_invoice_applicable && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-blue-700 mb-1">
                                                    E-Invoice Number
                                                </label>
                                                <input
                                                    type="text"
                                                    value={invoice.e_invoice_number || ''}
                                                    onChange={(e) => setInvoice(prev => ({ ...prev, e_invoice_number: e.target.value }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                    placeholder="Auto-generated after submission"
                                                    readOnly
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-blue-700 mb-1">
                                                    IRN (Invoice Reference Number)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={invoice.irn || ''}
                                                    onChange={(e) => setInvoice(prev => ({ ...prev, irn: e.target.value }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                    placeholder="Generated by GST Portal"
                                                    readOnly
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-blue-700 mb-1">
                                                    Acknowledgment Number
                                                </label>
                                                <input
                                                    type="text"
                                                    value={invoice.ack_no || ''}
                                                    onChange={(e) => setInvoice(prev => ({ ...prev, ack_no: e.target.value }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                    placeholder="From GST Portal"
                                                    readOnly
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-blue-700 mb-1">
                                                    Acknowledgment Date
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={invoice.ack_date || ''}
                                                    onChange={(e) => setInvoice(prev => ({ ...prev, ack_date: e.target.value }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                    readOnly
                                                />
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-medium text-blue-700 mb-1">
                                                    QR Code Data
                                                </label>
                                                <textarea
                                                    value={invoice.qr_code || ''}
                                                    onChange={(e) => setInvoice(prev => ({ ...prev, qr_code: e.target.value }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                                                    rows={2}
                                                    placeholder="QR code data from GST Portal"
                                                    readOnly
                                                />
                                            </div>

                                            {/* E-way Bill Section */}
                                            <div className="md:col-span-2 border-t pt-2 mt-2">
                                                <div className="text-xs font-medium text-orange-700 mb-2">E-way Bill Details (Auto-generated for distance &gt; 50km)</div>
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                                            E-way Bill Number
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={invoice.eway_bill_number || ''}
                                                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_number: e.target.value }))}
                                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                            placeholder="Auto-generated"
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                                            E-way Bill Date
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={invoice.eway_bill_date || ''}
                                                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_date: e.target.value }))}
                                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                                            Valid Upto
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={invoice.eway_bill_valid_upto || ''}
                                                            onChange={(e) => setInvoice(prev => ({ ...prev, eway_bill_valid_upto: e.target.value }))}
                                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                            readOnly
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-2 text-xs text-orange-600">
                                        <AlertCircle className="w-3 h-3 inline mr-1" />
                                        E-Invoice is mandatory for B2B transactions above ₹500 with registered businesses
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer - Print options disabled in preview (only available after generation via success modal) */}
                <DocumentFooter
                    totalItems={(invoice.items || []).length}
                    totalAmount={parseFloat(String(invoice.totals?.final_amount || invoice.final_amount)) || 0}
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
