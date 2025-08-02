/**
 * Migration Example
 * Shows how to use v2 components in your existing modules
 */

import React, { useState } from 'react';
import { 
  Button, 
  Input, 
  Select, 
  Card, 
  CardHeader,
  DataTable,
  StatusBadge,
  CustomerSearch,
  ProductSearch,
  CurrencyInput,
  NumberInput,
  Checkbox,
  Switch,
  TextArea,
} from '../index';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { useProducts } from '@/hooks/products/useProducts';
import { Customer } from '@/types/models/customer';
import { Product } from '@/types/models/product';
import { Column } from '../data/DataTable';
import { Edit, Trash2, Eye, Plus } from 'lucide-react';

/**
 * Example: Customer Management Page
 * Demonstrates migration from JS to TypeScript components
 */
export const CustomerManagementExample: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([]);
  
  // Use typed React Query hook
  const { data, isLoading, refetch } = useCustomers({
    page: currentPage,
    page_size: pageSize,
    query: searchQuery,
  });
  
  const customers = data?.data || [];
  const totalItems = data?.meta?.pagination?.total_items || 0;
  
  // Define typed columns
  const columns: Column<Customer>[] = [
    {
      key: 'customer_code',
      header: 'Code',
      width: 100,
    },
    {
      key: 'customer_name',
      header: 'Customer Name',
      sortable: true,
    },
    {
      key: 'contact_info',
      header: 'Contact',
      accessor: (row) => (
        <div>
          <p className="text-sm">{row.contact_info?.primary_phone || row.phone || 'N/A'}</p>
          {(row.contact_info?.email || row.email) && (
            <p className="text-xs text-gray-500">{row.contact_info?.email || row.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'outstanding_balance',
      header: 'Outstanding',
      align: 'right',
      sortable: true,
      accessor: (row) => {
        const outstanding = row.outstanding_balance ?? row.current_outstanding ?? 0;
        return (
          <span className={outstanding > 0 ? 'text-red-600' : ''}>
            ₹{outstanding.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      accessor: (row) => (
        <StatusBadge 
          status={row.status || 'active'} 
          size="sm"
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      sortable: false,
      accessor: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button size="xs" variant="ghost">
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="xs" variant="ghost">
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="xs" variant="ghost">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Customer Management"
          subtitle="Manage your customers and their information"
          action={
            <Button leftIcon={<Plus className="w-4 h-4" />}>
              Add Customer
            </Button>
          }
        />
        
        <DataTable
          data={customers}
          columns={columns}
          keyField="customer_id"
          
          // Selection
          selectable
          selectedRows={selectedCustomers}
          onSelectionChange={setSelectedCustomers}
          
          // Pagination
          paginated
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          
          // Search
          searchable
          searchPlaceholder="Search customers..."
          onSearch={setSearchQuery}
          
          // Actions
          onRefresh={() => refetch()}
          onExport={() => console.log('Export customers')}
          
          // Loading
          loading={isLoading}
          emptyMessage="No customers found"
        />
      </Card>
    </div>
  );
};

/**
 * Example: Product Form
 * Shows form components with TypeScript
 */
export const ProductFormExample: React.FC = () => {
  const [formData, setFormData] = useState({
    productName: '',
    manufacturer: '',
    category: '',
    hsnCode: '',
    mrp: 0,
    salePrice: 0,
    gstPercent: 18,
    description: '',
    requiresPrescription: false,
    isActive: true,
  });
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const categoryOptions = [
    { value: 'medicine', label: 'Medicine' },
    { value: 'surgical', label: 'Surgical' },
    { value: 'cosmetic', label: 'Cosmetic' },
    { value: 'ayurvedic', label: 'Ayurvedic' },
  ];
  
  const gstOptions = [
    { value: 0, label: '0%' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' },
  ];
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Create New Product" />
        
        <form className="space-y-4 p-6">
          {/* Search Components */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomerSearch
              value={selectedCustomer}
              onChange={setSelectedCustomer}
              placeholder="Search and select supplier..."
              displayMode="dropdown"
            />
            
            <ProductSearch
              value={selectedProduct}
              onChange={setSelectedProduct}
              placeholder="Search similar products..."
              displayMode="dropdown"
              showStockInfo={false}
            />
          </div>
          
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Product Name"
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
              required
            />
            
            <Input
              label="Manufacturer"
              value={formData.manufacturer}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              required
            />
            
            <Select
              label="Category"
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value as string })}
              options={categoryOptions}
              placeholder="Select category"
            />
            
            <Input
              label="HSN Code"
              value={formData.hsnCode}
              onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
              helperText="Enter 4, 6, or 8 digit HSN code"
            />
          </div>
          
          {/* Pricing Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CurrencyInput
              label="MRP"
              value={formData.mrp}
              onChange={(value) => setFormData({ ...formData, mrp: value || 0 })}
            />
            
            <CurrencyInput
              label="Sale Price"
              value={formData.salePrice}
              onChange={(value) => setFormData({ ...formData, salePrice: value || 0 })}
            />
            
            <Select
              label="GST %"
              value={String(formData.gstPercent)}
              onChange={(value) => setFormData({ ...formData, gstPercent: Number(value) })}
              options={gstOptions}
            />
          </div>
          
          {/* Description */}
          <TextArea
            label="Product Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            showCharCount
            maxLength={500}
          />
          
          {/* Settings */}
          <div className="space-y-3">
            <Checkbox
              label="Requires Prescription"
              checked={formData.requiresPrescription}
              onChange={(e) => setFormData({ ...formData, requiresPrescription: e.target.checked })}
              helperText="Check if this product requires a doctor's prescription"
            />
            
            <Switch
              label="Active Status"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              helperText="Inactive products won't be available for sale"
            />
          </div>
          
          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline">Cancel</Button>
            <Button type="submit">Create Product</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

/**
 * Example: Stock Adjustment
 * Shows NumberInput and other components
 */
export const StockAdjustmentExample: React.FC = () => {
  const [adjustment, setAdjustment] = useState({
    quantity: 0,
    reason: '',
  });
  
  return (
    <Card>
      <CardHeader title="Stock Adjustment" />
      
      <div className="p-6 space-y-4">
        <NumberInput
          label="Adjustment Quantity"
          value={adjustment.quantity}
          onChange={(value) => setAdjustment({ ...adjustment, quantity: value || 0 })}
          min={-1000}
          max={1000}
          step={1}
          helperText="Positive for addition, negative for removal"
          showStepper
        />
        
        <TextArea
          label="Reason for Adjustment"
          value={adjustment.reason}
          onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
          required
          rows={3}
        />
        
        <Button fullWidth>Apply Adjustment</Button>
      </div>
    </Card>
  );
};