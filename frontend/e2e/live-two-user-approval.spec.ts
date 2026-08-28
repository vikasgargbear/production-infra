/* eslint-disable jest/valid-expect, jest/valid-title, testing-library/prefer-screen-queries, testing-library/await-async-utils -- this is a Playwright spec, not a Jest/DOM Testing Library test */
import { expect, Page, Response, test, TestInfo } from '@playwright/test';
import {
  chooseHubModule,
  loginToLiveErp,
  openHomeAction,
  returnHome,
  waitForErpToSettle,
} from './support/live-erp';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.(\d+))?$/;
const SCALE_DIGITS = 6;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

type Json = Record<string, unknown>;

const configuration = {
  baseURL: process.env.PLAYWRIGHT_LIVE_BASE_URL || '',
  requesterEmail: process.env.PLAYWRIGHT_LIVE_REQUESTER_EMAIL || '',
  requesterPassword: process.env.PLAYWRIGHT_LIVE_REQUESTER_PASSWORD || '',
  reviewerEmail: process.env.PLAYWRIGHT_LIVE_REVIEWER_EMAIL || '',
  reviewerPassword: process.env.PLAYWRIGHT_LIVE_REVIEWER_PASSWORD || '',
  customerQuery: process.env.PLAYWRIGHT_LIVE_RETURN_CUSTOMER_QUERY || 'Demo Retail Customer',
  invoicePattern: process.env.PLAYWRIGHT_LIVE_RETURN_INVOICE_PATTERN || 'DEMO-SI-',
  supplierQuery: process.env.PLAYWRIGHT_LIVE_RETURN_SUPPLIER_QUERY || 'Synthetic Packaging',
  supplierInvoicePattern: process.env.PLAYWRIGHT_LIVE_SUPPLIER_INVOICE_PATTERN || 'DEMO-SUP-',
  productQuery: process.env.PLAYWRIGHT_LIVE_CYCLE_PRODUCT_QUERY || 'Synthetic Corrugated',
  batchPattern: process.env.PLAYWRIGHT_LIVE_CYCLE_BATCH_PATTERN || 'DEMO-BATCH-',
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function record(value: unknown, label: string): Json {
  expect(value, label).not.toBeNull();
  expect(typeof value, label).toBe('object');
  expect(Array.isArray(value), label).toBe(false);
  return value as Json;
}

function array(value: unknown, label: string): unknown[] {
  expect(Array.isArray(value), label).toBe(true);
  return value as unknown[];
}

function text(value: unknown, label: string): string {
  expect(typeof value, `${label} must remain a JSON string`).toBe('string');
  return value as string;
}

function decimalUnits(value: unknown, label: string): bigint {
  const raw = text(value, label);
  const match = DECIMAL.exec(raw);
  expect(match, `${label} must be a canonical decimal string`).not.toBeNull();
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  expect(fraction.length, `${label} exceeds ${SCALE_DIGITS} decimal places`).toBeLessThanOrEqual(SCALE_DIGITS);
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(SCALE_DIGITS, '0'));
  return negative ? -units : units;
}

