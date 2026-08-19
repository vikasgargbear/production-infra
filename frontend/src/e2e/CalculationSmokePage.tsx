import React, { useMemo, useState } from 'react';
import EnterpriseCalculator from '../services/enterpriseCalculator';
import offlineDB from '../services/offline/core/offlineDatabase';

const format = (value: unknown): string => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
};

const CalculationSmokePage: React.FC = () => {
  const [offlineStatus, setOfflineStatus] = useState('not-run');
  const [criticalOfflineStatus, setCriticalOfflineStatus] = useState('not-run');

  const scenarios = useMemo(() => {
    const invoice = EnterpriseCalculator.calculateInvoice({
      gst_type: 'CGST/SGST',
      discount_type: 'fixed',
      discount_amount: 100,
      freight_charges: 25,
      items: [
        { product_name: 'GST 12 item', quantity: 10, unit_price: 100, discount_percent: 10, gst_percent: 12 },
        { product_name: 'GST 18 item', quantity: 5, unit_price: 200, discount_percent: 0, gst_percent: 18 }
      ]
    } as any);

    const purchase = EnterpriseCalculator.calculateTotals([
      { product_name: 'Purchase 12 item', quantity: 12, unit_price: 80, discount_percent: 5, tax_percent: 12 },
      { product_name: 'Purchase 18 item', quantity: 4, unit_price: 250, discount_percent: 0, tax_percent: 18 }
    ]);

    const salesReturn = EnterpriseCalculator.calculateSalesReturn({
      gst_type: 'CGST/SGST',
      items: [
        {
          product_name: 'Paid plus free return',
          selected: true,
          return_quantity: 3,
          paid_quantity: 2,
          free_quantity: 1,
          unit_price: 150,
          discount_percent: 10,
          tax_percent: 12
        },
        {
          product_name: 'Full paid return',
          selected: true,
          return_quantity: 1,
          paid_quantity: 1,
          free_quantity: 0,
          unit_price: 100,
          discount_percent: 0,
          tax_percent: 18
        }
      ]
    });

    const purchaseReturn = EnterpriseCalculator.calculatePurchaseReturn({
      gst_type: 'CGST/SGST',
      items: [
        {
          product_name: 'Supplier return item',
          selected: true,
          return_quantity: 2,
          unit_price: 200,
          discount_percent: 10,
          tax_percent: 12
        }
      ]
    });

    const note = EnterpriseCalculator.calculateNoteTotals([
      {
        product_name: 'Standalone note item',
        selected: true,
        quantity: 1,
        unit_price: 500,
        discount_percent: 10,
        tax_percent: 18
      }
    ], {
      quantity_field: 'quantity',
      selected_only: true,
      round_final_amount: false
    });

    const paymentAmount = 600.5;
    const invoiceFinal = Number(invoice.totals.final_amount || 0);
    const remainingOutstanding = invoiceFinal - paymentAmount;

    return {
      invoice,
      purchase,
      salesReturn,
      purchaseReturn,
      note,
      payment: {
        invoice_final: invoiceFinal,
        payment_amount: paymentAmount,
        remaining_outstanding: remainingOutstanding
      }
    };
  }, []);

  const seedOfflineNote = async () => {
    const tempId = `E2E_NOTE_${Date.now()}`;
    const note = {
      temp_id: tempId,
      note_number: `CN-E2E-${Date.now()}`,
      note_type: 'credit',
      party_type: 'customer',
      party_id: 1,
      note_date: new Date().toISOString().slice(0, 10),
      amount: scenarios.note.totals.total_amount,
      reason: 'E2E_CALCULATION_SMOKE',
      sync_status: 'pending',
      created_offline: true,
      created_at: new Date().toISOString(),
      items: scenarios.note.items
    };

    await offlineDB.add('credit_debit_notes', note);
    await offlineDB.addToSyncQueue('credit_debit_notes', tempId, 'create', note);
    const queue = await offlineDB.getSyncQueue();
    const pendingNotes = queue.filter(item => item.entity_type === 'credit_debit_notes');
    setOfflineStatus(`queued:${pendingNotes.length}`);
  };

  const seedCriticalOfflineDocs = async () => {
    const stamp = Date.now();
    const docs = [
      {
        store: 'invoices',
        entity: 'invoices',
        temp_id: `E2E_INV_${stamp}`,
        data: {
          invoice_number: `INV-E2E-${stamp}`,
          customer_id: 1,
          invoice_date: new Date().toISOString().slice(0, 10),
          total_amount: scenarios.invoice.totals.final_amount,
          final_amount: scenarios.invoice.totals.final_amount,
          items: scenarios.invoice.items
        }
      },
      {
        store: 'sales_orders',
        entity: 'sales_orders',
        temp_id: `E2E_SO_${stamp}`,
        data: {
          order_number: `SO-E2E-${stamp}`,
          customer_id: 1,
          order_date: new Date().toISOString().slice(0, 10),
          total_amount: scenarios.invoice.totals.final_amount,
          items: scenarios.invoice.items
        }
      },
      {
        store: 'delivery_challans',
        entity: 'delivery_challans',
        temp_id: `E2E_DC_${stamp}`,
        data: {
          challan_number: `DC-E2E-${stamp}`,
          customer_id: 1,
          challan_date: new Date().toISOString().slice(0, 10),
          items: scenarios.invoice.items
        }
      },
      {
        store: 'purchase_orders',
        entity: 'purchase_orders',
        temp_id: `E2E_PO_${stamp}`,
        data: {
          po_number: `PO-E2E-${stamp}`,
          supplier_id: 1,
          order_date: new Date().toISOString().slice(0, 10),
          total_amount: scenarios.purchase.totals.final_amount,
          items: scenarios.purchase.items
        }
      },
      {
        store: 'purchase_entries',
        entity: 'purchase_entries',
        temp_id: `E2E_PUR_${stamp}`,
        data: {
          invoice_number: `PUR-E2E-${stamp}`,
          supplier_id: 1,
          invoice_date: new Date().toISOString().slice(0, 10),
          invoice_total: scenarios.purchase.totals.final_amount,
          items: scenarios.purchase.items
        }
      },
      {
        store: 'sales_returns',
        entity: 'sales_returns',
        temp_id: `E2E_SR_${stamp}`,
        data: {
          return_number: `SR-E2E-${stamp}`,
          customer_id: 1,
          return_date: new Date().toISOString().slice(0, 10),
          total_amount: scenarios.salesReturn.totals.final_amount,
          items: scenarios.salesReturn.items
        }
      },
      {
        store: 'purchase_returns',
        entity: 'purchase_returns',
        temp_id: `E2E_PR_${stamp}`,
        data: {
          return_number: `PR-E2E-${stamp}`,
          supplier_id: 1,
          return_date: new Date().toISOString().slice(0, 10),
          total_amount: scenarios.purchaseReturn.totals.final_amount,
          items: scenarios.purchaseReturn.items
        }
      },
      {
        store: 'payments',
        entity: 'payments',
        temp_id: `E2E_PAY_${stamp}`,
        data: {
          payment_id: `E2E_PAY_${stamp}`,
          payment_number: `PAY-E2E-${stamp}`,
          party_type: 'customer',
          party_id: 1,
          payment_type: 'receipt',
          payment_date: new Date().toISOString().slice(0, 10),
          amount: scenarios.payment.payment_amount,
          payment_method: 'cash'
        }
      },
      {
        store: 'payment_receipts',
        entity: 'payment_receipts',
        temp_id: `E2E_RCPT_${stamp}`,
        data: {
          receipt_id: `E2E_RCPT_${stamp}`,
          receipt_number: `RCPT-E2E-${stamp}`,
          customer_id: 1,
          receipt_date: new Date().toISOString().slice(0, 10),
          amount: scenarios.payment.payment_amount,
          payment_method: 'cash'
        }
      },
      {
        store: 'credit_debit_notes',
        entity: 'credit_debit_notes',
        temp_id: `E2E_CN_${stamp}`,
        data: {
          note_number: `CN-E2E-${stamp}`,
          note_type: 'credit',
          party_type: 'customer',
          party_id: 1,
          note_date: new Date().toISOString().slice(0, 10),
          amount: scenarios.note.totals.total_amount,
          reason: 'E2E_CRITICAL_OFFLINE',
          items: scenarios.note.items
        }
      },
      {
        store: 'stock_adjustments',
        entity: 'stock_adjustments',
        temp_id: `E2E_ADJ_${stamp}`,
        data: {
          adjustment_id: `E2E_ADJ_${stamp}`,
          adjustment_number: `ADJ-E2E-${stamp}`,
          adjustment_date: new Date().toISOString().slice(0, 10),
          adjustment_type: 'correction',
          reason: 'E2E_CRITICAL_OFFLINE',
          status: 'draft',
          items: [
            {
              product_id: '1',
              product_name: 'E2E stock item',
              batch_id: '1',
              batch_number: 'E2E-BATCH',
              current_qty: 10,
              adjusted_qty: 9,
              difference: -1,
              reason: 'E2E_CRITICAL_OFFLINE'
            }
          ]
        }
      },
      {
        store: 'stock_transfers',
        entity: 'stock_transfers',
        temp_id: `E2E_TRF_${stamp}`,
        data: {
          transfer_id: `E2E_TRF_${stamp}`,
          transfer_number: `TRF-E2E-${stamp}`,
          transfer_date: new Date().toISOString().slice(0, 10),
          from_warehouse_id: '1',
          from_warehouse_name: 'Main',
          to_warehouse_id: '2',
          to_warehouse_name: 'Secondary',
          status: 'draft',
          items: [
            {
              product_id: '1',
              product_name: 'E2E transfer item',
              batch_id: '1',
              batch_number: 'E2E-BATCH',
              quantity: 1
            }
          ]
        }
      }
    ];

    for (const doc of docs) {
      const payload = {
        ...doc.data,
        temp_id: doc.temp_id,
        sync_status: 'pending',
        created_offline: true,
        created_at: new Date().toISOString()
      };
      await offlineDB.add(doc.store, payload);
      await offlineDB.addToSyncQueue(doc.entity, doc.temp_id, 'create', payload);
    }

    const queue = await offlineDB.getSyncQueue();
    const entityCounts = docs.reduce<Record<string, number>>((counts, doc) => {
      counts[doc.entity] = queue.filter(item => item.entity_type === doc.entity).length;
      return counts;
    }, {});
    setCriticalOfflineStatus(JSON.stringify(entityCounts, null, 2));
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8" data-testid="calculation-smoke-page">
      <section className="max-w-5xl mx-auto space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">ERP Calculation Smoke</p>
          <h1 className="text-3xl font-bold mt-2">Browser-side calculation verification</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
            <h2 className="text-lg font-semibold">Sales Invoice</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Gross</dt><dd data-testid="invoice-gross">{format(scenarios.invoice.totals.gross_amount)}</dd></div>
              <div><dt>Taxable</dt><dd data-testid="invoice-taxable">{format(scenarios.invoice.totals.taxable_amount)}</dd></div>
              <div><dt>Total GST</dt><dd data-testid="invoice-gst">{format(scenarios.invoice.totals.total_tax_amount)}</dd></div>
              <div><dt>Round Off</dt><dd data-testid="invoice-roundoff">{format(scenarios.invoice.totals.round_off_amount)}</dd></div>
              <div><dt>Final</dt><dd data-testid="invoice-final">{format(scenarios.invoice.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
            <h2 className="text-lg font-semibold">Purchase</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Gross</dt><dd data-testid="purchase-gross">{format(scenarios.purchase.totals.gross_amount)}</dd></div>
              <div><dt>Discount</dt><dd data-testid="purchase-discount">{format(scenarios.purchase.totals.discount_amount)}</dd></div>
              <div><dt>Total GST</dt><dd data-testid="purchase-gst">{format(scenarios.purchase.totals.total_tax_amount)}</dd></div>
              <div><dt>Final</dt><dd data-testid="purchase-final">{format(scenarios.purchase.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
            <h2 className="text-lg font-semibold">Returns</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Sales Return Taxable</dt><dd data-testid="sales-return-taxable">{format(scenarios.salesReturn.totals.subtotal_amount)}</dd></div>
              <div><dt>Sales Return GST</dt><dd data-testid="sales-return-gst">{format(scenarios.salesReturn.totals.total_tax_amount)}</dd></div>
              <div><dt>Sales Return Final</dt><dd data-testid="sales-return-final">{format(scenarios.salesReturn.totals.final_amount)}</dd></div>
              <div><dt>Purchase Return Final</dt><dd data-testid="purchase-return-final">{format(scenarios.purchaseReturn.totals.final_amount)}</dd></div>
            </dl>
          </article>

          <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
            <h2 className="text-lg font-semibold">Notes & Payment</h2>
            <dl className="mt-3 space-y-2">
              <div><dt>Note Taxable</dt><dd data-testid="note-taxable">{format(scenarios.note.totals.subtotal_amount)}</dd></div>
              <div><dt>Note GST</dt><dd data-testid="note-gst">{format(scenarios.note.totals.total_tax_amount)}</dd></div>
              <div><dt>Note Final</dt><dd data-testid="note-final">{format(scenarios.note.totals.final_amount)}</dd></div>
              <div><dt>Payment Remaining</dt><dd data-testid="payment-remaining">{format(scenarios.payment.remaining_outstanding)}</dd></div>
            </dl>
          </article>
        </div>

        <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
          <h2 className="text-lg font-semibold">Offline Note Queue</h2>
          <button
            type="button"
            data-testid="seed-offline-note"
            className="mt-3 rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
            onClick={() => { void seedOfflineNote(); }}
          >
            Seed Offline Note
          </button>
          <p className="mt-3" data-testid="offline-note-status">{offlineStatus}</p>
        </article>

        <article className="rounded-xl bg-slate-900 border border-slate-700 p-4">
          <h2 className="text-lg font-semibold">Critical Offline Queue</h2>
          <button
            type="button"
            data-testid="seed-critical-offline-docs"
            className="mt-3 rounded bg-cyan-400 px-4 py-2 font-semibold text-slate-950"
            onClick={() => { void seedCriticalOfflineDocs(); }}
          >
            Seed Critical Offline Docs
          </button>
          <pre className="mt-3 whitespace-pre-wrap" data-testid="critical-offline-status">{criticalOfflineStatus}</pre>
        </article>
      </section>
    </main>
  );
};

export default CalculationSmokePage;
