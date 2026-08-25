import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle, Loader2, Package, X } from 'lucide-react';

import useDialogFocus from '../../../hooks/useDialogFocus';
import {
  approveCanonicalAction,
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  getCanonicalCommandStatus,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../../services/api/canonicalOperatorActions';
import {
  inventoryTransfersApi,
  type EligibleTransferBatch,
} from '../../../services/api/modules/inventory/inventoryTransfers.api';
import {
  canonicalInventoryReadsApi,
  type InventoryBranch,
  type InventoryContext,
} from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import {
  addExactDecimals,
  compareExactDecimals,
  formatExactDecimal,
  normalizeExactDecimal,
} from '../../../utils/exactDecimal';
import { clientUuid } from '../../../utils/clientUuid';
import { GlobalDocumentFlow, ProductSearch, useToast } from '../../global';
import {
  normalizeEligibleTransferBatches,
  proposeFefoAllocations,
  validateTransferQuantity,
} from './utils/stockTransferExact';
import { decodeInventoryContext } from './utils/canonicalStockReads';
import {
  destinationTransferLocationAvailability,
  governedTransferLocationAvailability,
  unavailableTransferLocationLabel,
} from './utils/stockTransferLocations';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const exactQuantity = (value: unknown, label: string) => normalizeExactDecimal(value, label, quantityOptions);

interface TransferItem {
  productId: string;
  productName: string;
  productCode: string;
  uomConversionId: string;
  selectedUomCode: string;
  requestedQuantity: string;
  allocations: Array<{ batch: EligibleTransferBatch; enteredQuantity: string }>;
}

const StockTransfer = ({ open = true, onClose }: { open?: boolean; onClose: () => void }) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [transferDate, setTransferDate] = useState('');
  const [transferLogisticsModes, setTransferLogisticsModes] = useState<
    InventoryContext['transfer_logistics_modes']
  >([]);
  const [distanceKm, setDistanceKm] = useState('');
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchChoices, setBatchChoices] = useState<EligibleTransferBatch[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [requestedQuantity, setRequestedQuantity] = useState('');
  const [draftBatchQuantities, setDraftBatchQuantities] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [executeAttempted, setExecuteAttempted] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmTriggerRef = useRef<HTMLButtonElement>(null);
  const prepareKeyRef = useRef(`erp-web-inventory-transfer-prepare:${clientUuid()}`);
  const lifecycleIdRef = useRef(clientUuid());
  const confirmDialogRef = useDialogFocus<HTMLDivElement>(confirmOpen, confirmTriggerRef);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setContextLoading(true);
    setContextError(null);
    canonicalInventoryReadsApi.context()
      .then(({ data }) => {
        if (!active) return;
        const context = decodeInventoryContext(data);
        setBranches(context.branches);
        setTransferDate(context.business_date);
        setTransferLogisticsModes(context.transfer_logistics_modes);
      })
      .catch((reason) => {
        if (active) setContextError(reason?.response?.data?.detail || reason?.message || 'Transfer context failed to load.');
      })
      .finally(() => { if (active) setContextLoading(false); });
    return () => { active = false; };
  }, [open]);

  const sourceBranch = branches.find((branch) => branch.branch_id === sourceBranchId);
  const destinationBranch = branches.find((branch) => branch.branch_id === destinationBranchId);
  const sourceLocation = sourceBranch?.locations.find((location) => location.location_id === sourceLocationId);
  const destinationLocation = destinationBranch?.locations.find((location) => location.location_id === destinationLocationId);
  const sourceAvailability = sourceLocation
    ? governedTransferLocationAvailability(sourceLocation)
    : null;
  const destinationAvailability = destinationLocation
    ? destinationTransferLocationAvailability(destinationLocation, sourceLocation)
    : null;
  const sourceBranchHasEligibleLocation = (branch: InventoryBranch) => branch.locations.some(
    (location) => governedTransferLocationAvailability(location).eligible,
  );
  const destinationBranchHasEligibleLocation = (branch: InventoryBranch) => branch.locations.some(
    (location) => destinationTransferLocationAvailability(location, sourceLocation).eligible,
  );
  const unavailableSourceLocations = (sourceBranch?.locations || []).flatMap((location) => {
    const availability = governedTransferLocationAvailability(location);
    return availability.eligible ? [] : [{ location, availability }];
  });
  const unavailableDestinationLocations = (destinationBranch?.locations || []).flatMap((location) => {
    const availability = destinationTransferLocationAvailability(location, sourceLocation);
    return availability.eligible ? [] : [{ location, availability }];
  });

  const invalidatePreparedReview = () => {
    setPrepared(null);
    setConfirmOpen(false);
    setExecuteAttempted(false);
    setPostedId(null);
    prepareKeyRef.current = `erp-web-inventory-transfer-prepare:${clientUuid()}`;
    lifecycleIdRef.current = clientUuid();
  };

  const resetLines = () => {
    setItems([]);
    setSelectedProduct(null);
    setBatchChoices([]);
    setRequestedQuantity('');
    setDraftBatchQuantities({});
    invalidatePreparedReview();
  };

  const handleProduct = async (product: any) => {
    const productId = product?.product_id;
    const conversionId = product?.uom_conversion_id;
    if (!productId || !conversionId) return toast.error('This product has no canonical base-UOM conversion.');
    if (typeof product?.product_name !== 'string' || !product.product_name.trim()
      || typeof product?.product_code !== 'string' || !product.product_code.trim()) {
      return toast.error('This product is missing its canonical name or product code.');
    }
    if (!sourceAvailability?.eligible || !destinationAvailability?.eligible
      || sourceBranchId === destinationBranchId) {
      return toast.error('Select distinct branches and governed transfer-eligible locations first.');
    }
    if (items.some((item) => item.productId === productId)) return toast.error('That product is already included.');
    setBatchLoading(true);
    setError(null);
    try {
      const { data } = await inventoryTransfersApi.eligibleBatches({
        source_branch_id: sourceBranchId,
        source_location_id: sourceLocationId,
        destination_branch_id: destinationBranchId,
        destination_location_id: destinationLocationId,
        product_id: productId,
        uom_conversion_id: conversionId,
        transfer_date: transferDate,
      });
      const choices = normalizeEligibleTransferBatches(data);
      if (!choices.length) throw new Error('No released, nonexpired FEFO stock is eligible.');
      if (choices.some((batch) => batch.expires_on !== choices[0].expires_on)) {
        throw new Error('Server returned a batch outside the earliest-expiry FEFO tier.');
      }
      setSelectedProduct(product);
      setBatchChoices(choices);
      setRequestedQuantity('');
      setDraftBatchQuantities({});
    } catch (reason: any) {
      const message = reason?.response?.data?.detail || reason?.message || 'Eligible batches failed to load.';
      setError(String(message)); toast.error(String(message));
    } finally { setBatchLoading(false); }
  };

  const proposeAllocation = () => {
    try {
      const proposal = proposeFefoAllocations(requestedQuantity, batchChoices);
      setDraftBatchQuantities(Object.fromEntries(
        proposal.map((allocation) => [allocation.batch_id, allocation.entered_quantity]),
      ));
      setError(null);
    } catch (reason: any) {
      const message = reason?.message || 'Enter a positive requested quantity within the eligible FEFO tier.';
      setError(message); toast.error(message);
    }
  };

  const addProductAllocation = () => {
    if (!selectedProduct || !batchChoices.length) return;
    try {
      const normalizedRequested = normalizeExactDecimal(
        requestedQuantity,
        `${selectedProduct.product_name} requested quantity`,
        quantityOptions,
      );
      if (compareExactDecimals(normalizedRequested, '0', 'Requested quantity', quantityOptions) <= 0) {
        throw new Error('Requested transfer quantity must be positive.');
      }
      const allocations = batchChoices.flatMap((batch) => {
        const draft = draftBatchQuantities[batch.batch_id]?.trim();
        if (!draft || compareExactDecimals(draft, '0', 'Batch allocation', quantityOptions) === 0) return [];
        return [{
          batch,
          enteredQuantity: validateTransferQuantity(
            draft,
            batch.available_selected_quantity,
            `Batch ${batch.batch_number} allocation`,
          ),
        }];
      });
      if (!allocations.length) throw new Error('Allocate the requested quantity to at least one eligible batch.');
      const allocatedTotal = addExactDecimals(
        allocations.map((allocation) => allocation.enteredQuantity),
        'Allocated transfer quantity',
        quantityOptions,
      );
      if (compareExactDecimals(allocatedTotal, normalizedRequested, 'Requested and allocated quantities', quantityOptions) !== 0) {
        throw new Error('Batch allocations must exactly equal the requested transfer quantity.');
      }
      setItems((current) => [...current, {
        productId: selectedProduct.product_id,
        productName: selectedProduct.product_name,
        productCode: selectedProduct.product_code,
        uomConversionId: batchChoices[0].uom_conversion_id,
        selectedUomCode: batchChoices[0].selected_uom_code,
        requestedQuantity: normalizedRequested,
        allocations,
      }]);
      invalidatePreparedReview();
      setSelectedProduct(null);
      setBatchChoices([]);
      setRequestedQuantity('');
      setDraftBatchQuantities({});
      setError(null);
    } catch (reason: any) {
      const message = reason?.message || 'Batch allocation is invalid.';
      setError(message); toast.error(message);
    }
  };

  const validate = useCallback((showFeedback = true) => {
    let message = '';
    if (!sourceBranchId || !destinationBranchId) message = 'Select distinct source and destination branches.';
    else if (sourceBranchId === destinationBranchId) message = 'Source and destination branches must be different.';
    else if (!sourceLocationId || !destinationLocationId) message = 'Select one location under each branch.';
    else if (!sourceLocation || !sourceAvailability?.eligible) message = 'Source location is not governed as transfer eligible.';
    else if (!destinationLocation || !destinationAvailability?.eligible) {
      message = destinationAvailability?.reasons.join('; ') || 'Destination location is not governed as transfer eligible.';
    }
    else if (transferLogisticsModes.length !== 1) message = 'No unambiguous server-supported transfer mode is available.';
    else if (!distanceKm.trim()) message = 'Enter the planned transfer distance in kilometres.';
    else if (!items.length) message = 'Add at least one product and FEFO batch.';
    else {
      try {
        normalizeExactDecimal(distanceKm, 'Transfer distance', { scale: 2, maximumWholeDigits: 8 });
        for (const item of items) {
          for (const allocation of item.allocations) {
            validateTransferQuantity(
              allocation.enteredQuantity,
              allocation.batch.available_selected_quantity,
              `${item.productName} batch ${allocation.batch.batch_number}`,
            );
          }
          const allocated = addExactDecimals(
            item.allocations.map((allocation) => allocation.enteredQuantity),
            `${item.productName} allocations`,
            quantityOptions,
          );
          if (compareExactDecimals(allocated, item.requestedQuantity, `${item.productName} quantity`, quantityOptions) !== 0) {
            throw new Error(`${item.productName} batch allocations no longer equal its requested quantity.`);
          }
        }
      } catch (reason: any) { message = reason?.message || 'Quantity must be an exact decimal with at most six places.'; }
    }
    if (message && showFeedback) toast.error(message);
    return !message;
  }, [
    destinationAvailability, destinationBranchId, destinationLocation,
    destinationLocationId, items, sourceAvailability, sourceBranchId,
    sourceLocation, sourceLocationId, toast, distanceKm, transferLogisticsModes,
  ]);

  const handlePrepare = async () => {
    if (!validate()) return;
    setPreparing(true); setError(null);
    try {
      const { data } = await prepareCanonicalAction('inventory.transfer.prepare', {
        idempotency_key: prepareKeyRef.current,
        source_branch_id: sourceBranchId,
        destination_branch_id: destinationBranchId,
        source_location_id: sourceLocationId,
        destination_location_id: destinationLocationId,
        transfer_date: transferDate,
        lines: items.map((item) => ({
          product_id: item.productId,
          uom_conversion_id: item.uomConversionId,
          batch_allocations: item.allocations.map((allocation) => ({
            batch_id: allocation.batch.batch_id,
            entered_quantity: exactQuantity(allocation.enteredQuantity, `${item.productName} quantity`),
          })),
        })),
        logistics: {
          transport_mode: transferLogisticsModes[0].transport_mode,
          distance_km: normalizeExactDecimal(
            distanceKm,
            'Transfer distance',
            { scale: 2, maximumWholeDigits: 8 },
          ),
        },
      });
      setPrepared(data); setConfirmOpen(true);
    } catch (reason: any) {
      const message = reason?.response?.data?.detail?.message || reason?.response?.data?.detail || reason?.message || 'Transfer prepare failed. Nothing was posted.';
      setError(String(message)); toast.error(String(message));
    } finally { setPreparing(false); }
  };

  const recoverStatus = useCallback(async (commandId: string) => {
    const { data } = await getCanonicalCommandStatus(commandId);
    if (canonicalExecutionCompleted(data) && data.resource_id) {
      await inventoryTransfersApi.readback(data.resource_id);
      setPostedId(data.resource_id); setConfirmOpen(false);
      toast.success('Inter-branch stock transfer posted and verified.');
      return true;
    }
    setError(`Command status is ${data.status}. Execution was not retried.`);
    return false;
  }, [toast]);

  const commitOnce = async () => {
    if (!prepared || executeAttempted) return;
    setCommitting(true); setError(null);
    let executionStarted = false;
    try {
      await approveCanonicalAction('inventory.transfer.prepare', prepared, lifecycleIdRef.current);
      executionStarted = true;
      setExecuteAttempted(true);
      const executed = await executeApprovedCanonicalAction('inventory.transfer.prepare', prepared, lifecycleIdRef.current);
      if (!canonicalExecutionCompleted(executed.data) || !executed.data.resource_id) throw new Error(`Command status is ${executed.data.status}.`);
      await inventoryTransfersApi.readback(executed.data.resource_id);
      setPostedId(executed.data.resource_id); setConfirmOpen(false);
      toast.success('Inter-branch stock transfer posted and verified.');
    } catch (reason: any) {
      if (executionStarted) {
        try { if (await recoverStatus(prepared.command_request_id)) return; } catch { /* GET-only recovery failed */ }
      }
      const message = reason?.response?.data?.detail?.message || reason?.message || (executionStarted
        ? 'Execution result is unknown. Check status; do not submit again.'
        : 'Approval did not complete. Nothing was executed; retrying approval is idempotent.');
      setError(String(message)); toast.error(String(message));
    } finally { setCommitting(false); }
  };

  const routeReady = Boolean(
    sourceAvailability?.eligible
    && destinationAvailability?.eligible
    && sourceBranchId !== destinationBranchId,
  );
  const selectClass = 'mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3';
  const createContent = <div className="space-y-5">
    <section className="rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="interbranch-heading">
      <h2 id="interbranch-heading" className="text-lg font-semibold">Inter-branch Stock Transfer</h2>
      <p className="mt-1 text-sm text-gray-600">Choose two distinct branches. Each location is limited to its selected branch.</p>
      {contextError && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contextError}</p>}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto_1fr_1fr] md:items-end">
        <label className="text-sm font-medium">Source branch
          <select aria-label="Source branch" className={selectClass} value={sourceBranchId} disabled={contextLoading} onChange={(event) => { setSourceBranchId(event.target.value); setSourceLocationId(''); resetLines(); }}>
            <option value="">Select branch</option>
            {branches.map((branch) => {
              const distinct = branch.branch_id !== destinationBranchId;
              const eligible = sourceBranchHasEligibleLocation(branch);
              return <option key={branch.branch_id} value={branch.branch_id} disabled={!distinct || !eligible}>{branch.branch_name}{!distinct ? ' — already selected as destination' : !eligible ? ' — no transfer-eligible source location' : ''}</option>;
            })}
          </select>
        </label>
        <label className="text-sm font-medium">Source location
          <select aria-label="Source location" className={selectClass} value={sourceLocationId} disabled={!sourceBranch} onChange={(event) => {
            const nextId = event.target.value;
            const nextSource = sourceBranch?.locations.find((location) => location.location_id === nextId);
            setSourceLocationId(nextId);
            setDestinationLocationId('');
            if (nextSource && destinationBranch && !destinationBranch.locations.some(
              (location) => destinationTransferLocationAvailability(location, nextSource).eligible,
            )) setDestinationBranchId('');
            resetLines();
          }}>
            <option value="">Select location</option>
            {sourceBranch?.locations.map((location) => {
              const availability = governedTransferLocationAvailability(location);
              return <option key={location.location_id} value={location.location_id} disabled={!availability.eligible}>{unavailableTransferLocationLabel(location, availability)}</option>;
            })}
          </select>
        </label>
        <ArrowRight className="mb-3 hidden h-5 w-5 text-gray-500 md:block" aria-hidden="true" />
        <label className="text-sm font-medium">Destination branch
          <select aria-label="Destination branch" className={selectClass} value={destinationBranchId} disabled={contextLoading} onChange={(event) => { setDestinationBranchId(event.target.value); setDestinationLocationId(''); resetLines(); }}>
            <option value="">Select branch</option>
            {branches.map((branch) => {
              const distinct = branch.branch_id !== sourceBranchId;
              const eligible = destinationBranchHasEligibleLocation(branch);
              return <option key={branch.branch_id} value={branch.branch_id} disabled={!distinct || !eligible}>{branch.branch_name}{!distinct ? ' — already selected as source' : !eligible ? ' — no compatible destination location' : ''}</option>;
            })}
          </select>
        </label>
        <label className="text-sm font-medium">Destination location
          <select aria-label="Destination location" className={selectClass} value={destinationLocationId} disabled={!destinationBranch || !sourceLocation} onChange={(event) => { setDestinationLocationId(event.target.value); resetLines(); }}>
            <option value="">{sourceLocation ? 'Select location' : 'Select an eligible source location first'}</option>
            {destinationBranch?.locations.map((location) => {
              const availability = destinationTransferLocationAvailability(location, sourceLocation);
              return <option key={location.location_id} value={location.location_id} disabled={!availability.eligible}>{unavailableTransferLocationLabel(location, availability)}</option>;
            })}
          </select>
        </label>
      </div>
      {(unavailableSourceLocations.length > 0 || unavailableDestinationLocations.length > 0) && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Unavailable locations are disabled by canonical inventory governance.</p>
        <ul className="mt-1 list-disc pl-5">
          {unavailableSourceLocations.map(({ location, availability }) => <li key={`source-${location.location_id}`}>Source {unavailableTransferLocationLabel(location, availability)}</li>)}
          {unavailableDestinationLocations.map(({ location, availability }) => <li key={`destination-${location.location_id}`}>Destination {unavailableTransferLocationLabel(location, availability)}</li>)}
        </ul>
      </div>}
      <p className="mt-4 text-sm text-gray-600">Transfer date: <strong>{transferDate || 'Loading…'}</strong></p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Transport mode
          <input
            aria-label="Server-supported transfer mode"
            className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-3"
            value={transferLogisticsModes.length === 1 ? transferLogisticsModes[0].display_name : ''}
            placeholder="No supported mode available"
            readOnly
          />
        </label>
        <label className="text-sm font-medium">Planned distance (km)
          <input
            aria-label="Planned transfer distance in kilometres"
            inputMode="decimal"
            className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
            value={distanceKm}
            onChange={(event) => { setDistanceKm(event.target.value); invalidatePreparedReview(); }}
            placeholder="For example, 12.50"
          />
        </label>
      </div>
    </section>
    <section className="rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="transfer-products-heading">
      <h3 id="transfer-products-heading" className="font-semibold">Products and FEFO batches</h3>
      <div className="mt-3"><ProductSearch onAddItem={handleProduct} showBatchSelection={false} enforceFefo disabled={!routeReady} placeholder={routeReady ? 'Search product to transfer…' : 'Select distinct branches and governed transfer-eligible locations first'} /></div>
      {batchLoading && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading eligible FEFO tier…</p>}
      {batchChoices.length > 0 && selectedProduct && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="font-medium">Allocate {selectedProduct.product_name}</p><p className="text-sm text-gray-600">Enter the quantity you want. FEFO proposes a split across only the equally earliest-expiry tier; you may adjust that split within this tier.</p><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Requested quantity<input aria-label={`Requested transfer quantity for ${selectedProduct.product_name}`} inputMode="decimal" className="mt-2 min-h-11 w-48 rounded-lg border border-gray-300 bg-white px-3" value={requestedQuantity} onChange={(event) => { setRequestedQuantity(event.target.value); setDraftBatchQuantities({}); }} /></label><button type="button" className="min-h-11 rounded-lg border border-blue-300 bg-white px-4 text-sm font-medium text-blue-700" onClick={proposeAllocation}>Propose FEFO allocation</button></div><div className="mt-4 grid gap-3">{batchChoices.map((batch) => <label key={batch.batch_id} data-testid={`transfer-fefo-batch-${batch.batch_id}`} className="grid gap-2 rounded-lg border border-gray-300 bg-white p-3 text-sm md:grid-cols-[1fr_auto] md:items-center"><span><strong>{batch.batch_number}</strong> · expires {batch.expires_on} · available {formatExactDecimal(batch.available_selected_quantity, 'Available quantity', quantityOptions)} {batch.selected_uom_code}{batch.is_default ? ' · FEFO default' : ''}</span><input aria-label={`Allocation for batch ${batch.batch_number}`} inputMode="decimal" className="min-h-11 w-full rounded-lg border px-3 md:w-40" value={draftBatchQuantities[batch.batch_id] || ''} onChange={(event) => setDraftBatchQuantities((current) => ({ ...current, [batch.batch_id]: event.target.value }))} /></label>)}</div><div className="mt-4 flex justify-end"><button type="button" className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white" onClick={addProductAllocation}>Add product allocation</button></div></div>}
      {items.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500"><Package className="mx-auto mb-2 h-8 w-8" />No transfer lines yet.</div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-gray-50 text-left text-gray-600"><th className="p-3">Product</th><th className="p-3">FEFO batch allocation</th><th className="p-3">Requested quantity</th><th className="p-3">Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.productId} className="border-b"><td className="p-3"><strong>{item.productName}</strong><br /><span className="text-gray-500">{item.productCode}</span></td><td className="p-3"><ul className="space-y-1">{item.allocations.map((allocation) => <li key={allocation.batch.batch_id}>{allocation.batch.batch_number} · {allocation.enteredQuantity} {allocation.batch.selected_uom_code} · expires {allocation.batch.expires_on}</li>)}</ul></td><td className="p-3">{item.requestedQuantity} {item.selectedUomCode}</td><td className="p-3"><button type="button" aria-label={`Remove ${item.productName}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => { setItems((current) => current.filter((row) => row.productId !== item.productId)); invalidatePreparedReview(); }}><X className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>}
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  </div>;

  const reviewContent = <div className="space-y-5" data-testid="canonical-immutable-preview">
    {postedId && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800"><CheckCircle className="mr-2 inline h-5 w-5" />Posted and read back: <span className="font-mono">{postedId}</span></div>}
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="rounded-lg border border-gray-200 bg-white p-5"><h2 className="text-lg font-semibold">Review inter-branch transfer</h2><div className="mt-4 flex items-center gap-3 rounded-lg border bg-gray-50 p-4"><div><span className="text-xs uppercase text-gray-500">From</span><p className="font-medium">{sourceBranch?.branch_name} · {sourceLocation?.location_name}</p></div><ArrowRight className="h-5 w-5" /><div><span className="text-xs uppercase text-gray-500">To</span><p className="font-medium">{destinationBranch?.branch_name} · {destinationLocation?.location_name}</p></div></div><p className="mt-4 text-sm text-gray-600">{items.length} product(s), dated {transferDate}. Posting executes once and cannot be reversed in this UI.</p><ul className="mt-4 divide-y rounded-lg border">{items.map((item) => <li key={item.productId} className="p-3 text-sm"><strong>{item.productName}</strong> · requested {item.requestedQuantity} {item.selectedUomCode}<ul className="mt-1 text-gray-600">{item.allocations.map((allocation) => <li key={allocation.batch.batch_id}>Batch {allocation.batch.batch_number}: {allocation.enteredQuantity} {allocation.batch.selected_uom_code}</li>)}</ul></li>)}</ul>{executeAttempted && prepared && !postedId && <button type="button" className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-medium" onClick={() => recoverStatus(prepared.command_request_id)}>Check command status (read only)</button>}</section>
    {confirmOpen && prepared && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape' && !committing) setConfirmOpen(false); }}><div className="absolute inset-0 bg-black/50" onClick={() => !committing && setConfirmOpen(false)} /><div ref={confirmDialogRef} role="dialog" aria-modal="true" aria-labelledby="transfer-confirm-title" className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><AlertCircle className="h-6 w-6 text-amber-600" /><h3 id="transfer-confirm-title" className="mt-2 text-lg font-semibold">Confirm inter-branch stock transfer</h3><p className="mt-3 text-sm">Move {items.length} reviewed product(s) from <strong>{sourceBranch?.branch_name}</strong> to <strong>{destinationBranch?.branch_name}</strong>. The exact preview will be approved, then executed once.</p><p className="mt-3 break-all text-xs text-gray-500">Command: {prepared.command_request_id}</p><div className="mt-6 flex gap-3"><button type="button" disabled={committing} className="min-h-11 flex-1 rounded-lg border" onClick={() => setConfirmOpen(false)}>Cancel</button><button type="button" disabled={committing || executeAttempted} className="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-medium text-white disabled:bg-gray-300" onClick={commitOnce}>{committing ? 'Posting…' : executeAttempted ? 'Execution attempted' : 'Approve and post once'}</button></div></div></div>}
  </div>;

  if (!open) return null;
  return <GlobalDocumentFlow documentType="stock-transfer" currentStep={step} onStepChange={setStep} createContent={createContent} reviewContent={reviewContent} canProceedToReview={() => validate(false)} onSave={postedId ? undefined : prepared ? () => setConfirmOpen(true) : handlePrepare} isSaving={preparing || committing} saveLabel={postedId ? 'Transfer posted' : prepared ? 'Review approval' : 'Prepare transfer'} onClose={onClose} />;
};

export default StockTransfer;
