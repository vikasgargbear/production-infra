import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Edit2, Trash2, 
  Download, Upload, AlertCircle, Check, Loader2,
  AlertTriangle
} from 'lucide-react';
import { productsApi } from '../../services/api';
import { ProductEditModal } from '../global/modals';
import { DataTable, Column } from '../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../global';
import Button from '../global/ui/Button';
import Input from '../global/ui/forms/Input';
import { useToast } from '../global/ui/feedback/Toast';

interface Product {
  product_id: number;
  id?: string; // For compatibility
  product_name: string;
  generic_name?: string;
  product_code?: string;
  category?: string;
  hsn_code?: string;
  brand?: string;
  manufacturer?: string;
  mrp?: number;
  cost_price?: number;
  pack_size?: string;
  unit?: string;
  tax_rate?: number;
  status?: string;
  is_active?: boolean;
  [key: string]: any;
}

interface ProductMasterProps {
  // Remove modal props - make it a full page component
}

const ProductMaster: React.FC<ProductMasterProps> = () => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Load products on component mount
  useEffect(() => {
    loadProducts();
  }, []);
  
  // Load categories after products are loaded
  useEffect(() => {
    if (products.length > 0) {
      loadCategories();
    }
  }, [products]);
  
  // Load products from API
  const loadProducts = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await productsApi.getAll();
      setProducts(response.data || []);
    } catch (err) {
      setError('Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load categories from API
  const loadCategories = async (): Promise<void> => {
    try {
      // TODO: Implement categories endpoint
      // const response = await productsApi.getCategories();
      // setCategories(response.data || []);
      
      // For now, extract unique categories from products
      const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
      setCategories(['All', ...uniqueCategories]);
    } catch (err) {
    }
  };
  
  // Search products
  const searchProducts = async (query: string): Promise<void> => {
    if (!query.trim()) {
      loadProducts();
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await productsApi.search(query);
      setProducts(response.data || []);
    } catch (err) {
      setError('Failed to search products.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Filter products based on search and category
  const filteredProducts = products.filter((product: Product) => {
    // Filter out null/undefined products first
    if (!product || !product.product_name) {
      return false;
    }
    
    const matchesSearch = searchTerm === '' || 
      product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.hsn_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || 
      product.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleEditProduct = (product: Product): void => {
    setEditingProduct(product);
  };

  const handleDeleteProduct = async (productId: string | number): Promise<void> => {
    // Find the product to check current status and if it has stock
    const product = products.find(p => p.product_id === Number(productId));
    const isCurrentlyActive = product?.is_active !== false;
    
    // Check if product has stock - warn more strongly
    const hasStock = product?.current_stock && product.current_stock > 0;
    
    const action = isCurrentlyActive ? 'deactivate' : 'reactivate';
    let confirmMessage = isCurrentlyActive 
      ? 'Are you sure you want to deactivate this product? The product will be marked as inactive but all data, inventory records, and transaction history will be preserved.'
      : 'Are you sure you want to reactivate this product?';
    
    if (hasStock && isCurrentlyActive) {
      confirmMessage = `WARNING: This product has ${product.current_stock} units in stock!\n\n${confirmMessage}\n\nExisting stock will remain but the product won't be available for new transactions.`;
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Toggle active status (soft delete/restore) 
      // For products, we need to be extra careful
      const updateData = {
        ...product,
        is_active: !isCurrentlyActive
      };
      await productsApi.update(productId, updateData);
      toast.success(`Product ${action}d successfully`);
      loadProducts();
    } catch (err) {
      toast.error(`Failed to ${action} product. It may be in use by active transactions.`);
    }
  };

  const handleProductSaved = (): void => {
    setEditingProduct(null);
    setShowAddModal(false);
    loadProducts();
    toast.created('Product');
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedProducts.length === 0) return;
    
    // Check if any selected products have stock
    const productsWithStock = products.filter(p => 
      selectedProducts.includes(String(p.product_id)) && 
      p.current_stock && p.current_stock > 0
    );
    
    let confirmMessage = `Are you sure you want to deactivate ${selectedProducts.length} products? They will be marked as inactive but all data, inventory records, and transaction history will be preserved.`;
    
    if (productsWithStock.length > 0) {
      confirmMessage = `WARNING: ${productsWithStock.length} of these products have stock!\n\n${confirmMessage}`;
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Bulk soft delete - mark all as inactive
      await Promise.all(selectedProducts.map(id => {
        const product = products.find(p => p.product_id === Number(id));
        return productsApi.update(id, {...product, is_active: false});
      }));
      toast.success(`${selectedProducts.length} products deactivated successfully`);
      setSelectedProducts([]);
      loadProducts();
    } catch (err) {
      toast.error('Failed to deactivate some products.');
    }
  };

  const toggleProductSelection = (productId: string): void => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleAllSelection = (): void => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => String(p.product_id)));
    }
  };

  // Define columns for DataTable
  const columns: Column<Product>[] = [
    {
      key: 'product_name',
      header: 'Product',
      render: (_, product) => {
        if (!product) return <div>N/A</div>;
        return (
          <div>
            <div className="font-medium text-app-800">{product.product_name || 'N/A'}</div>
            {product.generic_name && (
              <div className="text-sm text-app-500">{product.generic_name}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'product_code',
      header: 'Code/HSN',
      render: (_, product) => {
        if (!product) return <div>N/A</div>;
        return (
          <div>
            <div className="text-app-800">{product.product_code || 'N/A'}</div>
            <div className="text-sm text-app-500">HSN: {product.hsn_code || 'N/A'}</div>
          </div>
        );
      },
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
      render: (value) => value ? `₹${value.toFixed(2)}` : '-',
    },
    {
      key: 'cost_price',
      header: 'Cost',
      align: 'right' as const,
      render: (value) => value ? `₹${value.toFixed(2)}` : '-',
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
        }`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, product) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEditProduct(product)}
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!product}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteProduct(String(product?.product_id))}
            className={`${
              product?.is_active !== false 
                ? 'text-warning-600 hover:text-warning-700' 
                : 'text-success-600 hover:text-success-700'
            } p-1 rounded transition-colors`}
            disabled={!product?.product_id}
            title={product?.is_active !== false ? 'Deactivate Product' : 'Reactivate Product'}
          >
            {product?.is_active !== false ? (
              product?.current_stock > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
        </div>
      ),
    },
  ];

  const headerActions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {/* Import logic */}}
      >
        <Upload className="w-4 h-4 mr-2" />
        Import
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {/* Export logic */}}
      >
        <Download className="w-4 h-4 mr-2" />
        Export
      </Button>
      <Button
        variant="primary"
        onClick={() => setShowAddModal(true)}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Product
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
      <ContentCard title="Search & Filter" subtitle={null} actions={
        selectedProducts.length > 0 ? (
          <Button
            variant="danger"
            size="sm"
            onClick={handleBulkDelete}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Deactivate ({selectedProducts.length})
          </Button>
        ) : null
      } icon={Search}>
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
          <div className="flex items-center space-x-4">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(category => (
                <option key={category} value={category === 'All' ? 'all' : category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ContentCard>

      {/* Success/Error Messages */}
      {successMessage && (
        <ContentCard title="" subtitle={null} actions={null} className="border-l-4 border-l-green-500 bg-green-50" icon={Check}>
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-green-800">{successMessage}</span>
          </div>
        </ContentCard>
      )}

      {error && (
        <ContentCard title="" subtitle={null} actions={null} className="border-l-4 border-l-red-500 bg-red-50" icon={AlertCircle}>
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </ContentCard>
      )}

      {/* Product List */}
      <ContentCard title="Product List" subtitle={null} actions={null} className="overflow-hidden" icon={Package}>
        <DataTable
          data={filteredProducts}
          columns={columns}
          keyField="product_id"
          loading={isLoading}
          emptyMessage="No products found"
          emptyIcon={<Package className="w-12 h-12 text-app-400" />}
          selectable={true}
          selectedRows={filteredProducts.filter(p => selectedProducts.includes(String(p.product_id)))}
          onSelectionChange={(selected) => setSelectedProducts(selected.map(p => String(p.product_id)))}
          hoverable={true}
          striped={true}
          paginated={true}
          pageSize={20}
          searchable={false}
        />
      </ContentCard>

      {/* Product Edit/Add Modal */}
      {(showAddModal || editingProduct) && (
        <ProductEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSaved}
          product={editingProduct}
        />
      )}
    </GlobalLayout>
  );
};

export default ProductMaster;