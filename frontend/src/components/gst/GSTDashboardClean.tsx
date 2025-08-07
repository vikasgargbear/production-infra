import React, { useState } from 'react';
import {
  CheckCircle, Clock, AlertCircle, ChevronRight, MoreHorizontal
} from 'lucide-react';

interface GSTDashboardProps {
  open?: boolean;
  onClose?: () => void;
}

// Ultra-minimal list item
const ListItem: React.FC<{
  title: string;
  subtitle?: string;
  status?: 'done' | 'pending' | 'urgent';
  value?: string;
  onClick?: () => void;
}> = ({ title, subtitle, status, value, onClick }) => {
  const getStatusIcon = () => {
    if (!status) return null;
    switch (status) {
      case 'done': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'urgent': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'pending': return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div 
      className={`flex items-center py-4 ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
      onClick={onClick}
    >
      {status && (
        <div className="mr-3">
          {getStatusIcon()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-base text-gray-900">{title}</div>
        {subtitle && (
          <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>
        )}
      </div>
      {value && (
        <div className="text-base font-medium text-gray-900 mr-3">{value}</div>
      )}
      {onClick && (
        <ChevronRight className="w-5 h-5 text-gray-400" />
      )}
    </div>
  );
};

// Simple card container
const Card: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => {
  return (
    <div className="bg-white rounded-xl">
      {title && (
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
        </div>
      )}
      <div className="px-6 pb-6">
        {children}
      </div>
    </div>
  );
};

const GSTDashboardClean: React.FC<GSTDashboardProps> = () => {
  const [period] = useState('January 2025');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <div className="bg-white">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">GST</h1>
            <p className="text-sm text-gray-500">{period}</p>
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <MoreHorizontal className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Tax payable - most important info first */}
        <Card>
          <div className="text-center py-8">
            <div className="text-3xl font-light text-gray-900 mb-2">₹60,000</div>
            <div className="text-sm text-gray-500">Tax payable this month</div>
          </div>
        </Card>

        {/* Returns - what needs action */}
        <Card title="Returns">
          <div className="divide-y divide-gray-100">
            <ListItem
              title="GSTR-1"
              subtitle="Filed 10 Jan"
              status="done"
            />
            <ListItem
              title="GSTR-3B"
              subtitle="Due 20 Jan"
              status="urgent"
              onClick={() => console.log('File GSTR-3B')}
            />
          </div>
        </Card>

        {/* Actions - only essential ones */}
        <Card title="Actions">
          <div className="divide-y divide-gray-100">
            <ListItem
              title="File Return"
              subtitle="GSTR-3B pending"
              onClick={() => console.log('File return')}
            />
            <ListItem
              title="Download Reports"
              onClick={() => console.log('Download')}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default GSTDashboardClean;