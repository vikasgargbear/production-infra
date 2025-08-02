import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, AlertTriangle, XCircle, Eye, Play,
  Filter, Download, RefreshCw, Settings, Code,
  Database, Users, Package, FileText, Search
} from 'lucide-react';
import { DataTable, StatusBadge, Toast } from '../global/ui';

const DataValidationEngine = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('rules');
  const [validationRules, setValidationRules] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');

  useEffect(() => {
    if (open) {
      loadValidationRules();
      loadValidationResults();
    }
  }, [open]);

  const loadValidationRules = () => {
    // Enterprise validation rules for pharmaceutical data
    const rules = [
      {
        id: 'PROD_001',
        name: 'Product Name Validation',
        description: 'Ensures product names follow pharmaceutical naming conventions',
        category: 'products',
        severity: 'error',
        enabled: true,
        rule: 'Product name must contain generic name and strength',
        regex: '^[A-Za-z\\s]+\\s+\\d+[mg|ml|gm|tab|cap]',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 94.5
      },
      {
        id: 'PROD_002', 
        name: 'HSN Code Format',
        description: 'Validates HSN codes for pharmaceutical products',
        category: 'products',
        severity: 'error',
        enabled: true,
        rule: 'HSN code must be 8 digits starting with 30',
        regex: '^30\\d{6}$',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 98.2
      },
      {
        id: 'PROD_003',
        name: 'Expiry Date Future Check',
        description: 'Ensures all batch expiry dates are in the future',
        category: 'batches',
        severity: 'warning',
        enabled: true,
        rule: 'Batch expiry date must be at least 30 days from today',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 87.3
      },
      {
        id: 'CUST_001',
        name: 'Customer GSTIN Validation',
        description: 'Validates GSTIN format for customer records',
        category: 'customers',
        severity: 'error',
        enabled: true,
        rule: 'GSTIN must be 15 characters with valid checksum',
        regex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 92.1
      },
      {
        id: 'CUST_002',
        name: 'Customer Contact Validation',
        description: 'Ensures customers have valid contact information',
        category: 'customers',
        severity: 'warning',
        enabled: true,
        rule: 'Customer must have either phone or email',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 96.7
      },
      {
        id: 'SUPP_001',
        name: 'Supplier License Validation',
        description: 'Validates supplier drug license numbers',
        category: 'suppliers',
        severity: 'error',
        enabled: true,
        rule: 'Drug license must be valid format for state',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 99.1
      },
      {
        id: 'INV_001',
        name: 'Negative Stock Check',
        description: 'Identifies products with negative stock levels',
        category: 'inventory',
        severity: 'critical',
        enabled: true,
        rule: 'Stock quantity cannot be negative',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 99.8
      },
      {
        id: 'INV_002',
        name: 'Batch Duplicate Check',
        description: 'Identifies duplicate batch numbers for same product',
        category: 'batches',
        severity: 'error',
        enabled: true,
        rule: 'Batch number must be unique per product',
        lastRun: '2024-07-26T10:30:00Z',
        passRate: 100.0
      }
    ];
    setValidationRules(rules);
  };

  const loadValidationResults = () => {
    // Mock validation results
    const results = [
      {
        id: 1,
        ruleId: 'PROD_001',
        ruleName: 'Product Name Validation',
        entity: 'Amoxicillin',
        entityId: 'PROD_1247',
        issue: 'Product name missing strength specification',
        severity: 'error',
        status: 'open',
        detectedAt: '2024-07-26T09:15:00Z',
        suggestion: 'Add strength like "250mg" or "500mg" to product name'
      },
      {
        id: 2,
        ruleId: 'CUST_001',
        ruleName: 'Customer GSTIN Validation',
        entity: 'ABC Pharmacy',
        entityId: 'CUST_456',
        issue: 'Invalid GSTIN checksum',
        severity: 'error',
        status: 'open',
        detectedAt: '2024-07-26T08:30:00Z',
        suggestion: 'Verify GSTIN number with customer'
      },
      {
        id: 3,
        ruleId: 'PROD_003',
        ruleName: 'Expiry Date Future Check',
        entity: 'Batch BCH-2024-001',
        entityId: 'BATCH_789',
        issue: 'Batch expires within 30 days',
        severity: 'warning',
        status: 'acknowledged',
        detectedAt: '2024-07-26T07:45:00Z',
        suggestion: 'Plan inventory movement or markdown'
      },
      {
        id: 4,
        ruleId: 'INV_001',
        ruleName: 'Negative Stock Check',
        entity: 'Paracetamol 500mg',
        entityId: 'PROD_123',
        issue: 'Stock quantity is -5 units',
        severity: 'critical',
        status: 'open',
        detectedAt: '2024-07-26T06:20:00Z',
        suggestion: 'Adjust stock or check transaction history'
      }
    ];
    setValidationResults(results);
  };

  const runValidation = async (ruleId = null) => {
    setIsRunning(true);
    
    try {
      // Simulate API call to run validation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh results
      loadValidationResults();
      
      Toast.success(ruleId ? 'Rule validation completed' : 'Full validation completed');
    } catch (error) {
      Toast.error('Validation failed: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const updateIssueStatus = (issueId, newStatus) => {
    setValidationResults(prev => 
      prev.map(result => 
        result.id === issueId 
          ? { ...result, status: newStatus }
          : result
      )
    );
    Toast.success('Issue status updated');
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'error': return 'orange';
      case 'warning': return 'yellow';
      case 'info': return 'blue';
      default: return 'gray';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'products': return Package;
      case 'customers': return Users;
      case 'suppliers': return Database;
      case 'batches': return FileText;
      case 'inventory': return Package;
      default: return Database;
    }
  };

  const filteredRules = validationRules.filter(rule => 
    rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredResults = validationResults.filter(result => {
    const matchesSearch = result.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         result.issue.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || result.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  const tabs = [
    { id: 'rules', label: 'Validation Rules', icon: Settings },
    { id: 'results', label: 'Issues & Results', icon: AlertTriangle },
    { id: 'reports', label: 'Reports', icon: FileText }
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl mx-4 h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Data Validation Engine</h2>
            <p className="text-sm text-gray-600">Enterprise data quality management</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => runValidation()}
              disabled={isRunning}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isRunning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isRunning ? 'Running...' : 'Run All Validations'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'rules' && (
            <div className="p-6 h-full overflow-y-auto">
              {/* Search and filters */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search rules..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">
                  <Download className="h-4 w-4 mr-1" />
                  Export Rules
                </button>
              </div>

              {/* Rules table */}
              <div className="space-y-4">
                {filteredRules.map((rule) => {
                  const CategoryIcon = getCategoryIcon(rule.category);
                  return (
                    <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            rule.enabled ? 'bg-green-100' : 'bg-gray-100'
                          }`}>
                            <CategoryIcon className={`h-4 w-4 ${
                              rule.enabled ? 'text-green-600' : 'text-gray-600'
                            }`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium text-gray-900">{rule.name}</h4>
                              <StatusBadge 
                                status={rule.severity === 'critical' ? 'error' : rule.severity === 'error' ? 'warning' : 'active'}
                                text={rule.severity}
                                size="sm"
                              />
                              <span className="text-xs text-gray-500">#{rule.id}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                              <span>Category: {rule.category}</span>
                              <span>Pass Rate: {rule.passRate}%</span>
                              <span>Last Run: {new Date(rule.lastRun).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => runValidation(rule.id)}
                            disabled={isRunning}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Run
                          </button>
                          <button className="text-gray-600 hover:text-gray-800">
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'results' && (
            <div className="p-6 h-full overflow-y-auto">
              {/* Search and filters */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search issues..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">
                  <Download className="h-4 w-4 mr-1" />
                  Export Issues
                </button>
              </div>

              {/* Issues table */}
              <div className="space-y-4">
                {filteredResults.map((result) => (
                  <div key={result.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          getSeverityColor(result.severity) === 'red' ? 'bg-red-500' :
                          getSeverityColor(result.severity) === 'orange' ? 'bg-orange-500' :
                          getSeverityColor(result.severity) === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}></div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-gray-900">{result.entity}</h4>
                            <StatusBadge 
                              status={result.status === 'open' ? 'error' : result.status === 'acknowledged' ? 'warning' : 'active'}
                              text={result.status}
                              size="sm"
                            />
                            <span className="text-xs text-gray-500">Rule: {result.ruleId}</span>
                          </div>
                          <p className="text-sm text-red-600 mt-1">{result.issue}</p>
                          <p className="text-sm text-gray-600 mt-1">💡 {result.suggestion}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>Detected: {new Date(result.detectedAt).toLocaleString()}</span>
                            <span>Entity ID: {result.entityId}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {result.status === 'open' && (
                          <>
                            <button
                              onClick={() => updateIssueStatus(result.id, 'acknowledged')}
                              className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => updateIssueStatus(result.id, 'resolved')}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="p-6 h-full overflow-y-auto">
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Validation Reports</h3>
                <p className="text-gray-600">Detailed reports and analytics coming soon</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataValidationEngine;