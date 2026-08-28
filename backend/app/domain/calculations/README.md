# Canonical calculation authority

This package is the backend-owned arithmetic authority for future sales,
procurement, credit-note, debit-note, and return workflows. It is currently
additive: mounted routes continue to use their existing calculators until this
contract is reviewed and the API migration is deliberate.

## Fixed arithmetic rules

- Numeric inputs are finite `Decimal` values. Floats, numeric strings, and
  implicit coercion are rejected.
- INR money is rounded to paise with `ROUND_HALF_UP` at each auditable line,
  discount, and tax-component boundary.
- Header amounts are sums of their rounded lines. `net_value_amount` retains
  all payable pre-tax value; `gst_taxable_value` separately retains only the
  taxable/zero-rated GST reporting basis.
- CGST and SGST are used only for an explicitly supplied intra-state document;
  IGST is used only for an explicitly supplied inter-state document.
- Ad-valorem cess is calculated separately from GST. Quantity-specific or
  compound cess is not represented and must not be approximated with this API.
- Document discount paise are allocated proportionally and any rounding
  residual is assigned deterministically. Allocation always equals the exact
  document discount.
- Commercial billed/free quantities, their base-UOM counterparts, and the UOM
  conversion factor are all explicit. Base quantities must equal commercial
  quantities multiplied by that factor at six-decimal quantity precision.
- Tax-inclusive extraction preserves supplied payable exactly. Intra-state
  CGST and SGST are independently rounded from equal half-rates, remain equal,
  and the net value absorbs any inclusive-price paise residual.
- Every persisted numeric input is checked against its canonical database
  precision and scale. Intermediate multiply/divide/allocation operations use
  a 64-digit local decimal context; a result outside `numeric(20,2)` fails
  before persistence.
- `rounding_policy` is explicit: `none` preserves paise and `nearest_rupee`
  exposes `pre_round_total`, `rounding_adjustment`, and `grand_total`.

## Policies the engine will not guess

GST treatment depends on facts that arithmetic cannot establish. Every caller
must resolve and persist these inputs from the commercial document and tax
policy in force:

- `gst_type`: place-of-supply and supplier-location facts determine intra-state
  versus inter-state treatment.
- `free_supply_tax_treatment`: free units may be excluded from value for a valid
  commercial scheme or included at unit price for another fact pattern. The
  engine does not decide whether Section 15 conditions are met.
- `price_basis`: the caller states whether quoted unit rate or charge amount includes
  ad-valorem GST and cess.
- `DiscountBasis`: the caller states whether a discount is a reduction of
  pre-tax value or of the tax-inclusive price. Eligibility for a post-supply
  or document discount is also explicit per line.
- `taxability_snapshot`, GST rate, and cess rate: product and charge values are
  explicitly `taxable`, `zero_rated`, `exempt`, `nil_rated`, or `non_gst`.
  Freight, insurance, and handling are never classified from their label.
- `zero_rated_mode`: export/SEZ callers explicitly select without-payment under
  bond/LUT or with-IGST treatment. Zero-rated documents are inter-state only;
  illegal CGST/SGST and mixed-treatment documents fail validation.
- `tax_charge_mechanism`: normal documents add GST to counterparty payable;
  reverse-charge documents retain tax components for liability/ITC evidence,
  exclude them from supplier payable, and expose `recipient_assessed_tax_total`.
  Whether that recipient is this organization is a posting-context decision:
  inward RCM becomes organization self-assessed tax; outward RCM does not.
- `ReversalValueBasis`: the caller chooses billed-quantity or physical
  base-quantity proportional valuation. Charge reversal ratios are explicit.

## Cumulative reversals

Partial returns must be calculated while the original line and its cumulative
reversal state are locked in the database. The caller passes
`PriorReversalState`; each new component is the rounded cumulative target less
the amount already reversed. This makes any partition of returns telescope to
the exact original paise instead of rounding every return independently.

After posting, merge the result with `accumulate_reversal_state` in the same
transaction. Mark the last return `final_residual=True`; it is accepted only
when all remaining product quantities or the remaining charge ratio are being
consumed, and its monetary values become the original residual exactly. The
same cumulative method reverses the signed header rounding adjustment, so all
partial returns sum to the original `grand_total`.

These are compliance decisions upstream of calculation. Missing evidence must
fail document validation rather than silently select a convenient default.

Zero-rated mode semantics are grounded in the official CBIC publication of
[IGST Act section 16](https://cbic-gst.gov.in/hindi/IGST-bill-e.html) and the
[GST invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html). Legal
classification remains an upstream evidence decision; this engine only
enforces the selected calculation treatment.
