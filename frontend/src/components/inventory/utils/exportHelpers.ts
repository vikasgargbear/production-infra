/**
 * Export Helper Utilities
 * 
 * Shared export/print/share functionality for inventory reports.
 * Used across CurrentStock, BatchTracking, StockReport, etc.
 */

import jsPDF from 'jspdf';
import { BaseStockItem, BaseBatch, ExportFormat } from '../types/inventorySharedTypes';

/**
 * Export data to CSV format
 * 
 * @param data - Array of data to export
 * @param filename - Output filename
 * @param headers - Column headers
 * @param formatter - Function to format each row
 */
export const exportToCSV = <T>(
    data: T[],
    filename: string,
    headers: string[],
    formatter: (item: T) => (string | number)[]
): void => {
    try {
        // Convert to CSV format
        const csvContent = [
            headers.join(','),
            ...data.map(item => formatter(item).map(cell => `"${cell}"`).join(','))
        ].join('\\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('[Export] CSV export failed:', error);
        throw new Error('Failed to export CSV');
    }
};

/**
 * Export data to PDF format
 * 
 * @param data - Array of data to export
 * @param title - Report title
 * @param headers - Column headers
 * @param formatter - Function to format each row
 * @param filename - Output filename
 */
export const exportToPDF = <T>(
    data: T[],
    title: string,
    headers: string[],
    formatter: (item: T) => (string | number)[],
    filename: string
): void => {
    try {
        const doc = new jsPDF();

        // Title
        doc.setFontSize(16);
        doc.text(title, 20, 20);

        // Try to use autoTable if available
        try {
            const tableData = data.map(formatter);

            (doc as any).autoTable({
                head: [headers],
                body: tableData,
                startY: 30,
                styles: { fontSize: 10 },
                headStyles: { fillColor: [59, 130, 246] }
            });
        } catch {
            // Fallback to simple text
            let yPos = 40;
            doc.setFontSize(10);
            doc.text(headers.join(' | '), 20, yPos);
            yPos += 10;

            data.forEach(item => {
                const row = formatter(item).join(' | ');
                doc.text(String(row), 20, yPos);
                yPos += 8;

                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
            });
        }

        doc.save(filename);
    } catch (error) {
        console.error('[Export] PDF export failed:', error);
        throw new Error('Failed to export PDF');
    }
};

/**
 * Print data in browser
 * 
 * @param data - Array of data to print
 * @param title - Report title
 * @param headers - Table headers
 * @param formatter - Function to format each row as HTML
 */
export const printData = <T>(
    data: T[],
    title: string,
    headers: string[],
    formatter: (item: T) => string
): void => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Print ${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
    h2 { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <table>
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${data.map(formatter).join('')}
    </tbody>
  </table>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        throw new Error('Failed to open print window. Please check popup blocker.');
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
};

/**
 * Share data via WhatsApp
 * 
 * @param data - Array of data to share
 * @param title - Message title
 * @param formatter - Function to format each item as text
 */
export const shareViaWhatsApp = <T>(
    data: T[],
    title: string,
    formatter: (item: T) => string
): void => {
    if (data.length === 0) {
        throw new Error('No data to share');
    }

    const message = encodeURIComponent(
        `${title}:\\n\\n${data.map(formatter).join('\\n')}`
    );

    window.open(`https://wa.me/?text=${message}`, '_blank');
};

// ==================== Pre-built Formatters ====================

/**
 * Format stock item for CSV/PDF export
 */
export const formatStockItem = (item: BaseStockItem): (string | number)[] => {
    return [
        item.product_name || 'N/A',
        item.product_code || 'N/A',
        item.category || 'N/A',
        item.current_stock || 0,
        item.available_stock || 0,
        item.reserved_stock || 0,
        item.reorder_level || 0,
        item.unit || 'Units',
        item.mrp || 0,
        item.stock_value || 0,
        item.low_stock ? 'Low Stock' : item.out_of_stock ? 'Out of Stock' : 'In Stock'
    ];
};

/**
 * Format stock item for HTML table row
 */
export const formatStockItemHTML = (item: BaseStockItem): string => {
    return `<tr>
    <td>${item.product_name || 'N/A'}</td>
    <td>${item.product_code || 'N/A'}</td>
    <td>${item.current_stock || 0}</td>
    <td>${item.unit || 'Units'}</td>
    <td>${item.reorder_level || 0}</td>
    <td>${item.low_stock ? 'Low Stock' : item.out_of_stock ? 'Out of Stock' : 'In Stock'}</td>
  </tr>`;
};

/**
 * Format stock item for WhatsApp message
 */
export const formatStockItemWhatsApp = (item: BaseStockItem): string => {
    return `${item.product_name} - ${item.current_stock} ${item.unit || 'Units'} (${item.low_stock ? 'Low Stock' : item.out_of_stock ? 'Out of Stock' : 'In Stock'})`;
};

/**
 * Format batch for export
 */
export const formatBatch = (batch: BaseBatch): (string | number)[] => {
    return [
        batch.batch_number || 'N/A',
        batch.product_name || 'N/A',
        batch.quantity_available || 0,
        batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A',
        batch.mrp || 0,
        batch.cost_price || 0
    ];
};


/**
 * Format batch for HTML
 */
export const formatBatchHTML = (batch: BaseBatch): string => {
    return `<tr>
    <td>${batch.batch_number || 'N/A'}</td>
    <td>${batch.product_name || 'N/A'}</td>
    <td>${batch.quantity_available || 0}</td>
    <td>${batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}</td>
  </tr>`;
};
