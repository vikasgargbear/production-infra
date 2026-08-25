import React, { useState, useEffect, useRef } from 'react';
import {
  Package, AlertCircle, TrendingUp, TrendingDown, Settings,
  Plus, X, Trash2, Upload, Download, Loader2, CheckCircle
} from 'lucide-react';
import {
  GlobalDocumentFlow, ProductSearch, BatchSelector, Select,
  NotesSection, useToast
} from '../../global';
import {
  prepareCanonicalAction,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { canonicalBusinessContextApi } from '../../../services/api/modules/org/canonicalBusinessContext.api';
import { parseStockAdjustmentCsv, type StockAdjustmentCsvResult } from './utils/stockAdjustmentCsv';
import { clientUuid } from '../../../utils/clientUuid';
import { formatCalendarDate, requireCalendarDate } from '../../../utils/calendarDate';
import {
  buildCycleCountGainPayload,
  approveCycleCountReview,
  executeApprovedCycleCount,
  loadAndVerifyCycleCountReadback,
  loadCycleCountEligibility,
  loadCycleCountReview,
  type CycleCountEvidence,
  type CycleCountUom,
} from './utils/canonicalStockAdjustmentCommand';

type AdjustmentItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  batch_id: string;
  batch_number: string;
  branch_id: string;
  location_id: string;
  quantity_available: string;
  counted_quantity: string;
  uom_conversion_id: string;
  uom_multiplier: string;
  uom_options: CycleCountUom[];
  unit: string;
  expiry_date?: string;
};

const EnhancedStockAdjustmentFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Refs
  const productSearchRef = useRef(null);
  const prepareIdentityRef = useRef(clientUuid());

  // Adjustment data state
  const [adjustmentData, setAdjustmentData] = useState<{
    adjustment_type: string;
    reason: string;
    adjustment_date: string;
    notes: string;
    items: AdjustmentItem[];
  }>({
    adjustment_type: 'increase',
    reason: 'cycle_count',
    adjustment_date: '',
    notes: '',
    items: []
  });

  const [evidenceOptions, setEvidenceOptions] = useState<CycleCountEvidence[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [countedByMembershipId, setCountedByMembershipId] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [csvPreview, setCsvPreview] = useState<StockAdjustmentCsvResult | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showBatchSelector, setShowBatchSelector] = useState(false);

  // Canonical command state: prepare → confirm modal → execute
  const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committedRef, setCommittedRef] = useState<string | null>(null);
  const [awaitingIndependentApproval, setAwaitingIndependentApproval] = useState(false);
  const [reviewCommandId, setReviewCommandId] = useState('');
  const [reviewPreview, setReviewPreview] = useState<CanonicalCommandPreview | null>(null);

  // The organization clock, not the browser clock, owns the command business date.
  useEffect(() => {
    let active = true;
    canonicalBusinessContextApi.get()
      .then(context => {
        if (!active) return;
        setAdjustmentData(prev => ({ ...prev, adjustment_date: context.business_date }));
      })
      .catch((cause: any) => {
        if (!active) return;
        setError(cause?.message || 'Could not load the organization business date.');
      });
    return () => { active = false; };
  }, []);

  // Auto-open product search when both adjustment type and reason are selected
  useEffect(() => {
    if (adjustmentData.adjustment_type && adjustmentData.reason && adjustmentData.adjustment_date
        && !adjustmentData.items.length && !showBulkUpload) {
      setShowProductSearch(true);
    }
  }, [adjustmentData.adjustment_type, adjustmentData.reason, adjustmentData.adjustment_date,
    adjustmentData.items.length, showBulkUpload]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'u':
            e.preventDefault();
            toast.info('CSV posting is unavailable until every row can be resolved by the canonical eligibility API.');
            break;
          case 'a':
            e.preventDefault();
            if (adjustmentData.adjustment_type && adjustmentData.reason && adjustmentData.adjustment_date) {
              setShowProductSearch(true);
              setShowBulkUpload(false);
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 1) {
              handleProceedToReview();
            }
            break;
        }
      }

      // ESC key handling with stopPropagation
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showConfirmModal) {
          setShowConfirmModal(false);
        } else if (showBatchSelector) {
          setShowBatchSelector(false);
          setSelectedProduct(null);
        } else if (showProductSearch) {
          setShowProductSearch(false);
        } else if (showBulkUpload) {
          setShowBulkUpload(false);
        } else if (currentStep === 2) {
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showProductSearch, showBulkUpload, showBatchSelector, showConfirmModal,
    adjustmentData.adjustment_type, adjustmentData.reason, adjustmentData.adjustment_date, onClose]);

  // Step 1: Product selection - just store the product and show batch selector
  const handleProductSelect = (product) => {
    if (!product) return;

    // Check if product already added
    if ((adjustmentData.items || []).find(item => item.product_id === product.product_id)) {
      toast.error('Product already added to adjustment list');
      return;
    }

    setSelectedProduct(product);
    setShowProductSearch(false);
    setShowBatchSelector(true);
  };

  // Resolve the server-owned membership, evidence, location, stock, and UOM facts.
  const handleBatchSelect = async (batch) => {
    if (!batch || !selectedProduct) return;
    if (!adjustmentData.adjustment_date) {
      toast.error('Wait for the organization business date before selecting stock.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const eligibility = await loadCycleCountEligibility({
        branchId: String(batch.branch_id || ''),
        locationId: String(batch.location_id || ''),
        batchId: String(batch.batch_id || ''),
        adjustmentDate: adjustmentData.adjustment_date,
      });
      const existing = adjustmentData.items[0];
      if (existing && (
        existing.branch_id !== eligibility.branch_id
        || existing.location_id !== eligibility.location_id
      )) {
        throw new Error('One cycle count can cover only one branch and saleable location.');
      }
      if (countedByMembershipId && countedByMembershipId !== eligibility.counted_by_membership_id) {
        throw new Error('Cycle-count authority changed. Refresh and start the count again.');
      }
      const availableEvidence = evidenceOptions.length === 0
        ? eligibility.evidence
        : evidenceOptions.filter(current => eligibility.evidence.some(
          candidate => candidate.evidence_attachment_id === current.evidence_attachment_id,
        ));
      if (availableEvidence.length === 0) {
        throw new Error('The selected batches do not share one unused verified cycle-count sheet.');
      }
      const newItem: AdjustmentItem = {
        id: `${eligibility.product_id}:${eligibility.batch_id}`,
        product_id: eligibility.product_id,
        product_name: selectedProduct.product_name || selectedProduct.name,
        product_code: selectedProduct.product_code || selectedProduct.code,
        batch_id: eligibility.batch_id,
        batch_number: batch.batch_number,
        branch_id: eligibility.branch_id,
        location_id: eligibility.location_id,
        quantity_available: eligibility.system_base_quantity,
        counted_quantity: '',
        uom_conversion_id: '',
        uom_multiplier: '',
        uom_options: eligibility.uom_conversions,
        unit: '',
        expiry_date: batch.expiry_date,
      };
      setAdjustmentData(prev => ({ ...prev, items: [...prev.items, newItem] }));
      setEvidenceOptions(availableEvidence);
      setSelectedEvidenceId(current => (
        availableEvidence.some(item => item.evidence_attachment_id === current)
          ? current
          : ''
      ));
      setCountedByMembershipId(eligibility.counted_by_membership_id);
      setSelectedProduct(null);
      setShowBatchSelector(false);
      toast.info(`Added ${newItem.product_name}. Select the count UOM and verified evidence, then enter the exact physical count.`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message
        || 'This batch is not eligible for a canonical cycle count.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const updateItemQuantity = (itemId: string, quantity: string) => {
    setAdjustmentData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          return { ...item, counted_quantity: quantity };
        }
        return item;
      })
    }));
  };

  const updateItemUom = (itemId: string, uomConversionId: string) => {
    setAdjustmentData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        const uom = item.uom_options.find(option => option.uom_conversion_id === uomConversionId);
        return uom ? {
          ...item,
          uom_conversion_id: uom.uom_conversion_id,
          uom_multiplier: uom.multiplier,
          unit: uom.from_uom_code,
          counted_quantity: '',
        } : item;
      }),
    }));
  };

  const handleRemoveItem = (itemId: any) => {
    setAdjustmentData(prev => {
      const items = prev.items.filter(item => item.id !== itemId);
      if (items.length === 0) {
        setEvidenceOptions([]);
        setSelectedEvidenceId('');
        setCountedByMembershipId('');
      }
      return { ...prev, items };
    });
  };

  const downloadTemplate = () => {
    const csvContent = 'product_id,batch_id,product_name,adjustment_quantity,reason,product_code,current_stock,notes\n';

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_adjustment_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      setCsvPreview(parseStockAdjustmentCsv(text));
    };
    reader.onerror = () => setCsvPreview({
      rows: [],
      errors: ['The selected CSV could not be read.'],
      adjustmentType: null,
      reason: null,
    });

    reader.readAsText(file);
    e.target.value = '';
  };

  const validateAdjustment = () => {
    if (!adjustmentData.adjustment_date) {
      toast.error('The organization business date is unavailable.');
      return false;
    }
    if (adjustmentData.items.length === 0) {
      toast.error('Please add at least one product');
      return false;
    }
    if (!countedByMembershipId || !selectedEvidenceId) {
      toast.error('A live verified cycle-count membership and evidence sheet are required.');
      return false;
    }
    if (adjustmentData.items.some(item => !item.uom_conversion_id || !item.counted_quantity)) {
      toast.error('Select a count UOM and enter the exact physical count for every selected batch.');
      return false;
    }
    return true;
  };

  const isAdjustmentValid = () => Boolean(
    Boolean(adjustmentData.adjustment_date)
    && adjustmentData.items.length > 0
    && Boolean(countedByMembershipId)
    && Boolean(selectedEvidenceId)
    && adjustmentData.items.every(item => Boolean(item.uom_conversion_id) && Boolean(item.counted_quantity))
  );

  const handleProceedToReview = () => {
    if (validateAdjustment()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Step 1: Prepare the canonical command — does NOT mutate any data yet.
  const handlePrepare = async () => {
    if (!validateAdjustment()) return;
    setIsPreparing(true);
    setError(null);
    try {
      const countedAt = new Date().toISOString();
      const payload = buildCycleCountGainPayload({
        idempotencyKey: `erp-web-inventory-adjustment-prepare:${prepareIdentityRef.current}`,
        adjustmentDate: adjustmentData.adjustment_date,
        countedAt,
        countedByMembershipId,
        evidenceAttachmentId: selectedEvidenceId,
        items: adjustmentData.items.map(item => ({
          productId: item.product_id,
          batchId: item.batch_id,
          branchId: item.branch_id,
          locationId: item.location_id,
          uomConversionId: item.uom_conversion_id,
          uomMultiplier: item.uom_multiplier,
          countedQuantity: item.counted_quantity,
          systemBaseQuantity: item.quantity_available,
        })),
      });
      const prepared = await prepareCanonicalAction('inventory.adjustment.prepare', payload);
      setPreparedPreview(prepared.data);
      setShowConfirmModal(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Failed to prepare adjustment. No data was changed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSubmitForApproval = () => {
    if (!preparedPreview) return;
    setAwaitingIndependentApproval(true);
    setShowConfirmModal(false);
    toast.info(`Command ${preparedPreview.command_request_id} awaits approval by a different authorized user.`);
  };

  // Execution remains requester-owned and succeeds only after a distinct user approves.
  const handleExecute = async () => {
    if (!preparedPreview) return;
    setIsCommitting(true);
    setError(null);
    try {
      const executed = await executeApprovedCycleCount(
        preparedPreview,
      );
      const readback = await loadAndVerifyCycleCountReadback(preparedPreview, executed);
      const ref = String(readback.inventory_document_id);
      setCommittedRef(ref);
      setShowConfirmModal(false);
      toast.success(`Stock adjustment ${ref} posted and reconciled successfully`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Adjustment execution failed. Check server status before retrying.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleLoadIndependentReview = async () => {
    setIsPreparing(true);
    setError(null);
    try {
      setReviewPreview(await loadCycleCountReview(reviewCommandId.trim()));
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Cycle-count review is unavailable.';
      setReviewPreview(null);
      setError(msg);
      toast.error(msg);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleApproveIndependentReview = async () => {
    if (!reviewPreview) return;
    setIsCommitting(true);
    setError(null);
    try {
      await approveCycleCountReview(reviewPreview);
      toast.success(`Cycle-count command ${reviewPreview.command_request_id} approved. The requester can now execute it.`);
      setReviewPreview(null);
      setReviewCommandId('');
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Independent approval failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  // Create content for step 1
  const createContent = (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Processing...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <div className="text-center max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="cycle-count-review-heading">
        <h3 id="cycle-count-review-heading" className="font-semibold text-gray-900">Independent cycle-count approval</h3>
        <p className="mt-1 text-sm text-gray-600">
          A different authorized user must review the immutable stock and valuation preview. Paste the command UUID supplied by the requester.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={reviewCommandId}
            onChange={(event) => setReviewCommandId(event.target.value)}
            placeholder="Canonical command UUID"
            aria-label="Cycle-count command UUID to review"
            className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleLoadIndependentReview}
            disabled={!reviewCommandId.trim() || isPreparing}
            className="min-h-11 rounded-lg border border-blue-600 bg-white px-4 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load immutable preview
          </button>
        </div>
        {reviewPreview && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-mono text-xs text-gray-700">{reviewPreview.command_request_id}</p>
            <p className="mt-2 text-sm text-gray-800">
              {Array.isArray(reviewPreview.inventory_impact) ? reviewPreview.inventory_impact.length : 0} stock line(s);{' '}
              {Array.isArray(reviewPreview.financial_impact) ? reviewPreview.financial_impact.length : 0} valuation entry.
            </p>
            {Array.isArray(reviewPreview.inventory_impact) && (
              <div className="mt-3 overflow-x-auto rounded border border-amber-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-2 py-2">Product / batch</th>
                      <th className="px-2 py-2 text-right">System</th>
                      <th className="px-2 py-2 text-right">Counted</th>
                      <th className="px-2 py-2 text-right">Gain</th>
                      <th className="px-2 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewPreview.inventory_impact as Array<Record<string, unknown>>).map((impact, index) => (
                      <tr key={`${String(impact.batch_id)}-${index}`} className="border-t border-gray-100">
                        <td className="px-2 py-2 font-mono">
                          {String(impact.product_id)}<br />{String(impact.batch_id)}
                        </td>
                        <td className="px-2 py-2 text-right">{String(impact.system_base_quantity)}</td>
                        <td className="px-2 py-2 text-right">{String(impact.counted_base_quantity)}</td>
                        <td className="px-2 py-2 text-right">{String(impact.gain_base_quantity)}</td>
                        <td className="px-2 py-2 text-right">₹{String(impact.gain_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {Array.isArray(reviewPreview.financial_impact) && (reviewPreview.financial_impact as Array<Record<string, unknown>>).map((impact, index) => (
              <p key={index} className="mt-2 text-xs text-gray-700">
                Valuation: debit <span className="font-mono">{String(impact.debit_account_id)}</span>, credit{' '}
                <span className="font-mono">{String(impact.credit_account_id)}</span>, amount ₹{String(impact.amount)}.
              </p>
            ))}
            <p className="mt-1 break-all font-mono text-xs text-gray-600">{reviewPreview.preview_hash}</p>
            <button
              type="button"
              onClick={handleApproveIndependentReview}
              disabled={isCommitting}
              className="mt-3 min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Approve exact preview
            </button>
          </div>
        )}
      </section>

      {/* Type & Details Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <Settings className="w-5 h-5 mr-2 text-blue-600" />
          Adjustment Details
        </h3>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2 font-semibold">
              <TrendingUp className="h-5 w-5" />
              Verified cycle-count gain
            </div>
            <p className="mt-1">
              Only a same-day physical count above system stock is supported. Shortages, damage,
              expiry, transfer, opening stock, returns, samples, and reversals use separate canonical workflows.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Organization business date</label>
              <div className="flex min-h-11 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 font-mono text-sm text-gray-800">
                {adjustmentData.adjustment_date || 'Loading…'}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Verified physical count sheet</label>
              <Select
                value={selectedEvidenceId}
                onChange={(value) => setSelectedEvidenceId(String(value || ''))}
                disabled={evidenceOptions.length === 0}
                options={[
                  { value: '', label: evidenceOptions.length === 0 ? 'Select an eligible batch first' : 'Select verified evidence...' },
                  ...evidenceOptions.map(item => ({
                    value: item.evidence_attachment_id,
                    label: `${item.status} · ${item.document_date} · ${item.evidence_attachment_id.slice(0, 8)}`,
                  })),
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Upload Section */}
      {showBulkUpload && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Upload className="w-5 h-5 mr-2 text-purple-600" />
              Bulk Upload
            </h3>
            <button
              onClick={() => setShowBulkUpload(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close bulk upload"
              title="Close bulk upload"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleBulkUpload}
                className="hidden"
                id="bulk-upload-adjustment"
              />
              <label
                htmlFor="bulk-upload-adjustment"
                className="cursor-pointer"
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">
                  Drop CSV file here or <span className="text-blue-600 font-medium">browse</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  File parsing is preview-only; posting stays disabled until every row is resolved by the live eligibility API
                </p>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={downloadTemplate}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">Download Template</span>
              </button>

              <div className="text-xs text-gray-500">
                <span className="font-medium">Required:</span> product_id, batch_id, product_name, adjustment_quantity, reason
              </div>
            </div>

            {csvPreview && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">CSV validation preview</p>
                    <p className="text-sm text-gray-600">
                      {csvPreview.rows.length} valid row{csvPreview.rows.length === 1 ? '' : 's'}; no inventory data has been changed.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="CSV rows cannot post until canonical batch, location, UOM, membership, and evidence resolution is implemented"
                    className="inline-flex min-h-11 cursor-not-allowed items-center rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                  >
                    Server resolution required
                  </button>
                </div>

                {csvPreview.errors.length > 0 && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                    <p className="text-sm font-medium text-red-800">Fix these CSV errors</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-700">
                      {csvPreview.errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                    </ul>
                  </div>
                )}

                {csvPreview.rows.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-md border border-gray-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Batch UUID</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvPreview.rows.map((row, index) => (
                          <tr key={`${row.productId}-${row.batchId}-${index}`}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{row.productName}</div>
                              <div className="font-mono text-xs text-gray-500">{row.productId}</div>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.batchId}</td>
                            <td className="px-3 py-2 text-right font-medium">{row.adjustmentQuantity}</td>
                            <td className="px-3 py-2">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Selection Section */}
      {adjustmentData.adjustment_type && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Package className="w-5 h-5 mr-2 text-blue-600" />
              Products to Adjust
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowProductSearch(true);
                  setShowBulkUpload(false);
                }}
                disabled={!adjustmentData.reason || !adjustmentData.adjustment_date}
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
              <button
                disabled
                title="CSV posting requires server resolution of every batch, location, UOM, membership, and evidence identity"
                className="flex min-h-[44px] cursor-not-allowed items-center space-x-2 rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-500"
              >
                <Upload className="w-4 h-4" />
                <span>Bulk Upload</span>
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

            {/* Product Search Modal */}
            {showProductSearch && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Search Product</h4>
                  <button
                    onClick={() => setShowProductSearch(false)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close product search"
                    title="Close product search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ProductSearch
                  onAddItem={handleProductSelect}
                  onCreateProduct={(searchQuery) => {
                    // Handle product creation if needed
                  }}
                  showBatchSelection={false}
                  placeholder="Search and select product..."
                  ref={productSearchRef}
                />
              </div>
            )}

            {/* Batch Selection Modal Popup - More Compact */}
            {showBatchSelector && selectedProduct && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => {
                    setShowBatchSelector(false);
                    setSelectedProduct(null);
                  }}
                />

                {/* Modal - Compact and efficient */}
                <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
                  {/* Compact Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <Package className="h-5 w-5 text-blue-600" />
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Select Batch for {selectedProduct?.product_name}</h3>
                        <p className="text-xs text-gray-500">Choose a batch - quantity can be edited after selection</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowBatchSelector(false);
                        setSelectedProduct(null);
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                      aria-label="Close batch selector"
                      title="Close batch selector"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {/* Body - Minimal padding, maximum content */}
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                    <BatchSelector
                      show={true}
                      mode="inline"
                      product={selectedProduct}
                      onBatchSelect={handleBatchSelect}
                      onClose={() => {
                        setShowBatchSelector(false);
                        setSelectedProduct(null);
                      }}
                      showExpiryStatus={true}
                      filterExpired={true}
                      maxHeight="none"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Selected Products Table */}
            {adjustmentData.items.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">System Stock (base)</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Count UOM</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Physical Count</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {adjustmentData.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div>
                              <div className="font-medium text-gray-900">{item.product_name}</div>
                              <div className="text-sm text-gray-500">{item.product_code}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div>
                              <div className="font-medium">{item.batch_number || 'Batch identity unavailable'}</div>
                              {item.expiry_date && (
                                <div className="text-xs text-gray-500">Exp: {formatCalendarDate(requireCalendarDate(item.expiry_date, 'Batch expiry date'))}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">{item.quantity_available === null ? '—' : item.quantity_available}</td>
                          <td className="px-4 py-3 text-center">
                            <select
                              value={item.uom_conversion_id}
                              onChange={(event) => updateItemUom(item.id, event.target.value)}
                              className="min-h-11 rounded border border-gray-300 bg-white px-2 text-sm"
                              aria-label={`Count UOM for ${item.product_name}`}
                            >
                              <option value="">Select count UOM</option>
                              {item.uom_options.map(option => (
                                <option key={option.uom_conversion_id} value={option.uom_conversion_id}>
                                  {option.from_uom_code} (×{String(option.multiplier)} {option.to_uom_code})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.counted_quantity}
                              onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                              placeholder="0.000000"
                              aria-label={`Exact physical count in ${item.unit} for ${item.product_name}`}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="mt-1 text-xs text-gray-500">{item.unit}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                              aria-label={`Remove ${item.product_name}`}
                              title={`Remove ${item.product_name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No products added yet</p>
                <p className="text-sm mt-1">Click "Add Product" to start</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Review content for step 2
  const reviewContent = (
    <div className="space-y-6">
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Could not prepare adjustment</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {committedRef && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Adjustment posted</p>
              <p className="text-sm text-green-700 mt-1">
                Stock adjustment <strong>{committedRef}</strong> has been committed to inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Canonical Confirm Modal */}
      {showConfirmModal && preparedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjustment-confirm-title"
        >
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => !isCommitting && setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <h3 id="adjustment-confirm-title" className="text-lg font-semibold text-gray-900">Confirm Stock Adjustment</h3>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              You are about to post a verified <strong>cycle-count gain</strong>
              for <strong>{adjustmentData.items.length}</strong> product(s) on{' '}
              <strong>{adjustmentData.adjustment_date}</strong>.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Command ID: <span className="font-mono">{preparedPreview.command_request_id}</span>
            </p>
            {Array.isArray(preparedPreview.inventory_impact) && (
              <div className="mb-4 max-h-44 overflow-auto rounded border border-gray-200">
                {(preparedPreview.inventory_impact as Array<Record<string, unknown>>).map((impact, index) => (
                  <div key={`${String(impact.batch_id)}-${index}`} className="border-b border-gray-100 p-2 text-xs last:border-b-0">
                    <span className="font-mono">{String(impact.batch_id)}</span>: {String(impact.system_base_quantity)} →{' '}
                    {String(impact.counted_base_quantity)} base units; gain {String(impact.gain_base_quantity)}; value ₹{String(impact.gain_value)}
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-6">
              {awaitingIndependentApproval
                ? 'Execute only after a different authorized user approved this exact hash. Execution permanently posts stock and its valuation journal.'
                : 'Submitting preserves this exact preview for a different authorized user. It does not post stock.'}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isCommitting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={awaitingIndependentApproval ? handleExecute : handleSubmitForApproval}
                disabled={isCommitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{awaitingIndependentApproval ? 'Executing...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <span>{awaitingIndependentApproval ? 'Execute Approved Count' : 'Submit for Independent Approval'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Adjustment Summary</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Type</p>
            <p className="font-medium flex items-center space-x-2">
              {adjustmentData.adjustment_type === 'increase' ? (
                <>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Stock Increase</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-red-600">Stock Decrease</span>
                </>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Reason</p>
            <p className="font-medium">Verified physical cycle count</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Date</p>
            <p className="font-medium">{adjustmentData.adjustment_date}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Items</p>
            <p className="font-medium">{adjustmentData.items.length} products</p>
          </div>
        </div>

        {/* Products Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">System (base)</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Count UOM</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Physical Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {adjustmentData.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    <div className="text-sm text-gray-500">{item.product_code}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                        <div className="font-medium">{item.batch_number || 'Batch identity unavailable'}</div>
                    {item.expiry_date && (
                      <div className="text-xs text-gray-500">Exp: {formatCalendarDate(requireCalendarDate(item.expiry_date, 'Batch expiry date'))}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{item.quantity_available === null ? '—' : item.quantity_available}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium">{item.unit} × {String(item.uom_multiplier)}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.counted_quantity} {item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <NotesSection
          value={adjustmentData.notes}
          onChange={(value) => setAdjustmentData(prev => ({
            ...prev,
            notes: value
          }))}
          placeholder="Add any additional notes about this adjustment..."
          label="Additional Notes"
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <GlobalDocumentFlow
      documentType="stock-adjustment"
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      createContent={createContent}
      reviewContent={reviewContent}
      onClose={onClose}
      canProceedToReview={isAdjustmentValid}
      keyboardShortcuts={{
        1: [
          { key: 'Ctrl+A', action: 'Add Product' },
          { key: 'Ctrl+U', action: 'Bulk Upload' },
          { key: 'Esc', action: 'Close' }
        ],
        2: [
          { key: 'Esc', action: 'Back' }
        ]
      }}
      onSave={committedRef ? undefined : awaitingIndependentApproval
        ? () => setShowConfirmModal(true)
        : handlePrepare}
      isSaving={isPreparing || isCommitting}
      saveDisabled={awaitingIndependentApproval}
      saveLabel={committedRef
        ? 'Adjustment Posted'
        : awaitingIndependentApproval ? 'Execute Approved Count' : 'Prepare Cycle Count'}
      footerTotals={{ itemCount: adjustmentData.items.length }}
      additionalActions={[]}
    />
  );
};

export default EnhancedStockAdjustmentFlow;
