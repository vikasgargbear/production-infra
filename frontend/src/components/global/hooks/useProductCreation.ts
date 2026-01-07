/**
 * useProductCreation Hook
 * 
 * Extracts state management and form logic from ProductCreationModal.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { productsApi, metadataApi } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface ProductFormData {
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
    product_type_id: string;
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
}

export interface PackConfig {
    sale_unit: string;
    units_per_pack: number;
    packages_per_box: number;
    use_boxes: boolean;
    pack_type_input: string;
    pack_size: number | null;
    pack_unit: string | null;
    base_unit?: string;
}

export interface Category {
    category_id: number;
    category_name: string;
}

export interface ProductType {
    type_id: number;
    type_name: string;
    default_base_uom?: string;
}

// ============================================
// Default Values
// ============================================

const getInitialFormData = (initialProductName = ''): ProductFormData => ({
    product_name: initialProductName,
    product_code: '',
    manufacturer: '',
    hsn_code: '',
    gst_percent: 12,
    mrp: '',
    sale_price: '',
    category: '',
    category_id: '',
    product_type: '',
    product_type_id: '',
    batch_number: '',
    manufacturing_date: '',
    expiry_date: '',
    quantity_available: '',
    cost_per_unit: '',
    salt_composition: '',
    schedule_type: 'None',
    is_narcotic: false,
    prescription_required: false,
    storage_condition: 'Room Temperature',
    generic_name: '',
    composition: ''
});

const getInitialPackConfig = (): PackConfig => ({
    sale_unit: 'Strip',
    units_per_pack: 10,
    packages_per_box: 0,
    use_boxes: false,
    pack_type_input: '',
    pack_size: null,
    pack_unit: null,
    base_unit: 'Tab'
});

// ============================================
// Hook Implementation
// ============================================

export function useProductCreation(
    initialProductName: string = '',
    onProductCreated: (product: any) => void,
    onClose: () => void
) {
    const [formData, setFormData] = useState<ProductFormData>(getInitialFormData(initialProductName));
    const [packConfig, setPackConfig] = useState<PackConfig>(getInitialPackConfig());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Metadata
    const [categories, setCategories] = useState<Category[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [manufacturers, setManufacturers] = useState<string[]>([]);

    // Modal states for creating new category/type
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [showNewType, setShowNewType] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newTypeName, setNewTypeName] = useState('');

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        setFormData(prev => ({ ...prev, product_name: initialProductName }));
    }, [initialProductName]);

    useEffect(() => {
        loadMasterData();
    }, []);

    // ============================================
    // API Actions
    // ============================================

    const loadMasterData = useCallback(async () => {
        try {
            const [categoriesRes, typesRes, manufacturersRes] = await Promise.all([
                metadataApi.getProductCategories().catch(() => ({ data: [] })),
                metadataApi.getProductTypes().catch(() => ({ data: [] })),
                metadataApi.getManufacturers().catch(() => ({ data: [] }))
            ]);

            if (categoriesRes.data) {
                setCategories(categoriesRes.data);
            }
            if (typesRes.data) {
                setProductTypes(typesRes.data);
            }
            if (manufacturersRes.data) {
                setManufacturers(manufacturersRes.data.map((m: any) => m.manufacturer_name || m.name || m));
            }
        } catch (error) {
            console.error('Error loading master data:', error);
        }
    }, []);

    const createNewCategory = useCallback(async () => {
        if (!newCategoryName.trim()) return;

        try {
            const response = await metadataApi.createProductCategory({ category_name: newCategoryName });
            if (response.data?.success || response.data) {
                const newCategory = response.data;
                setCategories(prev => [...prev, newCategory]);
                setFormData(prev => ({
                    ...prev,
                    category: newCategory.category_name,
                    category_id: newCategory.category_id.toString()
                }));
                setShowNewCategory(false);
                setNewCategoryName('');
            }
        } catch (error) {
            console.error('Error creating category:', error);
        }
    }, [newCategoryName]);

    const createNewType = useCallback(async () => {
        if (!newTypeName.trim()) return;

        try {
            const response = await metadataApi.createProductType({ type_name: newTypeName });
            if (response.data?.success || response.data) {
                const newType = response.data;
                setProductTypes(prev => [...prev, newType]);
                setFormData(prev => ({
                    ...prev,
                    product_type: newType.type_name,
                    product_type_id: newType.type_id.toString()
                }));
                setShowNewType(false);
                setNewTypeName('');
            }
        } catch (error) {
            console.error('Error creating type:', error);
        }
    }, [newTypeName]);

    // ============================================
    // Form Actions
    // ============================================

    const handleInputChange = useCallback((field: keyof ProductFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    const handlePackConfigChange = useCallback((field: keyof PackConfig, value: any) => {
        setPackConfig(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleScheduleTypeChange = useCallback((scheduleType: string) => {
        setFormData(prev => ({
            ...prev,
            schedule_type: scheduleType,
            is_narcotic: ['H', 'H1', 'X'].includes(scheduleType),
            prescription_required: scheduleType !== 'None' && scheduleType !== 'OTC'
        }));
    }, []);

    const handleMfgDateChange = useCallback((mfgDate: string) => {
        setFormData(prev => ({ ...prev, manufacturing_date: mfgDate }));

        // Auto-calculate expiry date (24 months from mfg)
        if (mfgDate) {
            const date = new Date(mfgDate);
            date.setMonth(date.getMonth() + 24);
            setFormData(prev => ({
                ...prev,
                expiry_date: date.toISOString().split('T')[0]
            }));
        }
    }, []);

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
        setPackConfig(getInitialPackConfig());
        setError(null);
    }, []);

    // ============================================
    // Submit
    // ============================================

    const saveProduct = useCallback(async () => {
        if (!formData.product_name.trim()) {
            setError('Product name is required');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            const payload = {
                product_name: formData.product_name,
                product_code: formData.product_code || undefined,
                manufacturer: formData.manufacturer || undefined,
                hsn_code: formData.hsn_code || undefined,
                gst_percent: parseFloat(formData.gst_percent as string) || 12,
                mrp: parseFloat(formData.mrp) || 0,
                sale_price: parseFloat(formData.sale_price) || parseFloat(formData.mrp) || 0,
                cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
                category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
                product_type_id: formData.product_type_id ? parseInt(formData.product_type_id) : undefined,
                generic_name: formData.generic_name || undefined,
                composition: formData.composition || formData.salt_composition || undefined,
                schedule_type: formData.schedule_type || 'None',
                is_narcotic: formData.is_narcotic,
                prescription_required: formData.prescription_required,
                storage_condition: formData.storage_condition || 'Room Temperature',
                pack_size: packConfig.pack_size || packConfig.units_per_pack,
                pack_unit: packConfig.pack_unit || packConfig.sale_unit,
                base_unit: packConfig.base_unit || 'Tab'
            };

            const response = await productsApi.create(payload);

            if (response.data?.success || response.data) {
                const newProduct = response.data;
                onProductCreated(newProduct);
                onClose();
                return true;
            } else {
                setError(response.data?.error?.message || 'Failed to create product');
                return false;
            }
        } catch (error: any) {
            setError(error.message || 'Failed to create product');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, packConfig, onProductCreated, onClose]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Form State
        formData,
        packConfig,
        loading,
        error,

        // Metadata
        categories,
        productTypes,
        manufacturers,

        // New Category/Type Modal
        showNewCategory,
        setShowNewCategory,
        showNewType,
        setShowNewType,
        newCategoryName,
        setNewCategoryName,
        newTypeName,
        setNewTypeName,
        createNewCategory,
        createNewType,

        // Actions
        handleInputChange,
        handlePackConfigChange,
        handleScheduleTypeChange,
        handleMfgDateChange,
        resetForm,
        saveProduct
    };
}

export default useProductCreation;
