import React, { useState } from 'react';
import { CalendarOff, FileText, BarChart3 } from 'lucide-react';
import ModuleHeader from '../../global/ui/ModuleHeader';
import LeaveApplicationList from './LeaveApplicationList';
import LeaveBalanceView from './LeaveBalanceView';

const tabs = [
  { id: 'applications', label: 'Applications', icon: FileText },
  { id: 'balances', label: 'Balances', icon: BarChart3 },
];

const LeaveManagement: React.FC<{ open?: boolean; onClose?: () => void }> = () => {
  const [activeTab, setActiveTab] = useState('applications');

  return (
    <div>
      <ModuleHeader title="Leave Management" icon={CalendarOff} iconColor="text-blue-600" />
      <div className="p-6 max-w-7xl mx-auto">

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'applications' && <LeaveApplicationList />}
      {activeTab === 'balances' && <LeaveBalanceView />}
      </div>
    </div>
  );
};

export default LeaveManagement;
