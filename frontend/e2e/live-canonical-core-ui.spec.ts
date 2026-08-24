/* eslint-disable jest/valid-expect, jest/valid-title, jest/no-conditional-expect, testing-library/prefer-screen-queries */
import { expect, Page, Response, TestInfo, test } from '@playwright/test';
import { chooseHubModule, loginToLiveErp, openHomeAction, returnHome } from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password)
  && process.env.PLAYWRIGHT_LIVE_WRITES === 'true';
const PREFIX = 'CODEX-E2E-20260825';

const canonicalResponse = (page: Page, method: string, suffix: RegExp): Promise<Response> => (
  page.waitForResponse(response => response.request().method() === method
    && suffix.test(new URL(response.url()).pathname), { timeout: 45_000 })
);

const responseJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  expect(response.status(), `${response.request().method()} ${response.url()} ${text}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `${response.request().method()} ${response.url()} ${text}`).toBeLessThan(300);
  return text ? JSON.parse(text) : {};
};

const exact = (value: unknown, label: string): string => {
  expect(typeof value, `${label} must be an exact JSON decimal string`).toBe('string');
  expect(String(value), label).toMatch(/^-?\d+(?:\.\d+)?$/);
  return String(value);
};

const moneyMinor = (value: unknown, label: string): bigint => {
  const text = exact(value, label);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`${label} must be an exact non-negative INR string`);
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
};

const addOneExact = (value: string): string => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Cannot add one to non-decimal ${value}`);
  const scale = match[2]?.length || 0;
  const units = BigInt(match[1] + (match[2] || '')) + (10n ** BigInt(scale));
  const digits = units.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
};

