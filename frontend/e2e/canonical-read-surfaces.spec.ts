/* eslint-disable testing-library/prefer-screen-queries -- Playwright page locators are not Testing Library render queries. */
import { expect, type Page, test } from '@playwright/test';

const UUID = {
  org: 'd3000000-0000-7000-8000-000000000001',
  branch: 'd3000000-0000-7000-8000-000000000002',
  customerAccount: 'd3000000-0000-7000-8000-000000000011',
  customerParty: 'd3000000-0000-7000-8000-000000000012',
  supplierAccount: 'd3000000-0000-7000-8000-000000000021',
  supplierParty: 'd3000000-0000-7000-8000-000000000022',
  openItem: 'd3000000-0000-7000-8000-000000000031',
  document: 'd3000000-0000-7000-8000-000000000032',
  account: 'd3000000-0000-7000-8000-000000000041',
} as const;

const businessContext = {
  organization_id: UUID.org,
  organization_timezone: 'Asia/Kolkata',
  business_date: '2026-08-28',
  document_policy: {
    allowed_rounding_policies: ['none'], default_rounding_policy: 'none',
    allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'],
    default_zero_rated_payment_mode: 'not_applicable',
    allowed_tax_charge_mechanisms: ['normal'], default_tax_charge_mechanism: 'normal',
    allowed_price_bases: ['tax_exclusive'], default_price_basis: 'tax_exclusive',
    logistics_modes: [{
      transport_mode: 'in_person', display_name: 'In person (no carrier)',
      requires_transporter_party: false, requires_vehicle: false,
      requires_transport_document: false,
    }],
    default_transport_mode: 'in_person',
  },
};

const aging = (partyType: 'customer' | 'supplier') => ({
  contract_version: '1.0.0', currency_code: 'INR', party_type: partyType,
  as_of_date: '2026-08-28',
  parties: [{
    party_account_id: partyType === 'customer' ? UUID.customerAccount : UUID.supplierAccount,
    party_id: partyType === 'customer' ? UUID.customerParty : UUID.supplierParty,
    party_type: partyType,
    party_code: partyType === 'customer' ? 'CUST-0001' : 'SUP-0001',
    party_name: partyType === 'customer' ? 'Apollo Pharmacy' : 'Healthy Supply Co',
    account_status: 'active', phone: '9876543210', email: 'operator@example.com',
    limit_amount: partyType === 'customer' ? '50000.00' : null,
    total_outstanding: '12345.67', overdue_amount: '12345.67',
    document_count: 1, overdue_document_count: 1, max_overdue_days: 44,
    documents: [{
      document_id: UUID.document, open_item_id: UUID.openItem, branch_id: UUID.branch,
      document_kind: partyType === 'customer' ? 'sales_invoice' : 'supplier_invoice',
      document_number: partyType === 'customer' ? 'INV-2026-001' : 'SINV-2026-001',
      document_date: '2026-07-01', due_date: '2026-07-15',
      original_amount: '15000.00', settled_amount: '2654.33',
      outstanding_amount: '12345.67', days_overdue: 44,
      aging_bucket: '31-60', status: 'overdue',
    }],
  }],
  summary: {
    total_outstanding: '12345.67', total_overdue: '12345.67',
    party_count: 1, document_count: 1,
    buckets: {
      current: { amount: '0.00', document_count: 0 },
      '1-30': { amount: '0.00', document_count: 0 },
      '31-60': { amount: '12345.67', document_count: 1 },
      '61-90': { amount: '0.00', document_count: 0 },
      over_90: { amount: '0.00', document_count: 0 },
    },
  },
});

const reportHeader = {
  contract_version: '1.0.0', definition_version: 'canonical-factual-v1',
  currency_code: 'INR', date_from: '2026-08-01', date_to: '2026-08-28',
};

const installRoutes = async (page: Page) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown;
    if (path === '/api/canonical/business-context') body = businessContext;
    else if (path === '/api/canonical/party-aging') {
      body = aging(url.searchParams.get('party_type') === 'supplier' ? 'supplier' : 'customer');
    } else if (path === '/api/canonical/reports/trial-balance') body = {
      ...reportHeader,
      rows: [{
        account_id: UUID.account, account_code: '4000', account_name: 'Sales',
        account_type: 'income', opening_balance: '0.00', period_debit: '0.00',
        period_credit: '15000.00', closing_balance: '-15000.00',
      }, {
        account_id: UUID.openItem, account_code: '5000', account_name: 'Purchases',
        account_type: 'expense', opening_balance: '0.00', period_debit: '15000.00',
        period_credit: '0.00', closing_balance: '15000.00',
      }],
      total_period_debit: '15000.00', total_period_credit: '15000.00',
      period_balanced: true,
    };
    else if (path === '/api/canonical/reports/profit-loss') body = {
      ...reportHeader, income: '15000.00', expenses: '2654.33', result: '12345.67',
      rows: [
        { account_id: UUID.account, account_code: '4000', account_name: 'Sales', account_type: 'income', amount: '15000.00' },
        { account_id: UUID.openItem, account_code: '5000', account_name: 'Purchases', account_type: 'expense', amount: '2654.33' },
      ],
    };
    else if (path === '/api/canonical/reports/customer-activity') body = {
      ...reportHeader, transacting_customer_count: 1, invoice_count: 2,
      billed_sales: '15000.00', customers: [{
        customer_account_id: UUID.customerAccount, party_id: UUID.customerParty,
        customer_code: 'CUST-0001', customer_name: 'Apollo Pharmacy',
        account_status: 'active', invoice_count: 2, billed_sales: '15000.00',
        first_invoice_date: '2026-08-03', last_invoice_date: '2026-08-25',
      }],
    };
    else if (path === '/api/customers') body = {
      customers: [{
        customer_id: UUID.customerAccount, customer_code: 'CUST-0001',
        customer_name: 'Apollo Pharmacy', trade_name: null, primary_phone: '9876543210',
        primary_email: 'operator@example.com', gst_number: null,
        gst_verification_status: null, place_of_supply_state_code: '27',
        credit_limit: '50000.00', credit_days: 30, current_outstanding: '12345.67',
        customer_type: 'organization', is_active: true, status: 'active',
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-28T00:00:00Z',
      }], total: 1, skip: 0, limit: 100,
    };
    else if (path === '/api/suppliers') body = [{
      supplier_id: UUID.supplierAccount, supplier_code: 'SUP-0001',
      supplier_name: 'Healthy Supply Co', trade_name: null, primary_phone: '9876543210',
      primary_email: 'operator@example.com', gst_number: null,
      gst_verification_status: null, payment_days: 30, current_outstanding: '12345.67',
      supplier_type: 'organization', is_active: true, status: 'active',
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-28T00:00:00Z',
    }];
    else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `Unhandled ${path}` }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

const surfaces = [
  ['customer-aging', 'Total Outstanding'],
  ['supplier-aging', 'Healthy Supply Co'],
  ['customers', 'Customer Master'],
  ['suppliers', 'Supplier Master'],
  ['financial', 'Factual profit & loss'],
  ['customer-activity', 'Customers with posted invoices'],
] as const;

const expectAnyTextVisible = async (page: Page, text: string) => {
  await expect.poll(async () => {
    const matches = await page.getByText(text, { exact: false }).all();
    return (await Promise.all(matches.map(match => match.isVisible()))).some(Boolean);
  }).toBe(true);
};

for (const viewport of [{ width: 360, height: 800 }, { width: 412, height: 915 }, { width: 1280, height: 900 }]) {
  test.describe(`${viewport.width}x${viewport.height} canonical reads`, () => {
    for (const [surface, expectedText] of surfaces) {
      test(`${surface} is usable without page-level horizontal scrolling`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await installRoutes(page);
        await page.goto(`/e2e/canonical-reads?surface=${surface}`);
        await expectAnyTextVisible(page, expectedText);
        await expect.poll(() => page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }))).toEqual({ viewport: viewport.width, content: viewport.width });
        await page.screenshot({
          path: `test-results/artifacts/canonical-reads/${viewport.width}x${viewport.height}-${surface}.png`,
          fullPage: true,
        });
      });
    }
  });
}

test('mobile aging controls and CTA remain reachable and tappable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installRoutes(page);
  await page.goto('/e2e/canonical-reads?surface=customer-aging');
  const controls = [
    page.getByLabel('Search outstanding parties'),
    page.getByRole('button', { name: 'Refresh' }),
    page.getByRole('button', { name: 'Export' }),
    page.getByRole('button', { name: 'View details' }),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('button', { name: 'Back to outstanding' })).toBeVisible();
  await expect(page.getByText('Record receipts or supplier payments from the Payments module.')).toBeVisible();
});
