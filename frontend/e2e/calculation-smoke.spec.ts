import { expect, test } from '@playwright/test';

test.describe('ERP calculation smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/calculation-smoke');
    await expect(page.getByTestId('calculation-smoke-page')).toBeVisible();
  });

  test('renders canonical invoice and purchase totals in the browser bundle', async ({ page }) => {
    await expect(page.getByTestId('invoice-gross')).toHaveText('2000.00');
    await expect(page.getByTestId('invoice-taxable')).toHaveText('1800.00');
    await expect(page.getByTestId('invoice-gst')).toHaveText('272.84');
    await expect(page.getByTestId('invoice-roundoff')).toHaveText('0.16');
    await expect(page.getByTestId('invoice-final')).toHaveText('2098.00');

    await expect(page.getByTestId('purchase-gross')).toHaveText('1960.00');
    await expect(page.getByTestId('purchase-discount')).toHaveText('48.00');
    await expect(page.getByTestId('purchase-gst')).toHaveText('289.44');
    await expect(page.getByTestId('purchase-final')).toHaveText('2201.00');
  });

  test('renders canonical return, note, and payment outstanding totals', async ({ page }) => {
    await expect(page.getByTestId('sales-return-taxable')).toHaveText('370.00');
    await expect(page.getByTestId('sales-return-gst')).toHaveText('50.40');
    await expect(page.getByTestId('sales-return-final')).toHaveText('420.00');
    await expect(page.getByTestId('purchase-return-final')).toHaveText('403.00');

    await expect(page.getByTestId('note-taxable')).toHaveText('450.00');
    await expect(page.getByTestId('note-gst')).toHaveText('81.00');
    await expect(page.getByTestId('note-final')).toHaveText('531.00');
    await expect(page.getByTestId('payment-remaining')).toHaveText('1497.50');
  });

  test('can persist an offline credit note into IndexedDB and the sync queue', async ({ page }) => {
    await page.getByTestId('seed-offline-note').click();
    await expect(page.getByTestId('offline-note-status')).toHaveText(/queued:[1-9]\d*/);
  });

  test('can queue all critical offline document types for later replay', async ({ page }) => {
    await page.getByTestId('seed-critical-offline-docs').click();

    const expectedEntities = [
      'invoices',
      'sales_orders',
      'delivery_challans',
      'purchase_orders',
      'purchase_entries',
      'sales_returns',
      'purchase_returns',
      'payments',
      'payment_receipts',
      'credit_debit_notes',
      'stock_adjustments',
      'stock_transfers'
    ];

    for (const entity of expectedEntities) {
      await expect(page.getByTestId('critical-offline-status')).toContainText(`"${entity}": 1`);
    }
  });
});
