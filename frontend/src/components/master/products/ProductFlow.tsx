import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Package, Save } from 'lucide-react';
import { productsApi } from '../../../services/api';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useToast } from '../../global/ui/feedback/Toast';
import {
  productCreateSchema,
  productUpdateSchema,
  type Product,
  type ProductCreateInput,
  type ProductMutationResponse,
  type ProductUpdateInput,
} from '../../../types/models/product';

interface ProductFlowProps {
  open?: boolean;
  show?: boolean;
  product?: Partial<Product> | null;
  onClose?: () => void;
  onProductCreated?: (product: ProductMutationResponse) => void;
  initialProductName?: string;
}

type DraftForm = {
  product_name: string;
  product_code: string;
  generic_name: string;
  product_kind: ProductCreateInput['product_kind'];
};

const initialForm = (product?: Partial<Product> | null, name = ''): DraftForm => ({
  product_name: product?.product_name ?? name,
  product_code: product?.product_code ?? '',
  generic_name: product?.generic_name ?? '',
  product_kind: (
    product?.product_type === 'medical_device' || product?.product_type === 'consumable'
      ? product.product_type
      : 'medicine'
  ),
});

const optionalText = (value: string): string | undefined => value.trim() || undefined;

const ProductFlow: React.FC<ProductFlowProps> = ({
  open,
  show,
  product,
  onClose,
  onProductCreated,
  initialProductName = '',
}) => {
  const isOpen = open ?? show ?? true;
  const isEditing = product?.product_id !== undefined;
  const formRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [form, setForm] = useState<DraftForm>(() => initialForm(product, initialProductName));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEnterAsTab({ containerRef: formRef, enabled: isOpen, excludeSelectors: ['button[type="submit"]'] });
  useEscapeKey(useCallback(() => onClose?.(), [onClose]), isOpen, 'ProductFlow');

  useEffect(() => {
    if (isOpen) setForm(initialForm(product, initialProductName));
  }, [isOpen, product, initialProductName]);

  const payload = useMemo<ProductCreateInput>(() => ({
    product_name: form.product_name,
    product_code: optionalText(form.product_code),
    generic_name: optionalText(form.generic_name),
    product_kind: form.product_kind,
  }), [form]);

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      let response;
      if (isEditing) {
        const { product_code: _immutableCode, ...updateFields } = payload;
        const update = productUpdateSchema.parse(updateFields) as ProductUpdateInput;
        response = await productsApi.update(product!.product_id!, update);
      } else {
        response = await productsApi.create(productCreateSchema.parse(payload));
      }
      toast.success(response.data.message);
      onProductCreated?.(response.data);
      onClose?.();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setErrors(detail.map((item: any) => item.msg ?? String(item)));
      } else if (typeof detail === 'string') {
        setErrors([detail]);
      } else if (error?.issues) {
        setErrors(error.issues.map((item: any) => item.message));
      } else {
        setErrors(['Failed to save the product draft.']);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" ref={formRef}>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100" aria-label="Close product form">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Package className="h-5 w-5 text-green-700" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit product draft' : 'New product draft'}</h1>
            <p className="text-sm text-gray-500">Basic identity now; classification before sale</p>
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 bg-green-700 px-4 py-2 text-white hover:bg-green-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {errors.length > 0 && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors.map(error => <p key={error}>{error}</p>)}
            </div>
          )}

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="mb-4 text-sm text-gray-600">
              Drafts cannot be sold or purchased until HSN, manufacturer, tax, and regulatory details are reviewed.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Product name
              <input autoFocus value={form.product_name} onChange={event => set('product_name', event.target.value)} className="mt-1 w-full border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Product code
              <input value={form.product_code} disabled={isEditing} onChange={event => set('product_code', event.target.value)} placeholder="Generated when blank" className="mt-1 w-full border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
            </label>
            <label className="text-sm font-medium text-gray-700">Generic display name
              <input value={form.generic_name} onChange={event => set('generic_name', event.target.value)} className="mt-1 w-full border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Product kind
              <select value={form.product_kind} onChange={event => set('product_kind', event.target.value as DraftForm['product_kind'])} className="mt-1 w-full border border-gray-300 px-3 py-2">
                <option value="medicine">Medicine</option>
                <option value="medical_device">Medical device</option>
                <option value="consumable">Consumable</option>
              </select>
            </label>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ProductFlow;
