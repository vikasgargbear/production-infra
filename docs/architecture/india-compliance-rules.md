# India Compliance Rule Ownership

This document is an engineering control, not legal or tax advice. Production
rules and golden examples require sign-off by the organization's qualified tax
and pharmaceutical compliance owners.

## Primary references checked

- CBIC, [Central Goods and Services Tax Act](https://cbic-gst.gov.in/hindi/CGST-bill-e.html),
  including the definition of reverse charge as recipient liability and section
  170 on rounding statutory sums to the nearest rupee.
- CBIC, [CGST Act section 51](https://cbic-gst.gov.in/pdf/CGST-Act-2017-amended-01012022.pdf),
  which limits GST TDS to notified deductors, applies it when a contract exceeds
  INR 2.5 lakh, excludes GST and cess from the deduction basis, requires deposit
  within ten days after month end, and preserves certificate/credit evidence.
- Income Tax Department, [Income-tax Act 2025 transition FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance)
  and [section 393](https://www.incometaxindia.gov.in/w/section-393-5), which
  require the ERP to select the governing Act from the earlier credit/payment
  event: the 1961 Act through 2026-03-31 and the 2025 Act from 2026-04-01.
- Ministry of Finance, [Finance Bill 2025 memorandum](https://www.indiabudget.gov.in/budget2025-26/doc/memo.pdf),
  which records that Income-tax Act section 206C(1H) TCS on sale of specified
  goods ceased to apply from 2025-04-01. The canonical withholding workflow
  therefore does not speculate a continuing 206C(1H) sales-TCS fact.
- CBIC, [Tax Invoice, Credit and Debit Note Rules](https://cbic-gst.gov.in/gst-invoice-rules.html),
  for required invoice particulars.
- Tax on multi-rate service advances is deferred from the pharma-goods v1
  canonical release. `finance.payments` is settlement evidence, not a taxable
  advance calculation/tax snapshot, and therefore cannot source
  `tax.documents`. A future service module must introduce a reviewed typed
  taxable-advance owner before this workflow is enabled.
- CBIC, [Integrated Goods and Services Tax Act](https://cbic-gst.gov.in/hindi/IGST-bill-e.html),
  for place-of-supply rules. Same-state GSTIN comparison alone is not a complete
  place-of-supply engine for every goods/service transaction.
- GSTN, [e-invoice overview](https://tutorial.gst.gov.in/downloads/news/e_invoice_overview.pdf),
  which identifies the notified INR 5 crore AATO threshold effective from
  2023-08-01. The official IRP also reports a 30-day reporting restriction for
  taxpayers with AATO of INR 10 crore or more effective from 2025-04-01.
- GSTN IRP, [direct e-invoice API integration](https://einvoice6.gst.gov.in/content/api-integration/),
  which requires separate taxpayer and API-integrator onboarding before direct
  production use. Sandbox registration and provider-issued credentials are an
  operational release prerequisite, not values that may be seeded by the ERP.
- NIC/GSTN, [e-way bill API onboarding](https://docs.ewaybillgst.gov.in/apidocs/on-boarding-process.html)
  and [production prerequisites](https://docs.ewaybillgst.gov.in/apidocs/pre-requisites.html),
  which require pre-production certification and production onboarding. Direct
  access also requires approved Indian static outbound IP addresses; a free
  dynamic-egress Render service cannot satisfy that requirement. A reviewed GSP
  or a hosting/network upgrade is therefore required before e-way bill writes.
- GST Portal, [HSN validation advisory](https://tutorial.gst.gov.in/downloads/news/updated_advisory_on_hsn_validation_21.01.25.pdf),
  which identifies the portal's downloadable updated HSN/SAC list. Import that
  reviewed artifact with source and content hashes rather than maintaining an
  application-authored HSN list.
- CDSCO, [Drugs Rules, 1945 updated compilation](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%201945_2024%2009.09.2024.pdf),
  including wholesale purchase/sale records, drug name, quantity, batch,
  manufacturer, counterparty licence, competent-person signature, and record
  retention requirements.
- CDSCO, [Drugs Rules sale-licence forms](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%2C%201945.pdf),
  under which Forms 20B and 21B cover wholesale categories and Form 20G covers
  Schedule X wholesale. These licences may be perpetual while compliance is
  assessed periodically, so the schema stores the next verification date and
  does not invent an expiry date.
- CDSCO, [Gazette notifications](https://www.cdsco.gov.in/opencms/opencms/en/Notifications/Gazette-Notifications/),
  which must be monitored for effective rule changes. The page records final
  G.S.R. 506(E), dated 2026-06-22, expanding Schedule H2 traceability with
  staggered future effective dates; a timeless product flag is not sufficient.
- CDSCO, [G.S.R. 823(E)](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadGazette_NotificationsFiles/2022.11.17_Final%20GSR%20823%28E%29_Amendment%20in%20rule%2096%20for%20mandating.pdf)
  and the [implementation FAQ](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadPublic_NoticesFiles/Final%20FAQs%20on%20QR%20code%2021.07.2023.pdf),
  which establish Schedule H2 as a manufacturer barcode/QR obligation and
  enumerate the required product, manufacturer and batch data.
- CBIC, [CGST Act section 36](https://cbic-gst.gov.in/pdf/CGST-Act-Updated-31082021.pdf),
  which requires relevant GST accounts and records for 72 months from the due
  date of the annual return, or longer when proceedings or investigations remain
  open.
- Ministry of Corporate Affairs, [Companies Act 2013 section 128(5)](https://www.mca.gov.in/Ministry/pdf/CompaniesAct2013.pdf),
  which requires company books, papers and entry vouchers for at least the
  preceding eight financial years and permits a longer investigation hold.
- MeitY, [Digital Personal Data Protection Act 2023](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf)
  and [Digital Personal Data Protection Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa),
  which require erasure when purpose and legal-retention grounds end and impose
  additional processing-log retention requirements. Personal data therefore
  cannot be made permanent merely because a related accounting fact is.

References were reviewed on 2026-08-20. Store the source, notification/rule
identifier, publication date, effective date, supersession link, reviewer, and
content hash for every rule version used by a posted document.

## Required rule model

Do not scatter current thresholds and classifications through React or route
code. The backend should resolve a versioned ruleset using jurisdiction,
transaction date, organization registration/profile, supply type, product/HSN,
counterparty, and place of supply. A posted record snapshots both inputs and the
resolved rule version so later master-data or law changes do not rewrite history.

Required versioned domains include:

- GST registration and invoice type, place of supply, rate/cess, reverse charge,
  composition/exempt supply, discount valuation, credit/debit note linkage,
  rounding, HSN reporting, e-invoice/IRN, e-way bill, and return period locks;
- drug schedule/classification, prescription/authorized buyer restrictions,
  sale/purchase licence type and validity, competent person, batch and
  manufacturer, expiry/shelf life, storage/cold chain, recall/quarantine,
  controlled-drug registers, and jurisdiction-specific retention;
- organization applicability inputs such as PAN-level AATO history, GSTINs,
  branch licences, filing frequency, exemptions, and effective periods.
- Income-tax TDS and GST TDS provision, governing Act, earlier-credit/payment
  trigger, basis, rate, exact income-tax/CGST/SGST/IGST components, deductor and
  deductee identifiers, deposit deadline, challan, statement, certificate and
  compensating reversal.

Drugs Rules schedule and NDPS control are independent legal dimensions.
`drugs_rules_schedule` is limited to `NONE`, `G`, `H`, `H1`, or `X`; a product
or ingredient may separately be `ndps_regulated` with its own classification.
Neither dimension may be inferred from the other.

Schedule H2 is a third, independent traceability dimension, not a prescription
schedule value. Products therefore retain an effective-dated
`schedule_h2_applicable_from`, the exact unified `regulatory_ruleset_version`
used to classify Drugs Rules, NDPS, and H2 outcomes, and the
manufacturer-assigned `traceability_product_code` when available. Ingredient
classification rows carry their own `classification_ruleset_version`; there is
no second H2-only rules authority. The original named-brand obligation took
effect on 2023-08-01.
G.S.R. 506(E), dated 2026-06-22, expands H2 to vaccines, NDPS/psychotropic and
anticancer formulations from 2027-07-01 and antimicrobials from 2028-07-01.
Activation and receipt commands must fail closed when an effective H2 product
lacks the traceability evidence required by the reviewed ruleset.

The executable v1 licence vocabulary is deliberately narrow:
`drug_wholesale_form_20b`, `drug_wholesale_form_21b`,
`drug_schedule_x_wholesale_form_20g`, and
`state_pharmacist_registration`. It is a database CHECK, not a free-form code
that refers to a missing lookup. Supporting another licence requires a reviewed
migration defining its subject, jurisdiction, validity, and overlap rules.

Rules must be data/configuration with reviewed code evaluators, not editable
free-form JSON that bypasses constraints. MCP tools may explain the rule source
used but may not choose or override a ruleset supplied by the model.

## Tax-provider trust boundary

The ERP stores provider-neutral canonical request bytes before any NIC/GSP
translation. A separately deployed licensed adapter reads those exact bytes
through the hidden `/api/internal/tax-provider/requests:fetch` route and returns
the unmodified provider response plus normalized authority evidence through
`/api/internal/tax-provider/completions`. Both routes are excluded from OpenAPI,
require a dedicated bearer secret, and verify an HMAC over the timestamp,
method, path, and exact raw request body within a five-minute replay window.

The API connects through a separate `erp_tax_provider` database principal. It
has no direct authority-table DML: security-definer commands bind completion to
the stored adapter name, provider request ID, canonical request SHA-256, raw
response SHA-256, and signed-QR SHA-256. Generated e-way evidence must also
match the canonical movement's transport mode and vehicle. Cancellations and
expiry append evidence and preserve prior generated authority facts.

This boundary does not claim an official NIC or GSP mapping. The code-owned
promotion gate remains closed until a specific adapter/schema/conformance hash
is added to the reviewed allowlist together with official sandbox evidence.
The offline fixture validates only the ERP boundary and is explicitly not
sandbox certification.

## Retention and erasure policy

The canonical catalog's retention labels are policy inputs, not hard-coded
calendar intervals. Before deployment, a reviewed retention resolver must
compute `retention_until` and any legal hold from fact type, document period,
applicable organization law, open proceedings, and linked evidence. The longer
applicable statutory period wins for financial and regulated facts.

- GST records use the section 36 clock, not a generic "eight years after row
  creation" approximation.
- Company accounting records use the Companies Act financial-year clock and
  remain held longer when an investigation requires it.
- Wholesale drug registers and purchase/sale evidence retain at least the
  applicable Drugs Rules period; linked GST/company evidence may require longer.
- Immutable transaction facts may retain a party or actor identifier, but
  mutable contact/profile attributes are minimized and erased or anonymized
  after both operational purpose and legal retention end.
- `permanent` in a candidate catalog means "hard delete forbidden until a
  reviewed archival/erasure policy exists". It is not approval for indefinite
  personal-data retention.
- A legal hold suspends erasure without changing posted facts. Hold creation,
  release, reviewer, reason and source proceeding are auditable operations.

No retention worker, MCP deletion tool, or administrator action may purge a
linked fact independently. The implementation must first prove reachability
from invoices, journals, tax filings, stock ledgers, licences, recalls,
attachments, audit events, and agent approvals.

## Current stop-ship gaps

1. The current GST decision primarily compares GSTIN state prefixes. It does not
   model all place-of-supply, registration, exemption, reverse-charge, or
   e-invoice applicability cases.
2. The canonical posting model requires document-date `tax_code_version_id`
   resolution and snapshots, but the deployed legacy backend does not yet use
   that boundary end to end.
3. The exact rounding point for each invoice/tax/report field is not represented
   as a reviewed ruleset. Existing half-up tests are engineering invariants, not
   tax-owner approval of every statutory reporting field.
4. CDSCO schedule changes, licence restrictions, competent-person authorization,
   controlled-drug registers, and record retention are not covered by the
   current automated release matrix.
5. The canonical model now has immutable reviewed reference-release provenance,
   but no official release rows or signed golden-case register exist.
6. Typed withholding deduction/reversal, gross vendor-advance, accounting,
   deposit, statement, and certificate database commands now exist. The official
   imported ruleset, reviewed operator API, statutory deadline UI, and MCP
   approval flow remain release blockers and require statutory golden-case tests.
7. E-invoice and e-way bill production credentials and official sandbox
   certification are absent. The provider-neutral response-evidence boundary is
   implemented and fail-closed, but no adapter/schema/conformance profile is
   promoted. Render free also lacks the static Indian egress required for direct
   e-way bill production access.
8. The isolated official-host import and derived product-activation commands
   are generated but no migration-owned HSN/SAC or drug-classification dataset
   has been imported from reviewed official artifacts. The operational
   readiness gates remain unresolved; activation and taxable posting must remain unavailable
   rather than using guessed defaults.

These gaps prohibit a production-readiness claim and any MCP tool that posts,
cancels, files, or changes regulated records.

## Required golden cases

Each case records its legal source and effective date, expected line/header and
filing values, eligibility decision, error behavior, and reviewer approval.
Cover intra/inter-state goods, registered/unregistered recipients, discounts
before/after supply, free goods and commercial schemes, returns and credit/debit
notes, rate changes across dates, exempt/composition/reverse-charge cases,
e-invoice applicability and time limits, expired/invalid licences, Schedule
H/H1/X restrictions, recalled/quarantined/expired batches, and correction after
period lock or filing.
