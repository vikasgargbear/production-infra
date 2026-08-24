/**
 * useSettingsEntity Hook
 * 
 * Generic CRUD hook for settings-based entities (Units, Warehouses, Tax rates).
 * These entities use settingsApi and have inline form modals.
 * 
 * @example
 * ```ts
 * const {
 *   entities, filteredEntities, isLoading, error,
 *   searchTerm, setSearchTerm, filterValue, setFilterValue,
 *   showModal, editingEntity, formData,
 *   handleInputChange, handleEdit, handleSubmit, handleDelete, handleCloseModal
 * } = useSettingsEntity<Unit, UnitFormData>({
 *   entityName: 'unit',
 *   idField: 'id',
 *   api: settingsApi.units,
 *   searchFields: ['name', 'code', 'symbol'],
 *   filterField: 'category',
 *   initialFormData: { code: '', name: '', ... }
 * });
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { extractDataArray, filterBySearch, filterByType } from './masterUtils';

// ============================================================================
// Types
// ============================================================================

export interface SettingsApiModule<T> {
    getAll: () => Promise<{ data?: T[] | { data?: T[] } | { [key: string]: T[] } }>;
    create: (data: Partial<T>) => Promise<{ success?: boolean; data?: T }>;
    update: (id: string | number, data: Partial<T>) => Promise<{ success?: boolean; data?: T }>;
    delete: (id: string | number) => Promise<{ success?: boolean }>;
}

export interface UseSettingsEntityConfig<T, F> {
    /** Entity name for messages */
    entityName: string;

    /** Primary key field */
    idField: keyof T;

    /** API module from settingsApi */
    api: SettingsApiModule<T>;

    /** Fields to search in */
    searchFields: (keyof T)[];

    /** Field for type/category filter */
    filterField?: keyof T;

    /** Initial form data for add/edit */
    initialFormData: F;

    /** Transform entity to form data for editing */
    entityToFormData: (entity: T) => F;

    /** Transform form data to entity for save */
    formDataToEntity: (formData: F, isEditing: boolean) => Partial<T>;

    /** Conditional: Only load when open */
    loadOnOpen?: boolean;
}

export interface UseSettingsEntityReturn<T, F> {
    // Data
    entities: T[];
    filteredEntities: T[];
    isLoading: boolean;
    error: string | null;
    setError: (error: string | null) => void;
    successMessage: string;
    refreshing: boolean;

    // Search & Filter
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterValue: string;
    setFilterValue: (value: string) => void;

    // Modal & Form
    showModal: boolean;
    setShowModal: (show: boolean) => void;
    editingEntity: T | null;
    formData: F;

    // Actions
    loadEntities: () => Promise<void>;
    handleRefresh: () => Promise<void>;
    handleInputChange: (field: keyof F, value: unknown) => void;
    handleEdit: (entity: T) => void;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    handleDelete: (id: string | number) => Promise<void>;
    handleToggleActive: (id: string | number) => Promise<void>;
    handleCloseModal: () => void;
    clearError: () => void;
    clearSuccess: () => void;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useSettingsEntity<T extends { isActive?: boolean; is_active?: boolean }, F>(
    config: UseSettingsEntityConfig<T, F>
): UseSettingsEntityReturn<T, F> {
    const {
        entityName,
        idField,
        api,
        searchFields,
        filterField,
        initialFormData,
        entityToFormData,
        formDataToEntity,
        loadOnOpen = true,
    } = config;

    // Data state
    const [entities, setEntities] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [refreshing, setRefreshing] = useState<boolean>(false);

    // Search & Filter state
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [filterValue, setFilterValue] = useState<string>('all');

    // Modal & Form state
    const [showModal, setShowModal] = useState<boolean>(false);
    const [editingEntity, setEditingEntity] = useState<T | null>(null);
    const [formData, setFormData] = useState<F>(initialFormData);

    const entityLabel = entityName.charAt(0).toUpperCase() + entityName.slice(1);

    // ========================================
    // Load Data
    // ========================================

    const loadEntities = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.getAll();
            const data = extractDataArray(response, entityName);
            setEntities(data);
        } catch (err) {
            setError(`Failed to load ${entityName}s. Please try again.`);
            setEntities([]);
        } finally {
            setIsLoading(false);
        }
    }, [api, entityName]);

    // Load on mount (or conditionally)
    useEffect(() => {
        if (!loadOnOpen) {
            loadEntities();
        }
    }, [loadEntities, loadOnOpen]);

    const handleRefresh = useCallback(async (): Promise<void> => {
        setRefreshing(true);
        setError(null);
        try {
            await loadEntities();
        } catch (err) {
            setError('Failed to refresh data');
        } finally {
            setRefreshing(false);
        }
    }, [loadEntities]);

    // ========================================
    // Filtered Data
    // ========================================

    const filteredEntities = filterByType(
        filterBySearch(entities, searchTerm, searchFields),
        filterField,
        filterValue
    );

    // ========================================
    // Form Handlers
    // ========================================

    const handleInputChange = useCallback((field: keyof F, value: unknown): void => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    }, []);

    const handleEdit = useCallback((entity: T): void => {
        setEditingEntity(entity);
        setFormData(entityToFormData(entity));
        setShowModal(true);
    }, [entityToFormData]);

    const handleCloseModal = useCallback((): void => {
        setShowModal(false);
        setEditingEntity(null);
        setFormData(initialFormData);
    }, [initialFormData]);

    const handleSubmit = useCallback(async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        setError(null);

        try {
            const entityData = formDataToEntity(formData, !!editingEntity);

            if (editingEntity) {
                const id = editingEntity[idField] as string | number;
                const response = await api.update(id, entityData);
                if (response.success || response.data) {
                    setSuccessMessage(`${entityLabel} updated successfully!`);
                    await loadEntities();
                }
            } else {
                const response = await api.create(entityData);
                if (response.success || response.data) {
                    setSuccessMessage(`${entityLabel} added successfully!`);
                    await loadEntities();
                }
            }

            setTimeout(() => setSuccessMessage(''), 3000);
            handleCloseModal();
        } catch (err) {
            setError(`Failed to save ${entityName}. Please try again.`);
        }
    }, [formData, editingEntity, idField, api, entityLabel, entityName, formDataToEntity, loadEntities, handleCloseModal]);

    const handleDelete = useCallback(async (_id: string | number): Promise<void> => {
        setError(`Deleting ${entityName}s is unavailable until a reviewed canonical command exists.`);
    }, [entityName]);

    const handleToggleActive = useCallback(async (_id: string | number): Promise<void> => {
        setError(`Changing ${entityName} status is unavailable until a reviewed canonical command exists.`);
    }, [entityName]);

    const clearError = useCallback(() => setError(null), []);
    const clearSuccess = useCallback(() => setSuccessMessage(''), []);

    // ========================================
    // Return
    // ========================================

    return {
        // Data
        entities,
        filteredEntities,
        isLoading,
        error,
        setError,
        successMessage,
        refreshing,

        // Search & Filter
        searchTerm,
        setSearchTerm,
        filterValue,
        setFilterValue,

        // Modal & Form
        showModal,
        setShowModal,
        editingEntity,
        formData,

        // Actions
        loadEntities,
        handleRefresh,
        handleInputChange,
        handleEdit,
        handleSubmit,
        handleDelete,
        handleToggleActive,
        handleCloseModal,
        clearError,
        clearSuccess,
    };
}

export default useSettingsEntity;
