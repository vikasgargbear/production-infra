import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Loader2, Plus } from 'lucide-react';
import { ActionButton } from '../ui';
import { debounce } from '../../../utils/debounce';

/**
 * EntitySearch - Base component for all entity search (Customer, Supplier, Product, etc.)
 * 
 * This component handles:
 * - Search input with debounced API calls
 * - Loading state
 * - Keyboard navigation (Arrow, Enter, Escape)
 * - Click outside handling
 * - Auto-scroll to highlighted item
 * - Create new entity button
 * 
 * Entity-specific rendering is handled by renderResult and renderSelected props.
 * 
 * Usage:
 * <EntitySearch
 *   entityType="customer"
 *   searchFn={(query) => localFirstService.searchCustomers(query)}
 *   renderResult={(item, isHighlighted) => <div>...</div>}
 *   renderSelected={(item) => <div>...</div>}
 *   onSelect={handleSelect}
 *   onCreate={handleCreate}
 * />
 */
const EntitySearch = forwardRef(({
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
    debounceMs = 100,

    // Rendering - pass entity-specific renderers
    renderResult,          // (item, isHighlighted, index) => ReactNode
    renderSelected,        // (item) => ReactNode
    renderEmptyState,      // (searchQuery, createFn) => ReactNode
    getItemKey,            // (item) => string|number
    getItemLabel,          // (item) => string (for simple cases)

    // Display options
    displayMode = 'inline', // 'inline' | 'compact' | 'dropdown'
    showCreateButton = true,
    required = false,
    clearable = true,
    disabled = false,
    autoFocus = false,
    className = ''
}, ref) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const searchInputRef = useRef(null);
    const dropdownRef = useRef(null);
    const resultRefs = useRef([]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        focus: () => {
            if (searchInputRef.current) {
                searchInputRef.current.focus();
            }
        },
        clear: () => {
            onChange?.(null);
            setSearchQuery('');
            setSearchResults([]);
        }
    }));

    // Debounced search
    const performSearch = useCallback(
        debounce(async (query) => {
            if (!query || query.length < minLength) {
                setSearchResults([]);
                setHighlightedIndex(-1);
                return;
            }

            setLoading(true);
            try {
                const results = await searchFn(query);
                setSearchResults(results || []);

                // Auto-highlight first result
                if (results && results.length > 0) {
                    setHighlightedIndex(0);
                } else {
                    setHighlightedIndex(-1);
                }
            } catch (error) {
                console.error(`[EntitySearch] ${entityType} search failed:`, error);
                setSearchResults([]);
                setHighlightedIndex(-1);
            } finally {
                setLoading(false);
            }
        }, debounceMs),
        [searchFn, minLength, debounceMs, entityType]
    );

    // Trigger search when query changes
    useEffect(() => {
        if (searchQuery) {
            setShowDropdown(true);
            performSearch(searchQuery);
        } else {
            setShowDropdown(false);
            setSearchResults([]);
        }
    }, [searchQuery, performSearch]);

    // Auto-scroll to highlighted item
    useEffect(() => {
        if (highlightedIndex >= 0 && resultRefs.current[highlightedIndex]) {
            resultRefs.current[highlightedIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [highlightedIndex]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle item selection
    const handleSelect = (item) => {
        onChange?.(item);
        setSearchQuery('');
        setShowDropdown(false);
        setSearchResults([]);
        setHighlightedIndex(-1);
    };

    // Handle clear
    const handleClear = () => {
        onChange?.(null);
        setSearchQuery('');
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    };

    // Keyboard navigation
    const handleKeyDown = (e) => {
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
                } else if (searchResults.length === 0 && searchQuery.length >= minLength && onCreateNew) {
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
                setShowDropdown(false);
                setHighlightedIndex(-1);
                break;
            default:
                break;
        }
    };

    // Set result ref for scroll
    const setResultRef = (index, el) => {
        resultRefs.current[index] = el;
    };

    // Default item key getter
    const defaultGetItemKey = (item) => item.id || item[`${entityType}_id`] || Math.random();
    const itemKeyFn = getItemKey || defaultGetItemKey;

    // Default item label getter
    const defaultGetItemLabel = (item) => item.name || item[`${entityType}_name`] || '';
    const itemLabelFn = getItemLabel || defaultGetItemLabel;

    // Default result renderer
    const defaultRenderResult = (item, isHighlighted, index) => (
        <div
            ref={(el) => setResultRef(index, el)}
            onClick={() => handleSelect(item)}
            className={`px-4 py-3 cursor-pointer border-b border-gray-100 ${isHighlighted ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                }`}
        >
            <div className="font-medium text-gray-900">{itemLabelFn(item)}</div>
        </div>
    );

    // Default selected renderer
    const defaultRenderSelected = (item) => (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
                <EntityIcon className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-900">{itemLabelFn(item)}</span>
            </div>
            {clearable && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title={`Remove ${entityType}`}
                >
                    ×
                </button>
            )}
        </div>
    );

    // Default empty state renderer
    const defaultRenderEmptyState = (query, createFn) => (
        <div className="p-4 text-center">
            <EntityIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No {entityType}s found for "{query}"</p>
            {showCreateButton && createFn && (
                <ActionButton
                    label={`${createButtonLabel} "${query}"`}
                    onClick={() => {
                        setShowDropdown(false);
                        createFn(query);
                    }}
                    variant="primary"
                    size="md"
                    className="mt-3 w-full"
                />
            )}
        </div>
    );

    // Use provided renderers or defaults
    const renderResultFn = renderResult || defaultRenderResult;
    const renderSelectedFn = renderSelected || defaultRenderSelected;
    const renderEmptyStateFn = renderEmptyState || defaultRenderEmptyState;

    // Render dropdown content
    const renderDropdownContent = () => (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
                <div className="p-4 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Searching...</p>
                </div>
            ) : searchResults.length > 0 ? (
                <>
                    {searchResults.map((item, index) => (
                        <div key={itemKeyFn(item)}>
                            {renderResultFn(item, index === highlightedIndex, index)}
                        </div>
                    ))}
                    {showCreateButton && onCreateNew && searchQuery.length >= minLength && (
                        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                            <ActionButton
                                label={`${createButtonLabel} "${searchQuery}"`}
                                onClick={() => {
                                    setShowDropdown(false);
                                    onCreateNew(searchQuery);
                                }}
                                variant="ghost"
                                size="sm"
                                className="w-full"
                            />
                        </div>
                    )}
                </>
            ) : searchQuery.length >= minLength ? (
                renderEmptyStateFn(searchQuery, onCreateNew)
            ) : null}
        </div>
    );

    // Inline mode (full width card)
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
                                    label={createButtonLabel}
                                    onClick={() => onCreateNew()}
                                    variant="secondary"
                                    size="sm"
                                />
                            )}
                        </div>

                        {!value ? (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder={placeholder}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setShowDropdown(true)}
                                    onKeyDown={handleKeyDown}
                                    disabled={disabled}
                                    autoFocus={autoFocus}
                                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        ) : (
                            renderSelectedFn(value)
                        )}
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
                {!value ? (
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={placeholder}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setShowDropdown(true)}
                            disabled={disabled}
                            autoFocus={autoFocus}
                            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                ) : (
                    renderSelectedFn(value)
                )}

                {showDropdown && searchQuery && renderDropdownContent()}
            </div>
        );
    }

    // Dropdown mode (default)
    return (
        <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
            {!value ? (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={placeholder}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowDropdown(true)}
                        disabled={disabled}
                        autoFocus={autoFocus}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            ) : (
                renderSelectedFn(value)
            )}

            {showDropdown && searchQuery && renderDropdownContent()}
        </div>
    );
});

EntitySearch.displayName = 'EntitySearch';

export default EntitySearch;
