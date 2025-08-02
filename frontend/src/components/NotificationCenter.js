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
  Trash2
} from 'lucide-react';

const NotificationCenter = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');

  // Mock notifications data - in real app, this would come from API
  const mockNotifications = [
    {
      id: 1,
      type: 'stock_low',
      title: 'Low Stock Alert',
      message: 'Paracetamol 500mg - Only 15 units left',
      severity: 'critical',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      read: false,
      data: { productId: 'P001', currentStock: 15, reorderLevel: 50 }
    },
    {
      id: 2,
      type: 'expiry',
      title: 'Expiry Alert',
      message: 'Batch #B2024001 expires in 7 days',
      severity: 'warning',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      read: false,
      data: { batchId: 'B2024001', expiryDate: '2024-08-01', daysLeft: 7 }
    },
    {
      id: 3,
      type: 'payment_due',
      title: 'Payment Overdue',
      message: 'Apollo Pharmacy - ₹25,000 overdue by 3 days',
      severity: 'critical',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
      read: true,
      data: { partyId: 'C001', amount: 25000, daysOverdue: 3 }
    },
    {
      id: 4,
      type: 'scheme_expiry',
      title: 'Scheme Expiring',
      message: 'Summer Discount Scheme expires tomorrow',
      severity: 'warning',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
      read: false,
      data: { schemeId: 'S001', expiryDate: '2024-07-25' }
    },
    {
      id: 5,
      type: 'einvoice_failed',
      title: 'E-Invoice Failed',
      message: 'Invoice #INV2024001 - IRN generation failed',
      severity: 'critical',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      read: false,
      data: { invoiceId: 'INV2024001', error: 'Invalid GST number' }
    }
  ];

  useEffect(() => {
    setNotifications(mockNotifications);
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case 'stock_low': return Package;
      case 'expiry': return Calendar;
      case 'payment_due': return CreditCard;
      case 'scheme_expiry': return Clock;
      case 'einvoice_failed': return FileX;
      default: return Bell;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getIconColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      case 'info': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
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

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
    );
  };

  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'unread') return !notif.read;
    if (filter === 'critical') return notif.severity === 'critical';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

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
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
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
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  filter === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto max-h-96">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map(notification => {
                const Icon = getIcon(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      !notification.read ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {/* Icon */}
                      <div className={`p-2 rounded-lg ${getSeverityColor(notification.severity)}`}>
                        <Icon className={`w-4 h-4 ${getIconColor(notification.severity)}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">
                            {notification.title}
                          </h4>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {notification.message}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center space-x-2">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-700"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Mark as read
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="inline-flex items-center text-xs text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium">
            View All Notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;