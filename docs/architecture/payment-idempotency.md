# Payment Idempotency

Payment retries require a dedicated persistence boundary. Reusing
`financial.payments.internal_notes` is acceptable only as a development and
test proof of the request-hash and replay behavior. It is not a production
schema decision.

The machine-readable contract is
`docs/architecture/payment-idempotency-store.json`. It specifies semantics, not
DDL or physical PostgreSQL types. A migration must not be written until a
reviewed live schema dump establishes the Alembic baseline described in
`database/schema-authority.json`.

## Required Design

The durable store must uniquely claim organization, actor, operation, and
hashed client key. It must retain the request hash, processing state, exact HTTP
response, affected resource identity, and lifecycle timestamps. The claim,
payment mutation, and completed response must commit in one database
transaction.

Raw keys and request bodies must not be persisted. A different request hash for
an existing scope returns HTTP 409. An in-progress claim never executes the
business mutation a second time. Payment keys must survive delayed client and
offline retries.

## Promotion Gate

Run:

```bash
python3 backend/scripts/audit/payment_idempotency_readiness.py
```

The gate intentionally fails until all of these are true:

1. A reviewed live schema baseline exists.
2. An approved Alembic migration implements the dedicated store.
3. Create, record, receipt, cancel, reconcile, and allocate operations use it.
4. Concurrent claim, tenant isolation, mismatch, replay, and rollback tests run
   against PostgreSQL.

The temporary `internal_notes` backend is disabled when `APP_ENV` is
`production` or `prod`.
