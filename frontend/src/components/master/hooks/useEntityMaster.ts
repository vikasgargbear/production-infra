/**
 * useEntityMaster Hook
 * 
 * Generic CRUD hook for master entity management.
 * Eliminates 90% code duplication across CustomerMaster, SupplierMaster, ProductMaster.
 * 
 * @example
 * ```ts
 * const {
 *   entities, filteredEntities, isLoading, error,
 *   searchTerm, setSearchTerm,
 *   filterValue, setFilterValue,
 *   showAddModal, setShowAddModal,
 *   editingEntity, selectedIds,
 *   handleEdit, handleDelete, handleSaved, handleBulkDelete
 * } = useEntityMaster<Customer>({
 *   entityName: 'customer',
 *   idField: 'customer_id',
 *   nameField: 'customer_name',
 *   api: { getAll: customersApi.getAll, update: customersApi.update },
 *   searchFields: ['customer_name', 'primary_phone', 'gst_number'],
 *   filterField: 'customer_type',
 *   softDelete: true
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../global/ui/feedback/Toast';
import { extractDataArray, filterBySearch, filterByType } from './masterUtils';

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse<T = unknown> {
    data?: T | { data?: T } | { [key: string]: T[] };
    success?: boolean;
    message?: string;
}

export interface UseEntityMasterConfig<T> {
    /** Entity name for API response parsing (e.g., 'customer' → looks for 'customers') */
    entityName: string;

    /** Primary key field (e.g., 'customer_id') */
    idField: keyof T;

    /** Display name field (e.g., 'customer_name') */
    nameField: keyof T;

    /** Type field for filtering (e.g., 'customer_type') */
    filterField?: keyof T;

    /** API functions */
    api: {
        getAll: (search?: string) => Promise<ApiResponse<T[]>>;
        update?: (id: string | number, data: Partial<T>) => Promise<ApiResponse<T>>;
        delete?: (id: string | number) => Promise<ApiResponse<void>>;
    };

    /** Fields to search in */
    searchFields: (keyof T)[];

    /** Use soft delete (is_active toggle) instead of hard delete. Default: true */
    softDelete?: boolean;

    /** Custom data extractor if API response is non-standard */
    extractData?: (response: ApiResponse<T[]>) => T[];

    /** Search the canonical API's full data set instead of one loaded page. */
    serverSearch?: boolean;
}

export interface UseEntityMasterReturn<T> {
    // Data
    entities: T[];
    filteredEntities: T[];
    isLoading: boolean;
    error: string | null;

    // Search & Filter
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterValue: string;
    setFilterValue: (value: string) => void;
    searchInputRef: React.RefObject<HTMLInputElement>;

    // Modal state
    showAddModal: boolean;
    setShowAddModal: (show: boolean) => void;
    editingEntity: T | null;
    setEditingEntity: (entity: T | null) => void;

    // Selection
    selectedIds: string[];
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;

    // Actions
    loadEntities: () => Promise<void>;
    handleEdit: (entity: T) => void;
    handleDelete: (id: string | number) => Promise<void>;
    handleSaved: () => void;
    handleBulkDelete: () => Promise<void>;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useEntityMaster<T extends { is_active?: boolean }>(
    config: UseEntityMasterConfig<T>
): UseEntityMasterReturn<T> {
    const {
        entityName,
        idField,
        api: {
            getAll,
        },
        searchFields,
        filterField,
        extractData,
        serverSearch = false,
    } = config;

    const toast = useToast();

    // Data state
    const [entities, setEntities] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Search & Filter state
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [filterValue, setFilterValue] = useState<string>('all');

    // Modal state
    const [showAddModal, setShowAddModal] = useState<boolean>(false);
    const [editingEntity, setEditingEntity] = useState<T | null>(null);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Search input ref for keyboard focus
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Capitalize first letter for messages
    const entityLabel = entityName.charAt(0).toUpperCase() + entityName.slice(1);

    // Keyboard shortcuts: Ctrl+N = Add New, / = Focus Search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing in an input/textarea/select
            const tag = (e.target as HTMLElement)?.tagName;
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            // Ctrl/Cmd + N → open Add modal
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                setShowAddModal(true);
                return;
            }

            // "/" → focus search (only if not already in an input)
            if (e.key === '/' && !isInput) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ========================================
    // Load Data
    // ========================================

    const loadEntities = useCallback(async (): Promise<void> => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await getAll(serverSearch ? searchTerm.trim() : undefined);

            const data = extractData
                ? extractData(response)
                : extractDataArray(response, entityName);

            setEntities(data);
        } catch (err) {
            setError(`Failed to load ${entityName}s. Please try again.`);
            setEntities([]);
        } finally {
            setIsLoading(false);
        }
    }, [getAll, entityName, extractData, searchTerm, serverSearch]);

    // Load on mount
    useEffect(() => {
        const delay = serverSearch && searchTerm.trim() ? 180 : 0;
        const timer = window.setTimeout(() => void loadEntities(), delay);
        return () => window.clearTimeout(timer);
    }, [loadEntities, searchTerm, serverSearch]);

    // ========================================
    // Filtered Data
    // ========================================

    const filteredEntities = filterByType(
        serverSearch ? entities : filterBySearch(entities, searchTerm, searchFields),
        filterField,
        filterValue
    );

    // ========================================
    // Handlers
    // ========================================

    const handleEdit = useCallback((entity: T): void => {
        setEditingEntity(entity);
    }, []);

    const handleDelete = useCallback(async (id: string | number): Promise<void> => {
        const entity = entities.find(e => e[idField] === id);
        if (!entity) return;
        toast.warning(`${entityLabel} status and deletion are unavailable until reviewed canonical commands exist.`);
    }, [entities, idField, entityLabel, toast]);

    const handleSaved = useCallback((): void => {
        setEditingEntity(null);
        setShowAddModal(false);
        loadEntities();
        toast.created(entityLabel);
    }, [loadEntities, entityLabel, toast]);

    const handleBulkDelete = useCallback(async (): Promise<void> => {
        if (selectedIds.length === 0) return;
        toast.warning(`Bulk ${entityName} status changes are unavailable until a reviewed canonical command exists.`);
    }, [selectedIds.length, entityName, toast]);

    // ========================================
    // Return
    // ========================================

    return {
        // Data
        entities,
        filteredEntities,
        isLoading,
        error,

        // Search & Filter
        searchTerm,
        setSearchTerm,
        filterValue,
        setFilterValue,
        searchInputRef,

        // Modal state
        showAddModal,
        setShowAddModal,
        editingEntity,
        setEditingEntity,

        // Selection
        selectedIds,
        setSelectedIds,

        // Actions
        loadEntities,
        handleEdit,
        handleDelete,
        handleSaved,
        handleBulkDelete,
    };
}

export default useEntityMaster;
