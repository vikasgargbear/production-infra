import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, RotateCcw, AlertCircle, Check,
  Store, Receipt, Package, FileText, Bell, 
  Shield, Database, Globe, Calculator, Loader2
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const SystemSettings = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    // General Settings
    general: {
      companyName: '',
      financialYear: '2024-25',
      dateFormat: 'DD/MM/YYYY',
      timeZone: 'Asia/Kolkata',
      currency: 'INR',
      currencySymbol: '₹',
      decimalPlaces: 2,
      quantityDecimalPlaces: 2
    },
    // Invoice Settings
    invoice: {
      prefix: 'INV',
      startNumber: 1,
      autoGenerate: true,
      showLogo: true,
      showTerms: true,
      defaultTerms: '',
      footerText: '',
      printCopies: 2
    },
    // Stock Settings
    stock: {
      enableNegativeStock: false,
      enableBatchTracking: true,
      enableExpiryTracking: true,
      lowStockAlert: true,
      expiryAlertDays: 30,
      enableSerialNumbers: false,
      autoUpdatePrices: false
    },
    // Tax Settings
    tax: {
      enableGST: true,
      gstNumber: '',
      defaultTaxRate: 18,
      taxInclusive: false,
      enableComposite: false,
      compositeRate: 0
    },
    // Notification Settings
    notifications: {
      lowStock: true,
      expiry: true,
      pendingPayments: true,
      newOrders: true,
      emailNotifications: false,
      smsNotifications: false,
      notificationEmail: '',
      notificationPhone: ''
    },
    // Security Settings
    security: {
      sessionTimeout: 30,
      enforcePasswordChange: true,
      passwordChangeDays: 90,
      minPasswordLength: 8,
      requireSpecialChar: true,
      enableTwoFactor: false,
      maxLoginAttempts: 5
    },
    // Backup Settings
    backup: {
      autoBackup: true,
      backupFrequency: 'daily',
      backupTime: '02:00',
      retentionDays: 30,
      backupLocation: 'cloud',
      emailBackupReport: false
    }
  });

  // Load settings on mount
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.system.getAll();
      console.log('System Settings API Response:', response);
      
      if (response?.data) {
        // Map API response to component state
        const apiSettings = response.data;
        setSettings(prev => ({
          ...prev,
          ...apiSettings
        }));
      } else {
        // Fallback to localStorage
        const savedSettings = localStorage.getItem('systemSettings');
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      }
    } catch (error) {
      console.error('Error loading system settings:', error);
      // Fallback to localStorage
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingChange = (category, field, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      // Save to backend
      const response = await settingsApi.system.update(settings);
      
      if (response.success || response.data) {
        setSuccessMessage('Settings saved successfully!');
        setHasChanges(false);
        
        // Also save to localStorage as backup
        localStorage.setItem('systemSettings', JSON.stringify(settings));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('Failed to save settings to server.');
      // Fallback to localStorage
      localStorage.setItem('systemSettings', JSON.stringify(settings));
      setSuccessMessage('Settings saved locally.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      // Reset to default values
      loadSettings();
      setHasChanges(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Store },
    { id: 'invoice', label: 'Invoice', icon: Receipt },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'tax', label: 'Tax', icon: Calculator },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'backup', label: 'Backup', icon: Database }
  ];

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">General Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={settings.general.companyName}
            onChange={(e) => handleSettingChange('general', 'companyName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Financial Year</label>
          <select
            value={settings.general.financialYear}
            onChange={(e) => handleSettingChange('general', 'financialYear', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="2023-24">2023-24</option>
            <option value="2024-25">2024-25</option>
            <option value="2025-26">2025-26</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
          <select
            value={settings.general.dateFormat}
            onChange={(e) => handleSettingChange('general', 'dateFormat', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time Zone</label>
          <select
            value={settings.general.timeZone}
            onChange={(e) => handleSettingChange('general', 'timeZone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="Asia/Dubai">Asia/Dubai (GST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={settings.general.currency}
              onChange={(e) => handleSettingChange('general', 'currency', e.target.value)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="INR"
            />
            <input
              type="text"
              value={settings.general.currencySymbol}
              onChange={(e) => handleSettingChange('general', 'currencySymbol', e.target.value)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="₹"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Decimal Places</label>
          <div className="flex space-x-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Amount</label>
              <input
                type="number"
                min="0"
                max="4"
                value={settings.general.decimalPlaces}
                onChange={(e) => handleSettingChange('general', 'decimalPlaces', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Quantity</label>
              <input
                type="number"
                min="0"
                max="4"
                value={settings.general.quantityDecimalPlaces}
                onChange={(e) => handleSettingChange('general', 'quantityDecimalPlaces', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInvoiceSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Prefix</label>
          <input
            type="text"
            value={settings.invoice.prefix}
            onChange={(e) => handleSettingChange('invoice', 'prefix', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Number</label>
          <input
            type="number"
            value={settings.invoice.startNumber}
            onChange={(e) => handleSettingChange('invoice', 'startNumber', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Print Copies</label>
          <input
            type="number"
            min="1"
            max="5"
            value={settings.invoice.printCopies}
            onChange={(e) => handleSettingChange('invoice', 'printCopies', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.invoice.autoGenerate}
              onChange={(e) => handleSettingChange('invoice', 'autoGenerate', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Auto-generate invoice numbers</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.invoice.showLogo}
              onChange={(e) => handleSettingChange('invoice', 'showLogo', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Show company logo</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.invoice.showTerms}
              onChange={(e) => handleSettingChange('invoice', 'showTerms', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Show terms & conditions</span>
          </label>
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Terms & Conditions</label>
          <textarea
            value={settings.invoice.defaultTerms}
            onChange={(e) => handleSettingChange('invoice', 'defaultTerms', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer Text</label>
          <input
            type="text"
            value={settings.invoice.footerText}
            onChange={(e) => handleSettingChange('invoice', 'footerText', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Thank you for your business!"
          />
        </div>
      </div>
    </div>
  );

  const renderStockSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Stock Settings</h3>
      
      <div className="space-y-4">
        <div className="space-y-3">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.enableNegativeStock}
              onChange={(e) => handleSettingChange('stock', 'enableNegativeStock', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Allow negative stock</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.enableBatchTracking}
              onChange={(e) => handleSettingChange('stock', 'enableBatchTracking', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable batch tracking</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.enableExpiryTracking}
              onChange={(e) => handleSettingChange('stock', 'enableExpiryTracking', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable expiry date tracking</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.lowStockAlert}
              onChange={(e) => handleSettingChange('stock', 'lowStockAlert', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable low stock alerts</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.enableSerialNumbers}
              onChange={(e) => handleSettingChange('stock', 'enableSerialNumbers', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable serial number tracking</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.stock.autoUpdatePrices}
              onChange={(e) => handleSettingChange('stock', 'autoUpdatePrices', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Auto-update prices from purchase</span>
          </label>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Alert Days</label>
            <input
              type="number"
              value={settings.stock.expiryAlertDays}
              onChange={(e) => handleSettingChange('stock', 'expiryAlertDays', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="30"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTaxSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Tax Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-3">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.tax.enableGST}
              onChange={(e) => handleSettingChange('tax', 'enableGST', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable GST</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.tax.taxInclusive}
              onChange={(e) => handleSettingChange('tax', 'taxInclusive', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Prices are tax inclusive</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.tax.enableComposite}
              onChange={(e) => handleSettingChange('tax', 'enableComposite', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable composite scheme</span>
          </label>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
          <input
            type="text"
            value={settings.tax.gstNumber}
            onChange={(e) => handleSettingChange('tax', 'gstNumber', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="29AABCT1332L1ZN"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax Rate (%)</label>
          <select
            value={settings.tax.defaultTaxRate}
            onChange={(e) => handleSettingChange('tax', 'defaultTaxRate', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={0}>0%</option>
            <option value={5}>5%</option>
            <option value={12}>12%</option>
            <option value={18}>18%</option>
            <option value={28}>28%</option>
          </select>
        </div>
        
        {settings.tax.enableComposite && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Composite Rate (%)</label>
            <input
              type="number"
              step="0.1"
              value={settings.tax.compositeRate}
              onChange={(e) => handleSettingChange('tax', 'compositeRate', parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>
      
      <div className="space-y-4">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Alert Types</h4>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.lowStock}
              onChange={(e) => handleSettingChange('notifications', 'lowStock', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Low stock alerts</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.expiry}
              onChange={(e) => handleSettingChange('notifications', 'expiry', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Expiry alerts</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.pendingPayments}
              onChange={(e) => handleSettingChange('notifications', 'pendingPayments', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Pending payment reminders</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.newOrders}
              onChange={(e) => handleSettingChange('notifications', 'newOrders', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">New order notifications</span>
          </label>
        </div>
        
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Notification Channels</h4>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.emailNotifications}
              onChange={(e) => handleSettingChange('notifications', 'emailNotifications', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Email notifications</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notifications.smsNotifications}
              onChange={(e) => handleSettingChange('notifications', 'smsNotifications', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">SMS notifications</span>
          </label>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notification Email</label>
            <input
              type="email"
              value={settings.notifications.notificationEmail}
              onChange={(e) => handleSettingChange('notifications', 'notificationEmail', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="admin@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notification Phone</label>
            <input
              type="tel"
              value={settings.notifications.notificationPhone}
              onChange={(e) => handleSettingChange('notifications', 'notificationPhone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="+91 98765 43210"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Security Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
          <input
            type="number"
            value={settings.security.sessionTimeout}
            onChange={(e) => handleSettingChange('security', 'sessionTimeout', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Login Attempts</label>
          <input
            type="number"
            value={settings.security.maxLoginAttempts}
            onChange={(e) => handleSettingChange('security', 'maxLoginAttempts', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="md:col-span-2 space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Password Policy</h4>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.security.enforcePasswordChange}
              onChange={(e) => handleSettingChange('security', 'enforcePasswordChange', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enforce periodic password change</span>
          </label>
          
          {settings.security.enforcePasswordChange && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password Change Interval (days)</label>
              <input
                type="number"
                value={settings.security.passwordChangeDays}
                onChange={(e) => handleSettingChange('security', 'passwordChangeDays', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Password Length</label>
            <input
              type="number"
              min="6"
              max="20"
              value={settings.security.minPasswordLength}
              onChange={(e) => handleSettingChange('security', 'minPasswordLength', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.security.requireSpecialChar}
              onChange={(e) => handleSettingChange('security', 'requireSpecialChar', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Require special characters in password</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.security.enableTwoFactor}
              onChange={(e) => handleSettingChange('security', 'enableTwoFactor', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable two-factor authentication</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderBackupSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Backup Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.backup.autoBackup}
              onChange={(e) => handleSettingChange('backup', 'autoBackup', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enable automatic backup</span>
          </label>
        </div>
        
        {settings.backup.autoBackup && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Frequency</label>
              <select
                value={settings.backup.backupFrequency}
                onChange={(e) => handleSettingChange('backup', 'backupFrequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Time</label>
              <input
                type="time"
                value={settings.backup.backupTime}
                onChange={(e) => handleSettingChange('backup', 'backupTime', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retention Period (days)</label>
              <input
                type="number"
                value={settings.backup.retentionDays}
                onChange={(e) => handleSettingChange('backup', 'retentionDays', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Location</label>
              <select
                value={settings.backup.backupLocation}
                onChange={(e) => handleSettingChange('backup', 'backupLocation', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="cloud">Cloud Storage</option>
                <option value="local">Local Storage</option>
                <option value="both">Both</option>
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.backup.emailBackupReport}
                  onChange={(e) => handleSettingChange('backup', 'emailBackupReport', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Email backup completion report</span>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'invoice':
        return renderInvoiceSettings();
      case 'stock':
        return renderStockSettings();
      case 'tax':
        return renderTaxSettings();
      case 'notifications':
        return renderNotificationSettings();
      case 'security':
        return renderSecuritySettings();
      case 'backup':
        return renderBackupSettings();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading system settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;