/**
 * useGSTExport - Shared hook for GST report export
 * 
 * Provides Excel and PDF export functionality
 */

import { useCallback } from 'react';
import type { GSTR1Data, ExportFormat } from '../types';
import { formatCurrency } from '../utils';

interface ExportOptions {
    filename?: string;
    reportType?: string;
    dateRange?: { from: string; to: string };
}

interface UseGSTExportResult {
    exportToExcel: (data: any, options?: ExportOptions) => void;
    exportToCSV: (data: any, options?: ExportOptions) => void;
    exportToPDF: (data: any, options?: ExportOptions) => void;
}

export function useGSTExport(): UseGSTExportResult {

    const exportToCSV = useCallback((data: any, options: ExportOptions = {}) => {
        const { filename = 'gst_report', reportType = 'gst' } = options;

        let csvContent = '';

        // Handle different data structures
        if (data?.b2b) {
            // GSTR1/GSTR2B format
            csvContent = 'GSTIN,Party Name,Invoices,Taxable Value,CGST,SGST,IGST\n';
            data.b2b.forEach((row: any) => {
                csvContent += `${row.gst_number},"${row.name}",${row.invoices},${row.taxableValue},${row.cgst},${row.sgst},${row.igst}\n`;
            });
        } else if (Array.isArray(data)) {
            // Generic array
            if (data.length > 0) {
                const headers = Object.keys(data[0]).join(',');
                csvContent = headers + '\n';
                data.forEach((row: any) => {
                    csvContent += Object.values(row).map(v =>
                        typeof v === 'string' && v.includes(',') ? `"${v}"` : v
                    ).join(',') + '\n';
                });
            }
        }

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, []);

    const exportToExcel = useCallback((data: any, options: ExportOptions = {}) => {
        // For now, use CSV export (Excel can open CSV)
        // In production, use a library like xlsx
        exportToCSV(data, { ...options, filename: options.filename || 'gst_report_excel' });
    }, [exportToCSV]);

    const exportToPDF = useCallback((data: any, options: ExportOptions = {}) => {
        const { filename = 'gst_report', reportType = 'GST Report' } = options;

        // Create printable content
        let content = `
      <html>
      <head>
        <title>${reportType}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
          .summary { margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; }
        </style>
      </head>
      <body>
        <h1>${reportType}</h1>
        <p>Generated: ${new Date().toLocaleDateString()}</p>
    `;

        if (data?.summary) {
            content += `
        <div class="summary">
          <h3>Summary</h3>
          <p><strong>Total Invoices:</strong> ${data.summary.totalInvoices || 0}</p>
          <p><strong>Taxable Value:</strong> ${formatCurrency(data.summary.totalTaxableValue || 0)}</p>
          <p><strong>Total Tax:</strong> ${formatCurrency(data.summary.totalTax || 0)}</p>
        </div>
      `;
        }

        if (data?.b2b && data.b2b.length > 0) {
            content += `
        <table>
          <thead>
            <tr>
              <th>GSTIN</th>
              <th>Party Name</th>
              <th>Invoices</th>
              <th>Taxable Value</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>IGST</th>
            </tr>
          </thead>
          <tbody>
      `;
            data.b2b.forEach((row: any) => {
                content += `
          <tr>
            <td>${row.gst_number}</td>
            <td>${row.name}</td>
            <td>${row.invoices}</td>
            <td>${formatCurrency(row.taxableValue)}</td>
            <td>${formatCurrency(row.cgst)}</td>
            <td>${formatCurrency(row.sgst)}</td>
            <td>${formatCurrency(row.igst)}</td>
          </tr>
        `;
            });
            content += '</tbody></table>';
        }

        content += '</body></html>';

        // Open print dialog
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(content);
            printWindow.document.close();
            printWindow.print();
        }
    }, []);

    return {
        exportToExcel,
        exportToCSV,
        exportToPDF
    };
}

export default useGSTExport;
