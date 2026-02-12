import React, { useState, useEffect, useRef, useCallback, ChangeEvent, KeyboardEvent } from 'react';
import { Package, Pill, Building2, Hash, Percent, IndianRupee, Shield, AlertTriangle, Thermometer, FileText } from 'lucide-react';
import { productsApi } from '../../../services/api';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import syncEngine from '../../../services/offline/sync/syncEngine';
import PackTypeSelector from '../selector/PackTypeSelector';
import MonthYearPicker from '../ui/forms/MonthYearPicker';
import { useToast } from '../ui/feedback/Toast';
import { FullScreenModal } from '../modals/FullScreenModal';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import useEscapeKey from '../../../hooks/useEscapeKey';
import type { Product as CanonicalProduct } from '../../../types/models';

// ==================== TYPE DEFINITIONS ====================

// Extended Product with UI-specific fields for creation modal
type Product = CanonicalProduct & {
    id?: number | string;
    batch_number?: string;
    manufacturing_date?: string;
    expiry_date?: string;
    quantity_available?: number;
    [key: string]: unknown;
};

interface ProductFormData {
    product_name: string;
    product_code: string;
    manufacturer: string;
    hsn_code: string;
    gst_percent: number | string;
    mrp: string;
    sale_price: string;
    category: string;
    category_id: string;
    product_type: string;
    type_id: string;
    batch_number: string;
    manufacturing_date: string;
    expiry_date: string;
    quantity_available: string;
    cost_per_unit: string;
    salt_composition: string;
    schedule_type: string;
    is_narcotic: boolean;
    prescription_required: boolean;
    storage_condition: string;
    generic_name: string;
    composition: string;
    [key: string]: unknown;
}

interface PackConfig {
    sale_unit: string;
    units_per_pack: number;  // Backend standard: units in one pack
    packages_per_box: number;  // Backend standard: packs in one box
    use_boxes: boolean;
    pack_type_input: string;
    pack_size: number | null;
    pack_unit: string | null;
    base_unit?: string;
    [key: string]: unknown;
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

export interface ProductCreationModalProps {
    show: boolean;
    onClose: () => void;
    onProductCreated: (product: Product) => void;
    initialProductName?: string;
}

// ==================== COMPONENT ====================

const ProductCreationModal: React.FC<ProductCreationModalProps> = ({
    show,
    onClose,
    onProductCreated,
    initialProductName = ''
}) => {
    const toast = useToast();
    const productFormRef = useRef<HTMLDivElement>(null);

    // Enable Enter-as-Tab navigation (Marg ERP style)
    useEnterAsTab({
        containerRef: productFormRef,
        enabled: show,
        excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
    });

    // ESC key handling
    useEscapeKey(
        useCallback(() => {
            if (onClose) onClose();
        }, [onClose]),
        show,
        'ProductCreation-Main'
    );

    const [newProduct, setNewProduct] = useState<ProductFormData>({
        product_name: initialProductName,
        product_code: '',
        manufacturer: '',
        hsn_code: '3004',
        gst_percent: 12,
        mrp: '',
        sale_price: '',
        category: '',
        category_id: '',
        product_type: '',
        type_id: '',
        batch_number: '',
        manufacturing_date: '',
        expiry_date: '',
        quantity_available: '',
        cost_per_unit: '',
        salt_composition: '',
        schedule_type: '',
        is_narcotic: false,
        prescription_required: false,
        storage_condition: 'room_temp',
        generic_name: '',
        composition: ''
    });

    const [packConfig, setPackConfig] = useState<PackConfig>({
        sale_unit: '',
        units_per_pack: 10,
        packages_per_box: 10,
        use_boxes: true,
        pack_type_input: '10*10',
        pack_size: null,
        pack_unit: null
    });
    const [saving, setSaving] = useState<boolean>(false);
    const [errors, setErrors] = useState<string[]>([]);

    // Master data state
    const [categories, setCategories] = useState<Category[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [loadingMasterData, setLoadingMasterData] = useState<boolean>(true);

    // Custom input states
    const [showCustomCategory, setShowCustomCategory] = useState<boolean>(false);
    const [showCustomType, setShowCustomType] = useState<boolean>(false);
    const [customCategoryName, setCustomCategoryName] = useState<string>('');
    const [customTypeName, setCustomTypeName] = useState<string>('');

    // Load master data when component mounts
    useEffect(() => {
        const loadMasterData = async (): Promise<void> => {
            try {
                setLoadingMasterData(true);

                const [categoriesResponse, typesResponse] = await Promise.all([
                    productsApi.getMasterCategories(),
                    productsApi.getProductTypes()
                ]);

                if (categoriesResponse.data?.success) {
                    setCategories(categoriesResponse.data.data);
                }

                if (typesResponse.data?.success) {
                    setProductTypes(typesResponse.data.data);
                }

            } catch (error) {
                setErrors(['Failed to load categories and product types']);
            } finally {
                setLoadingMasterData(false);
            }
        };

        if (show) {
            loadMasterData();
        }
    }, [show]);

    // Update product name when modal opens with initialProductName
    useEffect(() => {
        if (show && initialProductName) {
            setNewProduct(prev => ({
                ...prev,
                product_name: initialProductName
            }));
        }
    }, [show, initialProductName]);

    // Function to create new category
    const createNewCategory = async (): Promise<void> => {
        if (!customCategoryName.trim()) return;

        try {
            const response = await productsApi.createCategory(customCategoryName.trim());

            if (response.data?.success) {
                const newCategory = response.data.data;
                setCategories([...categories, newCategory]);
                setNewProduct({
                    ...newProduct,
                    category_id: newCategory.category_id.toString(),
                    category: newCategory.category_name
                });
                setCustomCategoryName('');
                setShowCustomCategory(false);
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string } } };
            if (err.response?.data?.detail?.includes('already exists')) {
                setErrors(['Category already exists']);
            } else {
                setErrors(['Failed to create category']);
            }
        }
    };

