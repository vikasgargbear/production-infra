# Imported selling-rate contract

Invoice draft overrides take precedence over batch suggestions. REST product
batch reads and MCP stock-batch reads use the same named PostgreSQL resolver.
The resolver does not write products, invoices, stock, prices or archive facts.

Imported product/batch payloads may provide `sale_price_per_unit`,
`sale_price_uom_code` and `sale_price_basis`. Only a quoted base-UOM,
`tax_exclusive` selling price qualifies. Purchase cost and MRP never qualify.

Fallback historical invoice lines must have explicit `quoted_unit_rate`,
`uom_code`, `price_basis=tax_exclusive`, a positive billed quantity, and a
reviewed/included parent invoice. Product, batch, branch and dataset bindings
must match. Future or quarantined rows are excluded. These suggestions are
labelled "Last imported sale" with the source date; they are not a claim of a
current agreed customer price. Invoice overrides do not modify master prices.

## Existing import limitation

Earlier compiler versions omitted raw batch sale rates and historical line
pack/tax-basis metadata. This resolver cannot recreate those missing facts.
The source compiler preservation fix retains raw pricing evidence marked
`needs_review`. It does not assert a tax basis or conversion that was not proved.

Do not overwrite immutable imported facts or replay history under a new dataset
to add prices. Existing organizations need a separately reviewed, source-linked,
rate-only enrichment after confirming source unit and tax semantics. Until then,
unknown rates remain empty and editable. Deploying this resolver alone does not
make those old rates available.

Verification: the PostgreSQL runtime-role suite checks precedence, exact strings,
unit/basis rejection, date filtering, branch/tenant/dataset isolation and absence
of cost/MRP fallback. This is not live imported-dataset acceptance.
