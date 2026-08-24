import { useState } from 'react';
import { invoicesApi } from '../../../../services/api';
import { toast } from 'react-toastify';
import type { Invoice } from '../types/invoiceTypes';
import type { CanonicalInvoiceDetail } from '../../../../services/api/modules/sales/canonicalSalesDocuments.types';
import type { InvoiceData as PrintableInvoiceData } from '../../../../utils/invoicePdfGenerator';

const printableInvoice = (detail: CanonicalInvoiceDetail): PrintableInvoiceData => ({
    invoice_number: detail.invoice_number,
    invoice_date: detail.invoice_date,
    customer_name: detail.customer_name,
    customer_phone: detail.customer_phone ?? undefined,
    customer_gst_number: detail.customer_gst_number ?? undefined,
    billing_address: detail.billing_address,
    shipping_address: detail.shipping_address,
    items: detail.items.map(item => ({
        product_name: item.product_name,
        batch_number: item.batch_number ?? undefined,
        hsn_code: item.hsn_code,
        sale_unit: item.unit,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        gst_percent: Number(item.gst_percent),
        line_total: Number(item.line_total),
    })),
    subtotal_amount: Number(detail.taxable_amount),
    cgst_amount: detail.cgst_amount,
    sgst_amount: detail.sgst_amount,
    igst_amount: detail.igst_amount,
    final_amount: detail.total_amount,
    total_amount: detail.total_amount,
});


interface UseInvoiceActionsReturn {
    selectedIds: Set<number>;
    exporting: boolean;
    exportSuccess: boolean;
    toggleSelect: (id: number) => void;
    toggleSelectAll: (invoices: Invoice[]) => void;
    clearSelection: () => void;
    handleExportAll: (invoices: Invoice[]) => Promise<void>;
    exportSelectedPDF: (invoices: Invoice[]) => Promise<void>;
    printSelected: (invoices: Invoice[]) => void;
    whatsappSelected: (invoices: Invoice[]) => void;
    handlePrintInvoice: (invoice: Invoice) => Promise<void>;
    handleDownloadInvoice: (invoice: Invoice) => Promise<void>;
}

export function useInvoiceActions(): UseInvoiceActionsReturn {
    const [selectedIds, setSelectedIds] = useState(new Set<number>());
    const [exporting, setExporting] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = (invoices: Invoice[]) => {
        const allSelected = invoices.length > 0 && invoices.every(inv => inv.id && selectedIds.has(inv.id));

        if (allSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                invoices.forEach(invoice => invoice.id && next.delete(invoice.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                invoices.forEach(invoice => invoice.id && next.add(invoice.id));
                return next;
            });
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set<number>());
    };

    const formatDate = (value: string) => {
        if (!value) return 'N/A';
        return new Date(value).toLocaleDateString('en-IN');
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const getStatusText = (status: string | undefined) => {
        if (!status) return 'Unknown';
        const statusMap: Record<string, string> = {
            'draft': 'Draft', 'sent': 'Sent', 'paid': 'Paid',
            'posted': 'Posted', 'overdue': 'Overdue',
            'cancelled': 'Cancelled', 'pending': 'Pending',
            'partial': 'Partial'
        };
        return statusMap[status.toLowerCase()] || status;
    };

    const handleExportAll = async (invoices: Invoice[]) => {
        setExporting(true);
        setExportSuccess(false);

        try {
            const csvData = generateCSVData(invoices);
            downloadCSV(csvData, `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);
            setExportSuccess(true);
            setTimeout(() => setExportSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to export invoices:', error);
        } finally {
            setExporting(false);
        }
    };

    const generateCSVData = (data: Invoice[]) => {
        const headers = ['Invoice Number', 'Customer Name', 'Date', 'Amount', 'Status', 'Payment Status'];
        const rows = data.map(invoice => [
            invoice.invoice_number,
            invoice.customer_name || '',
            invoice.invoice_date || '',
            invoice.final_amount || 0,
            invoice.invoice_status || '',
            invoice.payment_status || ''
        ]);
        return [headers, ...rows];
    };

    const downloadCSV = (data: any[][], filename: string) => {
        const csvContent = data.map(row =>
            row.map(field =>
                typeof field === 'string' && field.includes(',') ? `"${field}"` : field
            ).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const exportSelectedPDF = async (invoices: Invoice[]) => {
        const itemsToExport = invoices.filter(invoice => invoice.id && selectedIds.has(invoice.id));
        if (itemsToExport.length === 0) return;

        if (itemsToExport.length === 1) {
            await handleDownloadInvoice(itemsToExport[0]);
            return;
        }

        const headers = ['Invoice #', 'Date', 'Customer', 'Amount', 'Status'];
        const csvContent = [
            headers.join(','),
            ...itemsToExport.map(invoice => [
                invoice.invoice_number,
                formatDate(invoice.invoice_date || ''),
                `"${invoice.customer_name || 'N/A'}"`,
                invoice.final_amount || 0,
                getStatusText(invoice.payment_status)
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoices-${new Date().getTime()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const printSelected = (invoices: Invoice[]) => {
        const itemsToPrint = invoices.filter(invoice => invoice.id && selectedIds.has(invoice.id));
        const html = `<!DOCTYPE html><html><head><title>Print Invoices</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Invoices Report</h2>
      <table><thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(invoice => `<tr><td>${invoice.invoice_number}</td><td>${formatDate(invoice.invoice_date || '')}</td><td>${invoice.customer_name || 'N/A'}</td><td>${formatCurrency(invoice.final_amount || 0)}</td><td>${getStatusText(invoice.payment_status)}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    };

    const whatsappSelected = (invoices: Invoice[]) => {
        const itemsToSend = invoices.filter(invoice => invoice.id && selectedIds.has(invoice.id));
        if (itemsToSend.length === 0) return;

        const message = encodeURIComponent(
            `Invoices Report:\n\n${itemsToSend.map(invoice =>
                `${invoice.invoice_number} - ${formatDate(invoice.invoice_date || '')} - ${invoice.customer_name} - ${formatCurrency(invoice.final_amount || 0)} (${getStatusText(invoice.payment_status)})`
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    const handlePrintInvoice = async (invoice: Invoice) => {
        try {
            const response = await invoicesApi.getById((invoice.invoice_id || invoice.id) as string | number);
            const responseData = response?.data || response;

            if (responseData) {
                const { printInvoice } = await import('../../../../utils/invoicePdfGenerator');
                printInvoice(printableInvoice(responseData));
            } else {
                toast.error('Failed to load invoice details. Please try again.');
            }
        } catch (error) {
            toast.error('Failed to print invoice. Please try again.');
        }
    };

    const handleDownloadInvoice = async (invoice: Invoice) => {
        try {
            const response = await invoicesApi.getById((invoice.invoice_id || invoice.id) as string | number);
            const responseData = response?.data || response;

            if (responseData) {
                const { downloadInvoicePDF } = await import('../../../../utils/invoicePdfGenerator');
                downloadInvoicePDF(printableInvoice(responseData));
            } else {
                toast.error('Failed to load invoice details. Please try again.');
            }
        } catch (error) {
            toast.error('Failed to download invoice. Please try again.');
        }
    };

    return {
        selectedIds,
        exporting,
        exportSuccess,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        handleExportAll,
        exportSelectedPDF,
        printSelected,
        whatsappSelected,
        handlePrintInvoice,
        handleDownloadInvoice,
    };
}
