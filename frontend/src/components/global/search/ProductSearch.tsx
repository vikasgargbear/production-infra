import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle, KeyboardEvent } from 'react';
import { Search, Package } from 'lucide-react';
import { productsApi } from '../../../services/api';
import BatchSelector from '../selector/BatchSelector';
import { debounce } from '../../../utils/debounce';
import {
    compareExactDecimals,
    formatExactDecimal,
    normalizeAuthoritativeDecimal,
} from '../../../utils/exactDecimal';

import { Product } from '../../../types/models/product';

// ==================== TYPE DEFINITIONS ====================



type ExactSearchProduct = Omit<Product,
    'gst_percent' | 'total_quantity_available' | 'total_stock' | 'mrp' | 'sale_price' | 'cost_per_unit'
> & {
    gst_percent: string;
    total_quantity_available: string;
    total_stock: string;
    mrp?: string;
    sale_price?: string;
    cost_per_unit?: string;
    unit?: string;
    dosage_form?: string;
    strength_display?: string;
    packing_summary?: string;
};

interface ProductWithBatch extends ExactSearchProduct {
    batch_id?: number | string;
    batch_number?: string;
    expiry_date?: string;
    quantity?: string;
    free_quantity?: string;
    unit_price?: string;
}

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 4 } as const;

interface ProductSearchProps {
    onAddItem: (product: ProductWithBatch) => void;
    onCreateProduct?: (productName: string) => void;
    showBatchSelection?: boolean;
    enforceFefo?: boolean;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    tabIndex?: number;
}

export interface ProductSearchRef {
    focus: () => void;
}

// ==================== COMPONENT ====================

