# Backend audit entrypoints

These scripts are read-only unless their command help explicitly requires an
output path. Release workflows are the source of truth for invocation and
required evidence.

| Script | Boundary |
| --- | --- |
| `app_data_contract_gate.py` | Mounted REST, canonical model, frontend client, workflow, and published MCP contract |
| `application_promotion_evidence.py` | Hash-bound exact-SHA reset, route, database, backup/restore, Live18, rollback, decommission, and reviewer artifacts |
| `canonical_promotion_readiness.py` | Fail-closed promotion decision derived from reviewed evidence |
| `capture_transaction_integrity_evidence.py` | PostgreSQL runtime/admin transaction-integrity capture |
| `contract_consistency_audit.py` | Reachable API identifier, status, money, timestamp, GST, and mutation-response contracts |
| `mcp_operator_action_contract.py` | MCP operator-action publication and command/readback parity |
| `runtime_environment_contract.py` | Required runtime environment and secret boundary |
| `tax_provider_operational_readiness.py` | Tax-provider operational evidence |
| `transaction_integrity_audit.py` | Exact-commit canonical transaction invariants |

`comprehensive_schema_audit.py`, `validate_constants.py`, and
`test_implementation_audit.py` are static diagnostics. They do not establish
runtime correctness or promotion readiness.

Canonical repository-level checks:

```bash
python3 backend/scripts/audit/app_data_contract_gate.py
python3 backend/scripts/audit/contract_consistency_audit.py
python3 backend/scripts/audit/mcp_operator_action_contract.py
python3 backend/scripts/audit_schema.py
python3 backend/scripts/schema_readiness.py --validate-authority
```

Never resolve a finding with an allowlist, a retired relation, or a fabricated
evidence file. Establish one canonical owner and add the contract or runtime
test that proves it.
