import { useState, useEffect, useRef, useCallback } from 'react';
import { debounce } from '../../../utils/debounce';

/**
 * useSearch - Shared hook for search components
 * 
 * Extracts common search logic:
 * - Debounced search
 * - Loading state
 * - Result management
 * - Keyboard navigation
 * - Click outside handling
 * - Auto-scroll to highlighted item
 * 
 * Usage:
 * const search = useSearch({
 *   searchFn: async (query) => localFirstService.searchProducts(query),
 *   minLength: 2,
 *   debounceMs: 100
 * });
 * 
 * // In component:
 * <input 
 *   value={search.query}
 *   onChange={(e) => search.setQuery(e.target.value)}
 *   onKeyDown={search.handleKeyDown}
 * />
 * {search.showDropdown && search.results.map(...)}
 */
export function useSearch({
    searchFn,
    minLength = 2,
    debounceMs = 100,
    onSelect,
    transformResults = (results) => results
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const resultRefs = useRef([]);

    // Debounced search
    const performSearch = useCallback(
        debounce(async (searchQuery) => {
            if (!searchQuery || searchQuery.length < minLength) {
                setResults([]);
                setHighlightedIndex(-1);
                return;
            }

            setLoading(true);
            try {
                const rawResults = await searchFn(searchQuery);
                const transformedResults = transformResults(rawResults);
                setResults(transformedResults);

                // Auto-highlight first result
                if (transformedResults.length > 0) {
                    setHighlightedIndex(0);
                } else {
                    setHighlightedIndex(-1);
                }
            } catch (error) {
                console.error('Search failed:', error);
                setResults([]);
                setHighlightedIndex(-1);
            } finally {
                setLoading(false);
            }
        }, debounceMs),
        [searchFn, minLength, transformResults, debounceMs]
    );

    // Trigger search when query changes
    useEffect(() => {
        if (query) {
            setShowDropdown(true);
            performSearch(query);
        } else {
            setShowDropdown(false);
            setResults([]);
        }
    }, [query, performSearch]);

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

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        switch (e.key) {
            case 'Escape':
                e.stopPropagation();
                setShowDropdown(false);
                setHighlightedIndex(-1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : results.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                    if (onSelect) {
                        onSelect(results[highlightedIndex]);
                    }
                    setQuery('');
                    setShowDropdown(false);
                }
                break;
            case 'Tab':
                setShowDropdown(false);
                setHighlightedIndex(-1);
                setQuery('');
                break;
            default:
                break;
        }
    }, [results, highlightedIndex, onSelect]);

    // Select item programmatically
    const selectItem = useCallback((item) => {
        if (onSelect) {
            onSelect(item);
        }
        setQuery('');
        setShowDropdown(false);
        setResults([]);
        setHighlightedIndex(-1);
    }, [onSelect]);

    // Clear search
    const clear = useCallback(() => {
        setQuery('');
        setResults([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
    }, []);

    // Focus input
    const focus = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Set result ref for auto-scroll
    const setResultRef = useCallback((index, el) => {
        resultRefs.current[index] = el;
    }, []);

    return {
        // State
        query,
        setQuery,
        results,
        loading,
        showDropdown,
        setShowDropdown,
        highlightedIndex,
        setHighlightedIndex,

        // Refs
        inputRef,
        dropdownRef,
        setResultRef,

        // Actions
        handleKeyDown,
        selectItem,
        clear,
        focus
    };
}

export default useSearch;
