# Canonical calculation artifact authority

`calculation.artifacts` is the one calculation-evidence fact. It does not
replace typed sales/procurement headers or lines and is not a second fiscal,
tax, stock, payable, or journal authority.

## Trust boundary

The normal `erp_runtime`/`erp_app` path has `SELECT` only on the table and no
issuer or consumer execution privilege. The migration creates a
`NOINHERIT NOBYPASSRLS` login named `erp_calculator` with no table privileges.
Only that login may execute `issue_artifact`, and the function rejects unless
`session_user = 'erp_calculator'`. Its password is provisioned separately in
the deployment secret store and is held only by the version-pinned Decimal
calculator service. Browser, REST, MCP, and normal application connections
never receive it.

This is an authenticated database-session attestation, not a client-supplied
hash. The issuer validates the fixed schemas, typed aggregate/version,
idempotency claim and optional MCP command binding, then computes all hashes in
PostgreSQL. Deployment remains blocked until the separate credential/connection
and PostgreSQL execution tests exist.

## Canonical envelopes

The normative schemas are `calculation-input-v1.schema.json` and
`calculation-output-v1.schema.json`. `aasopharma-jcs-decimal-v1` means RFC 8785
JCS lexicographic object-key ordering, UTF-8 with no insignificant whitespace,
and normalized finite `Decimal` values encoded as JSON strings. Arrays retain
business order; calculation lines use stable `(line_number, line_id)` order.
Unknown or missing object keys are rejected. IDs are UUID strings, versions are
JSON integers, and every quantity/rate/money result is a decimal string.

Output top-level keys in canonical order are:

```text
aggregate_version,currency_code,engine_version,gst_tax_treatment,lines,operation,resource_id,
resource_type,ruleset_version,schema,schema_version,serializer_version,totals
```

Every output line has the exact keys declared by the schema, including
`final_residual`. For a document it is `false`. For a reversal it records the
calculator's explicit final-residual choice. Return output `line_id` is the
original invoice/supplier-invoice line ID used by the reversal engine; the
posting command joins it through the typed original-line FK on the return line.

`gst_tax_treatment` is required on the document/reversal input and output. A
`statutory` adjustment uses the existing GST basis and component calculation.
A `commercial_only` document treats each quoted unit rate or charge amount as
the gross financial-credit basis before explicit discounts, produces zero GST
adjustment, and preserves the intended counterparty credit for both originally
tax-inclusive and tax-exclusive pricing. A `commercial_only` reversal derives
the current financial credit from the proportional original payable amount;
prior statutory and commercial credits share one cumulative payable ceiling,
and final residual consumes the exact remaining payable without reversing any
additional GST.

Reversal wire names match the Decimal engine. Current product commands use
`reversed_billed_quantity`, `reversed_free_quantity`,
`reversed_base_billed_quantity`, and `reversed_base_free_quantity`; current
charge commands use `ratio`. Cumulative prior product state retains those four
quantity names plus `gross_price_amount`, both discount amounts, net and GST
taxable values, and the four tax components. Cumulative charge state uses
`reversed_ratio`, not `amount`, with the same applicable monetary and tax
components. Current command rows and cumulative prior rows are different fixed
schemas and are validated separately.

## Call order

1. On the normal `erp_app` connection, activate verified tenant/actor context,
   check command permission/approval, and call the existing public
   `core.claim_idempotency_key(uuid,uuid,varchar,bytea,bytea,timestamptz)`.
   Actor is server-derived. A terminal replay returns its stored response and
   does not recalculate.
2. Build the fixed input envelope from the locked typed draft and invoke the
   Decimal engine. On the calculator-only connection, set the same verified
   transaction-local tenant/actor context and call:

```text
erp_calculation_authority.issue_artifact(
  artifact_id uuid, branch_id uuid, operation varchar, resource_type varchar,
  resource_id uuid, aggregate_version bigint, request_id uuid,
  command_request_id uuid, idempotency_key_id uuid, request_sha256 bytea,
  input_bytes bytea, output_bytes bytea, engine_version varchar,
  ruleset_version varchar, serializer_version varchar, expires_at timestamptz
) -> uuid
```

   Exact retry against the same claimed key returns the same artifact; drift
   conflicts. For MCP, update `command_requests.calculation_hash` to the
   artifact `authority_hash` before approval/execution.
3. The typed posting command locks the same idempotency row, artifact, header,
   and lines. It reconstructs and compares the fixed input envelope, parses the
   fixed output, compares every applicable line/header decimal field and stable
   line population, then calls the private function inside the same transaction:

```text
erp_calculation_authority.consume_artifact(
  org_id uuid, artifact_id uuid, operation varchar, resource_type varchar,
  resource_id uuid, aggregate_version bigint, request_id uuid,
  command_request_id uuid, idempotency_key_id uuid
) -> bytea
```

   `consume_artifact` independently rechecks its database-computed input,
   output and authority hashes, authenticated principal evidence, actor,
   request, idempotency, optional approved MCP command, typed source state and
   row version. It returns the exact output bytes and changes `issued` to
   `consumed` once. A posting failure rolls consumption back. The command then
   creates all typed stock/tax/accounting effects and completes the already
   claimed idempotency row atomically. A terminal retry returns the stored
   response without consuming again.

The consumer intentionally has no `expected_output_hash` argument: the caller
cannot nominate an authority. The artifact ID plus request/idempotency/typed
aggregate bindings select one database-issued proof, its hashes are recomputed
internally, and the typed posting command must compare the returned fixed-schema
bytes to every persisted calculation fact before changing state.
