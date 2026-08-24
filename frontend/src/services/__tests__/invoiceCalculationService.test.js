/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  invoiceCalculationsApi: { preview: jest.fn() }
}));

import { normalizeInvoicePreview } from '../calculations/invoiceCalculationService';
import { calculateInvoicePreview } from '../calculations/invoiceCalculationService';
import { invoiceCalculationsApi } from '../api/modules/sales/calculations.api';
import { prepareItemForInvoice } from '../../components/sales/invoice/utils/invoiceItemUtils';


beforeEach(() => {
  jest.clearAllMocks();
});


test('normalizes canonical backend invoice totals for the invoice UI', () => {
  const result = normalizeInvoicePreview(
    { items: [{ product_id: 7, quantity: 2, unit_price: 100 }] },
    {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{
        subtotal: 200,
        discount_amount: 20,
        taxable_amount: 180,
        total_tax_amount: 32.4,
        line_total: 212.4
      }],
      totals: {
        subtotal_amount: 200,
        discount_amount: 20,
        scheme_discount: 0,
        taxable_amount: 180,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 32.4,
        total_tax_amount: 32.4,
        round_off_amount: -0.4,
        final_amount: 212
      }
    }
  );

  expect(result.gst_type).toBe('IGST');
  expect(result.items[0]).toEqual(expect.objectContaining({
    product_id: 7,
    gst_amount: 32.4,
    total_amount: 212.4
  }));
  expect(result.totals).toEqual(expect.objectContaining({
    gross_amount: 200,
    taxable_amount: 180,
    total_gst: 32.4,
    igst_total: 32.4,
    net_amount: 212.4,
    final_amount: 212
  }));
});

test('fails closed without calling the API when the live ERP is unavailable', async () => {
  await expect(calculateInvoicePreview({
    customer_details: { customer_id: '11111111-1111-4111-8111-111111111111' },
    gst_type: 'CGST/SGST',
    items: [{
      product_id: '22222222-2222-4222-8222-222222222222',
      quantity: 1,
      unit_price: 150
    }]
  }, false)).rejects.toThrow(
    'Invoice preview requires the live ERP API. Reconnect and try again.'
  );

  expect(invoiceCalculationsApi.preview).not.toHaveBeenCalled();
});

test('preserves canonical UUID IDs in the online calculation request', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  invoiceCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ line_total: 150, total_tax_amount: 0 }],
      totals: {
        subtotal_amount: 150,
        discount_amount: 0,
        scheme_discount: 0,
        taxable_amount: 150,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax_amount: 0,
        round_off_amount: 0,
        final_amount: 150
      }
    }
  });

  await calculateInvoicePreview({
    customer_details: { customer_id: customerId },
    gst_type: 'CGST/SGST',
    items: [{ product_id: productId, quantity: 1, unit_price: 150 }]
  }, true);

  expect(invoiceCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    customer_id: customerId,
    items: [expect.objectContaining({ product_id: productId })]
  }));
});

test('preserves mixed free-supply treatments in the exact online request and response', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const includedProductId = '22222222-2222-4222-8222-222222222222';
  const excludedProductId = '33333333-3333-4333-8333-333333333333';
  invoiceCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [
        {
          product_id: includedProductId,
          quantity: 2,
          free_quantity: 1,
          free_supply_tax_treatment: 'included_at_unit_rate',
          subtotal: 300,
          taxable_amount: 300,
          total_tax_amount: 54,
          line_total: 354
        },
        {
          product_id: excludedProductId,
          quantity: 2,
          free_quantity: 1,
          free_supply_tax_treatment: 'excluded_from_taxable_value',
          subtotal: 200,
          taxable_amount: 200,
          total_tax_amount: 36,
          line_total: 236
        }
      ],
      totals: {
        subtotal_amount: 500,
        discount_amount: 0,
        scheme_discount: 0,
        taxable_amount: 500,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 90,
        total_tax_amount: 90,
        round_off_amount: 0,
        final_amount: 590
      }
    }
  });

  const result = await calculateInvoicePreview({
    customer_details: { customer_id: customerId },
    gst_type: 'IGST',
    items: [
      {
        product_id: includedProductId,
        quantity: 2,
        free_quantity: 1,
        free_supply_tax_treatment: 'included_at_unit_rate',
        unit_price: 100,
        discount_percent: 0,
        gst_percent: 18
      },
      {
        product_id: excludedProductId,
        quantity: 2,
        free_quantity: 1,
        free_supply_tax_treatment: 'excluded_from_taxable_value',
        unit_price: 100,
        discount_percent: 0,
        gst_percent: 18
      }
    ]
  }, true);

  expect(invoiceCalculationsApi.preview).toHaveBeenCalledWith({
    customer_id: customerId,
    gst_type: 'IGST',
    items: [
      {
        product_id: includedProductId,
        quantity: 2,
        free_quantity: 1,
        free_supply_tax_treatment: 'included_at_unit_rate',
        unit_price: 100,
        discount_percent: 0,
        gst_percent: 18
      },
      {
        product_id: excludedProductId,
        quantity: 2,
        free_quantity: 1,
        free_supply_tax_treatment: 'excluded_from_taxable_value',
        unit_price: 100,
        discount_percent: 0,
        gst_percent: 18
      }
    ],
    freight_charges: 0,
    insurance_charges: 0,
    other_charges: 0,
    discount_type: 'percentage',
    discount_percent: 0,
    discount_amount: 0
  });
  expect(result.items).toEqual([
    expect.objectContaining({
      free_supply_tax_treatment: 'included_at_unit_rate',
      taxable_amount: 300,
      total_amount: 354
    }),
    expect.objectContaining({
      free_supply_tax_treatment: 'excluded_from_taxable_value',
      taxable_amount: 200,
      total_amount: 236
    })
  ]);
  expect(result.totals).toEqual(expect.objectContaining({
    taxable_amount: 500,
    total_tax_amount: 90,
    final_amount: 590
  }));
});

test('preserves canonical free-only and fractional quantities through the API payload', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  const batchId = '33333333-3333-4333-8333-333333333333';
  const importedItems = [
    prepareItemForInvoice({
      product_id: productId,
      product_name: 'Included free-only item',
      batch_id: batchId,
      quantity: 0,
      free_quantity: 2.5,
      free_supply_tax_treatment: 'included_at_unit_rate',
      unit_price: 100,
      gst_percent: 18
    }),
    prepareItemForInvoice({
      product_id: productId,
      product_name: 'Excluded free-only item',
      batch_id: batchId,
      quantity: 0,
      free_quantity: 1.25,
      free_supply_tax_treatment: 'excluded_from_taxable_value',
      unit_price: 100,
      gst_percent: 18
    }),
    prepareItemForInvoice({
      product_id: productId,
      product_name: 'Fractional billed and free item',
      batch_id: batchId,
      quantity: 0.375,
      free_quantity: 1.625,
      free_supply_tax_treatment: 'included_at_unit_rate',
      unit_price: 100,
      gst_percent: 18
    })
  ];
  invoiceCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: importedItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        free_quantity: item.free_quantity,
        free_supply_tax_treatment: item.free_supply_tax_treatment,
        taxable_amount: 0,
        total_tax_amount: 0,
        line_total: 0
      })),
      totals: {
        subtotal_amount: 0,
        discount_amount: 0,
        scheme_discount: 0,
        taxable_amount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax_amount: 0,
        round_off_amount: 0,
        final_amount: 0
      }
    }
  });

  await calculateInvoicePreview({
    customer_details: { customer_id: customerId },
    gst_type: 'IGST',
    items: importedItems
  }, true);

  const requestItems = invoiceCalculationsApi.preview.mock.calls[0][0].items;
  expect(requestItems).toEqual([
    expect.objectContaining({
      quantity: 0,
      free_quantity: 2.5,
      free_supply_tax_treatment: 'included_at_unit_rate'
    }),
    expect.objectContaining({
      quantity: 0,
      free_quantity: 1.25,
      free_supply_tax_treatment: 'excluded_from_taxable_value'
    }),
    expect.objectContaining({
      quantity: 0.375,
      free_quantity: 1.625,
      free_supply_tax_treatment: 'included_at_unit_rate'
    })
  ]);
});
