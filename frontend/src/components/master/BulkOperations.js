import React, { useState, useRef } from 'react';
import { 
  Upload, Download, FileText, CheckCircle, XCircle,
  AlertTriangle, RotateCcw, Play, Pause, Eye,
  File, Database, Users, Package, Settings,
  ArrowRight, Clock, Trash2, RefreshCw
} from 'lucide-react';
import { DataTable, StatusBadge, Toast } from '../global/ui';

const BulkOperations = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('import');
  const [importJobs, setImportJobs] = useState([]);
  const [exportJobs, setExportJobs] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState('products');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const mockImportJobs = [
    {
      id: 1,
      filename: 'products_batch_001.xlsx',
      entity: 'products',
      status: 'completed',
      totalRecords: 1250,
      successfulRecords: 1187,
      failedRecords: 63,
      startedAt: '2024-07-26T09:30:00Z',
      completedAt: '2024-07-26T09:45:00Z',
      errors: [
        { row: 15, field: 'hsn_code', message: 'Invalid HSN code format' },
        { row: 23, field: 'gst_rate', message: 'GST rate must be 5, 12, 18, or 28' }
      ]
    },
    {
      id: 2,
      filename: 'customers_july_2024.xlsx',
      entity: 'customers',
      status: 'processing',
      totalRecords: 450,
      successfulRecords: 320,
      failedRecords: 12,
      startedAt: '2024-07-26T10:15:00Z',
      progress: 75
    },
    {
      id: 3,
      filename: 'suppliers_new.xlsx',
      entity: 'suppliers',
      status: 'failed',
      totalRecords: 85,
      successfulRecords: 0,
      failedRecords: 85,
      startedAt: '2024-07-26T08:20:00Z',
      completedAt: '2024-07-26T08:22:00Z',
      errors: [
        { row: 1, field: 'file', message: 'Invalid file format. Expected .xlsx' }
      ]
    }
  ];

  const mockExportJobs = [
    {
      id: 1,
      filename: 'products_export_2024-07-26.xlsx',
      entity: 'products',
      status: 'completed',
      totalRecords: 1250,
      startedAt: '2024-07-26T11:00:00Z',
      completedAt: '2024-07-26T11:03:00Z',
      fileSize: '2.5 MB',
      downloadUrl: '/downloads/products_export_2024-07-26.xlsx'
    },
    {
      id: 2,
      filename: 'customers_active_export.xlsx',
      entity: 'customers',
      status: 'processing',
      totalRecords: 856,
      startedAt: '2024-07-26T11:15:00Z',
      progress: 45
    }
  ];

  React.useEffect(() => {
    setImportJobs(mockImportJobs);
    setExportJobs(mockExportJobs);
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      // Simulate file upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 200);

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const newJob = {
        id: Date.now(),
        filename: file.name,
        entity: selectedEntity,
        status: 'processing',
        totalRecords: Math.floor(Math.random() * 1000) + 100,
        successfulRecords: 0,
        failedRecords: 0,
        startedAt: new Date().toISOString(),
        progress: 0
      };

      setImportJobs(prev => [newJob, ...prev]);
      Toast.success('File uploaded successfully. Import started.');

      // Simulate processing progress
      simulateJobProgress(newJob.id);

    } catch (error) {
      Toast.error('Failed to upload file: ' + error.message);
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const simulateJobProgress = (jobId) => {
    const interval = setInterval(() => {
      setImportJobs(prev => 
        prev.map(job => {
          if (job.id === jobId && job.status === 'processing') {
            const newProgress = Math.min(job.progress + Math.random() * 20, 100);
            const isCompleted = newProgress >= 100;
            
            return {
              ...job,
              progress: newProgress,
              status: isCompleted ? 'completed' : 'processing',
              successfulRecords: isCompleted ? Math.floor(job.totalRecords * 0.95) : Math.floor((newProgress / 100) * job.totalRecords * 0.95),
              failedRecords: isCompleted ? Math.floor(job.totalRecords * 0.05) : Math.floor((newProgress / 100) * job.totalRecords * 0.05),
              completedAt: isCompleted ? new Date().toISOString() : undefined
            };
          }
          return job;
        })
      );
      
      const job = importJobs.find(j => j.id === jobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        clearInterval(interval);
      }
    }, 1000);
  };

  const startExport = async () => {
    const newJob = {
      id: Date.now(),
      filename: `${selectedEntity}_export_${new Date().toISOString().split('T')[0]}.xlsx`,
      entity: selectedEntity,
      status: 'processing',
      totalRecords: Math.floor(Math.random() * 1000) + 100,
      startedAt: new Date().toISOString(),
      progress: 0
    };

    setExportJobs(prev => [newJob, ...prev]);
    Toast.success('Export started successfully.');

    // Simulate export progress
    const interval = setInterval(() => {
      setExportJobs(prev =>
        prev.map(job => {
          if (job.id === newJob.id && job.status === 'processing') {
            const newProgress = Math.min(job.progress + Math.random() * 25, 100);
            const isCompleted = newProgress >= 100;

            return {
              ...job,
              progress: newProgress,
              status: isCompleted ? 'completed' : 'processing',
              completedAt: isCompleted ? new Date().toISOString() : undefined,
              fileSize: isCompleted ? `${(Math.random() * 5 + 1).toFixed(1)} MB` : undefined,
              downloadUrl: isCompleted ? `/downloads/${job.filename}` : undefined
            };
          }
          return job;
        })
      );

      const currentJob = exportJobs.find(j => j.id === newJob.id);
      if (currentJob && (currentJob.status === 'completed' || currentJob.status === 'failed')) {
        clearInterval(interval);
      }
    }, 1000);
  };

  const downloadTemplate = (entityType) => {
    const template = importTemplates[entityType];
    if (template) {
      // In real app, this would trigger actual file download
      Toast.success(`Template ${template.filename} download started`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'green';
      case 'processing': return 'blue';
      case 'failed': return 'red';
      case 'pending': return 'yellow';
      default: return 'gray';
    }
  };

  const getEntityIcon = (entity) => {
    const entityType = entityTypes.find(e => e.id === entity);
    return entityType ? entityType.icon : Database;
  };

  const tabs = [
    { id: 'import', label: 'Import Data', icon: Upload },
    { id: 'export', label: 'Export Data', icon: Download },
    { id: 'templates', label: 'Templates', icon: FileText }
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Bulk Operations</h2>
            <p className="text-sm text-gray-600">Import and export master data</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
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
          {activeTab === 'import' && (
            <div className="p-6 h-full overflow-y-auto">
              {/* Import Controls */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Type
                    </label>
                    <select
                      value={selectedEntity}
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      {entityTypes.map(entity => (
                        <option key={entity.id} value={entity.id}>
                          {entity.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload File
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileUpload(e.target.files[0])}
                      disabled={isProcessing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => downloadTemplate(selectedEntity)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </button>
                  </div>
                </div>
                
                {isProcessing && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Import Jobs */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Import History</h3>
                  <button
                    onClick={() => setImportJobs([])}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Clear History
                  </button>
                </div>
                
                <div className="space-y-4">
                  {importJobs.map((job) => {
                    const EntityIcon = getEntityIcon(job.entity);
                    return (
                      <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <EntityIcon className="h-5 w-5 text-gray-600 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h4 className="font-medium text-gray-900">{job.filename}</h4>
                                <StatusBadge 
                                  status={getStatusColor(job.status)}
                                  text={job.status}
                                  size="sm"
                                />
                              </div>
                              <p className="text-sm text-gray-600 capitalize">{job.entity} import</p>
                              
                              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                <span>Total: {job.totalRecords}</span>
                                <span className="text-green-600">Success: {job.successfulRecords}</span>
                                <span className="text-red-600">Failed: {job.failedRecords}</span>
                                <span>Started: {new Date(job.startedAt).toLocaleString()}</span>
                              </div>

                              {job.status === 'processing' && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                                    <span>Progress</span>
                                    <span>{job.progress?.toFixed(0) || 0}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${job.progress || 0}%` }}
                                    ></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {job.errors && job.errors.length > 0 && (
                              <button
                                title="View Errors"
                                className="text-red-600 hover:text-red-800"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {job.status === 'failed' && (
                              <button
                                title="Retry"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="p-6 h-full overflow-y-auto">
              {/* Export Controls */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Type
                    </label>
                    <select
                      value={selectedEntity}
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      {entityTypes.map(entity => (
                        <option key={entity.id} value={entity.id}>
                          {entity.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={startExport}
                      className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Start Export
                    </button>
                  </div>
                </div>
              </div>

              {/* Export Jobs */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Export History</h3>
                  <button
                    onClick={() => setExportJobs([])}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Clear History
                  </button>
                </div>
                
                <div className="space-y-4">
                  {exportJobs.map((job) => {
                    const EntityIcon = getEntityIcon(job.entity);
                    return (
                      <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <EntityIcon className="h-5 w-5 text-gray-600 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h4 className="font-medium text-gray-900">{job.filename}</h4>
                                <StatusBadge 
                                  status={getStatusColor(job.status)}
                                  text={job.status}
                                  size="sm"
                                />
                              </div>
                              <p className="text-sm text-gray-600 capitalize">{job.entity} export</p>
                              
                              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                <span>Records: {job.totalRecords}</span>
                                {job.fileSize && <span>Size: {job.fileSize}</span>}
                                <span>Started: {new Date(job.startedAt).toLocaleString()}</span>
                              </div>

                              {job.status === 'processing' && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                                    <span>Progress</span>
                                    <span>{job.progress?.toFixed(0) || 0}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${job.progress || 0}%` }}
                                    ></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {job.status === 'completed' && job.downloadUrl && (
                              <button
                                onClick={() => Toast.success('Download started')}
                                className="inline-flex items-center px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="p-6 h-full overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {entityTypes.map((entity) => {
                  const template = importTemplates[entity.id];
                  const EntityIcon = entity.icon;
                  
                  return (
                    <div key={entity.id} className="bg-white border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${entity.color}-100`}>
                          <EntityIcon className={`h-5 w-5 text-${entity.color}-600`} />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{entity.label}</h3>
                          <p className="text-sm text-gray-600">Import template</p>
                        </div>
                      </div>
                      
                      {template && (
                        <>
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Required Columns:</h4>
                            <div className="flex flex-wrap gap-1">
                              {template.columns.map((column) => (
                                <span 
                                  key={column}
                                  className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                                >
                                  {column}
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Sample Data:</h4>
                            <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                              {template.sampleData}
                            </p>
                          </div>
                        </>
                      )}
                      
                      <button
                        onClick={() => downloadTemplate(entity.id)}
                        className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkOperations;