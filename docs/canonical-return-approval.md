# Canonical return approval boundary

Sales and purchase returns use `approval_policy=separate_approver`. The
requesting membership prepares an immutable command and must not approve that
same command. PostgreSQL enforces this independently of the UI through
`erp_invariants_agent.guard_command_approval_separation`.

## Current browser contract

1. The requester loads an exact canonical source projection.
2. The requester selects quantities, treatment, evidence and locations, then
   prepares once with a durable idempotency key.
3. The UI locks the draft and displays the immutable command UUID, preview hash,
   inventory impact, financial impact and tax impact as **Awaiting independent
   approval**.
4. A distinct membership with an active organization-scoped
   `automation.command.approve` permission may resolve that command by UUID at
   `GET /api/canonical/returns/commands/{command_request_id}/review` and approve
   it through the shared command approval endpoint.
5. Execution remains requester/grant-bound. An approver does not execute the
   requester's command, and a requester does not self-approve it.

The requester UI deliberately does not collapse prepare, approve and execute
into one CTA. Missing lineage, evidence, authority or an independent approver
fails closed; there is no legacy, local-storage or offline fallback.

## Required approver inbox before general release

Build a server-backed inbox, not a client role toggle. It must:

- list only unexpired `separate_approver` commands whose requester membership is
  different from the signed-in membership;
- enforce organization and command branch scope through the reviewed web grant;
- load every preview by command UUID and re-display its preview hash and exact
  inventory, financial and tax impacts;
- require an explicit action-time approve/reject confirmation and a durable
  idempotency key;
- record the independent membership and decision in immutable approval rows;
- never expose Execute to the approver;
- notify the original requester through a future canonical server event so the
  requester can explicitly execute an approved, still-unexpired command;
- provide posted readback links that reconcile return, inventory, GST,
  adjustment note, journal, allocations and residual open items.

Until that inbox and requester-resume path exist, preparation is reachable and
auditable, but a single browser session cannot complete a return. Weakening the
separate-approver invariant is not an acceptable shortcut.
