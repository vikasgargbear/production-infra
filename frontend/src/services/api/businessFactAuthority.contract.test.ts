import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('live reports and documents never present invented business facts', () => {
  const financialReport = read('frontend/src/components/reports/FinancialReport.tsx');
  const customerAnalytics = read('frontend/src/components/reports/CustomerAnalytics.tsx');
  const invoicePdf = read('frontend/src/utils/invoicePdfGenerator.ts');
  const orderReview = read('frontend/src/components/sales/order/steps/OrderReviewStep.tsx');

  [
    '₹3,60,000', '₹4,20,000', '₹3,21,450', '₹1,87,650',
    'Healthy cash generation', '32 days',
  ].forEach(value => expect(financialReport).not.toContain(value));
  expect(customerAnalytics).not.toContain('<p className="text-xl font-bold">87%</p>');
  expect(invoicePdf).not.toMatch(/Interest\s*@\s*36%/);
  [
    'Your Company Name', 'Customer Name', 'Unknown Product', "'3004'", "'DOC-'",
    'item.quantity || 1', 'item.gst_percent || 0', 'final_amount || 0',
  ].forEach(value => expect(invoicePdf).not.toContain(value));
  expect(invoicePdf).toContain('seller_legal_name');
  expect(invoicePdf).toContain('normalizeAuthoritativeDecimal');
  expect(fs.existsSync(path.join(root, 'frontend/src/utils/pdfHelpers.ts'))).toBe(false);
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/components/sales/invoice/hooks/useInvoiceActions.ts',
  ))).toBe(false);

  const invoiceTable = read('frontend/src/components/sales/invoice/invoicelist/components/InvoiceTable.tsx');
  const canonicalReads = read('backend/app/api/routes/canonical_erp_reads.py');
  expect(invoiceTable).toContain('invoicesApi.getById(document.id)');
  expect(invoiceTable).toContain('downloadInvoicePDF');
  expect(invoiceTable).toContain('Download canonical invoice PDF');
  expect(canonicalReads).toContain('invoice.seller_legal_name_snapshot AS seller_legal_name');
  expect(canonicalReads).toContain('invoice.seller_gstin_snapshot AS seller_gstin');
  expect(canonicalReads).toContain('invoice.seller_address_snapshot AS seller_address');
  expect(orderReview).not.toMatch(/Interest\s*@\s*18%/);

  expect(financialReport).toContain('projectProfitLoss');
  expect(financialReport).toContain('projectTrialBalance');
  expect(financialReport).toContain('canonical-factual-v1');
  expect(customerAnalytics).toContain('projectCustomerActivity');
  expect(customerAnalytics).toContain('no churn, retention, LTV, or segment inference');
});

test('retired browser spreadsheet parsers cannot invent product master facts', () => {
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/components/global/upload/BulkProductUpload.tsx',
  ))).toBe(false);
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/components/purchase/BulkUploadInline.tsx',
  ))).toBe(false);

  const packageJson = JSON.parse(read('frontend/package.json'));
  expect(packageJson.dependencies?.xlsx).toBeUndefined();
  expect(read('frontend/src/components/purchase/purchase-entry/CanonicalPurchaseWorkflow.tsx'))
    .not.toContain('BulkUploadInline');
});

test('retired compatibility mappers cannot infer canonical product or batch facts', () => {
  [
    'frontend/src/utils/productMapper.ts',
    'frontend/src/utils/productMapper.test.ts',
    'frontend/src/utils/dataMapper.ts',
    'frontend/src/config/fieldAliases.ts',
  ].forEach(relative => expect(fs.existsSync(path.join(root, relative))).toBe(false));

  const configIndex = read('frontend/src/config/index.ts');
  expect(configIndex).not.toContain('FIELD_ALIASES');
  expect(configIndex).not.toContain('fieldAliases');
});

test('core command inputs never invent zero, aliases, or browser-local evidence time', () => {
  const expense = read('frontend/src/components/payment/flows/ExpenseClaimsFlow.tsx');
  const adjustment = read('frontend/src/components/payment/flows/adjustmentNoteCommand.ts');
  const adjustmentUi = read('frontend/src/components/payment/flows/CreditDebitFlow.tsx');
  const supplierPayment = read('frontend/src/components/payment/entry/supplierPaymentCommand.ts');
  const stockAdjustment = read('frontend/src/components/inventory/stock/StockAdjustmentFlow.tsx');

  expect(expense).not.toContain("line.claimed_amount || '0'");
  expect(adjustment).not.toContain("entered.billed || '0'");
  expect(adjustment).not.toContain("entered.free || '0'");
  expect(adjustment).not.toContain("rounding_policy: 'none'");
  expect(adjustment).not.toContain("line_discount_kind: 'none'");
  expect(adjustment).not.toContain("document_discount_kind: 'none'");
  expect(adjustment).not.toContain('document_discount_eligible: true');
  expect(adjustment).toContain('context.rounding_policy');
  expect(adjustment).toContain('context.document_discount');
  expect(adjustment).toContain('line.line_discount');
  expect(adjustment).toContain('line.document_discount_eligible');
  expect(adjustmentUi).not.toContain('type="datetime-local"');
  expect(adjustmentUi).not.toContain('new Date(event.target.value).toISOString()');
  expect(supplierPayment).not.toContain('localBusinessDate');
  expect(supplierPayment).not.toContain('new Date()');
  expect(stockAdjustment).not.toContain('selectedProduct.product_name || selectedProduct.name');
  expect(stockAdjustment).not.toContain('selectedProduct.product_code || selectedProduct.code');
});

