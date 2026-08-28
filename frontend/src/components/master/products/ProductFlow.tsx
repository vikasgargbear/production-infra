import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Package, Plus, Search, Trash2 } from 'lucide-react';
import { productsApi } from '../../../services/api';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useToast } from '../../global/ui/feedback/Toast';
import {
  productCreateSchema, productSetupSchema, productUpdateSchema,
  type Product, type ProductHsnOption, type ProductIngredientOption,
  type ProductMutationResponse, type ProductSetupInput, type ProductSetupOptions,
} from '../../../types/models/product';
import type { CanonicalProductRead } from '../../../services/api/modules/master/canonicalMasterReads';
import { newMasterCreateIdempotencyKey, newProductActivationIdempotencyKey } from '../../../services/api/modules/master/masterCreationContract';

interface ProductFlowProps {
  open?: boolean; show?: boolean; product?: Partial<Product> | CanonicalProductRead | null;
  onClose?: () => void; onProductCreated?: (product: ProductMutationResponse) => void;
  initialProductName?: string;
}

type ProductKind = 'medicine' | 'medical_device' | 'consumable';
type WorkingProduct = {
  product_id?: string; product_code?: string; product_name: string; generic_name: string;
  product_kind: ProductKind | ''; row_version?: number;
};
type PackRow = { uom_code: string; multiplier: string };
type IngredientRow = ProductIngredientOption & {
  ingredient_role: 'active' | 'excipient'; strength_value: string; strength_uom_code: string;
  basis_quantity: string; basis_uom_code: string;
};
type SetupForm = {
  category_id: string; manufacturer_party_id: string; base_uom_code: string;
  dosage_form: string; strength_display: string; hsn_code: string;
  hsn_description: string; hsn_rate: string; cold_chain_required: boolean;
  minimum_storage_celsius: string; maximum_storage_celsius: string;
  shelf_life_days: string; gtin: string; pack_conversions: PackRow[];
  ingredients: IngredientRow[]; traceability_code: string;
};

const steps = ['Basics', 'Classification', 'Packaging', 'Handling', 'Review'];
const emptySetup: SetupForm = {
  category_id: '', manufacturer_party_id: '', base_uom_code: 'EA', dosage_form: '',
  strength_display: '', hsn_code: '', hsn_description: '', hsn_rate: '',
  cold_chain_required: false, minimum_storage_celsius: '', maximum_storage_celsius: '',
  shelf_life_days: '', gtin: '', pack_conversions: [], ingredients: [], traceability_code: '',
};
const optionalText = (value: string): string | undefined => value.trim() || undefined;
const optionalNumber = (value: string): number | undefined => value.trim() ? Number(value) : undefined;
const asProductKind = (value: unknown): ProductKind | '' => value === 'medicine' || value === 'medical_device' || value === 'consumable' ? value : '';
const initialProduct = (product?: Partial<Product> | CanonicalProductRead | null, name = ''): WorkingProduct => ({
  product_id: product?.product_id === undefined ? undefined : String(product.product_id),
  product_code: product?.product_code, product_name: product?.product_name ?? name,
  generic_name: product?.generic_name ?? '', product_kind: asProductKind(product?.product_type),
  row_version: product?.row_version,
});
const fieldClass = 'mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:bg-gray-100';
const labelClass = 'block text-sm font-medium text-gray-800';

