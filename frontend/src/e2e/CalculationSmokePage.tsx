import React, { useMemo } from 'react';
import EnterpriseCalculator from '../services/enterpriseCalculator';

const format = (value: unknown): string => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
};

const CalculationSmokePage: React.FC = () => {
  const scenarios = useMemo(() => {
    const invoice = EnterpriseCalculator.calculateInvoice({
      gst_type: 'CGST/SGST',
      discount_type: 'fixed',
      discount_amount: 100,
      freight_charges: 25,
      items: [
        { product_name: 'GST 12 item', quantity: 10, unit_price: 100, discount_percent: 10, gst_percent: 12 },
        { product_name: 'GST 18 item', quantity: 5, unit_price: 200, discount_percent: 0, gst_percent: 18 },
      ],
    } as any);

    const purchase = EnterpriseCalculator.calculateTotals([
      { product_name: 'Purchase 12 item', quantity: 12, unit_price: 80, discount_percent: 5, tax_percent: 12 },
      { product_name: 'Purchase 18 item', quantity: 4, unit_price: 250, discount_percent: 0, tax_percent: 18 },
    ]);

    const salesReturn = EnterpriseCalculator.calculateSalesReturn({
      gst_type: 'CGST/SGST',
      items: [
        {
          product_name: 'Paid plus free return', selected: true, return_quantity: 3,
          paid_quantity: 2, free_quantity: 1, unit_price: 150,
          discount_percent: 10, tax_percent: 12,
        },
        {
          product_name: 'Full paid return', selected: true, return_quantity: 1,
          paid_quantity: 1, free_quantity: 0, unit_price: 100,
          discount_percent: 0, tax_percent: 18,
        },
      ],
    });

    const purchaseReturn = EnterpriseCalculator.calculatePurchaseReturn({
      gst_type: 'CGST/SGST',
      items: [{
        product_name: 'Supplier return item', selected: true, return_quantity: 2,
        unit_price: 200, discount_percent: 10, tax_percent: 12,
      }],
    });

    const note = EnterpriseCalculator.calculateNoteTotals([{
      product_name: 'Standalone note item', selected: true, quantity: 1,
      unit_price: 500, discount_percent: 10, tax_percent: 18,
    }], {
      quantity_field: 'quantity',
      selected_only: true,
      round_final_amount: false,
    });

    const paymentAmount = 600.5;
    return {
      invoice,
      purchase,
      salesReturn,
      purchaseReturn,
      note,
      paymentRemaining: Number(invoice.totals.final_amount || 0) - paymentAmount,
    };
  }, []);

  return (
    <main className="min-h-screen bg-white p-8 text-gray-900" data-testid="calculation-smoke-page">
      <section className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-700">ERP calculation smoke</p>
          <h1 className="mt-2 text-3xl font-bold">Browser calculation verification</h1>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold">Sales Invoice</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Gross</dt><dd data-testid="invoice-gross">{format(scenarios.invoice.totals.gross_amount)}</dd></div>
              <div><dt>Taxable</dt><dd data-testid="invoice-taxable">{format(scenarios.invoice.totals.taxable_amount)}</dd></div>
              <div><dt>Total GST</dt><dd data-testid="invoice-gst">{format(scenarios.invoice.totals.total_tax_amount)}</dd></div>
              <div><dt>Round Off</dt><dd data-testid="invoice-roundoff">{format(scenarios.invoice.totals.round_off_amount)}</dd></div>
              <div><dt>Final</dt><dd data-testid="invoice-final">{format(scenarios.invoice.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold">Purchase</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Gross</dt><dd data-testid="purchase-gross">{format(scenarios.purchase.totals.gross_amount)}</dd></div>
              <div><dt>Discount</dt><dd data-testid="purchase-discount">{format(scenarios.purchase.totals.discount_amount)}</dd></div>
              <div><dt>Total GST</dt><dd data-testid="purchase-gst">{format(scenarios.purchase.totals.total_tax_amount)}</dd></div>
              <div><dt>Final</dt><dd data-testid="purchase-final">{format(scenarios.purchase.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold">Returns</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Sales Return Taxable</dt><dd data-testid="sales-return-taxable">{format(scenarios.salesReturn.totals.subtotal_amount)}</dd></div>
              <div><dt>Sales Return GST</dt><dd data-testid="sales-return-gst">{format(scenarios.salesReturn.totals.total_tax_amount)}</dd></div>
              <div><dt>Sales Return Final</dt><dd data-testid="sales-return-final">{format(scenarios.salesReturn.totals.final_amount)}</dd></div>
              <div><dt>Purchase Return Final</dt><dd data-testid="purchase-return-final">{format(scenarios.purchaseReturn.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold">Notes &amp; Payment</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Note Taxable</dt><dd data-testid="note-taxable">{format(scenarios.note.totals.subtotal_amount)}</dd></div>
              <div><dt>Note GST</dt><dd data-testid="note-gst">{format(scenarios.note.totals.total_tax_amount)}</dd></div>
              <div><dt>Note Final</dt><dd data-testid="note-final">{format(scenarios.note.totals.final_amount)}</dd></div>
              <div><dt>Payment Remaining</dt><dd data-testid="payment-remaining">{format(scenarios.paymentRemaining)}</dd></div>
            </dl>
          </article>
        </div>
      </section>
    </main>
  );
};

export default CalculationSmokePage;
