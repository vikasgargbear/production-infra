import React, { useState, useEffect } from 'react';
import { 
  Bell, Search, Plus, Edit2, Trash2, Check, X,
  AlertCircle, Package, Clock, CreditCard, Calendar,
  Users, TrendingUp, ShoppingCart, Filter, Save,
  Mail, MessageSquare, Smartphone, Monitor, Loader2
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const NotificationsAlerts = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('rules');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
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
        // Use mock data as fallback
        setAlertRules(mockAlertRules);
      }

      // Set notifications
      if (notificationsResponse?.data && Array.isArray(notificationsResponse.data)) {
        setNotifications(notificationsResponse.data.map(notif => ({
          ...notif,
          timestamp: new Date(notif.timestamp || notif.created_at)
        })));
      } else {
        // Use mock data as fallback
        setNotifications(mockNotifications);
      }

      // Set preferences
      if (preferencesResponse?.data) {
        setPreferences(preferencesResponse.data);
      }

    } catch (error) {
      console.error('Error loading notification data:', error);
      setError('Failed to load notification settings. Using offline data.');
      // Use mock data on error
      setAlertRules(mockAlertRules);
      setNotifications(mockNotifications);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock data as fallback
  const mockAlertRules = [
    {
      id: 1,
      name: 'Low Stock Alert',
      type: 'stock',
      condition: 'stock_below_minimum',
      threshold: 10,
      enabled: true,
      channels: ['in_app', 'email'],
      recipients: ['admin', 'inventory_manager'],
      frequency: 'immediate',
      icon: Package,
      color: 'red'
    },
    {
      id: 2,
      name: 'Product Expiry Alert',
      type: 'expiry',
      condition: 'days_before_expiry',
      threshold: 30,
      enabled: true,
      channels: ['in_app', 'email', 'sms'],
      recipients: ['admin', 'pharmacist'],
      frequency: 'daily',
      icon: Calendar,
      color: 'amber'
    },
    {
      id: 3,
      name: 'Payment Due Alert',
      type: 'payment',
      condition: 'payment_overdue',
      threshold: 7,
      enabled: true,
      channels: ['in_app', 'email'],
      recipients: ['admin', 'accounts'],
      frequency: 'daily',
      icon: CreditCard,
      color: 'blue'
    },
    {
      id: 4,
      name: 'Sales Target Alert',
      type: 'sales',
      condition: 'sales_below_target',
      threshold: 80,
      enabled: false,
      channels: ['in_app'],
      recipients: ['admin', 'sales_manager'],
      frequency: 'weekly',
      icon: TrendingUp,
      color: 'green'
    }
  ];

  // Mock notifications data
  const mockNotifications = [
    {
      id: 1,
      title: 'Low Stock Alert',
      message: '5 products are below minimum stock level',
      type: 'stock',
      severity: 'high',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
      read: false,
      actionUrl: '/inventory/stock-movement'
    },
    {
      id: 2,
      title: 'Expiry Warning',
      message: '12 batches will expire in the next 30 days',
      type: 'expiry',
      severity: 'medium',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      read: false,
      actionUrl: '/inventory/expiry-report'
    },
    {
      id: 3,
      title: 'Payment Overdue',
      message: 'ABC Pharmaceuticals payment is overdue by 15 days',
      type: 'payment',
      severity: 'high',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      read: true,
      actionUrl: '/payments/pending'
    }
  ];

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

  const severityColors = {
    low: 'blue',
    medium: 'amber',
    high: 'red',
    critical: 'purple'
  };

  const [filterType, setFilterType] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    type: 'stock',
    condition: '',
    threshold: '',
    enabled: true,
    channels: ['in_app'],
    recipients: [],
    frequency: 'immediate',
    customMessage: ''
  });

  const conditionOptions = {
    stock: [
      { value: 'stock_below_minimum', label: 'Stock below minimum' },
      { value: 'stock_zero', label: 'Out of stock' },
      { value: 'stock_above_maximum', label: 'Stock above maximum' }
    ],
    expiry: [
      { value: 'days_before_expiry', label: 'Days before expiry' },
      { value: 'already_expired', label: 'Already expired' },
      { value: 'batch_expiring_soon', label: 'Batch expiring soon' }
    ],
    payment: [
      { value: 'payment_overdue', label: 'Payment overdue by days' },
      { value: 'payment_due_soon', label: 'Payment due in days' },
      { value: 'credit_limit_exceeded', label: 'Credit limit exceeded' }
    ],
    sales: [
      { value: 'sales_below_target', label: 'Sales below target %' },
      { value: 'no_sales_days', label: 'No sales for days' },
      { value: 'daily_target_missed', label: 'Daily target missed' }
    ]
  };

  const recipientOptions = [
    { value: 'admin', label: 'Administrator' },
    { value: 'inventory_manager', label: 'Inventory Manager' },
    { value: 'pharmacist', label: 'Pharmacist' },
    { value: 'accounts', label: 'Accounts' },
    { value: 'sales_manager', label: 'Sales Manager' },
    { value: 'all_users', label: 'All Users' }
  ];

  const filteredRules = alertRules.filter(rule => {
    const matchesSearch = searchTerm === '' ||
                         rule.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || rule.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChannelToggle = (channel) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }));
  };

  const handleRecipientToggle = (recipient) => {
    setFormData(prev => ({
      ...prev,
      recipients: prev.recipients.includes(recipient)
        ? prev.recipients.filter(r => r !== recipient)
        : [...prev.recipients, recipient]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingRule) {
        // Update existing rule
        const response = await settingsApi.notifications.rules.update(editingRule.id, formData);
        if (response?.success) {
          setAlertRules(prev => prev.map(rule =>
            rule.id === editingRule.id
              ? { ...rule, ...formData, icon: getIconForType(formData.type), color: getColorForType(formData.type) }
              : rule
          ));
        }
      } else {
        // Add new rule
        const response = await settingsApi.notifications.rules.create(formData);
        if (response?.success && response.data) {
          const newRule = {
            ...response.data,
            icon: getIconForType(formData.type),
            color: getColorForType(formData.type)
          };
          setAlertRules(prev => [...prev, newRule]);
        }
      }
      
      handleCloseModal();
    } catch (error) {
      console.error('Error saving alert rule:', error);
      // Fallback to local state update
      if (editingRule) {
        setAlertRules(prev => prev.map(rule =>
          rule.id === editingRule.id
            ? { ...rule, ...formData, icon: getIconForType(formData.type), color: getColorForType(formData.type) }
            : rule
        ));
      } else {
        const newRule = {
          ...formData,
          id: Date.now(),
          icon: getIconForType(formData.type),
          color: getColorForType(formData.type)
        };
        setAlertRules(prev => [...prev, newRule]);
      }
      handleCloseModal();
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      type: rule.type,
      condition: rule.condition,
      threshold: rule.threshold,
      enabled: rule.enabled,
      channels: rule.channels,
      recipients: rule.recipients,
      frequency: rule.frequency,
      customMessage: rule.customMessage || ''
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this alert rule?')) {
      try {
        await settingsApi.notifications.rules.delete(id);
        setAlertRules(prev => prev.filter(rule => rule.id !== id));
      } catch (error) {
        console.error('Error deleting alert rule:', error);
        // Fallback to local state update
        setAlertRules(prev => prev.filter(rule => rule.id !== id));
      }
    }
  };

  const handleToggleRule = async (id) => {
    const rule = alertRules.find(r => r.id === id);
    if (!rule) return;
    
    try {
      await settingsApi.notifications.rules.toggle(id, !rule.enabled);
      setAlertRules(prev => prev.map(rule =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      ));
    } catch (error) {
      console.error('Error toggling alert rule:', error);
      // Fallback to local state update
      setAlertRules(prev => prev.map(rule =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      ));
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await settingsApi.notifications.markAsRead(id);
      setNotifications(prev => prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Fallback to local state update
      setNotifications(prev => prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      ));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await settingsApi.notifications.markAllAsRead();
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Fallback to local state update
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingRule(null);
    setFormData({
      name: '',
      type: 'stock',
      condition: '',
      threshold: '',
      enabled: true,
      channels: ['in_app'],
      recipients: [],
      frequency: 'immediate',
      customMessage: ''
    });
  };

  const handlePreferenceChange = (category, field, value) => {
    setPreferences(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSavePreferences = async () => {
    try {
      await settingsApi.notifications.preferences.update(preferences);
      setHasChanges(false);
      alert('Preferences saved successfully!');
    } catch (error) {
      console.error('Error saving preferences:', error);
      // Fallback to localStorage
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
      setHasChanges(false);
      alert('Preferences saved locally!');
    }
  };

  const getIconForType = (type) => {
    const icons = {
      stock: Package,
      expiry: Calendar,
      payment: CreditCard,
      sales: TrendingUp,
      system: AlertCircle
    };
    return icons[type] || Bell;
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

  const formatTimestamp = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const renderRules = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Alert Rules</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Rule</span>
        </button>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {filteredRules.map(rule => {
          const Icon = rule.icon;
          return (
            <div
              key={rule.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={`p-2 bg-${rule.color}-100 text-${rule.color}-600 rounded-lg`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">{rule.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      Trigger when {rule.condition.replace(/_/g, ' ')} 
                      {rule.threshold && ` ${rule.threshold}`}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      <div className="flex items-center space-x-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{rule.frequency}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {rule.channels.includes('in_app') && <Monitor className="w-3 h-3 text-gray-400" />}
                        {rule.channels.includes('email') && <Mail className="w-3 h-3 text-gray-400" />}
                        {rule.channels.includes('sms') && <Smartphone className="w-3 h-3 text-gray-400" />}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                      rule.enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        rule.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Recent Notifications</h3>
        <button
          onClick={handleMarkAllAsRead}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Mark all as read
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.map(notif => {
          const Icon = getIconForType(notif.type);
          return (
            <div
              key={notif.id}
              className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow ${
                !notif.read ? 'border-l-4 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={`p-2 bg-${severityColors[notif.severity]}-100 text-${severityColors[notif.severity]}-600 rounded-lg`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-sm font-medium ${notif.read ? 'text-gray-600' : 'text-gray-900'}`}>
                      {notif.title}
                    </h4>
                    <p className="text-sm text-gray-500 mt-1">{notif.message}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(notif.timestamp)}
                      </span>
                      {notif.actionUrl && (
                        <a
                          href={notif.actionUrl}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          View Details →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {!notif.read && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderPreferences = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Notification Preferences</h3>
        <button
          onClick={handleSavePreferences}
          disabled={!hasChanges}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Notification Channels */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Notification Channels</h4>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">In-App Notifications</span>
            <input
              type="checkbox"
              checked={preferences.channels.in_app}
              onChange={(e) => handlePreferenceChange('channels', 'in_app', e.target.checked)}
              className="rounded border-gray-300"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Email Notifications</span>
            <input
              type="checkbox"
              checked={preferences.channels.email}
              onChange={(e) => handlePreferenceChange('channels', 'email', e.target.checked)}
              className="rounded border-gray-300"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">SMS Notifications</span>
            <input
              type="checkbox"
              checked={preferences.channels.sms}
              onChange={(e) => handlePreferenceChange('channels', 'sms', e.target.checked)}
              className="rounded border-gray-300"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">WhatsApp Notifications</span>
            <input
              type="checkbox"
              checked={preferences.channels.whatsapp}
              onChange={(e) => handlePreferenceChange('channels', 'whatsapp', e.target.checked)}
              className="rounded border-gray-300"
            />
          </label>
        </div>
      </div>

      {/* Quiet Hours */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Quiet Hours</h4>
        <label className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            checked={preferences.quietHours.enabled}
            onChange={(e) => handlePreferenceChange('quietHours', 'enabled', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Enable quiet hours</span>
        </label>
        {preferences.quietHours.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Start Time</label>
              <input
                type="time"
                value={preferences.quietHours.start}
                onChange={(e) => handlePreferenceChange('quietHours', 'start', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">End Time</label>
              <input
                type="time"
                value={preferences.quietHours.end}
                onChange={(e) => handlePreferenceChange('quietHours', 'end', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notification Grouping */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Notification Grouping</h4>
        <label className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            checked={preferences.grouping.enabled}
            onChange={(e) => handlePreferenceChange('grouping', 'enabled', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Group similar notifications</span>
        </label>
        {preferences.grouping.enabled && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Group within (minutes)</label>
            <input
              type="number"
              value={preferences.grouping.interval}
              onChange={(e) => handlePreferenceChange('grouping', 'interval', parseInt(e.target.value))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
              min="5"
              max="240"
            />
          </div>
        )}
      </div>

      {/* Sound Settings */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Sound Settings</h4>
        <label className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            checked={preferences.sound.enabled}
            onChange={(e) => handlePreferenceChange('sound', 'enabled', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Enable notification sounds</span>
        </label>
        {preferences.sound.enabled && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Volume</label>
            <input
              type="range"
              value={preferences.sound.volume}
              onChange={(e) => handlePreferenceChange('sound', 'volume', parseInt(e.target.value))}
              className="w-full"
              min="0"
              max="100"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0%</span>
              <span>{preferences.sound.volume}%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const tabs = [
    { id: 'rules', label: 'Alert Rules', count: alertRules.length },
    { id: 'notifications', label: 'Notifications', count: notifications.filter(n => !n.read).length },
    { id: 'preferences', label: 'Preferences' }
  ];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading notification settings...</p>
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
            <Bell className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Notifications & Alerts</h1>
          </div>
          <div className="flex items-center space-x-4">
            {activeTab === 'rules' && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search rules..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {alertTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'rules' && renderRules()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'preferences' && renderPreferences()}
        </div>
      </div>

      {/* Add/Edit Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Low Stock Alert"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alert Type</label>
                    <select
                      value={formData.type}
                      onChange={(e) => {
                        handleInputChange('type', e.target.value);
                        handleInputChange('condition', '');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="stock">Stock</option>
                      <option value="expiry">Expiry</option>
                      <option value="payment">Payment</option>
                      <option value="sales">Sales</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                    <select
                      value={formData.condition}
                      onChange={(e) => handleInputChange('condition', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select condition</option>
                      {conditionOptions[formData.type]?.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Threshold Value</label>
                    <input
                      type="number"
                      value={formData.threshold}
                      onChange={(e) => handleInputChange('threshold', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => handleInputChange('frequency', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="immediate">Immediate</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notification Channels</label>
                  <div className="space-y-2">
                    {['in_app', 'email', 'sms', 'whatsapp'].map(channel => (
                      <label key={channel} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.channels.includes(channel)}
                          onChange={() => handleChannelToggle(channel)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 capitalize">
                          {channel.replace('_', '-')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Recipients</label>
                  <div className="grid grid-cols-2 gap-2">
                    {recipientOptions.map(recipient => (
                      <label key={recipient.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.recipients.includes(recipient.value)}
                          onChange={() => handleRecipientToggle(recipient.value)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{recipient.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (Optional)</label>
                  <textarea
                    value={formData.customMessage}
                    onChange={(e) => handleInputChange('customMessage', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Enter a custom message for this alert..."
                  />
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => handleInputChange('enabled', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Enable this rule</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsAlerts;