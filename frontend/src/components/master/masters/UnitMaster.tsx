/**
 * UnitMaster Component
 * 
 * Refactored to use useSettingsEntity hook for shared CRUD logic.
 * Reduced from 673 lines to ~350 lines.
 */
import React, { useEffect } from 'react';
import {
    Ruler, Search, Plus, Edit2, Trash2,
    Download, Upload, Loader2, AlertCircle, Check,
    ArrowRight, X, RefreshCw
} from 'lucide-react';
import { settingsApi } from '../../../services/api';
import { useSettingsEntity } from '../hooks';

// ============================================================================
// Types
// ============================================================================

interface UnitMasterProps {
    open?: boolean;
    onClose?: () => void;
}

interface Unit {
    id: number | string;
    code: string;
    name: string;
    symbol: string;
    category: string;
    baseUnit: string;
    isBase: boolean;
    conversionFactor: number;
    description?: string;
    isActive: boolean;
}

interface UnitFormData {
    code: string;
    name: string;
    symbol: string;
    category: string;
    baseUnit: string;
    conversionFactor: string | number;
    description: string;
    isActive: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const UNIT_CATEGORIES = [
    { value: 'all', label: 'All Categories' },
    { value: 'quantity', label: 'Quantity' },
    { value: 'volume', label: 'Volume' },
    { value: 'weight', label: 'Weight' },
    { value: 'special', label: 'Special' }
];

const INITIAL_FORM_DATA: UnitFormData = {
    code: '',
    name: '',
    symbol: '',
    category: 'quantity',
    baseUnit: '',
    conversionFactor: 1,
    description: '',
    isActive: true
};

// ============================================================================
// Helper Functions
// ============================================================================

const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
        quantity: 'blue',
        volume: 'green',
        weight: 'purple',
        special: 'orange'
    };
    return colors[category] || 'gray';
};

const getConversionChain = (unit: Unit, allUnits: Unit[]): Unit[] => {
    const chain = [unit];
    let currentUnit = unit;

    while (currentUnit.baseUnit) {
        const baseUnit = allUnits.find(u => u.code === currentUnit.baseUnit);
        if (!baseUnit) break;
        chain.push(baseUnit);
        currentUnit = baseUnit;
    }

    return chain.reverse();
};

// ============================================================================
// Main Component
// ============================================================================

const UnitMaster: React.FC<UnitMasterProps> = ({ open, onClose }) => {
    const {
        entities: units,
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
        formData,
        loadEntities,
        handleRefresh,
        handleInputChange,
        handleEdit,
        handleSubmit,
        handleDelete,
        handleToggleActive,
        handleCloseModal,
        clearError,
        clearSuccess
    } = useSettingsEntity<Unit, UnitFormData>({
        entityName: 'unit',
        idField: 'id',
        api: settingsApi.units as any,
        searchFields: ['name', 'code', 'symbol'],
        filterField: 'category',
        initialFormData: INITIAL_FORM_DATA,
        entityToFormData: (unit) => ({
            code: unit.code,
            name: unit.name,
            symbol: unit.symbol,
            category: unit.category,
            baseUnit: unit.baseUnit || '',
            conversionFactor: unit.conversionFactor,
            description: unit.description || '',
            isActive: unit.isActive
        }),
        formDataToEntity: (data) => ({
            ...data,
            isBase: !data.baseUnit,
            conversionFactor: parseFloat(String(data.conversionFactor)) || 1
        }),
        loadOnOpen: true
    });

    // Load when opened
    useEffect(() => {
        if (open) {
            loadEntities();
        }
    }, [open, loadEntities]);

    // Helper for available base units in current category
    const getAvailableBaseUnits = (category: string) =>
        units.filter(u => u.category === category && u.isActive);

    // Check for dependent units before delete
    const handleDeleteWithCheck = async (id: string | number) => {
        const unit = units.find(u => u.id === id);
        if (!unit) return;

        const dependentUnits = units.filter(u => u.baseUnit === unit.code);
        if (dependentUnits.length > 0) {
            // Can't use setError directly since we need custom message
            window.alert(`Cannot delete ${unit.name}. ${dependentUnits.length} units depend on it.`);
            return;
        }

        await handleDelete(id);
    };

    if (!open) return null;

    return (
        <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Ruler className="w-6 h-6 text-gray-700" />
                        <h1 className="text-2xl font-bold text-gray-900">Unit Master</h1>
                        <span className="text-sm text-gray-500">({units.length} units)</span>
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
                            <Plus className="w-4 h-4" /><span>Add Unit</span>
                        </button>
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
                            placeholder="Search by name, code, or symbol..."
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
                        {UNIT_CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
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

            {/* Units Table */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <span className="ml-2 text-gray-600">Loading units...</span>
                    </div>
                ) : filteredEntities.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <Ruler className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No units found</p>
                            {searchTerm && <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
                        <div className="flex-1 overflow-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Details</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversion</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredEntities.map((unit) => {
                                        const conversionChain = getConversionChain(unit, units);
                                        return (
                                            <tr key={unit.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-gray-900">{unit.name} ({unit.symbol})</p>
                                                    <p className="text-xs text-gray-500">Code: {unit.code}{unit.description && ` • ${unit.description}`}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 text-xs rounded-full bg-${getCategoryColor(unit.category)}-100 text-${getCategoryColor(unit.category)}-800`}>
                                                        {unit.category}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm">
                                                        {unit.isBase ? (
                                                            <span className="text-gray-500">Base Unit</span>
                                                        ) : (
                                                            <div className="flex items-center space-x-1 text-gray-700">
                                                                {conversionChain.map((u, index) => (
                                                                    <React.Fragment key={u.id}>
                                                                        {index > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                                                                        <span className={index === conversionChain.length - 1 ? 'font-medium' : ''}>
                                                                            {index === 0 ? '1' : u.conversionFactor} {u.symbol}
                                                                        </span>
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handleToggleActive(unit.id)}
                                                        className={`px-2 py-1 text-xs rounded-full ${unit.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                                                    >
                                                        {unit.isActive ? 'Active' : 'Inactive'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        <button onClick={() => handleEdit(unit)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteWithCheck(unit.id)}
                                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                            disabled={unit.isBase}
                                                            title={unit.isBase ? 'Cannot delete base unit' : ''}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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
                                    {editingEntity ? 'Edit Unit' : 'Add New Unit'}
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
                                        Unit Code <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.code}
                                        onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., TAB, ML, KG"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Unit Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Tablet, Milliliter"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Symbol <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.symbol}
                                        onChange={(e) => handleInputChange('symbol', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Tab, ml, kg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => {
                                            handleInputChange('category', e.target.value);
                                            handleInputChange('baseUnit', '');
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="quantity">Quantity</option>
                                        <option value="volume">Volume</option>
                                        <option value="weight">Weight</option>
                                        <option value="special">Special</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Base Unit</label>
                                    <select
                                        value={formData.baseUnit}
                                        onChange={(e) => handleInputChange('baseUnit', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">-- None (This is base unit) --</option>
                                        {getAvailableBaseUnits(formData.category).map(unit => (
                                            <option key={unit.id} value={unit.code}>{unit.name} ({unit.symbol})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Conversion Factor</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={formData.conversionFactor}
                                        onChange={(e) => handleInputChange('conversionFactor', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        disabled={!formData.baseUnit}
                                        placeholder="e.g., 10, 1000"
                                    />
                                </div>
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

                            <div className="mt-6 flex items-center justify-end space-x-3">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    {editingEntity ? 'Update Unit' : 'Add Unit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitMaster;
