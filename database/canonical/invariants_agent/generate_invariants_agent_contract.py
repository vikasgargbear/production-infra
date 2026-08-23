#!/usr/bin/env python3
"""Generate reviewed follow-up mappings for stable-domain invariant blockers."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
MAPPING_PATH = ROOT / "baseline-invariants-agent-enforcements.json"
MANIFEST_PATH = ROOT / "invariants-agent-manifest.json"
FUNCTION_SCHEMA = "erp_invariants_agent"

REVIEW_KEYS = {
    "automation.agent_grant_capabilities:agent_grant_capabilities_revocation",
    "automation.command_approvals:command_approval_separation_of_duties",
    "automation.command_requests:command_execution_guard",
    "automation.command_requests:command_request_matches_grant",
    "catalog.product_ingredients:active_medicine_has_composition",
    "catalog.products:products_regulatory_classification",
    "catalog.products:products_state_and_first_use",
    "core.access_grants:access_grants_state_transition",
    "core.audit_events:audit_events_append_only",
    "core.document_sequences:document_sequences_atomic_allocation",
    "core.data_retention_cases:data_retention_cases_command_guard",
    "core.organizations:organizations_state_transition",
    "core.settings:settings_state_transition",
    "parties.customer_accounts:customer_accounts_state_transition",
    "parties.parties:parties_state_transition",
    "parties.supplier_accounts:supplier_accounts_state_transition",
}


class ContractError(RuntimeError):
    """The reviewed follow-up no longer matches the canonical catalogs."""


def _load_reviewed_invariants() -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    for path in sorted(DOMAINS_ROOT.glob("*.json")):
        if path.name.startswith("_"):
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key not in REVIEW_KEYS:
                    continue
                found[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    missing = sorted(REVIEW_KEYS - set(found))
    if missing:
        raise ContractError(f"reviewed invariant keys missing from catalogs: {missing}")
    return found


def _private_trigger_function(name: str, body: str) -> list[str]:
    signature = f'"{FUNCTION_SCHEMA}"."{name}"()'
    return [
        f"""CREATE FUNCTION {signature}
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
{body.strip()}
$function$""",
        f'ALTER FUNCTION {signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]


def _constraint_trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION '
        f'"{FUNCTION_SCHEMA}"."{function}"()'
    )


def _definitions() -> dict[str, list[str]]:
    definitions: dict[str, list[str]] = {}

    definitions[
        "automation.command_approvals:command_approval_separation_of_duties"
    ] = [
        f'CREATE SCHEMA "{FUNCTION_SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{FUNCTION_SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_private_trigger_function(
            "guard_command_approval_separation",
            """
DECLARE
    request_row automation.command_requests%ROWTYPE;
    grant_subject uuid;
    approver_authorized boolean;
