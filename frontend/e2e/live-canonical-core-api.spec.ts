/* eslint-disable jest/valid-expect, jest/valid-title */
// API-only acceptance: authenticated fetches are intentional here and must never be reported as UI E2E evidence.
import { expect, Page, test } from '@playwright/test';
import { loginToLiveErp } from './support/live-erp';

const liveBaseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const writesEnabled = process.env.PLAYWRIGHT_LIVE_WRITES === 'true';
const liveConfigured = /^https:\/\//.test(liveBaseURL) && Boolean(email && password);
const PREFIX = 'CODEX-E2E-20260825';

type Json = Record<string, any>;
type ApiEvidence = { method: string; path: string; status: number };

function uuid(value: unknown, label: string): string {
  const text = String(value || '');
  expect(text, label).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return text;
}

function exact(value: unknown, label: string): string {
  expect(typeof value, `${label} must remain a JSON decimal string`).toBe('string');
  expect(String(value), label).toMatch(/^-?\d+(?:\.\d+)?$/);
  return String(value);
}

function moneyMinor(value: unknown, label: string): bigint {
  const text = exact(value, label);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`${label} must be an exact non-negative INR string`);
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function testUuid(): string {
  const tail = Date.now().toString(16).slice(-12).padStart(12, '0');
  return `d3900000-0000-7000-8000-${tail}`;
}

function sourceCountAboveBase(systemBase: string, multiplier: string): string {
  const parse = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new Error(`Expected non-negative exact decimal, got ${value}`);
    return { units: BigInt(match[1] + (match[2] || '')), scale: match[2]?.length || 0 };
  };
  const system = parse(systemBase);
  const factor = parse(multiplier);
  if (factor.units <= 0n) throw new Error('Cycle-count UOM multiplier must be positive');
  const numerator = system.units * (10n ** BigInt(factor.scale));
  const denominator = factor.units * (10n ** BigInt(system.scale));
  return `${(numerator / denominator) + 1n}.000000`;
}

async function apiOrigin(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.startsWith('/api/') && response.request().method() === 'GET';
  }, { timeout: 30_000 });
  await page.reload();
  const response = await responsePromise;
  return new URL(response.url()).origin;
}

async function call(
  page: Page,
  origin: string,
  evidence: ApiEvidence[],
  method: 'GET' | 'POST',
  path: string,
  body?: Json,
): Promise<{ status: number; body: Json }> {
  const result = await page.evaluate(async ({ origin, method, path, body }) => {
    const token = window.localStorage.getItem('authToken');
    if (!token) throw new Error('Authenticated ERP access token is absent');
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed: Json = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    return { status: response.status, body: parsed };
  }, { origin, method, path, body });
  evidence.push({ method, path, status: result.status });
  return result;
}

