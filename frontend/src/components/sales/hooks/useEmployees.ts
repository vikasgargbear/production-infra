/**
 * useEmployees Hook
 * 
 * Shared hook for loading employees/sales representatives.
 * Can be used by invoice, challan, order, and any other module that needs employee selection.
 */

import { useState, useEffect, useCallback } from 'react';
import { employeesApi } from '../../../services/api';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { BaseEmployee } from '../types/salesSharedTypes';

export interface UseEmployeesReturn {
    employees: BaseEmployee[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

/**
 * Hook to load and manage employees list
 * Supports offline fallback to IndexedDB
 */
export function useEmployees(): UseEmployeesReturn {
    const [employees, setEmployees] = useState<BaseEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Try API first
            const response = await employeesApi.getAll({ is_active: true, limit: 100 }) as unknown as { success?: boolean; data?: BaseEmployee[] };

            if (response.success || response.data) {
                const data = response.data || [];
                // Deduplicate by employee_id
                const unique = Array.from(
                    new Map(data.map(e => [e.employee_id, e])).values()
                );
                setEmployees(unique);
                console.log(`[useEmployees] Loaded ${unique.length} employees from API`);
            }
        } catch (apiError) {
            console.warn('[useEmployees] API failed, trying offline fallback:', apiError);

            // Offline fallback
            try {
                const offlineData = await offlineDB.getAll('employees') as BaseEmployee[];
                if (offlineData && offlineData.length > 0) {
                    const unique = Array.from(
                        new Map(offlineData.map(e => [e.employee_id, e])).values()
                    );
                    setEmployees(unique);
                    console.log(`[useEmployees] Loaded ${unique.length} employees from offline cache`);
                } else {
                    setEmployees([]);
                }
            } catch (offlineError) {
                console.error('[useEmployees] Offline fallback failed:', offlineError);
                setError('Failed to load employees');
                setEmployees([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    return {
        employees,
        loading,
        error,
        reload: loadEmployees
    };
}

export default useEmployees;
