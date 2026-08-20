import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, Package, Plus, Search } from 'lucide-react';
import { productsApi } from '../../../services/api';
import type { Product } from '../../../types/models/product';
import ProductFlow from './ProductFlow';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await productsApi.getAll({ limit: 100, include_inactive: true });
      setProducts(response.data?.products ?? response.data ?? []);
    } catch {
      setError('Failed to load products.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(product => [
      product.product_name,
      product.product_code,
      product.generic_name,
      product.manufacturer,
    ].some(value => value?.toLowerCase().includes(query)));
  }, [products, search]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-green-700" />
            <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          </div>
          <button type="button" onClick={() => setEditorOpen(true)} className="flex items-center gap-2 bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            <Plus className="h-4 w-4" /> New draft
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="relative mb-5 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products" className="w-full border border-gray-300 py-2 pl-9 pr-3" />
        </div>

        {error && <p className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">Loading products...</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Manufacturer</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="w-16 px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(product => (
                  <tr key={product.product_id}>
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{product.product_name}</div><div className="text-gray-500">{product.generic_name}</div></td>
                    <td className="px-4 py-3 text-gray-700">{product.product_code}</td>
                    <td className="px-4 py-3 text-gray-700">{product.manufacturer || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{product.product_type}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => { setEditingProduct(product); setEditorOpen(true); }} className="p-2 text-gray-600 hover:bg-gray-100" aria-label={`Edit ${product.product_name}`}>
                        <Edit className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-12 text-center text-sm text-gray-500">No products found.</p>}
          </div>
        )}
      </main>

      {editorOpen && (
        <ProductFlow
          open
          product={editingProduct}
          onClose={closeEditor}
          onProductCreated={() => { closeEditor(); void load(); }}
        />
      )}
    </div>
  );
};

export default Products;