function decimalText(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(SCALE_DIGITS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function sum(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function assertDecimalPayloadStrings(value: unknown, path = 'request'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDecimalPayloadStrings(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Json)) {
    const itemPath = `${path}.${key}`;
    if (/(?:quantity|rate|amount|value|total|multiplier|distance_km)$/i.test(key) && item !== null) {
      expect(typeof item, `${itemPath} must cross the browser boundary as an exact decimal string`).toBe('string');
      decimalUnits(item, itemPath);
    }
    assertDecimalPayloadStrings(item, itemPath);
  }
}

async function successfulJson(response: Response, label: string): Promise<Json> {
  const bodyText = await response.text();
  expect(response.status(), `${label}: ${response.request().method()} ${response.url()} ${bodyText}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `${label}: ${response.request().method()} ${response.url()} ${bodyText}`).toBeLessThan(300);
  return record(JSON.parse(bodyText), label);
}

function waitForApi(page: Page, method: string, endpoint: RegExp): Promise<Response> {
  return page.waitForResponse(response => (
    response.request().method() === method && endpoint.test(new URL(response.url()).pathname)
  ), { timeout: 45_000 });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

async function openReturns(page: Page, module: 'Sales Return' | 'Purchase Return' | 'Approvals' | 'Resume / Post'): Promise<void> {
  if (!(await page.getByText('Core Operations').isVisible().catch(() => false))) {
    await returnHome(page);
  }
  await openHomeAction(page, 'Returns Management');
  await chooseHubModule(page, 'Returns', module);
}

async function openAdjustment(page: Page): Promise<void> {
  if (!(await page.getByText('Core Operations').isVisible().catch(() => false))) {
    await returnHome(page);
  }
  await openHomeAction(page, 'Stock Management');
  await chooseHubModule(page, 'Stock', 'Adjustment');
}

async function chooseFirstCustomOption(page: Page, comboboxName: string | RegExp): Promise<void> {
  const combobox = page.getByRole('combobox', { name: comboboxName });
  await expect(combobox).toBeEnabled();
  await combobox.click();
  const option = page.getByRole('option').filter({ hasNotText: /select|choose/i }).first();
  await expect(option).toBeVisible();
  await option.click();
}

function reconcilePostedReturn(readback: Json, resourceId: string): void {
  expect(text(readback.return_id, 'return_id')).toBe(resourceId);
  expect(readback.status).toBe('posted');
  const direction = text(readback.inventory_direction, 'inventory_direction');
  expect(['receipt', 'issue']).toContain(direction);
  const sign = direction === 'receipt' ? 1n : -1n;

  const grandTotal = decimalUnits(readback.grand_total, 'grand_total');
  expect(decimalUnits(readback.adjustment_note_total, 'adjustment_note_total')).toBe(grandTotal);
  const debit = decimalUnits(readback.journal_debit_total, 'journal_debit_total');
  const credit = decimalUnits(readback.journal_credit_total, 'journal_credit_total');
  expect(debit).toBe(credit);
  expect(decimalUnits(readback.journal_line_debit_total, 'journal_line_debit_total')).toBe(debit);
  expect(decimalUnits(readback.journal_line_credit_total, 'journal_line_credit_total')).toBe(credit);

  const lines = array(readback.lines, 'return lines').map((line, index) => record(line, `return line ${index}`));
  expect(lines.length).toBeGreaterThan(0);
  const baseQuantities: bigint[] = [];
  const inventoryValues: bigint[] = [];
  for (const [index, line] of lines.entries()) {
    const billed = decimalUnits(line.base_billed_quantity, `line ${index} base_billed_quantity`);
    const free = decimalUnits(line.base_free_quantity, `line ${index} base_free_quantity`);
    const inventoryQuantity = decimalUnits(line.inventory_base_quantity, `line ${index} inventory_base_quantity`);
    const inventoryValue = decimalUnits(line.inventory_extended_cost, `line ${index} inventory_extended_cost`);
    expect(inventoryQuantity).toBe(billed + free);
    expect(decimalUnits(line.stock_quantity_delta, `line ${index} stock_quantity_delta`)).toBe(sign * inventoryQuantity);
    expect(decimalUnits(line.stock_value_delta, `line ${index} stock_value_delta`)).toBe(sign * inventoryValue);
    baseQuantities.push(inventoryQuantity);
    inventoryValues.push(inventoryValue);
  }
  expect(sum(baseQuantities)).toBe(decimalUnits(readback.inventory_total_base_quantity, 'inventory_total_base_quantity'));
  expect(sum(inventoryValues)).toBe(decimalUnits(readback.inventory_total_value, 'inventory_total_value'));

  const allocations = array(readback.allocations, 'return allocations')
    .map((allocation, index) => decimalUnits(record(allocation, `allocation ${index}`).amount, `allocation ${index} amount`));
  expect(sum(allocations) + decimalUnits(readback.residual_open_item_amount, 'residual_open_item_amount')).toBe(grandTotal);

  if (readback.gst_tax_treatment === 'commercial_only') {
    for (const field of ['gst_taxable_total', 'cgst_total', 'sgst_total', 'igst_total', 'cess_total']) {
      expect(decimalUnits(readback[field], field)).toBe(0n);
    }
    expect(readback.tax_document_id).toBeNull();
  } else {
    expect(text(readback.tax_document_id, 'tax_document_id')).toMatch(UUID);
    expect(decimalUnits(readback.tax_document_total, 'tax_document_total')).toBe(grandTotal);
  }
}

function reconcileCycleCount(readback: Json, commandId: string, resourceId: string): void {
  expect(text(readback.command_request_id, 'cycle command_request_id')).toBe(commandId);
  expect(text(readback.inventory_document_id, 'inventory_document_id')).toBe(resourceId);
  expect(readback.status).toBe('posted');
  expect(readback.journal_status).toBe('posted');
  const effect = text(readback.variance_effect, 'variance_effect');
  expect(['gain', 'loss']).toContain(effect);
  const totalQuantity = decimalUnits(readback.total_variance_base_quantity, 'total_variance_base_quantity');
  const totalValue = decimalUnits(readback.total_variance_value, 'total_variance_value');
  expect(decimalUnits(readback.journal_debit_total, 'cycle journal_debit_total')).toBe(totalValue);
  expect(decimalUnits(readback.journal_credit_total, 'cycle journal_credit_total')).toBe(totalValue);
  const lines = array(readback.lines, 'cycle lines').map((line, index) => record(line, `cycle line ${index}`));
  expect(lines.length).toBeGreaterThan(0);
  expect(sum(lines.map((line, index) => {
    const quantity = decimalUnits(line.variance_base_quantity, `cycle line ${index} variance_base_quantity`);
    return quantity < 0n ? -quantity : quantity;
  }))).toBe(totalQuantity);
  expect(sum(lines.map((line, index) => decimalUnits(line.variance_value, `cycle line ${index} variance_value`)))).toBe(totalValue);
  lines.forEach((line, index) => {
    const quantity = decimalUnits(line.variance_base_quantity, `cycle line ${index} variance_base_quantity`);
    const value = decimalUnits(line.variance_value, `cycle line ${index} variance_value`);
    const ledgerValue = decimalUnits(line.ledger_value_delta, `cycle line ${index} ledger_value_delta`);
    expect(quantity)
      .toBe(decimalUnits(line.ledger_quantity_delta, `cycle line ${index} ledger_quantity_delta`));
    expect(value).toBe(ledgerValue < 0n ? -ledgerValue : ledgerValue);
    expect(quantity > 0n ? 'gain' : 'loss').toBe(effect);
  });
}

test.describe('live disposable-org two-user approvals', () => {
  test.skip(
    process.env.PLAYWRIGHT_LIVE_WRITES !== 'true'
      || !configuration.baseURL.startsWith('https://')
      || !configuration.requesterEmail
      || !configuration.requesterPassword
      || !configuration.reviewerEmail
      || !configuration.reviewerPassword,
    'Requires HTTPS plus two explicitly provisioned live maker/checker browser credentials.',
  );
  test.skip(
    configuration.requesterEmail === configuration.reviewerEmail,
    'Requester and reviewer identities must be distinct.',
  );

  test('sales return, purchase return, and cycle count require independent approval and exact readback', async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const requesterContext = await browser.newContext({ baseURL: configuration.baseURL });
    const reviewerContext = await browser.newContext({ baseURL: configuration.baseURL });
    await requesterContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await reviewerContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const requester = await requesterContext.newPage();
    const reviewer = await reviewerContext.newPage();
    const executeCounts = new Map<string, number>();
    requester.on('request', request => {
      const path = new URL(request.url()).pathname;
      const match = /\/api\/web\/actions\/commands\/([0-9a-f-]+)\/execute$/.exec(path);
      if (request.method() === 'POST' && match) {
        executeCounts.set(match[1], (executeCounts.get(match[1]) || 0) + 1);
      }
    });

    try {
      await Promise.all([
        loginToLiveErp(requester, configuration.requesterEmail, configuration.requesterPassword),
        loginToLiveErp(reviewer, configuration.reviewerEmail, configuration.reviewerPassword),
      ]);

      // Maker prepares a sales return entirely through visible controls.
      await openReturns(requester, 'Sales Return');
      const customerSearch = requester.getByPlaceholder('Search customer by name, phone, or code...');
      await customerSearch.fill(configuration.customerQuery);
      await requester.getByText('Searching...').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
      await customerSearch.press('ArrowDown');
      await customerSearch.press('Enter');
      const invoiceButton = requester.getByRole('button', {
        name: new RegExp(escapeRegExp(configuration.invoicePattern), 'i'),
      }).first();
      await expect(invoiceButton).toBeVisible({ timeout: 30_000 });
      const contextResponse = waitForApi(requester, 'GET', /\/api\/canonical\/returns\/sales-invoices\/[0-9a-f-]+\/context$/);
      await invoiceButton.click();
      const returnContext = await successfulJson(await contextResponse, 'sales-return context');
      expect(text(returnContext.approval_policy, 'return approval_policy')).toBe('separate_approver');
      const returnableLines = array(returnContext.lines, 'returnable sales lines').map((line, index) => {
        const source = record(line, `source line ${index}`);
        decimalUnits(source.returnable_billed_quantity, `source ${index} returnable billed`);
        decimalUnits(source.returnable_free_quantity, `source ${index} returnable free`);
        return source;
      });

      await chooseFirstCustomOption(requester, 'Select reason...');
      await requester.getByRole('combobox', { name: 'GST treatment' }).click();
      await requester.getByRole('option', { name: 'Commercial only (no GST adjustment)' }).click();

      // Do not rely on the form's initial defaults: explicitly choose one exact
      // returnable unit through the row's editable quantity controls.
      const chosenLine = returnableLines.find(line => (
        decimalUnits(line.returnable_billed_quantity, 'candidate returnable billed') >= SCALE
        || decimalUnits(line.returnable_free_quantity, 'candidate returnable free') >= SCALE
      ));
      expect(chosenLine, 'seeded invoice must expose at least one whole returnable unit').toBeDefined();
      const productName = text(chosenLine?.product_name, 'return product_name');
      const returnRow = requester.getByRole('row', { name: new RegExp(escapeRegExp(productName), 'i') });
      const returnQuantityInputs = returnRow.getByRole('spinbutton');
      expect(await returnQuantityInputs.count(), 'return row paid/free/rate inputs').toBeGreaterThanOrEqual(3);
      if (decimalUnits(chosenLine?.returnable_billed_quantity, 'selected returnable billed') >= SCALE) {
        await returnQuantityInputs.nth(0).fill('1');
        await returnQuantityInputs.nth(0).press('Tab');
        await returnQuantityInputs.nth(1).fill('0');
        await returnQuantityInputs.nth(1).press('Tab');
      } else {
        await returnQuantityInputs.nth(0).fill('0');
        await returnQuantityInputs.nth(0).press('Tab');
        await returnQuantityInputs.nth(1).fill('1');
        await returnQuantityInputs.nth(1).press('Tab');
      }
      const conditions = requester.getByRole('combobox', { name: /Return condition for/ });
      for (let index = 0; index < await conditions.count(); index += 1) {
        await conditions.nth(index).selectOption('sealed_resaleable');
      }
      const quarantineLocations = requester.getByRole('combobox', { name: /Quarantine location for/ });
      for (let index = 0; index < await quarantineLocations.count(); index += 1) {
        if (!(await quarantineLocations.nth(index).inputValue())) {
          await quarantineLocations.nth(index).selectOption({ index: 1 });
        }
      }
      await requester.getByRole('button', { name: 'Proceed to Review', exact: true }).click();
      await expect(requester.getByText('Review Sales Return')).toBeVisible();
      const returnPrepareResponse = waitForApi(requester, 'POST', /\/api\/web\/actions\/sales\.return\.prepare\/prepare$/);
      await requester.getByRole('button', { name: 'Confirm Return', exact: true }).click();
      const returnPrepare = await returnPrepareResponse;
      assertDecimalPayloadStrings(returnPrepare.request().postDataJSON());
      const returnPrepared = await successfulJson(returnPrepare, 'sales-return prepare');
      const returnCommandId = text(returnPrepared.command_request_id, 'return command_request_id');
      expect(returnCommandId).toMatch(UUID);
      expect(text(returnPrepared.preview_hash, 'return preview_hash')).toMatch(/^sha256:[0-9a-f]{64}$/i);
      await expect(requester.getByText(new RegExp(returnCommandId))).toBeVisible();
      await attachScreenshot(requester, testInfo, 'return-maker-prepared');

      // The maker cannot see or approve its own command through the approval UI.
      const requesterSelfReview = await requesterContext.newPage();
      await requesterSelfReview.goto('/');
      await expect(requesterSelfReview.getByText('Core Operations')).toBeVisible();
      await openReturns(requesterSelfReview, 'Approvals');
      await requesterSelfReview.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(requesterSelfReview.getByText(returnCommandId, { exact: true })).toHaveCount(0);
      await expect(requesterSelfReview.getByRole('button', { name: 'Approve — requester posts later' })).toHaveCount(0);
      await requesterSelfReview.close();

      // A distinct checker approves the immutable preview, but cannot post it.
      await openReturns(reviewer, 'Approvals');
      await reviewer.getByRole('button', { name: 'Refresh', exact: true }).click();
      await reviewer.getByRole('button', { name: new RegExp(returnCommandId) }).click();
      await expect(reviewer.getByLabel('Immutable canonical return preview')).toBeVisible();
      await expect(reviewer.getByRole('button', { name: /Post Approved Return/ })).toHaveCount(0);
      await reviewer.getByRole('checkbox', { name: /I reviewed the exact source/ }).check();
      const returnApprovalResponse = waitForApi(reviewer, 'POST', new RegExp(`/api/web/actions/commands/${returnCommandId}/approve$`));
      await reviewer.getByRole('button', { name: 'Approve — requester posts later' }).click();
      const returnApproval = await successfulJson(await returnApprovalResponse, 'independent sales-return approval');
      expect(text(returnApproval.command_request_id, 'approved return command')).toBe(returnCommandId);
      await attachScreenshot(reviewer, testInfo, 'return-checker-approved');

      // The original maker resumes, posts once, and the UI performs exact GET readback.
      await openReturns(requester, 'Resume / Post');
      await requester.getByRole('button', { name: 'Refresh', exact: true }).click();
      const commandRow = requester.getByRole('row', { name: new RegExp(returnCommandId) });
      await commandRow.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(requester.getByText('Approved — ready to post')).toBeVisible();
      await requester.getByRole('checkbox', { name: /Post this exact approved preview/ }).check();
      const returnExecutionResponse = waitForApi(requester, 'POST', new RegExp(`/api/web/actions/commands/${returnCommandId}/execute$`));
      const returnReadbackResponse = waitForApi(requester, 'GET', /\/api\/canonical\/returns\/sales\/[0-9a-f-]+$/);
      await requester.getByRole('button', { name: 'Post Approved Return', exact: true }).click();
      const returnExecution = await successfulJson(await returnExecutionResponse, 'sales-return execute');
      const returnResourceId = text(returnExecution.resource_id, 'return resource_id');
      expect(returnResourceId).toMatch(UUID);
      const capturedReturnReadback = await returnReadbackResponse;
      expect(new URL(capturedReturnReadback.url()).pathname).toBe(`/api/canonical/returns/sales/${returnResourceId}`);
      const returnReadback = await successfulJson(capturedReturnReadback, 'sales-return posted readback');
      reconcilePostedReturn(returnReadback, returnResourceId);
      await expect(requester.getByText(returnResourceId, { exact: true })).toBeVisible();
      await expect(requester.getByRole('button', { name: 'Post Approved Return' })).toHaveCount(0);
      expect(executeCounts.get(returnCommandId), 'sales-return execute must be emitted exactly once').toBe(1);
      await attachScreenshot(requester, testInfo, 'return-posted-reconciled');

      // Reopening a succeeded command is GET-only and never reveals a second execute CTA.
      await requester.getByRole('button', { name: 'Refresh', exact: true }).click();
      await requester.getByRole('row', { name: new RegExp(returnCommandId) })
        .getByRole('button', { name: 'Open', exact: true }).click();
      await expect(requester.getByText('Posted', { exact: true })).toBeVisible();
      await expect(requester.getByRole('button', { name: 'Post Approved Return' })).toHaveCount(0);
      expect(executeCounts.get(returnCommandId)).toBe(1);

      // A purchase return independently proves supplier-invoice → receipt allocation
      // → GRN line → batch/location lineage before the same maker/checker lifecycle.
      await openReturns(requester, 'Purchase Return');
      await chooseFirstCustomOption(requester, 'Select reason...');
      const supplierSearch = requester.getByPlaceholder('Search supplier by name, phone, or code...');
      await supplierSearch.fill(configuration.supplierQuery);
      await requester.getByText('Searching...').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
      await supplierSearch.press('ArrowDown');
      await supplierSearch.press('Enter');
      const supplierInvoiceButton = requester.getByRole('button', {
        name: new RegExp(`Select supplier invoice ${escapeRegExp(configuration.supplierInvoicePattern)}`, 'i'),
      }).first();
      await expect(
        supplierInvoiceButton,
        'Disposable staging must expose an unreturned canonical supplier invoice with exact receipt lineage.',
      ).toBeVisible({ timeout: 30_000 });
      const purchaseContextResponse = waitForApi(
        requester,
        'GET',
        /\/api\/canonical\/returns\/supplier-invoices\/[0-9a-f-]+\/context$/,
      );
      await supplierInvoiceButton.click();
      const purchaseContext = await successfulJson(await purchaseContextResponse, 'purchase-return context');
      expect(text(purchaseContext.approval_policy, 'purchase approval_policy')).toBe('separate_approver');
      const purchaseLines = array(purchaseContext.lines, 'purchase returnable lines').map((line, index) => {
        const source = record(line, `purchase source line ${index}`);
        for (const identity of [
          'supplier_invoice_line_id',
          'supplier_invoice_receipt_allocation_id',
          'goods_receipt_id',
          'goods_receipt_line_id',
          'batch_id',
          'from_location_id',
        ]) {
          expect(text(source[identity], `purchase source ${index} ${identity}`)).toMatch(UUID);
        }
        decimalUnits(source.returnable_billed_quantity, `purchase source ${index} returnable billed`);
        decimalUnits(source.returnable_free_quantity, `purchase source ${index} returnable free`);
        return source;
      });
      const chosenPurchaseLine = purchaseLines.find(line => (
        decimalUnits(line.returnable_billed_quantity, 'purchase candidate billed') >= SCALE
        || decimalUnits(line.returnable_free_quantity, 'purchase candidate free') >= SCALE
      ));
      expect(chosenPurchaseLine, 'supplier invoice must expose at least one whole returnable unit').toBeDefined();
      const purchaseProduct = text(chosenPurchaseLine?.product_name, 'purchase return product_name');
      const billedInput = requester.getByRole('textbox', { name: `Billed quantity for ${purchaseProduct}` });
      const freeInput = requester.getByRole('textbox', { name: `Free quantity for ${purchaseProduct}` });
      if (decimalUnits(chosenPurchaseLine?.returnable_billed_quantity, 'chosen purchase billed') >= SCALE) {
        await billedInput.fill('1');
        await freeInput.fill('0');
      } else {
        await billedInput.fill('0');
        await freeInput.fill('1');
      }
      await requester.getByRole('combobox', { name: 'GST treatment' }).click();
      await requester.getByRole('option', { name: 'Commercial only (no GST adjustment)' }).click();
      const destination = requester.getByRole('combobox', { name: 'Supplier destination' });
      if (!(await destination.textContent())?.trim() || /choose verified address/i.test((await destination.textContent()) || '')) {
        await destination.click();
        await requester.getByRole('option').filter({ hasNotText: /Choose/ }).first().click();
      }
      await requester.getByRole('button', { name: 'Proceed to Review', exact: true }).click();
      await expect(requester.getByText('Review Purchase Return')).toBeVisible();
      const purchasePrepareResponse = waitForApi(
        requester,
        'POST',
        /\/api\/web\/actions\/procurement\.purchase_return\.prepare\/prepare$/,
      );
      await requester.getByRole('button', { name: 'Prepare Immutable Return', exact: true }).click();
      const purchasePrepare = await purchasePrepareResponse;
      assertDecimalPayloadStrings(purchasePrepare.request().postDataJSON());
      const purchasePrepared = await successfulJson(purchasePrepare, 'purchase-return prepare');
      const purchaseCommandId = text(purchasePrepared.command_request_id, 'purchase command_request_id');
      expect(purchaseCommandId).toMatch(UUID);
      await expect(requester.getByText(new RegExp(purchaseCommandId))).toBeVisible();
      await attachScreenshot(requester, testInfo, 'purchase-return-maker-prepared');

      await openReturns(reviewer, 'Approvals');
      await reviewer.getByRole('button', { name: 'Refresh', exact: true }).click();
      await reviewer.getByRole('button', { name: new RegExp(purchaseCommandId) }).click();
      const purchasePreview = reviewer.getByLabel('Immutable canonical return preview');
      await expect(purchasePreview).toBeVisible();
      await expect(purchasePreview).toContainText(
        text(chosenPurchaseLine?.supplier_invoice_receipt_allocation_id, 'reviewed purchase allocation'),
      );
      await reviewer.getByRole('checkbox', { name: /I reviewed the exact source/ }).check();
      const purchaseApprovalResponse = waitForApi(
        reviewer,
        'POST',
        new RegExp(`/api/web/actions/commands/${purchaseCommandId}/approve$`),
      );
      await reviewer.getByRole('button', { name: 'Approve — requester posts later' }).click();
      const purchaseApproval = await successfulJson(await purchaseApprovalResponse, 'independent purchase-return approval');
      expect(text(purchaseApproval.command_request_id, 'approved purchase command')).toBe(purchaseCommandId);
      await attachScreenshot(reviewer, testInfo, 'purchase-return-checker-approved');

      await openReturns(requester, 'Resume / Post');
      await requester.getByRole('button', { name: 'Refresh', exact: true }).click();
      await requester.getByRole('row', { name: new RegExp(purchaseCommandId) })
        .getByRole('button', { name: 'Open', exact: true }).click();
      await expect(requester.getByText('Approved — ready to post')).toBeVisible();
      await requester.getByRole('checkbox', { name: /Post this exact approved preview/ }).check();
      const purchaseExecutionResponse = waitForApi(
        requester,
        'POST',
        new RegExp(`/api/web/actions/commands/${purchaseCommandId}/execute$`),
      );
      const purchaseReadbackResponse = waitForApi(requester, 'GET', /\/api\/canonical\/returns\/purchases\/[0-9a-f-]+$/);
      await requester.getByRole('button', { name: 'Post Approved Return', exact: true }).click();
      const purchaseExecution = await successfulJson(await purchaseExecutionResponse, 'purchase-return execute');
      const purchaseResourceId = text(purchaseExecution.resource_id, 'purchase return resource_id');
      expect(purchaseResourceId).toMatch(UUID);
      const capturedPurchaseReadback = await purchaseReadbackResponse;
      expect(new URL(capturedPurchaseReadback.url()).pathname).toBe(`/api/canonical/returns/purchases/${purchaseResourceId}`);
      const purchaseReadback = await successfulJson(capturedPurchaseReadback, 'purchase-return posted readback');
      reconcilePostedReturn(purchaseReadback, purchaseResourceId);
      await expect(requester.getByText(purchaseResourceId, { exact: true })).toBeVisible();
      await expect(requester.getByRole('button', { name: 'Post Approved Return' })).toHaveCount(0);
      expect(executeCounts.get(purchaseCommandId), 'purchase-return execute must be emitted exactly once').toBe(1);
      await attachScreenshot(requester, testInfo, 'purchase-return-posted-reconciled');

      await requester.getByRole('button', { name: 'Refresh', exact: true }).click();
      await requester.getByRole('row', { name: new RegExp(purchaseCommandId) })
        .getByRole('button', { name: 'Open', exact: true }).click();
      await expect(requester.getByRole('button', { name: 'Post Approved Return' })).toHaveCount(0);
      expect(executeCounts.get(purchaseCommandId)).toBe(1);

      // Maker prepares a one-UOM ordinary cycle-count shortage from canonical eligibility strings.
      await openAdjustment(requester);
      const productSearch = requester.getByPlaceholder('Search and select product...');
      await productSearch.fill(configuration.productQuery);
      const productOption = requester.getByRole('option', { name: new RegExp(escapeRegExp(configuration.productQuery), 'i') }).first();
      await expect(productOption).toBeVisible({ timeout: 30_000 });
      await productOption.click();
      const batchOption = requester.getByRole('option', { name: new RegExp(`Select batch ${escapeRegExp(configuration.batchPattern)}`, 'i') }).first();
      await expect(batchOption).toBeVisible({ timeout: 30_000 });
      const eligibilityResponse = waitForApi(requester, 'GET', /\/api\/web\/actions\/inventory-adjustment\/eligibility$/);
      await batchOption.click();
      const eligibility = await successfulJson(await eligibilityResponse, 'cycle-count eligibility');
      const systemUnits = decimalUnits(eligibility.system_base_quantity, 'eligibility system_base_quantity');
      const uom = record(array(eligibility.uom_conversions, 'eligibility UOM conversions')[0], 'eligibility UOM');
      const multiplierUnits = decimalUnits(uom.multiplier, 'eligibility UOM multiplier');
      expect(systemUnits % multiplierUnits, 'seeded stock must convert exactly to its chosen count UOM').toBe(0n);
      expect(systemUnits, 'seeded stock must cover the ordinary one-UOM shortage').toBeGreaterThanOrEqual(multiplierUnits);
      const countedQuantity = decimalText((systemUnits * SCALE) / multiplierUnits - SCALE);
      const evidenceSection = requester.getByRole('heading', { name: 'Adjustment Details' }).locator('..');
      const evidenceCombobox = evidenceSection.getByRole('combobox');
      await evidenceCombobox.click();
      await requester.getByRole('option').filter({ hasNotText: /Select/ }).first().click();
      await requester.getByRole('textbox', { name: /Exact physical count in/ }).fill(countedQuantity);
      await requester.getByRole('button', { name: 'Proceed to Review', exact: true }).click();
      const cyclePrepareResponse = waitForApi(requester, 'POST', /\/api\/web\/actions\/inventory\.adjustment\.prepare\/prepare$/);
      await requester.getByRole('button', { name: 'Prepare Cycle Count', exact: true }).click();
      const cyclePrepare = await cyclePrepareResponse;
      assertDecimalPayloadStrings(cyclePrepare.request().postDataJSON());
      const cyclePrepared = await successfulJson(cyclePrepare, 'cycle-count prepare');
      const cycleCommandId = text(cyclePrepared.command_request_id, 'cycle command_request_id');
      expect(cycleCommandId).toMatch(UUID);
      await expect(requester.getByRole('dialog', { name: 'Confirm Stock Adjustment' })).toContainText(cycleCommandId);
      await requester.getByRole('button', { name: 'Submit for Independent Approval' }).click();
      await attachScreenshot(requester, testInfo, 'cycle-maker-prepared');

      // The maker's visible review control must fail closed for self-approval.
      const requesterCycleReview = await requesterContext.newPage();
      await requesterCycleReview.goto('/');
      await expect(requesterCycleReview.getByText('Core Operations')).toBeVisible();
      await openAdjustment(requesterCycleReview);
      await requesterCycleReview.getByRole('textbox', { name: 'Cycle-count command UUID to review' }).fill(cycleCommandId);
      const selfReviewResponsePromise = waitForApi(
        requesterCycleReview,
        'GET',
        new RegExp(`/api/web/actions/inventory-adjustment/commands/${cycleCommandId}/review$`),
      );
      await requesterCycleReview.getByRole('button', { name: 'Load immutable preview' }).click();
      const selfReviewResponse = await selfReviewResponsePromise;
      expect([403, 404], await selfReviewResponse.text()).toContain(selfReviewResponse.status());
      await expect(requesterCycleReview.getByRole('button', { name: 'Approve exact preview' })).toHaveCount(0);
      await requesterCycleReview.close();

      // The checker loads and approves the exact cycle-count command through visible controls.
      await openAdjustment(reviewer);
      await reviewer.getByRole('textbox', { name: 'Cycle-count command UUID to review' }).fill(cycleCommandId);
      const cycleReviewResponse = waitForApi(reviewer, 'GET', new RegExp(`/api/web/actions/inventory-adjustment/commands/${cycleCommandId}/review$`));
      await reviewer.getByRole('button', { name: 'Load immutable preview' }).click();
      const cycleReview = await successfulJson(await cycleReviewResponse, 'cycle-count immutable review');
      expect(text(cycleReview.preview_hash, 'cycle review preview_hash')).toBe(text(cyclePrepared.preview_hash, 'cycle prepared preview_hash'));
      const cycleApprovalResponse = waitForApi(reviewer, 'POST', new RegExp(`/api/web/actions/commands/${cycleCommandId}/approve$`));
      await reviewer.getByRole('button', { name: 'Approve exact preview' }).click();
      const cycleApproval = await successfulJson(await cycleApprovalResponse, 'cycle-count independent approval');
      expect(text(cycleApproval.command_request_id, 'approved cycle command')).toBe(cycleCommandId);
      await attachScreenshot(reviewer, testInfo, 'cycle-checker-approved');

      // The original maker executes once; readback proves stock and valuation journal equality.
      await requester.getByRole('button', { name: 'Execute Approved Count', exact: true }).click();
      const cycleExecutionResponse = waitForApi(requester, 'POST', new RegExp(`/api/web/actions/commands/${cycleCommandId}/execute$`));
      const cycleReadbackResponse = waitForApi(
        requester,
        'GET',
        new RegExp(`/api/web/actions/inventory-adjustment/commands/${cycleCommandId}/readback$`),
      );
      await requester.getByRole('dialog', { name: 'Confirm Stock Adjustment' })
        .getByRole('button', { name: 'Execute Approved Count' }).click();
      const cycleExecution = await successfulJson(await cycleExecutionResponse, 'cycle-count execute');
      const cycleResourceId = text(cycleExecution.resource_id, 'cycle inventory resource_id');
      expect(cycleResourceId).toMatch(UUID);
      const cycleReadback = await successfulJson(await cycleReadbackResponse, 'cycle-count posted readback');
      reconcileCycleCount(cycleReadback, cycleCommandId, cycleResourceId);
      await expect(requester.getByText(cycleResourceId, { exact: true })).toBeVisible();
      await expect(requester.getByRole('button', { name: 'Execute Approved Count' })).toHaveCount(0);
      expect(executeCounts.get(cycleCommandId), 'cycle execute must be emitted exactly once').toBe(1);
      await attachScreenshot(requester, testInfo, 'cycle-posted-reconciled');
      await waitForErpToSettle(requester);
    } finally {
      const requesterTrace = testInfo.outputPath('requester-maker-trace.zip');
      const reviewerTrace = testInfo.outputPath('reviewer-checker-trace.zip');
      await Promise.all([
        requesterContext.tracing.stop({ path: requesterTrace }).catch(() => undefined),
        reviewerContext.tracing.stop({ path: reviewerTrace }).catch(() => undefined),
      ]);
      await Promise.all([
        testInfo.attach('requester-maker-trace', { path: requesterTrace, contentType: 'application/zip' }).catch(() => undefined),
        testInfo.attach('reviewer-checker-trace', { path: reviewerTrace, contentType: 'application/zip' }).catch(() => undefined),
      ]);
      await Promise.all([
        requesterContext.close().catch(() => undefined),
        reviewerContext.close().catch(() => undefined),
      ]);
    }
  });
});
