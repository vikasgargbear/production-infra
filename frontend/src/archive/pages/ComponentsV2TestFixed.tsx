/**
 * Components V2 Test Page - Fixed Version
 * Comprehensive test of all TypeScript v2 components
 */

import React, { useState } from 'react';

// Search Components
import { CustomerSearch } from '../components-v2/customers/CustomerSearch';
import { ProductSearch } from '../components-v2/products/ProductSearch';

// Common UI Components
import { Button } from '../components-v2/common/Button';
import { Input } from '../components-v2/common/Input';
import { Select } from '../components-v2/common/Select';
import { NumberInput } from '../components-v2/common/NumberInput';
import { CurrencyInput } from '../components-v2/common/CurrencyInput';
import { Checkbox } from '../components-v2/common/Checkbox';
import { Switch } from '../components-v2/common/Switch';
import { TextArea } from '../components-v2/common/TextArea';
import { Card, CardHeader } from '../components-v2/common/Card';
import { Radio, RadioGroup } from '../components-v2/common/Radio';
import { DatePicker } from '../components-v2/common/DatePicker';
import { Modal } from '../components-v2/common/Modal';
import { Alert } from '../components-v2/common/Alert';
import { Spinner } from '../components-v2/common/Spinner';
import { Badge } from '../components-v2/common/Badge';
import { Progress } from '../components-v2/common/Progress';
import { Tooltip } from '../components-v2/common/Tooltip';
import { Dropdown } from '../components-v2/common/Dropdown';

// Data Components
import { DataTable } from '../components-v2/data/DataTable';
import { StatusBadge } from '../components-v2/data/StatusBadge';

// Types
import type { Column } from '../components-v2/data/DataTable';
import type { RadioOption } from '../components-v2/common/Radio';
import type { Option as MultiSelectOption } from '../components-v2/common/Select';

import { Customer } from '../types/models/customer';
import { Product } from '../types/models/product';
import { 
  Home, Settings, Users, Package, ShoppingCart, 
  FileText, Download, RefreshCw, Plus, Edit, Trash2 
} from 'lucide-react';

export const ComponentsV2Test: React.FC = () => {
  // State for form components
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [textInput, setTextInput] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [numberValue, setNumberValue] = useState<number | undefined>(100);
  const [currencyValue, setCurrencyValue] = useState<number | undefined>(1500.50);
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [switchValue, setSwitchValue] = useState(true);
  const [textAreaValue, setTextAreaValue] = useState('');
  const [radioValue, setRadioValue] = useState('option1');
  const [dateValue, setDateValue] = useState<Date | null>(new Date());
  const [multiSelectValue, setMultiSelectValue] = useState<string[]>(['option1', 'option3']);
  
  // State for dialogs
  const [showModal, setShowModal] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info'>('success');
  
  // Sample data for tables
  const sampleCustomers: Customer[] = [
    {
      customer_id: 1,
      customer_code: 'CUST001',
      customer_name: 'ABC Pharmacy',
      customer_type: 'b2b',
      phone: '9876543210',
      email: 'abc@pharmacy.com',
      gst_number: '27AABCP1234L1Z5',
      current_outstanding: 25000,
      credit_limit: 50000,
      credit_days: 30,
      billing_address: {
        street: '123 Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      },
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      customer_id: 2,
      customer_code: 'CUST002',
      customer_name: 'John Doe',
      customer_type: 'b2c',
      phone: '9876543211',
      current_outstanding: 0,
      credit_limit: 0,
      credit_days: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  const tableColumns: Column<Customer>[] = [
    { key: 'customer_code', header: 'Code', sortable: true },
    { key: 'customer_name', header: 'Name', sortable: true },
    { key: 'phone', header: 'Phone' },
    { 
      key: 'customer_type', 
      header: 'Type',
      render: (value) => <Badge variant={value === 'b2b' ? 'primary' : 'secondary'}>{value.toUpperCase()}</Badge>
    },
    {
      key: 'current_outstanding',
      header: 'Outstanding',
      sortable: true,
      render: (value) => `₹${(value || 0).toLocaleString()}`
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />
    }
  ];

  const selectOptions: MultiSelectOption[] = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
    { value: 'option4', label: 'Option 4' },
  ];

  const radioOptions: RadioOption[] = [
    { value: 'option1', label: 'Radio Option 1' },
    { value: 'option2', label: 'Radio Option 2' },
    { value: 'option3', label: 'Radio Option 3' },
  ];

  const [activeTab, setActiveTab] = useState('search');

  // Simple tab navigation
  const tabs = [
    { id: 'search', label: 'Search Components', icon: <Home className="w-4 h-4" /> },
    { id: 'forms', label: 'Form Components', icon: <Settings className="w-4 h-4" /> },
    { id: 'display', label: 'Display Components', icon: <Package className="w-4 h-4" /> },
    { id: 'data', label: 'Data Components', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardHeader
            title="V2 Components Test"
            subtitle="TypeScript components with full type safety"
            action={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAlert(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Test Alert
                </Button>
              </div>
            }
          />
          
          <div className="p-6">
            {/* Simple tab navigation */}
            <div className="flex space-x-1 border-b border-gray-200 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm
                    ${activeTab === tab.id 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Search Components */}
            {activeTab === 'search' && (
              <div className="space-y-8 mt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Customer Search</h3>
                    <CustomerSearch
                      value={selectedCustomer}
                      onChange={setSelectedCustomer}
                      placeholder="Search customers..."
                    />
                    {selectedCustomer && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm">
                          <strong>Selected:</strong> {selectedCustomer.customer_name} ({selectedCustomer.customer_code})
                        </p>
                        <p className="text-sm text-gray-600">
                          Phone: {selectedCustomer.phone} | Outstanding: ₹{selectedCustomer.current_outstanding || 0}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Product Search</h3>
                    <ProductSearch
                      value={selectedProduct}
                      onChange={setSelectedProduct}
                      placeholder="Search products..."
                    />
                    {selectedProduct && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg">
                        <p className="text-sm">
                          <strong>Selected:</strong> {selectedProduct.product_name}
                        </p>
                        <p className="text-sm text-gray-600">
                          MRP: ₹{selectedProduct.mrp} | Stock: {selectedProduct.current_stock || 0}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Form Components */}
            {activeTab === 'forms' && (
              <div className="space-y-8 mt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Input
                      label="Text Input"
                      placeholder="Enter text..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      helperText="This is a helper text"
                    />
                    
                    <NumberInput
                      label="Number Input"
                      value={numberValue}
                      onChange={setNumberValue}
                      min={0}
                      max={1000}
                      step={10}
                    />
                    
                    <CurrencyInput
                      label="Currency Input"
                      value={currencyValue}
                      onChange={setCurrencyValue}
                      currency="INR"
                    />
                    
                    <Select
                      label="Select"
                      options={selectOptions}
                      value={selectValue}
                      onChange={(value) => setSelectValue(value as string)}
                      placeholder="Select an option..."
                    />
                    
                    <Select
                      label="Multi Select"
                      options={selectOptions}
                      value={multiSelectValue}
                      onChange={(value) => setMultiSelectValue(value as string[])}
                      multiple
                      placeholder="Select multiple options..."
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <DatePicker
                      label="Date Picker"
                      value={dateValue}
                      onChange={setDateValue}
                    />
                    
                    <TextArea
                      label="Text Area"
                      placeholder="Enter description..."
                      value={textAreaValue}
                      onChange={(e) => setTextAreaValue(e.target.value)}
                      rows={4}
                    />
                    
                    <RadioGroup
                      name="radioGroup"
                      label="Radio Group"
                      options={radioOptions}
                      value={radioValue}
                      onChange={setRadioValue}
                    />
                    
                    <div className="space-y-3">
                      <Checkbox
                        label="Checkbox"
                        checked={checkboxValue}
                        onChange={(e) => setCheckboxValue(e.target.checked)}
                      />
                      
                      <Switch
                        label="Switch"
                        checked={switchValue}
                        onChange={(e) => setSwitchValue(e.target.checked)}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setShowModal(true)}>Open Modal</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button loading>Loading</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </div>
            )}
            
            {/* Display Components */}
            {activeTab === 'display' && (
              <div className="space-y-8 mt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Badges</h3>
                      <div className="flex flex-wrap gap-2">
                        <Badge>Default</Badge>
                        <Badge variant="primary">Primary</Badge>
                        <Badge variant="secondary">Secondary</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="error">Error</Badge>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Progress</h3>
                      <div className="space-y-4">
                        <Progress value={75} label="Loading..." />
                        <Progress value={50} variant="success" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Spinners</h3>
                      <div className="flex items-center gap-4">
                        <Spinner size="sm" />
                        <Spinner size="md" />
                        <Spinner size="lg" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Alerts</h3>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAlertType('success');
                            setShowAlert(true);
                          }}
                        >
                          Success Alert
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAlertType('error');
                            setShowAlert(true);
                          }}
                        >
                          Error Alert
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAlertType('warning');
                            setShowAlert(true);
                          }}
                        >
                          Warning Alert
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAlertType('info');
                            setShowAlert(true);
                          }}
                        >
                          Info Alert
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Tooltips</h3>
                      <div className="flex gap-4">
                        <Tooltip content="This is a tooltip">
                          <Button variant="outline" size="sm">Hover me</Button>
                        </Tooltip>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Dropdown</h3>
                      <Dropdown
                        trigger={<Button variant="outline">Options</Button>}
                        items={[
                          { id: 'edit', label: 'Edit' },
                          { id: 'download', label: 'Download' },
                          { id: 'delete', label: 'Delete', variant: 'danger' as const },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Data Components */}
            {activeTab === 'data' && (
              <div className="space-y-8 mt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Data Table</h3>
                  <DataTable<Customer>
                    columns={tableColumns}
                    data={sampleCustomers}
                    searchable
                    paginated
                    pageSize={10}
                    keyField="customer_id"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
        
        {/* Modals */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Sample Modal"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowModal(false)}>
                Save Changes
              </Button>
            </div>
          }
        >
          <p>This is a modal dialog. You can put any content here.</p>
          <p className="mt-2 text-gray-600">
            Click outside or press ESC to close.
          </p>
        </Modal>
        
        {showAlert && (
          <Alert
            type={alertType}
            title={`${alertType.charAt(0).toUpperCase() + alertType.slice(1)} Alert`}
            message="This is an alert message. It will disappear after 5 seconds."
            onClose={() => setShowAlert(false)}
          />
        )}
      </div>
    </div>
  );
};

export default ComponentsV2Test;