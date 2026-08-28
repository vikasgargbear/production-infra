/* eslint-disable jest/valid-expect, jest/valid-title, jest/no-conditional-expect, testing-library/prefer-screen-queries */
import { expect, Page, test } from '@playwright/test';
import { loginToLiveErp } from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password)
  && process.env.PLAYWRIGHT_LIVE_WRITES === 'true';

type JsonRecord = Record<string, any>;

const exact = (value: unknown, label: string): string => {
  expect(typeof value, `${label} must cross JSON as an exact decimal string`).toBe('string');
  expect(String(value), label).toMatch(/^-?(?:0|[1-9]\d*)\.\d+$/);
  return String(value);
};

const quantity = (value: unknown): string => {
  const normalized = exact(value, 'quantity').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return normalized === '-0' ? '0' : normalized;
};

const money = (value: unknown): string => {
  const normalized = exact(value, 'money');
  const negative = normalized.startsWith('-');
  const [whole, fraction] = normalized.replace(/^-/, '').split('.');
  const tail = whole.slice(-3);
  const leading = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₹${leading ? `${leading},` : ''}${tail}.${fraction}`;
};

async function authorizedJson(page: Page, apiOrigin: string, pathAndQuery: string): Promise<JsonRecord> {
  const result = await page.evaluate(async ({ apiOrigin, path }) => {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('Authenticated ERP access token is absent');
    const response = await fetch(`${apiOrigin}/api${path}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, text: await response.text() };
  }, { apiOrigin, path: pathAndQuery });
  expect(result.status, `${pathAndQuery}: ${result.text}`).toBe(200);
  return JSON.parse(result.text);
}

async function allPages(
  page: Page,
  apiOrigin: string,
  endpoint: string,
  params: Record<string, string>,
): Promise<JsonRecord> {
  const items: JsonRecord[] = [];
  let first: JsonRecord | null = null;
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const query = new URLSearchParams({ ...params, limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const current = await authorizedJson(page, apiOrigin, `${endpoint}?${query.toString()}`);
    first ||= current;
    expect(current.scope).toEqual(first.scope);
    expect(current.as_of).toBe(first.as_of);
    expect(current.business_date).toBe(first.business_date);
    expect(current.total_count).toBe(first.total_count);
    expect(current.summary).toEqual(first.summary);
    items.push(...current.items);
    cursor = current.next_cursor;
    if (cursor) {
      expect(seen.has(cursor), 'cursor must never repeat').toBe(false);
      seen.add(cursor);
    }
  } while (cursor);
  expect(items).toHaveLength(first!.total_count);
  return { ...first!, items, next_cursor: null };
}

async function openStockSurface(page: Page, module: string, title: string): Promise<void> {
  await page.goto(`/#/stock-management/${module}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel('Inventory branch')).toBeVisible();
}

async function selectScope(page: Page, branchId: string, locationId = ''): Promise<void> {
  const branch = page.getByLabel('Inventory branch');
  if (await branch.inputValue() !== branchId) await branch.selectOption(branchId);
  await expect(branch).toHaveValue(branchId);
  const location = page.getByLabel('Inventory location');
  if (await location.inputValue() !== locationId) await location.selectOption(locationId);
  await expect(location).toHaveValue(locationId);
}

async function downloadedText(page: Page, action: () => Promise<void>): Promise<{ name: string; text: string }> {
  const downloadPromise = page.waitForEvent('download');
  await action();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}

test.describe('live desktop canonical Stock Hub visible acceptance', () => {
  test.skip(!enabled, 'Requires HTTPS live ERP credentials and the unified live-writes gate');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });
  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('Current Stock, Batches, and Movements visibly reconcile to exact canonical APIs', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const contextResponsePromise = page.waitForResponse(response => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/canonical/inventory/context')
    ));
    await openStockSurface(page, 'current-stock', 'Current Stock');
    const apiOrigin = new URL((await contextResponsePromise).url()).origin;
    const context = await authorizedJson(page, apiOrigin, '/canonical/inventory/context');
    expect(context.branches.length, 'requires at least one accessible inventory branch').toBeGreaterThan(0);

    let evidence: { branch: JsonRecord; movements: JsonRecord; reversal: JsonRecord } | null = null;
    for (const branch of context.branches) {
      const movements = await allPages(page, apiOrigin, '/canonical/inventory/movements', { branch_id: branch.branch_id });
      const reversal = movements.items.find((item: JsonRecord) => item.entry_kind === 'reversal');
      if (reversal) { evidence = { branch, movements, reversal }; break; }
    }
    expect(evidence, 'live Stock Hub fixture must contain a reconciled reversal; no surface is skipped').toBeTruthy();
    const { branch, reversal } = evidence!;
    expect(reversal.reversal_reconciled).toBe(true);

    await selectScope(page, branch.branch_id);
    const current = await allPages(page, apiOrigin, '/canonical/inventory/current-stock', { branch_id: branch.branch_id });
    expect(current.items.length, 'current-stock fixture must be non-empty').toBeGreaterThan(0);
    const product = current.items.find((item: JsonRecord) => item.product_id === reversal.product_id) || current.items[0];
    const currentControls = page.getByLabel('Current stock controls');
    await expect(currentControls.getByText(`Loaded ${current.items.length} of ${current.total_count} scoped products`)).toBeVisible();
    await expect(currentControls.getByText(`Total quantity: ${quantity(current.summary.total_quantity)}`)).toBeVisible();
    await expect(currentControls.getByText(`Total value: ${money(current.summary.total_value)}`)).toBeVisible();
    if (current.summary.negative_stock_batch_count > 0) {
      const negativeItems = current.items.filter((item: JsonRecord) => (
        String(item.total_quantity).startsWith('-') || String(item.total_value).startsWith('-')
      ));
      for (const item of negativeItems) {
        const row = page.locator(`[data-product-id="${item.product_id}"]`);
        await expect(row).toHaveAttribute('data-stock-sign', 'negative');
        await expect(row).toHaveClass(/text-red-700/);
      }
      await expect(currentControls.getByText(`Negative: ${current.summary.negative_stock_batch_count}`))
        .toHaveClass(/text-red-700/);
    }
    await expect(page.getByText(`Organization business date: ${context.business_date}`)).toHaveCount(0);
    await expect(page.getByText(/Organization business date:/)).toContainText(
      `${context.business_date.slice(8, 10)}/${context.business_date.slice(5, 7)}/${context.business_date.slice(0, 4)}`,
    );
    const lowStock = page.getByRole('button', { name: 'Low Stock unavailable' });
    await expect(lowStock).toBeDisabled();
    await expect(lowStock).toHaveAttribute('title', /canonical branch\/product reorder policy/i);

    const productRow = page.locator(`[data-product-id="${product.product_id}"]`);
    await expect(productRow).toContainText(product.product_name);
    await expect(productRow).toContainText(product.product_code);
    await expect(productRow).toContainText(product.hsn_code || '—');
    await expect(productRow).toContainText(`${quantity(product.total_quantity)} ${product.unit}`);
    await expect(productRow).toContainText(money(product.total_value));
    await page.getByPlaceholder('Search products by name or code...').fill(product.product_code);
    const visibleProducts = current.items.filter((item: JsonRecord) => (
      `${item.product_name} ${item.product_code} ${item.generic_name || ''}`
        .toLowerCase().includes(product.product_code.toLowerCase())
    ));
    await expect(page.locator('tbody [data-product-id]')).toHaveCount(visibleProducts.length);
    const currentDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export visible' }).click();
    expect((await currentDownload).suggestedFilename()).toBe('canonical-current-stock.pdf');
    await page.getByPlaceholder('Search products by name or code...').fill('');
    const refreshCurrent = page.waitForResponse(response => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/canonical/inventory/current-stock')
    ));
    await page.getByRole('button', { name: 'Refresh current stock' }).click();
    expect((await refreshCurrent).status()).toBe(200);

    const locationId = reversal.location_id;
    await selectScope(page, branch.branch_id, locationId);
    const locationCurrent = await allPages(page, apiOrigin, '/canonical/inventory/current-stock', {
      branch_id: branch.branch_id, location_id: locationId,
    });
    await expect(currentControls.getByText(`Loaded ${locationCurrent.items.length} of ${locationCurrent.total_count} scoped products`)).toBeVisible();
    await expect(currentControls.getByText(`Total value: ${money(locationCurrent.summary.total_value)}`)).toBeVisible();

    await page.getByRole('navigation', { name: /Stock module/ }).getByRole('button', { name: 'Batches' }).click();
    await expect(page.getByRole('heading', { name: 'Batch Tracking' })).toBeVisible();
    await selectScope(page, branch.branch_id, locationId);
    const batches = await allPages(page, apiOrigin, '/canonical/inventory/batches', {
      branch_id: branch.branch_id, location_id: locationId,
    });
    const batch = batches.items.find((item: JsonRecord) => item.batch_id === reversal.batch_id);
    expect(batch, 'reversal batch must be visible in the selected scope').toBeTruthy();
    for (const item of batches.items.filter((candidate: JsonRecord) => (
      String(candidate.total_quantity).startsWith('-') || String(candidate.total_value).startsWith('-')
    ))) {
      const negativeRow = page.locator(`[data-batch-id="${item.batch_id}"]`);
      await expect(negativeRow).toHaveAttribute('data-stock-sign', 'negative');
      await expect(negativeRow).toHaveClass(/text-red-700/);
    }
    const batchRow = page.locator(`[data-batch-id="${batch.batch_id}"]`);
    await expect(batchRow).toContainText(batch.batch_number);
    await expect(batchRow).toContainText(quantity(batch.total_quantity));
    await expect(batchRow).toContainText(money(batch.total_value));
    await expect(batchRow).toContainText(batch.expiry_state.replace(/_/g, ' '));
    await expect(batchRow).toContainText(batch.status);
    await page.getByPlaceholder('Search batch, product, or code...').fill(batch.batch_number);
    const visibleBatches = batches.items.filter((item: JsonRecord) => (
      `${item.batch_number} ${item.product_name} ${item.product_code}`
        .toLowerCase().includes(batch.batch_number.toLowerCase())
    ));
    await expect(page.locator('tbody [data-batch-id]')).toHaveCount(visibleBatches.length);
    const batchCsv = await downloadedText(page, () => page.getByRole('button', { name: 'Export visible' }).click());
    expect(batchCsv.name).toBe('canonical-batches.csv');
    expect(batchCsv.text).toContain(`"${batch.batch_number.replace(/"/g, '""')}"`);
    for (const hidden of batches.items.filter((item: JsonRecord) => !visibleBatches.includes(item))) {
      expect(batchCsv.text).not.toContain(`"${hidden.batch_number.replace(/"/g, '""')}"`);
    }
    const refreshBatch = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/canonical/inventory/batches'));
    await page.getByRole('button', { name: 'Refresh batches' }).click();
    expect((await refreshBatch).status()).toBe(200);
    const movementTrigger = page.getByRole('button', { name: `View movements for batch ${batch.batch_number}` });
    await movementTrigger.click();
    const dialog = page.getByRole('dialog', { name: `Batch movements — ${batch.batch_number}` });
    await expect(dialog).toBeVisible();
    const batchMovements = await allPages(page, apiOrigin, '/canonical/inventory/movements', {
      branch_id: branch.branch_id, location_id: locationId, batch_id: batch.batch_id,
    });
    await expect(dialog.locator('tbody tr')).toHaveCount(batchMovements.items.length);
    const reversalDialogRow = dialog.locator(`[data-movement-id="${reversal.movement_id}"]`);
    await expect(reversalDialogRow).toContainText(`Reversal of ${reversal.reversed_entry_kind.replace(/_/g, ' ')}`);
    await expect(reversalDialogRow).toContainText(quantity(reversal.quantity_delta));
    await expect(reversalDialogRow).toContainText(money(reversal.value_delta));
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(movementTrigger).toBeFocused();

    await page.getByRole('navigation', { name: /Stock module/ }).getByRole('button', { name: 'Movements' }).click();
    await expect(page.getByRole('heading', { name: 'Stock Movements' })).toBeVisible();
    await selectScope(page, branch.branch_id, locationId);
    const scopedMovements = await allPages(page, apiOrigin, '/canonical/inventory/movements', {
      branch_id: branch.branch_id, location_id: locationId,
    });
    await expect(page.getByText(`Loaded ${scopedMovements.items.length} of ${scopedMovements.total_count} scoped immutable ledger entries`)).toBeVisible();
    await page.getByLabel('Movement type').selectOption('reversal');
    await page.getByPlaceholder('Search document, product, batch, or location...').fill(reversal.document_number);
    const movementRow = page.locator(`[data-movement-id="${reversal.movement_id}"]`);
    const visibleMovements = scopedMovements.items.filter((item: JsonRecord) => (
      item.entry_kind === 'reversal'
      && `${item.document_number} ${item.product_name} ${item.product_code} ${item.batch_number} ${item.location_name}`
        .toLowerCase().includes(reversal.document_number.toLowerCase())
    ));
    await expect(page.locator('tbody [data-movement-id]')).toHaveCount(visibleMovements.length);
    await expect(movementRow).toContainText(`Reversal of ${reversal.reversed_entry_kind.replace(/_/g, ' ')}`);
    await expect(movementRow).toContainText(quantity(reversal.quantity_delta));
    await expect(movementRow).toContainText(money(reversal.value_delta));
    const movementCsv = await downloadedText(page, () => page.getByRole('button', { name: 'Export visible' }).click());
    expect(movementCsv.name).toBe('canonical-stock-movements.csv');
    expect(movementCsv.text).toContain(`"${reversal.document_number.replace(/"/g, '""')}"`);
    expect(movementCsv.text).toContain(`"${reversal.value_delta}"`);
    const refreshMovement = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/canonical/inventory/movements'));
    await page.getByRole('button', { name: 'Refresh stock movements' }).click();
    expect((await refreshMovement).status()).toBe(200);

    await testInfo.attach('stock-hub-exact-visible-evidence.json', {
      body: JSON.stringify({
        branch_id: branch.branch_id,
        location_id: locationId,
        current_summary: locationCurrent.summary,
        batch: { batch_id: batch.batch_id, value: batch.total_value, status: batch.status },
        reversal: {
          movement_id: reversal.movement_id,
          quantity_delta: reversal.quantity_delta,
          value_delta: reversal.value_delta,
          reversal_reconciled: reversal.reversal_reconciled,
        },
      }, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('stock-hub-reversal-visible.png'), fullPage: true });
  });
});
