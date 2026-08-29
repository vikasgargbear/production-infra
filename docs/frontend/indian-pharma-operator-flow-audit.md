# Indian pharma operator-flow audit

Date: 2026-08-28

Scope: repository UI and canonical API on `main` at `31ffc5566e9879c4b9a0878fd9c3d5c8a0065394`

Target operator: Indian pharmaceutical wholesaler/stockist using keyboard-first desktop entry, with mobile as a companion.

## Decision

Do not clone MARG screen-for-screen. Preserve the current canonical accounting, tax, batch, approval and audit boundaries, while adopting the operator habits that reduce keystrokes:

- brand/generic/salt/code/barcode search from the same product lookup;
- familiar packing notation such as `1*10` and `10*10`;
- Enter-to-next-field and one-pass entry for routine masters;
- purchase and sales workspaces that present the common path first;
- batch, expiry, free quantity and scheme details at the transaction where they become facts;
- advanced and exceptional fields behind disclosure controls.

Do not restore the former guessed defaults for GST, margin, expiry, batch or opening quantity. They were fast because they silently invented business facts.

## Evidence used

Primary product references:

- [MARG item creation](https://care.margcompusoft.com/margerp/inventory-master/170482/1/Item-Creation-in-Marg-Book) documents `1*10`, Unit 1 `Tab`, Unit 2 `Strip`, conversion `10`.
- [MARG PharmaNXT](https://care.margcompusoft.com/margerp/pharmanxt-free-drugss/154858/1/How-to-view-Pharmanxt-free) searches a drug catalogue by the first characters and exposes packing, company, HSN, GST and salt/substitute context.
- [MARG purchase bill](https://care.margcompusoft.com/margerp/purchase/4260/1/How-to-create-Purchase-Bill) keeps supplier invoice, item, batch, quantity and rate in a direct bill-entry path.
- [MARG purchase features](https://care.margcompusoft.com/margerp/purchase) include invoice import, challan-to-bill, purchase return, discounts and item creation while purchasing.
- [MARG batch features](https://care.margcompusoft.com/margerp/batch) cover batch/MRP/cost, free quantity, schemes, FIFO and near-expiry work.
- [MARG breakage/expiry flow](https://care.margcompusoft.com/marg-books/brk-exp-issue/175716/9/What-is-the-process-of) separates expired/damaged stock and supplier claims.
- [MARG outstanding features](https://care.margcompusoft.com/margerp/outstandings) organize collection by party, area/route and age.
- [SWIL pharma distribution](https://www.swindia.com/solutions/distribution) emphasizes order allocation, pick-pack-dispatch, schemes, secondary sales and GST/e-way operations.
- [SWIL stockist](https://www.swindia.com/solutions/stockist) emphasizes inbound schemes/free goods, FEFO, party pricing, credit limits and expiry return.
- [GoFrugal batch and expiry](https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/inventory-management/physical-inventory/articles/batch-and-expiry) captures batch/expiry at purchase and blocks expired stock at sale.
- [CDSCO approved drugs](https://www.cdsco.gov.in/opencms/opencms/en/Approval_new/Approved-New-Drugs/) and [approved FDCs](https://www.cdsco.gov.in/opencms/opencms/en/Approval_new/FDC-New-Drugs-Marketing/) are authoritative regulatory references, not a complete branded SKU catalogue.
- [NPPA Pharma Sahi Daam](https://www.nppaindia.nic.in/pharma_sahi_daam) is a public price-information reference, not a substitute for a licensed operational product catalogue.

MARG's proprietary medicine catalogue must not be copied or scraped. A production brand/pack catalogue should come from a licensed source, supplier invoice imports and reviewed CDSCO/NPPA-derived reference workflows.

## Flow-by-flow result

| Flow | Current canonical coverage | Operator comparison | Decision |
|---|---|---|---|
| Product master | Reviewed manufacturer, HSN, UOM conversion, ingredient classification and an internal release gate | The former one-page form was faster; the five-screen wizard exposed internal concepts and `Pack (pk)` could be misread as the smallest medicine unit | Implement one-pass setup, `1*10`/`10*10`, early salt search, friendly errors and a two-step setup/review path |
| Customer/supplier master | Canonical legal party identities, addresses and role-bound creation | Stronger authority than legacy ERPs, but wholesalers also expect fast code/name/GSTIN search and bulk onboarding | Keep authority; next add reviewed CSV import and area/route fields only when collection workflows consume them |
| Sales | Separate invoice, challan, sales order and history; canonical preview/post/readback | Familiar capabilities, but four entry points make a routine wholesale bill feel like a process choice | Keep documents separate in storage; next add one “Sales bill” workspace with optional order/challan linkage and keyboard product/batch search |
| Purchase | Guided receipt-then-invoice, PO, GRN, supplier invoice and combined history | Correct three-way control, but MARG users often begin from the supplier bill and expect invoice import | Keep PO/GRN/invoice authority; connect the existing safe invoice parser to a non-posting mapping preview, then require normal GRN/invoice review |
| Batch/stock | Current stock, adjustment, batches, movements, transfer and certified destruction | Good audit coverage; missing a single near-expiry/expired/damaged workbench and supplier claim path | Add FEFO/near-expiry queue, quarantine, purchase return or certified destruction choices; never use generic adjustment as a shortcut |
| Returns | Sales return, purchase return, commercial reversal, approval inbox and resume-post | More explicit than MARG and appropriate for tax/accounting correctness | Keep; present “Return to supplier” from the batch/expiry workbench to avoid making operators choose an accounting document first |
| Receipts/payments | Customer receipt, supplier payment/advance, cheque actions and history | Core parity exists | Keep; next make allocation keyboard-first and surface credit-limit/overdue warnings at order entry |
| Ledger/outstanding | Canonical party statement, outstanding and collection center | Core parity exists; MARG users expect route/area collection lists | Add route/beat only as a party master attribute with an authoritative collection projection; do not restore invented follow-up data |
| GST | GST dashboard, reports, GSTR-1 and GSTR-3B | Appropriate and safer than manual rate defaults | Keep reviewed tax release and derived GST; never prefill a guessed HSN/rate |
| Reports | Executive, sales, purchase, inventory, product, finance, ledger, payments, P&L, tax and GST views | Thirteen report tabs are already close to legacy ERP menu sprawl | Group into Daily operations, Compliance and Finance; hide role-irrelevant reports instead of adding more top-level tabs |
| Mobile | Mobile-safe layouts and sticky actions exist | Useful for stock checks/approvals, but dense transaction entry remains desktop-first in this market | Keep responsive companion flows; optimize scan, lookup, approval and collection before attempting full mobile parity |

## Implemented in this change

The product path now preserves the faster earlier interaction without its unsafe defaults:

1. All routine product fields are on one entry page; the second page is a final review with an “Add product” action.
2. `1*10`, `1x10`, `1×10`, `10*10` and `1*100 ml` are parsed into exact canonical UOM conversions.
3. `10*10` with Strip produces `1 Strip = 10 Each` and `1 Box = 100 Each`.
4. Salt search appears in the same setup page. A single unambiguous strength such as `500 mg` or `250 mg/5 ml` fills the first selected salt row, but remains editable. Combination strengths are not guessed.
5. The raw `Invalid uuid / Invalid` validation leak is replaced with field names such as `Manufacturer is required` and `HSN code is required`.
6. Internal draft/activation terminology is hidden from operators: incomplete records say “Setup incomplete”, and the final action says “Add product”. The backend release gate remains mandatory before purchase/sale.
7. Storage and shelf-life fields are collapsed as optional. Batch number, manufacture/expiry, MRP, purchase cost, free quantity and opening stock remain owned by Goods receipt.
8. Client validation runs before draft creation, so an obviously incomplete new form does not create an orphan draft.
9. MCP product setup reuses the browser's `CanonicalProductSetupWrite` model and `_execute_canonical_product_setup` command helper; it does not maintain a parallel AI-only product shape.
10. ChatGPT can resolve setup options, reviewed HSN and ingredients, create an unused product, fill supported setup facts, and read back exact missing fields. It cannot perform the final **Add product** release action.
11. Purchase-bill image guidance requires an extraction/mapping review and one consolidated missing-context question. With explicit permission, unresolved facts are skipped and remain visible rather than being guessed.

## Prioritized backlog

### P0 — before broad wholesaler rollout

- Connect the existing `/purchase-upload/parse-invoice-safe` parser to a reviewed supplier-invoice mapping preview; parsing must never post stock or accounts.
- Build a batch/expiry workbench: near expiry, expired, damaged, quarantine, supplier return and destruction, with FEFO selection in sales.
- Add party credit-limit and overdue warnings to sales order/invoice context, enforced by backend policy rather than client-only color.
- Verify a licensed branded medicine/SKU source or a supplier-import onboarding path. The reviewed salt corpus alone does not remove product-master typing.
- Fix and acceptance-test every dashboard/report 5xx before showing the corresponding navigation item.

### P1 — operator throughput

- Unified Sales bill workspace over the existing order/challan/invoice chain.
- Barcode scan in product/batch lookup and label printing from received batch truth.
- Reorder/min/max/shortage queue based on configured policy and posted stock, not estimated values.
- Route/area/beat collection projection and day-wise collection sheet.
- Inline “create missing product/party” detour that resumes the transaction without bypassing master review.

### P2 — stockist scale

- Party/product pricing agreements and reviewed scheme rules.
- Secondary-sales/principal reports when a principal contract actually requires them.
- Bulk order spreadsheet import with a preview, exact product resolution and rejected-row report.
- Multi-depot allocation/pick-pack-dispatch optimization.

## Explicitly deferred

- Retail pharmacy patient/doctor reminders, loyalty, payroll and clinic features.
- Hundreds of configuration toggles or report variants copied from mature legacy installations.
- Manual schedule, prescription, GST or NDPS flags when reviewed classification can derive them.
- Silent product, batch, price, expiry, stock or margin defaults.
- Play Store work or unrelated deployment changes in this product-flow patch.
