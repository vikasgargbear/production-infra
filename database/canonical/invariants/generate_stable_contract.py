#!/usr/bin/env python3
"""Generate reviewed stable-domain invariant mappings and their audit manifest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
MAPPING_PATH = ROOT / "baseline-stable-enforcements.json"
MANIFEST_PATH = ROOT / "stable-invariants-manifest.json"

STABLE_DOMAINS = ("core", "parties", "catalog", "hr", "automation")
FUNCTION_SCHEMA = "erp_stable_invariants"


class ContractError(RuntimeError):
    """The stable invariant contract no longer matches the canonical catalog."""


def _load_invariants() -> dict[str, dict[str, str]]:
    invariants: dict[str, dict[str, str]] = {}
    for domain in STABLE_DOMAINS:
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in invariants:
                    raise ContractError(f"duplicate invariant key: {key}")
                invariants[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return invariants


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
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{table.split(".")[0]}".'
        f'"{table.split(".")[1]}" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW '
        f'EXECUTE FUNCTION "{FUNCTION_SCHEMA}"."{function}"()'
    )


def _definitions() -> dict[str, list[str]]:
    definitions: dict[str, list[str]] = {}

    definitions["automation.agent_grants:agent_grants_state_expiry_and_revocation"] = [
        f'CREATE SCHEMA "{FUNCTION_SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{FUNCTION_SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_private_trigger_function(
            "guard_agent_grant",
            """
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status NOT IN ('pending_consent','active') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new agent grant must be pending consent or validly active';
    END IF;
    IF TG_OP = 'UPDATE' AND (
       OLD.status = 'pending_consent' AND NEW.status NOT IN ('pending_consent','active','revoked','expired')
       OR OLD.status = 'active' AND NEW.status NOT IN ('active','suspended','revoked','expired')
       OR OLD.status = 'suspended' AND NEW.status NOT IN ('suspended','active','revoked','expired')
       OR OLD.status IN ('revoked','expired') AND NEW.status IS DISTINCT FROM OLD.status
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid agent grant lifecycle transition';
    END IF;
    IF NEW.status = 'active' AND (
        NEW.consented_by_membership_id IS DISTINCT FROM NEW.subject_membership_id
        OR NEW.consented_at IS NULL
        OR NEW.granted_by_membership_id IS NULL
        OR NEW.granted_at IS NULL
        OR NEW.expires_at <= pg_catalog.transaction_timestamp()
        OR (NEW.authorization_mode = 'admin_approved'
            AND NEW.granted_by_membership_id IS NOT DISTINCT FROM NEW.subject_membership_id)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active agent grant lacks valid consent or administrator separation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'pending_consent' AND ROW(
        NEW.subject_membership_id, NEW.client_id, NEW.branch_id, NEW.authorization_mode,
        NEW.consent_version, NEW.consent_text_hash, NEW.consented_by_membership_id,
        NEW.consented_at, NEW.granted_by_membership_id, NEW.granted_at, NEW.expires_at
    ) IS DISTINCT FROM ROW(
        OLD.subject_membership_id, OLD.client_id, OLD.branch_id, OLD.authorization_mode,
        OLD.consent_version, OLD.consent_text_hash, OLD.consented_by_membership_id,
        OLD.consented_at, OLD.granted_by_membership_id, OLD.granted_at, OLD.expires_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'consented agent grant scope is immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('revoked','expired') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal agent grant is immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "agent_grants_state_guard_ct", "INSERT OR UPDATE", "automation.agent_grants", "guard_agent_grant"
        ),
        *_private_trigger_function(
            "guard_agent_grant_execution",
            """
DECLARE
    grant_row automation.agent_grants%ROWTYPE;
BEGIN
    IF NEW.status = 'executing'
       AND (CASE WHEN TG_OP = 'INSERT' THEN true ELSE OLD.status IS DISTINCT FROM 'executing' END) THEN
        SELECT * INTO grant_row
          FROM automation.agent_grants AS agent_grant
         WHERE agent_grant.org_id = NEW.org_id
           AND agent_grant.id = NEW.agent_grant_id
         FOR SHARE;
        IF NOT FOUND
           OR grant_row.status <> 'active'
           OR grant_row.expires_at <= pg_catalog.transaction_timestamp()
           OR grant_row.consented_by_membership_id IS DISTINCT FROM grant_row.subject_membership_id
           OR (grant_row.authorization_mode = 'admin_approved'
               AND grant_row.granted_by_membership_id IS NOT DISTINCT FROM grant_row.subject_membership_id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'command execution requires an active unexpired consented agent grant';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "command_requests_agent_grant_execution_ct",
            "INSERT OR UPDATE",
            "automation.command_requests",
            "guard_agent_grant_execution",
        ),
    ]

    definitions["automation.command_approvals:command_approval_exact_preview"] = [
        *_private_trigger_function(
            "guard_command_approval",
            """
DECLARE
    request_row automation.command_requests%ROWTYPE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'command approvals are append-only';
    END IF;
    SELECT * INTO request_row
      FROM automation.command_requests AS request
     WHERE request.org_id = NEW.org_id
       AND request.id = NEW.command_request_id
     FOR SHARE;
    IF NOT FOUND OR request_row.expires_at <= pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'command approval requires a current unexpired request';
    END IF;
    IF NEW.preview_hash IS DISTINCT FROM request_row.preview_hash
       OR NEW.aggregate_version_hash IS DISTINCT FROM request_row.aggregate_version_hash THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'command approval hashes do not match the current request';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "command_approvals_exact_preview_ct",
            "INSERT OR UPDATE OR DELETE",
            "automation.command_approvals",
            "guard_command_approval",
        ),
        *_private_trigger_function(
            "guard_approved_command_snapshot",
            """
BEGIN
    IF (NEW.preview_hash IS DISTINCT FROM OLD.preview_hash
        OR NEW.aggregate_version_hash IS DISTINCT FROM OLD.aggregate_version_hash)
       AND EXISTS (
            SELECT 1 FROM automation.command_approvals AS approval
             WHERE approval.org_id = OLD.org_id
               AND approval.command_request_id = OLD.id
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'an approved command snapshot cannot be replaced';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "command_requests_approved_snapshot_ct",
            "UPDATE",
            "automation.command_requests",
            "guard_approved_command_snapshot",
        ),
    ]

    definitions["catalog.product_ingredients:product_ingredients_no_overlap"] = [
        'CREATE EXTENSION "btree_gist" WITH SCHEMA "public"',
        """ALTER TABLE "catalog"."product_ingredients"
ADD CONSTRAINT "product_ingredients_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    product_id WITH =,
    ingredient_id WITH =,
    daterange(valid_from, COALESCE(valid_until, 'infinity'::date), '[]') WITH &&
)""",
    ]

    definitions["catalog.uom_conversions:uom_conversions_no_overlap"] = [
        """ALTER TABLE "catalog"."uom_conversions"
ADD CONSTRAINT "uom_conversions_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    product_id WITH =,
    from_uom_code WITH =,
    to_uom_code WITH =,
    daterange(valid_from, COALESCE(valid_until, 'infinity'::date), '[]') WITH &&
)""",
    ]

    definitions["catalog.commercial_charge_tax_profiles:commercial_charge_tax_profiles_no_overlap"] = [
        """ALTER TABLE "catalog"."commercial_charge_tax_profiles"
ADD CONSTRAINT "commercial_charge_tax_profiles_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    charge_code WITH =,
    direction WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
) WHERE (status = 'active')""",
    ]

    definitions["core.attachments:attachments_evidence_immutability"] = [
        *_private_trigger_function(
            "guard_attachment_evidence",
            """
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'claimed' OR NEW.completed_at IS NOT NULL
           OR NEW.resource_type IS NOT NULL OR NEW.resource_id IS NOT NULL
           OR NEW.response_status IS NOT NULL OR NEW.response_media_type IS NOT NULL
           OR NEW.response_body IS NOT NULL OR NEW.response_hash IS NOT NULL OR NEW.error_code IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new idempotency key must be an empty claimed row';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF OLD.legal_hold THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'attachment under legal hold cannot be retired';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.verified_at IS NOT NULL AND (
        NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
        OR NEW.storage_object_path IS DISTINCT FROM OLD.storage_object_path
        OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
        OR NEW.media_type IS DISTINCT FROM OLD.media_type
        OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.evidence_kind IS DISTINCT FROM OLD.evidence_kind
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'verified attachment evidence is immutable';
    END IF;
    IF OLD.legal_hold AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'attachment under legal hold cannot be retired';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "attachments_evidence_guard_ct",
            "UPDATE OR DELETE",
            "core.attachments",
            "guard_attachment_evidence",
        ),
    ]

    definitions["core.branches:branches_state_transition"] = [
        *_private_trigger_function(
            "guard_branch_transition",
            """
BEGIN
    IF OLD.status = 'active' AND NEW.status NOT IN ('active','inactive','closed')
       OR OLD.status = 'inactive' AND NEW.status NOT IN ('inactive','active','closed')
       OR OLD.status = 'closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid branch lifecycle transition';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "branches_state_guard_ct", "UPDATE", "core.branches", "guard_branch_transition"
        ),
    ]

    definitions["core.idempotency_keys:idempotency_claim_once"] = [
        """CREATE FUNCTION "core"."claim_idempotency_key"(
    p_org_id uuid,
    p_actor_membership_id uuid,
    p_operation varchar(128),
    p_idempotency_key_hash bytea,
    p_request_hash bytea,
    p_expires_at timestamptz
)
RETURNS core.idempotency_keys
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    claimed core.idempotency_keys%ROWTYPE;
BEGIN
    INSERT INTO core.idempotency_keys (
        org_id, actor_membership_id, operation, idempotency_key_hash,
        request_hash, expires_at
    ) VALUES (
        p_org_id, p_actor_membership_id, p_operation, p_idempotency_key_hash,
        p_request_hash, p_expires_at
    )
    ON CONFLICT (org_id, actor_membership_id, operation, idempotency_key_hash) DO NOTHING
    RETURNING * INTO claimed;
    IF FOUND THEN
        RETURN claimed;
    END IF;
    SELECT * INTO STRICT claimed
      FROM core.idempotency_keys AS claim
     WHERE claim.org_id = p_org_id
       AND claim.actor_membership_id = p_actor_membership_id
       AND claim.operation = p_operation
       AND claim.idempotency_key_hash = p_idempotency_key_hash
     FOR UPDATE;
    IF claimed.request_hash IS DISTINCT FROM p_request_hash THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'idempotency key was claimed by a different request';
    END IF;
    RETURN claimed;
END
$function$""",
        'ALTER FUNCTION "core"."claim_idempotency_key"(uuid, uuid, varchar, bytea, bytea, timestamptz) OWNER TO "erp_migration_owner"',
        'REVOKE ALL ON FUNCTION "core"."claim_idempotency_key"(uuid, uuid, varchar, bytea, bytea, timestamptz) FROM PUBLIC, "erp_runtime"',
        'GRANT EXECUTE ON FUNCTION "core"."claim_idempotency_key"(uuid, uuid, varchar, bytea, bytea, timestamptz) TO "erp_app"',
        *_private_trigger_function(
            "guard_idempotency_claim",
            """
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'idempotency claims cannot be deleted or reused';
    END IF;
    IF ROW(NEW.org_id, NEW.id, NEW.actor_membership_id, NEW.operation,
           NEW.idempotency_key_hash, NEW.request_hash, NEW.claimed_at, NEW.expires_at)
       IS DISTINCT FROM
       ROW(OLD.org_id, OLD.id, OLD.actor_membership_id, OLD.operation,
           OLD.idempotency_key_hash, OLD.request_hash, OLD.claimed_at, OLD.expires_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'idempotency claim identity is immutable';
    END IF;
    IF OLD.status IN ('succeeded','failed','expired') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal idempotency response is immutable';
    END IF;
    IF OLD.status = 'claimed' AND NEW.status NOT IN ('claimed','succeeded','failed','expired') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid idempotency claim transition';
    END IF;
    IF NEW.status = 'claimed' AND (
        NEW.completed_at IS NOT NULL OR NEW.resource_type IS NOT NULL OR NEW.resource_id IS NOT NULL
        OR NEW.response_status IS NOT NULL OR NEW.response_media_type IS NOT NULL
        OR NEW.response_body IS NOT NULL OR NEW.response_hash IS NOT NULL OR NEW.error_code IS NOT NULL
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'claimed idempotency row cannot contain a terminal response';
    END IF;
    IF NEW.status = 'succeeded' AND (
        NEW.completed_at IS NULL OR NEW.response_status IS NULL
        OR NEW.response_media_type IS NULL OR NEW.response_hash IS NULL
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'successful idempotency claim requires an exact terminal response';
    END IF;
    IF NEW.status = 'failed' AND (NEW.completed_at IS NULL OR NEW.error_code IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'failed idempotency claim requires terminal error evidence';
    END IF;
    IF NEW.status = 'expired' AND NEW.completed_at IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'expired idempotency claim requires completion time';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "idempotency_claim_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "core.idempotency_keys",
            "guard_idempotency_claim",
        ),
    ]

    definitions["core.memberships:memberships_state_transition"] = [
        *_private_trigger_function(
            "guard_membership_transition",
            """
BEGIN
    IF OLD.status = 'invited' AND NEW.status NOT IN ('invited','active','revoked')
       OR OLD.status = 'active' AND NEW.status NOT IN ('active','suspended','revoked')
       OR OLD.status = 'suspended' AND NEW.status NOT IN ('suspended','active','revoked')
       OR OLD.status = 'revoked' AND NEW.status IS DISTINCT FROM 'revoked' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid membership lifecycle transition';
    END IF;
    IF NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'membership creation actor evidence is immutable';
    END IF;
    IF OLD.status = 'revoked' AND ROW(NEW.revoked_at, NEW.revocation_reason, NEW.updated_by_membership_id)
       IS DISTINCT FROM ROW(OLD.revoked_at, OLD.revocation_reason, OLD.updated_by_membership_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'revoked membership actor evidence is immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "memberships_state_guard_ct",
            "UPDATE",
            "core.memberships",
            "guard_membership_transition",
        ),
    ]

    definitions["core.outbox_events:outbox_delivery_transition"] = [
        *_private_trigger_function(
            "guard_outbox_delivery",
            """
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' OR NEW.attempt_count <> 0
           OR NEW.claimed_at IS NOT NULL OR NEW.published_at IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new outbox event must be pending and unattempted';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'outbox events cannot be deleted';
    END IF;
    IF ROW(NEW.org_id, NEW.id, NEW.event_type, NEW.aggregate_type, NEW.aggregate_id,
           NEW.event_version, NEW.media_type, NEW.payload_bytes, NEW.payload_hash, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.org_id, OLD.id, OLD.event_type, OLD.aggregate_type, OLD.aggregate_id,
           OLD.event_version, OLD.media_type, OLD.payload_bytes, OLD.payload_hash, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'outbox payload and aggregate identity are immutable';
    END IF;
    IF OLD.status = 'pending' AND NEW.status NOT IN ('pending','claimed','dead_letter')
       OR OLD.status = 'claimed' AND NEW.status NOT IN ('claimed','pending','published','dead_letter')
       OR OLD.status IN ('published','dead_letter') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid outbox delivery transition';
    END IF;
    IF NEW.status = 'claimed' AND OLD.status <> 'claimed' THEN
        IF NEW.attempt_count <> OLD.attempt_count + 1 OR NEW.claimed_at IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'outbox claim must increment attempts exactly once and record claim time';
        END IF;
    ELSIF NEW.attempt_count <> OLD.attempt_count THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'outbox attempts change only when a pending event is claimed';
    END IF;
    IF NEW.attempt_count < OLD.attempt_count THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'outbox attempt counter cannot decrease';
    END IF;
    IF OLD.status IN ('published','dead_letter') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal outbox event is immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "outbox_delivery_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "core.outbox_events",
            "guard_outbox_delivery",
        ),
    ]

    definitions["core.users:users_state_transition"] = [
        *_private_trigger_function(
            "guard_user_transition",
            """
BEGIN
    IF OLD.status = 'active' AND NEW.status NOT IN ('active','disabled','anonymized')
       OR OLD.status = 'disabled' AND NEW.status NOT IN ('disabled','active','anonymized')
       OR OLD.status = 'anonymized' AND NEW.status IS DISTINCT FROM 'anonymized' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid user lifecycle transition';
    END IF;
    IF NEW.status = 'anonymized' AND NEW.auth_user_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'anonymized user cannot remain mapped to Auth';
    END IF;
    IF OLD.status = 'anonymized' AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'anonymized user cannot be remapped to Auth';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("users_state_guard_ct", "UPDATE", "core.users", "guard_user_transition"),
    ]

    definitions["hr.employees:employees_state_transition"] = [
        *_private_trigger_function(
            "guard_employee",
            """
DECLARE
    cycle_found boolean;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.status = 'draft' AND NEW.status NOT IN ('draft','active','separated')
        OR OLD.status = 'active' AND NEW.status NOT IN ('active','suspended','separated')
        OR OLD.status = 'suspended' AND NEW.status NOT IN ('suspended','active','separated')
        OR OLD.status = 'separated' AND NEW.status IS DISTINCT FROM 'separated'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid employee lifecycle transition';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.org_id::text, 329742019)
    );
    IF NEW.manager_employee_id IS NOT NULL THEN
        WITH RECURSIVE managers(id) AS (
            SELECT NEW.manager_employee_id
            UNION
            SELECT employee.manager_employee_id
              FROM hr.employees AS employee
              JOIN managers ON employee.org_id = NEW.org_id AND employee.id = managers.id
             WHERE employee.manager_employee_id IS NOT NULL
        )
        SELECT EXISTS (SELECT 1 FROM managers WHERE id = NEW.id) INTO cycle_found;
        IF cycle_found THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'employee manager assignment creates a reporting cycle';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "employees_state_manager_guard_ct",
            "INSERT OR UPDATE",
            "hr.employees",
            "guard_employee",
        ),
    ]

    definitions["parties.addresses:addresses_primary_period_no_overlap"] = [
        """ALTER TABLE "parties"."addresses"
ADD CONSTRAINT "addresses_primary_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    party_id WITH =,
    address_kind WITH =,
    daterange(valid_from, COALESCE(valid_until, 'infinity'::date), '[]') WITH &&
) WHERE (is_primary)""",
    ]

    definitions["parties.tax_registrations:tax_registrations_state_and_period"] = [
        *_private_trigger_function(
            "guard_tax_registration",
            """
BEGIN
    IF OLD.status = 'pending_verification' AND NEW.status NOT IN ('pending_verification','active','cancelled','expired')
       OR OLD.status = 'active' AND NEW.status NOT IN ('active','suspended','cancelled','expired')
       OR OLD.status = 'suspended' AND NEW.status NOT IN ('suspended','active','cancelled','expired')
       OR OLD.status IN ('cancelled','expired') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid tax registration lifecycle transition';
    END IF;
    IF OLD.verified_at IS NOT NULL AND ROW(
        NEW.party_id, NEW.registration_type, NEW.registration_number, NEW.registered_legal_name,
        NEW.state_code, NEW.taxpayer_type, NEW.valid_from, NEW.valid_until, NEW.verified_at
    ) IS DISTINCT FROM ROW(
        OLD.party_id, OLD.registration_type, OLD.registration_number, OLD.registered_legal_name,
        OLD.state_code, OLD.taxpayer_type, OLD.valid_from, OLD.valid_until, OLD.verified_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'verified statutory identity history is immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger(
            "tax_registrations_state_guard_ct",
            "UPDATE",
            "parties.tax_registrations",
            "guard_tax_registration",
        ),
    ]

    return definitions


BLOCKED_REASONS = {
    "automation.agent_grant_capabilities:agent_grant_capabilities_revocation": "The parent grant has no consented risk ceiling, approval-policy ceiling, amount ceiling, currency scope, or sensitive-read scope to compare against.",
    "automation.command_approvals:command_approval_separation_of_duties": "The request does not persist the permission code required of an approver, so same-organization permission cannot be proved without inventing an authorization mapping.",
    "automation.command_requests:command_execution_guard": "Execution, aggregate re-hashing, shared application command dispatch, and exactly-once resource creation require a reviewed stored command procedure and application command registry.",
    "automation.command_requests:command_request_matches_grant": "The request has no branch_id, requested amount/currency, or sensitive-read flag, and capability_code does not define an operation compatibility registry.",
    "catalog.ingredients:ingredient_reference_release": "A row constraint cannot verify official source bytes, a canonical exact-set dataset, reviewed object-storage evidence, atomic whole-release supersession, or invalidate affected tenant products; this requires the isolated regulatory import command.",
    "catalog.product_ingredients:active_medicine_has_composition": "No approved versioned-command identifier is stored on product or composition mutations, so post-first-use changes cannot be distinguished from unauthorized edits.",
    "catalog.products:products_regulatory_classification": "No effective-dated migration-owned ingredient classification ruleset or reviewed CDSCO/NDPS source dataset exists to derive and verify both independent regulatory dimensions.",
    "catalog.products:products_state_and_first_use": "No approved versioned-command identifier or immutable product-version relation exists for regulated post-first-use changes.",
    "core.access_grants:access_grants_state_transition": "Transactional expiry at every authorization use belongs to the security helper contract; this invariant cannot independently prove every caller uses that helper.",
    "core.audit_events:audit_events_append_only": "The catalog now stores mutation kind, before/after hashes and chain evidence, but canonical field serialization, hash algorithm versioning and a concurrency-safe organization chain lock still require reviewed trigger SQL.",
    "core.document_sequences:document_sequences_atomic_allocation": "The sequence row has no idempotency claim link or allocation record, so ownership, replay, and no-reuse cannot all be proved by a row trigger.",
    "core.reference_data_releases:reference_data_release_import": "Release provenance requires an isolated operator principal, official-host validation, exact source and dataset hashes, typed reviewer evidence, transaction-scoped row imports, and atomic supersession that no row-local trigger can perform.",
    "core.data_retention_cases:data_retention_cases_command_guard": "Eligibility, legal-hold evaluation, subject anonymization and immutable completion evidence require a typed privacy command spanning the subject aggregate; row-local constraints cannot prove those effects.",
    "core.organizations:organizations_state_transition": "The organization has no legal-retention metadata columns identifying the updates permitted after closure.",
    "core.settings:settings_state_transition": "There is no audit-event link or version lineage column proving that retirement and replacement were audited as one reviewed command.",
    "parties.customer_accounts:customer_accounts_state_transition": "There is no audit-event or approved-command link proving credit-limit and credit-day changes were audited.",
    "parties.parties:parties_state_transition": "Posted documents snapshot party identity but expose no stable source-party/version link that can prove whether an identity field has already been used.",
    "parties.supplier_accounts:supplier_accounts_state_transition": "There is no audit-event or approved-command link proving payment-term changes were audited.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _load_invariants()
    definitions = _definitions()
    unknown = sorted(set(definitions) - set(invariants))
    missing_disposition = sorted(set(invariants) - set(definitions) - set(BLOCKED_REASONS))
    stale_blockers = sorted(set(BLOCKED_REASONS) - set(invariants))
    if unknown or missing_disposition or stale_blockers:
        raise ContractError(
            f"stable invariant disposition mismatch: unknown={unknown}, "
            f"missing={missing_disposition}, stale_blockers={stale_blockers}"
        )

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
    catalog_payload = {
        key: {
            "enforcement": invariant["enforcement"],
            "rule": invariant["rule"],
        }
        for key, invariant in sorted(invariants.items())
    }
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "stable_domains": list(STABLE_DOMAINS),
        "catalog_invariant_sha256": hashlib.sha256(
            json.dumps(catalog_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode("utf-8")).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {
            key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)
        },
        "extension_owner": {
            "btree_gist": "catalog.product_ingredients:product_ingredients_no_overlap"
        },
        "security": {
            "function_schema": FUNCTION_SCHEMA,
            "dynamic_sql": False,
            "trigger_functions_public_execute": False,
            "runtime_callable_functions": [
                "core.claim_idempotency_key(uuid,uuid,varchar,bytea,bytea,timestamptz)"
            ],
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
