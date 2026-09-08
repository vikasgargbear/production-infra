import { expect, test } from '@playwright/test';

// UI transport and layout tests only. All API responses below are synthetic;
// the real PostgreSQL import/replay proof is a separate acceptance gate.
const org = 'd3000000-0000-7000-8000-000000000001';
const bundle = {
  schema_version: 'aasopharma.marg-migration.v1', organization_id: org,
  branch_id: 'branch', location_id: 'location', dataset_id: 'CODEX-E2E-migration', opening_date: '2026-09-08',
  import_requests: [{ facts: [{}] }], exclusions: { missing_source_domains: ['return line linkage'] },
};
for (const width of [1280, 360, 412]) {
  test(`review and resumable import at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    let imports = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown;
      if (path.endsWith('/inventory/context')) data = { organization_id: org, branches: [
        { branch_id: 'branch', branch_name: 'Test branch', locations: [{ location_id: 'location', location_name: 'Test stockroom', location_status: 'active' }] },
      ] };
      else if (path.endsWith('/bundle-review')) data = { facts: 1, request_batches: 1, counts_by_kind: { product: 1 }, quarantined_by_kind: {},
        expected: { products: 1, batches: 0, openings: 0, quantity: '0', value: '0', receivable: '0', payable: '0' } };
      else if (path.endsWith('/facts')) {
        imports += 1;
        if (imports === 1) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Test interruption; retry this package' }) }); return; }
        data = { accepted: 1 };
      } else if (path.endsWith('/operational-cutover')) data = route.request().method() === 'POST'
        ? { complete: true, parties_remaining: 0, openings_remaining: 0 }
        : { source_parties: 0, bound_parties: 0, source_openings: 0, posted_openings: 0, receivable: '0.00', payable: '0.00' };
      else if (path.endsWith('/product-inventory-cutover')) data = route.request().method() === 'POST'
        ? { complete: true, products_remaining: 0 }
        : { source_products: 1, bound_products: 1, source_batches: 0, bound_batches: 0, opening_quantity: '0.000000', ledger_quantity: '0.000000', opening_value: '0.00', ledger_value: '0.00' };
      else { await route.abort(); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('/e2e/migration-setup');
    const input = page.getByLabel(/Choose the prepared package/);
    await expect(input).toBeEnabled();
    await input.setInputFiles({ name: 'migration-bundle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
    await page.getByRole('button', { name: 'Review package' }).click();
    await expect(page.getByText('return line linkage')).toBeVisible();
    const start = page.getByRole('button', { name: 'Import / resume this package' });
    await expect(start).toBeDisabled();
    await page.getByRole('checkbox').check();
    await start.click();
    await expect(page.getByRole('alert')).toContainText('Test interruption');
    await start.click();
    await expect(page.getByRole('button', { name: 'Import complete' })).toBeVisible();
    expect(imports).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/artifacts/migration-setup/${width}.png`, fullPage: true });
  });
}
