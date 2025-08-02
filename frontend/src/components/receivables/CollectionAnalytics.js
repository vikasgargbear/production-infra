import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Filter, 
  Download, 
  RefreshCw, 
  Users,
  DollarSign,
  Clock,
  Target,
  Activity,
  Award,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Phone,
  MessageCircle,
  BarChart3,
  PieChart,
  LineChart
} from 'lucide-react';
import { useToast } from '../global';

const CollectionAnalytics = () => {
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    end: new Date().toISOString().split('T')[0] // today
  });
  const [activeTab, setActiveTab] = useState('overview'); // overview, trends, agents, geography
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      // Mock analytics data - replace with API call
      const mockData = {
        summary: {
          total_collections: 2850000,
          collection_rate: 85.5,
          total_outstanding: 4200000,
          avg_collection_days: 42,
          collections_change: 12.5,
          rate_change: -2.1,
          outstanding_change: -8.3,
          time_change: -3.2
        },
        daily_collections: [
          { date: '2024-07-01', amount: 125000, count: 8 },
          { date: '2024-07-02', amount: 98000, count: 6 },
          { date: '2024-07-03', amount: 142000, count: 11 },
          { date: '2024-07-04', amount: 89000, count: 5 },
          { date: '2024-07-05', amount: 156000, count: 9 },
          { date: '2024-07-06', amount: 134000, count: 7 },
          { date: '2024-07-07', amount: 167000, count: 12 }
        ],
        aging_movement: [
          { period: 'Week 1', current: 850000, overdue_30: 650000, overdue_60: 480000, overdue_90: 420000 },
          { period: 'Week 2', current: 820000, overdue_30: 680000, overdue_60: 460000, overdue_90: 440000 },
          { period: 'Week 3', current: 890000, overdue_30: 640000, overdue_60: 490000, overdue_90: 410000 },
          { period: 'Week 4', current: 850000, overdue_30: 650000, overdue_60: 480000, overdue_90: 420000 }
        ],
        agent_performance: [
          {
            id: 1,
            name: 'Rajesh Kumar',
            avatar: '/api/placeholder/40/40',
            region: 'Mumbai North',
            total_collections: 450000,
            total_visits: 85,
            success_rate: 78,
            avg_per_visit: 5294,
            target_achievement: 112,
            customers_handled: 45,
            promises_kept: 34
          },
          {
            id: 2,
            name: 'Priya Sharma',
            avatar: '/api/placeholder/40/40',
            region: 'Pune Central',
            total_collections: 380000,
            total_visits: 72,
            success_rate: 82,
            avg_per_visit: 5278,
            target_achievement: 98,
            customers_handled: 38,
            promises_kept: 31
          },
          {
            id: 3,
            name: 'Amit Patel',
            avatar: '/api/placeholder/40/40',
            region: 'Delhi NCR',
            total_collections: 420000,
            total_visits: 68,
            success_rate: 75,
            avg_per_visit: 6176,
            target_achievement: 105,
            customers_handled: 42,
            promises_kept: 29
          },
          {
            id: 4,
            name: 'Sunita Reddy',
            avatar: '/api/placeholder/40/40',
            region: 'Hyderabad',
            total_collections: 350000,
            total_visits: 78,
            success_rate: 80,
            avg_per_visit: 4487,
            target_achievement: 89,
            customers_handled: 52,
            promises_kept: 38
          }
        ],
        collection_methods: [
          { method: 'Field Visit', amount: 1200000, percentage: 42.1 },
          { method: 'WhatsApp Reminder', amount: 850000, percentage: 29.8 },
          { method: 'Phone Call', amount: 480000, percentage: 16.8 },
          { method: 'SMS Reminder', amount: 320000, percentage: 11.2 }
        ],
        geographic_performance: [
          { region: 'Mumbai', collections: 680000, outstanding: 1200000, efficiency: 85 },
          { region: 'Delhi NCR', collections: 620000, outstanding: 1100000, efficiency: 82 },
          { region: 'Pune', collections: 450000, outstanding: 800000, efficiency: 78 },
          { region: 'Hyderabad', collections: 380000, outstanding: 650000, efficiency: 75 },
          { region: 'Chennai', collections: 340000, outstanding: 580000, efficiency: 73 }
        ],
        customer_segments: [
          { segment: 'High Value (>₹1L)', collections: 1400000, count: 25, avg_days: 35 },
          { segment: 'Medium (₹50K-₹1L)', collections: 950000, count: 45, avg_days: 42 },
          { segment: 'Small (<₹50K)', collections: 500000, count: 120, avg_days: 28 }
        ]
      };
      setAnalyticsData(mockData);
    } catch (error) {
      toast.error('Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ title, value, change, trend, icon: Icon, color = "blue" }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <div className={`flex items-center mt-2 text-sm ${
              trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {trend === 'up' ? (
                <ArrowUpRight className="w-4 h-4 mr-1" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="w-4 h-4 mr-1" />
              ) : null}
              <span>{Math.abs(change)}% from last period</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full bg-${color}-100`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
      </div>
    </div>
  );

  const CollectionTrendsChart = ({ data }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Collection Trends</h3>
      <div className="h-64 flex items-end space-x-2">
        {data.map((day, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div 
              className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
              style={{ 
                height: `${(day.amount / Math.max(...data.map(d => d.amount))) * 200}px`,
                minHeight: '10px'
              }}
              title={`₹${day.amount.toLocaleString()} (${day.count} transactions)`}
            />
            <div className="text-xs text-gray-500 mt-2 text-center">
              {new Date(day.date).getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-sm text-gray-600">
        <span>₹0</span>
        <span>₹{Math.max(...data.map(d => d.amount)).toLocaleString()}</span>
      </div>
    </div>
  );

  const AgentPerformanceTable = ({ agents }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Agent Performance Leaderboard</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Collections
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Visits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Success Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target Achievement
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agents.map((agent, index) => (
              <tr key={agent.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <img 
                        className="h-10 w-10 rounded-full" 
                        src={agent.avatar} 
                        alt={agent.name}
                      />
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm font-medium text-gray-900">
                          {agent.name}
                        </div>
                        {index < 3 && (
                          <Award className={`w-4 h-4 ${
                            index === 0 ? 'text-yellow-500' : 
                            index === 1 ? 'text-gray-400' : 
                            'text-orange-600'
                          }`} />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{agent.region}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">
                    ₹{agent.total_collections.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {agent.customers_handled} customers
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {agent.total_visits}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    agent.success_rate > 80 
                      ? 'bg-green-100 text-green-800' 
                      : agent.success_rate > 70 
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}>
                    {agent.success_rate}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                      <div 
                        className={`h-2 rounded-full ${
                          agent.target_achievement >= 100 ? 'bg-green-500' :
                          agent.target_achievement >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(agent.target_achievement, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{agent.target_achievement}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex space-x-2">
                    <button className="text-blue-600 hover:text-blue-800">
                      <Phone className="w-4 h-4" />
                    </button>
                    <button className="text-green-600 hover:text-green-800">
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const CollectionMethodsChart = ({ data }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Collection Methods Effectiveness</h3>
      <div className="space-y-4">
        {data.map((method, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded-full ${
                index === 0 ? 'bg-blue-500' :
                index === 1 ? 'bg-green-500' :
                index === 2 ? 'bg-yellow-500' : 'bg-purple-500'
              }`} />
              <span className="text-sm font-medium text-gray-700">{method.method}</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    index === 0 ? 'bg-blue-500' :
                    index === 1 ? 'bg-green-500' :
                    index === 2 ? 'bg-yellow-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${method.percentage}%` }}
                />
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  ₹{method.amount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  {method.percentage}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const GeographicPerformance = ({ data }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Geographic Performance</h3>
      <div className="space-y-4">
        {data.map((region, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-gray-900">{region.region}</span>
              </div>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                region.efficiency > 80 ? 'bg-green-100 text-green-800' :
                region.efficiency > 70 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {region.efficiency}% efficiency
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600">Collections</div>
                <div className="text-lg font-bold text-green-600">
                  ₹{region.collections.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Outstanding</div>
                <div className="text-lg font-bold text-red-600">
                  ₹{region.outstanding.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Collection Analytics</h1>
            <p className="text-gray-600 mt-1">
              Comprehensive insights into your collection performance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={fetchAnalyticsData}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'trends', label: 'Trends', icon: TrendingUp },
            { id: 'agents', label: 'Agents', icon: Users },
            { id: 'geography', label: 'Geography', icon: MapPin }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Total Collections"
                value={`₹${analyticsData?.summary?.total_collections?.toLocaleString()}`}
                change={analyticsData?.summary?.collections_change}
                trend="up"
                icon={DollarSign}
                color="green"
              />
              <MetricCard
                title="Collection Rate"
                value={`${analyticsData?.summary?.collection_rate}%`}
                change={analyticsData?.summary?.rate_change}
                trend="down"
                icon={Target}
                color="blue"
              />
              <MetricCard
                title="Outstanding Amount"
                value={`₹${analyticsData?.summary?.total_outstanding?.toLocaleString()}`}
                change={analyticsData?.summary?.outstanding_change}
                trend="down"
                icon={AlertTriangle}
                color="red"
              />
              <MetricCard
                title="Avg Collection Days"
                value={`${analyticsData?.summary?.avg_collection_days} days`}
                change={analyticsData?.summary?.time_change}
                trend="down"
                icon={Clock}
                color="purple"
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CollectionTrendsChart data={analyticsData?.daily_collections || []} />
              <CollectionMethodsChart data={analyticsData?.collection_methods || []} />
            </div>

            {/* Customer Segments */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Segment Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {analyticsData?.customer_segments?.map((segment, index) => (
                  <div key={index} className="text-center p-4 border border-gray-200 rounded-lg">
                    <div className="text-sm text-gray-600 mb-2">{segment.segment}</div>
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      ₹{segment.collections.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {segment.count} customers • {segment.avg_days} avg days
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-6">
            <CollectionTrendsChart data={analyticsData?.daily_collections || []} />
            
            {/* Aging Movement Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Aging Movement Analysis</h3>
              <div className="h-64 flex items-end justify-between space-x-2">
                {analyticsData?.aging_movement?.map((week, index) => (
                  <div key={index} className="flex-1 space-y-1">
                    <div className="text-center text-xs text-gray-600 mb-2">{week.period}</div>
                    <div className="space-y-1">
                      <div 
                        className="bg-green-500 rounded-t"
                        style={{ height: `${(week.current / 1000000) * 50}px`, minHeight: '10px' }}
                        title={`Current: ₹${week.current.toLocaleString()}`}
                      />
                      <div 
                        className="bg-yellow-500"
                        style={{ height: `${(week.overdue_30 / 1000000) * 50}px`, minHeight: '10px' }}
                        title={`30d Overdue: ₹${week.overdue_30.toLocaleString()}`}
                      />
                      <div 
                        className="bg-orange-500"
                        style={{ height: `${(week.overdue_60 / 1000000) * 50}px`, minHeight: '10px' }}
                        title={`60d Overdue: ₹${week.overdue_60.toLocaleString()}`}
                      />
                      <div 
                        className="bg-red-500 rounded-b"
                        style={{ height: `${(week.overdue_90 / 1000000) * 50}px`, minHeight: '10px' }}
                        title={`90d+ Overdue: ₹${week.overdue_90.toLocaleString()}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-center space-x-6 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Current</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded" />
                  <span>0-30 Days</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-500 rounded" />
                  <span>30-60 Days</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>60+ Days</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-6">
            <AgentPerformanceTable agents={analyticsData?.agent_performance || []} />
          </div>
        )}

        {activeTab === 'geography' && (
          <div className="space-y-6">
            <GeographicPerformance data={analyticsData?.geographic_performance || []} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionAnalytics;