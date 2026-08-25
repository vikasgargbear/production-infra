/* eslint-disable jest/valid-expect, jest/valid-title */
// API-only acceptance. It intentionally does not count as visible-UI evidence.
import { expect, Page, test } from '@playwright/test';
import { loginToLiveErp } from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const writes = process.env.PLAYWRIGHT_LIVE_WRITES === 'true';
const fixtureText = process.env.PLAYWRIGHT_SALES_CHAIN_FIXTURE || '';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password) && writes;
type Json = Record<string, any>;

const exact = (value: unknown, label: string): string => {
  expect(typeof value, `${label} must remain a JSON decimal string`).toBe('string');
  expect(String(value), label).toMatch(/^-?\d+(?:\.\d+)?$/);
  return String(value);
};
const uuid = (value: unknown, label: string): string => {
  expect(String(value), label).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return String(value);
};

async function origin(page: Page): Promise<string> {
  const response = page.waitForResponse(r => new URL(r.url()).pathname.startsWith('/api/') && r.request().method() === 'GET');
  await page.reload();
  return new URL((await response).url()).origin;
}
async function call(page: Page, api: string, method: 'GET'|'POST', path: string, body?: Json): Promise<Json> {
  const result = await page.evaluate(async ({ api, method, path, body }) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${api}/api${path}`, { method, credentials: 'include', headers: {
      Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, text: await response.text() };
  }, { api, method, path, body });
  expect(result.status, `${method} ${path}: ${result.text}`).toBeGreaterThanOrEqual(200);
  expect(result.status, `${method} ${path}: ${result.text}`).toBeLessThan(300);
  return result.text ? JSON.parse(result.text) : {};
}
async function lifecycle(page: Page, api: string, operation: string, payload: Json): Promise<Json> {
  const prepared = await call(page, api, 'POST', `/web/actions/${operation}/prepare`, payload);
  const id = uuid(prepared.command_request_id, `${operation} command`);
  await call(page, api, 'POST', `/web/actions/commands/${id}/approve`, {
    preview_hash: prepared.preview_hash, approval_intent: 'approve', idempotency_key: `${payload.idempotency_key}:approve`,
  });
  const executed = await call(page, api, 'POST', `/web/actions/commands/${id}/execute`, {
    preview_hash: prepared.preview_hash, idempotency_key: `${payload.idempotency_key}:execute`,
  });
  expect(executed.status).toBe('succeeded');
  // Recovery after a successful execute is GET-only; never emit a second POST.
  return { prepared, executed };
}

function requiredFixture(): Json {
  if (!fixtureText.trim()) {
    throw new Error(
      'PLAYWRIGHT_SALES_CHAIN_FIXTURE is required when PLAYWRIGHT_LIVE_WRITES=true. '
      + 'Supply the provisioned disposable-org sales-chain JSON; this acceptance test must not skip.',
    );
  }
  try {
    const fixture = JSON.parse(fixtureText) as Json;
    const required = [
      'branch_id', 'customer_account_id', 'product_id', 'uom_conversion_id',
      'expected_fefo_batch_id', 'billed_quantity', 'free_quantity', 'unit_rate',
      'place_of_supply_state_code',
    ];
    const missing = required.filter(key => fixture[key] === undefined || fixture[key] === null || fixture[key] === '');
    if (missing.length) throw new Error(`missing required fields: ${missing.join(', ')}`);
    return fixture;
  } catch (error) {
    throw new Error(`PLAYWRIGHT_SALES_CHAIN_FIXTURE is invalid: ${String(error)}`);
  }
}

test.describe('live desktop sales-chain API acceptance', () => {
  test.skip(!enabled, 'Requires HTTPS credentials and explicit PLAYWRIGHT_LIVE_WRITES=true');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });
  test.beforeAll(() => { requiredFixture(); });
  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('order -> FEFO reservation -> dispatch -> invoice reconciles exact canonical effects', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const f = requiredFixture();
    for (const key of ['branch_id','customer_account_id','product_id','uom_conversion_id','expected_fefo_batch_id']) uuid(f[key], key);
    const api = await origin(page);
    const businessContext = await call(page, api, 'GET', '/canonical/business-context');
    expect(businessContext.business_date, 'authoritative organization business date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(businessContext.organization_timezone, 'authoritative organization timezone').toEqual(expect.any(String));
    const run = Date.now(); const date = businessContext.business_date;
    const line = { product_id: f.product_id, uom_conversion_id: f.uom_conversion_id,
      billed_quantity: exact(f.billed_quantity, 'fixture billed'), free_quantity: exact(f.free_quantity, 'fixture free'),
      free_supply_tax_treatment: 'excluded_from_taxable_value', quoted_unit_rate: exact(f.unit_rate, 'fixture rate'),
      price_basis: 'tax_exclusive', line_discount: { line_discount_kind: 'none', line_discount_basis: 'taxable_value', line_discount_value: '0' },
      document_discount_eligible: true };
    const common = { branch_id: f.branch_id, customer_account_id: f.customer_account_id,
      document_discount: { document_discount_kind: 'none', document_discount_basis: 'taxable_value', document_discount_value: '0' },
      rounding_policy: 'none', zero_rated_payment_mode: 'not_applicable' };
    const orderLife = await lifecycle(page, api, 'sales.order.prepare', { idempotency_key: `CODEX-SALES-ORDER-${run}`,
      ...common, order_date: date, lines: [line] });
    const orderId = uuid(orderLife.executed.resource_id, 'order resource');
    const order = await call(page, api, 'GET', `/canonical/sales-orders/${orderId}/acceptance-readback`);
    const orderAgain = await call(page, api, 'GET', `/canonical/sales-orders/${orderId}/acceptance-readback`);
    expect(orderAgain).toEqual(order);
    expect(exact(order.lines[0].billed_quantity, 'order billed')).toBe(line.billed_quantity);
    expect(exact(order.lines[0].free_quantity, 'order free')).toBe(line.free_quantity);
    // The resolver owns default FEFO/FIFO reservation; the readback must expose its chosen batch.
    const reservedBatch = uuid(order.lines[0].batch_id, 'server-selected FEFO batch');
    expect(reservedBatch, 'fixture must identify the earliest-expiry released batch').toBe(f.expected_fefo_batch_id);
    const location = uuid(order.lines[0].location_id, 'reserved location');
    const dispatchLife = await lifecycle(page, api, 'sales.dispatch.prepare', { idempotency_key: `CODEX-SALES-DISPATCH-${run}`,
      branch_id: f.branch_id, dispatch_date: date, sales_order_id: orderId, from_location_id: location,
      lines: [{ sales_order_line_id: uuid(order.lines[0].sales_order_line_id, 'order line'), billed_quantity: line.billed_quantity,
        free_quantity: line.free_quantity, batch_allocations: [{ batch_id: reservedBatch,
          billed_quantity: line.billed_quantity, free_quantity: line.free_quantity }] }], logistics: { transport_mode: 'road' } });
    const dispatchId = uuid(dispatchLife.executed.resource_id, 'dispatch resource');
    const dispatch = await call(page, api, 'GET', `/canonical/sales-dispatches/${dispatchId}/acceptance-readback`);
    const allocation = dispatch.lines[0];
    expect(uuid(allocation.batch_id, 'dispatch batch')).toBe(reservedBatch);
    expect(exact(allocation.billed_quantity, 'dispatch billed')).toBe(line.billed_quantity);
    expect(exact(allocation.free_quantity, 'dispatch free')).toBe(line.free_quantity);
    const invoiceLife = await lifecycle(page, api, 'sales.invoice.prepare', { idempotency_key: `CODEX-SALES-INVOICE-${run}`,
      ...common, invoice_date: date, tax_charge_mechanism: 'normal', place_of_supply_state_code: f.place_of_supply_state_code,
      lines: [{ ...line, fulfillment_source: 'dispatch_allocated', dispatch_allocations: [{
        dispatch_line_id: uuid(dispatch.lines[0].dispatch_line_id, 'dispatch line'),
        allocated_base_billed_quantity: exact(allocation.base_billed_quantity, 'dispatch base billed'),
        allocated_base_free_quantity: exact(allocation.base_free_quantity, 'dispatch base free'),
      }] }] });
    const invoiceId = uuid(invoiceLife.executed.resource_id, 'invoice resource');
    const invoice = await call(page, api, 'GET', `/canonical/sales-invoices/${invoiceId}/posting-readback`);
    expect(exact(invoice.invoice_lines[0].billed_quantity, 'invoice billed')).toBe(line.billed_quantity);
    expect(exact(invoice.invoice_lines[0].free_quantity, 'invoice free')).toBe(line.free_quantity);
    for (const name of ['taxable_amount','cgst_amount','sgst_amount','igst_amount','cess_amount','invoice_total',
      'tax_taxable_amount','tax_cgst_amount','tax_sgst_amount','tax_igst_amount','tax_cess_amount','tax_payable_amount',
      'journal_debit_total','journal_credit_total','receivable_principal','receivable_outstanding','inventory_value']) {
      exact(invoice[name], `invoice ${name}`);
    }
    expect(invoice.journal_debit_total).toBe(invoice.journal_credit_total);
    expect(invoice.receivable_principal).toBe(invoice.invoice_total);
    expect(invoice.tax_payable_amount).toBe(invoice.invoice_total);
    uuid(invoice.tax_document_id, 'tax document'); uuid(invoice.accounting_event_id, 'accounting event');
    uuid(invoice.journal_entry_id, 'journal entry'); uuid(invoice.open_item_id, 'receivable open item');
    uuid(invoice.inventory_document_id, 'inventory document');
    const receivables = await call(page, api, 'GET', `/payment-allocation/unpaid-invoices?customer_id=${f.customer_account_id}`);
    expect(JSON.stringify(receivables)).toContain(invoiceId);
    await testInfo.attach('sales-chain-created-ids-and-readback.json', { contentType: 'application/json', body: JSON.stringify({
      order_id: orderId, dispatch_id: dispatchId, invoice_id: invoiceId,
      order_command_id: orderLife.prepared.command_request_id, dispatch_command_id: dispatchLife.prepared.command_request_id,
      invoice_command_id: invoiceLife.prepared.command_request_id, batch_id: reservedBatch,
      exact: { billed: line.billed_quantity, free: line.free_quantity, total: invoice.invoice_total,
        inventory_base_quantity: exact(invoice.inventory_base_quantity, 'inventory base quantity') },
    }, null, 2) });
  });
});
