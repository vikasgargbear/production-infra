# Canonical live verification

This suite is the destructive, credential-gated verification for the canonical
ERP command boundary. It is **staged infrastructure**, not evidence that the
canonical action API is currently deployed. A valid run is possible only after
the canonical baseline and implemented commands are on a disposable Supabase
project, the hidden readiness endpoint reports exactly the reviewed adapter
split, and a reviewed fixture input pack exists.

The suite never writes legacy tables directly. It sends ordinary operator input
through the same command handlers by two transports:

- internal REST with a service bearer and delegated test-user bearer;
- hosted MCP JSON-RPC with the delegated MCP access token.

It uses the reviewed hidden routes exactly:

```text
GET  /api/internal/mcp/actions/ready
POST /api/internal/mcp/actions/{command_type}/prepare
POST /api/internal/mcp/commands/{command_request_id}/approve
POST /api/internal/mcp/commands/{command_request_id}/execute
GET  /api/internal/mcp/commands/{command_request_id}
```

Changing these paths in environment variables is rejected. When the checked-in
action registry advertises paths in the readiness response, they must match too.
These routes stay absent from the public OpenAPI document.

## Safety gate

Normal collection is offline and needs no credentials:

```bash
PYTHONPATH=backend backend/venv/bin/python -m pytest \
  --collect-only -q backend/tests/live_canonical
```

An actual invocation without the complete gate errors before an HTTP session or
database connection is created. Every variable below is required except the
timeout:

```bash
export PHARMA_CANONICAL_LIVE_WRITE_ACK=true
export PHARMA_CANONICAL_LIVE_TARGET_KIND=disposable_test
export PHARMA_CANONICAL_LIVE_PROJECT_REF='<exact-20-character-test-project-ref>'
export PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF='<same-reviewed-test-project-ref>'
export PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS='<comma-separated-denylist>'

export PHARMA_CANONICAL_LIVE_API_BASE_URL='https://isolated-canonical-api.example'
export PHARMA_CANONICAL_LIVE_DATABASE_URL='postgresql://erp_runtime:...@db.<project-ref>.supabase.co/postgres'
export PHARMA_CANONICAL_LIVE_SERVICE_TOKEN='<internal MCP service credential>'

export PHARMA_CANONICAL_MCP_URL='https://isolated-mcp.example/mcp'
export PHARMA_CANONICAL_MCP_ACCESS_TOKEN='<short-lived-requester-mcp-oauth-token>'
export PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN='<short-lived-reviewer-mcp-oauth-token>'

export PHARMA_CANONICAL_LIVE_TEST_ORG_ID='<disposable-org-uuid>'
export PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID='<disposable-supabase-auth-user-uuid>'
export PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID='<disposable-branch-uuid>'
export PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID='<distinct-disposable-denial-org-uuid>'
export PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_PATH='/absolute/path/reviewed-input-pack.json'
export PHARMA_CANONICAL_LIVE_TIMEOUT_SECONDS=30
```

The database URL must prove both the exact project and runtime role through
`erp_runtime@db.<ref>.supabase.co` or the session-pooler username
`erp_runtime.<ref>` on `*.pooler.supabase.com`. The target ref is
rejected if it appears in the production denylist. Do not put tokens, passwords,
database URLs, or a populated input pack in Git.

The database login must be exactly the non-owner, non-superuser,
non-`BYPASSRLS` `erp_runtime` role. Every reconciliation query activates the
verified Auth user and target organization inside a read-only transaction; the
database resolves the active canonical user and membership. The same Auth user
must have a real active membership in the distinct denial organization. The
same target resource is queried there and must be invisible.

The target organization must also contain this active typed setting, provisioned
through the canonical administrative boundary:

```text
scope_kind = organization
namespace  = test_safety
key        = disposable_live_write_target
value_type = boolean
value_boolean = true
status     = active
```

Every hidden REST call requires a short-lived delegated JWT whose
`operator_operation` and `operator_permission` claims match that exact route.
The harness obtains each token immediately before that call through the reviewed
`/api/internal/mcp/agent-grants/authorize-action` issuer. This is required for
approve, execute, and status because their delegations are bound to the newly
created `command_request_id`; a static delegated-token bundle cannot represent
that contract and must never be stored as a CI secret. The requester and
independent reviewer OAuth tokens are created through PKCE for disposable Auth
users and are masked for the lifetime of one serialized job.

The harness reads the tenant marker before the first business prepare call. Missing or
ambiguous marker evidence stops the run. Never add this marker to a real tenant.
The suite leaves facts in the disposable tenant for inspection; destroy or reset
the entire disposable project after evidence is exported.

## Fixture input pack

[`scenario_matrix.json`](../../../backend/tests/live_canonical/scenario_matrix.json)
owns required coverage and ordering. The external JSON input pack supplies the
IDs and payload shapes accepted by the deployed action registry. Its top level
is:

