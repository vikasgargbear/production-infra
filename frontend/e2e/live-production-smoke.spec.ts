/* eslint-disable jest/valid-expect, jest/valid-title, jest/no-conditional-expect, testing-library/prefer-screen-queries */
import { expect, test } from '@playwright/test';
import {
  assertNoVisibleFailure,
  authorizedJsonGet,
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

    await expect(page.getByText('Your Company', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Company profile not configured', { exact: true })).toHaveCount(0);

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
      for (const module of modules) {
        await chooseHubModule(page, hub, module);
        if (hub === 'Sales' && module === 'Sales History') {
          await expect(page.getByText(/₹NaN|\bCustom\b/)).toHaveCount(0);
        }
      }
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

  test('assembles a seeded invoice through customer, product, batch, and server totals', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Run the seeded transaction journey once.');
    const failures = collectBrowserFailures(page);

    const companyProfileResponse = page.waitForResponse(response => (
      /\/api\/company\/info(?:\?|$)/.test(response.url())
      && response.request().method() === 'GET'
    ));
    await page.reload();
    const profileResponse = await companyProfileResponse;
    const profileBody = await profileResponse.text();
    expect(profileResponse.status(), profileBody).toBe(200);
    const profilePayload = JSON.parse(profileBody);
    const profile = profilePayload.data;
    expect(profile?.legal_name).toBeTruthy();
    expect(profile?.gst_number).toMatch(/^[0-9A-Z]{15}$/);
    expect(profile?.registered_address).toBeTruthy();
    expect(profile?.bank_accounts?.length).toBeGreaterThan(0);
    await waitForErpToSettle(page);

    await openHomeAction(page, 'Sales');
    await chooseHubModule(page, 'Sales', 'Create Invoice');

    const customerName = 'Demo Retail Customer Private Limited';
    await page.getByRole('textbox', { name: 'Search customer by name, phone, or code...' })
      .fill('Demo Retail');
    await page.getByText(customerName, { exact: true }).click();

    const productName = 'Synthetic Corrugated Pharmacy Packing Carton';
    await page.getByRole('textbox', { name: 'Search products by name, code, or HSN...' })
      .fill('Synthetic Corrugated');
    await page.getByText(productName, { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Select Batch' })).toBeVisible();

    const calculationResponse = page.waitForResponse(response => (
      /\/api\/calculations\/invoice(?:\?|$)/.test(response.url())
      && response.request().method() === 'POST'
    ));
    const recommendedBatch = page.getByRole('dialog').getByRole('option')
      .filter({ hasText: /Recommended FEFO batch/i });
    await expect(recommendedBatch).toHaveCount(1);
    const recommendedBatchId = await recommendedBatch.getAttribute('data-batch-id');
    expect(recommendedBatchId).toMatch(/^[0-9a-f-]{36}$/i);
    await recommendedBatch.click();
    const calculated = await calculationResponse;
    const body = await calculated.text();
    expect(calculated.status(), body.slice(0, 1500)).toBeGreaterThanOrEqual(200);
    expect(calculated.status(), body.slice(0, 1500)).toBeLessThan(300);
    const calculation = JSON.parse(body);
    expect(typeof calculation.totals.final_amount).toBe('string');
    expect(calculation.totals.final_amount).toMatch(/^\d+(?:\.\d+)?$/);

    const line = page.getByRole('row', { name: new RegExp(productName) });
    await expect(line).toBeVisible();
    await expect.poll(async () => {
      const totalText = await line.getByRole('cell').nth(10).innerText();
      return Number(totalText.replace(/[^0-9.-]/g, ''));
    }, { message: 'server-calculated invoice line total should be visible' }).toBeGreaterThan(0);

    const continueCalculation = page.waitForResponse(response => (
      /\/api\/calculations\/invoice(?:\?|$)/.test(response.url())
      && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const continued = await continueCalculation;
    expect(continued.status(), await continued.text()).toBeGreaterThanOrEqual(200);
    expect(continued.status()).toBeLessThan(300);
    await expect(page.getByText('Invoice Details', { exact: true })).toBeVisible();

    const previewCalculation = page.waitForResponse(response => (
      /\/api\/calculations\/invoice(?:\?|$)/.test(response.url())
      && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Continue to Preview', exact: true }).click();
    const previewed = await previewCalculation;
    expect(previewed.status(), await previewed.text()).toBeGreaterThanOrEqual(200);
    expect(previewed.status()).toBeLessThan(300);
    await expect(page.getByText('Invoice Preview', { exact: true })).toBeVisible();
    await expect(page.getByText(profile.legal_name, { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`GST:\\s*${profile.gst_number}`))).toBeVisible();
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
    await expect(page.getByText(profile.bank_accounts[0].bank_name, { exact: true })).toBeVisible();
    await expect(page.getByText(/Payment QR\s*not configured/)).toBeVisible();
    await testInfo.attach('invoice-preview-positive', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    if (writesEnabled) {
      const prepare = page.waitForResponse(response => (
        /\/api\/web\/actions\/sales\.invoice\.prepare\/prepare$/.test(response.url())
        && response.request().method() === 'POST'
      ));
      const approve = page.waitForResponse(response => (
        /\/api\/web\/actions\/commands\/[0-9a-f-]+\/approve$/.test(response.url())
        && response.request().method() === 'POST'
      ));
      const execute = page.waitForResponse(response => (
        /\/api\/web\/actions\/commands\/[0-9a-f-]+\/execute$/.test(response.url())
        && response.request().method() === 'POST'
      ));
      const readback = page.waitForResponse(response => (
        /\/api\/canonical\/invoices\/[0-9a-f-]+$/.test(response.url())
        && response.request().method() === 'GET'
      ));

      await page.getByRole('button', { name: 'Generate Invoice', exact: true }).last().click();
      const prepared = await prepare;
      const preparedBody = await prepared.text();
      expect(prepared.status(), `${prepared.url()} ${preparedBody.slice(0, 1500)}`).toBeGreaterThanOrEqual(200);
      expect(prepared.status(), `${prepared.url()} ${preparedBody.slice(0, 1500)}`).toBeLessThan(300);
      const review = page.getByRole('dialog', { name: 'Review exact sales invoice' });
      await expect(review).toBeVisible();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Approve & Post' }).click();
      const [approved, executed, confirmed] = await Promise.all([
        approve, execute, readback,
      ]);
      for (const response of [approved, executed, confirmed]) {
        const body = await response.text();
        expect(response.status(), `${response.url()} ${body.slice(0, 1500)}`).toBeGreaterThanOrEqual(200);
        expect(response.status(), `${response.url()} ${body.slice(0, 1500)}`).toBeLessThan(300);
      }
      const execution = await executed.json();
      const authoritative = await confirmed.json();
      expect(execution.resource_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(authoritative.invoice_id).toBe(execution.resource_id);
      expect(authoritative.invoice_number).toBeTruthy();
      expect(typeof authoritative.total_amount).toBe('string');
      expect(authoritative.total_amount).toMatch(/^\d+(?:\.\d+)?$/);
      expect(BigInt(authoritative.total_amount.replace('.', ''))).toBeGreaterThan(0n);
      expect(authoritative.items).toHaveLength(1);
      expect(authoritative.items[0].batch_id).toBe(recommendedBatchId);
      expect(authoritative.items[0].batch_allocations).toHaveLength(1);
      expect(authoritative.items[0].batch_allocations[0]).toEqual(expect.objectContaining({
        source_kind: 'direct_issue',
        batch_id: recommendedBatchId,
      }));
      await expect(page.getByText('Invoice Created!', { exact: true })).toBeVisible();
      await expect(page.getByText(authoritative.invoice_number, { exact: true })).toBeVisible();
    }

    await assertNoVisibleFailure(page);
    await failures.assertClean(testInfo);
  });

  test('blocks invoice submission when mandatory issuer profile data is absent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Run the negative transaction journey once.');

    await page.route('**/api/company/info', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          legal_name: 'Mandatory Field Negative Test Company',
          registered_address: null,
          city: 'Mumbai',
          state: '27',
          pincode: '400001',
          gst_number: '27ABCDE1234F1Z5',
          bank_accounts: [],
        },
      }),
    }));
    await page.reload();
    await waitForErpToSettle(page);

    await openHomeAction(page, 'Sales');
    await chooseHubModule(page, 'Sales', 'Create Invoice');
    await page.getByRole('textbox', { name: 'Search customer by name, phone, or code...' })
      .fill('Demo Retail');
    await page.getByText('Demo Retail Customer Private Limited', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Search products by name, code, or HSN...' })
      .fill('Synthetic Corrugated');
    await page.getByText('Synthetic Corrugated Pharmacy Packing Carton', { exact: true }).click();
    await page.getByText(/^DEMO-BATCH-/).first().click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to Preview', exact: true }).click();
    await expect(page.getByText('Invoice Preview', { exact: true })).toBeVisible();

    let commandRequests = 0;
    page.on('request', request => {
      if (/\/api\/web\/actions\//.test(request.url())) commandRequests += 1;
    });
    await page.getByRole('button', { name: 'Generate Invoice', exact: true }).last().click();
    await expect(page.getByRole('alert')).toContainText(/registered address is missing/i);
    await testInfo.attach('invoice-preview-missing-mandatory-field', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await page.waitForTimeout(300);
    expect(commandRequests).toBe(0);
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
    const productWrite = await expectSuccessfulWrite(page, /\/api\/products\/?(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Save draft' }).click();
    });
    const productCreated = await productWrite.json();
    expect(String(productCreated.product_id)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(productCreated.product_name).toBe(productName);
    expect(productCreated.lifecycle_status).toBe('draft');
    await page.getByPlaceholder('Search products').fill(productName);
    await expect(page.getByRole('cell', { name: productName, exact: true })).toBeVisible();
    const productRows = await authorizedJsonGet(
      page,
      productWrite,
      `/products?include_inactive=true&search=${encodeURIComponent(productName)}`,
    );
    expect(productRows).toHaveLength(1);
    expect(productRows[0]).toEqual(expect.objectContaining({
      product_id: productCreated.product_id,
      product_name: productName,
      product_code: productCreated.product_code,
      status: 'draft',
      is_active: false,
    }));

    await chooseHubModule(page, 'Master', 'Customers');
    await page.getByRole('button', { name: 'Add Customer' }).click();
    await page.getByPlaceholder('Company name').fill(customerName);
    await page.getByPlaceholder('10-digit').first().fill(`90${suffix}`);
    await page.getByPlaceholder('Building, street address').fill('E2E Test Lane 1');
    await page.getByPlaceholder('City').fill('Mumbai');
    await page.locator('select').filter({ hasText: 'Maharashtra' }).selectOption('Maharashtra');
    await page.getByPlaceholder('6-digit').fill('400001');
    const customerWrite = await expectSuccessfulWrite(page, /\/api\/customers\/?(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Save Customer', exact: true }).first().click();
    });
    const customerCreated = await customerWrite.json();
    expect(String(customerCreated.customer_id)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(customerCreated.customer_name).toBe(customerName);
    expect(customerCreated.status).toBe('active');
    await page.getByPlaceholder(/Search customers/).fill(customerName);
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
    const customerReadback = await authorizedJsonGet(
      page,
      customerWrite,
      `/customers?search=${encodeURIComponent(customerName)}`,
    );
    expect(customerReadback.customers).toHaveLength(1);
    expect(customerReadback.customers[0]).toEqual(expect.objectContaining({
      customer_id: customerCreated.customer_id,
      customer_code: customerCreated.customer_code,
      customer_name: customerName,
      primary_phone: `90${suffix}`,
      status: 'active',
      is_active: true,
    }));

    await chooseHubModule(page, 'Master', 'Suppliers');
    await page.getByRole('button', { name: 'Add Supplier' }).click();
    await page.getByPlaceholder('e.g., ABC Pharmaceuticals').fill(supplierName);
    await page.getByPlaceholder('Business phone').fill(`91${suffix}`);
    await page.getByPlaceholder('Building, street address').fill('E2E Supplier Lane 1');
    await page.getByPlaceholder('City').fill('Mumbai');
    await page.locator('select').filter({ hasText: 'Maharashtra' }).selectOption('Maharashtra');
    await page.getByPlaceholder('6-digit').fill('400001');
    const supplierWrite = await expectSuccessfulWrite(page, /\/api\/suppliers\/?(?:\?|$)/, async () => {
      await page.getByRole('button', { name: 'Save Supplier', exact: true }).first().click();
    });
    const supplierCreated = await supplierWrite.json();
    expect(String(supplierCreated.supplier_id)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(supplierCreated.supplier_name).toBe(supplierName);
    expect(supplierCreated.status).toBe('active');
    await page.getByPlaceholder(/Search suppliers/).fill(supplierName);
    await expect(page.getByText(supplierName, { exact: true })).toBeVisible();
    const supplierRows = await authorizedJsonGet(
      page,
      supplierWrite,
      `/suppliers?search=${encodeURIComponent(supplierName)}`,
    );
    expect(supplierRows).toHaveLength(1);
    expect(supplierRows[0]).toEqual(expect.objectContaining({
      supplier_id: supplierCreated.supplier_id,
      supplier_code: supplierCreated.supplier_code,
      supplier_name: supplierName,
      primary_phone: `91${suffix}`,
      status: 'active',
      is_active: true,
    }));

    await testInfo.attach('master-create-authoritative-readback.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        product_id: productCreated.product_id,
        customer_id: customerCreated.customer_id,
        supplier_id: supplierCreated.supplier_id,
      }, null, 2),
    });

    await failures.assertClean(testInfo);
  });
});
