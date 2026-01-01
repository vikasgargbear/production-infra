import React from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { ModuleHeader } from '../global';

// TypeScript interfaces
interface StockStatusProps {
  onClose?: () => void;
}

type FeatureStatus = 'working' | 'fixed' | 'new' | 'pending' | 'broken';

interface StockFeature {
  name: string;
  status: FeatureStatus;
  description: string;
  endpoint: string;
}

const StockStatus: React.FC<StockStatusProps> = ({ onClose }) => {
  const stockFeatures: StockFeature[] = [
    {
      name: "Current Stock Levels",
      status: "working",
      description: "View real-time stock levels for all products",
      endpoint: "/products (with stock data)"
    },
    {
      name: "Stock Movements History",
      status: "working",
      description: "Track all stock movements and transactions",
      endpoint: "/stock-movements"
    },
    {
      name: "Inventory Batches",
      status: "working",
      description: "Manage product batches and expiry dates",
      endpoint: "/inventory/batches"
    },
    {
      name: "Stock Adjustments",
      status: "fixed",
      description: "Adjust stock levels for damage, expiry, count corrections",
      endpoint: "/stock-adjustments"
    },
    {
      name: "Stock Dashboard",
      status: "new",
      description: "Dashboard with stock metrics and alerts",
      endpoint: "/stock/dashboard, /stock/current, /stock/alerts"
    },
    {
      name: "Low Stock Alerts",
      status: "working",
      description: "Automatic alerts for products below minimum levels",
      endpoint: "Built into products API"
    },
    {
      name: "Stock Transfers",
      status: "pending",
      description: "Inter-branch stock transfers",
      endpoint: "Requires development"
    },
    {
      name: "Stock Reports",
      status: "pending",
      description: "Comprehensive stock analysis reports",
      endpoint: "Requires development"
    }
  ];

  const getStatusIcon = (status: FeatureStatus): React.ReactNode => {
    switch (status) {
      case 'working':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fixed':
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
      case 'new':
        return <CheckCircle className="w-5 h-5 text-purple-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: FeatureStatus): string => {
    switch (status) {
      case 'working':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'fixed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'new':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const workingCount = stockFeatures.filter(f => ['working', 'fixed', 'new'].includes(f.status)).length;

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">

        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Stock Management Status"
          icon={CheckCircle}
          iconColor="text-green-600"
          onClose={onClose}
          historyType="stock"
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
                  <div>
                    <p className="text-2xl font-bold text-green-900">{workingCount}</p>
                    <p className="text-green-700">Features Working</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center">
                  <AlertCircle className="w-8 h-8 text-blue-500 mr-3" />
                  <div>
                    <p className="text-2xl font-bold text-blue-900">Live</p>
                    <p className="text-blue-700">Data Connected</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <div className="flex items-center">
                  <Clock className="w-8 h-8 text-purple-500 mr-3" />
                  <div>
                    <p className="text-2xl font-bold text-purple-900">Real-time</p>
                    <p className="text-purple-700">Updates</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Features List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Stock Management Features</h2>
              </div>

              <div className="divide-y divide-gray-200">
                {stockFeatures.map((feature, index) => (
                  <div key={index} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getStatusIcon(feature.status)}
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{feature.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">{feature.description}</p>
                          <p className="text-xs text-gray-400 mt-1">Endpoint: {feature.endpoint}</p>
                        </div>
                      </div>

                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(feature.status)}`}>
                        {feature.status === 'working' && 'Working'}
                        {feature.status === 'fixed' && 'Fixed'}
                        {feature.status === 'new' && 'New'}
                        {feature.status === 'pending' && 'Pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Items */}
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">✅ What's Working Now</h3>
              <ul className="space-y-2 text-blue-800">
                <li>• View current stock levels for all products</li>
                <li>• Track stock movements and transaction history</li>
                <li>• Manage inventory batches with expiry tracking</li>
                <li>• Get low stock alerts automatically</li>
                <li>• Stock dashboard with real-time metrics</li>
                <li>• Stock adjustments for corrections</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockStatus;