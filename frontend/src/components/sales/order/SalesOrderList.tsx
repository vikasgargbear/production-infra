import React, { useState, useEffect, ReactElement } from 'react';
import {
    FileText, Truck, Search,
    Eye, Download, Printer, Calendar, ChevronDown, MessageCircle
} from 'lucide-react';
import { salesOrdersAPI } from '../../../services/api';
import ConvertToInvoiceButton from '../ui/ConvertToInvoiceButton';
import jsPDF from 'jspdf';

// ==================== TYPE DEFINITIONS ====================

interface SalesOrder {
    order_id: number | string;
    order_number?: string;
    order_date: string;
    customer_name?: string;
    total_amount?: number;
    final_amount?: number;
    order_status?: string;
    invoice_number?: string;
    invoice_created?: boolean;
    challan_created?: boolean;
}

interface InvoiceData {
    invoice_number: string;
    invoice_id?: number | string;
    [key: string]: unknown;
}

// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
    autoTable: (options: {
        head: string[][];
        body: string[][];
        startY: number;
        styles: { fontSize: number };
        headStyles: { fillColor: number[] };
    }) => void;
}

// ==================== MAIN COMPONENT ====================

const SalesOrderList: React.FC = () => {
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());

    useEffect(() => {
        loadOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterStatus]);

    const loadOrders = async (): Promise<void> => {
        setLoading(true);
        try {
            const params: { order_status?: string } = {};
            if (filterStatus !== 'all') {
                params.order_status = filterStatus;
            }

            const response = await salesOrdersAPI.getAll(params);
            setOrders(response.data || []);
        } catch {
            // Silent error handling
        } finally {
            setLoading(false);
        }
    };

    const handleInvoiceCreated = (orderId: number | string, invoiceData: InvoiceData): void => {
        setOrders(prev => prev.map(order =>
            order.order_id === orderId
                ? { ...order, invoice_number: invoiceData.invoice_number, invoice_created: true }
                : order
        ));
    };

    const getStatusBadge = (order: SalesOrder): ReactElement[] => {
        const badges: ReactElement[] = [];

        // Order status
        badges.push(
            <span key="status" className={`px-2 py-1 text-xs rounded ${order.order_status === 'approved' ? 'bg-green-100 text-green-800' :
                order.order_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                }`}>
                {order.order_status}
            </span>
        );

        // Invoice status
        if (order.invoice_number || order.invoice_created) {
            badges.push(
                <span key="invoice" className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                    <FileText className="w-3 h-3 inline mr-1" />
                    Invoiced
                </span>
            );
        }

        // Challan status
        if (order.challan_created) {
            badges.push(
                <span key="challan" className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
                    <Truck className="w-3 h-3 inline mr-1" />
                    Challan Created
                </span>
            );
        }

        return badges;
    };

    // Filter and multi-select functionality
    const filteredOrders = orders.filter(order => {
        const searchMatch = searchQuery === '' ||
            order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.order_number?.toLowerCase().includes(searchQuery.toLowerCase());

        const statusMatch = filterStatus === 'all' ||
            order.order_status?.toLowerCase() === filterStatus.toLowerCase();

        const orderDate = new Date(order.order_date);
        const now = new Date();
        let dateMatch = true;
        if (dateFilter !== 'all') {
            const daysAgo = parseInt(dateFilter);
            const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
            dateMatch = orderDate >= cutoffDate;
        }

        return searchMatch && statusMatch && dateMatch;
    });

    const isAllSelected = filteredOrders.length > 0 && filteredOrders.every(order => selectedIds.has(order.order_id));
    const selectedCount = Array.from(selectedIds).filter(id => filteredOrders.some(f => f.order_id === id)).length;

    const toggleSelect = (id: number | string): void => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = (): void => {
        if (isAllSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredOrders.forEach(order => next.delete(order.order_id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredOrders.forEach(order => next.add(order.order_id));
                return next;
            });
        }
    };

    const formatCurrency = (amount: number | undefined): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount || 0);
    };

    const formatDate = (date: string): string => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const exportSelectedPDF = (): void => {
        const itemsToExport = filteredOrders.filter(order => selectedIds.has(order.order_id));
        if (itemsToExport.length === 0) return;

        try {
            // Try to use jspdf-autotable if available
            const autoTable = require('jspdf-autotable');

            const doc = new jsPDF() as jsPDFWithAutoTable;
            doc.setFontSize(16);
            doc.text('Sales Orders Report', 20, 20);

            const tableData = itemsToExport.map(order => [
                order.order_number || `ORD-${order.order_id}`,
                formatDate(order.order_date),
                order.customer_name || 'N/A',
                formatCurrency(order.final_amount || order.total_amount),
                order.order_status || 'pending'
            ]);

            doc.autoTable({
                head: [['Order #', 'Date', 'Customer', 'Amount', 'Status']],
                body: tableData,
                startY: 30,
                styles: { fontSize: 10 },
                headStyles: { fillColor: [59, 130, 246] }
            });

            doc.save('sales-orders-export.pdf');
        } catch {
            // Fallback to simple PDF
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('Sales Orders Report', 20, 20);

            let yPos = 40;
            doc.setFontSize(10);
            doc.text('Order # | Date | Customer | Amount | Status', 20, yPos);
            yPos += 10;

            itemsToExport.forEach(order => {
                const rowText = `${order.order_number || `ORD-${order.order_id}`} | ${formatDate(order.order_date)} | ${order.customer_name || 'N/A'} | ${formatCurrency(order.final_amount || order.total_amount)} | ${order.order_status || 'pending'}`;
                doc.text(rowText, 20, yPos);
                yPos += 8;

                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
            });

            doc.save('sales-orders-export.pdf');
        }
    };

    const printSelected = (): void => {
        const itemsToPrint = filteredOrders.filter(order => selectedIds.has(order.order_id));
        const html = `<!DOCTYPE html><html><head><title>Print Sales Orders</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Sales Orders Report</h2>
      <table><thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(order => `<tr><td>${order.order_number || `ORD-${order.order_id}`}</td><td>${formatDate(order.order_date)}</td><td>${order.customer_name || 'N/A'}</td><td>${formatCurrency(order.final_amount || order.total_amount)}</td><td>${order.order_status || 'pending'}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    };

    const whatsappSelected = (): void => {
        const itemsToSend = filteredOrders.filter(order => selectedIds.has(order.order_id));
        if (itemsToSend.length === 0) return;

        const message = encodeURIComponent(
            `Sales Orders Report:\n\n${itemsToSend.map(order =>
                `${order.order_number || `ORD-${order.order_id}`} - ${formatDate(order.order_date)} - ${order.customer_name} - ${formatCurrency(order.final_amount || order.total_amount)} (${order.order_status})`
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    if (loading) {
        return <div className="p-8 text-center">Loading sales orders...</div>;
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Sales Order Management</h2>
                <p className="text-gray-600">Convert sales orders to invoices or delivery challans</p>
            </div>

            {/* Enhanced Filter Bar */}
            <div className="mb-6 border border-gray-200 rounded-lg bg-gray-50 p-4">
                <div className="flex items-center space-x-4">
                    {/* Select All */}
                    <label className="inline-flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-600">Select All</span>
                    </label>

                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search orders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                        >
                            <option value="all">Status: All</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="completed">Completed</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>

                    {/* Date Filter */}
                    <div className="relative">
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                        >
                            <option value="all">Last 30 days</option>
                            <option value="7">Last 7 days</option>
                            <option value="90">Last 90 days</option>
                            <option value="365">Last year</option>
                        </select>
                        <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>

                    {/* Bulk Actions */}
                    {selectedCount > 0 ? (
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-700 mr-1">Selected: {selectedCount}</span>
                            <button
                                onClick={exportSelectedPDF}
                                className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-2"
                            >
                                <Download className="w-4 h-4" />
                                <span>PDF</span>
                            </button>
                            <button
                                onClick={printSelected}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                            >
                                <Printer className="w-4 h-4" />
                                <span>Print</span>
                            </button>
                            <button
                                onClick={whatsappSelected}
                                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span>WhatsApp</span>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={exportSelectedPDF}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2"
                        >
                            <Download className="w-4 h-4" />
                            <span>Export PDF</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-gray-300"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredOrders.map((order) => (
                            <tr key={order.order_id} className={`hover:bg-gray-50 ${selectedIds.has(order.order_id) ? 'bg-blue-50' : ''}`}>
                                <td className="px-4 py-4 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(order.order_id)}
                                        onChange={() => toggleSelect(order.order_id)}
                                        className="w-4 h-4 rounded border-gray-300"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                        {order.order_number || `ORD-${order.order_id}`}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {formatDate(order.order_date)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{order.customer_name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {formatCurrency(order.final_amount || order.total_amount)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex gap-2">
                                        {getStatusBadge(order)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex gap-2">
                                        {/* View Button */}
                                        <button
                                            onClick={() => {/* TODO: Navigate to order view */ }}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="View Order"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>

                                        {/* Print Button */}
                                        <button
                                            onClick={() => {
                                                setSelectedIds(new Set([order.order_id]));
                                                setTimeout(() => printSelected(), 0);
                                            }}
                                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                            title="Print"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </button>

                                        {/* Download Button */}
                                        <button
                                            onClick={() => {
                                                setSelectedIds(new Set([order.order_id]));
                                                setTimeout(() => exportSelectedPDF(), 0);
                                            }}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                            title="Download PDF"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>

                                        {/* Convert to Invoice Button */}
                                        {!order.invoice_created && order.order_status === 'approved' && (
                                            <ConvertToInvoiceButton
                                                orderId={typeof order.order_id === 'number' ? order.order_id : parseInt(String(order.order_id), 10)}
                                                orderNumber={order.order_number}
                                                onSuccess={(invoiceData: InvoiceData) => handleInvoiceCreated(order.order_id, invoiceData)}
                                                className="text-sm py-1 px-3"
                                            />
                                        )}

                                        {/* Convert to Challan Button */}
                                        {!order.challan_created && (
                                            <button
                                                onClick={() => {/* TODO: Convert to challan */ }}
                                                className="flex items-center gap-1 text-sm px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                                            >
                                                <Truck className="w-3 h-3" />
                                                Challan
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredOrders.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        No sales orders found
                    </div>
                )}
            </div>
        </div>
    );
};

export default SalesOrderList;