const ProductFlow: React.FC<ProductFlowProps> = ({ open, show, product, onClose, onProductCreated, initialProductName = '' }) => {
  const isOpen = open ?? show ?? true;
  const formRef = useRef<HTMLDivElement>(null);
  const createKeyRef = useRef(newMasterCreateIdempotencyKey('product'));
  const activationKeyRef = useRef(newProductActivationIdempotencyKey());
  const inFlight = useRef(false);
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState<WorkingProduct>(() => initialProduct(product, initialProductName));
  const [setup, setSetup] = useState<SetupForm>(emptySetup);
  const [options, setOptions] = useState<ProductSetupOptions | null>(null);
  const [hsnQuery, setHsnQuery] = useState('');
  const [hsnOptions, setHsnOptions] = useState<ProductHsnOption[]>([]);
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [ingredientOptions, setIngredientOptions] = useState<ProductIngredientOption[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [recommendedFields, setRecommendedFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEnterAsTab({ containerRef: formRef, enabled: isOpen, excludeSelectors: ['button'] });
  useEscapeKey(useCallback(() => onClose?.(), [onClose]), isOpen, 'ProductFlow');

  const loadOptions = useCallback(async () => setOptions((await productsApi.getSetupOptions()).data), []);
  const loadSetup = useCallback(async (productId: string) => {
    const current = (await productsApi.getSetup(productId)).data;
    setWorking({ product_id: current.product_id, product_code: current.product_code, product_name: current.product_name,
      generic_name: current.generic_name ?? '', product_kind: current.product_kind, row_version: current.row_version });
    setSetup({
      category_id: current.category_id ?? '', manufacturer_party_id: current.manufacturer_party_id ?? '',
      base_uom_code: current.base_uom_code, dosage_form: current.dosage_form ?? '',
      strength_display: current.strength_display ?? '', hsn_code: current.hsn_code ?? '',
      hsn_description: '', hsn_rate: '', cold_chain_required: current.cold_chain_required,
      minimum_storage_celsius: current.minimum_storage_celsius ?? '', maximum_storage_celsius: current.maximum_storage_celsius ?? '',
      shelf_life_days: current.shelf_life_days?.toString() ?? '', gtin: current.gtin ?? '',
      pack_conversions: current.pack_conversions.map(row => ({ uom_code: row.uom_code, multiplier: row.multiplier })),
      ingredients: current.ingredients.map(row => ({ ...row, ruleset_version: '', strength_value: row.strength_value ?? '',
        strength_uom_code: row.strength_uom_code ?? '', basis_quantity: row.basis_quantity ?? '', basis_uom_code: row.basis_uom_code ?? '' })),
      traceability_code: '',
    });
    setMissingFields(current.missing_fields); setRecommendedFields(current.recommended_fields);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const next = initialProduct(product, initialProductName);
    setWorking(next); setSetup(emptySetup); setStep(next.product_id ? 1 : 0); setErrors([]); setLoading(true);
    Promise.all([loadOptions(), ...(next.product_id ? [loadSetup(next.product_id)] : [])])
      .catch(() => { if (!cancelled) setErrors(['Product setup references could not be loaded. Retry before entering regulated details.']); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, product, initialProductName, loadOptions, loadSetup]);

  useEffect(() => {
    const query = hsnQuery.trim(); if (query.length < 2) { setHsnOptions([]); return; }
    const timer = window.setTimeout(() => productsApi.searchHsnCodes(query).then(r => setHsnOptions(r.data))
      .catch(() => setErrors(['HSN search failed. No unreviewed tax value has been saved.'])), 220);
    return () => window.clearTimeout(timer);
  }, [hsnQuery]);
  useEffect(() => {
    const query = ingredientQuery.trim(); if (query.length < 2) { setIngredientOptions([]); return; }
    const timer = window.setTimeout(() => productsApi.searchIngredients(query).then(r => setIngredientOptions(r.data))
      .catch(() => setErrors(['Ingredient search failed. No unreviewed composition has been saved.'])), 220);
    return () => window.clearTimeout(timer);
  }, [ingredientQuery]);

  const setWorkingField = <K extends keyof WorkingProduct>(key: K, value: WorkingProduct[K]) => setWorking(current => ({ ...current, [key]: value }));
  const setSetupField = <K extends keyof SetupForm>(key: K, value: SetupForm[K]) => setSetup(current => ({ ...current, [key]: value }));
  const errorMessages = (error: any, fallback: string): string[] => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((item: any) => item.msg ?? String(item));
    if (typeof detail === 'string') return [detail];
    if (error?.issues) return error.issues.map((item: any) => item.message);
    return [fallback];
  };

  const saveBasics = async () => {
    const identity = productCreateSchema.parse({ product_name: working.product_name, generic_name: optionalText(working.generic_name), product_kind: working.product_kind });
    if (working.product_id) {
      const response = await productsApi.update(working.product_id, productUpdateSchema.parse({ ...identity, row_version: working.row_version }));
      setWorking(current => ({ ...current, row_version: response.data.row_version })); return response.data;
    }
    const response = await productsApi.create(identity, createKeyRef.current);
    setWorking(current => ({ ...current, product_id: response.data.product_id, product_code: response.data.product_code, row_version: response.data.row_version }));
    createKeyRef.current = newMasterCreateIdempotencyKey('product'); return response.data;
  };
  const setupPayload = (): ProductSetupInput => productSetupSchema.parse({
    row_version: working.row_version, category_id: optionalText(setup.category_id),
    manufacturer_party_id: setup.manufacturer_party_id, base_uom_code: setup.base_uom_code,
    dosage_form: optionalText(setup.dosage_form), strength_display: optionalText(setup.strength_display), hsn_code: setup.hsn_code,
    cold_chain_required: setup.cold_chain_required, minimum_storage_celsius: optionalNumber(setup.minimum_storage_celsius),
    maximum_storage_celsius: optionalNumber(setup.maximum_storage_celsius), shelf_life_days: optionalNumber(setup.shelf_life_days),
    gtin: optionalText(setup.gtin), pack_conversions: setup.pack_conversions.map(row => ({ uom_code: row.uom_code, multiplier: Number(row.multiplier) })),
    ingredients: working.product_kind === 'medicine' ? setup.ingredients.map(row => ({ ingredient_id: row.ingredient_id,
      ingredient_role: row.ingredient_role, ...(row.ingredient_role === 'active' ? { strength_value: Number(row.strength_value),
        strength_uom_code: row.strength_uom_code, basis_quantity: Number(row.basis_quantity), basis_uom_code: row.basis_uom_code } : {}) })) : [],
  });
  const saveSetup = async () => {
    if (!working.product_id) throw new Error('Save product basics first');
    const response = await productsApi.saveSetup(working.product_id, setupPayload());
    setWorking(current => ({ ...current, row_version: response.data.row_version }));
    await loadSetup(working.product_id); return response.data;
  };
  const advance = async () => {
    if (inFlight.current) return; inFlight.current = true; setSaving(true); setErrors([]);
    try {
      if (step === 0) { const response = await saveBasics(); toast.success(`${response.product_code} saved as a draft. Continue with reviewed classification.`); setStep(1); }
      else if (step < 3) setStep(current => current + 1);
      else if (step === 3) { await saveSetup(); toast.success('Product setup saved and checked by the canonical backend.'); setStep(4); }
    } catch (error: any) { setErrors(errorMessages(error, step === 0 ? 'Failed to save product basics.' : 'Failed to save product setup.')); }
    finally { inFlight.current = false; setSaving(false); }
  };
  const activate = async () => {
    if (!working.product_id || !working.row_version || inFlight.current) return;
    inFlight.current = true; setSaving(true); setErrors([]);
    try {
      const response = await productsApi.activate(working.product_id, working.row_version, activationKeyRef.current, optionalText(setup.traceability_code));
      activationKeyRef.current = newProductActivationIdempotencyKey(); toast.success(response.data.message);
      onProductCreated?.(response.data); onClose?.();
    } catch (error: any) { setErrors(errorMessages(error, 'Activation failed. Review the missing canonical requirements.')); await loadSetup(working.product_id).catch(() => undefined); }
    finally { inFlight.current = false; setSaving(false); }
  };

  const addIngredient = (option: ProductIngredientOption) => {
    if (setup.ingredients.some(row => row.ingredient_id === option.ingredient_id)) return;
    setSetupField('ingredients', [...setup.ingredients, { ...option, ingredient_role: 'active', strength_value: '', strength_uom_code: '', basis_quantity: '', basis_uom_code: '' }]);
    setIngredientQuery(''); setIngredientOptions([]);
  };
  const updateIngredient = (index: number, change: Partial<IngredientRow>) => setSetupField('ingredients', setup.ingredients.map((row, i) => i === index ? { ...row, ...change } : row));
  const updatePack = (index: number, change: Partial<PackRow>) => setSetupField('pack_conversions', setup.pack_conversions.map((row, i) => i === index ? { ...row, ...change } : row));
  const selectedManufacturer = options?.manufacturers.find(row => row.manufacturer_party_id === setup.manufacturer_party_id);
  const baseUnit = options?.units.find(row => row.code === setup.base_uom_code);
  const medicine = working.product_kind === 'medicine';
  const h2Applies = setup.ingredients.some(row => row.schedule_h2_applicable_from);
  const reviewSections = useMemo(() => [
    ['Identity', `${working.product_name} · ${working.product_code ?? 'Code pending'}`],
    ['Classification', `${selectedManufacturer?.legal_name ?? 'Manufacturer missing'} · HSN ${setup.hsn_code || 'missing'}`],
    ['Unit & pack', `${baseUnit?.name ?? setup.base_uom_code} base · ${setup.pack_conversions.length} additional pack level${setup.pack_conversions.length === 1 ? '' : 's'}`],
    ['Composition', medicine ? `${setup.ingredients.length} reviewed ingredient${setup.ingredients.length === 1 ? '' : 's'}` : 'Not applicable'],
    ['First stock', 'Batch, manufacture, expiry, MRP, cost and quantity are captured during Goods receipt'],
  ], [working, selectedManufacturer, setup, baseUnit, medicine]);

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex min-w-0 flex-col bg-gray-50" ref={formRef}>
    <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-gray-100" aria-label="Close product setup"><ArrowLeft className="h-5 w-5" /></button>
        <Package className="hidden h-5 w-5 shrink-0 text-green-700 sm:block" /><div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-950 sm:text-lg">{working.product_id ? 'Complete product setup' : 'Create product'}</h1><p className="truncate text-sm text-gray-500">{working.product_code ? `${working.product_code} · ` : ''}Step {step + 1} of 5: {steps[step]}</p></div>
      </div>{working.product_id && <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 sm:inline">Draft until activated</span>}</div>
      <div className="mx-auto mt-3 max-w-6xl"><div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-label={`Product setup progress: step ${step + 1} of 5`}><div className="h-full rounded-full bg-green-700 transition-all" style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
        <ol className="mt-2 hidden grid-cols-5 gap-2 text-xs md:grid">{steps.map((label, index) => <li key={label} className={index <= step ? 'font-medium text-green-800' : 'text-gray-400'}>{index + 1}. {label}</li>)}</ol></div>
    </header>

    <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-32 pt-5 sm:px-6 sm:pt-7"><div className="mx-auto w-full max-w-6xl space-y-5">
      {errors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div>{errors.map(error => <p key={error}>{error}</p>)}</div></div></div>}
      {loading ? <div className="grid min-h-64 place-items-center rounded-xl border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-green-700" aria-label="Loading product setup" /></div> : <>
            {step === 0 && <Section title="What is this product?" help="Internal product code is generated automatically after saving. No tax, price or stock defaults are assumed."><div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className={labelClass}>Product name <Required /><input autoFocus value={working.product_name} onChange={e => setWorkingField('product_name', e.target.value)} className={fieldClass} placeholder="e.g. Paracetamol 500 mg tablets" /></label>
          <label className={labelClass}>Generic display name<input value={working.generic_name} onChange={e => setWorkingField('generic_name', e.target.value)} className={fieldClass} placeholder="e.g. Paracetamol" /><Hint>Use the familiar salt or generic name operators search for.</Hint></label>
          <label className={labelClass}>Product kind <Required /><select value={working.product_kind} onChange={e => setWorkingField('product_kind', e.target.value as ProductKind)} className={fieldClass}><option value="" disabled>Select product kind</option><option value="medicine">Medicine</option><option value="medical_device">Medical device</option><option value="consumable">Consumable</option></select></label>
          {working.product_code && <div className={labelClass}>Internal product code<p className="mt-1 min-h-12 rounded-lg border border-gray-200 bg-gray-100 px-3 py-3 font-mono font-normal" aria-label="Immutable product code">{working.product_code}</p></div>}
        </div></Section>}

        {step === 1 && <Section title="Classification and tax" help="Select reviewed references. Schedule, prescription, NDPS and H2 rules are derived from composition during activation.">
          {(!options?.hsn_reference_ready || (medicine && !options?.ingredient_reference_ready)) && <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Reviewed reference data is not ready. Setup will fail closed until an operator imports it.</div>}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className={labelClass}>Manufacturer <Required /><select value={setup.manufacturer_party_id} onChange={e => setSetupField('manufacturer_party_id', e.target.value)} className={fieldClass}><option value="">Select an active supplier/manufacturer</option>{options?.manufacturers.map(row => <option key={row.manufacturer_party_id} value={row.manufacturer_party_id}>{row.legal_name} · {row.supplier_code}</option>)}</select><Hint>Missing? Create the supplier first so invoices and batches share one legal identity.</Hint></label>
            <label className={labelClass}>Category <Optional /><select value={setup.category_id} onChange={e => setSetupField('category_id', e.target.value)} className={fieldClass}><option value="">No category selected</option>{options?.categories.map(row => <option key={row.category_id} value={row.category_id}>{row.name}</option>)}</select></label>
            <div className="relative md:col-span-2"><label className={labelClass}>HSN code <Required /><div className="relative"><Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-gray-400" /><input value={hsnQuery || setup.hsn_code} onChange={e => { setHsnQuery(e.target.value); setSetupField('hsn_code', ''); }} className={`${fieldClass} pl-9`} placeholder="Search by HSN code or official description" /></div></label>
              {hsnOptions.length > 0 && <Picker>{hsnOptions.map(row => <button key={row.tax_code_version_id} type="button" onClick={() => { setSetup(current => ({ ...current, hsn_code: row.hsn_code, hsn_description: row.description, hsn_rate: row.igst_rate })); setHsnQuery(''); setHsnOptions([]); }} className="block min-h-12 w-full border-b px-3 py-3 text-left hover:bg-gray-50"><strong>{row.hsn_code} · {row.igst_rate}% GST</strong><span className="mt-1 block text-sm text-gray-600">{row.description}</span></button>)}</Picker>}
              {setup.hsn_code && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"><Check className="mr-2 inline h-4 w-4" />HSN {setup.hsn_code}{setup.hsn_rate ? ` · ${setup.hsn_rate}% GST` : ''}</p>}
            </div>
            {medicine && <><label className={labelClass}>Dosage form <Required /><input value={setup.dosage_form} onChange={e => setSetupField('dosage_form', e.target.value)} className={fieldClass} placeholder="e.g. Tablet, capsule, syrup" /></label><label className={labelClass}>Strength display <Required /><input value={setup.strength_display} onChange={e => setSetupField('strength_display', e.target.value)} className={fieldClass} placeholder="e.g. 500 mg" /></label></>}
          </div>
        </Section>}

        {step === 2 && <Section title="Units and packaging" help="Choose the smallest stock unit, then describe each marketed pack as an exact number of base units."><div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className={labelClass}>Base stock unit <Required /><select value={setup.base_uom_code} onChange={e => setSetupField('base_uom_code', e.target.value)} className={fieldClass}>{options?.units.map(row => <option key={row.code} value={row.code}>{row.name} ({row.symbol})</option>)}</select><Hint>Stock balances and line quantities resolve to this unit.</Hint></label>
          <label className={labelClass}>GTIN / barcode <Optional /><input value={setup.gtin} onChange={e => setSetupField('gtin', e.target.value.replace(/\D/g, ''))} className={fieldClass} inputMode="numeric" placeholder="8 to 14 digits" /></label>
        </div><div className="mt-7 border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Pack levels</h3><p className="text-sm text-gray-600">Example: 1 strip = 10 tablets; 1 box = 100 tablets.</p></div><button type="button" onClick={() => setSetupField('pack_conversions', [...setup.pack_conversions, { uom_code: '', multiplier: '' }])} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3"><Plus className="h-4 w-4" /> Add pack level</button></div>
          <div className="mt-4 space-y-3">{setup.pack_conversions.length === 0 ? <Empty>No additional pack level. MRP can use the base unit during goods receipt.</Empty> : setup.pack_conversions.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_44px] items-end gap-2 rounded-lg border p-3"><label className={labelClass}>Pack type<select value={row.uom_code} onChange={e => updatePack(index, { uom_code: e.target.value })} className={fieldClass}><option value="">Select</option>{options?.units.filter(unit => unit.dimension === 'count' && unit.code !== setup.base_uom_code).map(unit => <option key={unit.code} value={unit.code}>{unit.name}</option>)}</select></label><label className={labelClass}>{baseUnit?.symbol ?? setup.base_uom_code} per pack<input value={row.multiplier} onChange={e => updatePack(index, { multiplier: e.target.value })} className={fieldClass} inputMode="decimal" /></label><IconButton label={`Remove pack level ${index + 1}`} onClick={() => setSetupField('pack_conversions', setup.pack_conversions.filter((_, i) => i !== index))} /></div>)}</div>
        </div></Section>}

        {step === 3 && <div className="space-y-5"><Section title="Storage and shelf life" help="These describe the product. Actual manufacture and expiry dates are recorded per received batch."><div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <label className={labelClass}>Typical shelf life (days) <Optional /><input value={setup.shelf_life_days} onChange={e => setSetupField('shelf_life_days', e.target.value)} className={fieldClass} inputMode="numeric" placeholder="e.g. 730" /></label>
          <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border px-3"><input type="checkbox" checked={setup.cold_chain_required} onChange={e => setSetup(current => ({ ...current, cold_chain_required: e.target.checked, ...(!e.target.checked ? { minimum_storage_celsius: '', maximum_storage_celsius: '' } : {}) }))} className="h-5 w-5 accent-green-700" /> Cold-chain required</label><div />
          {setup.cold_chain_required && <><label className={labelClass}>Minimum °C <Required /><input value={setup.minimum_storage_celsius} onChange={e => setSetupField('minimum_storage_celsius', e.target.value)} className={fieldClass} inputMode="decimal" /></label><label className={labelClass}>Maximum °C <Required /><input value={setup.maximum_storage_celsius} onChange={e => setSetupField('maximum_storage_celsius', e.target.value)} className={fieldClass} inputMode="decimal" /></label></>}
        </div></Section>
          {medicine && <Section title="Reviewed composition *" help="Search the controlled ingredient release. Regulatory schedule, prescription, NDPS and H2 treatment are derived—never typed manually."><div className="relative"><label className={labelClass}>Add ingredient<div className="relative"><Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-gray-400" /><input value={ingredientQuery} onChange={e => setIngredientQuery(e.target.value)} className={`${fieldClass} pl-9`} placeholder="Search ingredient or salt/form" /></div></label>{ingredientOptions.length > 0 && <Picker>{ingredientOptions.map(option => <button key={option.ingredient_id} type="button" onClick={() => addIngredient(option)} className="block min-h-12 w-full border-b px-3 py-3 text-left hover:bg-gray-50"><strong>{option.canonical_name}{option.salt_or_form ? ` · ${option.salt_or_form}` : ''}</strong><span className="mt-1 block text-xs text-gray-600">Schedule {option.drugs_rules_schedule} · {option.ndps_classification.replace(/_/g, ' ')}</span></button>)}</Picker>}</div>
            <div className="mt-5 space-y-4">{setup.ingredients.length === 0 ? <Empty>Add at least one reviewed ingredient to activate a medicine.</Empty> : setup.ingredients.map((row, index) => <article key={row.ingredient_id} className="rounded-lg border p-3 sm:p-4"><div className="flex justify-between gap-3"><div><h3 className="font-medium">{row.canonical_name}</h3><p className="text-xs text-gray-500">Schedule {row.drugs_rules_schedule} · {row.ndps_classification.replace(/_/g, ' ')}</p></div><IconButton label={`Remove ${row.canonical_name}`} onClick={() => setSetupField('ingredients', setup.ingredients.filter((_, i) => i !== index))} /></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5"><label className={labelClass}>Role<select value={row.ingredient_role} onChange={e => updateIngredient(index, { ingredient_role: e.target.value as IngredientRow['ingredient_role'] })} className={fieldClass}><option value="active">Active</option><option value="excipient">Excipient</option></select></label>{row.ingredient_role === 'active' && <><label className={labelClass}>Strength<input value={row.strength_value} onChange={e => updateIngredient(index, { strength_value: e.target.value })} className={fieldClass} inputMode="decimal" /></label><UnitSelect label="Strength unit" value={row.strength_uom_code} onChange={value => updateIngredient(index, { strength_uom_code: value })} options={options} /><label className={labelClass}>Per quantity<input value={row.basis_quantity} onChange={e => updateIngredient(index, { basis_quantity: e.target.value })} className={fieldClass} inputMode="decimal" /></label><UnitSelect label="Basis unit" value={row.basis_uom_code} onChange={value => updateIngredient(index, { basis_uom_code: value })} options={options} /></>}</div></article>)}</div>
          </Section>}
        </div>}

        {step === 4 && <div className="space-y-5"><Section title="Review and activate" help="Activation makes this product available to purchase and sale commands."><div className="mb-4"><span className={`rounded-full px-3 py-1 text-sm font-medium ${missingFields.length === 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{missingFields.length === 0 ? 'Ready to activate' : `${missingFields.length} required item${missingFields.length === 1 ? '' : 's'} missing`}</span></div><dl className="divide-y">{reviewSections.map(([label, value]) => <div key={label} className="grid gap-1 py-4 sm:grid-cols-[160px_1fr]"><dt className="text-sm font-medium text-gray-600">{label}</dt><dd className="break-words text-sm">{value}</dd></div>)}</dl>
          {missingFields.length > 0 && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-medium">Required before activation</p><ul className="mt-2 list-inside list-disc text-sm">{missingFields.map(field => <li key={field}>{field.replace(/_/g, ' ')}</li>)}</ul></div>}
          {recommendedFields.length > 0 && <p className="mt-4 text-sm text-gray-600">Recommended to add later: {recommendedFields.map(field => field.replace(/_/g, ' ')).join(', ')}.</p>}
          {h2Applies && <label className={`${labelClass} mt-5`}>Manufacturer H2 traceability product code <Required /><input value={setup.traceability_code} onChange={e => setSetupField('traceability_code', e.target.value)} className={fieldClass} placeholder="Barcode / QR identifier from manufacturer" /></label>}
        </Section><section className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5"><h2 className="font-semibold text-blue-950">Next: receive the first batch</h2><p className="mt-1 text-sm text-blue-900">After activation, create a purchase order and goods receipt. That flow records batch number, manufacturing date, expiry date, MRP per marketed pack, purchase cost, free quantity and accepted stock.</p></section></div>}
      </>}
    </div></main>

    <footer className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] border-t bg-white/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6 md:bottom-0"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
      <button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0 || saving} className="inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 disabled:invisible"><ChevronLeft className="h-4 w-4" /> Back</button>
      {step < 4 ? <button type="button" onClick={() => void advance()} disabled={saving || loading} className="inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-lg bg-green-700 px-5 text-base font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 0 ? <Package className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{step === 0 ? 'Save & continue' : step === 3 ? 'Review setup' : 'Continue'}</button> : <button type="button" onClick={() => void activate()} disabled={saving || missingFields.length > 0} className="inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-lg bg-green-700 px-5 text-base font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Activate product</button>}
    </div></footer>
  </div>;
};

const Section: React.FC<React.PropsWithChildren<{ title: string; help: string }>> = ({ title, help, children }) => <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"><div className="mb-6"><h2 className="text-lg font-semibold text-gray-950">{title}</h2><p className="mt-1 text-sm text-gray-600">{help}</p></div>{children}</section>;
const Required = () => <span className="text-red-600">*</span>;
const Optional = () => <span className="font-normal text-gray-400">Optional</span>;
const Hint: React.FC<React.PropsWithChildren> = ({ children }) => <span className="mt-1 block text-xs font-normal text-gray-500">{children}</span>;
const Empty: React.FC<React.PropsWithChildren> = ({ children }) => <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">{children}</p>;
const Picker: React.FC<React.PropsWithChildren> = ({ children }) => <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">{children}</div>;
const IconButton = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" onClick={onClick} className="grid min-h-12 min-w-11 place-items-center rounded-lg text-red-700 hover:bg-red-50" aria-label={label}><Trash2 className="h-4 w-4" /></button>;
const UnitSelect = ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ProductSetupOptions | null }) => <label className={labelClass}>{label}<select value={value} onChange={event => onChange(event.target.value)} className={fieldClass}><option value="">Select</option>{options?.units.map(unit => <option key={unit.code} value={unit.code}>{unit.symbol}</option>)}</select></label>;

export default ProductFlow;
