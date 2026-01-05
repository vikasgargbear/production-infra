import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, KeyboardEvent } from 'react';
import { Search, FileText, Building2, Loader2, AlertCircle } from 'lucide-react';
import { purchasesAPI } from '../../../services/api';
import { useDebounce } from '../../../hooks/useDebounce';

// ==================== TYPE DEFINITIONS ====================

interface PurchaseItem {
    product_name: string;
    quantity?: number;
    unit_price?: number;
}

interface Purchase {
    purchase_id?: number | string;
    id?: number | string;
    invoice_number?: string;
    supplier_invoice_number?: string;
    purchase_date?: string;
    supplier_name?: string;
    supplier_id?: number | string;
    total_amount?: number;
    total_amount?: number;
    payment_status?: string;
    items?: PurchaseItem[];
}

interface PurchaseFilters {
    status?: string;
    payment_status?: string;
    [key: string]: unknown;
}

interface DateRange {
    start?: string;
    end?: string;
}

export interface PurchaseSearchProps {
    onSelect?: (purchase: Purchase) => void;
    supplierId?: string | number | null;
    dateRange?: DateRange | null;
    placeholder?: string;
    autoFocus?: boolean;
    showDetails?: boolean;
    filters?: PurchaseFilters;
    className?: string;
    onError?: (error: Error) => void;
}

export interface PurchaseSearchRef {
    focus: () => void;
    clear: () => void;
}

interface CacheEntry {
    data: Purchase[];
    timestamp: number;
}

// ==================== COMPONENT ====================

/**
 * PurchaseSearch Component
 * 
 * Global component for searching and selecting purchases
 * Supports searching by purchase number, supplier invoice, product, date
 * Loads recent purchases automatically
 */
const PurchaseSearch = forwardRef<PurchaseSearchRef, PurchaseSearchProps>((
    {
        onSelect,
        supplierId = null,
        dateRange = null,
        placeholder = "Search purchase by invoice number, product...",
        autoFocus = false,
        showDetails = true,
        filters = {},
        className = "",
        onError
    },
    ref
) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        focus: () => searchInputRef.current?.focus(),
        clear: () => {
            setSearchTerm('');
            setPurchases([]);
            setSelectedIndex(-1);
        }
    }));

    // Load recent purchases on mount or when supplier changes
    useEffect(() => {
        if (supplierId) {
            fetchRecentPurchases();
        }
    }, [supplierId]);

    // Search when debounced term changes
    useEffect(() => {
        if (debouncedSearchTerm) {
            searchPurchases(debouncedSearchTerm);
        } else if (supplierId) {
            fetchRecentPurchases();
        }
    }, [debouncedSearchTerm, supplierId]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getCacheKey = (type: string, params: Record<string, unknown>): string => {
        return `${type}_${JSON.stringify(params)}`;
    };

    const fetchRecentPurchases = async () => {
        const cacheKey = getCacheKey('recent', { supplierId });
        const cached = cacheRef.current.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            setPurchases(cached.data);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const params = {
                supplier_id: supplierId,
                limit: 10,
                sort: 'purchase_date:desc',
                ...filters
            };

            const response = await purchasesAPI.search(params);
            const recentPurchases = (response as any).data?.purchases || [];

            cacheRef.current.set(cacheKey, {
                data: recentPurchases,
                timestamp: Date.now()
            });

            setPurchases(recentPurchases);
        } catch (err) {
            setError('Failed to load recent purchases');
            if (onError && err instanceof Error) onError(err);
        } finally {
            setLoading(false);
        }
    };

    const searchPurchases = async (query: string) => {
        const cacheKey = getCacheKey('search', { query, supplierId });
        const cached = cacheRef.current.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            setPurchases(cached.data);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const params = {
                search: query,
                supplier_id: supplierId,
                limit: 20,
                ...filters
            };

            const response = await purchasesAPI.search(params);
            const searchResults = (response as any).data?.purchases || [];

            cacheRef.current.set(cacheKey, {
                data: searchResults,
                timestamp: Date.now()
            });

            setPurchases(searchResults);
            setShowDropdown(true);
        } catch (err) {
            setError('Failed to search purchases');
            if (onError && err instanceof Error) onError(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (purchase: Purchase) => {
        setSearchTerm(purchase.invoice_number || purchase.supplier_invoice_number || '');
        setShowDropdown(false);
        setSelectedIndex(-1);

        if (onSelect) {
            onSelect(purchase);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || purchases.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < purchases.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : purchases.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < purchases.length) {
                    handleSelect(purchases[selectedIndex]);
                }
                break;
            case 'Escape':
                setShowDropdown(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const formatDate = (date: string | undefined): string => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number | undefined): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                {loading && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 animate-spin text-gray-400" />
                )}
            </div>

            {/* Dropdown */}
            {showDropdown && (purchases.length > 0 || loading || error) && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {error && (
                        <div className="p-4 text-center">
                            <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {!error && purchases.length === 0 && !loading && (
                        <div className="p-4 text-center text-gray-500">
                            {searchTerm ? 'No purchases found' : 'No recent purchases'}
                        </div>
                    )}

                    {!error && purchases.map((purchase, index) => (
                        <div
                            key={purchase.purchase_id || purchase.id}
                            onClick={() => handleSelect(purchase)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 ${index === selectedIndex ? 'bg-orange-50' : ''
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <span className="font-semibold text-gray-900">
                                            {purchase.invoice_number || purchase.supplier_invoice_number}
                                        </span>
                                        <span className="text-sm text-gray-500">
                                            • {formatDate(purchase.purchase_date)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Building2 className="w-3 h-3 text-gray-400" />
                                        <span className="text-sm text-gray-600">
                                            {purchase.supplier_name}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold text-gray-900">
                                        {formatCurrency(purchase.total_amount || purchase.total_amount)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {purchase.payment_status || 'Unpaid'}
                                    </div>
                                </div>
                            </div>

                            {showDetails && purchase.items && (
                                <div className="mt-2 pl-6">
                                    <div className="text-xs text-gray-500">
                                        {purchase.items.length} items
                                        {purchase.items.slice(0, 2).map((item, idx) => (
                                            <span key={idx} className="ml-2">
                                                • {item.product_name}
                                            </span>
                                        ))}
                                        {purchase.items.length > 2 && (
                                            <span className="ml-2">
                                                +{purchase.items.length - 2} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {!searchTerm && !loading && !error && purchases.length > 0 && (
                        <div className="p-2 text-xs text-gray-500 text-center border-t border-gray-100">
                            Showing recent purchases. Start typing to search all.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

PurchaseSearch.displayName = 'PurchaseSearch';

export default PurchaseSearch;
