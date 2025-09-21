import React, { useState } from 'react';
import {
  Settings, Save, RefreshCw, AlertCircle,
  CheckCircle, Info, Building, FileText
} from 'lucide-react';

interface GSTSettingsProps {
  onClose?: () => void;
}

const GSTSettings: React.FC<GSTSettingsProps> = () => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    gstFilingFrequency: 'monthly',
    enableEInvoicing: true,
    gstPortalCredentials: {
      username: '',
      password: '',
      isConfigured: false
    },
    notifications: {
      filingReminders: true,
      dueDateAlerts: true,
      reconciliationAlerts: true
    }
  });

  const [hasChanges, setHasChanges] = useState(false);

  const handleInputChange = (section: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: typeof prev[section] === 'object' ? {
        ...prev[section],
        [field]: value
      } : value
    }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      // Simulate API call to save settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      setHasChanges(false);
      alert('GST settings saved successfully!');
    } catch (error) {
      alert('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const taxRateOptions = [
    { value: 0, label: '0% (Exempt)' },
    { value: 5, label: '5% (Essential goods)' },
    { value: 12, label: '12% (Standard goods)' },
    { value: 18, label: '18% (Standard goods)' },
    { value: 28, label: '28% (Luxury goods)' }
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">GST Settings</h2>
            <p className="text-sm text-gray-600 mt-1">Configure GST portal integration and workflow preferences</p>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Note:</span> Tax rates and company information are managed in <span className="font-medium">Master → Tax Master</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {hasChanges && (
              <span className="text-sm text-orange-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleSaveSettings}
              disabled={!hasChanges || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* GST Workflow Configuration */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-green-600" />
            GST Workflow Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filing Frequency
              </label>
              <select
                value={settings.gstFilingFrequency}
                onChange={(e) => handleInputChange('', 'gstFilingFrequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableEInvoicing"
                  checked={settings.enableEInvoicing}
                  onChange={(e) => handleInputChange('', 'enableEInvoicing', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="enableEInvoicing" className="ml-2 text-sm text-gray-700">
                  Enable E-Invoicing (for turnover &gt; ₹20 crore)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* GST Portal Integration */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FileText className="h-5 w-5 mr-2 text-purple-600" />
            GST Portal Integration
          </h3>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Security Notice</p>
                  <p>GST portal credentials are encrypted and stored securely. We recommend using API keys when available.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GST Portal Username
                </label>
                <input
                  type="text"
                  value={settings.gstPortalCredentials.username}
                  onChange={(e) => handleInputChange('gstPortalCredentials', 'username', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter GST portal username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GST Portal Password
                </label>
                <input
                  type="password"
                  value={settings.gstPortalCredentials.password}
                  onChange={(e) => handleInputChange('gstPortalCredentials', 'password', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter GST portal password"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {settings.gstPortalCredentials.isConfigured ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                )}
                <span className="text-sm text-gray-700">
                  Connection Status: {settings.gstPortalCredentials.isConfigured ? 'Configured' : 'Not Configured'}
                </span>
              </div>
              <button
                onClick={() => alert('Portal connection test would verify credentials with GST portal')}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Test Connection
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="filingReminders"
                checked={settings.notifications.filingReminders}
                onChange={(e) => handleInputChange('notifications', 'filingReminders', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="filingReminders" className="ml-2 text-sm text-gray-700">
                Send filing deadline reminders
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="dueDateAlerts"
                checked={settings.notifications.dueDateAlerts}
                onChange={(e) => handleInputChange('notifications', 'dueDateAlerts', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="dueDateAlerts" className="ml-2 text-sm text-gray-700">
                Alert before due dates
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="reconciliationAlerts"
                checked={settings.notifications.reconciliationAlerts}
                onChange={(e) => handleInputChange('notifications', 'reconciliationAlerts', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="reconciliationAlerts" className="ml-2 text-sm text-gray-700">
                Notify about reconciliation discrepancies
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTSettings;