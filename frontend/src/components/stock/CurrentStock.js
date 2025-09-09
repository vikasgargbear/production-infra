import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, Search, Filter, Download, Eye, Printer, MessageCircle,
  AlertTriangle, CheckCircle, Clock, MoreVertical, Calendar, ChevronDown,
  TrendingUp, TrendingDown, Edit2, X,
  HelpCircle, Loader2, RefreshCw, AlertCircle
} from 'lucide-react';
import apiClient from '../../services/api/apiClient';
import { productsApi } from '../../services/api/modules/products.api';
import { stockApi } from '../../services/api/modules/stock.api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable, ModuleHeader } from '../global';
import ProductEditModal from '../global/modals/ProductEditModal';
import jsPDF from 'jspdf';

// Enterprise-grade data validation and transformation utilities
const ProductDataValidator = {
  /**
   * Validates that a product object has all required fields for stock display
   */
  validateProductData(product) {
    if (!product || typeof product !== 'object') {
      return false;
    }
    
    if (!product.product_id || typeof product.product_id !== 'number') {
      return false;
    }
    
    if (!product.product_name || typeof product.product_name !== 'string') {
      return false;
    }
    
    return true;
  },

  /**
   * Transforms a raw product object from API to standardized stock item format
   * Uses actual API field names based on backend response
   */
  transformProductToStockItem(product) {
    const currentStock = Number(product.current_stock || 0);
    const reorderLevel = Number(product.reorder_level || 0);
    const minStockLevel = Number(product.min_stock_quantity || 0);
    const effectiveReorderLevel = reorderLevel || minStockLevel;
    
    return {
      // Core identification
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code || `PROD-${product.product_id}`,
      generic_name: product.generic_name || '',
      
      // Category - now read from batch-level data
      category: product.category_name || product.category || '', 
      manufacturer: product.manufacturer || '',
      brand: product.brand || '',
      product_type: product.product_type || 'standard',
      product_class: product.product_class || 'medicine',
      
      // Regulatory & Compliance
      hsn_code: product.hsn_code || '',
      drug_schedule: product.drug_schedule || '',
      prescription_required: Boolean(product.requires_prescription),
      is_narcotic: Boolean(product.is_narcotic),
      is_controlled_substance: Boolean(product.is_controlled_substance),
      
      // Stock & Inventory
      current_stock: currentStock,
      available_stock: currentStock, // Assuming available = current for now
      reserved_stock: 0, // Would need separate API call for reservations
      reorder_level: effectiveReorderLevel,
      minimum_stock_level: minStockLevel,
      maximum_stock_level: Number(product.max_stock_quantity || 0),
      
      // Pricing
      mrp: Number(product.mrp || 0),
      purchase_rate: Number(product.cost_price || 0),
      selling_rate: Number(product.selling_price || 0),
      stock_value: currentStock * Number(product.cost_price || 0),
      
      // Units & Measurements - Now from batch-level data
      unit: product.base_uom || product.base_uom_id || 'Units',
      pack_size: Number(product.pack_size || product.pack_config?.pack_size || 1),
      pack_type: product.pack_type || product.pack_unit || product.pack_config?.pack_type || '',
      pack_unit_quantity: Number(product.units_per_pack || product.pack_config?.pack_unit_quantity || 1),
      sub_unit_quantity: Number(product.tablets_per_strip || product.packs_per_box || product.pack_config?.sub_unit_quantity || 1),
      purchase_unit: product.pack_uom || product.box_unit || product.pack_config?.purchase_unit || '',
      sale_unit: product.base_uom || product.pack_config?.sale_unit || product.unit || 'Units',
      
      // Tax Information
      gst_percentage: Number(product.gst_percentage || 0),
      cess_percentage: Number(product.cess_percentage || 0),
      
      // Status & Alerts
      is_active: Boolean(product.is_active),
      low_stock: currentStock <= effectiveReorderLevel && effectiveReorderLevel > 0,
      out_of_stock: currentStock === 0,
      stock_status: currentStock === 0 ? 'out_of_stock' : 
                   (currentStock <= effectiveReorderLevel && effectiveReorderLevel > 0) ? 'low_stock' : 'normal',
      expiry_alert: false, // Would be calculated from batches
      
      // Storage & Handling
      storage_conditions: product.storage_conditions || '',
      requires_cold_chain: Boolean(product.requires_cold_chain),
      
      // Metadata
      created_at: product.created_at,
      updated_at: product.updated_at,
      last_updated: product.updated_at,
      
      // Related data
      batches: product.batches || [],
      batch_count: Number(product.batch_count || 0)
    };
  }
};

