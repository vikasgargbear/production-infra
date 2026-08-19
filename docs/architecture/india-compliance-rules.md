# India Compliance Rule Ownership

This document is an engineering control, not legal or tax advice. Production
rules and golden examples require sign-off by the organization's qualified tax
and pharmaceutical compliance owners.

## Primary references checked

- CBIC, [Central Goods and Services Tax Act](https://cbic-gst.gov.in/hindi/CGST-bill-e.html),
  including section 170 on rounding statutory sums to the nearest rupee.
- CBIC, [Tax Invoice, Credit and Debit Note Rules](https://cbic-gst.gov.in/gst-invoice-rules.html),
  for required invoice particulars.
- CBIC, [Integrated Goods and Services Tax Act](https://cbic-gst.gov.in/hindi/IGST-bill-e.html),
  for place-of-supply rules. Same-state GSTIN comparison alone is not a complete
  place-of-supply engine for every goods/service transaction.
- GSTN, [e-invoice overview](https://tutorial.gst.gov.in/downloads/news/e_invoice_overview.pdf),
  which identifies the notified INR 5 crore AATO threshold effective from
  2023-08-01. The official IRP also reports a 30-day reporting restriction for
  taxpayers with AATO of INR 10 crore or more effective from 2025-04-01.
- CDSCO, [Drugs Rules, 1945 updated compilation](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%201945_2024%2009.09.2024.pdf),
  including wholesale purchase/sale records, drug name, quantity, batch,
  manufacturer, counterparty licence, competent-person signature, and record
  retention requirements.
- CDSCO, [Gazette notifications](https://www.cdsco.gov.in/opencms/opencms/en/Notifications/Gazette-Notifications/),
  which must be monitored for effective rule changes. The 2026 list includes
  amendments to controlled-drug schedules; a timeless product flag is not a
  sufficient compliance model.

References were reviewed on 2026-08-19. Store the source, notification/rule
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

Rules must be data/configuration with reviewed code evaluators, not editable
free-form JSON that bypasses constraints. MCP tools may explain the rule source
used but may not choose or override a ruleset supplied by the model.

## Current stop-ship gaps

1. The current GST decision primarily compares GSTIN state prefixes. It does not
   model all place-of-supply, registration, exemption, reverse-charge, or
   e-invoice applicability cases.
2. GST rates arrive on transaction items; the backend does not yet demonstrate
   effective-dated HSN/product rate resolution and snapshot provenance.
3. The exact rounding point for each invoice/tax/report field is not represented
   as a reviewed ruleset. Existing half-up tests are engineering invariants, not
   tax-owner approval of every statutory reporting field.
4. CDSCO schedule changes, licence restrictions, competent-person authorization,
   controlled-drug registers, and record retention are not covered by the
   current automated release matrix.
5. No immutable compliance-rule catalog or signed golden-case register exists.

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
