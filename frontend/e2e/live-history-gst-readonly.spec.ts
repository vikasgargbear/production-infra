/* eslint-disable jest/valid-expect, jest/valid-title, jest/no-conditional-expect, testing-library/prefer-screen-queries */
import { expect, Page, test } from '@playwright/test';
import { chooseHubModule, loginToLiveErp, openHomeAction, returnHome } from './support/live-erp';

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || '';
const email = process.env.PLAYWRIGHT_LIVE_EMAIL || '';
const password = process.env.PLAYWRIGHT_LIVE_PASSWORD || '';
const enabled = /^https:\/\//.test(baseURL) && Boolean(email && password);

type HistoryItem = {
  document_id: string; document_number: string; document_date: string; status: string;
  party_name: string; total_amount: string | null; taxable_amount: string | null; total_tax: string | null;
  paid_amount: string | null; outstanding_amount: string | null; payment_status: string | null;
  total_quantity: string;
};

const historyKinds = [
  'sales_invoice', 'sales_order', 'sales_dispatch',
  'supplier_invoice', 'purchase_order', 'goods_receipt',
  'sales_return', 'purchase_return',
] as const;
type HistoryKind = typeof historyKinds[number];

async function apiGet(page: Page, path: string): Promise<any> {
  const result = await page.evaluate(async (relativePath) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api${relativePath}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.text() };
  }, path);
  expect(result.status, `${path}: ${result.body}`).toBe(200);
  return JSON.parse(result.body);
}

