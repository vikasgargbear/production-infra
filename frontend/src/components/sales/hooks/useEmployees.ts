/**
 * useEmployees Hook
 * 
 * Shared hook for loading employees/sales representatives.
 * Can be used by invoice, challan, order, and any other module that needs employee selection.
 */

import { useState, useEffect, useCallback } from 'react';
import { employeesApi } from '../../../services/api';
import { BaseEmployee } from '../types/salesSharedTypes';

export interface UseEmployeesReturn {
    employees: BaseEmployee[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

/**
 * Hook to load and manage employees list
 * API-only: failures are exposed instead of substituted with stale local data.
 */
export function useEmployees(): UseEmployeesReturn {
    const [employees, setEmployees] = useState<BaseEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
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
            console.error('[useEmployees] API request failed:', apiError);
            setError('Failed to load employees from the API');
            setEmployees([]);
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
