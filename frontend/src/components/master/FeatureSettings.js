import React, { useState, useEffect } from 'react';
import { 
  Cog, ToggleLeft, ToggleRight, Info,
  Package, CreditCard, RotateCcw, FileText,
  AlertTriangle, Save, Truck, Shield,
  Loader2, AlertCircle
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const FeatureSettings = ({ open, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [features, setFeatures] = useState({
    // Inventory Features
    allowNegativeStock: false,
    expiryDateMandatory: true,
    batchWiseTracking: true,
    stockAdjustmentApproval: false,
    lowStockAlerts: true,
    
    // Sales Features
    creditLimitForParties: true,
    creditLimitThreshold: 100000,
    salesReturnFlow: 'with-credit-note', // with-credit-note, direct-return
    salesApprovalRequired: false,
    discountLimit: 20, // percentage
    
    // Purchase Features
    grnWorkflow: true,
    purchaseApprovalLimit: 50000,
    autoGeneratePurchaseOrder: false,
    vendorRatingSystem: false,
    
    // E-Way Bill
    ewayBillEnabled: true,
    ewayBillThreshold: 50000,
    autoGenerateEwayBill: false,
    
    // GST Features
    gstRoundOff: true,
    reverseChargeApplicable: false,
    compositionScheme: false,
    tcsApplicable: false,
    
    // Payment Features
    allowPartialPayments: true,
    autoReconciliation: false,
    paymentReminders: true,
    reminderDays: [7, 15, 30],
    
    // General Features
    multiCurrency: false,
    multiLocation: true,
    barcodeScannerIntegration: false,
    smsNotifications: false,
    emailNotifications: true,
    whatsappNotifications: false,
    
    // Security Features
    twoFactorAuth: false,
    ipRestriction: false,
    sessionTimeout: 30, // minutes
    passwordComplexity: 'medium', // low, medium, high
    
    // Workflow Features
    purchaseWorkflow: true,
    salesWorkflow: false,
    paymentApproval: true,
    returnApproval: true
  });

  // Fetch feature settings on mount
  useEffect(() => {
    fetchFeatureSettings();
  }, []);

  const fetchFeatureSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await settingsApi.features.getAll();
      
      if (response.success && response.data) {
        // Extract features from the nested structure
        setFeatures(response.data.features || response.data);
      }
    } catch (error) {
      console.error('Error fetching feature settings:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      setError('Failed to load feature settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (feature) => {
    setFeatures(prev => ({
      ...prev,
      [feature]: !prev[feature]
    }));
  };

  const handleInputChange = (feature, value) => {
    setFeatures(prev => ({
      ...prev,
      [feature]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      const response = await settingsApi.features.bulkUpdate(features);
      
      if (response.success) {
        setSuccessMessage('Feature settings saved successfully!');
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error saving feature settings:', error);
      setError('Failed to save feature settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const FeatureToggle = ({ name, enabled, description, icon: Icon }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start space-x-3">
        <Icon className="w-5 h-5 text-gray-500 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-gray-900">{name}</h4>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => handleToggle(enabled)}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
          features[enabled] ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
            features[enabled] ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading feature settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Cog className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Feature Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-green-600 mr-3" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}
      
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Inventory Features */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Package className="w-5 h-5 mr-2" />
              Inventory Features
            </h2>
            
            <div className="space-y-1">
              <FeatureToggle
                name="Allow Negative Stock Billing"
                enabled="allowNegativeStock"
                description="Allow sales even when stock is not available"
                icon={Package}
              />
              <FeatureToggle
                name="Expiry Date Mandatory"
                enabled="expiryDateMandatory"
                description="Require expiry date for all products"
                icon={AlertTriangle}
              />
              <FeatureToggle
                name="Batch-wise Tracking"
                enabled="batchWiseTracking"
                description="Track inventory by batch numbers"
                icon={Package}
              />
              <FeatureToggle
                name="Stock Adjustment Approval"
                enabled="stockAdjustmentApproval"
                description="Require approval for stock adjustments"
                icon={Shield}
              />
              <FeatureToggle
                name="Low Stock Alerts"
                enabled="lowStockAlerts"
                description="Get notifications for low stock items"
                icon={AlertTriangle}
              />
            </div>
          </div>

          {/* Sales Features */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Sales Features
            </h2>
            
            <div className="space-y-4">
              <FeatureToggle
                name="Credit Limit for Parties"
                enabled="creditLimitForParties"
                description="Set and enforce credit limits for customers"
                icon={CreditCard}
              />
              
              {features.creditLimitForParties && (
                <div className="ml-8 pb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Credit Limit
                  </label>
                  <input
                    type="number"
                    value={features.creditLimitThreshold}
                    onChange={(e) => handleInputChange('creditLimitThreshold', parseInt(e.target.value) || 0)}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              
              <div className="py-3 border-b border-gray-100">
                <div className="flex items-start space-x-3">
                  <RotateCcw className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">Sales Return Flow</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Choose how sales returns are processed</p>
                  </div>
                </div>
                <div className="ml-8 mt-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="salesReturnFlow"
                      value="with-credit-note"
                      checked={features.salesReturnFlow === 'with-credit-note'}
                      onChange={(e) => handleInputChange('salesReturnFlow', e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">With Credit Note</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="salesReturnFlow"
                      value="direct-return"
                      checked={features.salesReturnFlow === 'direct-return'}
                      onChange={(e) => handleInputChange('salesReturnFlow', e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Direct Return</span>
                  </label>
                </div>
              </div>
              
              <div className="py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-start space-x-3">
                    <CreditCard className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Maximum Discount Limit</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Maximum discount percentage allowed</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={features.discountLimit}
                      onChange={(e) => handleInputChange('discountLimit', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* E-Way Bill Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Truck className="w-5 h-5 mr-2" />
              E-Way Bill Settings
            </h2>
            
            <div className="space-y-4">
              <FeatureToggle
                name="E-Way Bill Generation"
                enabled="ewayBillEnabled"
                description="Enable E-Way bill generation for shipments"
                icon={Truck}
              />
              
              {features.ewayBillEnabled && (
                <>
                  <div className="ml-8 pb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-Way Bill Threshold Amount
                    </label>
                    <input
                      type="number"
                      value={features.ewayBillThreshold}
                      onChange={(e) => handleInputChange('ewayBillThreshold', parseInt(e.target.value) || 0)}
                      className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="ml-8">
                    <FeatureToggle
                      name="Auto Generate E-Way Bill"
                      enabled="autoGenerateEwayBill"
                      description="Automatically generate when threshold is met"
                      icon={Truck}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Features */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              Payment Features
            </h2>
            
            <div className="space-y-1">
              <FeatureToggle
                name="Allow Partial Payments"
                enabled="allowPartialPayments"
                description="Accept partial payments from customers"
                icon={CreditCard}
              />
              <FeatureToggle
                name="Auto Reconciliation"
                enabled="autoReconciliation"
                description="Automatically match payments with invoices"
                icon={Shield}
              />
              <FeatureToggle
                name="Payment Reminders"
                enabled="paymentReminders"
                description="Send automatic payment reminders"
                icon={AlertTriangle}
              />
            </div>
          </div>

          {/* Security Features */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Security Features
            </h2>
            
            <div className="space-y-4">
              <FeatureToggle
                name="Two-Factor Authentication"
                enabled="twoFactorAuth"
                description="Require 2FA for user logins"
                icon={Shield}
              />
              <FeatureToggle
                name="IP Restriction"
                enabled="ipRestriction"
                description="Restrict access to specific IP addresses"
                icon={Shield}
              />
              
              <div className="py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Session Timeout</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Auto logout after inactivity</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={features.sessionTimeout}
                      onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 30)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <span className="text-sm text-gray-500">minutes</span>
                  </div>
                </div>
              </div>
              
              <div className="py-3">
                <div className="flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">Password Complexity</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Minimum password requirements</p>
                  </div>
                </div>
                <div className="ml-8 mt-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="passwordComplexity"
                      value="low"
                      checked={features.passwordComplexity === 'low'}
                      onChange={(e) => handleInputChange('passwordComplexity', e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Low (6+ characters)</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="passwordComplexity"
                      value="medium"
                      checked={features.passwordComplexity === 'medium'}
                      onChange={(e) => handleInputChange('passwordComplexity', e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Medium (8+ chars, mixed case)</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="passwordComplexity"
                      value="high"
                      checked={features.passwordComplexity === 'high'}
                      onChange={(e) => handleInputChange('passwordComplexity', e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">High (10+ chars, mixed case, numbers, symbols)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 rounded-lg p-4 flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Feature Settings Tips</p>
              <ul className="mt-1 space-y-1 text-blue-800">
                <li>• Changes take effect immediately after saving</li>
                <li>• Some features may require additional configuration</li>
                <li>• Disabling features will hide related UI elements</li>
                <li>• Contact support if you need help with any feature</li>
              </ul>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default FeatureSettings;