async function authorizedGet(page: Page, response: Response, path: string): Promise<any> {
  const origin = new URL(response.url()).origin;
  const result = await page.evaluate(async ({ origin, path }) => {
    const token = localStorage.getItem('authToken');
    const reply = await fetch(`${origin}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: reply.status, text: await reply.text() };
  }, { origin, path });
  expect(result.status, result.text).toBe(200);
  return JSON.parse(result.text);
}

async function selectSearchResult(page: Page, placeholder: RegExp, query: string, option: RegExp): Promise<void> {
  await page.getByPlaceholder(placeholder).fill(query);
  await expect(page.getByText(option).first()).toBeVisible();
  await page.getByText(option).first().click();
}

async function attachExactEvidence(testInfo: TestInfo, name: string, evidence: Record<string, unknown>): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify({
      evidence_kind: 'live_canonical_ui_write_and_readback',
      immutable_test_org_records: true,
      cleanup_performed: false,
      ...evidence,
    }, null, 2),
    contentType: 'application/json',
  });
}

test.describe('live canonical desktop UI journeys', () => {
  test.skip(!enabled, 'Live UI writes require HTTPS live URL, existing credentials, and PLAYWRIGHT_LIVE_WRITES=true');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });
  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('UI: purchase order form -> backend review -> confirmation -> readback, then GRN form -> review -> post -> readback', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await openHomeAction(page, 'Purchase Entry');
    await chooseHubModule(page, 'Purchase', 'Order');
    await selectSearchResult(page, /Search supplier/i, 'Synthetic Medicines', /Synthetic Medicines Distributor/i);
    await selectSearchResult(page, /Search products/i, 'Synthetic Corrugated', /Synthetic Corrugated Pharmacy Packing Carton/i);
    const productRow = page.getByRole('row').filter({ hasText: 'Synthetic Corrugated Pharmacy Packing Carton' });
    await productRow.locator('td').nth(4).click();
    await productRow.locator('td').nth(4).locator('input').fill('2');
    await productRow.locator('td').nth(6).click();
    await productRow.locator('td').nth(6).locator('input').fill('84');

    const preparedPromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/procurement\.purchase_order\.prepare\/prepare$/);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const prepared = await responseJson(await preparedPromise);
    await expect(page.getByText('Authoritative backend review')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    const executePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const poUiReadbackPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/purchase-orders\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Approve & Create PO', exact: true }).click();
    const executedResponse = await executePromise;
    const executed = await responseJson(executedResponse);
    const poId = String(executed.resource_id);
    const poUiReadback = await responseJson(await poUiReadbackPromise);
    expect(poId).toMatch(/^[0-9a-f-]{36}$/i);
    const po = await authorizedGet(page, executedResponse, `/canonical/purchase-orders/${poId}`);
    expect(po.purchase_order_id).toBe(poId);
    expect(poUiReadback.purchase_order_id).toBe(poId);
    expect(exact(po.items[0].billed_quantity, 'PO billed quantity')).toBe('2.000000');
    expect(exact(po.items[0].quoted_unit_rate, 'PO rate')).toBe('84.0000');
    expect(exact(po.total_amount, 'PO total amount')).toBe(
      exact(prepared.financial_impact[0].supplier_commitment, 'PO preview supplier commitment'),
    );
    await page.screenshot({ path: testInfo.outputPath('po-posted-readback.png'), fullPage: true });

    await returnHome(page);
    await openHomeAction(page, 'Purchase Entry');
    await chooseHubModule(page, 'Purchase', 'Purchase History');
    await page.getByRole('button', { name: 'Purchase Orders', exact: true }).click();
    await page.getByText(po.purchase_order_number, { exact: true }).first().scrollIntoViewIfNeeded();
    await page.getByTitle(`Record canonical receipt for ${po.purchase_order_number}`).click();
    await page.getByLabel('Manufacturer batch number').fill(`${PREFIX}-UI-GRN-${Date.now()}`);
    await page.getByLabel('Expires on').fill('2027-12-31');
    await page.getByLabel('Received billed qty').fill('2.000000');
    await page.getByLabel('Accepted billed qty').fill('2.000000');
    await page.getByLabel('Rejected qty').fill('0.000000');
    await page.getByLabel('Accepted free qty').fill('0.000000');
    await page.getByLabel('MRP').fill('150.00');
    await page.getByLabel('MRP unit').selectOption({ index: 1 });
    await page.getByLabel('Destination location').selectOption({ index: 1 });
    const grnPreparePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/procurement\.goods_receipt\.prepare\/prepare$/);
    await page.getByRole('button', { name: 'Review stock impact' }).click();
    const grnPrepared = await responseJson(await grnPreparePromise);
    await expect(page.getByRole('dialog', { name: 'Approve this exact stock receipt?' })).toContainText(grnPrepared.command_request_id);
    const grnExecutePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const grnUiReadbackPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/goods-receipts\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Approve and post receipt' }).click();
    const grnExecutedResponse = await grnExecutePromise;
    const grnExecuted = await responseJson(grnExecutedResponse);
    const grnUiReadback = await responseJson(await grnUiReadbackPromise);
    const grnId = String(grnExecuted.resource_id);
    expect(grnId).toMatch(/^[0-9a-f-]{36}$/i);
    const grn = await authorizedGet(page, grnExecutedResponse, `/canonical/goods-receipts/${grnId}`);
    expect(grn.purchase_order_id).toBe(poId);
    expect(grnUiReadback.goods_receipt_id).toBe(grnId);
    expect(exact(grn.total_abs_base_quantity, 'GRN quantity')).toBe('2.000000');
    expect(exact(grn.total_inventory_value, 'GRN value')).toBe(
      exact(grnPrepared.inventory_impact[0].extended_cost, 'GRN preview value'),
    );
    await attachExactEvidence(testInfo, 'created-po-grn-and-exact-api-evidence.json', {
      created_records: [
        {
          resource_type: 'purchase_order',
          resource_id: poId,
          resource_number: po.purchase_order_number,
          command_request_id: prepared.command_request_id,
          preview_hash: prepared.preview_hash,
          execution_status: executed.status,
          ui_readback_resource_id: poUiReadback.purchase_order_id,
          independent_readback: {
            billed_quantity: exact(po.items[0].billed_quantity, 'PO evidence billed quantity'),
            free_quantity: exact(po.items[0].free_quantity, 'PO evidence free quantity'),
            quoted_unit_rate: exact(po.items[0].quoted_unit_rate, 'PO evidence rate'),
            total_amount: exact(po.total_amount, 'PO evidence total'),
          },
        },
        {
          resource_type: 'goods_receipt',
          resource_id: grnId,
          resource_number: grn.goods_receipt_number,
          command_request_id: grnPrepared.command_request_id,
          preview_hash: grnPrepared.preview_hash,
          execution_status: grnExecuted.status,
          ui_readback_resource_id: grnUiReadback.goods_receipt_id,
          independent_readback: {
            total_abs_base_quantity: exact(grn.total_abs_base_quantity, 'GRN evidence quantity'),
            total_inventory_value: exact(grn.total_inventory_value, 'GRN evidence value'),
            purchase_order_id: grn.purchase_order_id,
          },
        },
      ],
    });
    await page.screenshot({ path: testInfo.outputPath('grn-posted-readback.png'), fullPage: true });
  });

  test('UI: supplier invoice evidence CTA fails closed before prepare when GSTR-2B match is absent', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openHomeAction(page, 'Purchase Entry');
    const eligiblePromise = canonicalResponse(page, 'GET', /\/api\/canonical\/supplier-invoices\/eligible-receipts$/);
    await chooseHubModule(page, 'Purchase', 'Invoice');
    const eligible = await responseJson(await eligiblePromise);
    const independentReceipt = eligible.receipts.find(
      (candidate: any) => !String(candidate.goods_receipt_number).startsWith(PREFIX),
    );
    expect(independentReceipt, 'requires a pre-provisioned eligible GRN independent of this test run').toBeTruthy();
    const receipt = page.getByLabel('Posted GRN');
    await expect(receipt).toBeEnabled();
    await receipt.selectOption(String(independentReceipt.goods_receipt_id));
    await page.getByLabel('Supplier invoice number').fill(`${PREFIX}-UI-SI-${Date.now()}`);
    let prepareCalls = 0;
    page.on('request', request => {
      if (/supplier_invoice\.prepare\/prepare$/.test(request.url())) prepareCalls += 1;
    });
    const contextPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/supplier-invoices\/context/);
    await page.getByRole('button', { name: 'Load canonical evidence' }).click();
    const context = await responseJson(await contextPromise);
    expect(context.ready).toBe(false);
    expect(context.portal_evidence).toBeNull();
    expect(context.blocking_reasons.join(' ')).toMatch(/GSTR-?2B|portal/i);
    await expect(page.getByText(/GSTR-?2B|portal evidence/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review server calculation' })).toHaveCount(0);
    expect(prepareCalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('supplier-invoice-gstr2b-fail-closed.png'), fullPage: true });
  });

  test('UI: customer receipt selection -> exact allocation review -> confirmation -> canonical readback', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await openHomeAction(page, 'Financial Hub');
    await chooseHubModule(page, 'Financial Hub', 'Customer Receipt');
    await selectSearchResult(page, /Search customer/i, 'Demo Retail', /Demo Retail Customer/i);
    await page.getByPlaceholder('0').fill('1.00');
    await page.getByRole('button', { name: /^Bank$/i }).click();
    await page.getByLabel('Settlement bank account').selectOption({ index: 1 });
    await page.getByPlaceholder(/Enter bank, UPI, or gateway reference/i).fill(`${PREFIX}-UI-RCPT-${Date.now()}`);
    await page.getByRole('button', { name: 'Auto FIFO' }).click();
    await expect(page.getByText(/FIFO Applied/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('PAYMENT SUMMARY')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    const preparePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/finance\.customer_receipt\.prepare\/prepare$/);
    const executePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const uiReadbackPromise = canonicalResponse(page, 'GET', /\/api\/payment-allocation\/payment\/[0-9a-f-]+\/readback$/);
    await page.getByRole('button', { name: 'Post Receipt' }).click();
    const prepared = await responseJson(await preparePromise);
    const executedResponse = await executePromise;
    const executed = await responseJson(executedResponse);
    const uiReadback = await responseJson(await uiReadbackPromise);
    await expect(page.getByText(/Payment Recorded Successfully!/i)).toBeVisible();
    const readback = await authorizedGet(page, executedResponse, `/payment-allocation/payment/${executed.resource_id}/readback`);
    expect(readback.payment_id).toBe(executed.resource_id);
    expect(uiReadback.payment_id).toBe(executed.resource_id);
    expect(exact(readback.amount, 'receipt amount')).toBe(
      exact(prepared.financial_impact[0].receipt_amount, 'receipt preview amount'),
    );
    expect(exact(readback.journal_debit_total, 'receipt debit')).toBe(exact(readback.journal_credit_total, 'receipt credit'));
    await attachExactEvidence(testInfo, 'created-customer-receipt-and-exact-api-evidence.json', {
      created_records: [{
        resource_type: 'customer_receipt',
        resource_id: executed.resource_id,
        resource_number: readback.payment_number,
        command_request_id: prepared.command_request_id,
        preview_hash: prepared.preview_hash,
        execution_status: executed.status,
        ui_readback_resource_id: uiReadback.payment_id,
        independent_readback: {
          amount: exact(readback.amount, 'receipt evidence amount'),
          allocations: readback.allocations.map((allocation: any, index: number) => ({
            allocation_id: allocation.allocation_id,
            open_item_id: allocation.open_item_id,
            amount: exact(allocation.amount, `receipt evidence allocation ${index + 1}`),
          })),
          journal_debit_total: exact(readback.journal_debit_total, 'receipt evidence debit'),
          journal_credit_total: exact(readback.journal_credit_total, 'receipt evidence credit'),
        },
      }],
    });
    await page.screenshot({ path: testInfo.outputPath('customer-receipt-posted-readback.png'), fullPage: true });
  });

  test('UI: supplier payment defaults to FIFO, preserves manual allocation, reviews, posts once, and reconciles exact evidence', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openHomeAction(page, 'Financial Hub');
    const contextPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/supplier-payments\/context$/);
    await chooseHubModule(page, 'Financial Hub', 'Supplier Payment');
    const context = await responseJson(await contextPromise);
    expect(context.ready, JSON.stringify(context.blocking_reasons)).toBe(true);
    const supplier = context.suppliers.find((candidate: any) => candidate.open_items?.length);
    const bank = context.bank_accounts[0];
    expect(supplier, 'live test org requires a posted supplier-invoice payable').toBeTruthy();
    expect(bank, 'live test org requires a canonical INR bank and settlement pair').toBeTruthy();
    const source = supplier.open_items[0];

    await page.getByLabel('Supplier').selectOption(String(supplier.supplier_account_id));
    await page.getByLabel('Branch').selectOption(String(source.branch_id));
    await expect(page.getByLabel('Organization payment date')).toHaveValue(context.payment_date);
    await page.getByLabel('Bank and settlement ledger').selectOption(String(bank.bank_account_id));
    await page.getByLabel('Method').selectOption('bank_transfer');
    const reference = `${PREFIX}-UI-SPAY-${Date.now()}`;
    await page.getByLabel('Bank / UPI reference').fill(reference);

    await expect(page.getByRole('radio', { name: 'Automatic FIFO' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Manual per invoice' })).not.toBeChecked();
    await page.getByRole('radio', { name: 'Manual per invoice' }).click();
    await expect(page.getByLabel(`Allocation for ${source.document_number}`)).toBeVisible();
    await page.getByRole('radio', { name: 'Automatic FIFO' }).click();
    await page.getByLabel('Payment amount').fill('0.01');
    await page.getByRole('button', { name: 'Allocate FIFO' }).click();
    const sourceRow = page.getByRole('row').filter({ hasText: source.document_number });
    await expect(sourceRow).toContainText('₹0.01');

    const preparePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/finance\.supplier_payment\.prepare\/prepare$/);
    await page.getByRole('button', { name: 'Review immutable preview' }).click();
    const prepared = await responseJson(await preparePromise);
    await expect(page.getByRole('heading', { name: 'Confirm supplier payment' })).toBeVisible();
    await expect(page.getByText('₹0.01', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: /I reviewed the exact bank/i }).check();

    let executeCalls = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/.test(request.url())) executeCalls += 1;
    });
    const approvalPromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/approve$/);
    const executePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const uiReadbackPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/supplier-payments\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Post ₹0.01', exact: true }).click();
    await responseJson(await approvalPromise);
    const executedResponse = await executePromise;
    const executed = await responseJson(executedResponse);
    const uiReadback = await responseJson(await uiReadbackPromise);
    await expect(page.getByRole('heading', { name: 'Supplier payment reconciled' })).toBeVisible();

    const paymentId = String(executed.resource_id);
    expect(paymentId).toMatch(/^[0-9a-f-]{36}$/i);
    const posted = await authorizedGet(page, executedResponse, `/canonical/supplier-payments/${paymentId}`);
    const retryReadback = await authorizedGet(page, executedResponse, `/canonical/supplier-payments/${paymentId}`);
    expect(retryReadback).toEqual(posted);
    expect(executeCalls).toBe(1);
    expect(uiReadback.payment_id).toBe(paymentId);
    expect(posted.payment_id).toBe(paymentId);
    expect(posted.supplier_account_id).toBe(supplier.supplier_account_id);
    expect(posted.branch_id).toBe(source.branch_id);
    expect(posted.bank_account_id).toBe(bank.bank_account_id);
    expect(posted.settlement_account_id).toBe(bank.settlement_account_id);
    expect(exact(posted.amount, 'supplier UI payment amount')).toBe('0.01');
    expect(exact(prepared.financial_impact[0].cash_disbursed_amount, 'supplier UI preview cash')).toBe('0.01');
    expect(posted.allocations).toHaveLength(1);
    const allocation = posted.allocations[0];
    expect(allocation.open_item_id).toBe(source.open_item_id);
    expect(allocation.supplier_invoice_id).toBe(source.supplier_invoice_id);
    expect(exact(allocation.amount, 'supplier UI allocation')).toBe('0.01');
    expect(
      moneyMinor(allocation.principal_amount, 'supplier UI principal')
        - moneyMinor(allocation.effective_allocated_amount, 'supplier UI effective allocation'),
    ).toBe(moneyMinor(allocation.residual_amount, 'supplier UI residual'));
    expect(posted.allocation_reconciled).toBe(true);
    expect(posted.payable_residuals_reconciled).toBe(true);
    expect(posted.journal_balanced).toBe(true);
    expect(posted.journal_lines).toHaveLength(2);
    const debit = posted.journal_lines.reduce(
      (sum: bigint, line: any, index: number) => sum + moneyMinor(line.debit, `supplier UI debit ${index + 1}`), 0n,
    );
    const credit = posted.journal_lines.reduce(
      (sum: bigint, line: any, index: number) => sum + moneyMinor(line.credit, `supplier UI credit ${index + 1}`), 0n,
    );
    expect(debit).toBe(1n);
    expect(credit).toBe(debit);
    await attachExactEvidence(testInfo, 'created-supplier-payment-and-exact-api-evidence.json', {
      created_records: [{
        resource_type: 'supplier_payment', resource_id: paymentId, resource_number: posted.payment_number,
        command_request_id: prepared.command_request_id, preview_hash: prepared.preview_hash,
        execution_status: executed.status, ui_readback_resource_id: uiReadback.payment_id,
        exact: {
          amount: posted.amount, allocation_amount: allocation.amount,
          principal_amount: allocation.principal_amount,
          effective_allocated_amount: allocation.effective_allocated_amount,
          residual_amount: allocation.residual_amount,
          journal_debit_total: posted.journal_debit_total,
          journal_credit_total: posted.journal_credit_total,
        },
      }],
    });
    await page.screenshot({ path: testInfo.outputPath('supplier-payment-posted-readback.png'), fullPage: true });
  });

  test('UI: supplier payment future organization date fails closed before prepare', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openHomeAction(page, 'Financial Hub');
    const initialContextPromise = canonicalResponse(page, 'GET', /\/api\/canonical\/supplier-payments\/context$/);
    await chooseHubModule(page, 'Financial Hub', 'Supplier Payment');
    await responseJson(await initialContextPromise);
    let prepareCalls = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && /finance\.supplier_payment\.prepare\/prepare$/.test(request.url())) prepareCalls += 1;
    });
    const futurePromise = page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/canonical/supplier-payments/context'
      && new URL(response.url()).searchParams.get('payment_date') === '9999-12-31');
    await page.getByLabel('Organization payment date').fill('9999-12-31');
    const future = await futurePromise;
    expect(future.status()).toBe(422);
    expect(await future.text()).toMatch(/future/i);
    await expect(page.getByRole('alert')).toContainText(/future/i);
    expect(prepareCalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('supplier-payment-future-date-fail-closed.png'), fullPage: true });
  });

  test('UI: cycle-count form prepares immutable preview and visibly waits for an independent approver', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await openHomeAction(page, 'Stock');
    await chooseHubModule(page, 'Stock', 'Adjustment');
    const eligibilityPromise = canonicalResponse(page, 'GET', /\/api\/web\/actions\/inventory-adjustment\/eligibility/);
    await selectSearchResult(page, /Search and select product/i, 'Synthetic Corrugated', /Synthetic Corrugated Pharmacy Packing Carton/i);
    const batch = page.getByRole('option', { name: /Select batch .* saleable stock/i }).first();
    await batch.click();
    await responseJson(await eligibilityPromise);
    const evidence = page.getByText('Verified physical count sheet', { exact: true })
      .locator('..').getByRole('combobox');
    if (await evidence.count()) {
      await evidence.click();
      await page.getByRole('option').filter({ hasText: /verified|retained/i }).first().click();
    }
    const count = page.getByLabel(/Exact physical count/);
    const system = (await page.getByRole('row').filter({ has: count }).locator('td').nth(2).innerText()).trim();
    await count.fill(addOneExact(exact(system, 'system stock')));
    const preparePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/inventory\.adjustment\.prepare\/prepare$/);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare Cycle Count' }).click();
    const prepared = await responseJson(await preparePromise);
    const dialog = page.getByRole('dialog', { name: 'Confirm Stock Adjustment' });
    await expect(dialog).toContainText(prepared.command_request_id);
    await dialog.getByRole('button', { name: 'Submit for Independent Approval' }).click();
    await expect(page.getByText(/awaits approval by a different authorized user/i)).toBeVisible();
    await expect(page.getByText(prepared.command_request_id, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Execute Approved Count' })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('cycle-count-awaiting-independent-approval.png'), fullPage: true });
  });

  test('UI: sales return form prepares immutable preview and visibly waits for an independent approver', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await openHomeAction(page, 'Returns');
    await chooseHubModule(page, 'Returns', 'Sales Return');
    await page.getByRole('button', { name: 'Select reason...', exact: true }).click();
    await page.getByRole('option', { name: /Customer Rejection/i }).click();
    await selectSearchResult(page, /Search customer/i, 'Demo Retail', /Demo Retail Customer/i);
    await page.getByRole('button').filter({ hasText: /DEMO-SI-/ }).first().click();
    await page.getByRole('button', { name: 'Choose GST treatment', exact: true }).click();
    await page.getByRole('option', { name: /Commercial only/i }).click();
    const returnRow = page.getByRole('row').filter({ hasText: 'Synthetic Corrugated Pharmacy Packing Carton' }).first();
    await returnRow.locator('td').nth(5).click();
    await returnRow.locator('td').nth(5).locator('input').fill('1');
    await returnRow.getByLabel(/Return condition/i).selectOption({ index: 1 });
    await returnRow.getByLabel(/Quarantine location/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /Proceed to Review|Continue/ }).click();
    const preparePromise = canonicalResponse(page, 'POST', /\/api\/web\/actions\/sales\.return\.prepare\/prepare$/);
    await page.getByRole('button', { name: 'Confirm Return', exact: true }).click();
    const prepared = await responseJson(await preparePromise);
    await expect(page.getByText(/Awaiting independent approval/i)).toBeVisible();
    await expect(page.getByText(prepared.command_request_id, { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('sales-return-awaiting-independent-approval.png'), fullPage: true });
  });
});