test('financial reports use only reviewed factual projections; sales uses exact facts', () => {
  const financialReport = read('frontend/src/components/reports/FinancialReport.tsx');
  const salesReport = read('frontend/src/components/reports/SalesReport.tsx');
  const taxAnalytics = read('frontend/src/components/reports/TaxAnalytics.tsx');
  const canonicalReads = read('backend/app/api/routes/canonical_erp_reads.py');
  const canonicalReports = read('backend/app/api/routes/canonical_reporting_reads.py');

  expect(financialReport).toContain('reportingApi.getTrialBalance');
  expect(financialReport).toContain('reportingApi.getProfitLoss');
  expect(financialReport).toContain('useCanonicalBusinessDate');
  expect(financialReport).not.toContain('apiClient');
  expect(financialReport).not.toContain('summaryData.revenue_change_percent || 0');
  expect(financialReport).not.toContain("transaction_category || 'General'");
  expect(canonicalReads).not.toContain('@router.get("/financial/summary")');
  expect(canonicalReads).not.toContain('@router.get("/financial/cash-flow")');
  expect(canonicalReads).not.toContain('@router.get("/financial/transactions")');
  expect(canonicalReads).not.toContain('@router.get("/financial/expense-breakdown")');
  expect(canonicalReports).toContain('@router.get("/trial-balance"');
  expect(canonicalReports).toContain('@router.get("/profit-loss"');
  expect(canonicalReports).not.toContain('cash_flow');
  expect(canonicalReports).not.toContain('gross_margin');
  expect(canonicalReports).not.toContain('ebitda');
  expect(canonicalReads).not.toContain('"revenue_change_percent": 0');
  expect(canonicalReads).not.toContain('"receivable_change_percent": 0');
  expect(canonicalReads).not.toContain('0::numeric AS sales_growth');
  expect(canonicalReads).not.toContain('0::numeric AS revenue_change');
  expect(canonicalReads).not.toContain('"products_change": 0');
  expect(canonicalReads).not.toContain('"compliance_score": 100');
  expect(canonicalReads).not.toContain('"gstr2b": {"status": "available"');
  expect(canonicalReads).not.toContain('"total_pages": 1');
  expect(canonicalReads).not.toContain('0::numeric AS current_outstanding');
  expect(canonicalReads).not.toContain("'sale_price_per_unit', batch.mrp");
  expect(canonicalReads).not.toContain("'cost_per_unit', COALESCE(stock.average_unit_cost, 0)");
  expect(canonicalReads).toContain('"total_items": total');
  expect(canonicalReads).toContain('AS current_outstanding');
  expect(salesReport).toContain('requiredNumberFact');
  expect(salesReport).toContain('Comparison unavailable');
  expect(salesReport).not.toContain('summaryData.sales_growth || 0');
  expect(taxAnalytics).toContain('Tax analytics unavailable');
  expect(taxAnalytics).toContain('Draft document totals');
  expect(taxAnalytics).not.toContain('/tax-entries/analytics/summary');
});

test('payment analytics uses the organization clock and strict canonical projections', () => {
  const component = read('frontend/src/components/reports/PaymentAnalytics.tsx');
  const projection = read('frontend/src/components/reports/utils/paymentAnalyticsProjection.ts');
  const canonicalReads = read('backend/app/api/routes/canonical_erp_reads.py');

  expect(component).toContain('useCanonicalBusinessDate');
  expect(component).toContain('projectPaymentAnalytics');
  expect(component).not.toContain('subDays(end, 30)');
  expect(component).not.toContain('analytics.total_received || 0');
  expect(component).not.toContain("['all', 'cash', 'card', 'upi', 'bank', 'check']");
  expect(projection).toContain('must be a non-negative integer');
  expect(canonicalReads).toContain('party.legal_name AS customer');
  expect(canonicalReads).not.toContain("COALESCE(party.legal_name,'Unassigned') AS customer");
});

test('collection balances reject invented identities, contacts, and success metrics', () => {
  const component = read('frontend/src/components/ledger/CollectionCenter.tsx');
  const projection = read('frontend/src/components/ledger/collectionProjection.ts');
  const canonicalReads = read('backend/app/api/routes/canonical_erp_reads.py');

  expect(component).toContain("queryKey: ['collection-center', 'canonical-aging']");
  expect(component).toContain('projectCollectionAging');
  expect(component).not.toContain("customer_name: party.name || 'Unknown'");
  expect(component).not.toContain("total_outstanding: '0.00'");
  expect(projection).toContain('is not a canonical UUID');
  expect(projection).toContain('requires an authoritative target');
  expect(canonicalReads).toContain('"phone": row.get("phone")');
  expect(canonicalReads).not.toContain('"phone": row.get("phone") or ""');
});
