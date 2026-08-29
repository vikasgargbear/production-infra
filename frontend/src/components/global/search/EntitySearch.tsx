import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Search, Loader2, X, LucideIcon } from 'lucide-react';
import { ActionButton } from '../ui';
import { debounce } from '../../../utils/debounce';
import { isForbiddenApiError } from '../../../services/api/utils/apiError';
import CapabilityDeniedNotice from '../ui/CapabilityDeniedNotice';

/**
 * EntitySearch - Generic base component for all entity search (Customer, Supplier, Product, etc.)
 * 
 * @template T - The entity type (Customer, Supplier, Product, etc.)
 * 
 * This component handles:
 * - Search input with debounced API calls
 * - Loading state
 * - Keyboard navigation (Arrow, Enter, Escape)
 * - Click outside handling
 * - Auto-scroll to highlighted item
 * - Create new entity button
 * 
 * Usage:
 * <EntitySearch<Customer>
 *   entityType="customer"
 *   searchFn={(query) => localSearchService.searchCustomers(query)}
 *   getItemKey={(c) => c.customer_id}
 *   getItemLabel={(c) => c.customer_name}
 *   renderResult={(item, isHighlighted) => <div>...</div>}
 *   renderSelected={(item) => <div>...</div>}
 *   value={selectedCustomer}
 *   onChange={setSelectedCustomer}
 * />
 */

// ==================== TYPE DEFINITIONS ====================

export interface EntitySearchRef {
    focus: () => void;
    clear: () => void;
}

export interface EntitySearchProps<T> {
    // Core props
    value: T | null;
    onChange: (item: T | null) => void;
    onCreateNew?: (searchQuery?: string) => void;

    // Entity configuration
    entityType?: string;
    entityIcon?: LucideIcon;
    placeholder?: string;
    createButtonLabel?: string;

    // Search configuration
    searchFn: (query: string, signal: AbortSignal) => Promise<T[]>;
    minLength?: number;
    debounceMs?: number;
    accessDeniedMessage?: string;

    // Rendering - pass entity-specific renderers
    renderResult?: (item: T, isHighlighted: boolean, index: number) => React.ReactNode;
    renderSelected?: (item: T, onClear: () => void) => React.ReactNode;
    renderEmptyState?: (searchQuery: string, createFn?: (q?: string) => void) => React.ReactNode;
    getItemKey: (item: T) => string | number;
    getItemLabel: (item: T) => string;

    // Display options
    displayMode?: 'inline' | 'compact' | 'dropdown';
    showCreateButton?: boolean;
    required?: boolean;
    clearable?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    className?: string;
    tabIndex?: number;

    // Focus management
    nextFocusRef?: React.RefObject<{ focus: () => void } | HTMLElement | null>;
}

// ==================== COMPONENT ====================