```json
{
  "schema_version": "1.1.0",
  "steps": {
    "sales_order_mixed": {
      "payload": {
        "idempotency_key": "prepare:sales-order-mixed:0001",
        "branch_id": "<uuid>",
        "customer_account_id": "<uuid>",
        "lines": [
          {
            "product_id": "<uuid>",
            "uom_conversion_id": "<uuid>",
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
              "line_discount_kind": "percent",
              "line_discount_basis": "taxable_value",
              "line_discount_value": "5.000000"
            },
            "document_discount_eligible": true
          }
        ],
        "document_discount": {
          "document_discount_kind": "none",
          "document_discount_basis": "taxable_value",
          "document_discount_value": "0.000000"
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable"
      },
      "oracle": {
        "supply_type": "intra_state",
        "rounding_policy": "nearest_rupee",
        "lines": [
          {
            "line_key": "product-a",
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "taxability": "taxable",
            "gst_rate": "12.000000",
            "cess_rate": "0.000000"
          }
        ]
      }
    }
  }
}
```

The shown payload is illustrative; the deployed checked-in action schema is
authoritative. Update the reviewed pack when that schema changes. The harness
rejects GST rates, tax amounts, tax rule IDs, withholding rates, and withholding
amounts anywhere under `payload`. Rates exist only under `oracle`, where they
must match the reviewed disposable reference release. Thus the server derives
tax while the test independently recomputes it.

Later payloads can refer to prior results as
`$result.<step-id>.resource_id`. Numeric commercial input is a decimal JSON
string. Binary floating-point JSON values are not accepted by the action API.

The current matrix contains 18 supported execution steps and 17 rejection
probes. The external pack therefore contains 34 payload entries: all supported
steps plus the 16 rejection probes whose phase is `prepare`. The one
`readiness` probe needs no payload because the readiness response itself must
name `inventory.destruction.prepare` as the only missing adapter.

Each prepare rejection uses both REST and MCP, must leave the count of durable
`automation.command_requests` unchanged, and may optionally pin a reviewed REST
error code or message fragment. A transport error alone is insufficient if the
matrix specifies those stronger expectations.

## Readiness and bounded scope contract

The success matrix is not aspirational. Its operation set must equal the
currently available prepare bindings and the automation command manifest's
`executable_prepare_capabilities`. The readiness-rejection set must equal both
the unavailable registry bindings and `blocked_prepare_capabilities`. Focused
unit tests fail when any of these sets drift.

The matrix also mirrors every `unsupported_fail_closed` list for the ten bounded
pilot actions. At least one live rejection probe is required for each bounded
action; the current representative probes additionally cover every high-risk
scope boundary called out below. Unsupported labels remain visible in the
matrix even when they are not separate destructive live inputs.

## What is exercised

The 18-step supported run covers:

- sales order, batch/logistics dispatch, invoice, receipt and allocations;
- multiple products, inclusive and exclusive prices, line and document
  discounts, free quantity, CGST/SGST, IGST, cess and paise/rupee rounding;
- normal-charge domestic invoices, evidenced SEZ supply with IGST, and
  commercial-only customer credit treatment;
- partial and final-residual customer returns;
- domestic normal-charge purchase order, supplier advance with verified
  withholding non-applicability, GRN, supplier invoice, supplier payment with
  verified withholding non-applicability, allocations, and partial/final
  purchase returns;
- same-day ordinary negative cycle-count variance with exact batch, evidence, MWA valuation,
  journal, ledger, and stock-balance projection;
- inter-branch transfer using the earliest-expiry FEFO tier, exact paired stock
  ledger entries, unchanged total inventory value, and idempotent execution;
- REST/MCP prepare parity with identical command ID/hash, alternating approval
  and execution transports, concurrent execute, same-key replay, and
  opposite-transport status parity;
- cross-tenant RLS denial using a second active disposable membership.

The 17 expected rejections cover:

- unavailable destruction at readiness and later-expiry transfer rejection;
- export sales, outward reverse charge, and SEZ supply without reviewed LUT or
  bond evidence;
- import, SEZ, reverse-charge, composition, and unregistered-supplier purchase
  order boundaries;
- fully rejected/free-only GRN, uninvoiced purchase return, supplier-invoice
  withholding, and direct-issue customer return;
- supplier advance and supplier payment when section 194Q or other withholding
  applies;
- cash customer receipt without reviewed statutory/account authority; and
- zero, loss, or mixed cycle-count variance.

`oracle.py` imports no application calculation code. It uses `Decimal` and
`ROUND_HALF_UP` to calculate each paise boundary, cumulative partial-return
targets, final residuals, and withholding arithmetic independently. Withholding
oracle coverage remains useful for proving the rejected boundary, but the
current supplier payment and advance adapters accept only verified
non-applicability and therefore do not execute that oracle as a success journey.

After each execute, direct SQL reconciles the command and approval, typed header
and lines, calculation totals, adjustment note, GST document, balanced journal,
open items, payment allocations, withholding facts, inventory document, stock
ledger, stock-balance projection, audit-chain predecessor continuity, and
outbox payload hashes/aggregate identity.

## Running and evidence

Run only from an isolated runner whose secrets are masked:

```bash
PYTHONPATH=backend backend/venv/bin/python -m pytest \
  -q backend/tests/live_canonical/test_live_operator_journeys.py
```

Before accepting the result, record the commit SHA, canonical baseline hash,
action registry version, project ref, disposable organization UUID, reference
dataset releases, test start/end timestamps, and pytest output. Do not record
tokens or the database URL. A green run is evidence for that exact release; it
does not authorize enabling production writes or MCP publication by itself.

Current status: the harness contract is executable for 13 available prepares,
with one readiness rejection and 16 prepare-time rejections. Live evidence
remains unavailable until the canonical action API and command baseline are
deployed to a marked disposable project and the reviewed 34-entry fixture input
pack is prepared.
