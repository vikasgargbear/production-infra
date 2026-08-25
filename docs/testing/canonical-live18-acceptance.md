# Canonical ERP live18 acceptance

This harness certifies the 18 named desktop ERP operations without implementing
or repairing product behavior. The checked-in matrix is
`backend/tests/live_acceptance/operation_matrix.json`.

## Non-negotiable gate

A run is not live evidence unless all of the following are true:

1. The target is an explicitly configured disposable organization.
2. App and API metadata both expose the full `LIVE18_EXPECTED_DEPLOYED_SHA`.
3. The requester and reviewer are distinct authenticated users.
   Separate-approver operations also prove that the requester receives `403`
   when attempting to approve their own immutable preview.
4. Every business value and identity comes from the reviewed fixture or a
   canonical authenticated resolution read. No demo UUID, GST rate, amount,
   date, stock value, or fallback row is embedded in the harness.
5. Each operation completes desktop UI, REST prepare, immutable review,
   approval, execute, REST readback, MCP readback, and restricted PostgreSQL
   reconciliation. Missing authority fails the operation; it is never skipped
   and promoted to a pass.
6. Evidence retains command/resource UUIDs, preview hash, actor identities,
   HTTP request IDs, screenshots, exact financial/tax/stock assertions, and a
   supported reversal or cleanup identifier where one exists.

At the checked-in base, all 18 business operations map to 17 published canonical
prepare commands. Customer credit note and supplier debit note are two bounded
uses of `finance.adjustment_note.prepare`; expense claim is published through
`finance.expense_claim.prepare` and migration `0009`.

## Configuration

The harness never contains live credentials or fixture business values. Supply
them through the `LIVE18_*` environment described by
`backend/tests/live_acceptance/config.py`. `LIVE18_FIXTURE_PATH` is a reviewed,
untracked JSON file outside the repository with `fixture_schema` set to
`aasopharma.live18.fixture.v1`, exactly 18 operation keys, and non-empty
`missing_required_steps`, `prepare_steps`, `approval_steps`, and `execute_steps`
arrays for each flow. Every missing-required phase must assert a visible error,
must not create a prepared command, and the valid phase must restart from an
application route so invalid form state cannot leak into the valid proof.
The two metadata URLs, three HTTPS origins, exact deployed SHA,
two user credentials, and canonical organization/branch UUIDs are mandatory.
The browser runner rejects any fixture step targeting WhatsApp, email, SMS,
telephone, or call controls.

Run the non-live contract gates with:

```bash
PYTHONPATH=backend python3 -m pytest -q backend/tests/live_acceptance
python3 backend/scripts/live_acceptance/verify_scope.py --base "$(git merge-base HEAD origin/feat/canonical-erp-data-model)"
```

Do not run live writes until the exact SHA is deployed and both metadata probes
agree. Do not send communications or delete posted facts; use only reviewed
reversal commands and report any retained test record IDs.