async function ok(
  page: Page, origin: string, evidence: ApiEvidence[], method: 'GET' | 'POST', path: string, body?: Json,
): Promise<Json> {
  const response = await call(page, origin, evidence, method, path, body);
  expect(response.status, `${method} ${path}: ${JSON.stringify(response.body)}`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${method} ${path}: ${JSON.stringify(response.body)}`).toBeLessThan(300);
  return response.body;
}

async function lifecycle(
  page: Page,
  origin: string,
  evidence: ApiEvidence[],
  operation: string,
  payload: Json,
  readbackPath: (resourceId: string, commandId: string) => string,
): Promise<{ prepared: Json; executed: Json; readback: Json }> {
  const prepared = await ok(page, origin, evidence, 'POST', `/web/actions/${operation}/prepare`, payload);
  const commandId = uuid(prepared.command_request_id, `${operation} command ID`);
  expect(prepared.status).toBe('prepared');
  expect(prepared.preview_hash).toMatch(/^sha256:[0-9a-f]{64}$/);

  await ok(page, origin, evidence, 'POST', `/web/actions/commands/${commandId}/approve`, {
    preview_hash: prepared.preview_hash,
    approval_intent: 'approve',
    idempotency_key: `${payload.idempotency_key}:approve`,
  });
  const executed = await ok(page, origin, evidence, 'POST', `/web/actions/commands/${commandId}/execute`, {
    preview_hash: prepared.preview_hash,
    idempotency_key: `${payload.idempotency_key}:execute`,
  });
  const resourceId = uuid(executed.resource_id, `${operation} resource ID`);
  expect(executed.status).toBe('succeeded');
  const path = readbackPath(resourceId, commandId);
  const readback = await ok(page, origin, evidence, 'GET', path);

  // A recovery retry is deliberately GET-only. This is the regression guard
  // for execute-success/readback-failure: a browser must never post execute twice.
  const reconciled = await ok(page, origin, evidence, 'GET', path);
  expect(reconciled).toEqual(readback);
  expect(evidence.filter(item => item.method === 'POST' && item.path.endsWith('/execute'))).toHaveLength(1);
  return { prepared, executed, readback };
}

async function assertSeparateApproval(
  page: Page, origin: string, evidence: ApiEvidence[], operation: string, payload: Json, reviewPath: (id: string) => string,
): Promise<void> {
  const prepared = await ok(page, origin, evidence, 'POST', `/web/actions/${operation}/prepare`, payload);
  const commandId = uuid(prepared.command_request_id, `${operation} command ID`);
  expect(prepared.required_approvals).toEqual(expect.arrayContaining([
    expect.objectContaining({ policy: 'separate_approver' }),
  ]));
  const review = await call(page, origin, evidence, 'GET', reviewPath(commandId));
  expect([403, 404], JSON.stringify(review.body)).toContain(review.status);
  const approval = await call(page, origin, evidence, 'POST', `/web/actions/commands/${commandId}/approve`, {
    preview_hash: prepared.preview_hash,
    approval_intent: 'approve',
    idempotency_key: `${payload.idempotency_key}:same-actor`,
  });
  expect([403, 409], JSON.stringify(approval.body)).toContain(approval.status);
  expect(JSON.stringify(approval.body)).toMatch(/separate|different|distinct|approver/i);
  expect(evidence.some(item => item.path.endsWith('/execute'))).toBe(false);
}

test.describe('live canonical desktop API acceptance through the authenticated browser', () => {
  test.skip(!liveConfigured || !writesEnabled,
    'Requires HTTPS PLAYWRIGHT_LIVE_BASE_URL, existing live credentials, and explicit PLAYWRIGHT_LIVE_WRITES=true');
  test.use({ baseURL: liveBaseURL, viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('API: PO -> GRN posts exactly once; supplier invoice fails closed without GSTR-2B evidence', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);

    const run = suffix();
    const branchId = 'd3000000-0000-7000-8000-000000000005';
    const supplierId = 'd3200000-0000-7000-8000-000000000002';
    const productId = 'd3000000-0000-7000-8000-000000000015';
    const uomId = 'd3000000-0000-7000-8000-000000000016';
    const date = todayIst();
    const po = await lifecycle(page, origin, evidence, 'procurement.purchase_order.prepare', {
      idempotency_key: `${PREFIX}-PO-${run}`,
      branch_id: branchId, order_date: date, expected_on: date,
      supplier_account_id: supplierId, tax_charge_mechanism: 'normal',
      rounding_policy: 'none', zero_rated_payment_mode: 'not_applicable',
      document_discount: { document_discount_kind: 'none', document_discount_basis: 'taxable_value', document_discount_value: '0' },
      lines: [{ line_id: testUuid(), product_id: productId, uom_conversion_id: uomId, billed_quantity: '2.000000', free_quantity: '0.000000', free_supply_tax_treatment: 'excluded_from_taxable_value', quoted_unit_rate: '84.0000', price_basis: 'tax_exclusive', line_discount: { line_discount_kind: 'none', line_discount_basis: 'price_value', line_discount_value: '0' }, document_discount_eligible: true }],
    }, id => `/canonical/purchase-orders/${id}`);
    expect(po.readback.purchase_order_id).toBe(po.executed.resource_id);
    expect(exact(po.readback.items[0].billed_quantity, 'PO billed quantity')).toBe('2.000000');
    expect(exact(po.readback.items[0].free_quantity, 'PO free quantity')).toBe('0.000000');
    expect(exact(po.readback.items[0].quoted_unit_rate, 'PO rate')).toBe('84.0000');
    expect(exact(po.readback.total_amount, 'PO total amount')).toBe(
      exact(po.prepared.financial_impact[0].supplier_commitment, 'PO preview supplier commitment'),
    );

    const context = await ok(page, origin, evidence, 'GET', `/canonical/goods-receipts/purchase-orders/${po.executed.resource_id}/context`);
    const line = context.lines[0];
    expect(line).toBeTruthy();
    const location = line.eligible_locations[0];
    const mrpUom = line.mrp_conversions[0];
    const grn = await lifecycle(page, origin, evidence, 'procurement.goods_receipt.prepare', {
      idempotency_key: `${PREFIX}-GRN-${run}`,
      branch_id: context.branch_id,
      received_at: `${date}T12:00:00+05:30`,
      purchase_order_id: po.executed.resource_id,
      supplier_account_id: context.supplier_account_id,
      supplier_challan_number: `${PREFIX}-CH-${run}`,
      supplier_challan_date: date,
      lines: [{ purchase_order_line_id: line.purchase_order_line_id, batches: [{ manufacturer_batch_number: `${PREFIX}-B-${run}`, expires_on: '2027-12-31', mrp: '150.00', mrp_uom_conversion_id: mrpUom.id, received_quantity: '2.000000', accepted_quantity: '2.000000', rejected_quantity: '0.000000', free_quantity: '0.000000', qc_status: 'accepted', to_location_id: location.id }] }],
    }, id => `/canonical/goods-receipts/${id}`);
    expect(grn.readback.goods_receipt_id).toBe(grn.executed.resource_id);
    expect(grn.readback.purchase_order_id).toBe(po.executed.resource_id);
    expect(exact(grn.readback.total_abs_base_quantity, 'GRN total quantity')).toBe('2.000000');
    expect(exact(grn.readback.total_inventory_value, 'GRN inventory value')).toBe(
      exact(grn.prepared.inventory_impact[0].extended_cost, 'GRN preview inventory value'),
    );

    const invoiceNumber = `${PREFIX}-SI-${run}`;
    const siContext = await ok(page, origin, evidence, 'GET', `/canonical/supplier-invoices/context?goods_receipt_id=${grn.executed.resource_id}&supplier_invoice_number=${encodeURIComponent(invoiceNumber)}&invoice_date=${date}`);
    expect(siContext.ready).toBe(false);
    expect(siContext.portal_evidence).toBeNull();
    expect(siContext.blocking_reasons.join(' ')).toMatch(/GSTR-?2B|portal/i);
    expect(evidence.some(item => item.path.includes('supplier_invoice.prepare'))).toBe(false);
    await testInfo.attach('canonical-api-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });

  test('API: customer receipt posts once and reconciles exact allocation and balanced journal', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);
    const customerId = 'd3000000-0000-7000-8000-000000000011';
    const openItems = await ok(page, origin, evidence, 'GET', `/payment-allocation/unpaid-invoices?customer_id=${customerId}`);
    const item = (openItems.invoices || openItems.items || openItems)[0];
    expect(item, 'demo customer requires an unpaid canonical invoice').toBeTruthy();
    const openItemId = uuid(item.open_item_id, 'open item ID');
    const run = suffix();
    const receipt = await lifecycle(page, origin, evidence, 'finance.customer_receipt.prepare', {
      idempotency_key: `${PREFIX}-RCPT-${run}`,
      branch_id: 'd3000000-0000-7000-8000-000000000005', payment_date: todayIst(),
      customer_account_id: customerId,
      settlement_account_id: 'd3210000-0000-7000-8000-000000000001',
      bank_account_id: 'd3200000-0000-7000-8000-000000000008',
      payment_method: 'bank_transfer', amount: '1.00',
      allocations: [{ open_item_id: openItemId, amount: '1.00' }],
      external_reference: `${PREFIX}-RCPT-${run}`,
    }, id => `/payment-allocation/payment/${id}/readback`);
    expect(receipt.readback.payment_id).toBe(receipt.executed.resource_id);
    expect(exact(receipt.readback.amount, 'receipt amount')).toBe(
      exact(receipt.prepared.financial_impact[0].receipt_amount, 'receipt preview amount'),
    );
    expect(exact(receipt.readback.allocations[0].amount, 'allocation amount')).toBe('1.00');
    expect(exact(receipt.readback.journal_debit_total, 'journal debit')).toBe(exact(receipt.readback.journal_credit_total, 'journal credit'));
    await testInfo.attach('canonical-api-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });

  test('API: supplier payment uses authoritative payable/bank context, posts once, and reconciles exact residuals and journal', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);
    const context = await ok(page, origin, evidence, 'GET', '/canonical/supplier-payments/context');
    expect(context.ready, JSON.stringify(context.blocking_reasons)).toBe(true);
    expect(context.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const supplier = context.suppliers.find((candidate: Json) => candidate.open_items?.length);
    const bank = context.bank_accounts[0];
    expect(supplier, 'live test org requires a posted supplier-invoice payable').toBeTruthy();
    expect(bank, 'live test org requires a canonical INR bank and settlement pair').toBeTruthy();
    const openItem = supplier.open_items[0];
    uuid(openItem.open_item_id, 'supplier payable open-item ID');
    uuid(openItem.supplier_invoice_id, 'posted supplier-invoice ID');
    const paymentAmount = moneyMinor(openItem.outstanding_amount, 'supplier payable outstanding') >= 1n ? '0.01' : '';
    expect(paymentAmount, 'supplier payable must retain at least one paisa').toBe('0.01');
    const run = suffix();
    const payment = await lifecycle(page, origin, evidence, 'finance.supplier_payment.prepare', {
      idempotency_key: `${PREFIX}-SPAY-${run}`,
      supplier_account_id: supplier.supplier_account_id,
      branch_id: openItem.branch_id,
      bank_account_id: bank.bank_account_id,
      settlement_account_id: bank.settlement_account_id,
      payment_date: context.payment_date,
      payment_method: 'bank_transfer',
      external_reference: `${PREFIX}-SPAY-${run}`,
      gross_amount: paymentAmount,
      allocations: [{ open_item_id: openItem.open_item_id, amount: paymentAmount }],
    }, id => `/canonical/supplier-payments/${id}`);

    const posted = payment.readback;
    expect(posted.payment_id).toBe(payment.executed.resource_id);
    expect(posted.supplier_account_id).toBe(supplier.supplier_account_id);
    expect(posted.branch_id).toBe(openItem.branch_id);
    expect(posted.bank_account_id).toBe(bank.bank_account_id);
    expect(posted.settlement_account_id).toBe(bank.settlement_account_id);
    expect(exact(posted.amount, 'supplier payment amount')).toBe(paymentAmount);
    expect(exact(payment.prepared.financial_impact[0].cash_disbursed_amount, 'supplier preview cash')).toBe(paymentAmount);
    expect(posted.allocations).toHaveLength(1);
    const allocation = posted.allocations[0];
    expect(allocation.open_item_id).toBe(openItem.open_item_id);
    expect(allocation.supplier_invoice_id).toBe(openItem.supplier_invoice_id);
    expect(exact(allocation.amount, 'supplier allocation amount')).toBe(paymentAmount);
    expect(
      moneyMinor(allocation.principal_amount, 'supplier allocation principal')
        - moneyMinor(allocation.effective_allocated_amount, 'supplier effective allocation'),
    ).toBe(moneyMinor(allocation.residual_amount, 'supplier payable residual'));
    expect(posted.allocation_reconciled).toBe(true);
    expect(posted.payable_residuals_reconciled).toBe(true);
    expect(posted.journal_balanced).toBe(true);
    expect(posted.journal_lines).toHaveLength(2);
    const debit = posted.journal_lines.reduce(
      (sum: bigint, line: Json, index: number) => sum + moneyMinor(line.debit, `supplier journal debit ${index + 1}`), 0n,
    );
    const credit = posted.journal_lines.reduce(
      (sum: bigint, line: Json, index: number) => sum + moneyMinor(line.credit, `supplier journal credit ${index + 1}`), 0n,
    );
    expect(debit).toBe(moneyMinor(posted.amount, 'supplier posted amount'));
    expect(credit).toBe(debit);
    expect(exact(posted.journal_debit_total, 'supplier journal debit total')).toBe(
      exact(posted.journal_credit_total, 'supplier journal credit total'),
    );
    await testInfo.attach('supplier-payment-api-evidence.json', {
      body: JSON.stringify({
        evidence_kind: 'live_canonical_api_only_write_and_readback',
        requests: evidence,
        created_record: {
          payment_id: posted.payment_id,
          payment_number: posted.payment_number,
          command_request_id: payment.prepared.command_request_id,
          preview_hash: payment.prepared.preview_hash,
          exact: {
            amount: posted.amount,
            allocation_amount: allocation.amount,
            principal_amount: allocation.principal_amount,
            effective_allocated_amount: allocation.effective_allocated_amount,
            residual_amount: allocation.residual_amount,
            journal_debit_total: posted.journal_debit_total,
            journal_credit_total: posted.journal_credit_total,
          },
        },
      }, null, 2),
      contentType: 'application/json',
    });
  });

  test('API: supplier payment rejects future organization dates and non-context payable identities without preparing', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);
    const future = await call(page, origin, evidence, 'GET', '/canonical/supplier-payments/context?payment_date=9999-12-31');
    expect(future.status).toBe(422);
    expect(JSON.stringify(future.body)).toMatch(/future/i);

    const context = await ok(page, origin, evidence, 'GET', '/canonical/supplier-payments/context');
    const bank = context.bank_accounts[0];
    const branch = context.branches[0];
    expect(bank, 'negative boundary requires a configured canonical bank pair').toBeTruthy();
    expect(branch, 'negative boundary requires a visible canonical branch').toBeTruthy();
    const run = suffix();
    const rejected = await call(page, origin, evidence, 'POST', '/web/actions/finance.supplier_payment.prepare/prepare', {
      idempotency_key: `${PREFIX}-SPAY-NEG-${run}`,
      supplier_account_id: testUuid(), branch_id: branch.branch_id,
      bank_account_id: bank.bank_account_id, settlement_account_id: bank.settlement_account_id,
      payment_date: context.payment_date, payment_method: 'upi', external_reference: `${PREFIX}-SPAY-NEG-${run}`,
      gross_amount: '0.01', allocations: [{ open_item_id: testUuid(), amount: '0.01' }],
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.status).toBeLessThan(500);
    expect(evidence.filter(item => item.method === 'POST' && item.status >= 200 && item.status < 300)).toHaveLength(0);
    expect(evidence.some(item => item.path.endsWith('/execute'))).toBe(false);
    await testInfo.attach('supplier-payment-negative-api-evidence.json', {
      body: JSON.stringify(evidence, null, 2), contentType: 'application/json',
    });
  });

  test('API: cycle count prepare requires a different approver and never executes as preparer', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);
    const branchId = 'd3000000-0000-7000-8000-000000000005';
    const locationId = 'd3200000-0000-7000-8000-000000000006';
    const batches = await ok(page, origin, evidence, 'GET', '/inventory/batches/?limit=200');
    let row: Json | null = null;
    for (const batch of (batches.items || batches).filter((item: Json) => item.status === 'released' && exact(item.quantity, 'batch quantity') !== '0')) {
      const candidate = await call(page, origin, evidence, 'GET', `/web/actions/inventory-adjustment/eligibility?branch_id=${branchId}&location_id=${locationId}&batch_id=${batch.batch_id}&adjustment_date=${todayIst()}`);
      if (candidate.status === 200) { row = candidate.body; break; }
    }
    expect(row, 'demo requires unused retained cycle-count evidence').toBeTruthy();
    const eligible = row!;
    const conversion = eligible.uom_conversions[0];
    const counted = sourceCountAboveBase(
      exact(eligible.system_base_quantity, 'system base quantity'),
      exact(conversion.multiplier, 'count UOM multiplier'),
    );
    await assertSeparateApproval(page, origin, evidence, 'inventory.adjustment.prepare', {
      idempotency_key: `${PREFIX}-COUNT-${suffix()}`,
      branch_id: eligible.branch_id, adjustment_date: todayIst(), counted_at: `${todayIst()}T12:00:00+05:30`,
      counted_by_membership_id: eligible.counted_by_membership_id, location_id: eligible.location_id,
      reason_code: 'cycle_count', evidence_attachment_id: eligible.evidence[0].evidence_attachment_id,
      lines: [{ product_id: eligible.product_id, uom_conversion_id: conversion.uom_conversion_id, batch_counts: [{ batch_id: eligible.batch_id, counted_quantity: counted }] }],
    }, id => `/web/actions/inventory-adjustment/commands/${id}/review`);
    await testInfo.attach('canonical-api-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });

  test('API: sales return prepare requires a different approver and never executes as preparer', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const evidence: ApiEvidence[] = [];
    const origin = await apiOrigin(page);
    const invoices = await ok(page, origin, evidence, 'GET', '/invoices/?limit=50');
    const candidates = invoices.invoices || invoices.items || invoices;
    let context: Json | null = null;
    for (const candidate of candidates.slice(0, 20)) {
      const invoiceId = candidate.invoice_id || candidate.id;
      const response = await call(page, origin, evidence, 'GET', `/canonical/returns/sales-invoices/${invoiceId}/context?return_date=${todayIst()}`);
      if (response.status === 200 && response.body.lines?.length && response.body.quarantine_locations?.length) {
        context = response.body;
        break;
      }
    }
    expect(context, 'demo requires one canonical dispatch allocation eligible for return').toBeTruthy();
    const source = context!.lines.find((line: Json) => !/^0(?:\.0+)?$/.test(exact(line.returnable_billed_quantity, 'returnable billed')) || !/^0(?:\.0+)?$/.test(exact(line.returnable_free_quantity, 'returnable free')));
    expect(source).toBeTruthy();
    const billed = !/^0(?:\.0+)?$/.test(exact(source.returnable_billed_quantity, 'returnable billed')) ? '1.000000' : '0.000000';
    const free = billed === '0.000000' ? '1.000000' : '0.000000';
    await assertSeparateApproval(page, origin, evidence, 'sales.return.prepare', {
      idempotency_key: `${PREFIX}-SRET-${suffix()}`,
      branch_id: context!.branch_id, return_date: todayIst(), original_invoice_id: context!.invoice_id,
      reason_code: 'customer_rejection', gst_tax_treatment: 'commercial_only',
      lines: [{ original_invoice_line_id: source.original_invoice_line_id, invoice_dispatch_allocation_id: source.invoice_dispatch_allocation_id, billed_quantity: billed, free_quantity: free, batch_allocation: { batch_id: source.batch_id, billed_quantity: billed, free_quantity: free }, to_location_id: context!.quarantine_locations[0].id, return_condition: 'damaged' }],
    }, id => `/canonical/returns/commands/${id}/review`);
    await testInfo.attach('canonical-api-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });
});
