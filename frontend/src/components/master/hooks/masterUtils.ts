/**
 * Master Module Shared Utilities
 *
 * Common helpers for data extraction and filtering,
 * used by useEntityMaster and useSettingsEntity.
 */

/**
 * Extract array data from various API response formats
 */
export function extractDataArray<T>(
    response: { data?: T[] | { data?: T[] } | Record<string, any> } | null | undefined,
    entityName: string
): T[] {
    const data = response?.data;
    if (!data) return [];

    if (Array.isArray(data)) return data;

    const plural = entityName + 's';
    const result = (data as Record<string, unknown>)[plural] ||
        (data as { data?: T[] }).data ||
        data;

    return Array.isArray(result) ? result : [];
}

/**
 * Filter entities by search term across multiple fields
 */
export function filterBySearch<T>(
    entities: T[],
    searchTerm: string,
    fields: (keyof T)[]
): T[] {
    if (!searchTerm) return entities;
    const term = searchTerm.toLowerCase();

    return entities.filter(entity => {
        if (!entity) return false;
        return fields.some(field => {
            const value = entity[field];
            return value != null && String(value).toLowerCase().includes(term);
        });
    });
}

/**
 * Filter entities by type/category field
 */
export function filterByType<T>(
    entities: T[],
    filterField: keyof T | undefined,
    filterValue: string
): T[] {
    if (filterValue === 'all' || !filterField) return entities;
    return entities.filter(e => e && e[filterField] === filterValue);
}
