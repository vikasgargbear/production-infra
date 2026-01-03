import React, { useState, useEffect } from 'react';
import {
  CheckCircle, AlertTriangle, XCircle, Eye, Play,
  Filter, Download, RefreshCw, Settings, Code,
  Database, Users, Package, FileText, Search, Loader2, X,
  LucideIcon
} from 'lucide-react';
import { DataTable, StatusBadge, Toast } from '../global/ui';
import { settingsApi } from '../../services/api';

// Types
interface DataValidationEngineProps {
  open?: boolean;
  onClose?: () => void;
}

type Severity = 'error' | 'warning' | 'info';
type TabType = 'rules' | 'results';

interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  category: string;
  enabled: boolean;
  passRate: number;
  lastRun: string;
}

interface ValidationResult {
  id: string;
  entity: string;
  message: string;
  severity: Severity;
  category: string;
  ruleName: string;
  timestamp: string;
}

const DataValidationEngine: React.FC<DataValidationEngineProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('rules');
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validationResults, setValidationResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (open) {
      loadValidationRules();
      loadValidationResults();
    }
  }, [open]);

  const loadValidationRules = async () => {
    try {
      const response = await settingsApi.validation.getRules();
      if (response?.data) {
        setValidationRules(response.data);
      } else {
        setValidationRules([]);
      }
    } catch (error) {
      setError('Failed to load validation rules. Please try again.');
      setValidationRules([]);
    }
  };

  const loadValidationResults = async () => {
    try {
      const response = await settingsApi.validation.getResults();
      if (response?.data) {
        setValidationResults(response.data);
      } else {
        setValidationResults([]);
      }
    } catch (error) {
      setError('Failed to load validation results. Please try again.');
      setValidationResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([loadValidationRules(), loadValidationResults()]);
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRunValidation = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await settingsApi.validation.runValidation();
      if (response.success) {
        Toast.success('Validation started successfully');
        // Refresh results after a delay to allow processing
        setTimeout(() => {
          loadValidationResults();
        }, 2000);
      } else {
        setError('Failed to start validation. Please try again.');
      }
    } catch (error) {
      setError('Failed to start validation. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleRule = async (ruleId, enabled) => {
    try {
      const response = await settingsApi.validation.updateRule(ruleId, { enabled });
      if (response.success) {
        setValidationRules(prev => prev.map(rule =>
          rule.id === ruleId ? { ...rule, enabled } : rule
        ));
      }
    } catch (error) {
      setError('Failed to update rule. Please try again.');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this validation rule?')) return;

    try {
      const response = await settingsApi.validation.deleteRule(ruleId);
      if (response.success) {
        setValidationRules(prev => prev.filter(rule => rule.id !== ruleId));
        Toast.success('Rule deleted successfully');
      }
    } catch (error) {
      setError('Failed to delete rule. Please try again.');
    }
  };

  const handleExportResults = async () => {
    try {
      const response = await settingsApi.validation.exportResults();
      if (response?.data?.downloadUrl) {
        // Trigger download
        const a = document.createElement('a');
        a.href = response.data.downloadUrl;
        a.download = `validation_results_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
      }
    } catch (error) {
      setError('Failed to export results. Please try again.');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'red';
      case 'warning': return 'yellow';
      case 'info': return 'blue';
      default: return 'gray';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error': return XCircle;
      case 'warning': return AlertTriangle;
      case 'info': return CheckCircle;
      default: return CheckCircle;
    }
  };

  const getCategoryIcon = (category) => {
    const iconMap = {
      'products': Package,
      'customers': Users,
      'suppliers': Database,
      'batches': FileText,
      'inventory': Package,
      'default': Database
    };
    return iconMap[category] || iconMap.default;
  };

  const filteredRules = validationRules.filter(rule => {
    const matchesSearch = searchTerm === '' ||
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || rule.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  const filteredResults = validationResults.filter(result => {
    const matchesSearch = searchTerm === '' ||
      result.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || result.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  if (!open) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading validation engine...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Data Validation Engine</h2>
            <p className="text-gray-600">Validate data quality and integrity</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRunValidation}
              disabled={isRunning}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isRunning ? 'Running...' : 'Run Validation'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
            >
              <X className="h-4 w-4 mr-1" />
              Close
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
              <button
                onClick={handleRefresh}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('rules')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'rules'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Validation Rules
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'results'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Validation Results
            </button>
          </nav>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rules or results..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
            {activeTab === 'results' && (
              <button
                onClick={handleExportResults}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
            )}
          </div>
        </div>

        {activeTab === 'rules' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Validation Rules</h3>
              <span className="text-sm text-gray-500">{filteredRules.length} rules</span>
            </div>

            {filteredRules.length === 0 ? (
              <div className="text-center py-12">
                <Code className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Validation Rules Found</h3>
                <p className="text-gray-500 mb-4">Configure validation rules through the settings panel</p>
                <button
                  onClick={handleRefresh}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRules.map((rule) => {
                  const SeverityIcon = getSeverityIcon(rule.severity);
                  const CategoryIcon = getCategoryIcon(rule.category);
                  return (
                    <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${getSeverityColor(rule.severity)}-100`}>
                            <SeverityIcon className={`h-5 w-5 text-${getSeverityColor(rule.severity)}-600`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-medium text-gray-900">{rule.name}</h4>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${getSeverityColor(rule.severity)}-100 text-${getSeverityColor(rule.severity)}-800`}>
                                {rule.severity}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{rule.description}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span className="flex items-center">
                                <CategoryIcon className="h-4 w-4 mr-1" />
                                {rule.category}
                              </span>
                              <span>Pass Rate: {rule.passRate}%</span>
                              <span>Last Run: {new Date(rule.lastRun).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                            className={`px-3 py-1 rounded-md text-sm font-medium ${rule.enabled
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                          >
                            {rule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Validation Results</h3>
              <span className="text-sm text-gray-500">{filteredResults.length} results</span>
            </div>

            {filteredResults.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Validation Results Found</h3>
                <p className="text-gray-500 mb-4">Run validation to see results</p>
                <button
                  onClick={handleRunValidation}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Run Validation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResults.map((result) => {
                  const SeverityIcon = getSeverityIcon(result.severity);
                  const CategoryIcon = getCategoryIcon(result.category);
                  return (
                    <div key={result.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${getSeverityColor(result.severity)}-100`}>
                            <SeverityIcon className={`h-5 w-5 text-${getSeverityColor(result.severity)}-600`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-medium text-gray-900">{result.entity}</h4>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${getSeverityColor(result.severity)}-100 text-${getSeverityColor(result.severity)}-800`}>
                                {result.severity}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{result.message}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span className="flex items-center">
                                <CategoryIcon className="h-4 w-4 mr-1" />
                                {result.category}
                              </span>
                              <span>Rule: {result.ruleName}</span>
                              <span>Timestamp: {new Date(result.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 text-sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataValidationEngine;