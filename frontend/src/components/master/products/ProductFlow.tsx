/**
 * ProductFlow Component
 * 
 * Full-page immersive product creation experience.
 * Streamlined layout following CustomerFlow pattern with pharma-specific fields.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Package, Building2, Hash, Percent, IndianRupee, Shield,
    AlertTriangle, Thermometer, FileText, ArrowLeft, Loader2,
    Save, Pill, Box, Calendar
} from 'lucide-react';
import { productsApi } from '../../../services/api';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';
import MonthYearPicker from '../../global/ui/forms/MonthYearPicker';

// ==================== TYPES ====================

interface ProductFlowProps {
    open?: boolean;
    onClose?: () => void;
    onProductCreated?: (product: any) => void;
    initialProductName?: string;
}

interface ProductFormData {
    // Basic Info
    product_name: string;
    product_code: string;
    manufacturer: string;
    generic_name: string;
    salt_composition: string;
    // Classification
    category_id: string;
    category_name: string;
    type_id: string;
    product_type: string;
    // Tax
    hsn_code: string;
    gst_percent: number;
    // Compliance
    schedule_type: string;
    is_narcotic: boolean;
    prescription_required: boolean;
    storage_condition: string;
    // Pricing (per unit)
    mrp_per_unit: string;
    sale_price_per_unit: string;
    cost_per_unit: string;
    // Pack Config
    pack_type: string;
    units_per_pack: number;
    packages_per_box: number;
    // Initial Stock
    batch_number: string;
    manufacturing_date: string;
    expiry_date: string;
    initial_quantity: string;
}

interface Category {
    category_id: number;
    category_name: string;
}

interface ProductType {
    type_id: number;
    type_name: string;
    default_base_uom?: string;
}

// ==================== CONSTANTS ====================

const SCHEDULE_TYPES = [
    { value: '', label: 'OTC (Over The Counter)' },
    { value: 'H', label: 'Schedule H (Prescription Drug)' },
    { value: 'H1', label: 'Schedule H1 (Prescription with Warning)' },
    { value: 'X', label: 'Schedule X (Narcotic/Psychotropic)' },
    { value: 'G', label: 'Schedule G (Hormonal Preparations)' },
    { value: 'J', label: 'Schedule J (Specific Diseases)' }
];

const STORAGE_CONDITIONS = [
    { value: 'room_temp', label: 'Room Temperature (15-30°C)' },
    { value: 'cool', label: 'Cool & Dry (8-15°C)' },
    { value: 'refrigerated', label: 'Refrigerated (2-8°C)' },
    { value: 'frozen', label: 'Frozen (-20°C)' }
];

const GST_RATES = [
    { value: 0, label: '0%' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' }
];

const PACK_TYPES = [
    { value: 'STRIP', label: 'Strip' },
    { value: 'BOTTLE', label: 'Bottle' },
    { value: 'BOX', label: 'Box' },
    { value: 'TUBE', label: 'Tube' },
    { value: 'VIAL', label: 'Vial' },
    { value: 'SACHET', label: 'Sachet' },
    { value: 'UNIT', label: 'Unit' }
];

// ==================== COMPONENT ====================

const ProductFlow: React.FC<ProductFlowProps> = ({
    open = true,
    onClose,
    onProductCreated,
    initialProductName = ''
}) => {
    const formRef = useRef<HTMLDivElement>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    // Master data
    const [categories, setCategories] = useState<Category[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [loadingMaster, setLoadingMaster] = useState(true);

    const [formData, setFormData] = useState<ProductFormData>({
        // Basic Info
        product_name: initialProductName,
        product_code: '',
        manufacturer: '',
        generic_name: '',
        salt_composition: '',
        // Classification
        category_id: '',
        category_name: '',
        type_id: '',
        product_type: '',
        // Tax
        hsn_code: '3004',
        gst_percent: 12,
        // Compliance
        schedule_type: '',
        is_narcotic: false,
        prescription_required: false,
        storage_condition: 'room_temp',
        // Pricing
        mrp_per_unit: '',
        sale_price_per_unit: '',
        cost_per_unit: '',
        // Pack Config
        pack_type: 'STRIP',
        units_per_pack: 10,
        packages_per_box: 10,
        // Initial Stock
        batch_number: '',
        manufacturing_date: '',
        expiry_date: '',
        initial_quantity: '100'
    });

    // Enable Enter-as-Tab navigation
    useEnterAsTab({
        containerRef: formRef,
        enabled: open,
        excludeSelectors: ['textarea', 'button[type="submit"]']
    });

    // ESC key handling
    useEscapeKey(
        useCallback(() => {
            if (onClose) onClose();
        }, [onClose]),
        open,
        'ProductFlow-Main'
    );

    // Load master data
    useEffect(() => {
        const loadMasterData = async () => {
            if (!open) return;
            try {
                setLoadingMaster(true);
                const [catRes, typeRes] = await Promise.all([
                    productsApi.getMasterCategories(),
                    productsApi.getProductTypes()
                ]);
                if (catRes.data?.success) setCategories(catRes.data.data);
                if (typeRes.data?.success) setProductTypes(typeRes.data.data);
            } catch (err) {
                console.error('Failed to load master data:', err);
            } finally {
                setLoadingMaster(false);
            }
        };
        loadMasterData();
    }, [open]);

    // Update product name when opened with initial value
    useEffect(() => {
        if (open && initialProductName) {
            setFormData(prev => ({ ...prev, product_name: initialProductName }));
        }
    }, [open, initialProductName]);

    // Handle schedule type change (auto-set narcotic/prescription)
    const handleScheduleTypeChange = (value: string) => {
        const isNarcotic = value === 'X';
        const prescriptionRequired = ['H', 'H1', 'X'].includes(value);
        setFormData({
            ...formData,
            schedule_type: value,
            is_narcotic: isNarcotic,
            prescription_required: prescriptionRequired
        });
    };

    // Calculate expiry from manufacturing date
    const handleMfgDateChange = (date: string) => {
        let expiryDate = '';
        if (date && date.includes('-')) {
            const [year, month] = date.split('-');
            const d = new Date(parseInt(year), parseInt(month) - 1);
            d.setMonth(d.getMonth() + 24); // 2 years default
            expiryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        setFormData({ ...formData, manufacturing_date: date, expiry_date: expiryDate });
    };

    // Auto-calculate sale price from MRP
    const handleMrpChange = (value: string) => {
        const mrp = parseFloat(value) || 0;
        const salePrice = (mrp * 0.85).toFixed(2); // 15% margin default
        const costPrice = (mrp * 0.65).toFixed(2); // 35% margin default
        setFormData({
            ...formData,
            mrp_per_unit: value,
            sale_price_per_unit: formData.sale_price_per_unit || salePrice,
            cost_per_unit: formData.cost_per_unit || costPrice
        });
    };

    // Save product
    const handleSave = async () => {
        setSaving(true);
        setErrors([]);

        // Validation
        const validationErrors: string[] = [];
        if (!formData.product_name.trim()) validationErrors.push('Product name is required');
        if (!formData.manufacturer.trim()) validationErrors.push('Manufacturer is required');
        if (!formData.mrp_per_unit || parseFloat(formData.mrp_per_unit) <= 0) validationErrors.push('Valid MRP is required');
        if (!formData.sale_price_per_unit || parseFloat(formData.sale_price_per_unit) <= 0) validationErrors.push('Valid sale price is required');
        if (!formData.expiry_date) validationErrors.push('Expiry date is required');

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setSaving(false);
            return;
        }

        try {
            const formatDate = (s: string) => s ? `${s}-01` : null;

            const productData = {
                product_name: formData.product_name,
                product_code: formData.product_code || undefined,
                generic_name: formData.generic_name || formData.salt_composition,
                manufacturer: formData.manufacturer,
                brand: formData.manufacturer,
                category_id: formData.category_id ? parseInt(formData.category_id) : null,
                type_id: formData.type_id ? parseInt(formData.type_id) : null,
                composition: formData.salt_composition ? { active: formData.salt_composition } : {},
                hsn_code: formData.hsn_code,
                gst_percent: formData.gst_percent,
                drug_schedule: formData.schedule_type,
                is_narcotic: formData.is_narcotic,
                requires_prescription: formData.prescription_required,
                storage_conditions: formData.storage_condition,
                // Pricing (canonical field names)
                mrp_per_unit: parseFloat(formData.mrp_per_unit) || 0,
                sale_price_per_unit: parseFloat(formData.sale_price_per_unit) || 0,
                cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
                // Pack config
                pack_type: formData.pack_type,
                pack_size: formData.units_per_pack,
                units_per_pack: formData.units_per_pack,
                packages_per_box: formData.packages_per_box,
                // Initial batch
                batch_number: formData.batch_number || `BATCH${Date.now().toString().slice(-8)}`,
                manufacturing_date: formatDate(formData.manufacturing_date),
                expiry_date: formatDate(formData.expiry_date),
                initial_quantity: parseInt(formData.initial_quantity) || 100,
                // Flags
                maintain_batch: true,
                maintain_expiry: true,
                is_active: true
            };

            const response = await productsApi.create(productData);

            if (response.data) {
                const created = {
                    ...response.data,
                    product_name: formData.product_name,
                    mrp_per_unit: parseFloat(formData.mrp_per_unit),
                    sale_price_per_unit: parseFloat(formData.sale_price_per_unit)
                };

                toast.success(`Product "${formData.product_name}" created successfully!`);
                onProductCreated?.(created);
                onClose?.();
            }
        } catch (error: any) {
            console.error('Error creating product:', error);
            const detail = error.response?.data?.detail;
            if (typeof detail === 'string') {
                setErrors([detail]);
            } else if (Array.isArray(detail)) {
                setErrors(detail.map((e: any) => e.msg || JSON.stringify(e)));
            } else {
                setErrors(['Failed to create product. Please try again.']);
            }
            toast.error('Failed to create product');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-gray-50 z-50 overflow-hidden flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 shrink-0">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900">Add New Product</h1>
                            <p className="text-sm text-gray-500">Create product with initial stock</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Product
                    </button>
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto py-6" ref={formRef}>
                <div className="max-w-4xl mx-auto px-6 space-y-8">
                    {/* Error Display */}
                    {errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-red-800">Please fix the following errors:</p>
                                    <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                                        {errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Basic Information */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5 text-green-600" />
                            Product Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Product Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.product_name}
                                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g., Dolo 650"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Product Code</label>
                                <input
                                    type="text"
                                    value={formData.product_code}
                                    onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Auto-generated"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Manufacturer <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.manufacturer}
                                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g., Micro Labs"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    value={formData.category_id}
                                    onChange={(e) => {
                                        const cat = categories.find(c => c.category_id === parseInt(e.target.value));
                                        setFormData({
                                            ...formData,
                                            category_id: e.target.value,
                                            category_name: cat?.category_name || ''
                                        });
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    disabled={loadingMaster}
                                >
                                    <option value="">{loadingMaster ? 'Loading...' : 'Select Category'}</option>
                                    {categories.map(cat => (
                                        <option key={cat.category_id} value={cat.category_id}>{cat.category_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                                <select
                                    value={formData.type_id}
                                    onChange={(e) => {
                                        const pt = productTypes.find(t => t.type_id === parseInt(e.target.value));
                                        setFormData({
                                            ...formData,
                                            type_id: e.target.value,
                                            product_type: pt?.type_name || ''
                                        });
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    disabled={loadingMaster}
                                >
                                    <option value="">{loadingMaster ? 'Loading...' : 'Select Type'}</option>
                                    {productTypes.map(pt => (
                                        <option key={pt.type_id} value={pt.type_id}>{pt.type_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Salt Composition</label>
                                <input
                                    type="text"
                                    value={formData.salt_composition}
                                    onChange={(e) => setFormData({ ...formData, salt_composition: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g., Paracetamol 650mg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                                <input
                                    type="text"
                                    value={formData.generic_name}
                                    onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g., Paracetamol"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Pricing & Tax */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <IndianRupee className="w-5 h-5 text-green-600" />
                            Pricing & Tax
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    MRP <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        value={formData.mrp_per_unit}
                                        onChange={(e) => handleMrpChange(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Sale Price <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        value={formData.sale_price_per_unit}
                                        onChange={(e) => setFormData({ ...formData, sale_price_per_unit: e.target.value })}
                                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        value={formData.cost_per_unit}
                                        onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
                                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                                <input
                                    type="text"
                                    value={formData.hsn_code}
                                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="3004"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate</label>
                                <select
                                    value={formData.gst_percent}
                                    onChange={(e) => setFormData({ ...formData, gst_percent: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                >
                                    {GST_RATES.map(rate => (
                                        <option key={rate.value} value={rate.value}>{rate.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Pack Configuration */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Box className="w-5 h-5 text-green-600" />
                            Pack Configuration
                        </h2>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Pack Type</label>
                                <select
                                    value={formData.pack_type}
                                    onChange={(e) => setFormData({ ...formData, pack_type: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                >
                                    {PACK_TYPES.map(pt => (
                                        <option key={pt.value} value={pt.value}>{pt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Units per Pack</label>
                                <input
                                    type="number"
                                    value={formData.units_per_pack}
                                    onChange={(e) => setFormData({ ...formData, units_per_pack: parseInt(e.target.value) || 1 })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    min="1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Packs per Box</label>
                                <input
                                    type="number"
                                    value={formData.packages_per_box}
                                    onChange={(e) => setFormData({ ...formData, packages_per_box: parseInt(e.target.value) || 1 })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    min="1"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Initial Stock */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-green-600" />
                            Initial Stock & Batch
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number</label>
                                <input
                                    type="text"
                                    value={formData.batch_number}
                                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Auto-generated"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mfg Date</label>
                                <MonthYearPicker
                                    value={formData.manufacturing_date}
                                    onChange={handleMfgDateChange}
                                    maxDate={new Date()}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expiry Date <span className="text-red-500">*</span>
                                </label>
                                <MonthYearPicker
                                    value={formData.expiry_date}
                                    onChange={(v) => setFormData({ ...formData, expiry_date: v })}
                                    minDate={new Date()}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Quantity</label>
                                <input
                                    type="number"
                                    value={formData.initial_quantity}
                                    onChange={(e) => setFormData({ ...formData, initial_quantity: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="100"
                                    min="0"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Pharmaceutical Compliance */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-red-500" />
                            Pharmaceutical Compliance
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Drug Schedule</label>
                                <select
                                    value={formData.schedule_type}
                                    onChange={(e) => handleScheduleTypeChange(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                >
                                    {SCHEDULE_TYPES.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                                {formData.schedule_type === 'X' && (
                                    <p className="text-xs text-red-600 mt-1 flex items-center">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Requires narcotic register entry
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Storage Condition</label>
                                <select
                                    value={formData.storage_condition}
                                    onChange={(e) => setFormData({ ...formData, storage_condition: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                >
                                    {STORAGE_CONDITIONS.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end gap-6 pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.prescription_required}
                                        onChange={(e) => setFormData({ ...formData, prescription_required: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                        disabled={['H', 'H1', 'X'].includes(formData.schedule_type)}
                                    />
                                    <span className="text-sm text-gray-700">Prescription Required</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_narcotic}
                                        onChange={(e) => setFormData({ ...formData, is_narcotic: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                        disabled={formData.schedule_type === 'X'}
                                    />
                                    <span className="text-sm text-gray-700">Narcotic Drug</span>
                                </label>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            {/* Sticky Footer */}
            <footer className="bg-white border-t border-gray-200 shrink-0">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Product'}
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default ProductFlow;
