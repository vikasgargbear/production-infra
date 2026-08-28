import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit, Package, Plus, Search, Trash2 } from 'lucide-react';
import { productsApi } from '../../../services/api';
import type { CanonicalProductRead } from '../../../services/api/modules/master/canonicalMasterReads';
import ProductFlow from './ProductFlow';
import ProductDraftDeleteDialog from './ProductDraftDeleteDialog';

const Products: React.FC = () => {
  const [products, setProducts] = useState<CanonicalProductRead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CanonicalProductRead | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<CanonicalProductRead['product_id'] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CanonicalProductRead | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTrigger, setDeleteTrigger] = useState<HTMLElement | null>(null);
  const newDraftButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await productsApi.getAll({ limit: 100, include_inactive: true });
      setProducts(response.data.products);
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
      product.hsn_code,
    ].some(value => value?.toLowerCase().includes(query)));
  }, [products, search]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingProduct(null);
  };

  const requestDraftDeletion = (product: CanonicalProductRead, trigger: HTMLElement) => {
    // The API is authoritative too, but never offer or issue the mutation when
    // the read projection says this is an active or blocked catalog record.
    if (product.status !== 'draft') return;
    setDeleteError(null);
    setDeleteTrigger(trigger);
    setPendingDelete(product);
  };

  const closeDeleteDialog = () => {
    if (deletingProductId !== null) return;
    setPendingDelete(null);
    setDeleteError(null);
  };

  const deleteDraft = async () => {
    const product = pendingDelete;
    if (!product || product.status !== 'draft') return;

    setDeletingProductId(product.product_id);
    setDeleteError(null);
    try {
      await productsApi.delete(product.product_id, product.row_version);
      setPendingDelete(null);
      await load();
    } catch (deleteError: any) {
      const detail = deleteError?.response?.data?.detail;
      setDeleteError(typeof detail === 'string' ? detail : 'Failed to delete the product draft. It may already be referenced.');
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          </div>
          <button ref={newDraftButtonRef} type="button" onClick={() => setEditorOpen(true)} className="flex min-h-11 items-center gap-2 bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
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
          <>
          <div className="space-y-3 md:hidden">
            {filtered.map(product => {
              const isDraft = product.status === 'draft';
              return (
                <article key={product.product_id} className="border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words font-medium text-gray-900">{product.product_name}</h2>
                      {product.generic_name && <p className="mt-1 break-words text-sm text-gray-500">{product.generic_name}</p>}
                    </div>
                    <span className={`shrink-0 border px-2 py-1 text-xs font-medium ${isDraft ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {isDraft ? 'Draft' : product.status === 'blocked' ? 'Blocked' : 'Active'}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm">
                    <div><dt className="text-gray-500">Code</dt><dd className="mt-1 break-all text-gray-800">{product.product_code}</dd></div>
                    <div><dt className="text-gray-500">Kind</dt><dd className="mt-1 text-gray-800">{product.product_type}</dd></div>
                  </dl>
                  {isDraft ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setEditingProduct(product); setEditorOpen(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 border border-gray-300 bg-white px-3 py-2 text-gray-700" aria-label={`Edit draft ${product.product_name}`}>
                        <Edit className="h-4 w-4" /> Edit draft
                      </button>
                      <button type="button" onClick={(event) => requestDraftDeletion(product, event.currentTarget)} disabled={deletingProductId === product.product_id} className="inline-flex min-h-11 items-center justify-center gap-2 border border-red-200 bg-white px-3 py-2 text-red-700 disabled:opacity-50" aria-label={`Delete draft ${product.product_name}`}>
                        <Trash2 className="h-4 w-4" /> {deletingProductId === product.product_id ? 'Deleting…' : 'Delete draft'}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500">Canonical catalog record · Read only</p>
                  )}
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto border border-gray-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">HSN</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(product => {
                  const isDraft = product.status === 'draft';
                  return (
                  <tr key={product.product_id}>
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{product.product_name}</div><div className="text-gray-500">{product.generic_name}</div></td>
                    <td className="px-4 py-3 text-gray-700">{product.product_code}</td>
                    <td className="px-4 py-3 text-gray-700">{product.hsn_code ?? 'Not classified'}</td>
                    <td className="px-4 py-3 text-gray-700">{product.product_type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex border px-2 py-1 text-xs font-medium ${isDraft ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                        {isDraft ? 'Draft' : product.status === 'blocked' ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isDraft ? (
                        <div className="flex min-w-max items-center gap-2">
                          <button type="button" onClick={() => { setEditingProduct(product); setEditorOpen(true); }} className="inline-flex min-h-10 items-center gap-2 border border-gray-300 bg-white px-3 py-2 text-gray-700 hover:bg-gray-50" aria-label={`Edit draft ${product.product_name}`}>
                            <Edit className="h-4 w-4" /> Edit draft
                          </button>
                          <button type="button" onClick={(event) => requestDraftDeletion(product, event.currentTarget)} disabled={deletingProductId === product.product_id} className="inline-flex min-h-10 items-center gap-2 border border-red-200 bg-white px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete draft ${product.product_name}`}>
                            <Trash2 className="h-4 w-4" /> {deletingProductId === product.product_id ? 'Deleting…' : 'Delete draft'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Read only</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-12 text-center text-sm text-gray-500">No products found.</p>}
          </div>
          {filtered.length === 0 && <p className="py-12 text-center text-sm text-gray-500 md:hidden">No products found.</p>}
          </>
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
      <ProductDraftDeleteDialog
        product={pendingDelete}
        deleting={deletingProductId !== null}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onDelete={() => void deleteDraft()}
        restoreFocusTo={deleteTrigger}
        fallbackFocusTo={newDraftButtonRef.current}
      />
    </div>
  );
};

export default Products;