function EntitySearchInner<T>(
    props: EntitySearchProps<T>,
    ref: React.ForwardedRef<EntitySearchRef>
) {
    const {
        // Core props
        value = null,
        onChange,
        onCreateNew,

        // Entity configuration
        entityType = 'entity',
        entityIcon: EntityIcon = Search,
        placeholder = 'Search...',
        createButtonLabel = 'Create New',

        // Search configuration
        searchFn,
        minLength = 2,
        debounceMs = 275,
        accessDeniedMessage = `You do not have permission to search ${entityType}s.`,

        // Rendering
        renderResult,
        renderSelected,
        renderEmptyState,
        getItemKey,
        getItemLabel,

        // Display options
        displayMode = 'inline',
        showCreateButton = true,
        required = false,
        clearable = true,
        disabled = false,
        autoFocus = false,
        className = '',
        tabIndex,
        nextFocusRef
    } = props;

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [accessDenied, setAccessDenied] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const resultRefs = useRef<(HTMLDivElement | null)[]>([]);
    const searchRequestRef = useRef(0);
    const searchAbortRef = useRef<AbortController | null>(null);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        focus: () => searchInputRef.current?.focus(),
        clear: () => {
            searchAbortRef.current?.abort();
            onChange(null);
            setSearchQuery('');
            setSearchResults([]);
        }
    }));

    // Use ref for searchFn so debounce doesn't need to be recreated when searchFn changes
    const searchFnRef = useRef(searchFn);
    searchFnRef.current = searchFn;

    // Debounced search - only recreate when debounceMs or minLength changes
    const performSearch = useMemo(
        () => debounce(async (query: string, requestId: number) => {
            if (!query || query.length < minLength) {
                return;
            }

            setLoading(true);
            searchAbortRef.current?.abort();
            const controller = new AbortController();
            searchAbortRef.current = controller;
            setAccessDenied(false);
            try {
                const results = await searchFnRef.current(query, controller.signal);
                if (requestId !== searchRequestRef.current) return;
                setSearchResults(results || []);
                setHighlightedIndex(results?.length > 0 ? 0 : -1);
            } catch (error) {
                if (controller.signal.aborted) return;
                if (requestId !== searchRequestRef.current) return;
                console.error(`[EntitySearch] ${entityType} search failed:`, error);
                setSearchResults([]);
                setHighlightedIndex(-1);
                setAccessDenied(isForbiddenApiError(error));
            } finally {
                if (requestId === searchRequestRef.current) setLoading(false);
                if (searchAbortRef.current === controller) searchAbortRef.current = null;
            }
        }, debounceMs),
        [minLength, debounceMs, entityType]
    );

    // Trigger search when query changes
    useEffect(() => {
        const requestId = ++searchRequestRef.current;
        if (searchQuery && searchQuery.length >= minLength) {
            setShowDropdown(true);
            performSearch(searchQuery, requestId);
        } else {
            setShowDropdown(Boolean(searchQuery));
            setSearchResults([]);
            setHighlightedIndex(-1);
            setLoading(false);
            setAccessDenied(false);
        }
        return () => {
            performSearch.cancel();
            searchAbortRef.current?.abort();
            if (searchRequestRef.current === requestId) {
                searchRequestRef.current += 1;
            }
        };
    }, [searchQuery, minLength, performSearch]);

    // Auto-scroll to highlighted item
    useEffect(() => {
        const highlightedResult = resultRefs.current[highlightedIndex];
        if (highlightedIndex >= 0 && typeof highlightedResult?.scrollIntoView === 'function') {
            highlightedResult.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [highlightedIndex]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle item selection
    const handleSelect = (item: T) => {
        onChange(item);
        setSearchQuery('');
        setShowDropdown(false);
        setSearchResults([]);
        setHighlightedIndex(-1);
        // Focus next element after selection (e.g., ProductSearch after CustomerSearch)
        if (nextFocusRef?.current) {
            setTimeout(() => {
                nextFocusRef.current?.focus();
            }, 50);
        }
    };

    // Handle clear
    const handleClear = () => {
        onChange(null);
        setSearchQuery('');
        searchInputRef.current?.focus();
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < searchResults.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : searchResults.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                    handleSelect(searchResults[highlightedIndex]);
                } else if (!accessDenied && searchResults.length === 0 && searchQuery.length >= minLength && onCreateNew) {
                    onCreateNew(searchQuery);
                }
                break;
            case 'Escape':
                e.stopPropagation();
                setShowDropdown(false);
                setHighlightedIndex(-1);
                setSearchQuery('');
                break;
            case 'Tab':
                // If dropdown is open with a highlighted item, select it before tabbing
                if (showDropdown && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                    e.preventDefault();
                    handleSelect(searchResults[highlightedIndex]);
                } else {
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                }
                break;
        }
    };

    // Default result renderer
    const defaultRenderResult = (item: T, isHighlighted: boolean, index: number) => (
        <div
            ref={(el) => { resultRefs.current[index] = el; }}
            onClick={() => handleSelect(item)}
            className={`px-4 py-3 cursor-pointer border-b border-gray-100 ${isHighlighted ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                }`}
        >
            <div className="font-medium text-gray-900">{getItemLabel(item)}</div>
        </div>
    );

    // Default selected renderer
    const defaultRenderSelected = (item: T, onClear: () => void) => (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
                <EntityIcon className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-900">{getItemLabel(item)}</span>
            </div>
            {clearable && (
                <button
                    type="button"
                    onClick={onClear}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title={`Remove ${entityType}`}
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );

    // Default empty state renderer
    const defaultRenderEmptyState = (query: string, createFn?: (q?: string) => void) => (
        <div className="p-4 text-center">
            <EntityIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No {entityType}s found for "{query}"</p>
            {showCreateButton && createFn && (
                <ActionButton
                    onClick={() => {
                        setShowDropdown(false);
                        createFn(query);
                    }}
                    variant="primary"
                    size="md"
                    className="mt-3 w-full"
                >
                    {`${createButtonLabel} "${query}"`}
                </ActionButton>
            )}
        </div>
    );

    // Use provided renderers or defaults
    const renderResultFn = renderResult || defaultRenderResult;
    const renderSelectedFn = renderSelected || defaultRenderSelected;
    const renderEmptyStateFn = renderEmptyState || defaultRenderEmptyState;

    // Render dropdown content
    const renderDropdownContent = () => (
        <div role="listbox" className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {accessDenied ? (
                <div className="p-3">
                    <CapabilityDeniedNotice>{accessDeniedMessage}</CapabilityDeniedNotice>
                </div>
            ) : loading ? (
                <div className="p-4 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Searching...</p>
                </div>
            ) : searchResults.length > 0 ? (
                <>
                    {searchResults.map((item, index) => (
                        <div
                            key={getItemKey(item)}
                            data-testid={`entity-search-option-${getItemKey(item)}`}
                            onClick={() => handleSelect(item)}
                            ref={(el) => { resultRefs.current[index] = el; }}
                            role="option"
                            aria-selected={index === highlightedIndex}
                        >
                            {renderResultFn(item, index === highlightedIndex, index)}
                        </div>
                    ))}
                    {showCreateButton && onCreateNew && searchQuery.length >= minLength && (
                        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                            <ActionButton
                                onClick={() => {
                                    setShowDropdown(false);
                                    onCreateNew(searchQuery);
                                }}
                                variant="ghost"
                                size="sm"
                                className="w-full"
                            >
                                {`${createButtonLabel} "${searchQuery}"`}
                            </ActionButton>
                        </div>
                    )}
                </>
            ) : searchQuery.length >= minLength ? (
                renderEmptyStateFn(searchQuery, onCreateNew)
            ) : null}
        </div>
    );

    // Search input JSX - NOT a component to prevent remounting on every render
    const searchInputJSX = (
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                ref={searchInputRef}
                data-no-enter-tab
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                autoFocus={autoFocus}
                tabIndex={tabIndex}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
        </div>
    );

    // Inline mode (full width card with header)
    if (displayMode === 'inline') {
        return (
            <div className={`relative ${className}`} ref={dropdownRef}>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center">
                                <EntityIcon className="w-4 h-4 mr-2" />
                                {entityType.charAt(0).toUpperCase() + entityType.slice(1)}
                                {required && <span className="text-red-500 ml-1">*</span>}
                            </h4>
                            {showCreateButton && onCreateNew && !value && (
                                <ActionButton
                                    onClick={() => onCreateNew()}
                                    variant="secondary"
                                    size="sm"
                                >
                                    {createButtonLabel}
                                </ActionButton>
                            )}
                        </div>

                        {!value ? searchInputJSX : renderSelectedFn(value, handleClear)}
                    </div>
                </div>

                {showDropdown && searchQuery && !value && renderDropdownContent()}
            </div>
        );
    }

    // Compact mode (smaller, no card wrapper)
    if (displayMode === 'compact') {
        return (
            <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
                {!value ? searchInputJSX : renderSelectedFn(value, handleClear)}
                {showDropdown && searchQuery && renderDropdownContent()}
            </div>
        );
    }

    // Dropdown mode (default)
    return (
        <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
            {!value ? searchInputJSX : renderSelectedFn(value, handleClear)}
            {showDropdown && searchQuery && renderDropdownContent()}
        </div>
    );
}

// Create the generic forwardRef component
export const EntitySearch = forwardRef(EntitySearchInner) as <T>(
    props: EntitySearchProps<T> & { ref?: React.ForwardedRef<EntitySearchRef> }
) => React.ReactElement;

// For backwards compatibility
export default EntitySearch;
