import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('canonical desktop return authority boundary', () => {
  const salesFlow = read('./SalesReturnFlow.tsx');
  const purchaseFlow = read('./PurchaseReturnFlow.tsx');
  const invoiceSelector = read('./components/ReturnInvoiceSelector.tsx');
  const itemTable = read('./components/ReturnItemsTable.tsx');
  const review = read('./components/ReturnReviewPanel.tsx');
  const purchaseSelector = read('./ui/PurchaseReturnSelector.tsx');
  const purchaseProjection = read('./utils/purchaseReturnProjection.ts');
  const historyProjection = read('./utils/returnsHistoryProjection.ts');
  const activeSources = [
    salesFlow,
    purchaseFlow,
    invoiceSelector,
    itemTable,
    review,
    purchaseSelector,
    purchaseProjection,
    historyProjection,
  ].join('\n');

  it('has no reachable manual return entry that could lose invoice or receipt lineage', () => {
    expect(fs.existsSync(path.resolve(__dirname, './ui/ManualReturnEntry.tsx'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, './ui/CreditNotePreview.tsx'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, './ui/DebitNotePreview.tsx'))).toBe(false);
    expect(activeSources).not.toMatch(/Manual Entry|showManualEntry|onSkipInvoice|onAddManualItem|manualPurchaseReturnItem/);
    expect(invoiceSelector).toContain('SELECT POSTED INVOICE (Required)');
  });

  it('starts requested quantities and monetary projections blank', () => {
    expect(salesFlow).toMatch(/return_paid_qty:\s*'',\s*\n\s*return_free_qty:\s*'',\s*\n\s*return_quantity:\s*''/);
    expect(purchaseFlow).toMatch(/return_paid_qty:\s*'',\s*\n\s*return_free_qty:\s*'',\s*\n\s*return_quantity:\s*''/);
    expect(activeSources).not.toMatch(/return_(?:paid_qty|free_qty|quantity):\s*['"]1(?:\.0+)?['"]/);
    expect(activeSources).not.toMatch(/(?:subtotal_amount|tax_amount|total_amount):\s*['"]0(?:\.0+)?['"]/);
  });

  it('does not display missing canonical amounts or item counts as zero', () => {
    expect(invoiceSelector).toMatch(/Amount unavailable/);
    expect(purchaseSelector).toMatch(/Amount unavailable/);
    expect(purchaseSelector).toMatch(/Item count unavailable/);
    expect(itemTable).toMatch(/Pending canonical preview/);
    expect(review).toMatch(/Pending backend preview/);
    expect(activeSources).not.toMatch(/(?:total_amount|invoice_amount|total_items)[^\n]*(?:\|\||\?\?)\s*(?:['"]0['"]|0)\b/);
  });

  it('uses the immutable canonical command preview as the only calculation boundary', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../services/calculations/returnCalculationService.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '../../services/api/modules/sales/returnCalculations.api.ts'))).toBe(false);
    expect(activeSources).not.toContain('calculateReturnPreview');
    expect(salesFlow).toContain('prepareCanonicalSalesReturn');
    expect(purchaseFlow).toContain('prepareCanonicalPurchaseReturn');
  });

  it('does not export the retired integer-ID return client', () => {
    const legacyClient = path.resolve(
      __dirname, '../../services/api/modules/sales/returns.api.ts',
    );
    const apiIndex = read('../../services/api/index.ts');
    const apiConfig = read('../../config/api.config.ts');
    expect(fs.existsSync(legacyClient)).toBe(false);
    expect(apiIndex).not.toContain('returnsApi');
    expect(apiConfig).not.toContain("SALES: '/sale-returns/'");
    expect(apiConfig).not.toContain("PURCHASE: '/purchase-returns/'");
  });

  it('leaves return policy choices explicit instead of inferring them in initial state', () => {
    expect(purchaseFlow).toMatch(/transport_mode:\s*'',\s*\n\s*distance_km:\s*''/);
    expect(purchaseFlow).toContain("supplier_destination_address_id: ''");
    expect(purchaseFlow).not.toContain('supplier_destinations[0]');
    expect(purchaseFlow).not.toContain('logistics_modes[0]');
    expect(salesFlow).toMatch(/return_condition:\s*'',\s*\n\s*to_location_id:\s*''/);
    expect(activeSources).not.toMatch(/packages_per_box\s*(?:\|\||\?\?)\s*1/);
    expect(activeSources).not.toMatch(/units_per_pack\s*(?:\|\||\?\?)\s*1/);
  });

  it('renders purchase-return logistics only from the canonical context contract', () => {
    const command = read('./utils/canonicalReturnCommand.ts');
    const api = read('../../services/api/modules/returns/canonicalReturns.api.ts');
    expect(api).toContain('logistics_modes: CanonicalPurchaseReturnLogisticsMode[]');
    expect(api).toContain('transporter_choices: CanonicalPurchaseReturnTransporterChoice[]');
    expect(purchaseFlow).toContain('context.logistics_modes');
    expect(purchaseFlow).toContain('context.transporter_choices');
    expect(purchaseFlow).toContain('returnData.logistics_modes.map');
    expect(purchaseFlow).toContain('returnData.transporter_choices.map');
    expect(purchaseFlow).not.toContain('Canonical transporter party UUID');
    expect(purchaseFlow).not.toMatch(/options=\{\[\s*\{ value: 'in_person'/);
    expect(purchaseFlow).not.toMatch(/\['rail', 'air', 'ship', 'multimodal'\]/);
    expect(command).toContain('data.logistics_modes');
    expect(command).toContain('data.transporter_choices');
    expect(command).not.toMatch(/\['road', 'rail', 'air', 'ship', 'multimodal', 'in_person'\]/);
    expect(command).not.toMatch(/\['regular', 'over_dimensional_cargo'\]/);
  });

  it('does not infer return dates, status, GST, rates, quantities, IDs or selection', () => {
    expect(salesFlow).toContain('canonicalBusinessContextApi.get()');
    expect(purchaseFlow).toContain('canonicalBusinessContextApi.get()');
    expect(activeSources).not.toMatch(/return_date:\s*(?:new Date|[^\n]*toISOString)/);
    expect(activeSources).not.toMatch(/(?:status|return_method):\s*['"][A-Za-z_]+['"]/);
    expect(activeSources).not.toMatch(/(?:include_gst|withhold_gst):\s*(?:true|false)/);
    expect(activeSources).not.toMatch(/(?:unit_price|discount_percent|tax_percent):\s*['"](?:0|12|18)(?:\.0+)?['"]/);
    expect(activeSources).not.toMatch(/(?:customer_id|supplier_id|invoice_id|batch_id|to_location_id):\s*['"][0-9a-f-]{36}['"]/i);
    expect(activeSources).not.toMatch(/selected:\s*true/);
    expect(salesFlow).toContain('isCanonicalUuid(invoiceId)');
    expect(purchaseFlow).toContain('isCanonicalUuid(invoiceId)');
  });

  it('blocks source selection and posting outside the authoritative business-date boundary', () => {
    for (const flow of [salesFlow, purchaseFlow]) {
      expect(flow).toContain('requireCanonicalPostingDate');
      expect(flow).toContain('max={authoritativeBusinessDate || undefined}');
      expect(flow).toContain('Loading the authoritative organization date before invoice selection');
    }
    expect(salesFlow.match(/requireCanonicalPostingDate/g)).toHaveLength(3);
    expect(purchaseFlow.match(/requireCanonicalPostingDate/g)).toHaveLength(3);
  });

  it('ignores stale canonical source responses when the selected invoice or supplier changes', () => {
    expect(salesFlow).toContain('invoiceContextRequestSequence');
    expect(salesFlow).toMatch(/requestSequence !== invoiceContextRequestSequence\.current/);
    expect(purchaseFlow).toContain('invoiceContextRequestSequence');
    expect(purchaseFlow).toContain('supplierInvoicesRequestSequence');
    expect(purchaseFlow).toMatch(/requestSequence !== invoiceContextRequestSequence\.current/);
    expect(purchaseFlow).toMatch(/requestSequence !== supplierInvoicesRequestSequence\.current/);
  });

  it('does not alias GST identities or manufacture evidence timestamps', () => {
    expect(activeSources).not.toMatch(/gst_number\s*:\s*[^\n]*(?:\.gst\b|gst_number\s*\|\|\s*[^\n]*gst_number)/);
    expect(activeSources).not.toContain('new Date().toISOString()');
    expect(salesFlow).not.toContain('(customer as any).id ??');
    expect(salesFlow).not.toContain('(customer as any).party_id');
    expect(purchaseFlow).not.toContain('supplier.id ||');
    expect(purchaseFlow).not.toContain('supplier.party_id');
    expect(salesFlow).toContain('The browser does not invent a confirmation time.');
    expect(read('./utils/canonicalReturnCommand.ts')).toContain('RFC 3339 with an explicit offset');
  });

  it('projects history only from the canonical document-history contract', () => {
    expect(historyProjection).toContain('CanonicalDocumentHistoryItem');
    expect(historyProjection).not.toMatch(/return_id\s*\?\?|return_number\s*\?\?|approval_status\s*\?\?/);
    expect(historyProjection).not.toMatch(/items_count[^\n]*(?:\|\||\?\?)\s*0/);
  });
});
