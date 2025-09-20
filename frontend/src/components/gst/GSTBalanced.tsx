import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, CheckCircle, AlertCircle, Calendar, 
  TrendingUp, FileText, Clock, ArrowUpRight, ArrowDownRight,
  RefreshCw, Loader2, AlertTriangle
} from 'lucide-react';
import { gstApi } from '../../services/api/modules/gst.api';
import { useToast } from '../global';

interface GSTBalancedProps {
  open?: boolean;
  onClose?: () => void;
}

interface DashboardData {
  taxPayable: number;
  inputCredit: number;
  netPayable: number;
  complianceScore: number;
  dueDate?: string;
}

interface ReturnStatus {
  gstr1: {
    status: string;
    amount: number;
    dueDate: string | null;
    filedDate: string | null;
  };
  gstr3b: {
    status: string;
    amount: number;
    dueDate: string | null;
    filedDate: string | null;
  };
  gstr2a: {
    status: string;
    amount: number;
    lastUpdated: string | null;
  };
}

const GSTBalanced: React.FC<GSTBalancedProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
  });
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    taxPayable: 0,
    inputCredit: 0,
    netPayable: 0,
    complianceScore: 0
  });
  
  const [returnStatus, setReturnStatus] = useState<ReturnStatus>({
    gstr1: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
    gstr3b: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
    gstr2a: { status: 'available', amount: 0, lastUpdated: null }
  });
  
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setError(null);
      const [summaryData, returnsData] = await Promise.all([
        gstApi.dashboard.getSummary(selectedPeriod),
        gstApi.returns.getStatus(selectedPeriod)
      ]);

      setDashboardData({
        taxPayable: summaryData.taxPayable || summaryData.outputTax || 0,
        inputCredit: summaryData.inputCredit || summaryData.inputTax || 0,
        netPayable: summaryData.netPayable || (summaryData.taxPayable - summaryData.inputCredit) || 0,
        complianceScore: summaryData.complianceScore || calculateComplianceScore(returnsData),
        dueDate: summaryData.dueDate || getDueDate()
      });

      setReturnStatus(returnsData);
    } catch (error) {
      setError('Failed to load GST data. Please try again.');
      
      // Set default data on error
      setDashboardData({
        taxPayable: 0,
        inputCredit: 0,
        netPayable: 0,
        complianceScore: 0
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Calculate compliance score based on return status
  const calculateComplianceScore = (returns: ReturnStatus): number => {
    let score = 0;
    let total = 0;
    
    if (returns.gstr1) {
      total += 1;
      if (returns.gstr1.status === 'filed') score += 1;
    }
    
    if (returns.gstr3b) {
      total += 1;
      if (returns.gstr3b.status === 'filed') score += 1;
    }
    
    return total > 0 ? Math.round((score / total) * 100) : 0;
  };

  // Get due date for current period
  const getDueDate = (): string => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 20);
    return nextMonth.toLocaleDateString();
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format date
  const formatDate = (date: string | null): string => {
    if (!date) return 'Not available';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'filed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'overdue':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-blue-500" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filed':
        return 'text-green-600';
      case 'pending':
        return 'text-amber-600';
      case 'overdue':
        return 'text-red-600';
      default:
        return 'text-blue-600';
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success('GST data refreshed');
  };

  // Handle return click
  const handleReturnClick = (returnType: string) => {
    // Navigate to specific return filing page
  };

  // Load data on mount and period change
  useEffect(() => {
    fetchDashboardData();
  }, [selectedPeriod]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">GST Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">{selectedPeriod}</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="text-sm text-red-600 hover:text-red-700 underline mt-1"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading GST data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Key Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Tax Payable Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Tax Payable</span>
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(dashboardData.taxPayable)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Due by {dashboardData.dueDate || getDueDate()}
                </div>
              </div>

              {/* Input Credit Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Input Credit</span>
                  <ArrowDownRight className="w-4 h-4 text-green-500" />
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(dashboardData.inputCredit)}
                </div>
                <div className="text-sm text-gray-500 mt-1">Available</div>
              </div>

              {/* Compliance Score */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-500">Compliance</span>
                  {dashboardData.complianceScore === 100 ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : dashboardData.complianceScore >= 50 ? (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {dashboardData.complianceScore}%
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {dashboardData.complianceScore === 100 
                    ? 'All returns filed' 
                    : 'Some returns pending'}
                </div>
              </div>
            </div>

            {/* Returns Section */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">Returns Status</h2>
              </div>
              
              <div className="divide-y divide-gray-100">
                {/* GSTR-1 */}
                <div 
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleReturnClick('GSTR-1')}
                >
                  <div className="flex items-center">
                    {getStatusIcon(returnStatus.gstr1.status)}
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">GSTR-1</div>
                      <div className="text-sm text-gray-500">Outward Supplies</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(returnStatus.gstr1.amount)}
                      </div>
                      <div className={`text-xs ${getStatusColor(returnStatus.gstr1.status)}`}>
                        {returnStatus.gstr1.status === 'filed' 
                          ? `Filed on ${formatDate(returnStatus.gstr1.filedDate)}`
                          : returnStatus.gstr1.dueDate 
                          ? `Due on ${formatDate(returnStatus.gstr1.dueDate)}`
                          : 'Status pending'}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {/* GSTR-3B */}
                <div 
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleReturnClick('GSTR-3B')}
                >
                  <div className="flex items-center">
                    {getStatusIcon(returnStatus.gstr3b.status)}
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">GSTR-3B</div>
                      <div className="text-sm text-gray-500">Summary Return</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(returnStatus.gstr3b.amount)}
                      </div>
                      <div className={`text-xs ${getStatusColor(returnStatus.gstr3b.status)}`}>
                        {returnStatus.gstr3b.status === 'filed' 
                          ? `Filed on ${formatDate(returnStatus.gstr3b.filedDate)}`
                          : returnStatus.gstr3b.dueDate 
                          ? `Due on ${formatDate(returnStatus.gstr3b.dueDate)}`
                          : 'Status pending'}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {/* GSTR-2A */}
                <div 
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleReturnClick('GSTR-2A')}
                >
                  <div className="flex items-center">
                    {getStatusIcon(returnStatus.gstr2a.status)}
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">GSTR-2A</div>
                      <div className="text-sm text-gray-500">Auto-drafted Supplies</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(returnStatus.gstr2a.amount)}
                      </div>
                      <div className={`text-xs ${getStatusColor(returnStatus.gstr2a.status)}`}>
                        {returnStatus.gstr2a.lastUpdated 
                          ? `Updated ${formatDate(returnStatus.gstr2a.lastUpdated)}`
                          : 'View Details'}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <button 
                onClick={() => handleReturnClick('file-return')}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-blue-500 mb-2" />
                <div className="font-medium text-gray-900">File Return</div>
                <div className="text-xs text-gray-500">Quick filing</div>
              </button>
              
              <button 
                onClick={() => handleReturnClick('view-reports')}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <TrendingUp className="w-5 h-5 text-green-500 mb-2" />
                <div className="font-medium text-gray-900">View Reports</div>
                <div className="text-xs text-gray-500">Tax analysis</div>
              </button>
              
              <button 
                onClick={() => handleReturnClick('calendar')}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <Calendar className="w-5 h-5 text-purple-500 mb-2" />
                <div className="font-medium text-gray-900">Calendar</div>
                <div className="text-xs text-gray-500">Due dates</div>
              </button>
              
              <button 
                onClick={() => handleReturnClick('history')}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <Clock className="w-5 h-5 text-amber-500 mb-2" />
                <div className="font-medium text-gray-900">History</div>
                <div className="text-xs text-gray-500">Past filings</div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GSTBalanced;