import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Download, FileText, CheckCircle, XCircle,
  AlertTriangle, RotateCcw, Play, Pause, Eye,
  File, Database, Users, Package, Settings,
  ArrowRight, Clock, Trash2, RefreshCw, Loader2, X
} from 'lucide-react';
import { DataTable, StatusBadge, Toast } from '../../global/ui';
import { settingsApi } from '../../../services/api';

const BulkOperations = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('import');
  const [importJobs, setImportJobs] = useState([]);
  const [exportJobs, setExportJobs] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState('products');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const fileInputRef = useRef(null);

  const entityTypes = [
    { id: 'products', label: 'Products', icon: Package, color: 'blue' },
    { id: 'customers', label: 'Customers', icon: Users, color: 'green' },
    { id: 'suppliers', label: 'Suppliers', icon: Database, color: 'purple' },
    { id: 'batches', label: 'Batches', icon: FileText, color: 'orange' },
    { id: 'warehouses', label: 'Warehouses', icon: Settings, color: 'cyan' }
  ];

  const importTemplates = {
    products: {
      filename: 'products_template.xlsx',
      columns: ['product_name', 'generic_name', 'manufacturer', 'hsn_code', 'unit', 'mrp', 'gst_rate'],
      sampleData: 'Paracetamol 500mg, Paracetamol, ABC Pharma, 30049011, TAB, 25.00, 12'
    },
    customers: {
      filename: 'customers_template.xlsx', 
      columns: ['name', 'gstin', 'phone', 'email', 'address', 'city', 'state', 'pincode'],
      sampleData: 'ABC Pharmacy, 27ABCDE1234F1Z5, 9876543210, abc@pharmacy.com, 123 Main St, Mumbai, Maharashtra, 400001'
    },
    suppliers: {
      filename: 'suppliers_template.xlsx',
      columns: ['name', 'gstin', 'drug_license', 'phone', 'email', 'address', 'city', 'state'],
      sampleData: 'XYZ Distributors, 27XYZAB1234C1D2, DL-MH-001, 9876543210, xyz@dist.com, 456 Supply St, Pune, Maharashtra'
    }
  };

  useEffect(() => {
    if (open) {
      loadJobs();
    }
  }, [open]);

  const loadJobs = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [importResponse, exportResponse] = await Promise.all([
        settingsApi.bulkOperations.getImportJobs(),
        settingsApi.bulkOperations.getExportJobs()
      ]);

      if (importResponse?.data) {
        setImportJobs(importResponse.data);
      }
      if (exportResponse?.data) {
        setExportJobs(exportResponse.data);
      }
    } catch (error) {
      setError('Failed to load bulk operations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadJobs();
    } catch (error) {
      setError('Failed to refresh jobs. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity', selectedEntity);

      const response = await settingsApi.bulkOperations.uploadFile(formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (response.success) {
        // Refresh jobs list
        await loadJobs();
        setUploadProgress(0);
      } else {
        setError('File upload failed. Please try again.');
      }
    } catch (error) {
      setError('File upload failed. Please try again.');
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const handleStartJob = async (jobId, jobType) => {
    try {
      const response = await settingsApi.bulkOperations.startJob(jobId, jobType);
      if (response.success) {
        await loadJobs();
      }
    } catch (error) {
      setError('Failed to start job. Please try again.');
    }
  };

  const handlePauseJob = async (jobId, jobType) => {
    try {
      const response = await settingsApi.bulkOperations.pauseJob(jobId, jobType);
      if (response.success) {
        await loadJobs();
      }
    } catch (error) {
      setError('Failed to pause job. Please try again.');
    }
  };

  const handleDeleteJob = async (jobId, jobType) => {
    if (!window.confirm('Are you sure you want to delete this job?')) return;

    try {
      const response = await settingsApi.bulkOperations.deleteJob(jobId, jobType);
      if (response.success) {
        await loadJobs();
      }
    } catch (error) {
      setError('Failed to delete job. Please try again.');
    }
  };

  const handleDownloadTemplate = (entity) => {
    const template = importTemplates[entity];
    if (template) {
      // Create and download template file
      const csvContent = [template.columns.join(','), template.sampleData].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = template.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const getJobStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'green';
      case 'processing': return 'blue';
      case 'failed': return 'red';
      case 'paused': return 'yellow';
      case 'pending': return 'gray';
      default: return 'gray';
    }
  };

  const getJobStatusIcon = (status) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'processing': return Play;
      case 'failed': return XCircle;
      case 'paused': return Pause;
      case 'pending': return Clock;
      default: return Clock;
    }
  };

  if (!open) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading bulk operations...</span>
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
            <h2 className="text-2xl font-bold text-gray-900">Bulk Operations</h2>
            <p className="text-gray-600">Import and export data in bulk</p>
          </div>
          <div className="flex items-center space-x-2">
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
              onClick={() => setActiveTab('import')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'import'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'export'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Export
            </button>
          </nav>
        </div>

        {activeTab === 'import' && (
          <div className="space-y-6">
            {/* Import Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Import Data</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Entity Type</label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    {entityTypes.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Download Template</label>
                  <button
                    onClick={() => handleDownloadTemplate(selectedEntity)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download {importTemplates[selectedEntity]?.filename}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload File</label>
                <div className="flex items-center space-x-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </button>
                  {isProcessing && (
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Import Jobs */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Import Jobs</h3>
              {importJobs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No import jobs found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {importJobs.map((job) => {
                    const StatusIcon = getJobStatusIcon(job.status);
                    return (
                      <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <StatusIcon className={`h-5 w-5 text-${getJobStatusColor(job.status)}-600`} />
                            <div>
                              <h4 className="font-medium text-gray-900">{job.filename}</h4>
                              <p className="text-sm text-gray-500">
                                {job.totalRecords} records • {job.entity} • {job.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {job.status === 'pending' && (
                              <button
                                onClick={() => handleStartJob(job.id, 'import')}
                                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 text-sm"
                              >
                                Start
                              </button>
                            )}
                            {job.status === 'processing' && (
                              <button
                                onClick={() => handlePauseJob(job.id, 'import')}
                                className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 text-sm"
                              >
                                Pause
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteJob(job.id, 'import')}
                              className="px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {job.errors && job.errors.length > 0 && (
                          <div className="mt-3 p-3 bg-red-50 rounded-md">
                            <p className="text-sm text-red-800 font-medium mb-2">Errors:</p>
                            <div className="space-y-1">
                              {job.errors.slice(0, 3).map((error, index) => (
                                <p key={index} className="text-xs text-red-700">
                                  Row {error.row}: {error.message}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-6">
            {/* Export Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Export Data</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Entity Type</label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    {entityTypes.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500">
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="csv">CSV (.csv)</option>
                    <option value="pdf">PDF (.pdf)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  <Download className="h-4 w-4 mr-2" />
                  Start Export
                </button>
              </div>
            </div>

            {/* Export Jobs */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Export Jobs</h3>
              {exportJobs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Download className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No export jobs found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {exportJobs.map((job) => {
                    const StatusIcon = getJobStatusIcon(job.status);
                    return (
                      <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <StatusIcon className={`h-5 w-5 text-${getJobStatusColor(job.status)}-600`} />
                            <div>
                              <h4 className="font-medium text-gray-900">{job.filename}</h4>
                              <p className="text-sm text-gray-500">
                                {job.totalRecords} records • {job.entity} • {job.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {job.status === 'completed' && (
                              <a
                                href={job.downloadUrl}
                                download
                                className="px-3 py-1 bg-green-100 text-green-800 rounded-md hover:bg-green-200 text-sm"
                              >
                                Download
                              </a>
                            )}
                            <button
                              onClick={() => handleDeleteJob(job.id, 'export')}
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
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkOperations;