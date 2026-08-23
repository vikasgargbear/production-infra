# Tax provider evidence boundary

This reviewed fragment owns only the PostgreSQL command and evidence state
machine for `tax.einvoices` and `tax.eway_bills`. It does not connect to NIC,
GSTN, an IRP, or a GSP, and it contains no endpoint or credential.

Application actors with the existing regulated permission may call
`begin_einvoice` or `begin_eway_bill`. PostgreSQL locks the typed source and
chain head, constructs deterministic canonical JSON bytes from immutable tax
facts or an allowlisted posted transfer/return/destruction movement, hashes those bytes, enforces the
adapter allowlist, and appends one `requested` attempt. The exact retry returns
the same artifact; request-ID or byte drift conflicts.

Only the isolated `erp_tax_provider` session principal may complete a pending
attempt. Completion records one exact provider response and its database-
computed hash. Generated e-invoices additionally require IRN, acknowledgement,
and signed-QR bytes with a verified hash. A terminal row cannot change again.
Cancellation, regeneration, retry after failure, and e-way expiry each append a
new successor; prior evidence is never overwritten or deleted.

Supported adapter contracts are `nic_irp_v1`, `licensed_gsp_irp_v1`,
`nic_eway_v1`, and `licensed_gsp_eway_v1`. These are code allowlist identities,
not claims that an adapter or provider account has been provisioned.

External provider submission remains disabled for the initial production
release. Finance owns applicability review and any required e-invoice or
e-way-bill submission outside this application. Enabling provider submission
requires operators to provision sandbox/production credentials outside
PostgreSQL, provide required Indian static egress and IP allowlisting, pin the
adapter implementation to the current official schema, and pass official
generation, duplicate, signed-QR, cancellation, regeneration, expiry, and
failure conformance cases.

E-invoice generation also fails closed until the canonical model contains a
reviewed PAN/fiscal-year AATO profile and effective applicability/reporting-
window release. `provider-operational-readiness.json` deliberately contains no
secrets. For a provider-disabled release, the production CI audit requires a
reviewed manual-compliance owner and does not claim legal inapplicability. If
provider submission is enabled later, the audit requires sandbox conformance,
non-secret credential-provisioning evidence, static Indian egress/IP
allowlisting or a licensed GSP route, and e-invoice applicability evidence.
