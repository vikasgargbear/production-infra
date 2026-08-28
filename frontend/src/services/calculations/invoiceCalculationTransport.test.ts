import type { AxiosAdapter } from 'axios';

import apiClient from '../api/apiClient';
import {
  invoiceCalculationsApi,
  salesOrderCalculationsApi,
} from '../api/modules/sales/calculations.api';
import { normalizeInvoicePreview } from './invoiceCalculationService';
import { normalizeSalesOrderPreview } from './salesOrderCalculationService';

const ids = {
  branch: '10000000-0000-7000-8000-000000000001',
  customer: '10000000-0000-7000-8000-000000000002',
  product: '10000000-0000-7000-8000-000000000003',
  taxCode: '10000000-0000-7000-8000-000000000004',
  taxRelease: '10000000-0000-7000-8000-000000000005',
};

const invoice = {
  invoice_date: '2026-08-27',
  customer_details: { customer_id: ids.customer },
  items: [{
    branch_id: ids.branch,
    product_id: ids.product,
    quantity: '1.125000',
    free_quantity: '1.000000',
    free_supply_tax_treatment: 'excluded_from_taxable_value',
    unit_price: '84.1250',
    discount_percent: '0.000000',
  }],
  freight_charges: '0.00',
  insurance_charges: '0.00',
  other_charges: '0.00',
  discount_type: 'percentage',
  discount_percent: '0.000000',
  discount_amount: '0.00',
};

const exactPreview = {
  success: true as const,
  calculation_timestamp: 1,
  gst_type: 'CGST/SGST' as const,
  line_items: [{
    product_id: ids.product,
    quantity: '1.125000',
    free_quantity: '1.000000',
    free_supply_tax_treatment: 'excluded_from_taxable_value' as const,
    subtotal: '94.64',
    discount_amount: '0.00',
    taxable_amount: '94.64',
    cgst_amount: '5.68',
    sgst_amount: '5.68',
    igst_amount: '0.00',
    total_tax: '11.36',
    total_tax_amount: '11.36',
    line_total: '106.00',
    gst_percent: '12.000000',
    cgst_percent: '6.000000',
    sgst_percent: '6.000000',
    igst_percent: '0.000000',
    scheme_discount: '0.00',
    hsn_code: '300490',
    taxability: 'taxable' as const,
    tax_code_version_id: ids.taxCode,
    tax_release_id: ids.taxRelease,
    tax_version_number: 1,
    tax_effective_from: '2026-04-01',
    tax_ruleset_version: 'gst-demo-v1',
  }],
  totals: {
    subtotal_amount: '94.64',
    discount_amount: '0.00',
    scheme_discount: '0.00',
    scheme_discount_percent: '0.000000',
    taxable_amount: '94.64',
    cgst_amount: '5.68',
    sgst_amount: '5.68',
    igst_amount: '0.00',
    total_tax_amount: '11.36',
    freight_charges: '0.00',
    insurance_charges: '0.00',
    other_charges: '0.00',
    round_off_amount: '0.00',
    final_amount: '106.00',
  },
};

describe('invoice calculation exact-decimal transport', () => {
  const originalAdapter = apiClient.defaults.adapter;

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('keeps the successful API response exact through the invoice step boundary', async () => {
    const responseAdapter: AxiosAdapter = async config => ({
      data: exactPreview,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    apiClient.defaults.adapter = responseAdapter;

    const response = await invoiceCalculationsApi.preview(invoice as any);
    const normalized = normalizeInvoicePreview(invoice, response.data);

    expect((response.config as typeof response.config & {
      preserveExactDecimals?: boolean;
    }).preserveExactDecimals).toBe(true);
    expect(response.data.totals.final_amount).toBe('106.00');
    expect(normalized).toEqual(expect.objectContaining({
      gst_type: 'CGST/SGST',
      totals: expect.objectContaining({ final_amount: '106.00' }),
    }));
  });

  it('keeps the successful API response exact through the sales-order step boundary', async () => {
    const responseAdapter: AxiosAdapter = async config => ({
      data: exactPreview,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    apiClient.defaults.adapter = responseAdapter;
    const order = {
      ...invoice,
      order_date: invoice.invoice_date,
      expected_delivery_date: '2026-08-29',
      customer_id: ids.customer,
      document_discount_amount: '0.00',
      items: invoice.items.map(item => ({
        ...item,
        batch_id: '10000000-0000-7000-8000-000000000006',
      })),
      delivery_charges: '0.00',
    };

    const response = await salesOrderCalculationsApi.preview({
      branch_id: ids.branch,
      customer_id: ids.customer,
      order_date: '2026-08-27',
      delivery_date: '2026-08-29',
      items: invoice.items,
      delivery_charges: '0.00',
      other_charges: '0.00',
      discount_amount: '0.00',
    });
    const normalized = normalizeSalesOrderPreview(order as any, response.data);

    expect((response.config as typeof response.config & {
      preserveExactDecimals?: boolean;
    }).preserveExactDecimals).toBe(true);
    expect(response.data.totals.discount_amount).toBe('0.00');
    expect(normalized.totals.final_amount).toBe('106.00');
  });
});
