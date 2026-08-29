/* eslint-disable jest/valid-expect, jest/valid-title, testing-library/prefer-screen-queries */
// True visible-UI evidence: network inspection below is readback only.
import { expect, Page, Response, test } from '@playwright/test';
import {
  authorizedJsonGet,
  chooseHubModule,
  loginToLiveErp,
  openHomeAction,
  returnHome,
} from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password)
  && process.env.PLAYWRIGHT_LIVE_WRITES === 'true';

const response = (page: Page, method: string, path: RegExp): Promise<Response> =>
  page.waitForResponse(r => r.request().method() === method && path.test(new URL(r.url()).pathname), { timeout: 45_000 });
const json = async (r: Response): Promise<any> => {
  const text = await r.text(); expect(r.status(), text).toBeGreaterThanOrEqual(200); expect(r.status(), text).toBeLessThan(300);
  return JSON.parse(text);
};
async function choose(page: Page, placeholder: RegExp, query: string, option: RegExp): Promise<void> {
  await page.getByPlaceholder(placeholder).fill(query); await page.getByText(option).first().click();
}

test.describe('live desktop sales-chain visible UI acceptance', () => {
  test.skip(!enabled, 'Requires HTTPS test ERP credentials and explicit PLAYWRIGHT_LIVE_WRITES=true');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });
  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('mandatory fields fail closed, then Order -> Challan -> Invoice posts through visible CTAs', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await openHomeAction(page, 'Sales'); await chooseHubModule(page, 'Sales', 'Sales Order');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/select a customer|add at least one item/i).first()).toBeVisible();
    await choose(page, /search customer/i, 'Demo Retail', /Demo Retail/i);
    await choose(page, /search product/i, 'Synthetic Corrugated', /Synthetic Corrugated Pharmacy Packing Carton/i);
    const orderDate = await page.getByLabel('Order Date').inputValue();
    expect(orderDate, 'canonical order business date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.getByLabel('Expected Delivery').fill(orderDate);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: 'Generate Order', exact: true }).click();
    const orderReview = page.getByRole('dialog', { name: 'Review exact sales order' });
    await expect(orderReview).toBeVisible();
    await orderReview.getByRole('checkbox').check();
    const orderExecute = response(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const orderReadback = response(page, 'GET', /\/api\/canonical\/sales-orders\/[0-9a-f-]+\/acceptance-readback$/);
    await orderReview.getByRole('button', { name: 'Approve & Post' }).click();
    const order = await json(await orderExecute); expect(String(order.resource_id)).toMatch(/^[0-9a-f-]{36}$/i);
    const orderDetail = await json(await orderReadback);
    await page.screenshot({ path: testInfo.outputPath('sales-order-posted.png'), fullPage: true });

    await returnHome(page); await openHomeAction(page, 'Sales'); await chooseHubModule(page, 'Sales', 'Delivery Challan');
    await page.getByRole('button', { name: /import/i }).click();
    await page.getByRole('button', { name: /sales order/i }).click();
    await page.getByText(String(orderDetail.order_number), { exact: true }).first().click();
    await page.getByRole('button', { name: 'Import to Challan', exact: true }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByLabel('Exact distance (km)').fill('1.00');
    await page.getByRole('button', { name: 'Generate Challan', exact: true }).click();
    const dispatchReview = page.getByRole('dialog', { name: 'Review exact delivery dispatch' });
    await expect(dispatchReview).toBeVisible();
    await dispatchReview.getByRole('checkbox').check();
    const dispatchExecute = response(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const dispatchReadback = response(page, 'GET', /\/api\/canonical\/sales-dispatches\/[0-9a-f-]+\/acceptance-readback$/);
    await dispatchReview.getByRole('button', { name: 'Approve & Post' }).click();
    const dispatch = await json(await dispatchExecute); expect(String(dispatch.resource_id)).toMatch(/^[0-9a-f-]{36}$/i);
    const dispatchDetail = await json(await dispatchReadback);
    await page.screenshot({ path: testInfo.outputPath('dispatch-posted.png'), fullPage: true });

    await returnHome(page); await openHomeAction(page, 'Sales'); await chooseHubModule(page, 'Sales', 'Create Invoice');
    await page.getByRole('button', { name: /import/i }).click();
    await page.getByRole('button', { name: /delivery challan/i }).click();
    await page.getByText(String(dispatchDetail.challan_number), { exact: true }).first().click();
    await page.getByRole('button', { name: 'Import Selected', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /continue to preview/i }).click();
    const invoicePrepareRequest = page.waitForRequest(request => request.method() === 'POST'
      && /\/api\/web\/actions\/sales\.invoice\.prepare\/prepare$/.test(new URL(request.url()).pathname));
    await page.getByRole('button', { name: 'Generate Invoice', exact: true }).click();
    const invoicePrepare = (await invoicePrepareRequest).postDataJSON();
    expect(invoicePrepare.lines[0].billed_quantity).toBe(dispatchDetail.lines[0].billed_quantity);
    expect(invoicePrepare.lines[0].free_quantity).toBe(dispatchDetail.lines[0].free_quantity);
    expect(invoicePrepare.lines[0].dispatch_allocations).toEqual([{
      dispatch_line_id: dispatchDetail.lines[0].dispatch_line_id,
      allocated_base_billed_quantity: dispatchDetail.lines[0].base_billed_quantity,
      allocated_base_free_quantity: dispatchDetail.lines[0].base_free_quantity,
    }]);
    const invoiceReview = page.getByRole('dialog', { name: 'Review exact sales invoice' });
    await expect(invoiceReview).toBeVisible();
    await invoiceReview.getByRole('checkbox').check();
    const invoiceExecute = response(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const invoiceReadback = response(page, 'GET', /\/api\/canonical\/sales-invoices\/[0-9a-f-]+\/posting-readback$/);
    await invoiceReview.getByRole('button', { name: 'Approve & Post' }).click();
    const invoice = await json(await invoiceExecute); expect(String(invoice.resource_id)).toMatch(/^[0-9a-f-]{36}$/i);
    const invoiceDetail = await json(await invoiceReadback);
    expect(String(invoiceDetail.sales_invoice_id)).toBe(String(invoice.resource_id));
    expect(invoiceDetail.inventory_fulfillment).toBe('dispatch_issue');
    expect(invoiceDetail.invoice_inventory_document_id).toBeNull();
    expect(invoiceDetail.inventory_evidence.every((item: any) => item.source_kind === 'dispatch_issue')).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('sales-invoice-posted.png'), fullPage: true });
    await testInfo.attach('visible-sales-chain-created-ids.json', { contentType: 'application/json', body: JSON.stringify({
      sales_order_id: order.resource_id, dispatch_id: dispatch.resource_id, sales_invoice_id: invoice.resource_id,
    }, null, 2) });
  });

  test('direct invoice visibly recommends FEFO, posts an explicit same-tier batch, and reconciles exact readback', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openHomeAction(page, 'Sales'); await chooseHubModule(page, 'Sales', 'Create Invoice');
    await choose(page, /search customer/i, 'Demo Retail', /Demo Retail/i);
    await page.getByPlaceholder(/search product/i).fill('Synthetic Corrugated');
    await page.getByText(/Synthetic Corrugated Pharmacy Packing Carton/i).first().click();
    const dialog = page.getByRole('dialog');
    const recommended = dialog.getByRole('option').filter({ hasText: /Recommended FEFO batch/i });
    await expect(recommended).toHaveCount(1);
    const explicitAlternative = dialog.getByRole('option').filter({ hasNotText: /Recommended FEFO batch|Unavailable/i });
    expect(await explicitAlternative.count(), 'fixture needs a second eligible batch in the earliest-expiry FEFO tier').toBeGreaterThan(0);
    // Default recommendation is deterministic; the user can explicitly choose another eligible batch in the same FEFO tier.
    const selectedBatchId = await explicitAlternative.first().getAttribute('data-batch-id');
    expect(selectedBatchId).toMatch(/^[0-9a-f-]{36}$/i);
    await explicitAlternative.first().click();
    const row = page.getByRole('row').filter({ hasText: /Synthetic Corrugated Pharmacy Packing Carton/i });
    await row.locator('input[type="number"]').nth(0).fill('1.125000');
    await row.locator('input[type="number"]').nth(1).fill('84.1250');
    await row.locator('input[type="number"]').nth(3).fill('0.250000');
    await expect(row.locator('input[type="number"]').nth(0)).toHaveValue('1.125000');
    await expect(row.locator('input[type="number"]').nth(1)).toHaveValue('84.1250');
    await expect(row.locator('input[type="number"]').nth(3)).toHaveValue('0.250000');
    await expect(page.getByText(/batch/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /continue to preview/i }).click();
    const prepareRequest = page.waitForRequest(request => request.method() === 'POST'
      && /\/api\/web\/actions\/sales\.invoice\.prepare\/prepare$/.test(new URL(request.url()).pathname));
    await page.getByRole('button', { name: 'Generate Invoice', exact: true }).click();
    const preparedPayload = (await prepareRequest).postDataJSON();
    expect(preparedPayload.lines[0].billed_quantity).toBe('1.125000');
    expect(preparedPayload.lines[0].free_quantity).toBe('0.250000');
    expect(preparedPayload.lines[0].quoted_unit_rate).toBe('84.1250');
    expect(preparedPayload.lines[0].batch_allocations).toEqual([
      expect.objectContaining({ batch_id: selectedBatchId }),
    ]);
    const review = page.getByRole('dialog', { name: 'Review exact sales invoice' });
    await expect(review).toBeVisible();
    await review.getByRole('checkbox').check();
    const executePromise = response(page, 'POST', /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/);
    const postingReadbackPromise = response(
      page,
      'GET',
      /\/api\/canonical\/sales-invoices\/[0-9a-f-]+\/posting-readback$/,
    );
    await review.getByRole('button', { name: 'Approve & Post' }).click();
    const executedResponse = await executePromise;
    const executed = await json(executedResponse);
    expect(String(executed.resource_id)).toMatch(/^[0-9a-f-]{36}$/i);
    const postingReadback = await json(await postingReadbackPromise);
    expect(String(postingReadback.sales_invoice_id)).toBe(String(executed.resource_id));
    expect(postingReadback.status).toBe('posted');
    expect(postingReadback.inventory_fulfillment).toBe('direct_invoice_issue');
    expect(postingReadback.invoice_inventory_document_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(postingReadback.invoice_lines).toHaveLength(1);
    expect(postingReadback.invoice_lines[0]).toEqual(expect.objectContaining({
      billed_quantity: '1.125000',
      free_quantity: '0.250000',
      base_billed_quantity: '1.125000',
      base_free_quantity: '0.250000',
    }));
    expect(postingReadback.journal_debit_total).toBe(postingReadback.journal_credit_total);
    expect(postingReadback.receivable_principal).toBe(postingReadback.invoice_total);
    expect(postingReadback.receivable_outstanding).toBe(postingReadback.invoice_total);
    expect(postingReadback.inventory_base_quantity).toBe('1.375000');
    expect(postingReadback.inventory_evidence).toHaveLength(1);
    expect(postingReadback.inventory_evidence[0]).toEqual(expect.objectContaining({
      source_kind: 'direct_invoice_issue',
      allocated_base_billed_quantity: '1.125000',
      allocated_base_free_quantity: '0.250000',
      ledger_base_quantity: '1.375000',
    }));

    const invoiceDetail = await authorizedJsonGet(
      page,
      executedResponse,
      `/canonical/invoices/${executed.resource_id}`,
    );
    expect(invoiceDetail.status).toBe('posted');
    expect(invoiceDetail.items).toHaveLength(1);
    expect(invoiceDetail.items[0]).toEqual(expect.objectContaining({
      quantity: '1.125000',
      free_quantity: '0.250000',
      base_billed_quantity: '1.125000',
      base_free_quantity: '0.250000',
      unit_price: '84.1250',
    }));
    expect(invoiceDetail.items[0].batch_id).toBe(selectedBatchId);
    expect(invoiceDetail.items[0].batch_allocations).toHaveLength(1);
    expect(invoiceDetail.items[0].batch_allocations[0]).toEqual(expect.objectContaining({
      source_kind: 'direct_issue',
      batch_id: selectedBatchId,
      base_quantity: '1.375000',
      entered_quantity: '1.375000',
      billed_quantity: '1.125000',
      free_quantity: '0.250000',
      base_billed_quantity: '1.125000',
      base_free_quantity: '0.250000',
      inventory_document_id: postingReadback.invoice_inventory_document_id,
      inventory_document_line_id: postingReadback.inventory_evidence[0].inventory_document_line_id,
    }));

    await expect(page.getByText('Invoice Created!', { exact: true })).toBeVisible();
    const canonicalOutputRead = response(
      page,
      'GET',
      new RegExp(`/api/canonical/invoices/${executed.resource_id}$`),
    );
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const canonicalOutputResponse = await canonicalOutputRead;
    expect(canonicalOutputResponse.status()).toBe(200);
    const downloadedPdf = await pdfDownload;
    expect(downloadedPdf.suggestedFilename()).toBe(`${invoiceDetail.invoice_number}.pdf`);
    await page.screenshot({ path: testInfo.outputPath('direct-invoice-explicit-batch-posted.png'), fullPage: true });
    await testInfo.attach('direct-invoice-authoritative-readback.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        sales_invoice_id: executed.resource_id,
        selected_batch_id: selectedBatchId,
        inventory_document_id: postingReadback.invoice_inventory_document_id,
        inventory_document_line_id: postingReadback.inventory_evidence[0].inventory_document_line_id,
        inventory_evidence_count: postingReadback.inventory_evidence.length,
        executed_batch_allocation_count: invoiceDetail.items[0].batch_allocations.length,
      }, null, 2),
    });
  });
});
