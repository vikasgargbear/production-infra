import React, { useState } from 'react';
import ItemsTable, { ItemsTableItem } from '../components/global/ui/display/ItemsTableUnified';
import { freeSupplyTreatmentAfterQuantityEdit } from '../components/sales/invoice/utils/canonicalInvoiceCommand';

// Presentation/keyboard fixture only: no API calls or posting authority.
export default function InvoiceRowSmokePage() {
  const [items, setItems] = useState<ItemsTableItem[]>([{
    product_name: 'AASO TONE SYP 200ML', batch_number: 'LOT-A', expiry_date: '2028-12-01',
    quantity: '1', unit_price: '180.00', mrp: 220, discount_percent: '10',
    free_quantity: '2', free_supply_tax_treatment: 'excluded_from_taxable_value',
    gst_percent: '5', line_total: '170.10',
  }]);
  return <main className="p-4">
    <h1>Invoice row layout test</h1>
    <ItemsTable compactBilling showFreeSupplyTaxTreatment preserveExactDecimals items={items}
      onUpdateItem={(index, field, value) => setItems(previous => previous.map((item, i) => i !== index ? item : {
        ...item, [field]: value,
        ...(field === 'free_quantity' ? {free_supply_tax_treatment: freeSupplyTreatmentAfterQuantityEdit(value, item.free_supply_tax_treatment)} : {}),
      }))} />
  </main>;
}
