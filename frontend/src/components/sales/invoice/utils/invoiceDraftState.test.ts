import { buildSalesInvoiceDraftPayload, requireSalesInvoiceDraftState } from './invoiceDraftState';

describe('sales invoice shared editor draft', () => {
  it('keeps editable decimal fields as strings across save and refresh', () => {
    const payload = buildSalesInvoiceDraftPayload({
      invoice_date: '2026-08-29',
      items: [{ quantity: 2, free_quantity: '1.000000', unit_price: 15.25, discount_percent: 5 }],
      discount_amount: 2.5,
      discount_percent: 5,
    } as any, null, 2, null);

    expect(payload.editor_state.invoice.discount_amount).toBe('2.5');
    expect((payload.editor_state.invoice.items as any[])[0]).toEqual(expect.objectContaining({
      quantity: '2',
      free_quantity: '1.000000',
      unit_price: '15.25',
      discount_percent: '5',
    }));
    const restored = requireSalesInvoiceDraftState(JSON.parse(JSON.stringify(payload)));
    expect((restored.invoice.items as any[])[0].unit_price).toBe('15.25');
  });

  it('hydrates an MCP-created editor envelope without trusting its command payload as UI state', () => {
    const restored = requireSalesInvoiceDraftState({
      schema_version: 'invoice-draft.v1',
      editor_state: {
        invoice: { invoice_date: '2026-08-29', items: [] },
        selected_customer: { customer_id: '10000000-0000-7000-8000-000000000003', customer_name: 'MCP Customer' },
        current_step: 1,
      },
      command_payload: { invoice_total: '999.99' },
    });
    expect(restored.selected_customer?.customer_name).toBe('MCP Customer');
    expect(restored.invoice).not.toHaveProperty('invoice_total');
  });
});