const ProductSearch = forwardRef<ProductSearchRef, ProductSearchProps>(
    ({
        onAddItem,
        onCreateProduct,
        showBatchSelection = true,
        enforceFefo = false,
        placeholder = 'Search products by name, code, or HSN...',
        disabled = false,
        tabIndex,
    }, ref) => {
        const [searchQuery, setSearchQuery] = useState<string>('');
        const [searchResults, setSearchResults] = useState<ExactSearchProduct[]>([]);
        const [loading, setLoading] = useState<boolean>(false);
        const [showDropdown, setShowDropdown] = useState<boolean>(false);
        const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
        const [selectedProduct, setSelectedProduct] = useState<ExactSearchProduct | null>(null);
        const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
        const searchInputRef = useRef<HTMLInputElement>(null);
        const dropdownRef = useRef<HTMLDivElement>(null);
        const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
        const searchRequestRef = useRef(0);
        const searchAbortRef = useRef<AbortController | null>(null);

        useEffect(() => {
            if (!disabled) return;
            searchAbortRef.current?.abort();
            searchRequestRef.current += 1;
            setSearchQuery('');
            setSearchResults([]);
            setShowDropdown(false);
            setHighlightedIndex(-1);
        }, [disabled]);

        // Expose focus method to parent
        useImperativeHandle(ref, () => ({
            focus: () => {
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            }
        }));

        // Search the canonical API; no device cache or fallback authority.
        const searchProducts = useMemo(
            () => debounce(async (query: string, requestId: number): Promise<void> => {
                if (!query || query.length < 2) {
                    setSearchResults([]);
                    setHighlightedIndex(-1);
                    return;
                }

                setLoading(true);

                searchAbortRef.current?.abort();
                const controller = new AbortController();
                searchAbortRef.current = controller;
                try {
                    const response = await productsApi.search(query, { limit: 20 }, { signal: controller.signal });
                    if (requestId !== searchRequestRef.current) return;
                    const rows = response?.data;
                    if (!Array.isArray(rows)) {
                        throw new Error('Product search returned an invalid canonical response');
                    }
                    const transformedResults: ExactSearchProduct[] = rows.map((row, index) => {
                        if (typeof row?.product_id !== 'string' || typeof row?.product_name !== 'string') {
                            throw new Error(`Product search row ${index + 1} is missing identity`);
                        }
                        const gstPercent = normalizeAuthoritativeDecimal(
                            row.gst_percent,
                            `Product search row ${index + 1} GST rate`,
                            rateOptions,
                        );
                        const currentStock = normalizeAuthoritativeDecimal(
                            row.current_stock,
                            `Product search row ${index + 1} current stock`,
                            quantityOptions,
                        );
                        return {
                            product_id: row.product_id,
                            product_code: typeof row.product_code === 'string' ? row.product_code : '',
                            product_name: row.product_name,
                            product_type: typeof row.product_type === 'string' ? row.product_type : 'medicine',
                            generic_name: typeof row.generic_name === 'string' ? row.generic_name : undefined,
                            manufacturer: typeof row.manufacturer_name === 'string' ? row.manufacturer_name : undefined,
                            hsn_code: typeof row.hsn_code === 'string' ? row.hsn_code : undefined,
                            category: typeof row.category_name === 'string' ? row.category_name : undefined,
                            unit: typeof row.unit === 'string' ? row.unit : undefined,
                            dosage_form: typeof row.dosage_form === 'string' ? row.dosage_form : undefined,
                            strength: typeof row.strength_display === 'string' ? row.strength_display : undefined,
                            strength_display: typeof row.strength_display === 'string' ? row.strength_display : undefined,
                            packing_summary: typeof row.packing_summary === 'string' ? row.packing_summary : undefined,
                            uom_conversion_id: typeof row.uom_conversion_id === 'string' ? row.uom_conversion_id : undefined,
                            gst_percent: gstPercent,
                            requires_prescription: row.requires_prescription === true,
                            total_quantity_available: currentStock,
                            total_stock: currentStock,
                        } as ExactSearchProduct;
                    });

                    setSearchResults(transformedResults);

                    if (transformedResults.length > 0) {
                        setHighlightedIndex(0);
                    } else {
                        setHighlightedIndex(-1);
                    }
                } catch (error) {
                    if (controller.signal.aborted) return;
                    if (requestId !== searchRequestRef.current) return;
                    console.error('Product search failed:', error);
                    setSearchResults([]);
                    setHighlightedIndex(-1);
                } finally {
                    if (requestId === searchRequestRef.current) setLoading(false);
                    if (searchAbortRef.current === controller) searchAbortRef.current = null;
                }
            }, 275),
            []
        );

        useEffect(() => {
            if (disabled) {
                searchProducts.cancel();
                return undefined;
            }
            const requestId = ++searchRequestRef.current;
            searchProducts(searchQuery, requestId);
            return () => {
                searchProducts.cancel();
                searchAbortRef.current?.abort();
            };
        }, [disabled, searchQuery, searchProducts]);

        // Auto-scroll to highlighted item
        useEffect(() => {
            const highlighted = resultRefs.current[highlightedIndex];
            if (highlightedIndex >= 0 && typeof highlighted?.scrollIntoView === 'function') {
                highlighted.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }
        }, [highlightedIndex]);

        // Handle click outside
        useEffect(() => {
            const handleClickOutside = (event: globalThis.MouseEvent): void => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setShowDropdown(false);
                }
            };

            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        const handleProductSelect = (product: ExactSearchProduct): void => {
            if (showBatchSelection) {
                setSelectedProduct(product);
                setShowBatchModal(true);
            } else {
                onAddItem(product as ProductWithBatch);
            }
            setSearchQuery('');
            setShowDropdown(false);
            setSearchResults([]);
        };

        const handleBatchSelect = (productWithBatch: ProductWithBatch): void => {
            onAddItem(productWithBatch);
            setShowBatchModal(false);
            setSelectedProduct(null);
            if (searchInputRef.current) {
                searchInputRef.current.focus();
            }
        };

        const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setShowDropdown(false);
                setHighlightedIndex(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < searchResults.length - 1 ? prev + 1 : 0
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : searchResults.length - 1
                );
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                    handleProductSelect(searchResults[highlightedIndex]);
                }
            } else if (e.key === 'Tab') {
                // If dropdown is open with a highlighted item, select it before tabbing
                if (showDropdown && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                    e.preventDefault();
                    handleProductSelect(searchResults[highlightedIndex]);
                } else {
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                    setSearchQuery('');
                }
            }
        };

        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4" onKeyDown={handleKeyDown}>
                <div className="space-y-3">
                    {/* Product Search */}
                    <div className="relative" ref={dropdownRef}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder={placeholder}
                                disabled={disabled}
                                aria-disabled={disabled}
                                value={searchQuery}
                                onChange={(e) => {
                                    if (disabled) return;
                                    setSearchQuery(e.target.value);
                                    setShowDropdown(true);
                                }}
                                onFocus={() => { if (!disabled) setShowDropdown(true); }}
                                tabIndex={tabIndex}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* Search Results Dropdown */}
                        {showDropdown && searchQuery && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                {loading ? (
                                    <div className="p-4 text-center text-gray-500">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                                        <p className="mt-2 text-sm">Searching...</p>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    <>
                                        {searchResults.map((product, index) => (
                                            <button
                                                type="button"
                                                key={`product-${product.product_id}-${index}`}
                                                data-testid={`product-search-option-${product.product_id}`}
                                                ref={(el) => (resultRefs.current[index] = el)}
                                                onClick={() => handleProductSelect(product)}
                                                role="option"
                                                aria-selected={index === highlightedIndex}
                                                className={`block w-full min-h-11 px-4 py-3 text-left cursor-pointer border-b border-gray-100 ${index === highlightedIndex
                                                    ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                                    : 'hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className="flex flex-wrap justify-between items-start gap-x-4 gap-y-1">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-semibold text-gray-900 break-words">{product.product_name}</div>
                                                        {product.generic_name && (
                                                            <div className="text-sm text-gray-600 break-words">{product.generic_name}</div>
                                                        )}
                                                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-600">
                                                            {product.manufacturer && <span>{product.manufacturer}</span>}
                                                            {product.strength_display && <span>{product.strength_display}</span>}
                                                            {product.packing_summary && <span>{product.packing_summary}</span>}
                                                            {product.dosage_form && <span>{product.dosage_form}</span>}
                                                            {product.unit && <span>Unit: {product.unit}</span>}
                                                        </div>
                                                        {(product.category || product.hsn_code) && (
                                                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-400">
                                                                {product.category && <span>{product.category}</span>}
                                                                {product.hsn_code && <span>HSN: {product.hsn_code}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <div className={`font-medium ${compareExactDecimals(
                                                            product.total_stock ?? '0', '0', 'Product stock', quantityOptions,
                                                        ) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            Stock: {formatExactDecimal(
                                                                product.total_stock ?? '0', 'Product stock', quantityOptions,
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500">GST {formatExactDecimal(
                                                            product.gst_percent ?? '0', 'Product GST rate', rateOptions,
                                                        )}%</div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                        {/* Create Product option */}
                                        {onCreateProduct && searchQuery.length >= 2 && (
                                            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setShowDropdown(false);
                                                        onCreateProduct(searchQuery);
                                                    }}
                                                    className="w-full min-h-11 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    + Create Product "{searchQuery}"
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : searchQuery.length >= 2 ? (
                                    <div className="p-4">
                                        <div className="text-center mb-3">
                                            <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-sm text-gray-500">No products found for "{searchQuery}"</p>
                                        </div>
                                        {onCreateProduct && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowDropdown(false);
                                                    onCreateProduct(searchQuery);
                                                }}
                                                className="w-full min-h-11 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                                            >
                                                + Create Product "{searchQuery}"
                                            </button>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>

                {/* Batch Selection Modal */}
                {showBatchSelection && showBatchModal && selectedProduct && (
                    <BatchSelector
                        show={showBatchModal}
                        product={selectedProduct as any}
                        mode="modal"
                        enforceFefo={enforceFefo}
                        onClose={() => {
                            setShowBatchModal(false);
                            setSelectedProduct(null);
                        }}
                        onBatchSelect={handleBatchSelect as any}
                    />
                )}
            </div>
        );
    }
);

ProductSearch.displayName = 'ProductSearch';

export default ProductSearch;
