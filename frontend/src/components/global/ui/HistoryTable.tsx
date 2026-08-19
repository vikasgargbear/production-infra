import React, { useState, ReactNode, MouseEvent, ChangeEvent } from 'react';
import {
    Search, Calendar, ChevronDown, Download, Printer, MessageCircle,
    Eye, FileText, Filter, RefreshCw, TrendingUp, Package, Users
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// ==================== TYPE DEFINITIONS ====================

interface StatusOption {
    value: string;
    label: string;
}

interface DateFilterOption {
    value: string;
    label: string;
}

interface Column {
    key: string;
    label: string;
    type?: 'currency' | 'date' | 'text';
    render?: (value: any, item: any) => ReactNode;
}

interface SummaryField {
    key: string;
    label: string;
    type?: 'currency' | 'number';
}

interface CustomAction {
    key: string;
    title: string;
    icon: ReactNode;
    onClick: (item: any) => void;
    className?: string;
}

type FormattersMap = {
    [key: string]: (value: any) => string | ReactNode;
};

export interface HistoryTableProps {
    title?: string;
    data?: any[];
    columns?: Column[];
    searchPlaceholder?: string;
    statusOptions?: StatusOption[];
    dateFilters?: DateFilterOption[];
    onRowClick?: (item: any) => void;
    onView?: (item: any) => void;
    onEdit?: (item: any) => void;
    onPrint?: (item: any) => void;
    onWhatsApp?: (item: any) => void;
    customActions?: CustomAction[];
    showSummary?: boolean;
    summaryFields?: SummaryField[];
    pdfFilename?: string;
    searchFields?: string[];
    statusField?: string;
    dateField?: string;
    idField?: string;
    formatters?: FormattersMap;
}

// ==================== COMPONENT ====================

const HistoryTable: React.FC<HistoryTableProps> = ({
    title = "History",
    data = [],
    columns = [],
    searchPlaceholder = "Search...",
    statusOptions = [
        { value: 'all', label: 'Status: All' },
        { value: 'paid', label: 'Paid' },
        { value: 'pending', label: 'Pending' },
        { value: 'cancelled', label: 'Cancelled' }
    ],
    dateFilters = [
        { value: 'all', label: 'Last 30 days' },
        { value: '7', label: 'Last 7 days' },
        { value: '90', label: 'Last 90 days' },
        { value: '365', label: 'Last year' }
    ],
    onRowClick,
    onView,
    onWhatsApp,
    customActions = [],
    showSummary = true,
    summaryFields = [],
    pdfFilename = "export.pdf",
    searchFields = ['name', 'number'],
    statusField = 'status',
    dateField = 'date',
    idField = 'id',
    formatters = {}
}) => {
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

    const filteredData = data.filter(item => {
        const searchMatch = searchQuery === '' ||
            searchFields.some(field =>
                item[field]?.toString().toLowerCase().includes(searchQuery.toLowerCase())
            );

        const statusMatch = filterStatus === 'all' ||
            item[statusField]?.toLowerCase() === filterStatus.toLowerCase();

        const itemDate = new Date(item[dateField]);
        const now = new Date();
        let dateMatch = true;
        if (dateFilter !== 'all') {
            const daysAgo = parseInt(dateFilter);
            const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
            dateMatch = itemDate >= cutoffDate;
        }

        return searchMatch && statusMatch && dateMatch;
    });

    const isAllSelected = filteredData.length > 0 && filteredData.every(item => selectedIds.has(item[idField]));
    const selectedCount = Array.from(selectedIds).filter(id => filteredData.some(f => f[idField] === id)).length;

    const toggleSelect = (id: string | number): void => {
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
                filteredData.forEach(item => next.delete(item[idField]));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredData.forEach(item => next.add(item[idField]));
                return next;
            });
        }
    };

    const formatDate = (date: string): string => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const formatValue = (value: any, column: Column): string | ReactNode => {
        if (formatters[column.key]) {
            return formatters[column.key](value);
        }
        if (column.type === 'currency') {
            return formatCurrency(value || 0);
        }
        if (column.type === 'date') {
            return formatDate(value);
        }
        return value || '';
    };

    const exportSelectedPDF = (): void => {
        const itemsToExport = filteredData.filter(item => selectedIds.has(item[idField]));
        if (itemsToExport.length === 0) return;

        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`${title} Report`, 20, 20);

        let yPos = 40;

        doc.setFontSize(10);
        const headerText = columns.map(col => col.label).join(' | ');
        doc.text(headerText, 20, yPos);
        yPos += 10;

        itemsToExport.forEach(item => {
            const rowText = columns.map(col => String(formatValue(item[col.key], col))).join(' | ');
            doc.text(rowText, 20, yPos);
            yPos += 8;

            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });

        doc.save(pdfFilename);
    };

    const printSelected = (): void => {
        const itemsToPrint = filteredData.filter(item => selectedIds.has(item[idField]));
        const html = `<!DOCTYPE html><html><head><title>Print ${title}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>${title} Report</h2>
      <table><thead><tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr></thead>
      <tbody>
      ${itemsToPrint.map(item => `<tr>${columns.map(col => `<td>${formatValue(item[col.key], col)}</td>`).join('')}</tr>`).join('')}
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
        const itemsToSend = filteredData.filter(item => selectedIds.has(item[idField]));
        if (itemsToSend.length === 0) return;

        const message = encodeURIComponent(
            `${title} Report:\n\n${itemsToSend.map(item =>
                columns.slice(0, 4).map(col => formatValue(item[col.key], col)).join(' - ')
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <FileText className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
                                <p className="text-sm text-gray-500">{filteredData.length} total records</p>
                            </div>
                        </div>

                        {showSummary && summaryFields.length > 0 && (
                            <div className="flex items-center space-x-4">
                                {summaryFields.map(field => {
                                    const total = filteredData.reduce((sum, item) => {
                                        const value = parseFloat(item[field.key]) || 0;
                                        return sum + value;
                                    }, 0);

                                    return (
                                        <div key={field.key} className="bg-gray-50 rounded-lg px-4 py-3 min-w-[120px]">
                                            <div className="flex items-center space-x-2">
                                                <TrendingUp className="w-4 h-4 text-green-600" />
                                                <div>
                                                    <p className="text-xs text-gray-500 uppercase tracking-wide">{field.label}</p>
                                                    <p className="text-lg font-semibold text-gray-900">
                                                        {field.type === 'currency' ? formatCurrency(total) : total}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="bg-blue-50 rounded-lg px-4 py-3 min-w-[100px]">
                                    <div className="flex items-center space-x-2">
                                        <Package className="w-4 h-4 text-blue-600" />
                                        <div>
                                            <p className="text-xs text-blue-600 uppercase tracking-wide">Count</p>
                                            <p className="text-lg font-semibold text-blue-900">{filteredData.length}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">Filters & Search</span>
                        </div>
                        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-5">
                            <label className="block text-xs font-medium text-gray-700 mb-2">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder={searchPlaceholder}
                                    value={searchQuery}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
                            <div className="relative">
                                <select
                                    value={filterStatus}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
                                    className="appearance-none w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                >
                                    {statusOptions.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-700 mb-2">Date Range</label>
                            <div className="relative">
                                <select
                                    value={dateFilter}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setDateFilter(e.target.value)}
                                    className="appearance-none w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                >
                                    {dateFilters.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="md:col-span-1">
                            <button
                                onClick={exportSelectedPDF}
                                className="w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center justify-center"
                                title="Export PDF"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {selectedCount > 0 && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <Users className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium text-blue-700">
                                        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
                                    </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={exportSelectedPDF}
                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium flex items-center space-x-1"
                                    >
                                        <Download className="w-3 h-3" />
                                        <span>PDF</span>
                                    </button>
                                    <button
                                        onClick={printSelected}
                                        className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-medium flex items-center space-x-1"
                                    >
                                        <Printer className="w-3 h-3" />
                                        <span>Print</span>
                                    </button>
                                    <button
                                        onClick={whatsappSelected}
                                        className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-medium flex items-center space-x-1"
                                    >
                                        <MessageCircle className="w-3 h-3" />
                                        <span>WhatsApp</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">
                                {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
                            </span>
                        </div>
                        <div className="text-sm text-gray-500">
                            Showing {filteredData.length} of {data.length} records
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                                    <span className="sr-only">Select</span>
                                </th>
                                {columns.map(column => (
                                    <th key={column.key} className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        {column.label}
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredData.map((item) => (
                                <tr
                                    key={item[idField]}
                                    className={`
                    group transition-all duration-150 ease-in-out cursor-pointer
                    ${selectedIds.has(item[idField])
                                            ? 'bg-blue-50 border-l-4 border-blue-500'
                                            : 'hover:bg-gray-50 border-l-4 border-transparent hover:border-gray-200'
                                        }
                  `}
                                    onClick={() => onRowClick && onRowClick(item)}
                                >
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(item[idField])}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                e.stopPropagation();
                                                toggleSelect(item[idField]);
                                            }}
                                            onClick={(e: MouseEvent) => e.stopPropagation()}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                    </td>
                                    {columns.map(column => (
                                        <td key={column.key} className="px-6 py-4">
                                            <div className="text-sm">
                                                {column.render ? (
                                                    column.render(item[column.key], item)
                                                ) : (
                                                    <span className={column.key.includes('amount') || column.type === 'currency'
                                                        ? 'font-semibold text-gray-900'
                                                        : 'text-gray-900'
                                                    }>
                                                        {formatValue(item[column.key], column)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    ))}
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {onView && (
                                                <button
                                                    onClick={(e: MouseEvent) => {
                                                        e.stopPropagation();
                                                        onView(item);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            )}

                                            <button
                                                onClick={(e: MouseEvent) => {
                                                    e.stopPropagation();
                                                    setSelectedIds(new Set([item[idField]]));
                                                    setTimeout(() => printSelected(), 0);
                                                }}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Print"
                                            >
                                                <Printer className="w-4 h-4" />
                                            </button>

                                            <button
                                                onClick={(e: MouseEvent) => {
                                                    e.stopPropagation();
                                                    setSelectedIds(new Set([item[idField]]));
                                                    setTimeout(() => exportSelectedPDF(), 0);
                                                }}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                                title="Download PDF"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>

                                            {onWhatsApp && (
                                                <button
                                                    onClick={(e: MouseEvent) => {
                                                        e.stopPropagation();
                                                        onWhatsApp(item);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                    title="Send WhatsApp"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                </button>
                                            )}

                                            {customActions.map(action => (
                                                <button
                                                    key={action.key}
                                                    onClick={(e: MouseEvent) => {
                                                        e.stopPropagation();
                                                        action.onClick(item);
                                                    }}
                                                    className={`p-2 rounded-lg transition-colors ${action.className || 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                                                    title={action.title}
                                                >
                                                    {action.icon}
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredData.length === 0 && (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                            <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No {title.toLowerCase()} found</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {searchQuery
                                ? `No results match your search "${searchQuery}"`
                                : `No ${title.toLowerCase()} available at the moment`
                            }
                        </p>
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistoryTable;
