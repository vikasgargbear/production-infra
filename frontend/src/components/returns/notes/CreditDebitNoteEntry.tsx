/**
 * CreditDebitNoteEntry - Unified Credit/Debit Note Component
 * Merged from CreditDebitNoteSimple + CreditNoteFlow + DebitNoteFlow
 * 
 * Features:
 * - Unified credit/debit via noteType prop
 * - Review page step (Form → Review → Save)
 * - Settlement types dropdown
 * - Invoice filtering (date, status, amount)
 * - Keyboard shortcuts (Ctrl+N, Ctrl+F, Ctrl+S, Esc)
 * - GST toggle
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    FileText, CreditCard, Receipt, Save, AlertCircle, CheckCircle,
    ArrowLeft, Search, Calendar, Printer, X, Edit2, Trash2, Filter,
    RefreshCw, Loader2, Users, Calculator, Plus
} from 'lucide-react';
import {
    Button, Card, DatePicker, CustomerSearch, Select,
    InvoiceSelector, useToast, ModuleHeader, ProceedToReviewComponent
} from '../global';
import { theme, classes } from '../../config/theme.config';
import { notesApi } from '../../services/api';
import InvoiceApiService from '../../services/invoiceApiService';
import { Customer } from '../sales/invoice/types/invoiceTypes';

// ==================== TYPE DEFINITIONS ====================

interface CreditDebitNoteEntryProps {
    noteType?: 'credit' | 'debit';
    onClose?: () => void;
    open?: boolean;
}

interface NoteItem {
    id: string;
    product_id?: string;
    product_name: string;
    hsn_code?: string;
    batch_number?: string;
    quantity: number;
    original_quantity?: number;
    max_quantity?: number;
    rate: number;
    discount_percent: number;
    tax_percent?: number;
    total_amount: number;
    selected?: boolean;
}

interface NoteData {
    note_number: string;
    note_date: string;
    customer_id: string;
    customer_name?: string;
    invoice_id?: string;
    invoice_number?: string;
    invoice_date?: string;
    reason: string;
    settlement_type: string;
    items: NoteItem[];
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    internal_notes: string;
    customer_remarks: string;
    status?: string;
}

interface InvoiceFilters {
    dateFrom: string;
    dateTo: string;
    status: string;
    minAmount: string;
    maxAmount: string;
}

// ==================== COMPONENT ====================

const CreditDebitNoteEntry: React.FC<CreditDebitNoteEntryProps> = ({
    noteType = 'credit',
    onClose,
    open = true
}) => {
    const toast = useToast();

    // State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);
    const [noteItems, setNoteItems] = useState<NoteItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Flow state
    const [showReviewPage, setShowReviewPage] = useState(false);
    const [includeGST, setIncludeGST] = useState(true);
    const [createWithoutInvoice, setCreateWithoutInvoice] = useState(false);

    // Filters and pagination
    const [invoicePage, setInvoicePage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [invoiceFilters, setInvoiceFilters] = useState<InvoiceFilters>({
        dateFrom: '',
        dateTo: '',
        status: 'all',
        minAmount: '',
        maxAmount: ''
    });
    const [invoicePagination, setInvoicePagination] = useState<any>(null);

    // Options
    const [reasonOptions, setReasonOptions] = useState<any[]>([]);
    const [settlementOptions, setSettlementOptions] = useState<any[]>([]);

    // Note data
    const [noteData, setNoteData] = useState<NoteData>({
        note_number: '',
        note_date: new Date().toISOString().split('T')[0],
        customer_id: '',
        customer_name: '',
        reason: '',
        settlement_type: '',
        items: [],
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        internal_notes: '',
        customer_remarks: ''
    });

    // Generate note number on mount
    useEffect(() => {
        generateNoteNumber();
        loadInitialData();
    }, [noteType]);

    const generateNoteNumber = () => {
        const prefix = noteType === 'credit' ? 'CN' : 'DN';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        setNoteData(prev => ({
            ...prev,
            note_number: `${prefix}-${timestamp}${random}`
        }));
    };

    const loadInitialData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const [reasonsResponse, settlementsResponse] = await Promise.all([
                noteType === 'credit'
                    ? notesApi.getCreditNoteReasons?.()
                    : notesApi.getDebitNoteReasons?.(),
                notesApi.getSettlementTypes?.()
            ]);

            if (reasonsResponse?.data) {
                setReasonOptions(reasonsResponse.data);
            }
            if (settlementsResponse?.data) {
                setSettlementOptions(settlementsResponse.data);
            }
        } catch (err) {
            // Fallback options
            setReasonOptions(getDefaultReasons());
            setSettlementOptions(getDefaultSettlements());
        } finally {
            setIsLoading(false);
        }
    };

    const getDefaultReasons = () => {
        const creditReasons = [
            { value: 'return_goods', label: 'Goods Returned' },
            { value: 'discount', label: 'Additional Discount Given' },
            { value: 'price_adjustment', label: 'Price Adjustment/Correction' },
            { value: 'quality_issue', label: 'Quality Issue/Defective Goods' },
            { value: 'overcharge', label: 'Overcharge/Billing Error' },
            { value: 'shortage', label: 'Short Supply/Quantity Issue' },
            { value: 'expired_goods', label: 'Expired/Damaged Goods' },
            { value: 'wrong_dispatch', label: 'Wrong Product Dispatched' },
            { value: 'goodwill', label: 'Goodwill Gesture' },
            { value: 'other', label: 'Other Reason' }
        ];

        const debitReasons = [
            { value: 'undercharge', label: 'Undercharge/Billing Error' },
            { value: 'additional_charge', label: 'Additional Charges' },
            { value: 'interest', label: 'Interest/Late Payment' },
            { value: 'service_charge', label: 'Service Charges' },
            { value: 'penalty', label: 'Penalty/Fine' },
            { value: 'other', label: 'Other Reason' }
        ];

        return noteType === 'credit' ? creditReasons : debitReasons;
    };

    const getDefaultSettlements = () => [
        { value: 'adjust_future', label: 'Adjust in Future Invoices' },
        { value: 'account_credit', label: 'Account Credit Balance' },
        { value: 'cash_refund', label: 'Cash Refund' },
        { value: 'bank_transfer', label: 'Bank Transfer/NEFT/RTGS' },
        { value: 'upi_refund', label: 'UPI/Digital Payment Refund' },
        { value: 'replacement_goods', label: 'Replacement Goods' },
        { value: 'no_settlement', label: 'No Settlement Required' }
    ];

    // Load customer invoices
    useEffect(() => {
        const fetchCustomerInvoices = async () => {
            // Support both strict Customer type and legacy/backend shapes
            const customerId = selectedCustomer?.customer_id || (selectedCustomer as any)?.id || (selectedCustomer as any)?.party_id;
            if (!customerId) {
                setCustomerInvoices([]);
                return;
            }

            setLoadingInvoices(true);
            try {
                const data: any = await notesApi.getLinkedInvoices(customerId);
                let allInvoices = data.invoices?.map((invoice: any) => ({
                    id: invoice.invoice_id || invoice.id,
                    invoice_number: invoice.invoice_number,
                    invoice_date: invoice.invoice_date,
                    total_amount: parseFloat(invoice.final_amount || invoice.grand_total || invoice.total_amount) || 0,
                    outstanding_amount: parseFloat(invoice.credit_amount ||
                        (parseFloat(invoice.final_amount || invoice.grand_total || invoice.total_amount || 0) -
                            parseFloat(invoice.paid_amount || 0))),
                    status: invoice.payment_status || 'pending',
                    items: invoice.items || []
                })) || [];

                // Apply filters
                allInvoices = applyInvoiceFilters(allInvoices);

                // Paginate
                const limit = 5;
                const totalPages = Math.ceil(allInvoices.length / limit);
                const offset = (invoicePage - 1) * limit;

                setCustomerInvoices(allInvoices.slice(offset, offset + limit));
                setInvoicePagination({
                    page: invoicePage,
                    total_pages: totalPages,
                    has_next: invoicePage < totalPages,
                    has_prev: invoicePage > 1
                });
            } catch (err) {
                setError('Failed to load customer invoices');
            } finally {
                setLoadingInvoices(false);
            }
        };

        fetchCustomerInvoices();
    }, [selectedCustomer, invoicePage, invoiceFilters]);

    const applyInvoiceFilters = (invoices: any[]) => {
        let filtered = [...invoices];

        if (invoiceFilters.dateFrom) {
            filtered = filtered.filter(inv => new Date(inv.invoice_date) >= new Date(invoiceFilters.dateFrom));
        }
        if (invoiceFilters.dateTo) {
            filtered = filtered.filter(inv => new Date(inv.invoice_date) <= new Date(invoiceFilters.dateTo));
        }
        if (invoiceFilters.status !== 'all') {
            filtered = filtered.filter(inv => inv.status.toLowerCase() === invoiceFilters.status.toLowerCase());
        }
        if (invoiceFilters.minAmount) {
            filtered = filtered.filter(inv => inv.total_amount >= parseFloat(invoiceFilters.minAmount));
        }
        if (invoiceFilters.maxAmount) {
            filtered = filtered.filter(inv => inv.total_amount <= parseFloat(invoiceFilters.maxAmount));
        }

        return filtered;
    };

    const handleCustomerSelect = (customer: Customer | null) => {
        setSelectedCustomer(customer);
        setNoteData(prev => ({
            ...prev,
            customer_id: String(selectedCustomer ? selectedCustomer.customer_id : ''),
            customer_name: selectedCustomer ? selectedCustomer.customer_name : '',
        }));
        // Reset invoice selection
        setNoteItems([]);
    };

    const handleInvoiceSelect = async (invoice: any) => {
        setNoteData(prev => ({
            ...prev,
            invoice_id: String(invoice.id),
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date
        }));

        setLoadingItems(true);
        try {
            const fullInvoice: any = await InvoiceApiService.getInvoiceById(invoice.id);

            if (fullInvoice.success && fullInvoice.data?.items) {
                const transformedItems = fullInvoice.data.items.map((item: any, index: number) => ({
                    id: String(item.invoice_item_id || item.id || `item-${index}`),
                    product_id: item.product_id,
                    product_name: item.product_name || item.item_name,
                    hsn_code: item.hsn_code || '',
                    quantity: parseFloat(item.quantity || 0),
                    original_quantity: parseFloat(item.quantity || 0),
                    max_quantity: parseFloat(item.quantity || 0),
                    rate: parseFloat(item.unit_price || item.rate || 0),
                    discount_percent: parseFloat(item.discount_percent || 0),
                    tax_percent: parseFloat(item.gst_percent || 18),
                    total_amount: parseFloat(item.line_total || item.total_amount || 0),
                    selected: true
                }));
                setNoteItems(transformedItems);
            }
        } catch (err) {
            setError('Failed to load invoice items');
        } finally {
            setLoadingItems(false);
        }
    };

    const handleFieldChange = (field: string, value: any) => {
        setNoteData(prev => ({ ...prev, [field]: value }));
    };

    const updateNoteItem = (itemId: string, field: string, value: any) => {
        setNoteItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                if (field === 'quantity') {
                    updated.total_amount = updated.quantity * updated.rate * (1 - updated.discount_percent / 100);
                }
                return updated;
            }
            return item;
        }));
    };

    const toggleItemSelection = (index: number) => {
        setNoteItems(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const calculateTotals = useCallback(() => {
        const selectedItems = noteItems.filter(item => item.selected !== false);
        const subtotal = selectedItems.reduce((sum, item) => sum + item.total_amount, 0);
        const avgTaxPercent = selectedItems.length > 0
            ? selectedItems.reduce((sum, item) => sum + (item.tax_percent || 18), 0) / selectedItems.length
            : 18;
        const taxAmount = includeGST ? subtotal * (avgTaxPercent / 100) : 0;
        const grandTotal = subtotal + taxAmount;

        return { subtotal, taxAmount, grandTotal };
    }, [noteItems, includeGST]);

    const canShowReview = () => {
        const basicValid = selectedCustomer && noteData.reason && noteData.settlement_type;
        const itemsValid = noteItems.filter(item => item.selected !== false).length > 0;
        return basicValid && (createWithoutInvoice || itemsValid);
    };

    const handleSave = async () => {
        if (!canShowReview()) {
            setError('Please complete all required fields');
            return;
        }

        if (!selectedCustomer) {
            toast.error('Please select a customer');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const totals = calculateTotals();
            const selectedItems = noteItems.filter(item => item.selected !== false);

            const payload = {
                party_id: selectedCustomer.customer_id || (selectedCustomer as any).id || (selectedCustomer as any).party_id,
                note_date: noteData.note_date,
                amount: totals.grandTotal,
                reason: noteData.reason,
                settlement_type: noteData.settlement_type,
                linked_invoice_id: noteData.invoice_id,
                notes: noteData.customer_remarks,
                internal_notes: noteData.internal_notes,
                include_gst: includeGST,
                tax_amount: totals.taxAmount,
                items: selectedItems.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    hsn_code: item.hsn_code,
                    quantity: item.quantity,
                    rate: item.rate,
                    discount_percent: item.discount_percent,
                    total_amount: item.total_amount
                }))
            };

            if (noteType === 'credit') {
                await notesApi.createCreditNote(payload);
                toast.success('Credit note created successfully');
            } else {
                await notesApi.createDebitNote(payload);
                toast.success('Debit note created successfully');
            }

            onClose?.();
        } catch (err) {
            setError(`Error saving ${noteType} note: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setSelectedCustomer(null);
        setNoteItems([]);
        setShowReviewPage(false);
        setCreateWithoutInvoice(false);
        generateNoteNumber();
        setNoteData(prev => ({
            ...prev,
            note_date: new Date().toISOString().split('T')[0],
            customer_id: '',
            customer_name: '',
            invoice_id: undefined,
            invoice_number: undefined,
            reason: '',
            settlement_type: '',
            internal_notes: '',
            customer_remarks: ''
        }));
    };

    const totals = calculateTotals();
    const isCredit = noteType === 'credit';
    const themeColor = isCredit ? 'green' : 'orange';

    if (!open) return null;

    if (isLoading) {
        return (
            <div className={`h-full bg-${themeColor}-50 flex items-center justify-center`}>
                <div className="text-center">
                    <Loader2 className={`h-8 w-8 animate-spin text-${themeColor}-600 mx-auto mb-4`} />
                    <p className="text-gray-600">Loading {noteType} note form...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-gray-50">
            <div className="h-full flex flex-col">
                {/* Header */}
                <ModuleHeader
                    title={`${isCredit ? 'Credit' : 'Debit'} Note`}
                    documentNumber={noteData.note_number}
                    status={showReviewPage ? 'review' : 'draft'}
                    icon={isCredit ? CreditCard : Receipt}
                    iconColor={`text-${themeColor}-600`}
                    onClose={onClose}
                    historyType={`${noteType}_note`}
                    showSaveDraft={false}
                    onSaveDraft={() => { }}
                    additionalActions={[
                        {
                            label: refreshing ? 'Refreshing...' : 'Refresh',
                            onClick: () => { setRefreshing(true); loadInitialData().finally(() => setRefreshing(false)); },
                            variant: "default",
                            icon: RefreshCw,
                            disabled: refreshing
                        }
                    ] as any}
                />

                {/* Keyboard Shortcuts */}
                <div className={`bg-${themeColor}-50 px-4 py-2 text-xs text-${themeColor}-700 border-b border-${themeColor}-200`}>
                    Keyboard: <strong>Ctrl+N</strong> Add Customer | <strong>Ctrl+F</strong> Search Invoice | <strong>Ctrl+S</strong> Save | <strong>Esc</strong> Close
                </div>

                {/* Content */}
                <div className={`flex-1 overflow-y-auto bg-${themeColor}-50`}>
                    <div className="px-6 py-6 max-w-6xl mx-auto">
                        {/* Error Display */}
                        {error && (
                            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                                        <span className="text-red-800">{error}</span>
                                    </div>
                                    <button onClick={() => setError(null)} className="text-sm text-red-600 hover:text-red-800 underline">
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        )}

                        {!showReviewPage ? (
                            /* Form Page */
                            <div className="space-y-6">
                                {/* Customer Selection */}
                                <Card className="p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                        <Users className="w-5 h-5 mr-2" />
                                        Customer Information
                                    </h3>
                                    <CustomerSearch
                                        value={selectedCustomer}
                                        onChange={handleCustomerSelect}
                                    />
                                </Card>

                                {/* Note Details */}
                                <Card className="p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                        <FileText className="w-5 h-5 mr-2" />
                                        Note Details
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Note Number</label>
                                            <input
                                                type="text"
                                                value={noteData.note_number}
                                                readOnly
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Note Date</label>
                                            <DatePicker
                                                value={noteData.note_date ? new Date(noteData.note_date) : new Date()}
                                                onChange={(date: any) => handleFieldChange('note_date', date instanceof Date ? date.toISOString().split('T')[0] : date)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                                            <Select
                                                options={reasonOptions}
                                                value={noteData.reason}
                                                onChange={(val: any) => handleFieldChange('reason', val)}
                                                placeholder="Select reason..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Type *</label>
                                            <Select
                                                options={settlementOptions}
                                                value={noteData.settlement_type}
                                                onChange={(val: any) => handleFieldChange('settlement_type', val)}
                                                placeholder="Select settlement..."
                                            />
                                        </div>
                                        <div className="flex items-center mt-6">
                                            <input
                                                type="checkbox"
                                                id="includeGST"
                                                checked={!!includeGST}
                                                onChange={(e) => setIncludeGST(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            <label htmlFor="includeGST" className="ml-2 text-sm text-gray-700">Include GST</label>
                                        </div>
                                    </div>
                                </Card>

                                {/* Invoice Selection */}
                                {selectedCustomer && !createWithoutInvoice && (
                                    <Card className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                                <FileText className="w-5 h-5 mr-2" />
                                                Select Invoice
                                            </h3>
                                            <button
                                                onClick={() => setShowFilters(!showFilters)}
                                                className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                                            >
                                                <Filter className="w-4 h-4 mr-1" />
                                                Filters
                                            </button>
                                        </div>

                                        {loadingInvoices ? (
                                            <div className="text-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                                                <p className="text-sm text-gray-500 mt-2">Loading invoices...</p>
                                            </div>
                                        ) : customerInvoices.length > 0 ? (
                                            <div className="space-y-2">
                                                {customerInvoices.map((invoice) => (
                                                    <div
                                                        key={invoice.id}
                                                        onClick={() => handleInvoiceSelect(invoice)}
                                                        className={`p-4 border rounded-lg cursor-pointer transition-all ${noteData.invoice_id === invoice.id
                                                            ? `border-${themeColor}-500 bg-${themeColor}-50`
                                                            : 'border-gray-200 hover:border-gray-300'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <span className="font-medium">{invoice.invoice_number}</span>
                                                                <span className="text-sm text-gray-500 ml-2">{invoice.invoice_date}</span>
                                                            </div>
                                                            <span className="font-semibold">₹{invoice.total_amount.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-center text-gray-500 py-6">No invoices found for this customer</p>
                                        )}
                                    </Card>
                                )}

                                {/* Items */}
                                {noteItems.length > 0 && (
                                    <Card className="p-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                            <Calculator className="w-5 h-5 mr-2" />
                                            Items ({noteItems.filter(i => i.selected !== false).length} selected)
                                        </h3>
                                        <div className="space-y-2">
                                            {noteItems.map((item, index) => (
                                                <div
                                                    key={item.id}
                                                    className={`p-3 border rounded-lg ${item.selected !== false ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={item.selected !== false}
                                                                onChange={() => toggleItemSelection(index)}
                                                                className="w-4 h-4 mr-3"
                                                            />
                                                            <div>
                                                                <span className="font-medium">{item.product_name}</span>
                                                                {item.hsn_code && <span className="text-xs text-gray-500 ml-2">HSN: {item.hsn_code}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div>
                                                                <label className="text-xs text-gray-500">Qty</label>
                                                                <input
                                                                    type="number"
                                                                    value={item.quantity}
                                                                    onChange={(e) => updateNoteItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                                    max={item.max_quantity}
                                                                    className="w-20 px-2 py-1 border rounded text-right"
                                                                    disabled={item.selected === false}
                                                                />
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-semibold">₹{item.total_amount.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {/* Totals Summary */}
                                {noteItems.length > 0 && (
                                    <Card className={`p-6 bg-${themeColor}-50 border-${themeColor}-200`}>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="font-medium text-gray-700">Subtotal</h4>
                                                <p className="text-xl font-bold">₹{totals.subtotal.toLocaleString()}</p>
                                            </div>
                                            {includeGST && (
                                                <div>
                                                    <h4 className="font-medium text-gray-700">Tax</h4>
                                                    <p className="text-xl font-bold">₹{totals.taxAmount.toLocaleString()}</p>
                                                </div>
                                            )}
                                            <div>
                                                <h4 className="font-medium text-gray-700">Total</h4>
                                                <p className={`text-2xl font-bold text-${themeColor}-600`}>₹{totals.grandTotal.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            /* Review Page */
                            <Card className="p-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Review {isCredit ? 'Credit' : 'Debit'} Note</h3>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-sm text-gray-500">Note Number</span>
                                            <p className="font-medium">{noteData.note_number}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Date</span>
                                            <p className="font-medium">{noteData.note_date}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Customer</span>
                                            <p className="font-medium">{selectedCustomer?.name || selectedCustomer?.customer_name}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Linked Invoice</span>
                                            <p className="font-medium">{noteData.invoice_number || 'None'}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Reason</span>
                                            <p className="font-medium">{reasonOptions.find(r => r.value === noteData.reason)?.label || noteData.reason}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Settlement</span>
                                            <p className="font-medium">{settlementOptions.find(s => s.value === noteData.settlement_type)?.label || noteData.settlement_type}</p>
                                        </div>
                                    </div>

                                    <div className="border-t pt-4 mt-4">
                                        <h4 className="font-medium mb-2">Items ({noteItems.filter(i => i.selected !== false).length})</h4>
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="text-left p-2">Product</th>
                                                    <th className="text-right p-2">Qty</th>
                                                    <th className="text-right p-2">Rate</th>
                                                    <th className="text-right p-2">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {noteItems.filter(i => i.selected !== false).map(item => (
                                                    <tr key={item.id} className="border-b">
                                                        <td className="p-2">{item.product_name}</td>
                                                        <td className="text-right p-2">{item.quantity}</td>
                                                        <td className="text-right p-2">₹{item.rate}</td>
                                                        <td className="text-right p-2">₹{item.total_amount.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className={`border-t pt-4 mt-4 bg-${themeColor}-50 p-4 rounded-lg`}>
                                        <div className="flex justify-between text-lg font-bold">
                                            <span>Grand Total</span>
                                            <span className={`text-${themeColor}-600`}>₹{totals.grandTotal.toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                                        <textarea
                                            value={noteData.customer_remarks}
                                            onChange={(e) => handleFieldChange('customer_remarks', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            rows={3}
                                            placeholder="Any additional remarks..."
                                        />
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <ProceedToReviewComponent
                    currentStep={showReviewPage ? 2 : 1}
                    canProceed={!!(showReviewPage ? canShowReview() : canShowReview())}
                    onBack={showReviewPage ? () => setShowReviewPage(false) : undefined}
                    onProceed={showReviewPage ? handleSave : () => setShowReviewPage(true)}
                    onReset={handleReset}
                    totalItems={noteItems.filter(i => i.selected !== false).length}
                    totalAmount={totals.grandTotal}
                    proceedText={showReviewPage ? `Create ${isCredit ? 'Credit' : 'Debit'} Note` : 'Continue to Review'}
                    saving={saving}
                />
            </div>
        </div>
    );
};

export default CreditDebitNoteEntry;
