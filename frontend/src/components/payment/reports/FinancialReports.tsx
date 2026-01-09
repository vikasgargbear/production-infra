import React, { useState, useEffect } from 'react';
import {
  TrendingUp, FileText, BarChart3, Loader2, RefreshCw, AlertCircle
} from 'lucide-react';
import { ModuleHeader } from '../../global';
import { reportsApi, ledgerApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface FinancialReportsProps {
  onClose?: () => void;
}

interface ReportData {
  reportId: string;
  period: string;
  generatedAt: string;
  data: any;
  summary?: {
    totalAssets?: number;
    totalLiabilities?: number;
    netWorth?: number;
    totalIncome?: number;
    totalExpenses?: number;
    netProfit?: number;
  };
}

const FinancialReports: React.FC<FinancialReportsProps> = ({ onClose }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [selectedReport, setSelectedReport] = useState('');

  // API data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const reports = [
    {
      id: 'trial_balance',
      name: 'Trial Balance',
      description: 'Account-wise balance verification',
      icon: BarChart3,
      color: 'bg-blue-500'
    },
    {
      id: 'profit_loss',
      name: 'Profit & Loss',
      description: 'Income statement analysis',
      icon: TrendingUp,
      color: 'bg-green-500'
    },
    {
      id: 'balance_sheet',
      name: 'Balance Sheet',
      description: 'Financial position statement',
      icon: FileText,
      color: 'bg-purple-500'
    }
  ];

  useEffect(() => {
    // Load initial data
    // No initial API call required; data loads on report generation
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      // For now, nothing to refresh globally; keep UX consistent
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const generateReport = async (reportId: string) => {
    setSelectedReport(reportId);
    setIsLoading(true);
    setError(null);

    try {

      let reportResponse;

      // Call the actual API to generate the report based on type
      switch (reportId) {
        case 'trial_balance':
          reportResponse = await (reportsApi as any).trialBalance({ period: selectedPeriod });
          break;
        case 'profit_loss':
          reportResponse = await (reportsApi as any).profitLoss({ period: selectedPeriod });
          break;
        case 'balance_sheet':
          reportResponse = await (reportsApi as any).balanceSheet({ period: selectedPeriod });
          break;
        default:
          throw new Error(`Unknown report type: ${reportId}`);
      }

      if (reportResponse?.data) {
        const newReportData: ReportData = {
          reportId,
          period: selectedPeriod,
          generatedAt: new Date().toISOString(),
          data: reportResponse.data,
          summary: reportResponse.data.summary
        };

        setReportData(newReportData);

        // Store report data offline for future use
        const storageKey = `financial_report_${reportId}_${selectedPeriod}`;
        await offlineStorage.storeOffline(storageKey, newReportData, {
          critical: true,
          persistent: true
        });

        setError(null);
      } else {
        throw new Error('Invalid report data received');
      }

    } catch (error) {

      // Try to load from offline storage instead of using mock data
      const storageKey = `financial_report_${reportId}_${selectedPeriod}`;
      const offlineData = await offlineStorage.getOffline(storageKey, { critical: true });

      if (offlineData && !offlineStorage.isDataStale(offlineData, 120)) { // 2 hours max for report data
        setReportData(offlineData.data);
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        setError(`Failed to generate ${reportId} report. Please check your connection and try again.`);
        setReportData(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Financial Reports"
          documentNumber={`RPT-${new Date().getFullYear()}`}
          status={`Period: ${selectedPeriod.replace('_', ' ').toUpperCase()}`}
          icon={TrendingUp}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="reports"
          onSaveDraft={() => { }}
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "default",
              icon: refreshing ? Loader2 : RefreshCw,
              disabled: refreshing
            },
            {
              label: 'Export PDF',
              onClick: () => console.log('Export PDF'),
              variant: 'secondary'
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+G</strong> - Generate Report | <strong>Ctrl+D</strong> - Download | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-blue-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Loading financial reports...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                <div className="text-center max-w-md mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Period Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Report Period</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'this_month', label: 'This Month' },
                  { value: 'last_month', label: 'Last Month' },
                  { value: 'this_quarter', label: 'This Quarter' },
                  { value: 'this_year', label: 'This Year' }
                ].map(period => (
                  <button
                    key={period.value}
                    onClick={() => setSelectedPeriod(period.value)}
                    className={`p-3 rounded-lg border text-sm font-medium transition-colors ${selectedPeriod === period.value
                      ? 'bg-purple-50 border-purple-200 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Report Options */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Available Reports</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reports.map(report => {
                  const Icon = report.icon;
                  return (
                    <div
                      key={report.id}
                      className={`p-6 rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors cursor-pointer ${selectedReport === report.id ? 'border-purple-400 bg-purple-50' : 'bg-white'
                        }`}
                      onClick={() => generateReport(report.id)}
                    >
                      <div className="text-center">
                        <div className={`w-12 h-12 ${report.color} rounded-lg flex items-center justify-center mx-auto mb-3`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">{report.name}</h4>
                        <p className="text-sm text-gray-600 mb-4">{report.description}</p>
                        <button
                          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${selectedReport === report.id
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {selectedReport === report.id ? 'Selected' : 'Generate'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Report Results */}
            {reportData && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {reports.find(r => r.id === reportData.reportId)?.name} Report
                  </h3>
                  <div className="text-sm text-gray-500">
                    Generated: {new Date(reportData.generatedAt).toLocaleString()}
                  </div>
                </div>

                {reportData.summary && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {reportData.summary.totalAssets !== undefined && (
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Assets</p>
                        <p className="text-2xl font-bold text-blue-600">₹{reportData.summary.totalAssets.toLocaleString()}</p>
                      </div>
                    )}
                    {reportData.summary.totalLiabilities !== undefined && (
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Liabilities</p>
                        <p className="text-2xl font-bold text-red-600">₹{reportData.summary.totalLiabilities.toLocaleString()}</p>
                      </div>
                    )}
                    {reportData.summary.netWorth !== undefined && (
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Net Worth</p>
                        <p className="text-2xl font-bold text-green-600">₹{reportData.summary.netWorth.toLocaleString()}</p>
                      </div>
                    )}
                    {reportData.summary.totalIncome !== undefined && (
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Income</p>
                        <p className="text-2xl font-bold text-green-600">₹{reportData.summary.totalIncome.toLocaleString()}</p>
                      </div>
                    )}
                    {reportData.summary.totalExpenses !== undefined && (
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Expenses</p>
                        <p className="text-2xl font-bold text-red-600">₹{reportData.summary.totalExpenses.toLocaleString()}</p>
                      </div>
                    )}
                    {reportData.summary.netProfit !== undefined && (
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Net Profit</p>
                        <p className={`text-2xl font-bold ${reportData.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{Math.abs(reportData.summary.netProfit).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(reportData.data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialReports;