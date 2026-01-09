/**
 * ProductMaster Component
 * 
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Unique features preserved: API search debounce, dynamic categories from data.
 * Reduced from 465 lines to ~280 lines.
 */
import React, { useState, useEffect } from 'react';
import {
  Package, Search, Plus, Edit2, Trash2,
  Download, Upload, AlertCircle, Check,
  AlertTriangle
} from 'lucide-react';
import { productsApi } from '../../../services/api';
import { ProductEditModal } from '../../global/edit';
import { DataTable, Column } from '../../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../../global';
import Button from '../../global/ui/Button';
import Input from '../../global/ui/forms/Input';
import { useEntityMaster } from '../hooks';
import type { BaseProduct } from '../types/masterSharedTypes';

// Use canonical BaseProduct type - DO NOT define duplicate
interface Product extends BaseProduct {
  id?: string;
  total_quantity_available?: number;
  [key: string]: unknown;
}

// ============================================================================
// Column Definitions
// ============================================================================

const getColumns = (
  handleEdit: (p: Product) => void,
  handleDelete: (id: string | number) => Promise<void>
): Column<Product>[] => [
    {
      key: 'product_name',
      header: 'Product',
      render: (_, product) => product ? (
        <div>
          <div className="font-medium text-app-800">{product.product_name || 'N/A'}</div>
          {product.generic_name && (
            <div className="text-sm text-app-500">{product.generic_name}</div>
          )}
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'product_code',
      header: 'Code/HSN',
      render: (_, product) => product ? (
        <div>
          <div className="text-app-800">{product.product_code || 'N/A'}</div>
          <div className="text-sm text-app-500">HSN: {product.hsn_code || 'N/A'}</div>
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'category',
      header: 'Category',
    },
    {
      key: 'pack_size',
      header: 'Pack Size',
    },
    {
      key: 'mrp',
      header: 'MRP',
      align: 'right' as const,
      render: (value) => value ? `₹${Number(value).toFixed(2)}` : '-',
    },
    {
      key: 'cost_per_unit',
      header: 'Cost',
      align: 'right' as const,
      render: (value) => value ? `₹${Number(value).toFixed(2)}` : '-',
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${value ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
          }`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, product) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEdit(product)}
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!product}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(product?.product_id)}
            className={`${product?.is_active !== false
              ? 'text-warning-600 hover:text-warning-700'
              : 'text-success-600 hover:text-success-700'
              } p-1 rounded transition-colors`}
            disabled={!product?.product_id}
            title={product?.is_active !== false ? 'Deactivate Product' : 'Reactivate Product'}
          >
            {product?.is_active !== false ? (
              product?.total_quantity_available && product.total_quantity_available > 0
                ? <AlertTriangle className="w-4 h-4" />
                : <Trash2 className="w-4 h-4" />
            ) : <Check className="w-4 h-4" />}
          </button>
        </div>
      )
    }
  ];

// ============================================================================
// Main Component
// ============================================================================

const ProductMaster: React.FC = () => {
  // Use the shared hook for all CRUD operations
  const {
    entities: products,
    filteredEntities,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    filterValue,
    setFilterValue,
    showAddModal,
    setShowAddModal,
    editingEntity,
    setEditingEntity,
    selectedIds,
    setSelectedIds,
    handleEdit,
    handleDelete,
    handleSaved,
    handleBulkDelete
  } = useEntityMaster<Product>({
    entityName: 'product',
    idField: 'product_id',
    nameField: 'product_name',
    api: {
      getAll: productsApi.getAll,
      update: productsApi.update
    },
    searchFields: ['product_name', 'generic_name', 'product_code', 'hsn_code'],
    filterField: 'category',
    softDelete: true
  });

  // Product-specific: Dynamic categories extracted from data
  const [categories, setCategories] = useState<string[]>(['All']);

  useEffect(() => {
    if (products.length > 0) {
      const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
      setCategories(['All', ...uniqueCategories]);
    }
  }, [products]);

  const columns = getColumns(handleEdit, handleDelete);

  const headerActions = (
    <>
      <Button variant="secondary" size="sm" onClick={() => {/* Import logic */ }}>
        <Upload className="w-4 h-4 mr-2" />Import
      </Button>
      <Button variant="secondary" size="sm" onClick={() => {/* Export logic */ }}>
        <Download className="w-4 h-4 mr-2" />Export
      </Button>
      <Button variant="primary" onClick={() => setShowAddModal(true)}>
        <Plus className="w-4 h-4 mr-2" />Add Product
      </Button>
    </>
  );

  return (
    <GlobalLayout
      title="Product Master"
      subtitle="Manage your product catalog"
      icon={Package}
      headerActions={headerActions}
    >
      {/* Filters and Search */}
      <ContentCard
        title="Search & Filter"
        subtitle={undefined}
        actions={selectedIds.length > 0 ? (
          <Button variant="danger" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />Deactivate ({selectedIds.length})
          </Button>
        ) : null}
        icon={Search}
      >
        <div className="flex items-center space-x-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-app-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12"
            />
          </div>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(category => (
              <option key={category} value={category === 'All' ? 'all' : category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </ContentCard>

      {/* Error Message */}
      {error && (
        <ContentCard title="" subtitle={undefined} actions={undefined} className="border-l-4 border-l-red-500 bg-red-50" icon={AlertCircle}>
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </ContentCard>
      )}

      {/* Product List */}
      <ContentCard title="Product List" subtitle={undefined} actions={undefined} className="overflow-hidden" icon={Package}>
        {products.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-app-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
            <p className="text-sm text-gray-500 mb-4">Get started by adding your first product</p>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Your First Product
            </Button>
          </div>
        ) : (
          <DataTable
            data={filteredEntities}
            columns={columns}
            keyField="product_id"
            loading={isLoading}
            emptyMessage="No products found"
            emptyIcon={<Package className="w-12 h-12 text-app-400" />}
            selectable={true}
            selectedRows={filteredEntities.filter(p => selectedIds.includes(String(p.product_id)))}
            onSelectionChange={(selected) => setSelectedIds(selected.map(p => String(p.product_id)))}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Product Edit/Add Modal */}
      {(showAddModal || editingEntity) && (
        <ProductEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingEntity(null);
          }}
          onSave={handleSaved}
          product={editingEntity}
        />
      )}
    </GlobalLayout>
  );
};

export default ProductMaster;