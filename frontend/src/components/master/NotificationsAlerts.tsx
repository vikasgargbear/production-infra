import React, { useState, useEffect } from 'react';
import { 
  Bell, Search, Plus, Edit2, Trash2, Check, X,
  AlertCircle, Package, Clock, CreditCard, Calendar,
  Users, TrendingUp, ShoppingCart, Filter, Save,
  Mail, MessageSquare, Smartphone, Monitor, Loader2, RefreshCw
} from 'lucide-react';
import { settingsApi } from '../../services/api';

const NotificationsAlerts = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('rules');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Load data on component mount
  useEffect(() => {
    if (open) {
      loadNotificationData();
    }
  }, [open]);

  const loadNotificationData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load alert rules, notifications, and preferences in parallel
      const [rulesResponse, notificationsResponse, preferencesResponse] = await Promise.all([
        settingsApi.notifications.rules.getAll().catch(() => null),
        settingsApi.notifications.getAll().catch(() => null),
        settingsApi.notifications.preferences.get().catch(() => null)
      ]);

      // Set alert rules
      if (rulesResponse?.data && Array.isArray(rulesResponse.data)) {
        setAlertRules(rulesResponse.data.map(rule => ({
          ...rule,
          icon: getIconForType(rule.type),
          color: getColorForType(rule.type)
        })));
      } else {
        setAlertRules([]);
      }

      // Set notifications
      if (notificationsResponse?.data && Array.isArray(notificationsResponse.data)) {
        setNotifications(notificationsResponse.data.map(notif => ({
          ...notif,
          timestamp: new Date(notif.timestamp || notif.created_at)
        })));
      } else {
        setNotifications([]);
      }

      // Set preferences
      if (preferencesResponse?.data) {
        setPreferences(preferencesResponse.data);
      }

    } catch (error) {
      setError('Failed to load notification settings. Please try again.');
      setAlertRules([]);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadNotificationData();
    } catch (error) {
      setError('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  // Alert Rules and Notifications state
  const [alertRules, setAlertRules] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Notification Preferences
  const [preferences, setPreferences] = useState({
    channels: {
      in_app: true,
      email: false,
      sms: false,
      whatsapp: false
    },
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '07:00'
    },
    grouping: {
      enabled: true,
      interval: 60 // minutes
    },
    sound: {
      enabled: true,
      volume: 70
    }
  });

  const alertTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'stock', label: 'Stock Alerts' },
    { value: 'expiry', label: 'Expiry Alerts' },
    { value: 'payment', label: 'Payment Alerts' },
    { value: 'sales', label: 'Sales Alerts' },
    { value: 'system', label: 'System Alerts' }
  ];

  const notificationChannels = [
    { value: 'in_app', label: 'In-App', icon: Monitor },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'sms', label: 'SMS', icon: Smartphone },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare }
  ];

  const frequencies = [
    { value: 'immediate', label: 'Immediate' },
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' }
  ];

  const getIconForType = (type) => {
    const icons = {
      stock: Package,
      expiry: Calendar,
      payment: CreditCard,
      sales: TrendingUp,
      system: Monitor
    };
    return icons[type] || AlertCircle;
  };

  const getColorForType = (type) => {
    const colors = {
      stock: 'red',
      expiry: 'amber',
      payment: 'blue',
      sales: 'green',
      system: 'gray'
    };
    return colors[type] || 'gray';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
      critical: 'bg-red-200 text-red-900'
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  const handleSavePreferences = async () => {
    try {
      await settingsApi.notifications.preferences.update(preferences);
      setHasChanges(false);
      // Show success message
    } catch (error) {
      setError('Failed to save preferences. Please try again.');
    }
  };

  const handleToggleRule = async (ruleId) => {
    try {
      const rule = alertRules.find(r => r.id === ruleId);
      const updatedRule = { ...rule, enabled: !rule.enabled };
      await settingsApi.notifications.rules.update(ruleId, updatedRule);
      
      setAlertRules(prev => prev.map(r => 
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      ));
    } catch (error) {
      setError('Failed to update rule. Please try again.');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (window.confirm('Are you sure you want to delete this alert rule?')) {
      try {
        await settingsApi.notifications.rules.delete(ruleId);
        setAlertRules(prev => prev.filter(r => r.id !== ruleId));
      } catch (error) {
        setError('Failed to delete rule. Please try again.');
      }
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await settingsApi.notifications.markAsRead(notificationId);
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      try {
        await settingsApi.notifications.clearAll();
        setNotifications([]);
      } catch (error) {
        setError('Failed to clear notifications. Please try again.');
      }
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (activeTab === 'rules') return true;
    if (searchTerm) {
      return notification.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             notification.message?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const filteredRules = alertRules.filter(rule => {
    if (searchTerm) {
      return rule.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             rule.type?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  if (!open) return null;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Notifications & Alerts</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rule</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex space-x-8">
          {[
            { id: 'rules', label: 'Alert Rules', count: alertRules.length },
            { id: 'notifications', label: 'Notifications', count: notifications.filter(n => !n.read).length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'rules' ? 'alert rules' : 'notifications'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {activeTab === 'notifications' && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : activeTab === 'rules' ? (
          <div className="space-y-4">
            {filteredRules.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No alert rules found</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create First Rule
                </button>
              </div>
            ) : (
              filteredRules.map(rule => (
                <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <rule.icon className={`w-5 h-5 text-${rule.color}-600`} />
                      <div>
                        <h3 className="font-medium text-gray-900">{rule.name}</h3>
                        <p className="text-sm text-gray-500">{rule.condition}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleRule(rule.id)}
                        className={`px-3 py-1 text-xs rounded-full ${
                          rule.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => {/* Edit rule */}}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No notifications found</p>
              </div>
            ) : (
              filteredNotifications.map(notification => (
                <div key={notification.id} className={`bg-white rounded-lg border border-gray-200 p-4 ${
                  !notification.read ? 'border-l-4 border-l-blue-500' : ''
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-medium text-gray-900">{notification.title}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(notification.severity)}`}>
                          {notification.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{formatTimestamp(notification.timestamp)}</span>
                        <span>•</span>
                        <span>{notification.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!notification.read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Preferences Panel */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Notification Preferences</h3>
          <button
            onClick={handleSavePreferences}
            disabled={!hasChanges}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Save Preferences
          </button>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Channels</h4>
            <div className="space-y-2">
              {notificationChannels.map(channel => (
                <label key={channel.value} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={preferences.channels[channel.value]}
                    onChange={(e) => {
                      setPreferences(prev => ({
                        ...prev,
                        channels: {
                          ...prev.channels,
                          [channel.value]: e.target.checked
                        }
                      }));
                      setHasChanges(true);
                    }}
                    className="rounded border-gray-300"
                  />
                  <channel.icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{channel.label}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Quiet Hours</h4>
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={preferences.quietHours.enabled}
                  onChange={(e) => {
                    setPreferences(prev => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, enabled: e.target.checked }
                    }));
                    setHasChanges(true);
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Enable quiet hours</span>
              </label>
              
              {preferences.quietHours.enabled && (
                <div className="flex items-center space-x-2">
                  <input
                    type="time"
                    value={preferences.quietHours.start}
                    onChange={(e) => {
                      setPreferences(prev => ({
                        ...prev,
                        quietHours: { ...prev.quietHours, start: e.target.value }
                      }));
                      setHasChanges(true);
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <span className="text-sm text-gray-500">to</span>
                  <input
                    type="time"
                    value={preferences.quietHours.end}
                    onChange={(e) => {
                      setPreferences(prev => ({
                        ...prev,
                        quietHours: { ...prev.quietHours, end: e.target.value }
                      }));
                      setHasChanges(true);
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsAlerts;