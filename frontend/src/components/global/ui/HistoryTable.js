import React, { useState } from 'react';
import { 
  Search, Calendar, ChevronDown, Download, Printer, MessageCircle,
  Eye, Edit, FileText
} from 'lucide-react';
import jsPDF from 'jspdf';

const HistoryTable = ({
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
  onEdit,
  onPrint,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Filter data
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

  // Multi-select functionality
  const isAllSelected = filteredData.length > 0 && filteredData.every(item => selectedIds.has(item[idField]));
  const selectedCount = Array.from(selectedIds).filter(id => filteredData.some(f => f[idField] === id)).length;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
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

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatValue = (value, column) => {
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

  const exportSelectedPDF = () => {
    const itemsToExport = filteredData.filter(item => selectedIds.has(item[idField]));
    if (itemsToExport.length === 0) return;

    try {
      // Try to use jspdf-autotable if available
      const autoTable = require('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${title} Report`, 20, 20);
      
      const tableData = itemsToExport.map(item => 
        columns.map(col => formatValue(item[col.key], col))
      );

      doc.autoTable({
        head: [columns.map(col => col.label)],
        body: tableData,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save(pdfFilename);
    } catch (error) {
      // Fallback to simple PDF without table formatting
      console.warn('jspdf-autotable not available, using simple PDF export');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${title} Report`, 20, 20);
      
      let yPos = 40;
      
      // Add headers
      doc.setFontSize(10);
      const headerText = columns.map(col => col.label).join(' | ');
      doc.text(headerText, 20, yPos);
      yPos += 10;
      
      // Add data rows
      itemsToExport.forEach(item => {
        const rowText = columns.map(col => formatValue(item[col.key], col)).join(' | ');
        doc.text(rowText, 20, yPos);
        yPos += 8;
        
        // Add new page if needed
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      doc.save(pdfFilename);
    }
  };

  const printSelected = () => {
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

  const whatsappSelected = () => {
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
    <div>
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
              placeholder={searchPlaceholder}
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
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
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
              {dateFilters.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
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
        
        {/* Summary Stats */}
        {showSummary && summaryFields.length > 0 && (
          <div className="flex items-center justify-end gap-4 text-sm mt-2 pt-2 border-t border-gray-200">
            {summaryFields.map(field => {
              const total = filteredData.reduce((sum, item) => {
                const value = parseFloat(item[field.key]) || 0;
                return sum + value;
              }, 0);
              
              return (
                <div key={field.key}>
                  <span className="text-gray-500">{field.label}:</span>
                  <span className="ml-1 font-semibold">
                    {field.type === 'currency' ? formatCurrency(total) : total}
                  </span>
                </div>
              );
            })}
            <div>
              <span className="text-gray-500">Count:</span>
              <span className="ml-1 font-semibold">{filteredData.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
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
              {columns.map(column => (
                <th key={column.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {column.label}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredData.map((item) => (
              <tr 
                key={item[idField]} 
                className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(item[idField]) ? 'bg-blue-50' : ''}`}
                onClick={() => onRowClick && onRowClick(item)}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item[idField])}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(item[idField]);
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                </td>
                {columns.map(column => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap">
                    {column.render ? column.render(item[column.key], item) : formatValue(item[column.key], column)}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    {/* View */}
                    {onView && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onView(item);
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    
                    {/* Print */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIds(new Set([item[idField]]));
                        setTimeout(() => printSelected(), 0);
                      }}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Print"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Download */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIds(new Set([item[idField]]));
                        setTimeout(() => exportSelectedPDF(), 0);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    
                    {/* WhatsApp */}
                    {onWhatsApp && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onWhatsApp(item);
                        }}
                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Send WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    
                    {/* Custom Actions */}
                    {customActions.map(action => (
                      <button
                        key={action.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          action.onClick(item);
                        }}
                        className={`p-2 rounded-lg transition-colors ${action.className || 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
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
        
        {filteredData.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No {title.toLowerCase()} found
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryTable;