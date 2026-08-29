import { expect, test } from '@playwright/test';

/* eslint-disable testing-library/prefer-screen-queries */

const branch = '0198ea37-2b1e-7c8d-9123-123456789abc';
const supplier = '0198ea37-2b1d-7c8d-9123-123456789abc';
const context = {
  business_date: '2026-08-29',
  branches: [{ id: branch, code: 'MAIN', name: 'Main Branch' }],
  suppliers: [{ id: supplier, code: 'SUP-01', name: 'Healthy Supply Co' }],
  licenses: [],
  supported_license_types: ['drug_wholesale_form_20b', 'drug_wholesale_form_21b'],
  controlled_drug_scope: 'unsupported',
  controlled_drug_message: 'Schedule H/H1/X and NDPS movements remain unavailable.',
};

test('reviewed branch and supplier licence setup is usable at desktop, 360 and 412', async ({ page }) => {
  await page.route('**/api/canonical/compliance/drug-licenses/setup', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(context),
  }));
  for (const viewport of [
    { width: 1280, height: 800 }, { width: 360, height: 800 }, { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/drug-license-setup');
    await expect(page.getByRole('heading', { name: 'Drug licence setup' })).toBeVisible();
    await expect(page.getByText('Schedule H/H1/X and NDPS movements remain unavailable.')).toBeVisible();
    await expect(page.getByTestId('license-holder-type')).toBeEnabled();
    await expect(page.getByTestId('license-subject')).toContainText('Main Branch');
    await page.getByTestId('license-holder-type').selectOption('supplier');
    await expect(page.getByTestId('license-subject')).toContainText('Healthy Supply Co');
    await expect(page.getByTestId('license-evidence-branch')).toContainText('Main Branch');
    await expect(page.getByText(/UUID/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Save reviewed licence' }).click();
    await expect(page.getByRole('alert')).toContainText('Review the highlighted licence fields');
    await expect(page.getByText('Enter the licence number exactly as shown')).toBeVisible();
    await expect(page.locator('[data-license-field="licenseNumber"]')).toBeFocused();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions).toEqual({ viewport: viewport.width, content: viewport.width });
    await page.screenshot({
      path: `test-results/artifacts/drug-license-setup/${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  }
});
