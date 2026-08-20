# Canonical automation commands

This fragment resolves the three automation consent and execution invariants
without adding a physical business table or exposing generic CRUD. Capability
rows are exact typed consent. Command requests persist branch, amount, currency,
sensitivity, target version, serializer, request, preview, calculation, and
aggregate hash facts.

The dispatcher currently admits only `automation.agent_grant.revoke`. Every
other operation fails closed until its own reviewed typed handler is composed.
The SQL boundary is callable only by `erp_runtime`; no MCP route or tool is
mounted by this fragment.

Regenerate with:

```bash
python3 database/canonical/commands_automation/generate_automation_commands.py
```
