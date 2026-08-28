# GST desktop boundary

GST reports render only canonical API projections. The browser must not:

- classify B2C invoices using a literal threshold;
- reconstruct GSTR-2B from local supplier invoices;
- infer tax, filing, compliance, or due-date facts;
- replace missing identities or money with placeholders or zero;
- recalculate exact API decimals with JavaScript floating-point arithmetic.

Current authoritative reads:

- GSTR-1: `/api/gst/reports/gstr1`
- GSTR-3B: `/api/gst/reports/gstr3b`
- Party-wise outward GST: the canonical GSTR-1 B2B projection

GSTR-2B stays visibly unavailable until the backend publishes a parsed GST
portal projection with reconciliation lineage. HSN stays unavailable until its
API groups immutable invoice-line classification and tax-version snapshots.
Local purchase lists and current product-master facts are not acceptable
substitutes.
