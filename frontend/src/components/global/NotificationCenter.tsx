import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  Package,
  CreditCard,
  FileX,
  Calendar,
  CheckCircle,
  Eye,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import offlineStorage from '../../services/offlineStorage';

// TypeScript Interfaces
interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type NotificationType = 'stock_low' | 'expiry' | 'payment_due' | 'scheme_expiry' | 'einvoice_failed' | 'system_alert' | 'success' | string;
type SeverityType = 'critical' | 'warning' | 'info' | 'success' | string;

interface Notification {
  id: string | number;
  type: NotificationType;
  severity?: SeverityType;
  title?: string;
  message?: string;
  timestamp?: string;
  read: boolean;
  data?: Record<string, unknown>;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);


  // Load notifications with offline fallback
  const loadNotifications = async () => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual notifications API when available
      // settingsApi.notifications.getAll() doesn't exist - using placeholder
      const storedNotifications = await offlineStorage.getOffline('notifications', { critical: true });
      if (storedNotifications && storedNotifications.data) {
        setNotifications(storedNotifications.data);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      // No data available - show empty state
      setError('Unable to load notifications. Please check your connection and try again.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresh notifications
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      await loadNotifications();
    } catch (error) {
      setError('Failed to refresh notifications. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (id: string | number) => {
    try {
      // Update locally first for immediate UI feedback
      setNotifications(prev =>
        prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
      );

      // TODO: Queue for server sync when API is available
    } catch (err) {
      // Queue for offline processing
      offlineStorage.queueOfflineOperation({
        type: 'notification_mark_read',
        data: { notificationId: id }
      });
    }
  };

  // Delete notification
  const deleteNotification = async (id: string | number) => {
    try {
      // Remove locally first for immediate UI feedback
      setNotifications(prev => prev.filter(notif => notif.id !== id));

      // TODO: Queue for server sync when API is available
    } catch (err) {
      // Queue for offline processing
      offlineStorage.queueOfflineOperation({
        type: 'notification_delete',
        data: { notificationId: id }
      });
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      // Update locally first for immediate UI feedback
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, read: true }))
      );

      // TODO: Queue for server sync when API is available
    } catch (err) {
      // Queue for offline processing
      offlineStorage.queueOfflineOperation({
        type: 'notification_mark_all_read',
        data: {}
      });
    }
  };

  // Get icon for notification type
  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'stock_low': return Package;
      case 'expiry': return Calendar;
      case 'payment_due': return CreditCard;
      case 'scheme_expiry': return Clock;
      case 'einvoice_failed': return FileX;
      case 'system_alert': return AlertTriangle;
      case 'success': return CheckCircle;
      default: return Bell;
    }
  };

  // Get severity color
  const getSeverityColor = (severity: SeverityType | undefined) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get icon color
  const getIconColor = (severity: SeverityType | undefined) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      case 'info': return 'text-blue-600';
      case 'success': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return 'Unknown';

    const now = new Date();
    const timestampDate = new Date(timestamp);
    const diff = now.getTime() - timestampDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (hours > 24) {
      return `${Math.floor(hours / 24)}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else {
      return `${minutes}m ago`;
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'unread') return !notif.read;
    if (filter === 'critical') return notif.severity === 'critical';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  // Load data on component mount
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end pt-16 pr-4">
      <div className="bg-white rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex space-x-1 mt-3">
            {[
              { key: 'all', label: 'All' },
              { key: 'unread', label: 'Unread' },
              { key: 'critical', label: 'Critical' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as 'all' | 'unread' | 'critical')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${filter === tab.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {tab.key === 'unread' ? `${tab.label} (${unreadCount})` : tab.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          {unreadCount > 0 && (
            <div className="mt-3">
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border-b border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-gray-600">Loading notifications...</p>
          </div>
        )}

        {/* Notifications List */}
        {!loading && (
          <div className="overflow-y-auto max-h-96">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No notifications</p>
                {filter !== 'all' && (
                  <p className="text-sm text-gray-400 mt-1">
                    Try changing the filter or refresh
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredNotifications.map(notification => {
                  const Icon = getIcon(notification.type);
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50' : ''
                        }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg ${getSeverityColor(notification.severity)}`}>
                          <Icon className={`w-4 h-4 ${getIconColor(notification.severity)}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900 mb-1">
                                {notification.title || 'Notification'}
                              </h4>
                              <p className="text-sm text-gray-600 mb-2">
                                {notification.message || 'No message content'}
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>{formatTimestamp(notification.timestamp)}</span>
                                {notification.severity && (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${notification.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                    notification.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                                      notification.severity === 'info' ? 'bg-blue-100 text-blue-700' :
                                        notification.severity === 'success' ? 'bg-green-100 text-green-700' :
                                          'bg-gray-100 text-gray-700'
                                    }`}>
                                    {notification.severity}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-1 ml-2">
                              {!notification.read && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                                  title="Mark as read"
                                >
                                  <Eye className="w-4 h-4 text-gray-500" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notification.id)}
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-gray-500" />
                              </button>
                            </div>
                          </div>

                          {/* Additional data display */}
                          {notification.data && Object.keys(notification.data).length > 0 && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(notification.data).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium text-gray-700">{key}:</span>
                                    <span className="text-gray-600 ml-1">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{notifications.length} total notifications</span>
            <span>{unreadCount} unread</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;