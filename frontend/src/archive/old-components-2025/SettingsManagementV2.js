import React, { useState, useEffect } from 'react';
import { 
  Settings, Building2, Users, Bell, Shield, Palette, 
  Database, CreditCard, Package, Globe, Key, Save,
  ChevronRight, Upload, X, Check, AlertTriangle,
  FileText, Mail, Phone, MapPin, Eye, EyeOff,
  Lock, Unlock, Edit2, Trash2, Plus, RefreshCw
} from 'lucide-react';
import { ModuleHeader } from '../global';
import { settingsApi, usersApi } from '../../services/api';

const SettingsManagementV2 = () => {
  const [activeSection, setActiveSection] = useState('company');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Company Settings State
  const [companySettings, setCompanySettings] = useState({
    companyName: localStorage.getItem('companyName') || '',
    companyAddress: localStorage.getItem('companyAddress') || '',
    companyGST: localStorage.getItem('companyGST') || '',
    companyDL: localStorage.getItem('companyDL') || '',
    companyState: localStorage.getItem('companyState') || '',
    companyLogo: localStorage.getItem('companyLogo') || '',
    companyPhone: localStorage.getItem('companyPhone') || '',
    companyEmail: localStorage.getItem('companyEmail') || '',
    companyWebsite: localStorage.getItem('companyWebsite') || '',
    // Bank Details
    bankName: localStorage.getItem('bankName') || '',
    accountNumber: localStorage.getItem('accountNumber') || '',
    ifscCode: localStorage.getItem('ifscCode') || '',
    branchName: localStorage.getItem('branchName') || '',
    // Digital Signature
    digitalSignature: localStorage.getItem('digitalSignature') || ''
  });

  // Business Settings State
  const [businessSettings, setBusinessSettings] = useState({
    // Invoice Settings
    invoicePrefix: localStorage.getItem('invoicePrefix') || 'INV',
    invoiceStartNumber: localStorage.getItem('invoiceStartNumber') || '1001',
    enableAutoInvoiceNumber: localStorage.getItem('enableAutoInvoiceNumber') === 'true',
    invoiceTerms: localStorage.getItem('invoiceTerms') || '',
    // Tax Settings
    defaultTaxRate: localStorage.getItem('defaultTaxRate') || '18',
    enableCompositeScheme: localStorage.getItem('enableCompositeScheme') === 'true',
    // Inventory Settings
    enableBatchTracking: localStorage.getItem('enableBatchTracking') === 'true',
    enableExpiryTracking: localStorage.getItem('enableExpiryTracking') === 'true',
    lowStockAlertDays: localStorage.getItem('lowStockAlertDays') || '30',
    expiryAlertDays: localStorage.getItem('expiryAlertDays') || '90',
    // Payment Settings
    defaultPaymentTerms: localStorage.getItem('defaultPaymentTerms') || '30',
    enableCreditLimit: localStorage.getItem('enableCreditLimit') === 'true',
    // General
    financialYearStart: localStorage.getItem('financialYearStart') || '04-01',
    dateFormat: localStorage.getItem('dateFormat') || 'DD/MM/YYYY',
    currency: localStorage.getItem('currency') || 'INR'
  });

  // Notification Settings State
  const [notificationSettings, setNotificationSettings] = useState({
    // Email Notifications
    emailNotifications: localStorage.getItem('emailNotifications') === 'true',
    lowStockEmail: localStorage.getItem('lowStockEmail') === 'true',
    expiryAlertEmail: localStorage.getItem('expiryAlertEmail') === 'true',
    paymentReminderEmail: localStorage.getItem('paymentReminderEmail') === 'true',
    // App Notifications
    appNotifications: localStorage.getItem('appNotifications') === 'true',
    orderNotifications: localStorage.getItem('orderNotifications') === 'true',
    stockNotifications: localStorage.getItem('stockNotifications') === 'true',
    // SMS Notifications (if applicable)
    smsNotifications: localStorage.getItem('smsNotifications') === 'true',
    orderSMS: localStorage.getItem('orderSMS') === 'true',
    paymentSMS: localStorage.getItem('paymentSMS') === 'true'
  });

  // User Management State
  const [users, setUsers] = useState([]);
  const [userFormData, setUserFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'staff',
    password: '',
    confirmPassword: '',
    modules: [],
    permissions: {}
  });

  // Security Settings State
  const [securitySettings, setSecuritySettings] = useState({
    requireStrongPassword: localStorage.getItem('requireStrongPassword') === 'true',
    sessionTimeout: localStorage.getItem('sessionTimeout') || '30',
    enableTwoFactor: localStorage.getItem('enableTwoFactor') === 'true',
    passwordExpiry: localStorage.getItem('passwordExpiry') || '90',
    maxLoginAttempts: localStorage.getItem('maxLoginAttempts') || '5',
    enableAuditLog: localStorage.getItem('enableAuditLog') === 'true'
  });

  // Settings sections configuration
  const settingsSections = [
    {
      id: 'company',
      title: 'Company Profile',
      icon: Building2,
      description: 'Basic company information and branding'
    },
    {
      id: 'business',
      title: 'Business Settings',
      icon: Package,
      description: 'Invoice, tax, and inventory settings'
    },
    {
      id: 'users',
      title: 'User Management',
      icon: Users,
      description: 'Manage users and permissions'
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      description: 'Email, SMS, and app notifications'
    },
    {
      id: 'security',
      title: 'Security',
      icon: Shield,
      description: 'Password policies and security settings'
    },
    {
      id: 'integrations',
      title: 'Integrations',
      icon: Globe,
      description: 'Third-party integrations and APIs'
    },
    {
      id: 'backup',
      title: 'Backup & Data',
      icon: Database,
      description: 'Data backup and export settings'
    }
  ];

  // Available modules for user permissions
  const modules = [
    { id: 'sales', name: 'Sales', icon: '💰' },
    { id: 'purchase', name: 'Purchase', icon: '🛒' },
    { id: 'inventory', name: 'Inventory', icon: '📦' },
    { id: 'customers', name: 'Customers', icon: '👥' },
    { id: 'products', name: 'Products', icon: '📦' },
    { id: 'reports', name: 'Reports', icon: '📊' },
    { id: 'gst', name: 'GST', icon: '🧮' },
    { id: 'settings', name: 'Settings', icon: '⚙️' }
  ];

  // Roles configuration
  const roles = [
    { value: 'admin', label: 'Administrator', color: 'red' },
    { value: 'manager', label: 'Manager', color: 'blue' },
    { value: 'staff', label: 'Staff', color: 'green' },
    { value: 'readonly', label: 'Read Only', color: 'gray' }
  ];

  // Fetch users on component mount
  useEffect(() => {
    if (activeSection === 'users') {
      fetchUsers();
    }
  }, [activeSection]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Simulate API call - replace with actual API
      const mockUsers = [
        {
          id: 1,
          username: 'admin',
          fullName: 'Administrator',
          email: 'admin@pharma.com',
          phone: '9876543210',
          role: 'admin',
          status: 'active',
          lastLogin: new Date().toISOString(),
          modules: modules.map(m => m.id),
          permissions: {}
        }
      ];
      setUsers(mockUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage('Failed to load users');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // Handle file uploads
  const handleFileUpload = (field, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanySettings({
          ...companySettings,
          [field]: reader.result
        });
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save settings based on active section
  const handleSaveSettings = () => {
    setLoading(true);
    try {
      switch (activeSection) {
        case 'company':
          Object.entries(companySettings).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
          break;
        case 'business':
          Object.entries(businessSettings).forEach(([key, value]) => {
            localStorage.setItem(key, value.toString());
          });
          break;
        case 'notifications':
          Object.entries(notificationSettings).forEach(([key, value]) => {
            localStorage.setItem(key, value.toString());
          });
          break;
        case 'security':
          Object.entries(securitySettings).forEach(([key, value]) => {
            localStorage.setItem(key, value.toString());
          });
          break;
      }
      
      setMessage('Settings saved successfully');
      setMessageType('success');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings');
      setMessageType('error');
    } finally {
      setLoading(false);
      setTimeout(() => {
        setMessage('');
      }, 3000);
    }
  };

  // Handle user form submission
  const handleUserSubmit = (e) => {
    e.preventDefault();
    
    if (userFormData.password !== userFormData.confirmPassword) {
      setMessage('Passwords do not match');
      setMessageType('error');
      return;
    }
    
    if (editingUser) {
      // Update existing user
      setUsers(users.map(u => 
        u.id === editingUser.id 
          ? { ...u, ...userFormData, id: u.id }
          : u
      ));
      setMessage('User updated successfully');
    } else {
      // Add new user
      const newUser = {
        ...userFormData,
        id: Date.now(),
        status: 'active',
        lastLogin: null
      };
      setUsers([...users, newUser]);
      setMessage('User created successfully');
    }
    
    setMessageType('success');
    resetUserForm();
  };

  const resetUserForm = () => {
    setUserFormData({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'staff',
      password: '',
      confirmPassword: '',
      modules: [],
      permissions: {}
    });
    setEditingUser(null);
    setShowPasswordModal(false);
  };

  // Render settings content based on active section
  const renderSettingsContent = () => {
    switch (activeSection) {
      case 'company':
        return renderCompanySettings();
      case 'business':
        return renderBusinessSettings();
      case 'users':
        return renderUserManagement();
      case 'notifications':
        return renderNotificationSettings();
      case 'security':
        return renderSecuritySettings();
      case 'integrations':
        return renderIntegrationsSettings();
      case 'backup':
        return renderBackupSettings();
      default:
        return null;
    }
  };

  // Render Company Settings
  const renderCompanySettings = () => (
    <div className="space-y-6">
      {/* Logo Upload */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Logo</h3>
        <div className="flex items-center gap-6">
          {companySettings.companyLogo ? (
            <img 
              src={companySettings.companyLogo} 
              alt="Company Logo" 
              className="h-24 w-auto object-contain border border-gray-200 rounded-lg p-2"
            />
          ) : (
            <div className="h-24 w-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
          )}
          <div>
            <input
              type="file"
              id="logo-upload"
              accept="image/*"
              onChange={(e) => handleFileUpload('companyLogo', e.target.files[0])}
              className="hidden"
            />
            <label
              htmlFor="logo-upload"
              className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Logo
            </label>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
          </div>
        </div>
      </div>

      {/* Basic Information */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companySettings.companyName}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, companyName: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Enter company name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GSTIN
            </label>
            <input
              type="text"
              value={companySettings.companyGST}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, companyGST: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="27AAAAA0000A1Z5"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Drug License Number
            </label>
            <input
              type="text"
              value={companySettings.companyDL}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, companyDL: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="MH-MUM-123456"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <select
              value={companySettings.companyState}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, companyState: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select State</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Delhi">Delhi</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="West Bengal">West Bengal</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Uttar Pradesh">Uttar Pradesh</option>
            </select>
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Address
            </label>
            <textarea
              value={companySettings.companyAddress}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, companyAddress: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="2"
              placeholder="Enter complete address"
            />
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={companySettings.companyPhone}
                onChange={(e) => {
                  setCompanySettings({ ...companySettings, companyPhone: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="9876543210"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={companySettings.companyEmail}
                onChange={(e) => {
                  setCompanySettings({ ...companySettings, companyEmail: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="info@company.com"
              />
            </div>
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={companySettings.companyWebsite}
                onChange={(e) => {
                  setCompanySettings({ ...companySettings, companyWebsite: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="https://www.company.com"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bank Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name
            </label>
            <input
              type="text"
              value={companySettings.bankName}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, bankName: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="State Bank of India"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Number
            </label>
            <input
              type="text"
              value={companySettings.accountNumber}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, accountNumber: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="1234567890"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IFSC Code
            </label>
            <input
              type="text"
              value={companySettings.ifscCode}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, ifscCode: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="SBIN0001234"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch Name
            </label>
            <input
              type="text"
              value={companySettings.branchName}
              onChange={(e) => {
                setCompanySettings({ ...companySettings, branchName: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Main Branch"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Render Business Settings
  const renderBusinessSettings = () => (
    <div className="space-y-6">
      {/* Invoice Settings */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Prefix
            </label>
            <input
              type="text"
              value={businessSettings.invoicePrefix}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, invoicePrefix: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="INV"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Starting Number
            </label>
            <input
              type="number"
              value={businessSettings.invoiceStartNumber}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, invoiceStartNumber: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="1001"
            />
          </div>
          
          <div className="col-span-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={businessSettings.enableAutoInvoiceNumber}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, enableAutoInvoiceNumber: e.target.checked });
                  setHasChanges(true);
                }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Enable automatic invoice numbering</span>
            </label>
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Invoice Terms
            </label>
            <textarea
              value={businessSettings.invoiceTerms}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, invoiceTerms: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Enter default terms and conditions"
            />
          </div>
        </div>
      </div>

      {/* Tax Settings */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default GST Rate (%)
            </label>
            <select
              value={businessSettings.defaultTaxRate}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, defaultTaxRate: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={businessSettings.enableCompositeScheme}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, enableCompositeScheme: e.target.checked });
                  setHasChanges(true);
                }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Enable Composite Scheme</span>
            </label>
          </div>
        </div>
      </div>

      {/* Inventory Settings */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Settings</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={businessSettings.enableBatchTracking}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, enableBatchTracking: e.target.checked });
                  setHasChanges(true);
                }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Enable Batch Tracking</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={businessSettings.enableExpiryTracking}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, enableExpiryTracking: e.target.checked });
                  setHasChanges(true);
                }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Enable Expiry Date Tracking</span>
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Low Stock Alert (Days)
              </label>
              <input
                type="number"
                value={businessSettings.lowStockAlertDays}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, lowStockAlertDays: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="30"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiry Alert (Days)
              </label>
              <input
                type="number"
                value={businessSettings.expiryAlertDays}
                onChange={(e) => {
                  setBusinessSettings({ ...businessSettings, expiryAlertDays: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="90"
              />
            </div>
          </div>
        </div>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Financial Year Start
            </label>
            <select
              value={businessSettings.financialYearStart}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, financialYearStart: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="01-01">January</option>
              <option value="04-01">April</option>
              <option value="07-01">July</option>
              <option value="10-01">October</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Format
            </label>
            <select
              value={businessSettings.dateFormat}
              onChange={(e) => {
                setBusinessSettings({ ...businessSettings, dateFormat: e.target.value });
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  // Render User Management
  const renderUserManagement = () => (
    <div className="space-y-6">
      {/* Add User Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowPasswordModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modules</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                      <p className="text-xs text-gray-500">@{user.username}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${roles.find(r => r.value === user.role)?.color || 'gray'}-100 text-${roles.find(r => r.value === user.role)?.color || 'gray'}-800`}>
                      <Shield className="w-3 h-3 mr-1" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.status === 'active' ? (
                        <>
                          <Unlock className="w-3 h-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.modules.slice(0, 3).map(moduleId => {
                        const module = modules.find(m => m.id === moduleId);
                        return module ? (
                          <span key={moduleId} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {module.icon} {module.name}
                          </span>
                        ) : null;
                      })}
                      {user.modules.length > 3 && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          +{user.modules.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setUserFormData({
                            username: user.username,
                            fullName: user.fullName,
                            email: user.email,
                            phone: user.phone,
                            role: user.role,
                            password: '',
                            confirmPassword: '',
                            modules: user.modules,
                            permissions: user.permissions
                          });
                          setShowPasswordModal(true);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this user?')) {
                            setUsers(users.filter(u => u.id !== user.id));
                            setMessage('User deleted successfully');
                            setMessageType('success');
                          }
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Form Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button
                  onClick={resetUserForm}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleUserSubmit} className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={userFormData.username}
                      onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                      disabled={editingUser}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={userFormData.fullName}
                      onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={userFormData.email}
                      onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={userFormData.phone}
                      onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {roles.map(role => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!editingUser && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={userFormData.password}
                        onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={userFormData.confirmPassword}
                        onChange={(e) => setUserFormData({ ...userFormData, confirmPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Module Access</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {modules.map(module => (
                      <label key={module.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={userFormData.modules.includes(module.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserFormData({
                                ...userFormData,
                                modules: [...userFormData.modules, module.id]
                              });
                            } else {
                              setUserFormData({
                                ...userFormData,
                                modules: userFormData.modules.filter(m => m !== module.id)
                              });
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">
                          {module.icon} {module.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // Render Notification Settings
  const renderNotificationSettings = () => (
    <div className="space-y-6">
      {/* Email Notifications */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Enable Email Notifications</span>
              <p className="text-xs text-gray-500">Receive important updates via email</p>
            </div>
            <input
              type="checkbox"
              checked={notificationSettings.emailNotifications}
              onChange={(e) => {
                setNotificationSettings({ ...notificationSettings, emailNotifications: e.target.checked });
                setHasChanges(true);
              }}
              className="rounded border-gray-300"
            />
          </label>
          
          {notificationSettings.emailNotifications && (
            <div className="ml-6 space-y-3 border-l-2 border-gray-200 pl-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={notificationSettings.lowStockEmail}
                  onChange={(e) => {
                    setNotificationSettings({ ...notificationSettings, lowStockEmail: e.target.checked });
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Low Stock Alerts</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={notificationSettings.expiryAlertEmail}
                  onChange={(e) => {
                    setNotificationSettings({ ...notificationSettings, expiryAlertEmail: e.target.checked });
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Expiry Date Alerts</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={notificationSettings.paymentReminderEmail}
                  onChange={(e) => {
                    setNotificationSettings({ ...notificationSettings, paymentReminderEmail: e.target.checked });
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Payment Reminders</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* App Notifications */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">App Notifications</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Enable App Notifications</span>
              <p className="text-xs text-gray-500">Show notifications within the application</p>
            </div>
            <input
              type="checkbox"
              checked={notificationSettings.appNotifications}
              onChange={(e) => {
                setNotificationSettings({ ...notificationSettings, appNotifications: e.target.checked });
                setHasChanges(true);
              }}
              className="rounded border-gray-300"
            />
          </label>
          
          {notificationSettings.appNotifications && (
            <div className="ml-6 space-y-3 border-l-2 border-gray-200 pl-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={notificationSettings.orderNotifications}
                  onChange={(e) => {
                    setNotificationSettings({ ...notificationSettings, orderNotifications: e.target.checked });
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">New Order Notifications</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={notificationSettings.stockNotifications}
                  onChange={(e) => {
                    setNotificationSettings({ ...notificationSettings, stockNotifications: e.target.checked });
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Stock Movement Alerts</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render Security Settings
  const renderSecuritySettings = () => (
    <div className="space-y-6">
      {/* Password Policies */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Password Policies</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Require Strong Passwords</span>
              <p className="text-xs text-gray-500">Minimum 8 characters with mixed case and numbers</p>
            </div>
            <input
              type="checkbox"
              checked={securitySettings.requireStrongPassword}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, requireStrongPassword: e.target.checked });
                setHasChanges(true);
              }}
              className="rounded border-gray-300"
            />
          </label>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password Expiry (Days)
            </label>
            <input
              type="number"
              value={securitySettings.passwordExpiry}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, passwordExpiry: e.target.value });
                setHasChanges(true);
              }}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="90"
            />
          </div>
        </div>
      </div>

      {/* Session Settings */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Timeout (Minutes)
            </label>
            <input
              type="number"
              value={securitySettings.sessionTimeout}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, sessionTimeout: e.target.value });
                setHasChanges(true);
              }}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="30"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Login Attempts
            </label>
            <input
              type="number"
              value={securitySettings.maxLoginAttempts}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, maxLoginAttempts: e.target.value });
                setHasChanges(true);
              }}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="5"
            />
          </div>
        </div>
      </div>

      {/* Additional Security */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Security</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Enable Two-Factor Authentication</span>
              <p className="text-xs text-gray-500">Require OTP for login</p>
            </div>
            <input
              type="checkbox"
              checked={securitySettings.enableTwoFactor}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, enableTwoFactor: e.target.checked });
                setHasChanges(true);
              }}
              className="rounded border-gray-300"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Enable Audit Log</span>
              <p className="text-xs text-gray-500">Track all user activities</p>
            </div>
            <input
              type="checkbox"
              checked={securitySettings.enableAuditLog}
              onChange={(e) => {
                setSecuritySettings({ ...securitySettings, enableAuditLog: e.target.checked });
                setHasChanges(true);
              }}
              className="rounded border-gray-300"
            />
          </label>
        </div>
      </div>
    </div>
  );

  // Render Integrations Settings (Placeholder)
  const renderIntegrationsSettings = () => (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <div className="text-center py-12">
        <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Integrations Coming Soon</h3>
        <p className="text-sm text-gray-500">Connect with payment gateways, SMS providers, and more</p>
      </div>
    </div>
  );

  // Render Backup Settings (Placeholder)
  const renderBackupSettings = () => (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <div className="text-center py-12">
        <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Backup & Export</h3>
        <p className="text-sm text-gray-500 mb-6">Download your data or create backups</p>
        <div className="flex justify-center gap-4">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Export Data
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Create Backup
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Settings"
        icon={Settings}
        iconColor="text-gray-600"
        actions={[
          {
            label: "Save Changes",
            onClick: handleSaveSettings,
            icon: Save,
            variant: "primary",
            disabled: !hasChanges || loading
          }
        ]}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-medium">{section.title}</p>
                    <p className="text-xs text-gray-500">{section.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Message Display */}
          {message && (
            <div className="mx-6 mt-4">
              <div className={`p-3 rounded-lg flex items-center ${
                messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {messageType === 'success' ? <Check className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                {message}
              </div>
            </div>
          )}

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading settings...</p>
                </div>
              </div>
            ) : (
              renderSettingsContent()
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsManagementV2;