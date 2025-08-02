import React, { useState, useEffect } from 'react';
import { 
  Navigation,
  MapPin, 
  Phone, 
  MessageCircle, 
  User, 
  CreditCard,
  Clock,
  Check,
  X,
  Camera,
  Calendar,
  DollarSign,
  FileText,
  ChevronRight,
  Route,
  Target,
  TrendingUp,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  ArrowLeft,
  Home,
  Users,
  Activity,
  Settings
} from 'lucide-react';
import { useToast } from '../global';

const FieldAgentApp = () => {
  const [currentView, setCurrentView] = useState('route'); // route, customer, payment, summary
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [route, setRoute] = useState([]);
  const [visitedCustomers, setVisitedCustomers] = useState(new Set());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [todayStats, setTodayStats] = useState({
    visits: 0,
    collections: 0,
    promises: 0,
    amount_collected: 0
  });
  const toast = useToast();

  useEffect(() => {
    fetchDailyRoute();
    getCurrentLocation();
    
    // Monitor online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };

  const fetchDailyRoute = async () => {
    try {
      // Mock route data - replace with API call
      const mockRoute = [
        {
          id: 1,
          name: 'Apollo Pharmacy',
          address: 'Shop 15, Andheri West, Mumbai',
          phone: '+91 9876543210',
          outstanding_amount: 125000,
          days_overdue: 35,
          last_visit: '2024-07-15',
          payment_history: 'Good',
          credit_limit: 200000,
          priority: 'high',
          location: { lat: 19.1136, lng: 72.8697 },
          estimated_distance: 2.5,
          estimated_time: 15,
          invoices: [
            { number: 'INV-2024-001', amount: 80000, due_date: '2024-06-15', days_overdue: 35 },
            { number: 'INV-2024-015', amount: 45000, due_date: '2024-07-05', days_overdue: 15 }
          ]
        },
        {
          id: 2,
          name: 'MedPlus Health Services',
          address: 'Plot 42, Banjara Hills, Hyderabad',
          phone: '+91 9876543211',
          outstanding_amount: 85000,
          days_overdue: 22,
          last_visit: '2024-07-20',
          payment_history: 'Excellent',
          credit_limit: 150000,
          priority: 'medium',
          location: { lat: 17.4065, lng: 78.4772 },
          estimated_distance: 8.2,
          estimated_time: 25,
          invoices: [
            { number: 'INV-2024-008', amount: 85000, due_date: '2024-07-12', days_overdue: 8 }
          ]
        },
        {
          id: 3,
          name: 'Wellness Forever',
          address: 'FC Road, Pune',
          phone: '+91 9876543212',
          outstanding_amount: 195000,
          days_overdue: 78,
          last_visit: '2024-07-10',
          payment_history: 'Average',
          credit_limit: 250000,
          priority: 'urgent',
          location: { lat: 18.5204, lng: 73.8567 },
          estimated_distance: 12.1,
          estimated_time: 35,
          invoices: [
            { number: 'INV-2024-003', amount: 120000, due_date: '2024-05-15', days_overdue: 75 },
            { number: 'INV-2024-007', amount: 75000, due_date: '2024-05-25', days_overdue: 65 }
          ]
        }
      ];
      setRoute(mockRoute);
    } catch (error) {
      toast.error('Failed to fetch route');
    }
  };

  const navigateToCustomer = (customer) => {
    if (customer.location) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${customer.location.lat},${customer.location.lng}`;
      window.open(url, '_blank');
    }
  };

  const callCustomer = (phone) => {
    window.open(`tel:${phone}`);
  };

  const openWhatsApp = (phone) => {
    const message = "Hello! This is regarding your outstanding payment. Please let me know when would be a good time to discuss.";
    window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(message)}`);
  };

  const markVisited = (customerId) => {
    setVisitedCustomers(prev => new Set([...prev, customerId]));
    setTodayStats(prev => ({ ...prev, visits: prev.visits + 1 }));
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500 bg-red-50';
      case 'high': return 'border-l-orange-500 bg-orange-50';
      case 'medium': return 'border-l-yellow-500 bg-yellow-50';
      default: return 'border-l-green-500 bg-green-50';
    }
  };

  // Route Planning View
  const RoutePlanningView = () => (
    <div className="min-h-screen bg-gray-100">
      {/* Header with stats */}
      <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold text-gray-900">Today's Route</h1>
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <button
              onClick={fetchDailyRoute}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{route.length}</div>
            <div className="text-xs text-gray-600">Customers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{todayStats.visits}</div>
            <div className="text-xs text-gray-600">Visited</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-600">₹{todayStats.amount_collected.toLocaleString()}</div>
            <div className="text-xs text-gray-600">Collected</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-600">{todayStats.promises}</div>
            <div className="text-xs text-gray-600">Promises</div>
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="p-4 space-y-3">
        {route.map((customer) => (
          <CustomerCard 
            key={customer.id} 
            customer={customer} 
            isVisited={visitedCustomers.has(customer.id)}
            onSelect={() => {
              setSelectedCustomer(customer);
              setCurrentView('customer');
            }}
          />
        ))}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation currentView="route" onViewChange={setCurrentView} />
    </div>
  );

  const CustomerCard = ({ customer, isVisited, onSelect }) => (
    <div className={`bg-white rounded-lg shadow-sm border-l-4 p-4 ${getPriorityColor(customer.priority)} ${isVisited ? 'opacity-75' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="font-semibold text-gray-900">{customer.name}</h3>
            {isVisited && <Check className="w-4 h-4 text-green-500" />}
          </div>
          <p className="text-sm text-gray-600 mb-2">{customer.address}</p>
          <div className="flex items-center space-x-4">
            <span className="text-lg font-bold text-red-600">
              ₹{customer.outstanding_amount.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500">
              {customer.days_overdue} days overdue
            </span>
          </div>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>{customer.estimated_distance} km</p>
          <p>{customer.estimated_time} min</p>
        </div>
      </div>
      
      <div className="flex space-x-2">
        <button 
          onClick={() => navigateToCustomer(customer)}
          className="flex-1 bg-blue-500 text-white py-2 px-4 rounded text-sm font-medium flex items-center justify-center space-x-1"
        >
          <Navigation className="w-4 h-4" />
          <span>Navigate</span>
        </button>
        <button 
          onClick={() => callCustomer(customer.phone)}
          className="bg-green-500 text-white py-2 px-4 rounded flex items-center justify-center"
        >
          <Phone className="w-4 h-4" />
        </button>
        <button 
          onClick={() => openWhatsApp(customer.phone)}
          className="bg-green-600 text-white py-2 px-4 rounded flex items-center justify-center"
        >
          <MessageCircle className="w-4 h-4" />
        </button>
        <button 
          onClick={onSelect}
          className="bg-gray-500 text-white py-2 px-4 rounded flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // Customer Detail View
  const CustomerDetailView = () => (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-10">
        <div className="flex items-center space-x-3 mb-3">
          <button
            onClick={() => setCurrentView('route')}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{selectedCustomer?.name}</h1>
            <p className="text-sm text-gray-600">{selectedCustomer?.address}</p>
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">Outstanding Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-red-600">
                ₹{selectedCustomer?.outstanding_amount.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Outstanding</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {selectedCustomer?.days_overdue}
              </div>
              <div className="text-sm text-gray-600">Days Overdue</div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Credit Limit:</span>
              <span className="font-medium">₹{selectedCustomer?.credit_limit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Payment History:</span>
              <span className="font-medium">{selectedCustomer?.payment_history}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Last Visit:</span>
              <span className="font-medium">{selectedCustomer?.last_visit}</span>
            </div>
          </div>
        </div>

        {/* Outstanding Invoices */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">Outstanding Invoices</h3>
          <div className="space-y-3">
            {selectedCustomer?.invoices.map((invoice) => (
              <div key={invoice.number} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{invoice.number}</p>
                    <p className="text-sm text-gray-600">Due: {invoice.due_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">₹{invoice.amount.toLocaleString()}</p>
                    <p className="text-sm text-red-600">{invoice.days_overdue} days overdue</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCurrentView('payment')}
              className="p-4 bg-green-50 border border-green-200 rounded-lg flex flex-col items-center space-y-2 hover:bg-green-100"
            >
              <CreditCard className="w-8 h-8 text-green-600" />
              <span className="text-sm font-medium text-green-700">Record Payment</span>
            </button>
            <button
              onClick={() => {
                // TODO: Implement promise recording
                setTodayStats(prev => ({ ...prev, promises: prev.promises + 1 }));
                toast.success('Promise recorded');
              }}
              className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col items-center space-y-2 hover:bg-blue-100"
            >
              <Calendar className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Record Promise</span>
            </button>
            <button
              className="p-4 bg-purple-50 border border-purple-200 rounded-lg flex flex-col items-center space-y-2 hover:bg-purple-100"
            >
              <Camera className="w-8 h-8 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Take Photo</span>
            </button>
            <button
              onClick={() => {
                markVisited(selectedCustomer.id);
                toast.success('Visit recorded');
              }}
              className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col items-center space-y-2 hover:bg-gray-100"
            >
              <FileText className="w-8 h-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Add Notes</span>
            </button>
          </div>
        </div>
      </div>

      <BottomNavigation currentView="customer" onViewChange={setCurrentView} />
    </div>
  );

  // Payment Entry View
  const PaymentEntryView = () => {
    const [payment, setPayment] = useState({
      amount: '',
      method: 'cash',
      reference: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });

    const paymentMethods = [
      { value: 'cash', label: 'Cash', icon: '💵' },
      { value: 'cheque', label: 'Cheque', icon: '📝' },
      { value: 'neft', label: 'NEFT/RTGS', icon: '🏦' },
      { value: 'upi', label: 'UPI', icon: '📱' }
    ];

    const recordPayment = async () => {
      try {
        if (!payment.amount || parseFloat(payment.amount) <= 0) {
          toast.error('Please enter a valid amount');
          return;
        }

        // TODO: API call to record payment
        const amount = parseFloat(payment.amount);
        setTodayStats(prev => ({
          ...prev,
          amount_collected: prev.amount_collected + amount
        }));
        
        toast.success('Payment recorded successfully');
        setCurrentView('customer');
      } catch (error) {
        toast.error('Failed to record payment');
      }
    };

    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setCurrentView('customer')}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Record Payment</h1>
              <p className="text-sm text-gray-600">{selectedCustomer?.name}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Amount Input */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <input
              type="number"
              value={payment.amount}
              onChange={(e) => setPayment(prev => ({ ...prev, amount: e.target.value }))}
              className="w-full p-4 border border-gray-300 rounded-lg text-2xl font-semibold text-center"
              placeholder="Enter amount"
              autoFocus
            />
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map(method => (
                <button
                  key={method.value}
                  onClick={() => setPayment(prev => ({ ...prev, method: method.value }))}
                  className={`p-3 border rounded-lg flex items-center space-x-2 ${
                    payment.method === method.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300'
                  }`}
                >
                  <span className="text-xl">{method.icon}</span>
                  <span className="font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference Number */}
          {(payment.method === 'cheque' || payment.method === 'neft' || payment.method === 'upi') && (
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {payment.method === 'cheque' ? 'Cheque Number' : 
                 payment.method === 'upi' ? 'UPI Transaction ID' : 
                 'Reference Number'}
              </label>
              <input
                type="text"
                value={payment.reference}
                onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg"
                placeholder={`Enter ${payment.method === 'cheque' ? 'cheque number' : 'reference'}`}
              />
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={payment.notes}
              onChange={(e) => setPayment(prev => ({ ...prev, notes: e.target.value }))}
              rows="3"
              className="w-full p-3 border border-gray-300 rounded-lg"
              placeholder="Add any notes about this payment"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={recordPayment}
            disabled={!payment.amount || parseFloat(payment.amount) <= 0}
            className="w-full bg-green-500 text-white py-4 rounded-lg font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Record Payment ₹{payment.amount || '0'}
          </button>
        </div>
      </div>
    );
  };

  // Bottom Navigation
  const BottomNavigation = ({ currentView, onViewChange }) => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2">
      <div className="flex justify-around">
        <button
          onClick={() => onViewChange('route')}
          className={`flex flex-col items-center py-2 px-4 rounded-lg ${
            currentView === 'route' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
          }`}
        >
          <Route className="w-5 h-5" />
          <span className="text-xs mt-1">Route</span>
        </button>
        <button
          onClick={() => onViewChange('customer')}
          className={`flex flex-col items-center py-2 px-4 rounded-lg ${
            currentView === 'customer' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-xs mt-1">Customer</span>
        </button>
        <button
          onClick={() => onViewChange('summary')}
          className={`flex flex-col items-center py-2 px-4 rounded-lg ${
            currentView === 'summary' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-xs mt-1">Summary</span>
        </button>
        <button
          onClick={() => onViewChange('settings')}
          className={`flex flex-col items-center py-2 px-4 rounded-lg ${
            currentView === 'settings' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-xs mt-1">Settings</span>
        </button>
      </div>
    </div>
  );

  // Daily Summary View
  const DailySummaryView = () => (
    <div className="min-h-screen bg-gray-100 pb-20">
      <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Daily Summary</h1>
        <p className="text-sm text-gray-600">{new Date().toLocaleDateString()}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Performance Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{todayStats.visits}</div>
            <div className="text-sm text-gray-600">Customers Visited</div>
            <div className="text-xs text-gray-500 mt-1">of {route.length} planned</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">₹{todayStats.amount_collected.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Amount Collected</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-purple-600">{todayStats.promises}</div>
            <div className="text-sm text-gray-600">Promises Received</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-orange-600">
              {route.length > 0 ? Math.round((todayStats.visits / route.length) * 100) : 0}%
            </div>
            <div className="text-sm text-gray-600">Route Completion</div>
          </div>
        </div>

        {/* Visited Customers */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">Visited Customers</h3>
          {Array.from(visitedCustomers).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No customers visited yet</p>
          ) : (
            <div className="space-y-2">
              {route.filter(c => visitedCustomers.has(c.id)).map(customer => (
                <div key={customer.id} className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="font-medium">{customer.name}</span>
                  <Check className="w-4 h-4 text-green-600" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Status */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">Data Sync Status</span>
            {isOnline ? (
              <div className="flex items-center text-green-600">
                <Wifi className="w-4 h-4 mr-1" />
                <span className="text-sm">Online</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <WifiOff className="w-4 h-4 mr-1" />
                <span className="text-sm">Offline</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {isOnline ? 'All data is synced' : 'Data will sync when online'}
          </p>
        </div>
      </div>

      <BottomNavigation currentView="summary" onViewChange={setCurrentView} />
    </div>
  );

  // Main render logic
  switch (currentView) {
    case 'customer':
      return <CustomerDetailView />;
    case 'payment':
      return <PaymentEntryView />;
    case 'summary':
      return <DailySummaryView />;
    case 'settings':
      return (
        <div className="min-h-screen bg-gray-100 pb-20">
          <div className="bg-white shadow-sm border-b p-4">
            <h1 className="text-xl font-bold text-gray-900">Agent Settings</h1>
          </div>
          <div className="p-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-gray-600">Settings will be available in next update</p>
            </div>
          </div>
          <BottomNavigation currentView="settings" onViewChange={setCurrentView} />
        </div>
      );
    default:
      return <RoutePlanningView />;
  }
};

export default FieldAgentApp;