const CurrentStock = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stockData, setStockData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showExpiring, setShowExpiring] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dateFilter, setDateFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'product_name', direction: 'asc' });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [moreFilters, setMoreFilters] = useState({
    stockStatus: 'all',
    expiryPeriod: 'all',
    packType: 'all'
  });
  // Edit form state removed - using global ProductEditModal instead
  
  // API data states
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStockData(0, true);
  }, []);

  const loadMoreData = () => {
    if (!loadingMore && hasMore) {
      const nextPage = Math.floor(allProducts.length / 20);
      setCurrentPage(nextPage);
      loadStockData(nextPage, false);
    }
  };

  // Infinite scroll handler
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const bottom = scrollHeight - scrollTop <= clientHeight + 100; // Trigger 100px before bottom
    
    if (bottom && !loadingMore && hasMore) {
      loadMoreData();
    }
  };

  const loadStockData = async (page = 0, reset = true) => {
    if (page === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      setError(null);
      
      // Use inventory/stock/current endpoint to get all products with stock info
      const response = await apiClient.get('/inventory/stock/current', {
        params: {
          limit: 100,
          skip: page * 100
        }
      });
      
      // Handle inventory/stock/current response format
      let products = [];
      if (response?.data?.stocks && Array.isArray(response.data.stocks)) {
        // Response from /inventory/stock/current endpoint
        products = response.data.stocks.map(stock => ({
          product_id: stock.product_id,
          product_name: stock.product_name,
          product_code: stock.product_code,
          generic_name: stock.generic_name,
          category: stock.category || '',  // Backend now returns category name directly
          product_type: stock.product_type || 'standard',
          product_class: stock.product_class || 'medicine',
          manufacturer: stock.manufacturer,
          brand: stock.brand,
          hsn_code: stock.hsn_code,
          unit: stock.unit || 'Units',
          current_stock: stock.total_quantity || 0,
          available_stock: stock.available_quantity || 0,
          reserved_stock: stock.allocated_quantity || 0,
          mrp: stock.mrp || 0,
          cost_price: stock.average_cost || 0,
          sale_price: stock.sale_price || stock.mrp || 0,
          reorder_level: stock.reorder_level || 0,
          low_stock: stock.is_below_minimum || stock.is_below_reorder || false,
          expiry_alert: stock.near_expiry_batches > 0,
          total_batches: stock.total_batches || 0,
          expired_batches: stock.expired_batches || 0,
          near_expiry_batches: stock.near_expiry_batches || 0,
          total_value: stock.total_value || 0,
          batches: []
        }));
      } else if (response?.data && Array.isArray(response.data)) {
        // Direct array response
        products = response.data;
      } else {
        products = [];
      }
      
      // Set hasMore based on whether we got fewer items than requested
      setHasMore(products.length === 100);  // We request 100 items per page
      
      // Enterprise-grade data validation and transformation
      const validProducts = products.filter(ProductDataValidator.validateProductData);
      const transformedData = validProducts.map(ProductDataValidator.transformProductToStockItem);
      
      if (reset || page === 0) {
        setAllProducts(transformedData);
        setStockData(transformedData);
      } else {
        setAllProducts(prev => [...prev, ...transformedData]);
        setStockData(prev => [...prev, ...transformedData]);
      }
      
    } catch (error) {
      setError(error.message || 'Failed to load stock data');
      
      if (page === 0) {
        setStockData([]);
        setAllProducts([]);
      }
    } finally {
      if (page === 0) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadStockData(0, true);
    } catch (error) {
      setError('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  // Note: selectedCount calculation moved after filteredData definition to avoid initialization error

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const exportSelectedPDF = () => {
    const itemsToExport = selectedIds.size > 0 
      ? filteredData.filter(item => selectedIds.has(item.product_id))
      : filteredData;
    
    if (itemsToExport.length === 0) return;

    try {
      // Try to use jspdf-autotable if available
      const autoTable = require('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Current Stock Report', 20, 20);
      
      const tableData = itemsToExport.map(item => [
        item.product_name || 'N/A',
        item.product_code || 'N/A',
        item.current_stock || 0,
        item.unit || 'Units',
        item.reorder_level || 0,
        item.low_stock ? 'Low Stock' : (item.current_stock === 0 ? 'Out of Stock' : 'In Stock')
      ]);

      doc.autoTable({
        head: [['Product', 'Code', 'Stock', 'Unit', 'Reorder Level', 'Status']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save('current-stock-export.pdf');
    } catch (error) {
      // Fallback to simple PDF
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Current Stock Report', 20, 20);
      
      let yPos = 40;
      doc.setFontSize(10);
      doc.text('Product | Code | Stock | Unit | Reorder Level | Status', 20, yPos);
      yPos += 10;
      
      itemsToExport.forEach(item => {
        const rowText = `${item.product_name || 'N/A'} | ${item.product_code || 'N/A'} | ${item.current_stock || 0} | ${item.unit || 'Units'} | ${item.reorder_level || 0} | ${item.low_stock ? 'Low Stock' : (item.current_stock === 0 ? 'Out of Stock' : 'In Stock')}`;
        doc.text(rowText, 20, yPos);
        yPos += 8;
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      doc.save('current-stock-export.pdf');
    }
  };

  const printSelected = () => {
    const itemsToPrint = selectedIds.size > 0 
      ? filteredData.filter(item => selectedIds.has(item.product_id))
      : filteredData;
      
    const html = `<!DOCTYPE html><html><head><title>Print Current Stock</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Current Stock Report</h2>
      <table><thead><tr><th>Product</th><th>Code</th><th>Stock</th><th>Unit</th><th>Reorder Level</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(item => `<tr><td>${item.product_name || 'N/A'}</td><td>${item.product_code || 'N/A'}</td><td>${item.current_stock || 0}</td><td>${item.unit || 'Units'}</td><td>${item.reorder_level || 0}</td><td>${item.low_stock ? 'Low Stock' : (item.current_stock === 0 ? 'Out of Stock' : 'In Stock')}</td></tr>`).join('')}
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
    const itemsToSend = selectedIds.size > 0 
      ? filteredData.filter(item => selectedIds.has(item.product_id))
      : filteredData;
      
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Current Stock Report:\n\n${itemsToSend.map(item => 
        `${item.product_name} - ${item.current_stock} ${item.unit || 'Units'} (${item.low_stock ? 'Low Stock' : (item.current_stock === 0 ? 'Out of Stock' : 'In Stock')})`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  // Use useMemo to calculate filtered data - prevents re-render loops
  const filteredData = useMemo(() => {
    // First filter out any null/undefined items with comprehensive validation
    let filtered = stockData.filter(item => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      if (!item.product_name || typeof item.product_name !== 'string') {
        return false;
      }
      if (!item.product_id) {
        return false;
      }
      return true;
    });

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item =>
        (item.product_name && item.product_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.product_code && item.product_code.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    // Low stock filter
    if (showLowStock) {
      filtered = filtered.filter(item => item.low_stock);
    }

    // Expiring filter
    if (showExpiring) {
      filtered = filtered.filter(item => item.expiry_alert);
    }

    // Apply more filters
    if (moreFilters.stockStatus !== 'all') {
      switch (moreFilters.stockStatus) {
        case 'in-stock':
          filtered = filtered.filter(item => item.current_stock > 0);
          break;
        case 'out-of-stock':
          filtered = filtered.filter(item => item.current_stock === 0);
          break;
        case 'low-stock':
          filtered = filtered.filter(item => item.low_stock);
          break;
      }
    }

    if (moreFilters.expiryPeriod !== 'all') {
      const today = new Date();
      filtered = filtered.filter(item => {
        if (!item.batches || item.batches.length === 0) return false;
        
        return item.batches.some(batch => {
          if (!batch.expiry_date) return false;
          const expiryDate = new Date(batch.expiry_date);
          const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          
          switch (moreFilters.expiryPeriod) {
            case '30':
              return daysToExpiry <= 30 && daysToExpiry > 0;
            case '60':
              return daysToExpiry <= 60 && daysToExpiry > 0;
            case '90':
              return daysToExpiry <= 90 && daysToExpiry > 0;
            case 'expired':
              return daysToExpiry <= 0;
            default:
              return true;
          }
        });
      });
    }

    if (moreFilters.packType !== 'all') {
      filtered = filtered.filter(item => 
        item.pack_type && item.pack_type.toLowerCase() === moreFilters.packType.toLowerCase()
      );
    }

    // Sort with safety checks
    filtered.sort((a, b) => {
      if (!a || !b) {
        return 0;
      }
      
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Final safety check before setting data
    const safeFiltered = filtered.filter(item => item && item.product_name);
    
    return safeFiltered;
  }, [stockData, searchQuery, selectedCategory, showLowStock, showExpiring, moreFilters, sortConfig]);

  // Multi-select functionality - Now handled by DataTable component  
  const selectedCount = Array.from(selectedIds).filter(id => filteredData.some(f => f.product_id === id)).length;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = () => {
    try {
      // Prepare CSV data
      const csvHeaders = [
        'Product Name',
        'Product Code', 
        'Category',
        'Current Stock',
        'Available Stock',
        'Reserved Stock',
        'Reorder Level',
        'Unit',
        'MRP',
        'Stock Value',
        'Status'
      ];

      const csvData = filteredData.map(item => [
        item.product_name || '',
        item.product_code || '',
        item.category || '',
        item.current_stock || 0,
        item.available_stock || 0,
        item.reserved_stock || 0,
        item.reorder_level || 0,
        item.unit || 'Units',
        item.mrp || 0,
        item.stock_value || 0,
        item.low_stock ? 'Low Stock' : item.current_stock === 0 ? 'Out of Stock' : 'In Stock'
      ]);

      // Convert to CSV format
      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `current_stock_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`Successfully exported ${filteredData.length} items to CSV`);
    } catch (error) {
      alert('Failed to export data. Please try again.');
    }
  };

  const getStockStatus = (item) => {
    if (item.current_stock === 0) {
      return { color: 'red', text: 'Out of Stock', icon: AlertTriangle };
    } else if (item.low_stock) {
      return { color: 'orange', text: 'Low Stock', icon: TrendingDown };
    } else {
      return { color: 'green', text: 'In Stock', icon: CheckCircle };
    }
  };

  const handleViewDetails = (product) => {
    setSelectedProduct(product);
    setShowDetails(true);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  // handleSaveEdit removed - handled by global ProductEditModal

  const columns = [
    {
      header: 'Product',
      key: 'product_name',
      sortable: true,
      render: (value, row) => {
        if (!row || !row.product_name) {
          return <div className="text-red-500">Invalid Product Data</div>;
        }
        return (
          <div>
            <div className="font-medium text-gray-900">{row.product_name}</div>
            <div className="text-sm text-gray-500">{row.product_code || 'No Code'}</div>
          </div>
        );
      }
    },
    {
      header: 'Category',
      key: 'category',
      sortable: true,
      render: (value, row) => {
        if (!row) {
          return <div className="text-red-500">Invalid Data</div>;
        }
        
        return (
          <div>
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
              {row.category || 'No Category'}
            </span>
            {(row.pack_type || row.pack_size) && (
              <div className="text-xs text-gray-500 mt-1">
                {row.pack_type} {row.pack_size && `- ${row.pack_size}`}
              </div>
            )}
          </div>
        );
      }
    },
    {
      header: 'Current Stock',
      key: 'current_stock',
      sortable: true,
      render: (value, row) => {
        if (!row || typeof row.current_stock === 'undefined') {
          return <div className="text-red-500">Invalid Stock Data</div>;
        }
        
        const status = getStockStatus(row);
        const StatusIcon = status.icon;
        const totalUnits = row.current_stock || 0;
        const packQty = row.pack_unit_quantity || 1;
        const subQty = row.sub_unit_quantity || 1;
        const boxes = Math.floor(totalUnits / (packQty * subQty));
        const remainingAfterBoxes = totalUnits % (packQty * subQty);
        const subBoxes = Math.floor(remainingAfterBoxes / subQty);
        const strips = remainingAfterBoxes % subQty;
        
        return (
          <div className="flex items-center space-x-2">
            <StatusIcon className={`w-4 h-4 text-${status.color}-500`} />
            <div>
              <div className="font-medium">{row.current_stock} {row.sale_unit || row.unit}</div>
              {(packQty > 1 || subQty > 1) && (
                <div className="text-xs text-gray-500">
                  {boxes > 0 && `${boxes} ${row.purchase_unit || 'Box'}${boxes > 1 ? 'es' : ''}`}
                  {boxes > 0 && subBoxes > 0 && ', '}
                  {subBoxes > 0 && `${subBoxes} Sub-${row.purchase_unit || 'Box'}${subBoxes > 1 ? 'es' : ''}`}
                  {(boxes > 0 || subBoxes > 0) && strips > 0 && ', '}
                  {strips > 0 && `${strips} ${row.sale_unit || 'Strip'}${strips > 1 ? 's' : ''}`}
                </div>
              )}
              <div className="text-xs text-gray-500">
                Available: {row.available_stock}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      header: 'Reorder Level',
      key: 'reorder_level',
      sortable: true,
      render: (value, row) => (
        <div className={row.low_stock ? 'text-orange-600 font-medium' : ''}>
          {row.reorder_level} {row.unit}
        </div>
      )
    },
    {
      header: 'Stock Value',
      key: 'stock_value',
      sortable: true,
      render: (value, row) => formatCurrency(row.stock_value)
    },
    {
      header: 'Status',
      key: 'status',
      render: (value, row) => {
        const status = getStockStatus(row);
        return (
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs font-medium bg-${status.color}-100 text-${status.color}-800 rounded`}>
              {status.text}
            </span>
            {row.expiry_alert && (
              <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                Expiring Soon
              </span>
            )}
          </div>
        );
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (value, row) => (
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleViewDetails(row)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([row.product_id]));
              setTimeout(() => printSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setSelectedIds(new Set([row.product_id]));
              setTimeout(() => handleExport(), 0);
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([row.product_id]));
              setTimeout(() => whatsappSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Send WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => handleEdit(row)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '200px',
    }
  ];

  if (!open) return null;

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Current Stock"
          subtitle="Monitor and manage inventory levels"
          icon={Package}
          iconColor="text-blue-600"
          onClose={onClose}
          additionalActions={[
            {
              onClick: () => setShowHelpModal(true),
              variant: "default",
              icon: HelpCircle
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+E</strong> - Export | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Enhanced Filter Bar */}
            <div className={`border border-gray-200 bg-white shadow-sm p-4 ${
              showMoreFilters ? 'rounded-t-lg' : 'rounded-lg mb-6'
            }`}>
              <div className="flex items-center space-x-3">
                {/* Search - First */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products by name or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Low Stock Quick Filter - Professional Design */}
                <button
                  onClick={() => setShowLowStock(!showLowStock)}
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-all duration-200
                    flex items-center space-x-1.5 border
                    ${showLowStock 
                      ? 'bg-amber-50 border-amber-300 text-amber-700' 
                      : 'bg-white border-gray-300 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-600'
                    }
                  `}
                  title={showLowStock ? 'Showing low stock items' : 'Filter low stock items'}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Low Stock</span>
                  {showLowStock && (
                    <span className="ml-1 text-xs font-semibold">
                      ({filteredData.filter(item => item.low_stock).length})
                    </span>
                  )}
                </button>

                {/* Expiring Soon Quick Filter - Professional Design */}
                <button
                  onClick={() => setShowExpiring(!showExpiring)}
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-all duration-200
                    flex items-center space-x-1.5 border
                    ${showExpiring 
                      ? 'bg-red-50 border-red-300 text-red-700' 
                      : 'bg-white border-gray-300 hover:border-red-300 hover:bg-red-50 text-gray-600 hover:text-red-600'
                    }
                  `}
                  title={showExpiring ? 'Showing expiring items' : 'Filter expiring items'}
                >
                  <Clock className="w-4 h-4" />
                  <span>Expiring</span>
                  {showExpiring && (
                    <span className="ml-1 text-xs font-semibold">
                      ({filteredData.filter(item => item.expiry_alert).length})
                    </span>
                  )}
                </button>

                {/* Filter Divider */}
                <div className="h-8 w-px bg-gray-300"></div>

                {/* Global Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className={`
                    p-2 rounded-xl transition-all duration-300 border
                    ${refreshing 
                      ? 'bg-blue-50 border-blue-300' 
                      : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }
                  `}
                  title="Refresh data"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : 'text-gray-600'}`} />
                </button>

                {/* Global Export Button */}
                <button
                  onClick={handleExport}
                  className="p-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
                  title="Export to CSV"
                >
                  <Download className="w-4 h-4 text-gray-600" />
                </button>

                {/* Advanced Filters Toggle Button */}
                <button 
                  onClick={() => setShowMoreFilters(!showMoreFilters)}
                  className={`
                    p-2 rounded-xl transition-all duration-200 border
                    ${showMoreFilters 
                      ? 'bg-indigo-50 border-indigo-300' 
                      : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }
                  `}
                  title={showMoreFilters ? 'Hide filters' : 'More filters'}
                >
                  <Filter className={`w-4 h-4 transition-transform duration-300 ${
                    showMoreFilters ? 'rotate-180 text-indigo-600' : 'text-gray-600'
                  }`} />
                </button>

                {/* Bulk Actions - Only show when items selected */}
                {selectedCount > 0 && (
                  <div className="flex items-center space-x-2 ml-2 pl-2 border-l border-gray-300">
                    <span className="text-sm text-gray-600">({selectedCount})</span>
                    <button 
                      onClick={handleExport} 
                      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                      title="Export selected items to CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={printSelected} 
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      title="Print selected items"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Filters Panel - Category and Stock Status moved here */}
            {showMoreFilters && (
              <div className="border-l border-r border-b border-gray-200 bg-white rounded-b-lg px-4 pb-4 mb-6">
                <div className="border-t border-gray-200 mx-[-16px] mt-4 mb-4"></div>
                <div className="grid grid-cols-4 gap-4">
                    {/* 1. Stock Status Filter - Priority 1 */}
                    <select
                      value={moreFilters.stockStatus}
                      onChange={(e) => setMoreFilters(prev => ({...prev, stockStatus: e.target.value}))}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">Stock Status</option>
                      <option value="in-stock">In Stock</option>
                      <option value="low-stock">Low Stock</option>
                      <option value="out-of-stock">Out of Stock</option>
                    </select>
                    
                    {/* 2. Expiry Period Filter - Priority 2 */}
                    <select 
                      value={moreFilters.expiryPeriod}
                      onChange={(e) => setMoreFilters({...moreFilters, expiryPeriod: e.target.value})}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">Expiry Period</option>
                      <option value="30">30 Days</option>
                      <option value="60">60 Days</option>
                      <option value="90">90 Days</option>
                      <option value="expired">Already Expired</option>
                    </select>
                    
                    {/* 3. Category Filter - Priority 3 */}
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">Category</option>
                      <option value="Tablets">Tablet</option>
                      <option value="Capsules">Capsule</option>
                      <option value="Syrups">Syrup</option>
                      <option value="Injections">Injection</option>
                      <option value="Ointments">Ointment</option>
                      <option value="Drops">Drops</option>
                    </select>
                    
                    {/* 4. Pack Type Filter - Priority 4 */}
                    <select 
                      value={moreFilters.packType}
                      onChange={(e) => setMoreFilters({...moreFilters, packType: e.target.value})}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">Pack Type</option>
                      <option value="strip">Strip</option>
                      <option value="bottle">Bottle</option>
                      <option value="tube">Tube</option>
                      <option value="vial">Vial</option>
                      <option value="sachet">Sachet</option>
                    </select>
                </div>
                
                <div className="mt-3 flex justify-end">
                  <button 
                    onClick={() => {
                      setSelectedCategory('all');
                      setMoreFilters({
                        stockStatus: 'all',
                        expiryPeriod: 'all',
                        packType: 'all'
                      });
                    }}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && stockData.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Loading stock data...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && stockData.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                <div className="text-center max-w-md mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Stock Table */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredData.length > 0 ? (
            <DataTable
              columns={columns}
              data={filteredData}
              keyField="product_id"
              hoverable={true}
              striped={true}
              paginated={true}
              pageSize={20}
              searchable={false}
              selectable={true}
              selectedRows={Array.from(selectedIds).map(id => 
                filteredData.find(item => item.product_id === id)
              ).filter(Boolean)}
              onSelectionChange={(selected) => {
                setSelectedIds(new Set(selected.map(item => item.product_id)));
              }}
            />
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No stock data found</p>
            </div>
          )}
          
          {/* Load More Indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-blue-600">Loading more products...</span>
            </div>
          )}
          
          {/* No More Data Indicator */}
          {!hasMore && allProducts.length > 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              No more products to load ({allProducts.length} total)
            </div>
          )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Details Modal */}
      {showDetails && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-blue-600" />
                  Stock Details
                </h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{selectedProduct.product_name}</h3>
                  <p className="text-sm text-gray-500">{selectedProduct.product_code}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Current Stock</p>
                    <p className="text-lg font-medium">{selectedProduct.current_stock} {selectedProduct.unit}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Stock Value</p>
                    <p className="text-lg font-medium">{formatCurrency(selectedProduct.stock_value)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Available</p>
                    <p className="text-lg font-medium">{selectedProduct.available_stock} {selectedProduct.unit}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Reserved</p>
                    <p className="text-lg font-medium">{selectedProduct.reserved_stock} {selectedProduct.unit}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Batch Details</h4>
                  <div className="space-y-2">
                    {selectedProduct.batches?.map((batch, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{batch.batch_no}</p>
                          <p className="text-sm text-gray-600">Expires: {new Date(batch.expiry_date).toLocaleDateString()}</p>
                        </div>
                        <p className="font-medium">{batch.quantity} {selectedProduct.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Product Edit Modal */}
      {showEditModal && editingProduct && (
        <ProductEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          onSave={(updatedProduct) => {
            // Success handled by toast in ProductMaster
            setShowEditModal(false);
            setEditingProduct(null);
            loadStockData(0, true); // Refresh data after successful save
          }}
          product={editingProduct}
          mode="edit"
        />
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Stock Management Help</h2>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Low Stock Definition</h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      A product is considered <strong>Low Stock</strong> when:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li>Current stock quantity falls below or equals the Reorder Level</li>
                      <li>The Reorder Level is set per product based on your sales velocity</li>
                      <li>You can update the Reorder Level by clicking the Edit button on any product</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      <strong>Example:</strong> If a product has a Reorder Level of 50 units and current stock is 45 units, 
                      it will be marked as Low Stock.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Expiring Products</h3>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      A product is marked as <strong>Expiring</strong> when:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li>Any batch has an expiry date within the next 90 days</li>
                      <li>The system checks each batch's expiry date individually</li>
                      <li>Products with already expired batches are highlighted separately</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      <strong>Note:</strong> The expiry alert helps prevent selling expired medicines and allows 
                      timely returns to suppliers.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Stock Calculations</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <dl className="space-y-2">
                      <div>
                        <dt className="font-medium text-gray-700">Current Stock:</dt>
                        <dd className="text-gray-600">Total quantity available across all active batches</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700">Available Stock:</dt>
                        <dd className="text-gray-600">Quantity that can be sold (excludes reserved/damaged)</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700">Stock Value:</dt>
                        <dd className="text-gray-600">Calculated as: Quantity × Selling Price (not MRP)</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Unit Conversion</h3>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      The system supports multi-level unit conversion:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li><strong>Purchase Unit:</strong> How you buy (e.g., Box)</li>
                      <li><strong>Sale Unit:</strong> How you sell (e.g., Strip)</li>
                      <li><strong>Conversion:</strong> 1 Box = X Sub-boxes = Y Strips</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      Configure these in the Edit dialog for accurate inventory tracking.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrentStock;