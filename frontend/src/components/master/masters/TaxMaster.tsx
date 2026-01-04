/**
 * TaxMaster Component
 * 
 * Manages tax rates following Indian GST principles:
 * - GST = CGST + SGST (intrastate) or IGST (interstate)
 * - Standard rates: 0%, 5%, 12%, 18%, 28%
 * - CGST = SGST = GST Rate / 2
 * - IGST = GST Rate (for interstate transactions)
 * 
 * Refactored to use useSettingsEntity hook for shared CRUD.
 * Reduced from 815 lines to ~550 lines.
 */
import React, { useState, useEffect } from 'react';
import {
    Receipt, Search, Plus, Edit2, Trash2,
    Download, Upload, Loader2, AlertCircle, Check,
    X, RefreshCw, Building, Calculator, Info
} from 'lucide-react';
import { settingsApi } from '../../../services/api';
import { useSettingsEntity } from '../hooks';

// ============================================================================
// Types
// ============================================================================

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

interface GSTConfig {
    companyGSTIN: string;
    defaultGSTRate: string;
    autoCalculateGST: boolean;
    gstCalculationMethod: 'exclusive' | 'inclusive';
}

// ============================================================================
// Constants - Indian GST Standard Rates
// ============================================================================

const TAX_TYPES = [
    { value: 'all', label: 'All Types' },
    { value: 'GST', label: 'GST' },
    { value: 'VAT', label: 'VAT' },
    { value: 'Custom', label: 'Custom' }
];

const INITIAL_FORM_DATA: TaxFormData = {
    name: '',
    type: 'GST',
    rate: '',
    cgst: '',
    sgst: '',
    igst: '',
    description: '',
    isActive: true
};

const INITIAL_GST_CONFIG: GSTConfig = {
    companyGSTIN: '',
    defaultGSTRate: '',
    autoCalculateGST: true,
    gstCalculationMethod: 'exclusive'
};

// ============================================================================
// GST Calculation Helpers - Following Indian GST Principles
// ============================================================================

/**
 * Calculate GST components from total rate
 * In India: CGST = SGST = Rate/2, IGST = Rate
 */
const calculateGSTFromRate = (rate: number): { cgst: number; sgst: number; igst: number } => ({
    cgst: rate / 2,
    sgst: rate / 2,
    igst: rate
});

/**
 * Calculate total rate from CGST + SGST
 * In India: Total = CGST + SGST, IGST = CGST + SGST
 */
const calculateRateFromComponents = (cgst: number, sgst: number): { rate: number; igst: number } => ({
    rate: cgst + sgst,
    igst: cgst + sgst
});

const getTaxTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
        'GST': 'blue',
        'VAT': 'green',
        'Custom': 'purple'
    };
    return colors[type] || 'gray';
};

// ============================================================================
// Main Component
// ============================================================================

const TaxMaster: React.FC<TaxMasterProps> = ({ open, onClose }) => {
    // Tab state (local - not part of shared hook)
    const [activeTab, setActiveTab] = useState<'rates' | 'gst-config'>('rates');
    const [gstConfig, setGstConfig] = useState<GSTConfig>(INITIAL_GST_CONFIG);

    // Custom form state with GST auto-calculation
    const [localFormData, setLocalFormData] = useState<TaxFormData>(INITIAL_FORM_DATA);

    // Use shared hook for CRUD operations
    const {
        entities: taxes,
        filteredEntities,
        isLoading,
        error,
        successMessage,
        refreshing,
        searchTerm,
        setSearchTerm,
        filterValue,
        setFilterValue,
        showModal,
        setShowModal,
        editingEntity,
        loadEntities,
        handleRefresh,
        handleDelete,
        handleToggleActive,
        handleCloseModal: baseCloseModal,
        clearError,
        clearSuccess
    } = useSettingsEntity<Tax, TaxFormData>({
        entityName: 'tax',
        idField: 'id',
        api: settingsApi.taxes,
        searchFields: ['name', 'description'],
        filterField: 'type',
        initialFormData: INITIAL_FORM_DATA,
        entityToFormData: (tax) => ({
            name: tax.name,
            type: tax.type,
            rate: tax.rate,
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            description: tax.description || '',
            isActive: tax.isActive
        }),
        formDataToEntity: (data) => ({
            ...data,
            rate: parseFloat(String(data.rate)) || 0,
            cgst: parseFloat(String(data.cgst)) || 0,
            sgst: parseFloat(String(data.sgst)) || 0,
            igst: parseFloat(String(data.igst)) || 0
        }),
        loadOnOpen: true
    });

    // Load when opened
    useEffect(() => {
        if (open) {
            loadEntities();
        }
    }, [open, loadEntities]);

    // Listen for navigation events to show GST config tab
    useEffect(() => {
        const handleNavigateToMaster = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail?.tab === 'gst-config') {
                setActiveTab('gst-config');
            }
        };
        window.addEventListener('navigateToMaster', handleNavigateToMaster);
        return () => window.removeEventListener('navigateToMaster', handleNavigateToMaster);
    }, []);

    // ========================================
    // GST Form Logic - Auto-calculate components
    // ========================================

    const handleInputChange = (field: keyof TaxFormData, value: unknown) => {
        setLocalFormData(prev => {
            const updated = { ...prev, [field]: value };

            // Auto-calculate GST components following Indian GST rules
            if (prev.type === 'GST') {
                if (field === 'rate') {
                    // When rate changes: CGST = SGST = rate/2, IGST = rate
                    const rate = parseFloat(String(value)) || 0;
                    const { cgst, sgst, igst } = calculateGSTFromRate(rate);
                    updated.cgst = cgst;
                    updated.sgst = sgst;
                    updated.igst = igst;
                } else if (field === 'cgst' || field === 'sgst') {
                    // When CGST/SGST changes: recalculate total rate and IGST
                    const cgst = field === 'cgst' ? parseFloat(String(value)) || 0 : parseFloat(String(updated.cgst)) || 0;
                    const sgst = field === 'sgst' ? parseFloat(String(value)) || 0 : parseFloat(String(updated.sgst)) || 0;
                    const { rate, igst } = calculateRateFromComponents(cgst, sgst);
                    updated.rate = rate;
                    updated.igst = igst;
                }
            }

            return updated;
        });
    };

    const handleEdit = (tax: Tax) => {
        setLocalFormData({
            name: tax.name,
            type: tax.type,
            rate: tax.rate,
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            description: tax.description || '',
            isActive: tax.isActive
        });
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setLocalFormData(INITIAL_FORM_DATA);
        baseCloseModal();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const taxData = {
                ...localFormData,
                rate: parseFloat(String(localFormData.rate)) || 0,
                cgst: parseFloat(String(localFormData.cgst)) || 0,
                sgst: parseFloat(String(localFormData.sgst)) || 0,
                igst: parseFloat(String(localFormData.igst)) || 0
            };

            if (editingEntity) {
                await settingsApi.taxes.update(editingEntity.id, taxData);
            } else {
                await settingsApi.taxes.create(taxData);
            }

            await loadEntities();
            handleCloseModal();
        } catch (err) {
            // Error handled by hook
        }
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
                        {/* Tabs */}
                        <div className="bg-gray-100 rounded-lg p-1 flex">
                            <button
                                onClick={() => setActiveTab('rates')}
                                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'rates' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Tax Rates
                            </button>
                            <button
                                onClick={() => setActiveTab('gst-config')}
                                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'gst-config' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                GST Configuration
                            </button>
                        </div>
                        {/* Action Buttons */}
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2 disabled:opacity-50"
                            >
                                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2">
                                <Upload className="w-4 h-4" /><span>Import</span>
                            </button>
                            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2">
                                <Download className="w-4 h-4" /><span>Export</span>
                            </button>
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                            >
                                <Plus className="w-4 h-4" /><span>Add Tax</span>
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
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        {TAX_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />{error}
                    <button onClick={clearError} className="ml-auto text-red-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {successMessage && (
                <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
                    <Check className="w-5 h-5 mr-2" />{successMessage}
                    <button onClick={clearSuccess} className="ml-auto text-green-400 hover:text-green-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                {activeTab === 'rates' ? (
                    /* Tax Rates Tab */
                    <>
                        {isLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="ml-2 text-gray-600">Loading tax rates...</span>
                            </div>
                        ) : filteredEntities.length === 0 ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <p className="text-gray-600">No tax rates found</p>
                                    {searchTerm && <p className="text-sm text-gray-500 mt-2">Try adjusting your search</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Details</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Rate</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">GST Components</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredEntities.map((tax) => (
                                                <tr key={tax.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <p className="text-sm font-medium text-gray-900">{tax.name}</p>
                                                        {tax.description && <p className="text-xs text-gray-500">{tax.description}</p>}
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
                                                                <div className="flex justify-between max-w-24 mx-auto">
                                                                    <span>CGST:</span><span className="font-medium">{tax.cgst}%</span>
                                                                </div>
                                                                <div className="flex justify-between max-w-24 mx-auto">
                                                                    <span>SGST:</span><span className="font-medium">{tax.sgst}%</span>
                                                                </div>
                                                                <div className="flex justify-between max-w-24 mx-auto text-blue-600">
                                                                    <span>IGST:</span><span className="font-medium">{tax.igst}%</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400">N/A</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => handleToggleActive(tax.id)}
                                                            className={`px-2 py-1 text-xs rounded-full ${tax.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                                                        >
                                                            {tax.isActive ? 'Active' : 'Inactive'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <button onClick={() => handleEdit(tax)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDelete(tax.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
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
                    /* GST Configuration Tab */
                    <div className="space-y-6">
                        {/* Company GST Information */}
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <Building className="h-5 w-5 mr-2 text-blue-600" />
                                Company GST Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Company GSTIN</label>
                                    <input
                                        type="text"
                                        value={gstConfig.companyGSTIN}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, companyGSTIN: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., 27AABCU9603R1ZX"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default GST Rate</label>
                                    <select
                                        value={gstConfig.defaultGSTRate}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, defaultGSTRate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Default Rate</option>
                                        {taxes.filter(tax => tax.type === 'GST' && tax.isActive).map(tax => (
                                            <option key={tax.id} value={String(tax.id)}>{tax.name} - {tax.rate}%</option>
                                        ))}
                                    </select>
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
                                    <label className="block text-sm font-medium text-gray-700 mb-2">GST Calculation Method</label>
                                    <select
                                        value={gstConfig.gstCalculationMethod}
                                        onChange={(e) => setGstConfig(prev => ({ ...prev, gstCalculationMethod: e.target.value as 'exclusive' | 'inclusive' }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="exclusive">Tax Exclusive (Price + GST)</option>
                                        <option value="inclusive">Tax Inclusive (Price includes GST)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Info Panel */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start">
                                <Info className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    <p className="font-medium mb-1">Indian GST Structure</p>
                                    <p>GST = CGST + SGST (intrastate) or IGST (interstate). Standard rates: 0%, 5%, 12%, 18%, 28%.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl m-4">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {editingEntity ? 'Edit Tax Rate' : 'Add New Tax Rate'}
                                </h2>
                                <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-lg">
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
                                        value={localFormData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., GST 18%, GST 5%"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
                                    <select
                                        value={localFormData.type}
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
                                        value={localFormData.rate}
                                        onChange={(e) => handleInputChange('rate', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., 18"
                                    />
                                    {localFormData.type === 'GST' && (
                                        <p className="text-xs text-gray-500 mt-1">CGST & SGST will be auto-calculated as rate/2</p>
                                    )}
                                </div>

                                {/* GST Components - Only for GST type */}
                                {localFormData.type === 'GST' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CGST (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={localFormData.cgst}
                                                onChange={(e) => handleInputChange('cgst', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">SGST (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={localFormData.sgst}
                                                onChange={(e) => handleInputChange('sgst', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">IGST (%) - Interstate</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={localFormData.igst}
                                                readOnly
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Auto-calculated: CGST + SGST</p>
                                        </div>
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                        value={localFormData.description}
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
                                            checked={localFormData.isActive}
                                            onChange={(e) => handleInputChange('isActive', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-700">Active</span>
                                    </label>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-end space-x-3">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    {editingEntity ? 'Update Tax' : 'Add Tax'}
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
