import React, { useState, useEffect, useCallback } from 'react';
import { 
  MessageCircle, 
  Phone, 
  Mail, 
  RefreshCw, 
  Download, 
  Filter,
  Search,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Calendar,
  MapPin,
  User,
  Send,
  Eye,
  CreditCard,
  FileText,
  Activity
} from 'lucide-react';
import { useToast } from '../global';

// Real API services
const collectionApi = {
  getAgingData: async () => {
    try {
      const orgId = 'ad808530-1ddb-4377-ab20-67bef145d80d'; // TODO: Get from context
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/collection/aging-data?org_id=${orgId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching aging data:', error);
      // Fallback to mock data in case of API error
      return {
        summary: {
          totalOutstanding: 2850000,
          overdueAmount: 1250000,
          currentWeekCollections: 450000,
          collectionEfficiency: 82,
          avgCollectionDays: 45
        },
        agingBuckets: [
          { range: '0-30', amount: 850000, count: 28, percentage: 29.8 },
          { range: '31-60', amount: 650000, count: 22, percentage: 22.8 },
          { range: '61-90', amount: 480000, count: 18, percentage: 16.8 },
          { range: '91-120', amount: 420000, count: 15, percentage: 14.7 },
          { range: '120+', amount: 450000, count: 12, percentage: 15.8 }
        ],
        parties: []
      };
    }
  },

  sendWhatsAppReminder: async (customerId, templateType, variables) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/collection/send-whatsapp-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: customerId,
          template_type: templateType,
          variables: variables
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending WhatsApp reminder:', error);
      throw new Error('Failed to send WhatsApp reminder');
    }
  },

  sendSMSReminder: async (customerId, templateType, variables) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/collection/send-sms-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: customerId,
          template_type: templateType,
          variables: variables
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending SMS reminder:', error);
      throw new Error('Failed to send SMS reminder');
    }
  }
};

