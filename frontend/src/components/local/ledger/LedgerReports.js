import React, { useState, useEffect } from 'react';
import {
  BarChart3, FileText, Download, Calendar, Filter, Users,
  DollarSign, TrendingUp, Clock, AlertTriangle, Eye,
  X, RefreshCw, Settings, Printer, Mail, Share2
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Select, DatePicker, SummaryCard } from '../global';
import { CustomerSearch } from '../global';

const LedgerReports = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState('summary');
  const [reportData, setReportData] = useState(null);
  const [reportParams, setReportParams] = useState({
    partyType: 'customer',
    fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    selectedParty: null,
    format: 'pdf',
    includeZeroBalance: false
  });

  const reportTypes = [
    {
      id: 'summary',
      label: 'Ledger Summary',
      description: 'Overall financial summary',
      icon: BarChart3,
      color: 'blue'
    },
    {
      id: 'aging',
      label: 'Aging Report',
      description: 'Aging analysis export',
      icon: Clock,
      color: 'orange'
    },
    {
      id: 'party-statement',
      label: 'Party Statement',
      description: 'Individual party statement',
      icon: FileText,
      color: 'green'
    },
    {
      id: 'outstanding',
      label: 'Outstanding Report',
      description: 'All outstanding amounts',
      icon: AlertTriangle,
      color: 'red'
    },
    {
      id: 'collection',
      label: 'Collection Report',
      description: 'Collection follow-up summary',
      icon: Users,
      color: 'purple'
    }
  ];

  useEffect(() => {
    if (selectedReport === 'summary') {
      loadSummaryReport();
    }
  }, [selectedReport, reportParams.partyType]);

  const loadSummaryReport = async () => {
    setLoading(true);
    try {
      const response = await ledgerApi.getLedgerSummary(reportParams.partyType);
      setReportData(response.data);
    } catch (error) {
      console.error('Error loading summary report:', error);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    
    try {
      let response;
      let filename;
      
      switch (selectedReport) {
        case 'aging':
          response = await ledgerApi.exportAgingAnalysis(
            reportParams.partyType, 
            reportParams.format === 'pdf' ? 'excel' : reportParams.format
          );
          filename = `aging_analysis_${reportParams.partyType}_${reportParams.fromDate}_${reportParams.toDate}.xlsx`;
          break;
          
        case 'party-statement':
          if (!reportParams.selectedParty) {
            alert('Please select a party for statement report');
            setLoading(false);
            return;
          }
          response = await ledgerApi.generateStatementReport(
            reportParams.selectedParty.customer_id || reportParams.selectedParty.supplier_id,
            reportParams.partyType,
            {
              fromDate: reportParams.fromDate,
              toDate: reportParams.toDate,
              format: reportParams.format,
              includeZeroBalance: reportParams.includeZeroBalance
            }
          );
          filename = `statement_${reportParams.selectedParty.customer_name || reportParams.selectedParty.supplier_name}_${reportParams.fromDate}_${reportParams.toDate}.${reportParams.format}`;
          break;
          
        case 'outstanding':
          // Generate CSV for outstanding bills
          const outstandingResponse = await ledgerApi.getOutstandingBills(null, {
            partyType: reportParams.partyType,
            limit: 1000
          });
          
          const bills = outstandingResponse.data.bills || [];
          const csvHeaders = [
            'Party Name',
            'Bill Number',
            'Bill Date',
            'Due Date',
            'Bill Amount',
            'Paid Amount',
            'Outstanding Amount',
            'Days Overdue',
            'Status',
            'Aging Bucket'
          ];

          const csvData = bills.map(bill => [
            bill.party_name,
            bill.bill_number,
            bill.bill_date,
            bill.due_date || '',
            bill.bill_amount,
            bill.paid_amount,
            bill.outstanding_amount,
            bill.days_overdue,
            bill.status,
            bill.aging_bucket
          ]);

          const csvContent = [
            csvHeaders.join(','),
            ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
          ].join('\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          filename = `outstanding_bills_${reportParams.partyType}_${new Date().toISOString().split('T')[0]}.csv`;
          
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          alert(`Successfully generated ${filename}`);
          setLoading(false);
          return;
          
        case 'collection':
          // Generate CSV for collection reminders
          const collectionResponse = await ledgerApi.getCollectionReminders({
            fromDate: reportParams.fromDate,
            toDate: reportParams.toDate,
            limit: 1000
          });
          
          const reminders = collectionResponse.data.reminders || [];
          const collectionHeaders = [
            'Party Name',
            'Phone',
            'Email',
            'Reminder Type',
            'Reminder Date',
            'Outstanding Amount',
            'Bills Count',
            'Status',
            'Response Date',
            'Response Notes'
          ];

          const collectionData = reminders.map(reminder => [
            reminder.party_name,
            reminder.phone || '',
            reminder.email || '',
            reminder.reminder_type,
            reminder.reminder_date,
            reminder.outstanding_amount,
            reminder.bills_count,
            reminder.status,
            reminder.response_date || '',
            reminder.response_notes || ''
          ]);

          const collectionCsv = [
            collectionHeaders.join(','),
            ...collectionData.map(row => row.map(cell => `"${cell}"`).join(','))
          ].join('\n');

          const collectionBlob = new Blob([collectionCsv], { type: 'text/csv;charset=utf-8;' });
          filename = `collection_report_${reportParams.fromDate}_${reportParams.toDate}.csv`;
          
          // Create download link
          const collectionUrl = URL.createObjectURL(collectionBlob);
          const collectionLink = document.createElement('a');
          collectionLink.setAttribute('href', collectionUrl);
          collectionLink.setAttribute('download', filename);
          collectionLink.style.visibility = 'hidden';
          document.body.appendChild(collectionLink);
          collectionLink.click();
          document.body.removeChild(collectionLink);
          URL.revokeObjectURL(collectionUrl);
          
          alert(`Successfully generated ${filename}`);
          setLoading(false);
          return;
          
        default:
          alert('Please select a valid report type');
          setLoading(false);
          return;
      }

      // Handle blob response for PDF/Excel files
      if (response && response.data) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        alert(`Successfully generated ${filename}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const SummaryReport = ({ data }) => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Parties"
            value={data.total_parties || 0}
            icon={Users}
            color="blue"
          />
          
          <SummaryCard
            title="Total Receivables"
            value={formatCurrency(data.total_receivables || 0)}
            icon={TrendingUp}
            color="green"
            subtitle="Amount to receive"
          />
          
          <SummaryCard
            title="Total Payables"
            value={formatCurrency(data.total_payables || 0)}
            icon={TrendingUp}
            color="red"
            subtitle="Amount to pay"
          />
          
          <SummaryCard
            title="Net Position"
            value={formatCurrency((data.total_receivables || 0) - (data.total_payables || 0))}
            icon={DollarSign}
            color={(data.total_receivables || 0) >= (data.total_payables || 0) ? 'green' : 'red'}
            subtitle="Net receivable/payable"
          />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Ledger Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Receivables Breakdown</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Current (0-30 days)</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(data.receivables_current || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">31-60 days</span>
                  <span className="font-medium text-yellow-600">
                    {formatCurrency(data.receivables_30_60 || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">61-90 days</span>
                  <span className="font-medium text-orange-600">
                    {formatCurrency(data.receivables_60_90 || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">90+ days</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(data.receivables_90_plus || 0)}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Activity Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active Parties</span>
                  <span className="font-medium">{data.active_parties || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Outstanding Bills</span>
                  <span className="font-medium">{data.outstanding_bills || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Overdue Bills</span>
                  <span className="font-medium text-red-600">{data.overdue_bills || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="font-medium text-gray-500">
                    {data.last_updated ? formatDate(data.last_updated) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ledger Reports</h1>
              <p className="text-sm text-gray-600">Generate comprehensive financial reports</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{loading ? 'Generating...' : 'Generate Report'}</span>
              </button>
              
              <button
                onClick={() => selectedReport === 'summary' && loadSummaryReport()}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Report Type Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Select Report Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {reportTypes.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedReport === report.id
                      ? `border-${report.color}-500 bg-${report.color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col items-center text-center">
                    <report.icon className={`w-8 h-8 mb-2 ${
                      selectedReport === report.id ? `text-${report.color}-600` : 'text-gray-400'
                    }`} />
                    <div className="font-medium text-gray-900">{report.label}</div>
                    <div className="text-sm text-gray-500 mt-1">{report.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Report Parameters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Report Parameters</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Party Type
                </label>
                <Select
                  value={reportParams.partyType}
                  onChange={(value) => setReportParams(prev => ({ ...prev, partyType: value }))}
                  options={[
                    { value: 'customer', label: 'Customers' },
                    { value: 'supplier', label: 'Suppliers' }
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={reportParams.fromDate}
                  onChange={(e) => setReportParams(prev => ({ ...prev, fromDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={reportParams.toDate}
                  onChange={(e) => setReportParams(prev => ({ ...prev, toDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Additional parameters for specific reports */}
            {selectedReport === 'party-statement' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Party
                  </label>
                  <CustomerSearch
                    onChange={(party) => setReportParams(prev => ({ ...prev, selectedParty: party }))}
                    placeholder={`Search ${reportParams.partyType}...`}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Format
                  </label>
                  <Select
                    value={reportParams.format}
                    onChange={(value) => setReportParams(prev => ({ ...prev, format: value }))}
                    options={[
                      { value: 'pdf', label: 'PDF' },
                      { value: 'excel', label: 'Excel' }
                    ]}
                  />
                </div>
              </div>
            )}

            {(selectedReport === 'aging' || selectedReport === 'outstanding') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Format
                </label>
                <Select
                  value={reportParams.format}
                  onChange={(value) => setReportParams(prev => ({ ...prev, format: value }))}
                  options={[
                    { value: 'excel', label: 'Excel' },
                    { value: 'csv', label: 'CSV' }
                  ]}
                />
              </div>
            )}

            {selectedReport === 'party-statement' && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeZeroBalance"
                  checked={reportParams.includeZeroBalance}
                  onChange={(e) => setReportParams(prev => ({ ...prev, includeZeroBalance: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="includeZeroBalance" className="ml-2 text-sm text-gray-700">
                  Include zero balance transactions
                </label>
              </div>
            )}
          </div>

          {/* Report Preview/Summary */}
          {selectedReport === 'summary' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">Summary Report Preview</h3>
                <div className="text-sm text-gray-500">
                  For {reportParams.partyType}s • Updated: {new Date().toLocaleString()}
                </div>
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <SummaryReport data={reportData} />
              )}
            </div>
          )}

          {selectedReport !== 'summary' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {reportTypes.find(r => r.id === selectedReport)?.label}
                </h3>
                <p className="text-gray-600 mb-6">
                  Configure parameters above and click "Generate Report" to create your {selectedReport.replace('-', ' ')} report.
                </p>
                <div className="text-sm text-gray-500">
                  Available formats: {selectedReport === 'party-statement' ? 'PDF, Excel' : 'Excel, CSV'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LedgerReports;