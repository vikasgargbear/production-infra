/* Offline visual QA of the actual app PDF builder; no API or business writes. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { buildInvoicePDF, generateInvoiceHTML } = require('../src/utils/invoicePdfGenerator.ts');
const item = {
  product_name: 'KOFLINTUS SYP 100ML - visual QA only', manufacturer_name: 'QA Pharmaceutical Manufacturer',
  batch_number: 'KP2602ED', expiry_date: '2027-12-01',
  batch_allocations: [{ batch_number: 'KP2602ED', expiry_date: '2027-12-01', billed_quantity: '2.000000', free_quantity: '1.000000' }],
  hsn_code: '30049099', sale_unit: 'BTL', quantity: '2.000000', free_quantity: '1.000000',
  free_supply_tax_treatment: 'excluded_from_taxable_value', unit_price: '100.0000',
  line_discount_kind: 'percent', line_discount_basis: 'price_value', line_discount_value: '10.000000',
  line_discount_amount: '21.00', line_taxable_discount_amount: '20.00',
  document_discount_amount: '9.45', document_taxable_discount_amount: '9.01',
  discount_percent: '10.000000', gst_percent: '5.000000', taxable_amount: '170.99',
  cgst_amount: '4.28', sgst_amount: '4.28', igst_amount: '0.00', cess_amount: '0.00', line_total: '179.55',
};
const invoice = {
  invoice_number: 'QA-LAYOUT-001', invoice_date: '2026-09-17', due_date: '2026-09-17', status: 'TEST SAMPLE',
  seller_legal_name: 'TEST ONLY - Invoice Layout QA', seller_gstin: '08AAAAA0000A1Z5',
  seller_address: 'Synthetic seller address\nJaipur, Rajasthan 302001', seller_drug_license_numbers: [],
  customer_name: 'TEST ONLY - Pharmacy', customer_drug_license_numbers: [],
  billing_address: 'Synthetic customer address\nJaipur, Rajasthan 302001',
  shipping_address: 'Synthetic customer address\nJaipur, Rajasthan 302001',
  supply_type: 'intra_state', place_of_supply_state_code: '08', place_of_supply_display_name: 'Rajasthan',
  tax_charge_mechanism: 'normal', items: [item], subtotal_amount: '200.00', discount_amount: '29.01',
  charges_amount: '0.00', net_value_amount: '170.99', taxable_amount: '170.99',
  cgst_amount: '4.28', sgst_amount: '4.28', igst_amount: '0.00', cess_amount: '0.00', rounding_adjustment: '0.00', total_amount: '179.55',
};
const out = path.resolve(process.argv[2] || 'output/pdf');
fs.mkdirSync(out, { recursive: true });
function save(name, value) {
  const pdf = buildInvoicePDF(value);
  fs.writeFileSync(path.join(out, `${name}.pdf`), Buffer.from(pdf.output('arraybuffer')));
  fs.writeFileSync(path.join(out, `${name}.html`), generateInvoiceHTML(value));
  console.log(`${name}: ${pdf.getNumberOfPages()} pages`);
}
save('invoice-clean-single', invoice);
const count = 30;
const multiply = value => ((BigInt(value.replace('.', '')) * BigInt(count)) / 100n).toString() + '.' + ((BigInt(value.replace('.', '')) * BigInt(count)) % 100n).toString().padStart(2, '0');
const multi = { ...invoice, invoice_number: 'QA-LAYOUT-MULTIBATCH', items: Array.from({ length: count }, (_, index) => ({
  ...item, product_name: `${index + 1}. Long pharmaceutical product name 250MG/5ML 100ML`,
  batch_allocations: [
    { batch_number: `QA-${index + 1}-FIRST`, expiry_date: '2027-12-01', billed_quantity: '1.000000', free_quantity: '1.000000' },
    { batch_number: `QA-${index + 1}-SECOND`, expiry_date: '2028-02-01', billed_quantity: '1.000000', free_quantity: '0.000000' },
  ],
})) };
for (const field of ['subtotal_amount', 'discount_amount', 'net_value_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'total_amount']) multi[field] = multiply(invoice[field]);
save('invoice-clean-multibatch', multi);
