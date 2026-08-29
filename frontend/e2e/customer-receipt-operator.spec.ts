import { expect, test } from '@playwright/test';

const branchId = '0198ea37-2b1e-7c8d-9123-123456789abc';

const context = {
  business_date: '2026-08-29',
  payment_methods: ['cash', 'cheque', 'bank_transfer', 'card', 'upi'],
  settlement_accounts: [],
  evidence: [{
    attachment_id: '0198ea37-2b20-7c8d-9123-123456789abc', branch_id: branchId,
    branch_code: 'MAIN', branch_name: 'Main Branch', original_filename: 'verified-upi.pdf',
    document_date: '2026-08-29', retention_until: '2033-08-29', status: 'verified',
    verified_at: '2026-08-29T08:00:00Z', sha256: 'a'.repeat(64),
  }],
  approved_goods_orders: [{
    sales_order_id: '0198ea37-2b1f-7c8d-9123-123456789abc', order_number: 'SO-0021',
    order_date: '2026-08-29', branch_id: branchId, branch_code: 'MAIN', branch_name: 'Main Branch',
    grand_total: '500.00', prior_active_advance: '100.00', remaining_advance_amount: '400.00',
  }],
};

test('customer receipt inputs stay operator-completable at desktop, 360 and 412', async ({ page }) => {
  await page.route('**/api/canonical/customer-receipts/context**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(context),
  }));
  for (const viewport of [
    { width: 1280, height: 800 }, { width: 360, height: 800 }, { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/customer-receipt-operator');
    await expect(page.getByLabel('Verified receipt evidence')).toBeEnabled();
    await expect(page.getByLabel('Verified receipt evidence')).toContainText('verified-upi.pdf');
    await expect(page.getByLabel('Verified evidence ID')).toHaveCount(0);
    await expect(page.getByLabel('Approved goods order ID')).toHaveCount(0);
    await expect(page.getByLabel('Order branch ID')).toHaveCount(0);
    const width = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
    expect(width.body).toBeLessThanOrEqual(width.viewport);
  }
});
