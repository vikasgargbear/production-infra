/* eslint-disable jest/valid-expect, jest/valid-title, testing-library/prefer-screen-queries */
import { expect, test } from '@playwright/test';

import {
  authorizedJsonGet,
  chooseHubModule,
  loginToLiveErp,
  openHomeAction,
} from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const productQuery = process.env.PLAYWRIGHT_LIVE_TRANSFER_PRODUCT_QUERY || 'Synthetic Corrugated';
const transferQuantity = process.env.PLAYWRIGHT_LIVE_TRANSFER_QUANTITY || '1.000000';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password)
  && process.env.PLAYWRIGHT_LIVE_WRITES === 'true';

const exactUnits = (value: string, scale: number, label: string): bigint => {
  const match = new RegExp(`^(-?)(?:0|[1-9]\\d*)\\.\\d{${scale}}$`).exec(value);
  expect(match, `${label} must be a literal-dot fixed-scale string: ${value}`).not.toBeNull();
  const [whole, fraction] = value.replace('-', '').split('.');
  const units = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction);
  return value.startsWith('-') ? -units : units;
};

const stockPosition = async (
  page: Parameters<typeof authorizedJsonGet>[0],
  referenceResponse: Parameters<typeof authorizedJsonGet>[1],
  branchId: string,
  locationId: string,
  productId: string,
  batchId: string,
) => {
  const params = new URLSearchParams({
    branch_id: branchId,
    location_id: locationId,
    product_id: productId,
    limit: '200',
  });
  const pageResult = await authorizedJsonGet(
    page, referenceResponse, `/canonical/inventory/batches?${params.toString()}`,
  );
  const item = pageResult.items.find((candidate: any) => candidate.batch_id === batchId);
  return item
    ? { quantity: item.total_quantity as string, value: item.total_value as string }
    : { quantity: '0.000000', value: '0.00' };
};

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
    const sourceBranch = context.branches.find((branch: any) => branch.branch_code === 'MUM-DEMO');
    const destinationBranch = context.branches.find((branch: any) => branch.branch_code === 'PUN-DEMO');
    const sourceLocation = sourceBranch?.locations.find((location: any) => location.location_code === 'SALE-DEMO');
    const destinationLocation = destinationBranch?.locations.find(
      (location: any) => location.location_code === 'SALE-PUN-DEMO',
    );
    const provisioning = JSON.stringify(context.branches, null, 2);
    expect(sourceBranch, `Missing MUM-DEMO transfer source in canonical context:\n${provisioning}`).toBeTruthy();
    expect(destinationBranch, `Missing PUN-DEMO transfer destination in canonical context:\n${provisioning}`).toBeTruthy();
    expect(sourceLocation, `Missing SALE-DEMO transfer source location:\n${provisioning}`).toBeTruthy();
    expect(destinationLocation, `Missing SALE-PUN-DEMO transfer destination location:\n${provisioning}`).toBeTruthy();
    expect(sourceLocation.location_type).toBe('saleable');
    expect(destinationLocation.location_type).toBe('saleable');
    expect(sourceLocation.allows_sale).toBe(true);
    expect(destinationLocation.allows_sale).toBe(true);
    expect(sourceLocation.allows_negative_stock).toBe(false);
    expect(destinationLocation.allows_negative_stock).toBe(false);
    expect([sourceLocation.temperature_min_c, sourceLocation.temperature_max_c]).toEqual([
      destinationLocation.temperature_min_c, destinationLocation.temperature_max_c,
    ]);

    await page.getByLabel('Source branch').selectOption(sourceBranch.branch_id);
    await page.getByLabel('Source location').selectOption(sourceLocation.location_id);
    await page.getByLabel('Destination branch').selectOption(destinationBranch.branch_id);
    await page.getByLabel('Destination location').selectOption(destinationLocation.location_id);
    const eligibilityPromise = page.waitForResponse((response) => response.request().method() === 'GET'
      && /\/api\/canonical\/inventory-transfers\/eligible-batches$/.test(new URL(response.url()).pathname));
    await page.getByPlaceholder('Search product to transfer…').fill(productQuery);
    await page.getByRole('option').first().click();
    const eligibilityResponse = await eligibilityPromise;
    expect(eligibilityResponse.status(), await eligibilityResponse.text()).toBe(200);
    const eligible = await eligibilityResponse.json();
    expect(eligible.length, 'Demo transfer product has no eligible earliest-expiry FEFO stock').toBeGreaterThan(0);
    expect(new Set(eligible.map((batch: any) => batch.expires_on)).size).toBe(1);
    const productId = eligible[0].product_id as string;
    const batchId = eligible[0].batch_id as string;
    const sourceBefore = await stockPosition(
      page, contextResponse, sourceBranch.branch_id, sourceLocation.location_id, productId, batchId,
    );
    const destinationBefore = await stockPosition(
      page, contextResponse, destinationBranch.branch_id, destinationLocation.location_id, productId, batchId,
    );
    await expect(page.getByText(/FEFO default/).first()).toBeVisible();
    await page.getByLabel(/Requested transfer quantity for/).fill(transferQuantity);
    await page.getByRole('button', { name: 'Propose FEFO allocation' }).click();
    await expect(page.getByLabel(/Allocation for batch/).first()).toHaveValue(transferQuantity);
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
    const line = readback.lines[0];
    expect(line.product_id).toBe(productId);
    expect(line.batch_id).toBe(batchId);
    expect(line.transfer_out_branch_id).toBe(sourceBranch.branch_id);
    expect(line.transfer_in_branch_id).toBe(destinationBranch.branch_id);
    expect(line.transfer_out_location_id).toBe(sourceLocation.location_id);
    expect(line.transfer_in_location_id).toBe(destinationLocation.location_id);
    expect(line.transfer_out_product_id).toBe(line.product_id);
    expect(line.transfer_in_product_id).toBe(line.product_id);
    expect(line.transfer_out_batch_id).toBe(line.batch_id);
    expect(line.transfer_in_batch_id).toBe(line.batch_id);
    expect(line.transfer_out_quantity).toBe(`-${line.base_quantity}`);
    expect(line.transfer_in_quantity).toBe(line.base_quantity);
    expect(line.transfer_out_unit_cost).toBe(line.unit_cost);
    expect(line.transfer_in_unit_cost).toBe(line.unit_cost);
    expect(line.transfer_out_value).toBe(`-${line.extended_cost}`);
    expect(line.transfer_in_value).toBe(line.extended_cost);
    expect(readback.branch_id).toBe(sourceBranch.branch_id);
    expect(readback.destination_branch_id).toBe(destinationBranch.branch_id);

    const sourceAfter = await stockPosition(
      page, contextResponse, sourceBranch.branch_id, sourceLocation.location_id, productId, batchId,
    );
    const destinationAfter = await stockPosition(
      page, contextResponse, destinationBranch.branch_id, destinationLocation.location_id, productId, batchId,
    );
    const movedQuantity = exactUnits(line.base_quantity, 6, 'Readback base quantity');
    const movedValue = exactUnits(line.extended_cost, 2, 'Readback extended cost');
    expect(exactUnits(sourceAfter.quantity, 6, 'Source quantity after') + movedQuantity)
      .toBe(exactUnits(sourceBefore.quantity, 6, 'Source quantity before'));
    expect(exactUnits(destinationAfter.quantity, 6, 'Destination quantity after') - movedQuantity)
      .toBe(exactUnits(destinationBefore.quantity, 6, 'Destination quantity before'));
    expect(exactUnits(sourceAfter.value, 2, 'Source value after') + movedValue)
      .toBe(exactUnits(sourceBefore.value, 2, 'Source value before'));
    expect(exactUnits(destinationAfter.value, 2, 'Destination value after') - movedValue)
      .toBe(exactUnits(destinationBefore.value, 2, 'Destination value before'));

    await testInfo.attach('canonical-stock-transfer-evidence.json', {
      body: JSON.stringify({
        command_request_id: prepared.command_request_id,
        inventory_document_id: executed.resource_id,
        source_before: sourceBefore,
        source_after: sourceAfter,
        destination_before: destinationBefore,
        destination_after: destinationAfter,
        readback,
      }, null, 2),
      contentType: 'application/json',
    });
  });
});