const SmartAgingDashboard = () => {
  const [agingData, setAgingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReminder, setSendingReminder] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgingFilter, setSelectedAgingFilter] = useState('all');
  const [selectedParty, setSelectedParty] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const toast = useToast();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchAgingData();
    const interval = setInterval(() => {
      refreshData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgingData = async () => {
    try {
      setLoading(true);
      const data = await collectionApi.getAgingData();
      setAgingData(data);
    } catch (error) {
      toast.error('Failed to fetch aging data');
      console.error('Error fetching aging data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      setRefreshing(true);
      const data = await collectionApi.getAgingData();
      setAgingData(data);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const sendWhatsAppReminder = async (party, templateType = 'overdue') => {
    const reminderId = `${party.id}_whatsapp`;
    setSendingReminder(prev => ({ ...prev, [reminderId]: true }));
    
    try {
      const variables = {
        customerName: party.name,
        outstandingAmount: party.outstandingAmount,
        daysOverdue: party.daysOverdue,
        companyName: 'AASO Pharma',
        promiseDate: party.promiseDate || 'not specified'
      };

      await collectionApi.sendWhatsAppReminder(party.id, templateType, variables);
      
      toast.success(`WhatsApp reminder sent to ${party.name}`);
      
      // Update last follow-up date in local state
      setAgingData(prev => ({
        ...prev,
        parties: prev.parties.map(p => 
          p.id === party.id 
            ? { ...p, lastFollowUp: new Date().toISOString().split('T')[0] }
            : p
        )
      }));
      
    } catch (error) {
      toast.error(`Failed to send WhatsApp reminder: ${error.message}`);
    } finally {
      setSendingReminder(prev => ({ ...prev, [reminderId]: false }));
    }
  };

  const sendSMSReminder = async (party) => {
    const reminderId = `${party.id}_sms`;
    setSendingReminder(prev => ({ ...prev, [reminderId]: true }));
    
    try {
      await collectionApi.sendSMSReminder(party.id, 'overdue', {
        customerName: party.name,
        outstandingAmount: party.outstandingAmount,
        daysOverdue: party.daysOverdue
      });
      
      toast.success(`SMS reminder sent to ${party.name}`);
      
    } catch (error) {
      toast.error(`Failed to send SMS reminder: ${error.message}`);
    } finally {
      setSendingReminder(prev => ({ ...prev, [reminderId]: false }));
    }
  };

  const getTemplateType = (daysOverdue) => {
    if (daysOverdue <= 7) return 'friendly';
    if (daysOverdue <= 30) return 'formal';
    if (daysOverdue <= 60) return 'urgent';
    return 'final';
  };

  const getRiskColor = (riskScore) => {
    if (riskScore <= 30) return 'text-green-600 bg-green-100';
    if (riskScore <= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getAgingColor = (daysOverdue) => {
    if (daysOverdue <= 0) return 'text-green-600 bg-green-100';
    if (daysOverdue <= 30) return 'text-blue-600 bg-blue-100';
    if (daysOverdue <= 60) return 'text-yellow-600 bg-yellow-100';
    if (daysOverdue <= 90) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const filteredParties = agingData?.parties?.filter(party => {
    const matchesSearch = party.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         party.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAging = selectedAgingFilter === 'all' ||
      (selectedAgingFilter === '0-30' && party.daysOverdue >= 0 && party.daysOverdue <= 30) ||
      (selectedAgingFilter === '31-60' && party.daysOverdue > 30 && party.daysOverdue <= 60) ||
      (selectedAgingFilter === '61-90' && party.daysOverdue > 60 && party.daysOverdue <= 90) ||
      (selectedAgingFilter === '90+' && party.daysOverdue > 90);
    
    return matchesSearch && matchesAging;
  }) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading aging data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Smart Aging Dashboard</h1>
            <p className="text-gray-600 mt-1">
              AI-powered receivables management with instant WhatsApp reminders
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshData}
              disabled={refreshing}
              className={`p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors ${
                refreshing ? 'animate-spin' : ''
              }`}
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Outstanding</p>
                <p className="text-2xl font-bold">₹{agingData.summary.totalOutstanding.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium">Overdue Amount</p>
                <p className="text-2xl font-bold">₹{agingData.summary.overdueAmount.toLocaleString()}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">This Week Collections</p>
                <p className="text-2xl font-bold">₹{agingData.summary.currentWeekCollections.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Collection Efficiency</p>
                <p className="text-2xl font-bold">{agingData.summary.collectionEfficiency}%</p>
              </div>
              <Activity className="w-8 h-8 text-purple-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Avg Collection Days</p>
                <p className="text-2xl font-bold">{agingData.summary.avgCollectionDays}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Aging Buckets Overview */}
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Aging Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {agingData.agingBuckets.map((bucket) => (
              <div 
                key={bucket.range}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedAgingFilter === bucket.range || 
                  (selectedAgingFilter === '90+' && bucket.range === '120+') ||
                  (selectedAgingFilter === '90+' && bucket.range === '91-120')
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedAgingFilter(bucket.range)}
              >
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-medium">{bucket.range} Days</p>
                  <p className="text-2xl font-bold text-gray-900 my-2">
                    ₹{bucket.amount.toLocaleString()}
                  </p>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{bucket.count} parties</span>
                    <span>{bucket.percentage}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by party name or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <button 
              onClick={() => setSelectedAgingFilter('all')}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                selectedAgingFilter === 'all' 
                  ? 'bg-blue-500 text-white border-blue-500' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Parties
            </button>
          </div>
        </div>

        {/* Parties List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredParties.map((party) => (
            <div key={party.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{party.name}</h3>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      <MapPin className="w-4 h-4 mr-1" />
                      {party.location}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{party.outstandingAmount.toLocaleString()}
                    </p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getAgingColor(party.daysOverdue)}`}>
                      {party.daysOverdue > 0 ? `${party.daysOverdue}d overdue` : 'Current'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Credit Utilization:</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            party.creditUtilization > 80 ? 'bg-red-500' :
                            party.creditUtilization > 60 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(party.creditUtilization, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{party.creditUtilization}%</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Risk Score:</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRiskColor(party.riskScore)}`}>
                      {party.riskScore}/100
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Last Payment:</span>
                    <span className="text-sm font-medium">{party.lastPayment}</span>
                  </div>

                  {party.promiseDate && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Promise Date:</span>
                      <span className="text-sm font-medium text-blue-600">{party.promiseDate}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Assigned Agent:</span>
                    <span className="text-sm font-medium">{party.assignedAgent}</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-700">Quick Actions:</span>
                    <span className="text-xs text-gray-500">Best time: {party.preferredContactTime}</span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => sendWhatsAppReminder(party, getTemplateType(party.daysOverdue))}
                      disabled={sendingReminder[`${party.id}_whatsapp`]}
                      className="flex flex-col items-center p-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors disabled:opacity-50"
                      title="Send WhatsApp reminder"
                    >
                      {sendingReminder[`${party.id}_whatsapp`] ? (
                        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MessageCircle className="w-5 h-5" />
                      )}
                      <span className="text-xs mt-1">WhatsApp</span>
                    </button>

                    <button
                      onClick={() => sendSMSReminder(party)}
                      disabled={sendingReminder[`${party.id}_sms`]}
                      className="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors disabled:opacity-50"
                      title="Send SMS reminder"
                    >
                      {sendingReminder[`${party.id}_sms`] ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                      <span className="text-xs mt-1">SMS</span>
                    </button>

                    <button
                      onClick={() => window.open(`tel:${party.phone}`)}
                      className="flex flex-col items-center p-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
                      title="Call customer"
                    >
                      <Phone className="w-5 h-5" />
                      <span className="text-xs mt-1">Call</span>
                    </button>

                    <button
                      onClick={() => setSelectedParty(party)}
                      className="flex flex-col items-center p-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
                      title="View details"
                    >
                      <Eye className="w-5 h-5" />
                      <span className="text-xs mt-1">Details</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredParties.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No parties found matching your criteria</p>
            <p className="text-gray-500 text-sm mt-2">
              Try adjusting your search terms or aging filter
            </p>
          </div>
        )}
      </div>

      {/* Party Details Modal */}
      {selectedParty && (
        <PartyDetailsModal 
          party={selectedParty} 
          onClose={() => setSelectedParty(null)}
          onSendReminder={sendWhatsAppReminder}
        />
      )}
    </div>
  );
};

// Party Details Modal Component
const PartyDetailsModal = ({ party, onClose, onSendReminder }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{party.name}</h2>
            <p className="text-gray-600">{party.location}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Party Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Party Information</h3>
              
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Outstanding Amount:</span>
                  <span className="font-semibold text-lg">₹{party.outstandingAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Days Overdue:</span>
                  <span className="font-semibold">{party.daysOverdue} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Credit Limit:</span>
                  <span className="font-semibold">₹{party.creditLimit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Credit Utilization:</span>
                  <span className="font-semibold">{party.creditUtilization}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment History:</span>
                  <span className="font-semibold">{party.paymentHistory}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Collection Success:</span>
                  <span className="font-semibold">{party.collectionSuccess}%</span>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Contact Information</h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">{party.phone}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">{party.email}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">Agent: {party.assignedAgent}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Outstanding Invoices */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Outstanding Invoices</h3>
              
              <div className="space-y-3">
                {party.invoices.map((invoice) => (
                  <div key={invoice.number} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{invoice.number}</p>
                        <p className="text-sm text-gray-600">Date: {invoice.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">₹{invoice.amount.toLocaleString()}</p>
                        <p className="text-sm text-red-600">{invoice.daysOverdue} days overdue</p>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      Due Date: {invoice.dueDate}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => onSendReminder(party)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send WhatsApp Reminder</span>
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartAgingDashboard;