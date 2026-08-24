import { expect, test } from '@playwright/test';
import {
  assertNoVisibleFailure,
  chooseHubModule,
  collectBrowserFailures,
  expectSuccessfulWrite,
  loginToLiveErp,
  openHomeAction,
  openMobileDestination,
  returnHome,
  waitForErpToSettle,
} from './support/live-erp';

const liveBaseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const liveEmail = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const livePassword = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const liveConfigured = /^https:\/\//.test(liveBaseURL) && Boolean(liveEmail && livePassword);
const writesEnabled = process.env.PLAYWRIGHT_LIVE_WRITES === 'true';

test.describe('live ERP pilot', () => {
  test.use({ baseURL: liveBaseURL || 'https://live-target-required.invalid' });
  test.skip(!liveConfigured, 'Set an HTTPS PLAYWRIGHT_LIVE_BASE_URL plus live pilot email/password secrets.');

  test.beforeEach(async ({ page }) => {
    await loginToLiveErp(page, liveEmail, livePassword);
  });

  test('exposes clear role-aware navigation on desktop and mobile', async ({ page }, testInfo) => {
    const failures = collectBrowserFailures(page);
    const isMobile = testInfo.project.name === 'mobile-chrome';

    if (isMobile) {
      const navigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
      await expect(navigation).toBeVisible();
      for (const label of ['Home', 'Sales', 'Purchase', 'Stock', 'More']) {
        await expect(navigation.getByRole('button', { name: label, exact: true })).toBeVisible();
      }
      const box = await navigation.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs((box!.y + box!.height) - page.viewportSize()!.height)).toBeLessThanOrEqual(1);

      await navigation.getByRole('button', { name: 'More', exact: true }).click();
      for (const label of ['Returns', 'Finance', 'Party Ledger', 'GST', 'Reports', 'Master Data']) {
        await expect(page.getByRole('region', { name: 'More modules' })
          .getByRole('button', { name: label, exact: true })).toBeVisible();
      }
    } else {
      for (const label of [
        'Sales', 'Purchase Entry', 'Returns Management', 'Stock Management',
        'Financial Hub', 'Party Ledger', 'Credit/Debit Note', 'GST Management',
        'Reports & Analytics', 'Master Management',
      ]) {
        await expect(page.getByRole('button', { name: new RegExp(`^${label}\\b`) })).toBeVisible();
      }
    }

    await assertNoVisibleFailure(page);
    await failures.assertClean(testInfo);
  });

  test('loads every critical ERP surface without hidden API or UI failures', async ({ page }, testInfo) => {
    const failures = collectBrowserFailures(page);
    const isMobile = testInfo.project.name === 'mobile-chrome';
    const open = async (desktop: string, mobile: string, hub: string, modules: string[]) => {
      if (isMobile) await openMobileDestination(page, mobile);
      else await openHomeAction(page, desktop);
      await expect(page.getByRole('navigation', { name: `${hub} modules` })).toBeVisible();
      await waitForErpToSettle(page);
      for (const module of modules) await chooseHubModule(page, hub, module);
      await returnHome(page);
    };

    await open('Sales', 'Sales', 'Sales', ['Create Invoice', 'Delivery Challan', 'Sales Order', 'Sales History']);
    await open('Purchase Entry', 'Purchase', 'Purchase', ['Purchase', 'Order', 'Receipts', 'Purchase History']);
    await open('Returns Management', 'Returns', 'Returns', ['Sales Return', 'Purchase Return', 'All Returns']);
    if (isMobile) await openMobileDestination(page, 'Stock');
    else await openHomeAction(page, 'Stock Management');
    await expect(page.getByRole('navigation', { name: 'Stock modules' })).toBeVisible();
    for (const module of ['Current Stock', 'Adjustment', 'Batches', 'Movements', 'Transfer']) {
      await chooseHubModule(page, 'Stock', module);
    }
    await returnHome(page);
    await open('Financial Hub', 'Finance', 'Financial Hub', ['New Payment', 'Journal Entry', 'Expenses', 'Bank Reconcile']);
    await open('Master Management', 'Master Data', 'Master', [
      'Products', 'Customers', 'Suppliers', 'Batches', 'Employees', 'Tax & GST', 'Units', 'Locations',
    ]);

    if (isMobile) await openMobileDestination(page, 'GST');
    else await openHomeAction(page, 'GST Management');
    await waitForErpToSettle(page);
    await returnHome(page);

    if (isMobile) await openMobileDestination(page, 'Reports');
    else await openHomeAction(page, 'Reports & Analytics');
    await waitForErpToSettle(page);
    await returnHome(page);

    if (isMobile) await openMobileDestination(page, 'Party Ledger');
    else await openHomeAction(page, 'Party Ledger');
    await waitForErpToSettle(page);

    await failures.assertClean(testInfo);
  });

  test('writes and reads back uniquely labeled pilot master data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Business writes run once in the desktop project.');
    test.skip(!writesEnabled, 'Set PLAYWRIGHT_LIVE_WRITES=true for the approved disposable pilot org.');
    const failures = collectBrowserFailures(page);
    const suffix = `${Date.now()}`.slice(-8);
    const productName = `E2E Browser Product ${suffix}`;
    const customerName = `E2E Browser Customer ${suffix}`;
    const supplierName = `E2E Browser Supplier ${suffix}`;

    await openHomeAction(page, 'Master Management');
    await chooseHubModule(page, 'Master', 'Products');
    await page.getByRole('button', { name: 'New draft' }).click();
    await page.getByLabel('Product name').fill(productName);
    await expectSuccessfulWrite(page, /\/api\/products(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Save draft' }).click();
    });
    await page.getByPlaceholder('Search products').fill(productName);
    await expect(page.getByRole('cell', { name: productName, exact: true })).toBeVisible();

    await chooseHubModule(page, 'Master', 'Customers');
    await page.getByRole('button', { name: 'Add Customer' }).click();
    await page.getByPlaceholder('Enter customer name').fill(customerName);
    await page.getByRole('button', { name: 'Contact & Address' }).click();
    await page.getByPlaceholder('+91-9876543210').first().fill(`90${suffix}`);
    await expectSuccessfulWrite(page, /\/api\/customers(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Create', exact: true }).click();
    });
    await page.getByPlaceholder(/Search customers/).fill(customerName);
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();

    await chooseHubModule(page, 'Master', 'Suppliers');
    await page.getByRole('button', { name: 'Add Supplier' }).click();
    await page.getByPlaceholder('Enter supplier name').fill(supplierName);
    await page.getByRole('button', { name: 'Contact & Address' }).click();
    await page.getByPlaceholder('+91-9876543210').first().fill(`91${suffix}`);
    await expectSuccessfulWrite(page, /\/api\/suppliers(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Create', exact: true }).click();
    });
    await page.getByPlaceholder(/Search suppliers/).fill(supplierName);
    await expect(page.getByText(supplierName, { exact: true })).toBeVisible();

    await failures.assertClean(testInfo);
  });
});
