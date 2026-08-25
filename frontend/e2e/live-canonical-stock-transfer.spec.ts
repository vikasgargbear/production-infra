/* eslint-disable jest/valid-expect, jest/valid-title, testing-library/prefer-screen-queries */
import { expect, test } from '@playwright/test';

import { chooseHubModule, loginToLiveErp, openHomeAction } from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const productQuery = process.env.PLAYWRIGHT_LIVE_TRANSFER_PRODUCT_QUERY || 'Synthetic Corrugated';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password)
  && process.env.PLAYWRIGHT_LIVE_WRITES === 'true';

test.describe('live canonical desktop inter-branch stock transfer', () => {
  test.skip(!enabled, 'Requires deployed transfer migration, HTTPS test ERP credentials, and PLAYWRIGHT_LIVE_WRITES=true');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });

  test('UI prepare/review/execute once and API exact readback', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginToLiveErp(page, email, password);
    await openHomeAction(page, 'Stock Management');
    const contextPromise = page.waitForResponse((response) => (
      response.request().method() === 'GET'
      && /\/api\/canonical\/inventory\/context$/.test(new URL(response.url()).pathname)
    ));
    await chooseHubModule(page, 'Stock', 'Transfer');
    await expect(page.getByRole('heading', { name: 'Inter-branch Stock Transfer' })).toBeVisible();

    const contextResponse = await contextPromise;
    expect(contextResponse.status()).toBe(200);
    const context = await contextResponse.json();
    expect(context.branches.length).toBeGreaterThanOrEqual(2);

    await page.getByLabel('Source branch').selectOption(context.branches[0].branch_id);
    await page.getByLabel('Source location').selectOption(context.branches[0].locations[0].location_id);
    await page.getByLabel('Destination branch').selectOption(context.branches[1].branch_id);
    await page.getByLabel('Destination location').selectOption(context.branches[1].locations[0].location_id);
    await page.getByPlaceholder('Search product to transfer…').fill(productQuery);
    await page.getByRole('option').first().click();
    await expect(page.getByText(/FEFO default/).first()).toBeVisible();
    await page.getByLabel(/Requested transfer quantity for/).fill('0.000001');
    await page.getByRole('button', { name: 'Propose FEFO allocation' }).click();
    await expect(page.getByLabel(/Allocation for batch/).first()).toHaveValue('0.000001');
    await page.getByRole('button', { name: 'Add product allocation' }).click();

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const preparePromise = page.waitForResponse((response) => response.request().method() === 'POST'
      && /\/api\/web\/actions\/inventory\.transfer\.prepare\/prepare$/.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: 'Prepare transfer', exact: true }).click();
    const preparedResponse = await preparePromise;
    expect(preparedResponse.status()).toBe(200);
    const prepared = await preparedResponse.json();
    expect(prepared.preview_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(page.getByRole('dialog', { name: 'Confirm inter-branch stock transfer' })).toContainText(prepared.command_request_id);

    const executePromise = page.waitForResponse((response) => response.request().method() === 'POST'
      && /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/.test(new URL(response.url()).pathname));
    const readbackPromise = page.waitForResponse((response) => response.request().method() === 'GET'
      && /\/api\/canonical\/inventory-transfers\/[0-9a-f-]+$/.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: 'Approve and post once' }).click();
    const executeResponse = await executePromise;
    expect(executeResponse.status()).toBe(200);
    const executed = await executeResponse.json();
    const readbackResponse = await readbackPromise;
    expect(readbackResponse.status()).toBe(200);
    const readback = await readbackResponse.json();
    expect(readback.id).toBe(executed.resource_id);
    expect(typeof readback.total_abs_base_quantity).toBe('string');
    expect(typeof readback.total_value).toBe('string');
    expect(readback.lines).toHaveLength(1);
    expect(readback.lines[0].transfer_out_quantity).toBe(`-${readback.lines[0].base_quantity}`);
    expect(readback.lines[0].transfer_in_quantity).toBe(readback.lines[0].base_quantity);

    await testInfo.attach('canonical-stock-transfer-evidence.json', {
      body: JSON.stringify({ command_request_id: prepared.command_request_id, inventory_document_id: executed.resource_id, readback }, null, 2),
      contentType: 'application/json',
    });
  });
});