const exactMoney = (value: unknown, label: string): string => {
  expect(typeof value, label).toBe('string');
  expect(String(value), label).toMatch(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
  return String(value);
};

const formatMoney = (value: string): string => {
  const sign = value.startsWith('-') ? '-' : '';
  const [whole, fraction] = value.replace(/^-/, '').split('.');
  const lastThree = whole.slice(-3);
  const leading = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${leading ? `${leading},` : ''}${lastThree}.${fraction}`;
};

const assertExactHistoryRow = (kind: HistoryKind, row: HistoryItem) => {
  expect(row.document_id, `${kind} UUID`).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(row.total_quantity, `${kind} quantity`).toMatch(/^-?(?:0|[1-9]\d*)\.\d{6}$/);
  for (const [label, amount] of Object.entries({
    total: row.total_amount, taxable: row.taxable_amount, tax: row.total_tax,
    paid: row.paid_amount, outstanding: row.outstanding_amount,
  })) {
    if (amount !== null) exactMoney(amount, `${kind} ${label}`);
  }
  const settlement = kind === 'sales_invoice' || kind === 'supplier_invoice';
  if (settlement) {
    expect(row.total_amount, `${kind} total`).not.toBeNull();
    expect(row.paid_amount, `${kind} paid`).not.toBeNull();
    expect(row.outstanding_amount, `${kind} outstanding`).not.toBeNull();
    expect(row.payment_status, `${kind} payment status`).not.toBeNull();
  } else {
    expect(row.paid_amount, `${kind} cannot claim paid`).toBeNull();
    expect(row.outstanding_amount, `${kind} cannot claim outstanding`).toBeNull();
    expect(row.payment_status, `${kind} cannot claim settlement status`).toBeNull();
  }
  if (kind === 'sales_dispatch') {
    expect(row.total_amount, 'dispatch has no authoritative money').toBeNull();
    expect(row.taxable_amount, 'dispatch has no authoritative taxable value').toBeNull();
    expect(row.total_tax, 'dispatch has no authoritative tax').toBeNull();
  }
};

const monthRanges = (businessDate: string) => {
  const [year, month] = businessDate.split('-').map(value => parseInt(value, 10));
  const currentFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const previousEnd = new Date(Date.UTC(year, month - 1, 0));
  const previousYear = previousEnd.getUTCFullYear();
  const previousMonth = previousEnd.getUTCMonth() + 1;
  return {
    current: { from: currentFrom, to: businessDate },
    previous: {
      from: `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`,
      to: `${previousYear}-${String(previousMonth).padStart(2, '0')}-${String(previousEnd.getUTCDate()).padStart(2, '0')}`,
    },
  };
};

test.describe('live read-only History and GST cross-projection', () => {
  test.skip(!enabled, 'Set HTTPS live URL and existing live credentials. This spec never writes.');
  test.use({ baseURL, viewport: { width: 1440, height: 1000 } });
  test.beforeEach(async ({ page }) => loginToLiveErp(page, email, password));

  test('API facts remain exact and visibly agree with mounted Sales, Purchase, GSTR-1 and GSTR-3B views', async ({ page }, testInfo) => {
    const context = await apiGet(page, '/canonical/business-context');
    const ranges = monthRanges(String(context.business_date));
    const query = (kind: string, range = ranges.current) => `/canonical/document-history?document_kind=${kind}`
      + `&date_from=${range.from}&date_to=${range.to}&status=posted&page=1&page_size=100`;
    const [kindResponses, sales, suppliers, gstr1, gstr3b, previousGstr1, previousGstr3b] = await Promise.all([
      Promise.all(historyKinds.map(kind => apiGet(page,
        `/canonical/document-history?document_kind=${kind}&page=1&page_size=100`))),
      apiGet(page, query('sales_invoice')),
      apiGet(page, query('supplier_invoice')),
      apiGet(page, `/gst/reports/gstr1?date_from=${ranges.current.from}&date_to=${ranges.current.to}`),
      apiGet(page, `/gst/reports/gstr3b?date_from=${ranges.current.from}&date_to=${ranges.current.to}`),
      apiGet(page, `/gst/reports/gstr1?date_from=${ranges.previous.from}&date_to=${ranges.previous.to}`),
      apiGet(page, `/gst/reports/gstr3b?date_from=${ranges.previous.from}&date_to=${ranges.previous.to}`),
    ]);
    const histories = Object.fromEntries(
      historyKinds.map((kind, index) => [kind, kindResponses[index]]),
    ) as Record<HistoryKind, { items: HistoryItem[]; total: number }>;
    for (const kind of historyKinds) {
      expect(Array.isArray(histories[kind].items), `${kind} history items`).toBe(true);
      expect(
        histories[kind].items.length,
        `Provisioned ${kind} evidence is required; an empty history cannot pass live acceptance.`,
      ).toBeGreaterThan(0);
      expect(histories[kind].total, `${kind} history total`).toBeGreaterThanOrEqual(histories[kind].items.length);
      histories[kind].items.forEach(row => assertExactHistoryRow(kind, row));
    }
    const salesInvoice = sales.items.find((row: HistoryItem) => row.status === 'posted') as HistoryItem | undefined;
    const supplierInvoice = suppliers.items.find((row: HistoryItem) => row.status === 'posted') as HistoryItem | undefined;
    expect(salesInvoice, 'Provisioned current-period posted sales invoice is required for GST acceptance.').toBeDefined();
    expect(supplierInvoice, 'Provisioned current-period posted supplier invoice is required for GST acceptance.').toBeDefined();
    for (const row of [salesInvoice!, supplierInvoice!]) {
      expect(row.document_id).toMatch(/^[0-9a-f-]{36}$/i);
      exactMoney(row.total_amount!, `${row.document_number} total`);
      exactMoney(row.taxable_amount!, `${row.document_number} taxable`);
      exactMoney(row.total_tax!, `${row.document_number} tax`);
    }

    await openHomeAction(page, 'Sales');
    await chooseHubModule(page, 'Sales', 'Sales History');
    for (const [kind, tab] of [
      ['sales_invoice', 'Invoices'], ['sales_dispatch', 'Delivery Challans'], ['sales_order', 'Sales Orders'],
    ] as const) {
      const row = histories[kind].items[0];
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.getByPlaceholder(/Search (?:invoice|order) number or customer name/i).fill(row.document_number);
      const visible = page.getByRole('row').filter({ hasText: row.document_number });
      await expect(visible).toContainText(row.party_name);
      if (row.total_amount !== null) await expect(visible).toContainText(formatMoney(row.total_amount));
      else await expect(visible).toContainText('Not available');
    }

    await returnHome(page);
    await openHomeAction(page, 'Purchase Entry');
    await chooseHubModule(page, 'Purchase', 'Purchase History');
    for (const [kind, tab] of [
      ['supplier_invoice', 'Supplier Invoices'], ['purchase_order', 'Purchase Orders'], ['goods_receipt', 'GRN'],
    ] as const) {
      const row = histories[kind].items[0];
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.getByPlaceholder(new RegExp(`Search ${tab.toLowerCase()} by number or supplier`, 'i')).fill(row.document_number);
      const visible = page.getByRole('row').filter({ hasText: row.document_number });
      await expect(visible).toContainText(row.party_name);
      await expect(visible).toContainText(formatMoney(row.total_amount!));
    }

    await returnHome(page);
    await openHomeAction(page, 'Returns');
    await chooseHubModule(page, 'Returns', 'Returns History');
    for (const [kind, tab] of [['sales_return', 'Sales Returns'], ['purchase_return', 'Purchase Returns']] as const) {
      const row = histories[kind].items[0];
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.getByPlaceholder(/Search by customer name, invoice number, or order number/i).fill(row.document_number);
      const visible = page.getByRole('row').filter({ hasText: row.document_number });
      await expect(visible).toContainText(row.party_name);
      await expect(visible).toContainText(formatMoney(row.total_amount!));
    }

    exactMoney(gstr1.summary.totalTaxableValue, 'Current GSTR-1 taxable');
    exactMoney(gstr1.summary.totalTax, 'Current GSTR-1 tax');
    exactMoney(gstr3b.outputTax.total, 'Current GSTR-3B output');
    exactMoney(gstr3b.inputCredit.total, 'Current GSTR-3B input');
    await returnHome(page);
    await openHomeAction(page, 'GST Management');
    await chooseHubModule(page, 'GST', 'Reports');
    await expect(page.getByText(formatMoney(gstr1.summary.totalTaxableValue), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(formatMoney(gstr1.summary.totalTax), { exact: true }).first()).toBeVisible();
    await page.getByRole('navigation', { name: 'GST report tabs' }).getByRole('button', { name: /GSTR-3B/ }).click();
    await expect(page.getByText(formatMoney(gstr3b.outputTax.total), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(formatMoney(gstr3b.inputCredit.total), { exact: true }).first()).toBeVisible();

    const currentSignature = `${gstr1.summary.totalTaxableValue}|${gstr1.summary.totalTax}|${gstr3b.inputCredit.total}`;
    const previousSignature = `${previousGstr1.summary.totalTaxableValue}|${previousGstr1.summary.totalTax}|${previousGstr3b.inputCredit.total}`;
    if (currentSignature !== previousSignature) {
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(page.getByText(formatMoney(previousGstr3b.outputTax.total), { exact: true }).first()).toBeVisible();
      expect(previousSignature).not.toBe(currentSignature);
    }
    await testInfo.attach('history-gst-cross-projection.json', {
      body: JSON.stringify({ ranges, historyCounts: Object.fromEntries(historyKinds.map(kind => [kind, histories[kind].total])),
        salesInvoice, supplierInvoice, gstr1: gstr1.summary,
        gstr3b: { outputTax: gstr3b.outputTax, inputCredit: gstr3b.inputCredit },
        previousPeriodDifferent: currentSignature !== previousSignature }, null, 2),
      contentType: 'application/json',
    });
  });
});