BEGIN
    SELECT * INTO request_row
      FROM automation.command_requests AS request
     WHERE request.org_id = NEW.org_id
       AND request.id = NEW.command_request_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'approval request does not exist';
    END IF;
    IF request_row.approval_policy NOT IN ('separate_approver','human_compliance_approver') THEN
        RETURN NEW;
    END IF;

    SELECT grant_row.subject_membership_id INTO grant_subject
      FROM automation.agent_grants AS grant_row
     WHERE grant_row.org_id = request_row.org_id
       AND grant_row.id = request_row.agent_grant_id
     FOR SHARE;
    IF NOT FOUND
       OR NEW.approver_membership_id = request_row.requested_by_membership_id
       OR NEW.approver_membership_id = grant_subject THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'separate approval requires a distinct approver';
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM core.memberships AS membership
          JOIN core.access_grants AS access_grant
            ON access_grant.org_id = membership.org_id
           AND access_grant.membership_id = membership.id
          JOIN core.roles AS role
            ON role.org_id = access_grant.org_id
           AND role.id = access_grant.role_id
          JOIN core.role_permissions AS role_permission
            ON role_permission.org_id = role.org_id
           AND role_permission.role_id = role.id
          JOIN core.permissions AS permission
            ON permission.code = role_permission.permission_code
         WHERE membership.org_id = NEW.org_id
           AND membership.id = NEW.approver_membership_id
           AND membership.status = 'active'
           AND access_grant.status = 'active'
           AND access_grant.scope_kind = 'organization'
           AND access_grant.valid_from_at <= pg_catalog.transaction_timestamp()
           AND (access_grant.expires_at IS NULL
                OR access_grant.expires_at > pg_catalog.transaction_timestamp())
           AND role.status = 'active'
           AND permission.code = 'automation.command.approve'
           AND permission.status = 'active'
    ) INTO approver_authorized;
    IF NOT approver_authorized THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approver lacks the active organization permission automation.command.approve';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "command_approvals_separation_ct",
            "INSERT",
            "automation.command_approvals",
            "guard_command_approval_separation",
        ),
    ]

    definitions["catalog.products:products_state_and_first_use"] = [
        *_private_trigger_function(
            "guard_product_state_and_first_use",
            """
BEGIN
    IF OLD.status = 'draft' AND NEW.status NOT IN ('draft','active','retired')
       OR OLD.status = 'active' AND NEW.status NOT IN ('active','blocked','retired')
       OR OLD.status = 'blocked' AND NEW.status NOT IN ('blocked','active','retired')
       OR OLD.status = 'retired' AND NEW.status IS DISTINCT FROM 'retired' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid product lifecycle transition';
    END IF;
    IF OLD.status = 'retired' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'retired product is immutable';
    END IF;
    IF OLD.first_used_at IS NOT NULL
       AND NEW.first_used_at IS DISTINCT FROM OLD.first_used_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product first-use evidence is immutable';
    END IF;
    IF NEW.first_used_at IS NOT NULL
       AND (NEW.first_used_at < NEW.created_at
            OR NEW.first_used_at > pg_catalog.transaction_timestamp()) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product first-use timestamp is invalid';
    END IF;
    IF OLD.first_used_at IS NOT NULL AND ROW(
        NEW.hsn_code, NEW.manufacturer_party_id, NEW.drug_schedule,
        NEW.ndps_regulated, NEW.regulatory_ruleset_version,
        NEW.schedule_h2_applicable_from, NEW.traceability_product_code,
        NEW.base_uom_code
    ) IS DISTINCT FROM ROW(
        OLD.hsn_code, OLD.manufacturer_party_id, OLD.drug_schedule,
        OLD.ndps_regulated, OLD.regulatory_ruleset_version,
        OLD.schedule_h2_applicable_from, OLD.traceability_product_code,
        OLD.base_uom_code
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'post-first-use regulated product changes require an approved versioned command; none is persisted, so the change is denied';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "products_state_first_use_ct",
            "UPDATE",
            "catalog.products",
            "guard_product_state_and_first_use",
        ),
        *_private_trigger_function(
            "guard_first_used_product_composition",
            """
DECLARE
    target_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    target_product uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
    used_at timestamptz;
BEGIN
    SELECT product.first_used_at INTO used_at
      FROM catalog.products AS product
     WHERE product.org_id = target_org
       AND product.id = target_product
     FOR SHARE;
    IF used_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'post-first-use composition changes require an approved versioned command; none is persisted, so the change is denied';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
""",
        ),
        _constraint_trigger(
            "product_ingredients_first_use_ct",
            "INSERT OR UPDATE OR DELETE",
            "catalog.product_ingredients",
            "guard_first_used_product_composition",
        ),
    ]

    definitions[
        "catalog.product_ingredients:active_medicine_has_composition"
    ] = [
        *_private_trigger_function(
            "guard_active_medicine_composition",
            """
DECLARE
    target_org uuid;
    target_product uuid;
    product_row catalog.products%ROWTYPE;
BEGIN
    IF TG_TABLE_NAME = 'products' THEN
        target_org := NEW.org_id;
        target_product := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        target_org := OLD.org_id;
        target_product := OLD.product_id;
    ELSE
        target_org := NEW.org_id;
        target_product := NEW.product_id;
    END IF;
    SELECT * INTO product_row
      FROM catalog.products AS product
     WHERE product.org_id = target_org
       AND product.id = target_product
     FOR SHARE;
    IF FOUND
       AND product_row.product_kind = 'medicine'
       AND product_row.status = 'active'
       AND NOT EXISTS (
           SELECT 1
             FROM catalog.product_ingredients AS composition
            WHERE composition.org_id = target_org
              AND composition.product_id = target_product
              AND composition.status = 'active'
              AND composition.valid_from <= CURRENT_DATE
              AND (composition.valid_until IS NULL
                   OR composition.valid_until >= CURRENT_DATE)
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active medicine requires a current active composition';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
""",
        ),
        _constraint_trigger(
            "products_active_composition_ct",
            "INSERT OR UPDATE",
            "catalog.products",
            "guard_active_medicine_composition",
        ),
        _constraint_trigger(
            "product_ingredients_active_composition_ct",
            "INSERT OR UPDATE OR DELETE",
            "catalog.product_ingredients",
            "guard_active_medicine_composition",
        ),
    ]

    definitions["core.audit_events:audit_events_append_only"] = [
        'CREATE UNIQUE INDEX "audit_events_evidence_hash_uq" ON "core"."audit_events" (org_id, evidence_hash)',
        'CREATE UNIQUE INDEX "audit_events_chain_link_uq" ON "core"."audit_events" (org_id, previous_event_hash) WHERE previous_event_hash IS NOT NULL',
        *_private_trigger_function(
            "validate_audit_event",
            """
DECLARE
    chain_head bytea;
    prior_sequence bigint;
    canonical_event jsonb;
BEGIN
    IF NEW.evidence_version <> 'pg-jsonb-sha256-v1' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unsupported audit evidence version';
    END IF;
    IF (NEW.before_state_hash IS NOT NULL AND pg_catalog.octet_length(NEW.before_state_hash) <> 32)
       OR (NEW.after_state_hash IS NOT NULL AND pg_catalog.octet_length(NEW.after_state_hash) <> 32) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit state hashes must be SHA-256 values';
    END IF;
    IF NOT (
        NEW.mutation_kind = 'insert' AND NEW.before_state_hash IS NULL AND NEW.after_state_hash IS NOT NULL
        OR NEW.mutation_kind = 'update' AND NEW.before_state_hash IS NOT NULL AND NEW.after_state_hash IS NOT NULL
        OR NEW.mutation_kind = 'delete' AND NEW.before_state_hash IS NOT NULL AND NEW.after_state_hash IS NULL
        OR NEW.mutation_kind = 'command' AND NEW.after_state_hash IS NOT NULL
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit state hashes do not match mutation kind';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.org_id::text, 9042026)
    );
    PERFORM organization.id
      FROM core.organizations AS organization
     WHERE organization.id = NEW.org_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'audit organization does not exist';
    END IF;

    SELECT event.chain_sequence, event.evidence_hash
      INTO prior_sequence, chain_head
      FROM core.audit_events AS event
     WHERE event.org_id = NEW.org_id
     ORDER BY event.chain_sequence DESC
     LIMIT 1;
    IF NEW.chain_sequence IS DISTINCT FROM COALESCE(prior_sequence, 0) + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit event chain sequence is stale';
    END IF;
    IF NEW.previous_event_hash IS DISTINCT FROM chain_head THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit event previous hash is stale';
    END IF;

    canonical_event := pg_catalog.jsonb_build_object(
        'version', NEW.evidence_version,
        'org_id', NEW.org_id,
        'chain_sequence', NEW.chain_sequence,
        'request_id', NEW.request_id,
        'command_request_id', NEW.command_request_id,
        'actor_membership_id', NEW.actor_membership_id,
        'actor_kind', NEW.actor_kind,
        'event_type', NEW.event_type,
        'resource_type', NEW.resource_type,
        'resource_id', NEW.resource_id,
        'mutation_kind', NEW.mutation_kind,
        'before_state_hash', pg_catalog.encode(NEW.before_state_hash, 'hex'),
        'after_state_hash', pg_catalog.encode(NEW.after_state_hash, 'hex'),
        'previous_event_hash', pg_catalog.encode(NEW.previous_event_hash, 'hex')
    );
    IF NEW.evidence_hash IS DISTINCT FROM pg_catalog.sha256(
        pg_catalog.convert_to(canonical_event::text, 'UTF8')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit evidence hash does not match pg-jsonb-sha256-v1';
    END IF;
    RETURN NEW;
END
""",
        ),
        'CREATE TRIGGER "audit_events_validate_bir" BEFORE INSERT ON "core"."audit_events" FOR EACH ROW EXECUTE FUNCTION "erp_invariants_agent"."validate_audit_event"()',
        *_private_trigger_function(
            "guard_audit_event_append_only",
            """
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audit events are append-only';
END
""",
        ),
        _constraint_trigger(
            "audit_events_append_only_ct",
            "UPDATE OR DELETE",
            "core.audit_events",
            "guard_audit_event_append_only",
        ),
    ]

    definitions["core.organizations:organizations_state_transition"] = [
        *_private_trigger_function(
            "guard_organization_state",
            """
BEGIN
    IF OLD.status = 'provisioning' AND NEW.status NOT IN ('provisioning','active')
       OR OLD.status = 'active' AND NEW.status NOT IN ('active','suspended','closed')
       OR OLD.status = 'suspended' AND NEW.status NOT IN ('suspended','active','closed')
       OR OLD.status = 'closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid organization lifecycle transition';
    END IF;
    IF OLD.status = 'closed' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'closed organization is immutable; no legal-retention metadata fields are present in this model';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "organizations_state_guard_ct",
            "UPDATE",
            "core.organizations",
            "guard_organization_state",
        ),
    ]
    return definitions


BLOCKED_REASONS = {
    "core.data_retention_cases:data_retention_cases_command_guard": "Typed eligibility, legal-hold evaluation and subject anonymization require the reviewed core privacy command boundary controls.",
    "automation.agent_grant_capabilities:agent_grant_capabilities_revocation": "Revocation immutability is locally enforceable, but the parent grant still stores no risk, approval, money, currency, or sensitive-read ceilings against which the capability can be proved.",
    "automation.command_requests:command_execution_guard": "PostgreSQL can lock the request and count approvals, but it cannot re-hash unknown aggregate serializers or dispatch the shared application command exactly once without a reviewed operation registry and stored command API.",
    "automation.command_requests:command_request_matches_grant": "Subject, grant state, expiry, and capability state are locally provable; operation compatibility, request branch, money/currency, and sensitive-read bounds are not persisted as typed request facts.",
    "catalog.products:products_regulatory_classification": "No reviewed, effective-dated CDSCO and NDPS ingredient classification dataset exists. Activation must remain an application preflight blocker rather than embedding unsupported legal classifications in SQL.",
    "core.access_grants:access_grants_state_transition": "Lifecycle and terminal immutability are locally enforceable, but transactional expiry at every authorization use can only be proved by the separately reviewed security permission helper and every caller using it.",
    "core.document_sequences:document_sequences_atomic_allocation": "The sequence row has no persisted idempotency owner or allocation evidence. A row trigger cannot prove replay ownership, exactly-once allocation, and permanent no-reuse together.",
    "core.settings:settings_state_transition": "Retirement immutability is locally enforceable, but no audit-event identifier, command identifier, or replacement lineage proves that retirement and replacement were one audited reviewed action.",
    "parties.customer_accounts:customer_accounts_state_transition": "Lifecycle and closed-state immutability are locally enforceable, but no command or audit-event reference proves the required audit evidence for credit-limit and credit-day changes.",
    "parties.parties:parties_state_transition": "Lifecycle and archive immutability are locally enforceable, but posted snapshots do not carry a stable source-party version that proves exactly when each identity value became immutable.",
    "parties.supplier_accounts:supplier_accounts_state_transition": "Lifecycle and closed-state immutability are locally enforceable, but no command or audit-event reference proves the required audit evidence for payment-term changes.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _load_reviewed_invariants()
    definitions = _definitions()
    if set(definitions) & set(BLOCKED_REASONS):
        raise ContractError("an invariant cannot be both resolved and blocked")
    if set(definitions) | set(BLOCKED_REASONS) != REVIEW_KEYS:
        raise ContractError("every reviewed invariant must have exactly one disposition")

    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append(
            {
                "enforcement": invariant["enforcement"],
                "invariant": invariant["invariant"],
                "requirement_sha256": hashlib.sha256(
                    invariant["rule"].encode("utf-8")
                ).hexdigest(),
                "reviewed": True,
                "statements": definitions[key],
                "table": invariant["table"],
            }
        )
    mapping = {
        "mapping_version": "1.0.0",
        "enforcements": entries,
        "platform_enforcements": [],
    }
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "reviewed_count": len(REVIEW_KEYS),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {
            key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)
        },
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode("utf-8")).hexdigest(),
        "audit_evidence_version": "pg-jsonb-sha256-v1",
        "security": {
            "function_schema": FUNCTION_SCHEMA,
            "dynamic_sql": False,
            "security_definer": False,
            "trigger_functions_public_execute": False,
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping_text, manifest_text = generated_artifacts()
    MAPPING_PATH.write_text(mapping_text, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest_text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
