import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Play, 
  Pause, 
  Save, 
  Copy,
  Clock,
  Users,
  MessageCircle,
  Phone,
  Mail,
  Send,
  Settings,
  Target,
  Filter,
  Calendar,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useToast } from '../global';

const CampaignBuilder = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Campaign states
  const [campaign, setCampaign] = useState({
    name: '',
    description: '',
    status: 'draft', // draft, active, paused, completed
    triggers: [
      {
        id: 1,
        type: 'aging',
        condition: 'days_overdue',
        operator: 'greater_than',
        value: 7,
        enabled: true
      }
    ],
    actions: [
      {
        id: 1,
        type: 'whatsapp',
        delay: 0, // hours
        template: 'friendly_reminder',
        enabled: true,
        conditions: []
      }
    ],
    segments: ['all'],
    schedule: {
      timezone: 'Asia/Kolkata',
      business_hours_only: true,
      start_time: '10:00',
      end_time: '18:00',
      weekdays_only: true,
      exclude_holidays: true
    },
    stats: {
      total_sent: 0,
      total_opened: 0,
      total_clicked: 0,
      total_payments: 0,
      conversion_rate: 0
    }
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      // TODO: Replace with real API call
      const mockCampaigns = [
        {
          id: 1,
          name: 'Overdue Reminder Campaign',
          description: 'Automated reminders for overdue customers',
          status: 'active',
          created_at: '2024-07-01',
          last_run: '2024-07-25',
          stats: {
            total_sent: 150,
            total_opened: 120,
            total_clicked: 45,
            total_payments: 12,
            conversion_rate: 8.0
          },
          triggers: [
            { type: 'aging', condition: 'days_overdue > 7' }
          ],
          actions: [
            { type: 'whatsapp', template: 'friendly_reminder', delay: 0 },
            { type: 'sms', template: 'formal_notice', delay: 72 },
            { type: 'call_task', delay: 168 }
          ]
        },
        {
          id: 2,
          name: 'High Value Customer Follow-up',
          description: 'Premium follow-up for customers with >₹50k outstanding',
          status: 'draft',
          created_at: '2024-07-20',
          stats: {
            total_sent: 0,
            conversion_rate: 0
          },
          triggers: [
            { type: 'amount', condition: 'outstanding_amount > 50000' }
          ],
          actions: [
            { type: 'call_task', delay: 0 },
            { type: 'whatsapp', template: 'premium_reminder', delay: 24 }
          ]
        }
      ];
      setCampaigns(mockCampaigns);
    } catch (error) {
      toast.error('Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  const ActionTypes = {
    whatsapp: {
      icon: MessageCircle,
      label: 'WhatsApp',
      color: 'bg-green-500',
      templates: ['friendly_reminder', 'formal_notice', 'urgent_notice', 'final_notice']
    },
    sms: {
      icon: Send,
      label: 'SMS',
      color: 'bg-blue-500',
      templates: ['short_reminder', 'payment_due', 'urgent_collection']
    },
    email: {
      icon: Mail,
      label: 'Email',
      color: 'bg-purple-500',
      templates: ['detailed_statement', 'payment_request', 'legal_notice']
    },
    call_task: {
      icon: Phone,
      label: 'Call Task',
      color: 'bg-orange-500',
      templates: ['call_script_friendly', 'call_script_formal', 'call_script_urgent']
    }
  };

  const TriggerTypes = {
    aging: {
      label: 'Days Overdue',
      operators: ['greater_than', 'less_than', 'equal_to', 'between'],
      valueType: 'number'
    },
    amount: {
      label: 'Outstanding Amount',
      operators: ['greater_than', 'less_than', 'equal_to', 'between'],
      valueType: 'currency'
    },
    segment: {
      label: 'Customer Segment',
      operators: ['in', 'not_in'],
      valueType: 'select',
      options: ['high_value', 'regular', 'slow_payer', 'risk_customer']
    },
    payment_history: {
      label: 'Payment Behavior',
      operators: ['equal_to', 'not_equal_to'],
      valueType: 'select',
      options: ['excellent', 'good', 'average', 'poor']
    }
  };

  const addAction = (actionType) => {
    const newAction = {
      id: Date.now(),
      type: actionType,
      delay: 0,
      template: ActionTypes[actionType].templates[0],
      enabled: true,
      conditions: []
    };
    setCampaign(prev => ({
      ...prev,
      actions: [...prev.actions, newAction]
    }));
  };

  const updateAction = (actionId, field, value) => {
    setCampaign(prev => ({
      ...prev,
      actions: prev.actions.map(action =>
        action.id === actionId ? { ...action, [field]: value } : action
      )
    }));
  };

  const deleteAction = (actionId) => {
    setCampaign(prev => ({
      ...prev,
      actions: prev.actions.filter(action => action.id !== actionId)
    }));
  };

  const saveCampaign = async () => {
    try {
      setLoading(true);
      // TODO: API call to save campaign
      console.log('Saving campaign:', campaign);
      toast.success('Campaign saved successfully');
      setShowBuilder(false);
      fetchCampaigns();
    } catch (error) {
      toast.error('Failed to save campaign');
    } finally {
      setLoading(false);
    }
  };

  const toggleCampaignStatus = async (campaignId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      // TODO: API call to update status
      setCampaigns(prev => prev.map(c => 
        c.id === campaignId ? { ...c, status: newStatus } : c
      ));
      toast.success(`Campaign ${newStatus === 'active' ? 'activated' : 'paused'}`);
    } catch (error) {
      toast.error('Failed to update campaign status');
    }
  };

  const CampaignCard = ({ campaign: camp }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{camp.name}</h3>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              camp.status === 'active' ? 'bg-green-100 text-green-800' :
              camp.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {camp.status.charAt(0).toUpperCase() + camp.status.slice(1)}
            </span>
          </div>
          <p className="text-gray-600 text-sm">{camp.description}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => toggleCampaignStatus(camp.id, camp.status)}
            className={`p-2 rounded-full transition-colors ${
              camp.status === 'active' 
                ? 'text-yellow-600 hover:bg-yellow-100' 
                : 'text-green-600 hover:bg-green-100'
            }`}
            title={camp.status === 'active' ? 'Pause campaign' : 'Start campaign'}
          >
            {camp.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              setActiveCampaign(camp);
              setCampaign(camp);
              setShowBuilder(true);
            }}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            title="Edit campaign"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Campaign Flow Preview */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Campaign Flow:</h4>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          {camp.triggers?.map((trigger, index) => (
            <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
              {trigger.condition}
            </span>
          ))}
          <ArrowRight className="w-4 h-4" />
          {camp.actions?.slice(0, 3).map((action, index) => {
            const ActionIcon = ActionTypes[action.type]?.icon || MessageCircle;
            return (
              <div key={index} className="flex items-center space-x-1">
                <div className={`p-1 rounded text-white ${ActionTypes[action.type]?.color || 'bg-gray-500'}`}>
                  <ActionIcon className="w-3 h-3" />
                </div>
                {action.delay > 0 && (
                  <span className="text-xs text-gray-500">+{action.delay}h</span>
                )}
                {index < Math.min(camp.actions.length - 1, 2) && (
                  <ArrowRight className="w-3 h-3" />
                )}
              </div>
            );
          })}
          {camp.actions?.length > 3 && (
            <span className="text-xs text-gray-500">+{camp.actions.length - 3} more</span>
          )}
        </div>
      </div>

      {/* Stats */}
      {camp.stats && (
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{camp.stats.total_sent || 0}</div>
            <div className="text-xs text-gray-600">Sent</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{camp.stats.total_opened || 0}</div>
            <div className="text-xs text-gray-600">Opened</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{camp.stats.total_payments || 0}</div>
            <div className="text-xs text-gray-600">Payments</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">{camp.stats.conversion_rate || 0}%</div>
            <div className="text-xs text-gray-600">Conversion</div>
          </div>
        </div>
      )}
    </div>
  );

  const WorkflowCanvas = () => (
    <div className="bg-gray-50 rounded-lg p-6 min-h-96">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Campaign Workflow</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">Drag to reorder actions</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Triggers */}
        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center space-x-2 mb-3">
            <Target className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-blue-900">Triggers</h4>
          </div>
          {campaign.triggers.map((trigger, index) => (
            <div key={trigger.id} className="flex items-center space-x-2 text-sm">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                {TriggerTypes[trigger.type]?.label} {trigger.operator.replace('_', ' ')} {trigger.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <ArrowRight className="w-6 h-6 text-gray-400" />
        </div>

        {/* Actions Flow */}
        <div className="space-y-3">
          {campaign.actions.map((action, index) => {
            const ActionIcon = ActionTypes[action.type]?.icon || MessageCircle;
            return (
              <div key={action.id} className="relative">
                <div className="bg-white rounded-lg p-4 border border-gray-200 flex items-center space-x-4">
                  <div className={`p-2 rounded-full text-white ${ActionTypes[action.type]?.color || 'bg-gray-500'}`}>
                    <ActionIcon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium">{ActionTypes[action.type]?.label}</span>
                      {action.delay > 0 && (
                        <span className="text-sm text-gray-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          Wait {action.delay}h
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      Template: {action.template.replace('_', ' ')}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <select
                      value={action.template}
                      onChange={(e) => updateAction(action.id, 'template', e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {ActionTypes[action.type]?.templates.map(template => (
                        <option key={template} value={template}>
                          {template.replace('_', ' ')}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={action.delay}
                      onChange={(e) => updateAction(action.id, 'delay', parseInt(e.target.value))}
                      placeholder="Delay (hours)"
                      className="w-20 text-sm border border-gray-300 rounded px-2 py-1"
                    />

                    <button
                      onClick={() => deleteAction(action.id)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {index < campaign.actions.length - 1 && (
                  <div className="flex justify-center py-2">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Action Button */}
        <div className="bg-gray-100 rounded-lg p-4 border-2 border-dashed border-gray-300">
          <div className="text-center">
            <p className="text-gray-600 mb-3">Add new action to workflow</p>
            <div className="flex justify-center space-x-2">
              {Object.entries(ActionTypes).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => addAction(type)}
                    className={`p-3 rounded-lg text-white hover:opacity-90 transition-opacity ${config.color}`}
                    title={`Add ${config.label}`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (showBuilder) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Builder Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {activeCampaign ? 'Edit Campaign' : 'Create New Campaign'}
              </h1>
              <p className="text-gray-600 mt-1">
                Build automated collection workflows with smart triggers and actions
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCampaign}
                disabled={loading || !campaign.name}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'Saving...' : 'Save Campaign'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaign Settings */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Campaign Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Campaign Name *
                    </label>
                    <input
                      type="text"
                      value={campaign.name}
                      onChange={(e) => setCampaign(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter campaign name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={campaign.description}
                      onChange={(e) => setCampaign(prev => ({ ...prev, description: e.target.value }))}
                      rows="3"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe your campaign"
                    />
                  </div>
                </div>
              </div>

              {/* Schedule Settings */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Schedule Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Business hours only</span>
                    <input
                      type="checkbox"
                      checked={campaign.schedule.business_hours_only}
                      onChange={(e) => setCampaign(prev => ({
                        ...prev,
                        schedule: { ...prev.schedule, business_hours_only: e.target.checked }
                      }))}
                      className="rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Weekdays only</span>
                    <input
                      type="checkbox"
                      checked={campaign.schedule.weekdays_only}
                      onChange={(e) => setCampaign(prev => ({
                        ...prev,
                        schedule: { ...prev.schedule, weekdays_only: e.target.checked }
                      }))}
                      className="rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Exclude holidays</span>
                    <input
                      type="checkbox"
                      checked={campaign.schedule.exclude_holidays}
                      onChange={(e) => setCampaign(prev => ({
                        ...prev,
                        schedule: { ...prev.schedule, exclude_holidays: e.target.checked }
                      }))}
                      className="rounded"
                    />
                  </div>

                  {campaign.schedule.business_hours_only && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={campaign.schedule.start_time}
                          onChange={(e) => setCampaign(prev => ({
                            ...prev,
                            schedule: { ...prev.schedule, start_time: e.target.value }
                          }))}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">End Time</label>
                        <input
                          type="time"
                          value={campaign.schedule.end_time}
                          onChange={(e) => setCampaign(prev => ({
                            ...prev,
                            schedule: { ...prev.schedule, end_time: e.target.value }
                          }))}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Workflow Canvas */}
            <div className="lg:col-span-2">
              <WorkflowCanvas />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Collection Campaigns</h1>
            <p className="text-gray-600 mt-1">
              Automate your collection process with intelligent campaigns
            </p>
          </div>
          <button
            onClick={() => {
              setActiveCampaign(null);
              setCampaign({
                name: '',
                description: '',
                status: 'draft',
                triggers: [
                  {
                    id: 1,
                    type: 'aging',
                    condition: 'days_overdue',
                    operator: 'greater_than',
                    value: 7,
                    enabled: true
                  }
                ],
                actions: [],
                segments: ['all'],
                schedule: {
                  timezone: 'Asia/Kolkata',
                  business_hours_only: true,
                  start_time: '10:00',
                  end_time: '18:00',
                  weekdays_only: true,
                  exclude_holidays: true
                },
                stats: {
                  total_sent: 0,
                  total_opened: 0,
                  total_clicked: 0,
                  total_payments: 0,
                  conversion_rate: 0
                }
              });
              setShowBuilder(true);
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="max-w-7xl mx-auto p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
            <p className="text-gray-600 mb-6">Create your first automated collection campaign to get started</p>
            <button
              onClick={() => setShowBuilder(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Your First Campaign
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {campaigns.map((camp) => (
              <CampaignCard key={camp.id} campaign={camp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignBuilder;