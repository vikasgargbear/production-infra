import React, { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  Database,
  Shield,
  Zap,
  Save,
  RefreshCw
} from 'lucide-react';
import apiClient from '../../../services/api/apiClient';

// Simple Card components (inline implementation since UI components don't exist)
const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>{children}</div>
);
const CardContent: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);
const CardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-6 py-4 border-b border-gray-200">{children}</div>
);
const CardTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <h3 className={`font-semibold text-gray-900 ${className}`}>{children}</h3>
);

const Switch: React.FC<{ checked: boolean; onCheckedChange: () => void; className?: string }> = ({ checked, onCheckedChange, className = '' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onCheckedChange}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'} ${className}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const Button: React.FC<{ variant?: 'outline' | 'default'; onClick?: () => void; disabled?: boolean; children: React.ReactNode }> = ({ variant, onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variant === 'outline'
      ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
  >
    {children}
  </button>
);

const Alert: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-lg border p-4 ${className}`}>{children}</div>
);
const AlertDescription: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <p className={`text-sm ${className}`}>{children}</p>
);

interface MessageState {
  type: 'success' | 'error';
  text: string;
}

interface FeaturesState {
  [key: string]: boolean;
}

const MasterSettings = () => {
  const [features, setFeatures] = useState<FeaturesState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  // Feature definitions with descriptions
  const featureDefinitions = {
    // Notification Settings
    system_notifications: {
      label: 'System Notifications',
      description: 'Enable automatic notifications for all system events',
      icon: Bell,
      category: 'Notifications'
    },
    low_stock_alerts: {
      label: 'Low Stock Alerts',
      description: 'Alert when inventory falls below minimum levels',
      icon: Bell,
      category: 'Notifications'
    },
    expiry_alerts: {
      label: 'Expiry Alerts',
      description: 'Alert for products nearing expiry date',
      icon: Bell,
      category: 'Notifications'
    },
    overdue_invoice_alerts: {
      label: 'Overdue Invoice Alerts',
      description: 'Alert when invoices become overdue',
      icon: Bell,
      category: 'Notifications'
    },

    // Inventory Settings
    allow_negative_stock: {
      label: 'Allow Negative Stock',
      description: 'Allow inventory to go negative (useful for pre-orders)',
      icon: Database,
      category: 'Inventory'
    },
    batch_wise_tracking: {
      label: 'Batch Wise Tracking',
      description: 'Track inventory by batch numbers',
      icon: Database,
      category: 'Inventory'
    },
    expiry_date_mandatory: {
      label: 'Expiry Date Mandatory',
      description: 'Require expiry date when adding products',
      icon: Database,
      category: 'Inventory'
    },
    stock_adjustment_approval: {
      label: 'Stock Adjustment Approval',
      description: 'Require approval for stock adjustments',
      icon: Shield,
      category: 'Inventory'
    },

    // Financial Settings
    auto_fifo_allocation: {
      label: 'Auto FIFO Allocation',
      description: 'Automatically allocate payments to oldest unpaid invoices',
      icon: Zap,
      category: 'Finance'
    },
    credit_limit_enforcement: {
      label: 'Credit Limit Enforcement',
      description: 'Enforce customer credit limits on new orders',
      icon: Shield,
      category: 'Finance'
    },
    partial_payments: {
      label: 'Allow Partial Payments',
      description: 'Allow customers to make partial invoice payments',
      icon: Zap,
      category: 'Finance'
    },
    auto_reconciliation: {
      label: 'Auto Reconciliation',
      description: 'Automatically reconcile payments with invoices',
      icon: Zap,
      category: 'Finance'
    },

    // Sales Settings
    sales_approval_required: {
      label: 'Sales Approval Required',
      description: 'Require approval for sales orders above limit',
      icon: Shield,
      category: 'Sales'
    },
    discount_limit_check: {
      label: 'Discount Limit Check',
      description: 'Check if discounts exceed allowed limits',
      icon: Shield,
      category: 'Sales'
    },
    minimum_margin_check: {
      label: 'Minimum Margin Check',
      description: 'Ensure minimum profit margin on sales',
      icon: Shield,
      category: 'Sales'
    },

    // GST & Compliance
    gst_round_off: {
      label: 'GST Round Off',
      description: 'Round off GST calculations to nearest rupee',
      icon: Shield,
      category: 'Compliance'
    },
    eway_bill_enabled: {
      label: 'E-Way Bill Generation',
      description: 'Enable E-Way bill generation for shipments',
      icon: Shield,
      category: 'Compliance'
    },
    tcs_applicable: {
      label: 'TCS Applicable',
      description: 'Apply Tax Collected at Source on sales',
      icon: Shield,
      category: 'Compliance'
    }
  };

  // Fetch current feature flags
  const fetchFeatures = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/settings/features');
      setFeatures(response.data.features || {});
    } catch (error) {
      console.error('Error fetching features:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  // Toggle a feature
  const toggleFeature = (featureName: string) => {
    setFeatures(prev => ({
      ...prev,
      [featureName]: !prev[featureName]
    }));
  };

  // Save all feature settings
  const saveSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Save to org settings (UI preferences)
      await apiClient.put('/settings/features', { features });

      // Also update database feature flags for system-level features
      const systemFeatures = {};
      Object.keys(featureDefinitions).forEach(key => {
        systemFeatures[key] = features[key] || false;
      });

      await apiClient.post('/settings/features/database-flags', systemFeatures);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      await fetchFeatures();
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  // Group features by category
  const featuresByCategory: Record<string, Array<{ key: string; label: string; description: string; icon: any; category: string }>> = Object.entries(featureDefinitions).reduce((acc, [key, def]) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push({ key, ...def });
    return acc;
  }, {} as Record<string, Array<{ key: string; label: string; description: string; icon: any; category: string }>>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Master Settings
        </h1>
        <p className="text-gray-600 mt-1">
          Configure system-wide features and behaviors
        </p>
      </div>

      {message && (
        <Alert className={`mb-4 ${message.type === 'error' ? 'border-red-200' : 'border-green-200'}`}>
          <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {Object.entries(featuresByCategory).map(([category, categoryFeatures]) => (
        <Card key={category} className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryFeatures.map(feature => {
              const Icon = feature.icon;
              const isEnabled = features[feature.key] || false;

              return (
                <div
                  key={feature.key}
                  className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">{feature.label}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleFeature(feature.key)}
                    className="ml-4"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={fetchFeatures}
          disabled={saving}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default MasterSettings;
