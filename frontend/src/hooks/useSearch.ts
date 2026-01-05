import { useState, useEffect, useRef, useCallback, RefObject, KeyboardEvent } from 'react';
import { debounce } from '../utils/debounce';

interface UseSearchOptions<T, R> {
    searchFn: (query: string) => Promise<T[]>;
    minLength?: number;
    debounceMs?: number;
    onSelect?: (item: R) => void;
    transformResults?: (results: T[]) => R[];
}

interface UseSearchReturn<R> {
    query: string;
    setQuery: (query: string) => void;
    results: R[];
    loading: boolean;
    showDropdown: boolean;
    setShowDropdown: (show: boolean) => void;
    highlightedIndex: number;
    setHighlightedIndex: (index: number) => void;
    inputRef: RefObject<HTMLInputElement>;
    dropdownRef: RefObject<HTMLDivElement>;
    setResultRef: (index: number, el: HTMLElement | null) => void;
    handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    selectItem: (item: R) => void;
    clear: () => void;
    focus: () => void;
}

/**
 * useSearch - Shared hook for search components
 */
export function useSearch<T = unknown, R = T>({
    searchFn,
    minLength = 2,
    debounceMs = 100,
    onSelect,
    transformResults = (results: T[]) => results as unknown as R[]
}: UseSearchOptions<T, R>): UseSearchReturn<R> {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<R[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const resultRefs = useRef<(HTMLElement | null)[]>([]);

    const performSearch = useCallback(
        debounce(async (searchQuery: string) => {
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

    useEffect(() => {
        if (query) {
            setShowDropdown(true);
            performSearch(query);
        } else {
            setShowDropdown(false);
            setResults([]);
        }
    }, [query, performSearch]);

    useEffect(() => {
        if (highlightedIndex >= 0 && resultRefs.current[highlightedIndex]) {
            resultRefs.current[highlightedIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [highlightedIndex]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case 'Escape':
                e.stopPropagation();
                setShowDropdown(false);
                setHighlightedIndex(-1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => prev < results.length - 1 ? prev + 1 : 0);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => prev > 0 ? prev - 1 : results.length - 1);
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
        }
    }, [results, highlightedIndex, onSelect]);

    const selectItem = useCallback((item: R) => {
        if (onSelect) {
            onSelect(item);
        }
        setQuery('');
        setShowDropdown(false);
        setResults([]);
        setHighlightedIndex(-1);
    }, [onSelect]);

    const clear = useCallback(() => {
        setQuery('');
        setResults([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
    }, []);

    const focus = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const setResultRef = useCallback((index: number, el: HTMLElement | null) => {
        resultRefs.current[index] = el;
    }, []);

    return {
        query,
        setQuery,
        results,
        loading,
        showDropdown,
        setShowDropdown,
        highlightedIndex,
        setHighlightedIndex,
        inputRef,
        dropdownRef,
        setResultRef,
        handleKeyDown,
        selectItem,
        clear,
        focus
    };
}

export default useSearch;