    // Function to create new product type
    const createNewType = async (): Promise<void> => {
        if (!customTypeName.trim()) return;

        try {
            const response = await productsApi.createProductType(
                customTypeName.trim(),
                'Unit'
            );

            if (response.data?.success) {
                const newType = response.data.data;
                setProductTypes([...productTypes, newType]);
                setNewProduct({
                    ...newProduct,
                    type_id: newType.type_id.toString(),
                    product_type: newType.type_name
                });
                setCustomTypeName('');
                setShowCustomType(false);
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string } } };
            if (err.response?.data?.detail?.includes('already exists')) {
                setErrors(['Product type already exists']);
            } else {
                setErrors(['Failed to create product type']);
            }
        }
    };

    const calculateExpiryDate = (mfgDate: string, monthsToAdd: number = 24): string => {
        if (!mfgDate || !mfgDate.includes('-')) return '';
        const [year, month] = mfgDate.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        date.setMonth(date.getMonth() + monthsToAdd);
        const expYear = date.getFullYear();
        const expMonth = String(date.getMonth() + 1).padStart(2, '0');
        return `${expYear}-${expMonth}`;
    };

    const handleMfgDateChange = (date: string): void => {
        setNewProduct({
            ...newProduct,
            manufacturing_date: date,
            expiry_date: calculateExpiryDate(date)
        });
    };

    // Handle schedule type change and auto-set related fields
    const handleScheduleTypeChange = (scheduleType: string): void => {
        const isNarcotic = scheduleType === 'X';
        const prescriptionRequired = ['H', 'H1', 'X'].includes(scheduleType);

        setNewProduct({
            ...newProduct,
            schedule_type: scheduleType,
            is_narcotic: isNarcotic,
            prescription_required: prescriptionRequired
        });
    };

    const saveProduct = async (): Promise<void> => {
        setSaving(true);
        setErrors([]);

        // Basic validation
        const validationErrors: string[] = [];
        if (!newProduct.product_name.trim()) validationErrors.push('Product name is required');
        if (!newProduct.manufacturer.trim()) validationErrors.push('Manufacturer is required');
        if (!newProduct.hsn_code.trim()) validationErrors.push('HSN code is required');
        if (!newProduct.mrp || parseFloat(newProduct.mrp) <= 0) validationErrors.push('Valid MRP is required');
        if (!newProduct.sale_price || parseFloat(newProduct.sale_price) <= 0) validationErrors.push('Valid sale price is required');
        if (!newProduct.cost_per_unit || parseFloat(newProduct.cost_per_unit) <= 0) validationErrors.push('Valid cost price is required');
        if (!newProduct.gst_percent && newProduct.gst_percent !== 0) validationErrors.push('GST percentage is required');
        if (!newProduct.quantity_available || parseInt(newProduct.quantity_available) <= 0) validationErrors.push('Valid quantity is required');
        if (!newProduct.expiry_date) validationErrors.push('Expiry date is required');

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setSaving(false);
            return;
        }

        try {
            // Convert MM/YY format to proper date format for backend
            const formatDateForAPI = (monthYearString: string): string | null => {
                if (!monthYearString) return null;
                return `${monthYearString}-01`;
            };

            // Create product data matching the schema
            const productData = {
                product_name: newProduct.product_name,
                product_code: newProduct.product_code || `PROD${Date.now().toString().slice(-6)}`,
                generic_name: newProduct.generic_name || newProduct.salt_composition,
                brand: newProduct.manufacturer,
                manufacturer: newProduct.manufacturer,
                category_id: newProduct.category_id ? parseInt(newProduct.category_id) : null,
                type_id: newProduct.type_id ? parseInt(newProduct.type_id) : null,
                product_class: 'medicine',
                composition: newProduct.salt_composition ? { active: newProduct.salt_composition } : {},
                hsn_code: newProduct.hsn_code,
                gst_percent: parseFloat(String(newProduct.gst_percent)),
                pack_type: packConfig.sale_unit || 'STRIP',
                pack_size: packConfig.units_per_pack || 1,
                pack_uom: packConfig.sale_unit || 'STRIP',
                base_uom: packConfig.base_unit || 'TABLET',
                units_per_pack: packConfig.units_per_pack || 1,
                packages_per_box: packConfig.use_boxes ? packConfig.packages_per_box : null,
                mrp: parseFloat(newProduct.mrp) || 0,
                sale_price: parseFloat(newProduct.sale_price) || 0,
                cost_per_unit: parseFloat(newProduct.cost_per_unit) || 0,
                quantity_available: parseInt(newProduct.quantity_available) || 0,
                batch_number: newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`,
                manufacturing_date: formatDateForAPI(newProduct.manufacturing_date),
                expiry_date: formatDateForAPI(newProduct.expiry_date),
                maintain_batch: true,
                maintain_expiry: true,
                is_active: true,
                is_saleable: true,
                is_purchasable: true
            };

            const apiData = {
                ...productData,
                units_per_pack: packConfig.units_per_pack ? parseInt(String(packConfig.units_per_pack)) : null,
                packages_per_box: packConfig.packages_per_box ? parseInt(String(packConfig.packages_per_box)) : null
            };

            const batchNumber = newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`;
            const tempId = `LOCAL_PROD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Save to IDB first (offline-first)
            const localRecord = {
                id: tempId,
                product_id: tempId,
                _localId: tempId,
                ...apiData,
                name: apiData.product_name,
                batches: [],
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_offline: true
            };

            const db = await offlineDB.init();
            await db.put('products', localRecord);

            // Add to sync queue
            await offlineDB.addToSyncQueue('product', tempId, 'create', localRecord);

            // Build the product object for the callback
            const createdProduct = {
                ...localRecord,
                product_id: tempId,
                product_name: apiData.product_name,
                batch_number: batchNumber,
                manufacturing_date: newProduct.manufacturing_date,
                expiry_date: newProduct.expiry_date,
                quantity_available: parseInt(newProduct.quantity_available) || 0,
                mrp_per_unit: parseFloat(newProduct.mrp) || 0,
                sale_price_per_unit: parseFloat(newProduct.sale_price) || 0,
                cost_per_unit: parseFloat(newProduct.cost_per_unit) || 0,
                mrp: parseFloat(newProduct.mrp) || 0,
                sale_price: parseFloat(newProduct.sale_price) || 0,
                gst_percent: parseFloat(String(newProduct.gst_percent)) || 0,
                hsn_code: newProduct.hsn_code || '3004',
                pack_type: packConfig.sale_unit || 'STRIP',
                pack_size: packConfig.units_per_pack || 1,
                sale_unit: packConfig.sale_unit,
                units_per_pack: packConfig.units_per_pack,
                packages_per_box: packConfig.use_boxes ? packConfig.packages_per_box : null
            };

            toast.created(`Product "${createdProduct.product_name}"${navigator.onLine ? '' : ' (offline)'}`, 4000);

            if (createdProduct.quantity_available) {
                toast.info(`Stock: ${createdProduct.quantity_available} units available`, 3000);
            }

            // Background sync if online
            if (navigator.onLine) {
                syncEngine.startSync().catch(() => {});
            }

            onProductCreated(createdProduct as unknown as Product);
            onClose();
        } catch (error: unknown) {
            let errorMessages: string[] = [];
            const err = error as {
                response?: {
                    data?: { detail?: unknown; message?: string };
                    status?: number;
                    statusText?: string
                };
                message?: string;
            };

            if (err.response?.data?.detail) {
                if (Array.isArray(err.response.data.detail)) {
                    errorMessages = err.response.data.detail.map((e: unknown) => {
                        if (typeof e === 'string') return e;
                        const errObj = e as { msg?: string; loc?: string[] };
                        if (errObj.msg) {
                            return errObj.loc ? `${errObj.loc.join('.')} - ${errObj.msg}` : errObj.msg;
                        }
                        return JSON.stringify(e);
                    });
                } else if (typeof err.response.data.detail === 'string') {
                    errorMessages = [err.response.data.detail];
                } else {
                    errorMessages = [JSON.stringify(err.response.data.detail)];
                }
            } else if (err.response?.data?.message) {
                errorMessages = [err.response.data.message];
            } else if (err.response?.status) {
                errorMessages = [`HTTP ${err.response.status}: ${err.response.statusText || 'Unknown error'}`];
            } else if (err.message) {
                errorMessages = [`Network Error: ${err.message}`];
            } else {
                errorMessages = ['Failed to save product - Unknown error'];
            }

            setErrors(errorMessages);
            toast.error('Failed to save product. Please check your data and try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <FullScreenModal
            isOpen={show}
            onClose={onClose}
            title="Add New Product"
            subtitle="Create a new product with batch - Use Tab/Enter to navigate"
            size="large"
            footer={
                <div className="flex justify-between items-center">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel (Esc)
                    </button>
                    <button
                        onClick={saveProduct}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {saving ? 'Saving...' : 'Save Product'}
                    </button>
                </div>
            }
        >
            {/* Icon Header */}
            <div className="flex items-center space-x-3 pb-4 border-b border-gray-200 mb-6" ref={productFormRef}>
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-sm text-gray-600">
                    Fill in product details below. Press <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Tab</kbd> or <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> to navigate fields.
                </div>
            </div>

            <div className="space-y-6">
                {/* Product Details */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Product Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Product Name *
                            </label>
                            <div className="relative">
                                <Pill className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={newProduct.product_name}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder="Enter product name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Product Code
                            </label>
                            <input
                                type="text"
                                value={newProduct.product_code}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, product_code: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                placeholder="Auto-generated if empty"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Manufacturer *
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={newProduct.manufacturer}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, manufacturer: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder="Enter manufacturer name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Category
                            </label>
                            {!showCustomCategory ? (
                                <div className="space-y-2">
                                    <select
                                        value={newProduct.category_id}
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                            if (e.target.value === 'add_new') {
                                                setShowCustomCategory(true);
                                                return;
                                            }
                                            const selectedCategory = categories.find(cat => cat.category_id === parseInt(e.target.value));
                                            setNewProduct({
                                                ...newProduct,
                                                category_id: e.target.value,
                                                category: selectedCategory ? selectedCategory.category_name : ''
                                            });
                                        }}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                        disabled={loadingMasterData}
                                    >
                                        <option value="">
                                            {loadingMasterData ? 'Loading categories...' : 'Select Category'}
                                        </option>
                                        {categories.map(category => (
                                            <option key={category.category_id} value={category.category_id}>
                                                {category.category_name}
                                            </option>
                                        ))}
                                        <option value="add_new" className="font-medium text-green-600">
                                            + Add New Category
                                        </option>
                                    </select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            value={customCategoryName}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomCategoryName(e.target.value)}
                                            placeholder="Enter new category name"
                                            className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                            onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && createNewCategory()}
                                        />
                                        <button
                                            onClick={createNewCategory}
                                            disabled={!customCategoryName.trim()}
                                            className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCustomCategory(false);
                                                setCustomCategoryName('');
                                            }}
                                            className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Product Type
                            </label>
                            {!showCustomType ? (
                                <div className="space-y-2">
                                    <select
                                        value={newProduct.type_id}
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                            if (e.target.value === 'add_new') {
                                                setShowCustomType(true);
                                                return;
                                            }
                                            const selectedType = productTypes.find(type => type.type_id === parseInt(e.target.value));
                                            setNewProduct({
                                                ...newProduct,
                                                type_id: e.target.value,
                                                product_type: selectedType ? selectedType.type_name : ''
                                            });
                                        }}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                        disabled={loadingMasterData}
                                    >
                                        <option value="">
                                            {loadingMasterData ? 'Loading types...' : 'Select Product Type'}
                                        </option>
                                        {productTypes.map(type => (
                                            <option key={type.type_id} value={type.type_id}>
                                                {type.type_name}
                                            </option>
                                        ))}
                                        <option value="add_new" className="font-medium text-green-600">
                                            + Add New Product Type
                                        </option>
                                    </select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            value={customTypeName}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomTypeName(e.target.value)}
                                            placeholder="Enter new product type"
                                            className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                            onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && createNewType()}
                                        />
                                        <button
                                            onClick={createNewType}
                                            disabled={!customTypeName.trim()}
                                            className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCustomType(false);
                                                setCustomTypeName('');
                                            }}
                                            className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Salt Composition
                            </label>
                            <input
                                type="text"
                                value={newProduct.salt_composition}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, salt_composition: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                placeholder="e.g., Paracetamol 500mg + Caffeine 65mg"
                            />
                        </div>
                    </div>

                    {/* Pack Configuration */}
                    <PackTypeSelector
                        productType={newProduct.category}
                        packData={{
                            ...packConfig,
                            pack_size: packConfig.pack_size ?? undefined,
                            pack_unit: packConfig.pack_unit ?? undefined
                        }}
                        onChange={(data: any) => setPackConfig(data)}
                        compact={true}
                    />
                </div>

                {/* Pharmaceutical Compliance */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                        <Shield className="w-4 h-4 text-red-500 mr-2" />
                        Pharmaceutical Compliance
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Drug Schedule Type *
                            </label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <select
                                    value={newProduct.schedule_type}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleScheduleTypeChange(e.target.value)}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                >
                                    <option value="">OTC (Over The Counter)</option>
                                    <option value="H">Schedule H (Prescription Drug)</option>
                                    <option value="H1">Schedule H1 (Prescription with Warning)</option>
                                    <option value="X">Schedule X (Narcotic/Psychotropic)</option>
                                    <option value="G">Schedule G (Hormonal Preparations)</option>
                                    <option value="J">Schedule J (Specific Diseases)</option>
                                </select>
                            </div>
                            {newProduct.schedule_type === 'X' && (
                                <p className="text-xs text-red-600 mt-1 flex items-center">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Requires narcotic register entry
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Storage Condition *
                            </label>
                            <div className="relative">
                                <Thermometer className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <select
                                    value={newProduct.storage_condition}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewProduct({ ...newProduct, storage_condition: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                >
                                    <option value="room_temp">Room Temperature (15-30°C)</option>
                                    <option value="cool">Cool & Dry (8-15°C)</option>
                                    <option value="refrigerated">Refrigerated (2-8°C)</option>
                                    <option value="frozen">Frozen (-20°C)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Generic Name
                            </label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={newProduct.generic_name}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, generic_name: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder="e.g., Paracetamol"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-3">
                            <div className="flex items-center space-x-6">
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={newProduct.prescription_required}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, prescription_required: e.target.checked })}
                                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                        disabled={['H', 'H1', 'X'].includes(newProduct.schedule_type)}
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Prescription Required</span>
                                </label>

                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={newProduct.is_narcotic}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, is_narcotic: e.target.checked })}
                                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                        disabled={newProduct.schedule_type === 'X'}
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Narcotic/Psychotropic Drug</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pricing Information */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Pricing & Tax</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                MRP *
                            </label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="number"
                                    value={newProduct.mrp}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, mrp: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Sale Price *
                            </label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="number"
                                    value={newProduct.sale_price}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, sale_price: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Cost Price *
                            </label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="number"
                                    value={newProduct.cost_per_unit}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, cost_per_unit: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                HSN Code *
                            </label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={newProduct.hsn_code}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder="Enter HSN code"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                GST % *
                            </label>
                            <div className="relative">
                                <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <select
                                    value={newProduct.gst_percent}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewProduct({ ...newProduct, gst_percent: e.target.value })}
                                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                >
                                    <option value="0">0%</option>
                                    <option value="5">5%</option>
                                    <option value="12">12%</option>
                                    <option value="18">18%</option>
                                    <option value="28">28%</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Batch Details */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Batch Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Batch Number
                            </label>
                            <input
                                type="text"
                                value={newProduct.batch_number}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, batch_number: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                placeholder="Auto-generated if empty"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Quantity Available *
                            </label>
                            <input
                                type="number"
                                value={newProduct.quantity_available}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewProduct({ ...newProduct, quantity_available: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="Enter quantity"
                                min="0"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Manufacturing Date
                            </label>
                            <MonthYearPicker
                                value={newProduct.manufacturing_date}
                                onChange={(date: string) => handleMfgDateChange(date)}
                                placeholder="MM/YYYY"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Expiry Date *
                            </label>
                            <MonthYearPicker
                                value={newProduct.expiry_date}
                                onChange={(date: string) => setNewProduct({ ...newProduct, expiry_date: date })}
                                placeholder="MM/YYYY"
                                minDate={newProduct.manufacturing_date ? new Date(newProduct.manufacturing_date + '-01') : null}
                            />
                        </div>
                    </div>
                </div>

                {/* Error Messages */}
                {errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="text-sm text-red-600 space-y-1">
                            {errors.map((error, index) => (
                                <div key={index} className="flex items-start">
                                    <span className="block w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                    <span>{error}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </FullScreenModal>
    );
};

export default ProductCreationModal;
