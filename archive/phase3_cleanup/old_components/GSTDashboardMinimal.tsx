import React, { useState } from 'react';
import {
  FileText, Clock, CheckCircle, AlertCircle, ChevronRight,
  Download, RefreshCw, Plus, MoreHorizontal
} from 'lucide-react';

interface GSTDashboardProps {
  open?: boolean;
  onClose?: () => void;
}

// Minimal card component
const MinimalCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}> = ({ children, className = '', onClick }) => {
  return (
    <div 
      className={`bg-white border border-gray-100 rounded-lg ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

// Simple metric display
const Metric: React.FC<{
  label: string;
  value: string;
  sublabel?: string;
}> = ({ label, value, sublabel }) => {
  return (
    <div>
      <div className="text-2xl font-semibold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sublabel && (
        <div className="text-xs text-gray-400 mt-1">{sublabel}</div>
      )}
    </div>
  );
};

// Status indicator
const StatusRow: React.FC<{
  title: string;
  subtitle: string;
  status: 'completed' | 'pending' | 'overdue';
  date?: string;
  onClick?: () => void;
}> = ({ title, subtitle, status, date, onClick }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending': return <Clock className="w-5 h-5 text-gray-400" />;
      case 'overdue': return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div 
      className={`flex items-center py-3 ${onClick ? 'cursor-pointer hover:bg-gray-50 -mx-4 px-4' : ''}`}
      onClick={onClick}
    >
      <div className="mr-3">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{subtitle}</div>
        {date && (
          <div className="text-xs text-gray-400 mt-0.5">{date}</div>
        )}
      </div>
      {onClick && (
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
    </div>
  );
};

const GSTDashboardMinimal: React.FC<GSTDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('January 2025');

  // Minimal data structure
  const data = {
    summary: {
      salesTax: '₹2,45,000',
      inputTax: '₹1,85,000',
      payable: '₹60,000',
      returns: 2
    },
    returns: [
      {
        title: 'GSTR-1',
        subtitle: 'Outward supplies',
        status: 'completed' as const,
        date: 'Filed on 10 Jan'
      },
      {
        title: 'GSTR-3B',
        subtitle: 'Summary return',
        status: 'pending' as const,
        date: 'Due 20 Jan'
      },
      {
        title: 'GSTR-2B',
        subtitle: 'Input tax credit',
        status: 'pending' as const,
        date: 'Available'
      }
    ],
    activities: [
      { action: 'GSTR-1 filed', time: '2 hours ago' },
      { action: 'Invoice #1234 generated', time: '4 hours ago' },
      { action: 'Payment recorded', time: '1 day ago' },
      { action: 'GSTR-3B draft saved', time: '2 days ago' }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean header */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">GST</h1>
              <p className="text-sm text-gray-500">{selectedPeriod}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Tax summary */}
        <MinimalCard className="p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <Metric
              label="Sales Tax"
              value={data.summary.salesTax}
              sublabel="Output tax collected"
            />
            <Metric
              label="Input Tax"
              value={data.summary.inputTax}
              sublabel="ITC claimed"
            />
            <Metric
              label="Tax Payable"
              value={data.summary.payable}
              sublabel="Net liability"
            />
            <Metric
              label="Pending Returns"
              value={data.summary.returns.toString()}
              sublabel="Need attention"
            />
          </div>
        </MinimalCard>

        {/* Returns status */}
        <MinimalCard className="p-6">
          <div className="mb-4">
            <h2 className="text-base font-medium text-gray-900">Returns</h2>
            <p className="text-sm text-gray-500 mt-1">Filing status for current period</p>
          </div>
          <div className="space-y-1">
            {data.returns.map((ret, index) => (
              <StatusRow
                key={index}
                title={ret.title}
                subtitle={ret.subtitle}
                status={ret.status}
                date={ret.date}
                onClick={() => console.log(`Open ${ret.title}`)}
              />
            ))}
          </div>
        </MinimalCard>

        {/* Quick actions */}
        <MinimalCard className="p-6">
          <div className="mb-4">
            <h2 className="text-base font-medium text-gray-900">Quick Actions</h2>
          </div>
          <div className="space-y-1">
            <StatusRow
              title="File GSTR-3B"
              subtitle="Summary return due soon"
              status="pending"
              onClick={() => console.log('File GSTR-3B')}
            />
            <StatusRow
              title="Download Reports"
              subtitle="Export GST data"
              status="pending"
              onClick={() => console.log('Download reports')}
            />
            <StatusRow
              title="Reconcile ITC"
              subtitle="Match purchase entries"
              status="pending"
              onClick={() => console.log('Reconcile ITC')}
            />
          </div>
        </MinimalCard>

        {/* Recent activity */}
        <MinimalCard className="p-6">
          <div className="mb-4">
            <h2 className="text-base font-medium text-gray-900">Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {data.activities.map((activity, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-gray-300 rounded-full mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{activity.action}</div>
                  <div className="text-xs text-gray-500">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </MinimalCard>
      </div>
    </div>
  );
};

export default GSTDashboardMinimal;