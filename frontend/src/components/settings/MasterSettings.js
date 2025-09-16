import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Settings,
  Bell,
  Database,
  Shield,
  Zap,
  Save,
  RefreshCw
} from 'lucide-react';

const MasterSettings = () => {
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Feature definitions with descriptions
  const featureDefinitions = {
    system_notifications: {
      label: 'System Notifications',
      description: 'Enable automatic notifications for overdue invoices, low stock, expiring products, etc.',
      icon: Bell,
      category: 'Alerts'
    },
    auto_fifo_allocation: {
      label: 'Auto FIFO Allocation',
      description: 'Automatically allocate payments to oldest unpaid invoices first',
      icon: Zap,
      category: 'Finance'
    },
    inventory_tracking: {
      label: 'Inventory Tracking',
      description: 'Track stock movements and maintain inventory levels',
      icon: Database,
      category: 'Inventory'
    },
    credit_limit_enforcement: {
      label: 'Credit Limit Enforcement',
      description: 'Enforce customer credit limits on new orders',
      icon: Shield,
      category: 'Finance'
    }
  };

  // Fetch current feature flags
  const fetchFeatures = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/features', {
        headers: {
          'X-Org-ID': localStorage.getItem('orgId'),
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFeatures(data.features || {});
      }
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
  const toggleFeature = (featureName) => {
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
      const settingsResponse = await fetch('/api/settings/features', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-ID': localStorage.getItem('orgId'),
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ features })
      });

      // Also update database feature flags for system-level features
      const systemFeatures = {
        system_notifications: features.system_notifications || false,
        auto_fifo_allocation: features.auto_fifo_allocation || false,
        inventory_tracking: features.inventory_tracking || false,
        credit_limit_enforcement: features.credit_limit_enforcement || false
      };

      const flagsResponse = await fetch('/api/settings/features/database-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-ID': localStorage.getItem('orgId'),
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(systemFeatures)
      });

      if (settingsResponse.ok && flagsResponse.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        // Refresh to get confirmed state from backend
        await fetchFeatures();
      } else {
        throw new Error('Failed to save some settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  // Group features by category
  const featuresByCategory = Object.entries(featureDefinitions).reduce((acc, [key, def]) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push({ key, ...def });
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
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