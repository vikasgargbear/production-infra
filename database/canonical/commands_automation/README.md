# Canonical automation commands

This fragment resolves the three automation consent and execution invariants
without adding a physical business table or exposing generic CRUD. Capability
rows are exact typed consent. Command requests persist branch, amount, currency,
sensitivity, target version, serializer, request, preview, calculation, and
aggregate hash facts.

The dispatcher admits only the prepare capabilities named in the generated
manifest. Inter-branch stock transfer is a reviewed, actor-confirmed atomic
movement: both branch authorities, subordinate locations, strict FEFO tier,
locked source stock and paired value-preserving ledger entries are rechecked at
execution. Unsupported operations continue to fail closed. The SQL boundary is
callable only by `erp_runtime`; no MCP route or tool is mounted by this fragment.

Regenerate with:

```bash
python3 database/canonical/commands_automation/generate_automation_commands.py
```
