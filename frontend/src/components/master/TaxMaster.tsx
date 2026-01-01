import React, { useState, useEffect } from 'react';
import {
    Receipt, Search, Plus, Edit2, Trash2,
    Download, Upload, Loader2, AlertCircle, Check,
    Percent, X, RefreshCw, Building, Calculator, Info
} from 'lucide-react';
import { settingsApi } from '../../services/api';

interface TaxMasterProps {
    open?: boolean;
    onClose?: () => void;
}

interface Tax {
    id: number | string;
    name: string;
    type: string;
    rate: number;
    cgst: number;
    sgst: number;
    igst: number;
    description?: string;
    isActive: boolean;
}

interface GSTConfig {
    companyGSTIN: string;
    defaultGSTRate: string;
    autoCalculateGST: boolean;
    gstCalculationMethod: string;
}

interface TaxFormData {
    name: string;
    type: string;
    rate: string | number;
    cgst: string | number;
    sgst: string | number;
    igst: string | number;
    description: string;
    isActive: boolean;
}

const TaxMaster: React.FC<TaxMasterProps> = ({ open, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTax, setEditingTax] = useState<Tax | null>(null);
    const [selectedTaxes, setSelectedTaxes] = useState<(number | string)[]>([]);
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('rates'); // 'rates' or 'gst-config'
    const [gstConfig, setGstConfig] = useState<GSTConfig>({
        companyGSTIN: '',
        defaultGSTRate: '',
        autoCalculateGST: true,
        gstCalculationMethod: 'exclusive' // 'exclusive' or 'inclusive'
    });

    // Load taxes on component mount
    useEffect(() => {
        if (open) {
            loadTaxes();
        }
    }, [open]);

    // Listen for navigation events to show GST config tab
    useEffect(() => {
        const handleNavigateToMaster = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail.tab === 'gst-config') {
                setActiveTab('gst-config');
            }
        };

        window.addEventListener('navigateToMaster', handleNavigateToMaster);
        return () => window.removeEventListener('navigateToMaster', handleNavigateToMaster);
    }, []);

    // Load taxes from backend
    const loadTaxes = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await settingsApi.taxes.getAll();

            // Handle different response formats
            let taxData: Tax[] = [];
            if (response && (response as any).data) {
                taxData = Array.isArray((response as any).data) ? (response as any).data : (response as any).data.taxes || [];
            } else if (Array.isArray(response)) {
                // @ts-ignore
                taxData = response;
            }

            setTaxes(taxData || []);
        } catch (error) {
            setError('Failed to load tax rates. Please try again.');
            setTaxes([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle refresh
    const handleRefresh = async () => {
        setRefreshing(true);
        setError(null);
        try {
            await loadTaxes();
        } catch (error) {
            setError('Failed to refresh data');
        } finally {
            setRefreshing(false);
        }
    };

    const taxTypes = [
        { value: 'all', label: 'All Types' },
        { value: 'GST', label: 'GST' },
        { value: 'VAT', label: 'VAT' },
        { value: 'Custom', label: 'Custom' }
    ];

    const filteredTaxes = taxes.filter(tax => {
        const matchesSearch = searchTerm === '' ||
            tax.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tax.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || tax.type === filterType;
        return matchesSearch && matchesType;
    });

    const [formData, setFormData] = useState<TaxFormData>({
        name: '',
        type: 'GST',
        rate: '',
        cgst: '',
        sgst: '',
        igst: '',
        description: '',
        isActive: true
    });

    const handleInputChange = (field: keyof TaxFormData, value: any) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };

            // Auto-calculate GST components
            if (field === 'rate' && prev.type === 'GST') {
                const rate = parseFloat(value as string) || 0;
                updated.cgst = rate / 2;
                updated.sgst = rate / 2;
                updated.igst = rate;
            } else if ((field === 'cgst' || field === 'sgst') && prev.type === 'GST') {
                const cgst = field === 'cgst' ? parseFloat(value as string) || 0 : parseFloat(updated.cgst as string) || 0;
                const sgst = field === 'sgst' ? parseFloat(value as string) || 0 : parseFloat(updated.sgst as string) || 0;
                updated.rate = cgst + sgst;
                updated.igst = cgst + sgst;
            }

            return updated;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const taxData = {
                ...formData,
                rate: parseFloat(formData.rate as string) || 0,
                cgst: parseFloat(formData.cgst as string) || 0,
                sgst: parseFloat(formData.sgst as string) || 0,
                igst: parseFloat(formData.igst as string) || 0
            };

            if (editingTax) {
                // Update existing tax
                const response = await settingsApi.taxes.update(editingTax.id, taxData);
                if ((response as any).success || (response as any).data) {
                    setSuccessMessage('Tax updated successfully!');
                    await loadTaxes(); // Reload data
                }
            } else {
                // Add new tax
                const response = await settingsApi.taxes.create(taxData);
                if ((response as any).success || (response as any).data) {
                    setSuccessMessage('Tax added successfully!');
                    await loadTaxes(); // Reload data
                }
            }

            setTimeout(() => setSuccessMessage(''), 3000);
            handleCloseModal();
        } catch (error) {
            setError('Failed to save tax. Please try again.');
        }
    };

    const handleEdit = (tax: Tax) => {
        setEditingTax(tax);
        setFormData({
            name: tax.name,
            type: tax.type,
            rate: tax.rate,
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            description: tax.description || '',
            isActive: tax.isActive
        });
        setShowAddModal(true);
    };

    const handleDelete = async (id: number | string) => {
        if (window.confirm('Are you sure you want to delete this tax rate?')) {
            try {
                await settingsApi.taxes.delete(id);
                setSuccessMessage('Tax deleted successfully!');
                await loadTaxes();
                setTimeout(() => setSuccessMessage(''), 3000);
            } catch (error) {
                setError('Failed to delete tax. Please try again.');
            }
        }
    };

    const handleToggleActive = async (id: number | string) => {
        try {
            const tax = taxes.find(t => t.id === id);
            if (tax) {
                const updatedTax = { ...tax, isActive: !tax.isActive };
                await settingsApi.taxes.update(id, updatedTax);
                setSuccessMessage(`Tax ${updatedTax.isActive ? 'activated' : 'deactivated'} successfully!`);
                await loadTaxes();
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (error) {
            setError('Failed to update tax status. Please try again.');
        }
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setEditingTax(null);
        setFormData({
            name: '',
            type: 'GST',
            rate: '',
            cgst: '',
            sgst: '',
            igst: '',
            description: '',
            isActive: true
        });
    };

    const handleExport = () => {
        // TODO: Implement export functionality
        setError('Export functionality coming soon!');
        setTimeout(() => setError(null), 3000);
    };

    const handleImport = () => {
        // TODO: Implement import functionality
        setError('Import functionality coming soon!');
        setTimeout(() => setError(null), 3000);
    };

    const getTaxTypeColor = (type: string) => {
        const colors: { [key: string]: string } = {
            'GST': 'blue',
            'VAT': 'green',
            'Custom': 'purple'
        };
        return colors[type] || 'gray';
    };

    const getTaxTypeIcon = (type: string) => {
        const icons: { [key: string]: any } = {
            'GST': Receipt,
            'VAT': Percent,
            'Custom': '📊'
        };
        return icons[type] || Receipt;
    };

    if (!open) return null;

    return (
        <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Receipt className="w-6 h-6 text-gray-700" />
                        <h1 className="text-2xl font-bold text-gray-900">Tax Master</h1>
                        <span className="text-sm text-gray-500">({taxes.length} tax rates)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="bg-gray-100 rounded-lg p-1 flex">
                            <button
                                onClick={() => setActiveTab('rates')}
                                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'rates'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Tax Rates
                            </button>
                            <button
                                onClick={() => setActiveTab('gst-config')}
                                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'gst-config'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                GST Configuration
                            </button>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2 disabled:opacity-50"
                            >
                                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                            <button
                                onClick={handleImport}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Import</span>
                            </button>
                            <button
                                onClick={handleExport}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export</span>
                            </button>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Tax</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-3">
                <div className="flex items-center space-x-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name or description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        {taxTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {error}
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-400 hover:text-red-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {successMessage && (
                <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
                    <Check className="w-5 h-5 mr-2" />
                    {successMessage}
                    <button
                        onClick={() => setSuccessMessage('')}
                        className="ml-auto text-green-400 hover:text-green-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                {activeTab === 'rates' ? (
                    // Tax Rates Content
                    <>
                        {isLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="ml-2 text-gray-600">Loading tax rates...</span>
                            </div>
                        ) : filteredTaxes.length === 0 ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <p className="text-gray-600">No tax rates found</p>
                                    {searchTerm && (
                                        <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300"
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedTaxes(filteredTaxes.map(t => t.id));
                                                            } else {
                                                                setSelectedTaxes([]);
                                                            }
                                                        }}
                                                    />
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Details</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Components</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredTaxes.map((tax) => (
                                                <tr key={tax.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTaxes.includes(tax.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedTaxes([...selectedTaxes, tax.id]);
                                                                } else {
                                                                    setSelectedTaxes(selectedTaxes.filter(id => id !== tax.id));
                                                                }
                                                            }}
                                                            className="rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900">{tax.name}</p>
                                                            {tax.description && (
                                                                <p className="text-xs text-gray-500">{tax.description}</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 text-xs rounded-full bg-${getTaxTypeColor(tax.type)}-100 text-${getTaxTypeColor(tax.type)}-800`}>
                                                            {tax.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="text-lg font-semibold text-gray-900">{tax.rate}%</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {tax.type === 'GST' ? (
                                                            <div className="text-xs space-y-1">
                                                                <div className="flex justify-between">
                                                                    <span>CGST:</span>
                                                                    <span className="font-medium">{tax.cgst}%</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span>SGST:</span>
                                                                    <span className="font-medium">{tax.sgst}%</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span>IGST:</span>
                                                                    <span className="font-medium">{tax.igst}%</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-500">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => handleToggleActive(tax.id)}
                                                            className={`px-2 py-1 text-xs rounded-full ${tax.isActive
                                                                    ? 'bg-green-100 text-green-800'
                                                                    : 'bg-gray-100 text-gray-600'
                                                                }`}
                                                        >
                                                            {tax.isActive ? 'Active' : 'Inactive'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <button
                                                                onClick={() => handleEdit(tax)}
                                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(tax.id)}
                                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    // GST Configuration Content
                    <div className="space-y-6">
                        {/* Company GST Information */}
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <Building className="h-5 w-5 mr-2 text-blue-600" />
                                Company GST Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Company GSTIN
                                    </label>
                                    <input
                                        type="text"
                                        value={gstConfig.companyGSTIN}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, companyGSTIN: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your GSTIN (e.g., 27AABCU9603R1ZX)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Default GST Rate
                                    </label>
                                    <select
                                        value={gstConfig.defaultGSTRate}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, defaultGSTRate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Default Rate</option>
                                        {taxes.filter(tax => tax.type === 'GST' && tax.isActive).map(tax => (
                                            <option key={tax.id} value={tax.id}>
                                                {tax.name} - {tax.rate}%
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Choose from Tax Rates defined above
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* GST Calculation Settings */}
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <Calculator className="h-5 w-5 mr-2 text-green-600" />
                                GST Calculation Settings
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Auto-calculate GST on invoices</label>
                                        <p className="text-xs text-gray-500">Automatically apply GST based on product configuration</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={gstConfig.autoCalculateGST}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, autoCalculateGST: e.target.checked }))}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        GST Calculation Method
                                    </label>
                                    <select
                                        value={gstConfig.gstCalculationMethod}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, gstCalculationMethod: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="exclusive">Tax Exclusive (Price + GST)</option>
                                        <option value="inclusive">Tax Inclusive (Price includes GST)</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        How GST should be calculated on product prices
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left">
                                    <div className="text-sm font-medium text-gray-900">Create Standard GST Rates</div>
                                    <div className="text-xs text-gray-500">Add 5%, 12%, 18%, 28% GST rates</div>
                                </button>
                                <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left">
                                    <div className="text-sm font-medium text-gray-900">Import from GST Portal</div>
                                    <div className="text-xs text-gray-500">Sync tax rates from government portal</div>
                                </button>
                                <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left">
                                    <div className="text-sm font-medium text-gray-900">Export Tax Configuration</div>
                                    <div className="text-xs text-gray-500">Download current tax setup</div>
                                </button>
                            </div>
                        </div>

                        {/* Information Panel */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start">
                                <Info className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    <p className="font-medium mb-1">Enterprise Tax Management</p>
                                    <p>All tax rates are managed centrally here. GST-specific workflows and reports will reference these master rates. Changes here will automatically reflect across all modules.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl m-4">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {editingTax ? 'Edit Tax Rate' : 'Add New Tax Rate'}
                                </h2>
                                <button
                                    onClick={handleCloseModal}
                                    className="p-2 hover:bg-gray-100 rounded-lg"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tax Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., GST 18%, VAT 12%"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => handleInputChange('type', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="GST">GST</option>
                                        <option value="VAT">VAT</option>
                                        <option value="Custom">Custom</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Total Rate (%) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={formData.rate}
                                        onChange={(e) => handleInputChange('rate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., 18.00"
                                    />
                                </div>

                                {formData.type === 'GST' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CGST (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.cgst}
                                                onChange={(e) => handleInputChange('cgst', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g., 9.00"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">SGST (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.sgst}
                                                onChange={(e) => handleInputChange('sgst', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g., 9.00"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">IGST (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.igst}
                                                onChange={(e) => handleInputChange('igst', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g., 18.00"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        rows={2}
                                        placeholder="Optional description..."
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => handleInputChange('isActive', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-700">Active</span>
                                    </label>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-6 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    {editingTax ? 'Update Tax' : 'Add Tax'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaxMaster;
