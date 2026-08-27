#!/usr/bin/env python3
"""Generate the closed, typed automation command boundary.

This contract deliberately dispatches only reviewed operation handlers. It is
not a generic SQL, REST, or MCP dispatcher.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAINS_ROOT = CANONICAL_ROOT / "domains"
BASELINE_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
MAPPING_PATH = ROOT / "baseline-automation-command-enforcements.json"
MANIFEST_PATH = ROOT / "automation-command-manifest.json"
SCHEMA = "erp_automation_commands"
REVIEW_KEYS = {
    "automation.agent_grant_capabilities:agent_grant_capabilities_revocation",
    "automation.command_requests:command_execution_guard",
    "automation.command_requests:command_request_matches_grant",
}
OPERATOR_COMMANDS = {
    "sales.order.prepare": ("sales.order.approve", "sales_order"),
    "sales.dispatch.prepare": ("sales.dispatch.post", "dispatch"),
    "sales.invoice.prepare": ("sales.invoice.post", "sales_invoice"),
    "sales.return.prepare": ("sales.return.post", "sales_return"),
    "procurement.purchase_order.prepare": ("procurement.purchase_order.approve", "purchase_order"),
    "procurement.goods_receipt.prepare": ("procurement.receipt.post", "goods_receipt"),
    "procurement.supplier_invoice.prepare": ("procurement.supplier_invoice.post", "supplier_invoice"),
    "procurement.purchase_return.prepare": ("procurement.purchase_return.post", "purchase_return"),
    "finance.customer_receipt.prepare": ("finance.payment.post", "payment"),
    "finance.customer_cheque_clearance.prepare": ("finance.customer_cheque_clearance.post", "payment"),
    "finance.customer_cheque_bounce.prepare": ("finance.customer_cheque_bounce.post", "payment"),
    "finance.supplier_payment.prepare": ("finance.payment.post", "payment"),
    "finance.supplier_advance.prepare": ("finance.supplier_advance.post", "payment"),
    "finance.adjustment_note.prepare": ("finance.adjustment_note.post", "adjustment_note"),
    "finance.bank_reconciliation.prepare": ("finance.bank_reconciliation.match", "reconciliation_match"),
    "finance.expense_claim.prepare": ("finance.expense_claim.post", "expense_claim"),
    "inventory.transfer.prepare": ("inventory.document.post", "inventory_document"),
    "inventory.adjustment.prepare": ("inventory.document.post", "inventory_document"),
    "inventory.destruction.prepare": ("compliance.destruction.post", "destruction"),
    "sales.return.reversal.prepare": ("sales.return.reversal.post", "adjustment_note_reversal"),
    "procurement.purchase_return.reversal.prepare": ("procurement.purchase_return.reversal.post", "adjustment_note_reversal"),
    "finance.adjustment_note.reversal.prepare": ("finance.adjustment_note.reversal.post", "adjustment_note_reversal"),
}
BASELINE_OPERATOR_COMMANDS = {
    capability: binding
    for capability, binding in OPERATOR_COMMANDS.items()
    if capability not in {
        "finance.adjustment_note.prepare",
        "finance.bank_reconciliation.prepare",
        "finance.expense_claim.prepare",
    }
}


def _sql_text_list(values: list[str]) -> str:
    return ",".join("'" + value.replace("'", "''") + "'" for value in values)


def _target_case(expression: str) -> str:
    branches = " ".join(
        f"WHEN '{capability}' THEN '{resource_type}'"
        for capability, (_, resource_type) in BASELINE_OPERATOR_COMMANDS.items()
    )
    return f"CASE {expression} {branches} ELSE NULL END"


def _operation_case(expression: str) -> str:
    branches = " ".join(
        f"WHEN '{capability}' THEN '{operation}'"
        for capability, (operation, _) in BASELINE_OPERATOR_COMMANDS.items()
    )
    return f"CASE {expression} {branches} ELSE NULL END"


class ContractError(RuntimeError):
    """The reviewed automation contract no longer matches the catalog."""


def _load_baseline():
    spec = importlib.util.spec_from_file_location("automation_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _catalog_hash() -> str:
    catalog = _load_baseline().load_and_validate_catalog(DOMAINS_ROOT)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    canonical = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _invariants() -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    for path in sorted(DOMAINS_ROOT.glob("*.json")):
        if path.name.startswith("_"):
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in REVIEW_KEYS:
                    found[key] = {
                        "table": table["name"],
                        "invariant": invariant["name"],
                        "enforcement": invariant["enforcement"],
                        "rule": invariant["rule"],
                    }
    if set(found) != REVIEW_KEYS:
        raise ContractError(f"automation invariant set drifted: {sorted(REVIEW_KEYS - set(found))}")
    return found


def _function(
    signature: str,
    returns: str,
    body: str,
    *,
    runtime: bool = False,
    calculator: bool = False,
) -> list[str]:
    statements = [
        f'''CREATE FUNCTION "{SCHEMA}".{signature}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$''',
        f'ALTER FUNCTION "{SCHEMA}".{signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION "{SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    if runtime:
        statements.append(f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "erp_runtime"')
    if calculator:
        statements.append(f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "erp_calculator"')
    return statements


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE TRIGGER "{name}" BEFORE {events} ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function}"()'
    )


def _capability_definition() -> list[str]:
    return [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_calculator"',
        f'''CREATE TABLE "{SCHEMA}"."execution_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    org_id uuid NOT NULL,
    command_request_id uuid NOT NULL,
    PRIMARY KEY (backend_pid,transaction_id,org_id,command_request_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."execution_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."execution_scopes" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'''CREATE TABLE "{SCHEMA}"."write_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    scope text NOT NULL CHECK (scope IN ('prepare','approval','calculation_link')),
    org_id uuid NOT NULL,
    command_request_id uuid NOT NULL,
    PRIMARY KEY (backend_pid,transaction_id,scope,org_id,command_request_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."write_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."write_scopes" FROM PUBLIC, "erp_app", "erp_runtime", "erp_calculator"',
        *_function(
            '"write_scope_active"(scope_name text, organization_id uuid, request_id uuid)',
            "boolean",
            f'''
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{SCHEMA}"."write_scopes" AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope=scope_name
           AND scope.org_id=organization_id
           AND scope.command_request_id=request_id
    );
END
''',
        ),
        *_function(
            '"execution_scope_active"(organization_id uuid, request_id uuid)',
            "boolean",
            f'''
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{SCHEMA}"."execution_scopes" AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.org_id=organization_id
           AND scope.command_request_id=request_id
    );
END
''',
        ),
        *_function(
            '"aggregate_version_hash"(resource_type varchar, resource_id uuid, row_version bigint)',
            "bytea",
            '''
BEGIN
    RETURN extensions.digest(
        pg_catalog.convert_to(
            pg_catalog.jsonb_build_object(
                'resource_id',resource_id,
                'resource_type',resource_type,
                'row_version',row_version
            )::text,
            'UTF8'
        ),
        'sha256'
    );
END
''',
        ),
        *_function(
            '"guard_capability"()',
            "trigger",
            '''
DECLARE grant_row automation.agent_grants%ROWTYPE;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='agent capability consent cannot be deleted';
    END IF;
    IF TG_OP='INSERT' THEN
        SELECT * INTO grant_row FROM automation.agent_grants
         WHERE org_id=NEW.org_id AND id=NEW.agent_grant_id FOR SHARE;
        IF NOT FOUND OR grant_row.status<>'active'
           OR grant_row.expires_at<=pg_catalog.transaction_timestamp() THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capability requires an active unexpired parent grant';
        END IF;
        IF NEW.status<>'active' OR pg_catalog.btrim(NEW.capability_code)='' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new capability must be a named active consent';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status='revoked' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='revoked capability consent is immutable';
    END IF;
    IF ROW(NEW.org_id,NEW.agent_grant_id,NEW.capability_code,NEW.operation_mode,
           NEW.risk_class,NEW.approval_policy,NEW.maximum_amount,NEW.currency_code,
           NEW.allow_sensitive_read,NEW.created_at,NEW.created_by_membership_id)
       IS DISTINCT FROM
       ROW(OLD.org_id,OLD.agent_grant_id,OLD.capability_code,OLD.operation_mode,
           OLD.risk_class,OLD.approval_policy,OLD.maximum_amount,OLD.currency_code,
           OLD.allow_sensitive_read,OLD.created_at,OLD.created_by_membership_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed capability consent bounds are immutable';
    END IF;
    IF OLD.status='active' AND NEW.status='revoked' THEN
        IF NEW.revoked_at IS NULL OR NEW.revoked_by_membership_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capability revocation requires actor and timestamp evidence';
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revoked_by_membership_id IS DISTINCT FROM OLD.revoked_by_membership_id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid capability lifecycle transition';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "agent_grant_capabilities_consent_guard",
            "INSERT OR UPDATE OR DELETE",
            "automation.agent_grant_capabilities",
            "guard_capability",
        ),
    ]


def _sales_dispatch_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_sales_dispatch_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, dispatch_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE
    branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
    sales_order_id uuid:=NULLIF(request_document->>'sales_order_id','')::uuid;
    from_location_id uuid:=NULLIF(request_document->>'from_location_id','')::uuid;
    dispatch_date date:=NULLIF(request_document->>'dispatch_date','')::date;
    logistics jsonb:=request_document->'logistics';
    transport_mode text:=logistics->>'transport_mode';
    transporter_party_id uuid:=NULLIF(logistics->>'transporter_party_id','')::uuid;
    branch core.branches%ROWTYPE;
    order_header sales.orders%ROWTYPE;
    order_line sales.order_lines%ROWTYPE;
    location inventory.locations%ROWTYPE;
    customer parties.customer_accounts%ROWTYPE;
    shipping parties.addresses%ROWTYPE;
    transporter parties.parties%ROWTYPE;
    transporter_registration parties.tax_registrations%ROWTYPE;
    cogs_account finance.accounts%ROWTYPE;
    inventory_account finance.accounts%ROWTYPE;
    batch inventory.batches%ROWTYPE;
    balance inventory.stock_balances%ROWTYPE;
    requested_line jsonb;
    requested_allocation jsonb;
    resolved_lines jsonb:='[]'::jsonb;
    resolved_allocations jsonb;
    source_versions jsonb:='[]'::jsonb;
    allocation_tracker jsonb:='{}'::jsonb;
    requested_billed numeric(20,6);
    requested_free numeric(20,6);
    allocated_billed numeric(20,6);
    allocated_free numeric(20,6);
    allocation_billed numeric(20,6);
    allocation_free numeric(20,6);
    base_billed numeric(20,6);
    base_free numeric(20,6);
    existing_billed numeric(20,6);
    existing_free numeric(20,6);
    total_base numeric(20,6):=0;
    total_value numeric(20,2):=0;
    extended_cost numeric(20,2);
    prior_base numeric(20,6);
    prior_value numeric(20,2);
    current_quantity numeric(20,6);
    current_value numeric(20,2);
    current_unit_cost numeric(20,4);
    line_number integer:=0;
    registration_count integer;
    bad_count integer;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
       OR application_user_id IS NULL OR grant_id IS NULL OR dispatch_id IS NULL
       OR branch_id IS NULL OR sales_order_id IS NULL OR from_location_id IS NULL
       OR dispatch_date IS NULL OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
       OR pg_catalog.jsonb_typeof(logistics)<>'object'
       OR transport_mode NOT IN ('road','rail','air','ship','multimodal','in_person')
       OR NULLIF(logistics->>'distance_km','')::numeric<0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-dispatch resolve input is incomplete';
    END IF;
    IF (transport_mode='road' AND
          (NULLIF(logistics->>'vehicle_number','') IS NULL
           OR logistics->>'vehicle_type' NOT IN ('regular','over_dimensional_cargo')))
       OR (transport_mode<>'road' AND
          (NULLIF(logistics->>'vehicle_number','') IS NOT NULL
           OR NULLIF(logistics->>'vehicle_type','') IS NOT NULL))
       OR (transport_mode IN ('rail','air','ship','multimodal') AND
          (NULLIF(logistics->>'transport_document_number','') IS NULL
           OR NULLIF(logistics->>'transport_document_date','')::date IS NULL))
       OR ((NULLIF(logistics->>'transport_document_number','') IS NULL) IS DISTINCT FROM
           (NULLIF(logistics->>'transport_document_date','') IS NULL))
       OR (transport_mode='in_person' AND
          (transporter_party_id IS NOT NULL
           OR NULLIF(logistics->>'transport_document_number','') IS NOT NULL))
       OR (transport_mode<>'in_person' AND transporter_party_id IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch logistics fields do not match the selected transport mode';
    END IF;
    IF (SELECT count(DISTINCT value->>'sales_order_line_id')
          FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
       <>pg_catalog.jsonb_array_length(request_document->'lines') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch order lines must be unique';
    END IF;
    PERFORM 1
      FROM core.memberships AS membership
      JOIN core.users AS user_row ON user_row.id=membership.user_id
      JOIN core.organizations AS organization ON organization.id=membership.org_id
      JOIN automation.agent_grants AS grant_row
        ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities AS capability
        ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id
       AND membership.user_id=application_user_id AND membership.status='active'
       AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization.status='active' AND grant_row.id=grant_id
       AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
       AND capability.capability_code='sales.dispatch.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-dispatch delegated authority is inactive';
    END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-dispatch verified auth context resolved a different membership';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.dispatch.create',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.dispatch.post',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('inventory.document.post',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-dispatch branch or valuation permission is inactive';
    END IF;
    SELECT * INTO STRICT branch FROM core.branches
     WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
    IF branch.postal_code!~'^[0-9]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch origin requires a six-digit Indian pincode';
    END IF;
    SELECT * INTO STRICT order_header FROM sales.orders AS candidate_order
     WHERE candidate_order.org_id=organization_id AND candidate_order.id=sales_order_id
       AND candidate_order.branch_id=branch_id AND candidate_order.status='approved' FOR SHARE;
    IF dispatch_date<order_header.order_date THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch date precedes the approved sales order';
    END IF;
    SELECT * INTO STRICT customer FROM parties.customer_accounts
     WHERE org_id=organization_id AND id=order_header.customer_account_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT shipping FROM parties.addresses
     WHERE org_id=organization_id AND id=order_header.shipping_address_id
       AND party_id=customer.party_id AND status='active'
       AND valid_from<=dispatch_date AND (valid_until IS NULL OR valid_until>=dispatch_date) FOR SHARE;
    IF shipping.country_code<>'IN' OR shipping.postal_code!~'^[0-9]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch destination requires an effective Indian six-digit pincode';
    END IF;
    SELECT * INTO STRICT location FROM inventory.locations AS candidate_location
     WHERE candidate_location.org_id=organization_id AND candidate_location.id=from_location_id
       AND candidate_location.branch_id=branch_id AND candidate_location.status='active'
       AND candidate_location.allows_sale FOR SHARE;
    SELECT * INTO STRICT cogs_account FROM finance.accounts
     WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
       organization_id,branch_id,'cost_of_goods_sold','expense','INR',false) FOR SHARE;
    SELECT * INTO STRICT inventory_account FROM finance.accounts
     WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
       organization_id,branch_id,'inventory_asset','asset','INR',false) FOR SHARE;
    IF transporter_party_id IS NOT NULL THEN
        SELECT * INTO STRICT transporter FROM parties.parties
         WHERE org_id=organization_id AND id=transporter_party_id AND status='active' FOR SHARE;
        SELECT count(*) INTO registration_count FROM parties.tax_registrations
         WHERE org_id=organization_id AND party_id=transporter_party_id
           AND registration_type='GSTIN' AND status='active'
           AND (valid_from IS NULL OR valid_from<=dispatch_date)
           AND (valid_until IS NULL OR valid_until>=dispatch_date);
        IF registration_count>1 THEN
            RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='transporter has ambiguous effective GST registrations';
        ELSIF registration_count=1 THEN
            SELECT * INTO STRICT transporter_registration FROM parties.tax_registrations
             WHERE org_id=organization_id AND party_id=transporter_party_id
               AND registration_type='GSTIN' AND status='active'
               AND (valid_from IS NULL OR valid_from<=dispatch_date)
               AND (valid_until IS NULL OR valid_until>=dispatch_date) FOR SHARE;
        END IF;
    END IF;
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','sales_order','id',order_header.id,'row_version',order_header.row_version,'status',order_header.status),
      pg_catalog.jsonb_build_object('resource_type','customer_account','id',customer.id,'row_version',customer.row_version),
      pg_catalog.jsonb_build_object('resource_type','shipping_address','id',shipping.id,'row_version',shipping.row_version,'valid_from',shipping.valid_from,'valid_until',shipping.valid_until),
      pg_catalog.jsonb_build_object('resource_type','inventory_location','id',location.id,'row_version',location.row_version,'allows_sale',location.allows_sale),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','cost_of_goods_sold','id',cogs_account.id,'row_version',cogs_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version)
    );
    IF transporter_party_id IS NOT NULL THEN
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','transporter_party','id',transporter.id,'row_version',transporter.row_version),
        pg_catalog.jsonb_build_object('resource_type','transporter_gstin','id',transporter_registration.id,'row_version',transporter_registration.row_version,'registration_number',transporter_registration.registration_number)
      );
    END IF;

    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
        requested_billed:=NULLIF(requested_line->>'billed_quantity','')::numeric;
        requested_free:=NULLIF(requested_line->>'free_quantity','')::numeric;
        IF requested_billed<0 OR requested_free<0 OR requested_billed+requested_free<=0
           OR pg_catalog.jsonb_typeof(requested_line->'batch_allocations')<>'array'
           OR pg_catalog.jsonb_array_length(requested_line->'batch_allocations')<1
           OR (SELECT count(DISTINCT value->>'batch_id') FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations'))
              <>pg_catalog.jsonb_array_length(requested_line->'batch_allocations') THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='dispatch line quantities or batch allocations are invalid';
        END IF;
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          organization_id::text||':'||(requested_line->>'sales_order_line_id'),193701063));
        SELECT * INTO STRICT order_line FROM sales.order_lines
         WHERE org_id=organization_id AND id=NULLIF(requested_line->>'sales_order_line_id','')::uuid
           AND order_id=order_header.id AND line_kind='product' FOR SHARE;
        SELECT COALESCE(sum(line.billed_quantity),0),COALESCE(sum(line.free_quantity),0)
          INTO existing_billed,existing_free
          FROM sales.dispatch_lines AS line JOIN sales.dispatches AS parent
            ON parent.org_id=line.org_id AND parent.id=line.dispatch_id
         WHERE line.org_id=organization_id AND line.order_line_id=order_line.id
           AND parent.id<>dispatch_id AND parent.status<>'cancelled';
        IF existing_billed+requested_billed>order_line.billed_quantity
           OR existing_free+requested_free>order_line.free_quantity THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch exceeds the separate approved billed or free ceiling';
        END IF;
        allocated_billed:=0; allocated_free:=0; resolved_allocations:='[]'::jsonb;
        FOR requested_allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') LOOP
            allocation_billed:=NULLIF(requested_allocation->>'billed_quantity','')::numeric;
            allocation_free:=NULLIF(requested_allocation->>'free_quantity','')::numeric;
            IF allocation_billed<0 OR allocation_free<0 OR allocation_billed+allocation_free<=0
               OR NULLIF(requested_allocation->>'dispatch_line_id','')::uuid IS NULL
               OR NULLIF(requested_allocation->>'inventory_line_id','')::uuid IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='dispatch batch allocation is invalid';
            END IF;
            SELECT * INTO STRICT batch FROM inventory.batches
             WHERE org_id=organization_id AND id=NULLIF(requested_allocation->>'batch_id','')::uuid
               AND product_id=order_line.product_id AND lot_kind='manufacturer_batch'
               AND status='released' AND released_at IS NOT NULL
               AND expires_on IS NOT NULL AND dispatch_date<expires_on FOR SHARE;
            SELECT * INTO STRICT balance FROM inventory.stock_balances
             WHERE org_id=organization_id AND location_id=location.id
               AND product_id=order_line.product_id AND batch_id=batch.id FOR SHARE;
            base_billed:=pg_catalog.round(allocation_billed*order_line.uom_conversion_factor,6);
            base_free:=pg_catalog.round(allocation_free*order_line.uom_conversion_factor,6);
            prior_base:=coalesce((allocation_tracker#>>ARRAY[batch.id::text,'base_quantity'])::numeric,0);
            prior_value:=coalesce((allocation_tracker#>>ARRAY[batch.id::text,'issued_value'])::numeric,0);
            current_quantity:=balance.on_hand_quantity-prior_base;
            current_value:=balance.inventory_value-prior_value;
            current_unit_cost:=CASE WHEN current_quantity=0 THEN 0
              ELSE pg_catalog.round(current_value/current_quantity,4) END;
            IF base_billed+base_free>current_quantity THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch batch allocation exceeds locked on-hand stock';
            END IF;
            extended_cost:=CASE WHEN base_billed+base_free=current_quantity THEN current_value
              ELSE pg_catalog.round((base_billed+base_free)*current_unit_cost,2) END;
            allocation_tracker:=pg_catalog.jsonb_set(allocation_tracker,ARRAY[batch.id::text],
              pg_catalog.jsonb_build_object('base_quantity',(prior_base+base_billed+base_free)::text,
                                            'issued_value',(prior_value+extended_cost)::text),true);
            line_number:=line_number+1;
            resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
              'line_number',line_number,'dispatch_line_id',requested_allocation->>'dispatch_line_id',
              'inventory_line_id',requested_allocation->>'inventory_line_id','batch_id',batch.id,
              'batch_number',batch.batch_number,'batch_row_version',batch.row_version,'expires_on',batch.expires_on,
              'billed_quantity',allocation_billed::text,'free_quantity',allocation_free::text,
              'base_billed_quantity',base_billed::text,'base_free_quantity',base_free::text,
              'stock_balance_row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,
              'inventory_value',balance.inventory_value::text,'unit_cost',current_unit_cost::text,
              'extended_cost',extended_cost::text
            ));
            source_versions:=source_versions||pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('resource_type','manufacturer_batch','id',batch.id,'row_version',batch.row_version,'product_id',batch.product_id,'expires_on',batch.expires_on,'status',batch.status),
              pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',balance.location_id,'product_id',balance.product_id,'batch_id',balance.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,'average_unit_cost',balance.average_unit_cost::text)
            );
            allocated_billed:=allocated_billed+allocation_billed;
            allocated_free:=allocated_free+allocation_free;
            total_base:=total_base+base_billed+base_free;
            total_value:=total_value+extended_cost;
        END LOOP;
        IF allocated_billed IS DISTINCT FROM requested_billed OR allocated_free IS DISTINCT FROM requested_free THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch batch allocations do not reconcile billed and free quantities separately';
        END IF;
        source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'resource_type','sales_order_line','id',order_line.id,
          'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
            'order_id',order_line.order_id,'line_number',order_line.line_number,'line_kind',order_line.line_kind,
            'product_id',order_line.product_id,'uom_code',order_line.uom_code,'uom_conversion_factor',order_line.uom_conversion_factor,
            'billed_quantity',order_line.billed_quantity,'free_quantity',order_line.free_quantity,
            'quoted_unit_rate',order_line.quoted_unit_rate,'price_basis',order_line.price_basis,
            'free_supply_tax_treatment',order_line.free_supply_tax_treatment,'tax_code_version_id',order_line.tax_code_version_id,
            'taxability_snapshot',order_line.taxability_snapshot,'cgst_rate',order_line.cgst_rate,'sgst_rate',order_line.sgst_rate,
            'igst_rate',order_line.igst_rate,'cess_rate',order_line.cess_rate
          )::text,'UTF8'),'sha256'),'hex')
        ));
        resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'sales_order_line_id',order_line.id,'order_line_number',order_line.line_number,
          'product_id',order_line.product_id,'uom_code',order_line.uom_code,
          'uom_conversion_factor',order_line.uom_conversion_factor::text,
          'billed_quantity',requested_billed::text,'free_quantity',requested_free::text,
          'quoted_unit_rate',order_line.quoted_unit_rate::text,'price_basis',order_line.price_basis,
          'free_supply_tax_treatment',order_line.free_supply_tax_treatment,
          'tax_code_version_id',order_line.tax_code_version_id,'taxability_snapshot',order_line.taxability_snapshot,
          'cgst_rate',order_line.cgst_rate::text,'sgst_rate',order_line.sgst_rate::text,
          'igst_rate',order_line.igst_rate::text,'cess_rate',order_line.cess_rate::text,
          'batch_allocations',resolved_allocations
        ));
    END LOOP;

    WITH requested AS (
      SELECT source.product_id AS requested_product_id,
             (allocation.value->>'batch_id')::uuid AS requested_batch_id,
             sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+
                 (allocation.value->>'free_quantity')::numeric)*source.uom_conversion_factor,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') AS line(value)
        JOIN sales.order_lines source ON source.org_id=organization_id AND source.id=(line.value->>'sales_order_line_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') AS allocation(value)
       GROUP BY source.product_id,(allocation.value->>'batch_id')::uuid
    ), totals AS (
      SELECT requested_product_id,sum(requested_base) AS total_requested_base
        FROM requested GROUP BY requested_product_id
    ), eligible_lots AS (
      SELECT stock.product_id AS eligible_product_id,stock.batch_id AS eligible_batch_id,
             stock.on_hand_quantity,eligible_batch.expires_on
        FROM inventory.stock_balances AS stock
        JOIN inventory.batches AS eligible_batch
          ON eligible_batch.org_id=stock.org_id AND eligible_batch.id=stock.batch_id
        JOIN totals ON totals.requested_product_id=stock.product_id
       WHERE stock.org_id=organization_id AND stock.location_id=from_location_id
         AND stock.on_hand_quantity>0 AND eligible_batch.lot_kind='manufacturer_batch'
         AND eligible_batch.status='released' AND eligible_batch.released_at IS NOT NULL
         AND eligible_batch.expires_on IS NOT NULL AND dispatch_date<eligible_batch.expires_on
    ), expiry_groups AS (
      /* sales_dispatch_fefo_expiry_date_equivalence_v1 */
      SELECT eligible_lot.eligible_product_id,eligible_lot.expires_on,
             sum(eligible_lot.on_hand_quantity) expiry_available,
             coalesce(sum(requested.requested_base),0) expiry_requested
        FROM eligible_lots AS eligible_lot
        LEFT JOIN requested
          ON requested.requested_product_id=eligible_lot.eligible_product_id
         AND requested.requested_batch_id=eligible_lot.eligible_batch_id
       GROUP BY eligible_lot.eligible_product_id,eligible_lot.expires_on
    ), eligible AS (
      SELECT expiry_group.*,
             coalesce(sum(expiry_group.expiry_available) OVER (
               PARTITION BY expiry_group.eligible_product_id ORDER BY expiry_group.expires_on
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_available
        FROM expiry_groups AS expiry_group
    )
    SELECT count(*) INTO bad_count FROM eligible
      JOIN totals ON totals.requested_product_id=eligible.eligible_product_id
     WHERE eligible.expiry_requested IS DISTINCT FROM
       greatest(least(totals.total_requested_base-eligible.prior_available,eligible.expiry_available),0);
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='explicit dispatch batches do not follow FEFO across available released stock';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'branch_id',branch.id,'branch_row_version',branch.row_version,
      'sales_order_id',order_header.id,'sales_order_row_version',order_header.row_version,
      'customer_account_id',customer.id,'shipping_address_id',shipping.id,
      'cost_of_goods_sold_account_id',cogs_account.id,'inventory_asset_account_id',inventory_account.id,
      'from_location_id',location.id,'dispatch_date',dispatch_date,
      'origin',pg_catalog.jsonb_build_object('line1',branch.address_line1,'line2',branch.address_line2,'city',branch.city,'state_code',branch.state_code,'pincode',branch.postal_code),
      'destination',pg_catalog.jsonb_build_object('line1',shipping.line1,'line2',shipping.line2,'city',shipping.city,'state_code',shipping.state_code,'pincode',shipping.postal_code),
      'transport_mode',transport_mode,'distance_km',(logistics->>'distance_km')::numeric::text,
      'transporter_party_id',transporter_party_id,'transporter_name',transporter.legal_name,
      'transporter_gstin',transporter_registration.registration_number,
      'vehicle_number',NULLIF(logistics->>'vehicle_number',''),'vehicle_type',NULLIF(logistics->>'vehicle_type',''),
      'transport_document_number',NULLIF(logistics->>'transport_document_number',''),
      'transport_document_date',NULLIF(logistics->>'transport_document_date','')::date,
      'lines',resolved_lines,'total_abs_base_quantity',total_base::text,'total_value',total_value::text,
      'source_versions',source_versions
    );
END
''',
            runtime=True,
        ),
        *_function(
            '"assert_sales_dispatch_draft"(organization_id uuid, dispatch_resource_id uuid, inventory_resource_id uuid, request_document jsonb, resolution jsonb)',
            "void",
            '''
DECLARE header sales.dispatches%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        resolved_line jsonb; allocation jsonb; dispatch_line sales.dispatch_lines%ROWTYPE;
        inventory_line inventory.inventory_document_lines%ROWTYPE; expected_count integer:=0;
BEGIN
    SELECT * INTO STRICT header FROM sales.dispatches WHERE org_id=organization_id AND id=dispatch_resource_id FOR UPDATE;
    SELECT * INTO STRICT document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=inventory_resource_id FOR UPDATE;
    IF header.status<>'draft' OR document.status<>'approved' OR document.document_type<>'sales_issue'
       OR document.sales_dispatch_id IS DISTINCT FROM header.id
       OR ROW(header.branch_id,header.customer_account_id,header.dispatch_date,header.shipping_address_id,
              header.origin_address_line1,header.origin_address_line2,header.origin_city,header.origin_state_code,header.origin_pincode,
              header.destination_address_line1,header.destination_address_line2,header.destination_city,header.destination_state_code,header.destination_pincode,
              header.transport_mode,header.distance_km,header.transporter_party_id,header.transporter_name,header.transporter_gstin,
              header.vehicle_number,header.vehicle_type,header.transport_document_number,header.transport_document_date)
          IS DISTINCT FROM ROW((resolution->>'branch_id')::uuid,(resolution->>'customer_account_id')::uuid,(resolution->>'dispatch_date')::date,
              (resolution->>'shipping_address_id')::uuid,resolution#>>'{origin,line1}',resolution#>>'{origin,line2}',resolution#>>'{origin,city}',
              resolution#>>'{origin,state_code}',resolution#>>'{origin,pincode}',resolution#>>'{destination,line1}',resolution#>>'{destination,line2}',
              resolution#>>'{destination,city}',resolution#>>'{destination,state_code}',resolution#>>'{destination,pincode}',resolution->>'transport_mode',
              (resolution->>'distance_km')::numeric,NULLIF(resolution->>'transporter_party_id','')::uuid,resolution->>'transporter_name',
              resolution->>'transporter_gstin',resolution->>'vehicle_number',resolution->>'vehicle_type',
              resolution->>'transport_document_number',NULLIF(resolution->>'transport_document_date','')::date)
       OR ROW(document.branch_id,document.destination_branch_id,document.physical_movement_required,document.document_number,
              document.document_date,document.reason_code,document.currency_code,document.costing_method_snapshot,
              document.total_abs_base_quantity,document.total_value)
          IS DISTINCT FROM ROW(header.branch_id,NULL::uuid,true,header.dispatch_number,header.dispatch_date,'sales_dispatch','INR'::bpchar,
              'moving_weighted_average',(resolution->>'total_abs_base_quantity')::numeric,(resolution->>'total_value')::numeric)
       OR ROW(document.origin_address_line1,document.origin_address_line2,document.origin_city,document.origin_state_code,document.origin_pincode,
              document.destination_address_line1,document.destination_address_line2,document.destination_city,document.destination_state_code,document.destination_pincode,
              document.transport_mode,document.distance_km,document.transporter_party_id,document.transporter_name_snapshot,document.transporter_gstin_snapshot,
              document.vehicle_number_snapshot,document.vehicle_type_snapshot,document.transport_document_number_snapshot,document.transport_document_date,document.movement_started_at)
          IS DISTINCT FROM ROW(header.origin_address_line1,header.origin_address_line2,header.origin_city,header.origin_state_code,header.origin_pincode,
              header.destination_address_line1,header.destination_address_line2,header.destination_city,header.destination_state_code,header.destination_pincode,
              header.transport_mode,header.distance_km,header.transporter_party_id,header.transporter_name,header.transporter_gstin,
              header.vehicle_number,header.vehicle_type,header.transport_document_number,header.transport_document_date,header.movement_started_at) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-dispatch draft header or physical inventory snapshot changed';
    END IF;
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolution->'lines') LOOP
      FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'batch_allocations') LOOP
        expected_count:=expected_count+1;
        SELECT * INTO STRICT dispatch_line FROM sales.dispatch_lines
         WHERE org_id=organization_id AND id=(allocation->>'dispatch_line_id')::uuid AND dispatch_id=dispatch_resource_id FOR SHARE;
        SELECT * INTO STRICT inventory_line FROM inventory.inventory_document_lines
         WHERE org_id=organization_id AND id=(allocation->>'inventory_line_id')::uuid
           AND inventory_document_id=inventory_resource_id FOR SHARE;
        IF ROW(dispatch_line.line_number,dispatch_line.order_line_id,dispatch_line.product_id,dispatch_line.batch_id,
               dispatch_line.from_location_id,dispatch_line.uom_code,dispatch_line.billed_quantity,dispatch_line.free_quantity,
               dispatch_line.base_billed_quantity,dispatch_line.base_free_quantity)
           IS DISTINCT FROM ROW((allocation->>'line_number')::integer,(resolved_line->>'sales_order_line_id')::uuid,
               (resolved_line->>'product_id')::uuid,(allocation->>'batch_id')::uuid,(resolution->>'from_location_id')::uuid,
               resolved_line->>'uom_code',(allocation->>'billed_quantity')::numeric,(allocation->>'free_quantity')::numeric,
               (allocation->>'base_billed_quantity')::numeric,(allocation->>'base_free_quantity')::numeric)
           OR ROW(inventory_line.line_number,inventory_line.movement_kind,inventory_line.product_id,inventory_line.batch_id,
               inventory_line.uom_code,inventory_line.entered_quantity,inventory_line.base_quantity,inventory_line.from_location_id,
               inventory_line.to_location_id,inventory_line.unit_cost,inventory_line.extended_cost,inventory_line.sales_dispatch_line_id)
           IS DISTINCT FROM ROW((allocation->>'line_number')::integer,'issue',(resolved_line->>'product_id')::uuid,
               (allocation->>'batch_id')::uuid,resolved_line->>'uom_code',
               (allocation->>'billed_quantity')::numeric+(allocation->>'free_quantity')::numeric,
               (allocation->>'base_billed_quantity')::numeric+(allocation->>'base_free_quantity')::numeric,
               (resolution->>'from_location_id')::uuid,NULL::uuid,(allocation->>'unit_cost')::numeric,
               (allocation->>'extended_cost')::numeric,dispatch_line.id) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-dispatch or inventory draft line changed';
        END IF;
      END LOOP;
    END LOOP;
    IF expected_count=0
       OR expected_count<>(SELECT count(*) FROM sales.dispatch_lines WHERE org_id=organization_id AND dispatch_id=dispatch_resource_id)
       OR expected_count<>(SELECT count(*) FROM inventory.inventory_document_lines WHERE org_id=organization_id AND inventory_document_id=inventory_resource_id) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-dispatch draft line cardinality changed';
    END IF;
END
''',
        ),
        *_function(
            '"persist_sales_dispatch_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, dispatch_id uuid, inventory_document_id uuid, command_id uuid, request_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; dispatch_number text;
        fiscal_year integer; movement_time timestamptz:=pg_catalog.transaction_timestamp();
        resolved_line jsonb; allocation jsonb; aggregate_hash bytea;
BEGIN
    IF dispatch_id IS NULL OR inventory_document_id IS NULL OR command_id IS NULL OR request_id IS NULL
       OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-dispatch prepare persistence envelope is invalid';
    END IF;
    BEGIN
      request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
      resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
      preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-dispatch prepare requires UTF-8 JSON';
    END;
    current_resolution:="{SCHEMA}"."resolve_sales_dispatch_prepare"(
      organization_id,membership_id,auth_user_id,application_user_id,grant_id,caller_client_id,dispatch_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document
       OR request_document->>'dispatch_id' IS DISTINCT FROM dispatch_id::text
       OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
       OR NULLIF(request_document->>'valuation_journal_id','')::uuid IS NULL
       OR NULLIF(request_document->>'valuation_event_id','')::uuid IS NULL
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'inventory_impact' IS NULL OR preview_document->'financial_impact' IS NULL
       OR preview_document->'tax_impact'<>'[]'::jsonb OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-dispatch resolution or immutable preview changed';
    END IF;
    SELECT * INTO existing FROM automation.command_requests
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code='sales.dispatch.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM dispatch_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-dispatch idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'dispatch_date')::date)>=4
      THEN pg_catalog.date_part('year',(resolved_document->>'dispatch_date')::date)::integer
      ELSE pg_catalog.date_part('year',(resolved_document->>'dispatch_date')::date)::integer-1 END;
    aggregate_hash:=extensions.digest(pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256');
    PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'sales.dispatch.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,dispatch_id,(resolved_document->>'total_value')::numeric,'INR',key_hash,
      request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence
     WHERE sequence.org_id=organization_id AND sequence.branch_id=(resolved_document->>'branch_id')::uuid
       AND sequence.document_type='sales_dispatch' AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
       AND sequence.status='active' FOR SHARE;
    dispatch_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
    INSERT INTO sales.dispatches(org_id,id,branch_id,customer_account_id,dispatch_number,fiscal_year,dispatch_date,status,
      shipping_address_id,origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
      destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
      transport_mode,distance_km,transporter_party_id,transporter_name,transporter_gstin,vehicle_number,vehicle_type,
      transport_document_number,transport_document_date,movement_started_at)
    VALUES(organization_id,dispatch_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'customer_account_id')::uuid,
      dispatch_number,fiscal_year,(resolved_document->>'dispatch_date')::date,'draft',(resolved_document->>'shipping_address_id')::uuid,
      resolved_document#>>'{{origin,line1}}',resolved_document#>>'{{origin,line2}}',resolved_document#>>'{{origin,city}}',
      resolved_document#>>'{{origin,state_code}}',resolved_document#>>'{{origin,pincode}}',resolved_document#>>'{{destination,line1}}',
      resolved_document#>>'{{destination,line2}}',resolved_document#>>'{{destination,city}}',resolved_document#>>'{{destination,state_code}}',
      resolved_document#>>'{{destination,pincode}}',resolved_document->>'transport_mode',(resolved_document->>'distance_km')::numeric,
      NULLIF(resolved_document->>'transporter_party_id','')::uuid,resolved_document->>'transporter_name',resolved_document->>'transporter_gstin',
      resolved_document->>'vehicle_number',resolved_document->>'vehicle_type',resolved_document->>'transport_document_number',
      NULLIF(resolved_document->>'transport_document_date','')::date,movement_time);
    INSERT INTO inventory.inventory_documents(org_id,id,branch_id,destination_branch_id,physical_movement_required,
      origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
      destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
      transport_mode,distance_km,transporter_party_id,transporter_name_snapshot,transporter_gstin_snapshot,
      vehicle_number_snapshot,vehicle_type_snapshot,transport_document_number_snapshot,transport_document_date,movement_started_at,
      document_type,document_number,fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
      total_abs_base_quantity,total_value,sales_dispatch_id,approved_at,approved_by_membership_id)
    SELECT organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,NULL,true,
      origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
      destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
      transport_mode,distance_km,transporter_party_id,transporter_name,transporter_gstin,vehicle_number,vehicle_type,
      transport_document_number,transport_document_date,movement_started_at,'sales_issue',dispatch_number,fiscal_year,dispatch_date,
      'approved','sales_dispatch','INR','moving_weighted_average',(resolved_document->>'total_abs_base_quantity')::numeric,
      (resolved_document->>'total_value')::numeric,dispatch_id,movement_time,membership_id
      FROM sales.dispatches WHERE org_id=organization_id AND id=dispatch_id;
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'batch_allocations') LOOP
        INSERT INTO sales.dispatch_lines(org_id,id,dispatch_id,line_number,order_line_id,product_id,batch_id,from_location_id,
          uom_code,billed_quantity,free_quantity,base_billed_quantity,base_free_quantity)
        VALUES(organization_id,(allocation->>'dispatch_line_id')::uuid,dispatch_id,(allocation->>'line_number')::integer,
          (resolved_line->>'sales_order_line_id')::uuid,(resolved_line->>'product_id')::uuid,(allocation->>'batch_id')::uuid,
          (resolved_document->>'from_location_id')::uuid,resolved_line->>'uom_code',(allocation->>'billed_quantity')::numeric,
          (allocation->>'free_quantity')::numeric,(allocation->>'base_billed_quantity')::numeric,(allocation->>'base_free_quantity')::numeric);
        INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
          uom_code,entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,extended_cost,sales_dispatch_line_id)
        VALUES(organization_id,(allocation->>'inventory_line_id')::uuid,inventory_document_id,(allocation->>'line_number')::integer,
          'issue',(resolved_line->>'product_id')::uuid,(allocation->>'batch_id')::uuid,resolved_line->>'uom_code',
          (allocation->>'billed_quantity')::numeric+(allocation->>'free_quantity')::numeric,
          (allocation->>'base_billed_quantity')::numeric+(allocation->>'base_free_quantity')::numeric,
          (resolved_document->>'from_location_id')::uuid,NULL,(allocation->>'unit_cost')::numeric,(allocation->>'extended_cost')::numeric,
          (allocation->>'dispatch_line_id')::uuid);
      END LOOP;
    END LOOP;
    PERFORM "{SCHEMA}"."assert_sales_dispatch_draft"(organization_id,dispatch_id,inventory_document_id,request_document,resolved_document);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            runtime=True,
        ),
    ]


def _purchase_order_prepare_definition() -> list[str]:
    statements = _function(
        '"resolve_purchase_order_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_order_id uuid, request_document jsonb)',
        "jsonb",
        '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        supplier_account_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        order_date date:=NULLIF(request_document->>'order_date','')::date;
        expected_on date:=NULLIF(request_document->>'expected_on','')::date;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        buyer_registration tax.registrations%ROWTYPE;
        buyer_registration_branch tax.registration_branches%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        supplier_address parties.addresses%ROWTYPE;
        supplier_registration parties.tax_registrations%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        tax_version tax.tax_code_versions%ROWTYPE; tax_release core.reference_data_releases%ROWTYPE;
        profile catalog.commercial_charge_tax_profiles%ROWTYPE;
        requested_line jsonb; resolved_lines jsonb:='[]'::jsonb;
        source_versions jsonb:='[]'::jsonb; ruleset_version text; supply_type text;
        registration_count integer; address_count integer;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
       OR application_user_id IS NULL OR grant_id IS NULL OR purchase_order_id IS NULL
       OR branch_id IS NULL OR supplier_account_id IS NULL OR order_date IS NULL
       OR expected_on IS NULL OR expected_on<order_date
       OR request_document->>'tax_charge_mechanism'<>'normal'
       OR request_document->>'zero_rated_payment_mode'<>'not_applicable'
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
       OR pg_catalog.jsonb_typeof(COALESCE(request_document->'expense_charge_lines','[]'::jsonb))<>'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order input is incomplete or outside the domestic normal-charge pilot'; END IF;
    PERFORM 1 FROM core.memberships membership
      JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id
       AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id
       AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id
       AND membership.user_id=application_user_id AND membership.status='active'
       AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND grant_row.id=grant_id
       AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
       AND capability.capability_code='procurement.purchase_order.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-order delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-order verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.order.manage',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-order branch permission is inactive'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' FOR SHARE;
    IF organization.country_code<>'IN' OR organization.base_currency<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='purchase-order pilot supports only Indian INR organizations'; END IF;
    SELECT * INTO STRICT branch FROM core.branches
     WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
    SELECT count(*) INTO registration_count FROM tax.registration_branches association
      JOIN tax.registrations registration ON registration.org_id=association.org_id
       AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id
       AND association.status='active' AND association.effective_from<=order_date
       AND (association.effective_to IS NULL OR association.effective_to>=order_date)
       AND registration.state_code=branch.state_code AND registration.status='active'
       AND registration.effective_from<=order_date
       AND (registration.effective_to IS NULL OR registration.effective_to>=order_date);
    IF registration_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='buyer has no exact effective branch-state GST registration'; END IF;
    SELECT registration.* INTO STRICT buyer_registration FROM tax.registration_branches association
      JOIN tax.registrations registration ON registration.org_id=association.org_id
       AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id
       AND association.status='active' AND association.effective_from<=order_date
       AND (association.effective_to IS NULL OR association.effective_to>=order_date)
       AND registration.state_code=branch.state_code AND registration.status='active'
       AND registration.effective_from<=order_date
       AND (registration.effective_to IS NULL OR registration.effective_to>=order_date)
     FOR SHARE OF association,registration;
    IF buyer_registration.registration_type<>'regular' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='purchase-order pilot requires a regular buyer GST registration'; END IF;
    SELECT * INTO STRICT buyer_registration_branch FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=buyer_registration.id
       AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=order_date
       AND (association.effective_to IS NULL OR association.effective_to>=order_date) FOR SHARE;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts
     WHERE org_id=organization_id AND id=supplier_account_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_party FROM parties.parties
     WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=supplier.party_id AND address_kind='registered'
       AND is_primary AND status='active' AND valid_from<=order_date
       AND (valid_until IS NULL OR valid_until>=order_date);
    IF address_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier requires one effective primary registered address'; END IF;
    SELECT * INTO STRICT supplier_address FROM parties.addresses
     WHERE org_id=organization_id AND party_id=supplier.party_id AND address_kind='registered'
       AND is_primary AND status='active' AND valid_from<=order_date
       AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    IF supplier_address.country_code<>'IN' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='import purchase orders remain fail-closed in the pilot'; END IF;
    SELECT count(*) INTO registration_count FROM parties.tax_registrations
     WHERE org_id=organization_id AND party_id=supplier.party_id AND registration_type='GSTIN'
       AND state_code=supplier_address.state_code AND status='active'
       AND (valid_from IS NULL OR valid_from<=order_date)
       AND (valid_until IS NULL OR valid_until>=order_date);
    IF registration_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier requires one effective address-state GSTIN'; END IF;
    SELECT * INTO STRICT supplier_registration FROM parties.tax_registrations
     WHERE org_id=organization_id AND party_id=supplier.party_id AND registration_type='GSTIN'
       AND state_code=supplier_address.state_code AND status='active'
       AND (valid_from IS NULL OR valid_from<=order_date)
       AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    IF supplier_registration.taxpayer_type NOT IN ('regular','casual') THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='SEZ, composition, non-resident, and unregistered supplier purchases remain fail-closed'; END IF;
    supply_type:=CASE WHEN buyer_registration.state_code=supplier_registration.state_code
      THEN 'intra_state' ELSE 'inter_state' END;
    source_versions:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','buyer_tax_registration','id',buyer_registration.id,'row_version',buyer_registration.row_version,'effective_from',buyer_registration.effective_from,'effective_to',buyer_registration.effective_to),
      pg_catalog.jsonb_build_object('resource_type','buyer_registration_branch','registration_id',buyer_registration_branch.registration_id,'branch_id',buyer_registration_branch.branch_id,'status',buyer_registration_branch.status,'effective_from',buyer_registration_branch.effective_from,'effective_to',buyer_registration_branch.effective_to),
      pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_registered_address','id',supplier_address.id,'row_version',supplier_address.row_version,'valid_from',supplier_address.valid_from,'valid_until',supplier_address.valid_until),
      pg_catalog.jsonb_build_object('resource_type','supplier_tax_registration','id',supplier_registration.id,'row_version',supplier_registration.row_version,'taxpayer_type',supplier_registration.taxpayer_type,'valid_from',supplier_registration.valid_from,'valid_until',supplier_registration.valid_until));
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      IF NULLIF(requested_line->>'line_id','')::uuid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order product line identity is missing'; END IF;
      SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
       AND id=NULLIF(requested_line->>'product_id','')::uuid AND status='active' FOR SHARE;
      SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
       AND id=NULLIF(requested_line->>'uom_conversion_id','')::uuid AND product_id=product.id
       AND status='active' AND to_uom_code=product.base_uom_code AND valid_from<=order_date
       AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE code=product.hsn_code
       AND code_kind='hsn' AND status='active' AND effective_from<=order_date
       AND (effective_to IS NULL OR effective_to>=order_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=order_date
       AND (effective_to IS NULL OR effective_to>=order_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-order product tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','product','line_id',requested_line->>'line_id',
        'product_id',product.id,'product_row_version',product.row_version,'hsn_code',product.hsn_code,
        'uom_conversion_id',conversion.id,'uom_code',conversion.from_uom_code,'to_uom_code',conversion.to_uom_code,
        'multiplier',conversion.multiplier::text,'uom_valid_from',conversion.valid_from,'uom_valid_until',conversion.valid_until,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
        'taxability',tax_version.taxability,'gst_rate',CASE WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
        'cess_rate',CASE WHEN tax_version.taxability='taxable' THEN tax_version.cess_rate::text ELSE '0' END,
        'ruleset_version',tax_version.ruleset_version,'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','product','id',product.id,'row_version',product.row_version,
        'uom_conversion_id',conversion.id,'uom_valid_from',conversion.valid_from,'uom_valid_until',conversion.valid_until,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'charge_lines','[]'::jsonb)) LOOP
      IF NULLIF(requested_line->>'line_id','')::uuid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order charge line identity is missing'; END IF;
      SELECT * INTO STRICT profile FROM catalog.commercial_charge_tax_profiles WHERE org_id=organization_id
       AND direction='procurement' AND charge_code=requested_line->>'charge_code' AND status='active'
       AND effective_from<=order_date AND (effective_to IS NULL OR effective_to>=order_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE id=profile.tax_code_version_id
       AND code_kind='sac' AND status='active' AND effective_from<=order_date
       AND (effective_to IS NULL OR effective_to>=order_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=order_date
       AND (effective_to IS NULL OR effective_to>=order_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-order charge tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','charge','line_id',requested_line->>'line_id',
        'charge_code',profile.charge_code,'charge_tax_profile_id',profile.id,'charge_tax_profile_row_version',profile.row_version,
        'charge_tax_profile_effective_from',profile.effective_from,'charge_tax_profile_effective_to',profile.effective_to,
        'sac_code',tax_version.code,'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
        'taxability',tax_version.taxability,'gst_rate',CASE WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
        'cess_rate',CASE WHEN tax_version.taxability='taxable' THEN tax_version.cess_rate::text ELSE '0' END,
        'ruleset_version',tax_version.ruleset_version,'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','commercial_charge_tax_profile','id',profile.id,'row_version',profile.row_version,
        'charge_code',profile.charge_code,'effective_from',profile.effective_from,'effective_to',profile.effective_to,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    IF ruleset_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-order has no effective tax ruleset'; END IF;
    RETURN pg_catalog.jsonb_build_object(
      'branch_id',branch.id,'branch_row_version',branch.row_version,'order_date',order_date,'expected_on',expected_on,
      'supply_type',supply_type,'zero_rated_payment_mode','not_applicable','tax_charge_mechanism','normal',
      'supplier_account_id',supplier.id,'supplier_account_row_version',supplier.row_version,
      'supplier_party_id',supplier_party.id,'supplier_party_row_version',supplier_party.row_version,
      'supplier_address_id',supplier_address.id,'supplier_address_row_version',supplier_address.row_version,
      'supplier_tax_registration_id',supplier_registration.id,'supplier_tax_registration_row_version',supplier_registration.row_version,
      'supplier_taxpayer_type',supplier_registration.taxpayer_type,'buyer_tax_registration_id',buyer_registration.id,
      'ruleset_version',ruleset_version,'lines',resolved_lines,
      'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','normal_charge',true,
        'import_supported',false,'sez_supported',false,'reverse_charge_supported',false,
        'supplier_gstin_evidence_id',supplier_registration.id,'buyer_gstin_evidence_id',buyer_registration.id),
      'source_versions',source_versions);
END
''',
        runtime=True,
        calculator=True,
    )
    statements.extend(_function(
        '"persist_purchase_order_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_order_id uuid, command_id uuid, artifact_id uuid, request_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
        "jsonb",
        f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; order_number text;
        fiscal_year integer; requested_total numeric(20,2); aggregate_hash bytea; claim_id uuid; replay_id uuid;
BEGIN
    IF SESSION_USER<>'erp_calculator' OR purchase_order_id IS NULL OR command_id IS NULL
       OR artifact_id IS NULL OR request_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
       OR pg_catalog.octet_length(sequence_key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_input_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_output_bytes) NOT BETWEEN 2 AND 1048576 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order persistence envelope is invalid'; END IF;
    BEGIN
      request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
      resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
      preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
      input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
      output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order persistence requires UTF-8 JSON'; END;
    current_resolution:="{SCHEMA}"."resolve_purchase_order_prepare"(
      organization_id,membership_id,auth_user_id,application_user_id,grant_id,caller_client_id,purchase_order_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document
       OR request_document->>'purchase_order_id' IS DISTINCT FROM purchase_order_id::text
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
       OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
       OR input_document->>'operation'<>'procurement.purchase_order.approve'
       OR input_document->>'resource_type'<>'purchase_order' OR input_document->>'resource_id'<>purchase_order_id::text
       OR output_document->>'operation'<>'procurement.purchase_order.approve'
       OR output_document->>'resource_type'<>'purchase_order' OR output_document->>'resource_id'<>purchase_order_id::text
       OR (input_document->>'aggregate_version')::bigint<>1 OR (output_document->>'aggregate_version')::bigint<>1
       OR input_document#>>'{{document,tax_charge_mechanism}}'<>'normal'
       OR input_document#>>'{{document,zero_rated_mode}}'<>'not_applicable'
       OR input_document#>>'{{document,gst_type}}' IS DISTINCT FROM
          (CASE WHEN resolved_document->>'supply_type'='intra_state' THEN 'intra_state' ELSE 'inter_state' END)
       OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version'
       OR pg_catalog.jsonb_array_length(output_document->'lines')<>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-order resolution, legal scope, or calculation changed'; END IF;
    SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='procurement.purchase_order.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM purchase_order_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='purchase-order idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    totals:=output_document->'totals'; requested_total:=(totals->>'grand_total')::numeric;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'order_date')::date)>=4
      THEN pg_catalog.date_part('year',(resolved_document->>'order_date')::date)::integer
      ELSE pg_catalog.date_part('year',(resolved_document->>'order_date')::date)::integer-1 END;
    SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence
     WHERE sequence.org_id=organization_id AND sequence.branch_id=(resolved_document->>'branch_id')::uuid
       AND sequence.document_type='purchase_order' AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
       AND sequence.status='active' FOR SHARE;
    order_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
    INSERT INTO procurement.purchase_orders(org_id,id,branch_id,supplier_account_id,purchase_order_number,fiscal_year,
      order_date,expected_delivery_date,status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,currency_code,
      calculation_ruleset_version,document_discount_kind,document_discount_basis,document_discount_value,
      subtotal,discount_total,charges_total,net_value_total,gst_taxable_total,cgst_total,sgst_total,igst_total,
      cess_total,recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
    VALUES(organization_id,purchase_order_id,(resolved_document->>'branch_id')::uuid,
      (resolved_document->>'supplier_account_id')::uuid,order_number,fiscal_year,(resolved_document->>'order_date')::date,
      (resolved_document->>'expected_on')::date,'submitted',resolved_document->>'supply_type','not_applicable','normal','INR',
      resolved_document->>'ruleset_version',request_document->'document_discount'->>'document_discount_kind',
      request_document->'document_discount'->>'document_discount_basis',(request_document->'document_discount'->>'document_discount_value')::numeric,
      (totals->>'subtotal')::numeric,(totals->>'discount_total')::numeric,(totals->>'charges_total')::numeric,
      (totals->>'net_value_total')::numeric,(totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,
      (totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,
      (totals->>'recipient_assessed_tax_total')::numeric,request_document->>'rounding_policy',
      (totals->>'rounding_adjustment')::numeric,requested_total);
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines')
       WHERE value->>'line_id'=resolved_line->>'line_id';
      INSERT INTO procurement.purchase_order_lines(org_id,id,purchase_order_id,line_number,line_kind,product_id,charge_code,
        uom_code,uom_conversion_factor,billed_quantity,free_quantity,base_billed_quantity,base_free_quantity,
        free_supply_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,gross_amount,
        line_discount_kind,line_discount_basis,line_discount_value,document_discount_eligible,line_discount_amount,
        line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,net_value_amount,
        gst_taxable_value,tax_classification_code_snapshot,tax_code_version_id,taxability_snapshot,
        cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,line_total,
        withholding_nature_code)
      VALUES(organization_id,(resolved_line->>'line_id')::uuid,purchase_order_id,(resolved_line->>'line_number')::integer,
        resolved_line->>'line_kind',NULLIF(resolved_line->>'product_id','')::uuid,resolved_line->>'charge_code',
        resolved_line->>'uom_code',NULLIF(resolved_line->>'multiplier','')::numeric,
        NULLIF(resolved_line->'input'->>'billed_quantity','')::numeric,NULLIF(resolved_line->'input'->>'free_quantity','')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN pg_catalog.round((resolved_line->'input'->>'billed_quantity')::numeric*(resolved_line->>'multiplier')::numeric,6) END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN pg_catalog.round((resolved_line->'input'->>'free_quantity')::numeric*(resolved_line->>'multiplier')::numeric,6) END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->>'free_supply_tax_treatment' END,
        NULLIF(resolved_line->'input'->>'quoted_unit_rate','')::numeric,resolved_line->'input'->>'price_basis','normal',
        (calculated_line->>'gross_amount')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_kind' ELSE 'none' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_basis' ELSE 'price_value' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->'line_discount'->>'line_discount_value')::numeric ELSE 0 END,
        (resolved_line->'input'->>'document_discount_eligible')::boolean,(calculated_line->>'line_discount_amount')::numeric,
        (calculated_line->>'line_taxable_discount_amount')::numeric,(calculated_line->>'document_discount_amount')::numeric,
        (calculated_line->>'document_taxable_discount_amount')::numeric,(calculated_line->>'net_value_amount')::numeric,
        (calculated_line->>'gst_taxable_value')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code' ELSE resolved_line->>'sac_code' END,
        (resolved_line->>'tax_code_version_id')::uuid,resolved_line->>'taxability',(calculated_line->>'cgst_rate')::numeric,
        (calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,
        (calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,
        (calculated_line->>'igst_amount')::numeric,(calculated_line->>'cess_amount')::numeric,(calculated_line->>'line_total')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN 'purchase_of_goods' END);
    END LOOP;
    PERFORM erp_trade_commands_v2.assert_purchase_order_artifact(organization_id,purchase_order_id,input_document,output_document);
    aggregate_hash:="{SCHEMA}"."aggregate_version_hash"('purchase_order',purchase_order_id,1);
    PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'procurement.purchase_order.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,purchase_order_id,requested_total,'INR',key_hash,
      request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,membership_id,'procurement.purchase_order.approve',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
    IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='purchase-order prepare replay reached completed approval'; END IF;
    PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,
      'procurement.purchase_order.approve','purchase_order',purchase_order_id,1,request_id,command_id,claim_id,
      extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,
      output_document->>'engine_version',output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
        calculator=True,
    ))
    return statements


def _goods_receipt_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_goods_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, goods_receipt_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        requested_purchase_order_id uuid:=NULLIF(request_document->>'purchase_order_id','')::uuid;
        requested_supplier_account_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        received_at timestamptz:=NULLIF(request_document->>'received_at','')::timestamptz;
        received_day date;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        purchase_order procurement.purchase_orders%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        order_line procurement.purchase_order_lines%ROWTYPE;
        product catalog.products%ROWTYPE; manufacturer parties.parties%ROWTYPE;
        tax_version tax.tax_code_versions%ROWTYPE; tax_release core.reference_data_releases%ROWTYPE;
        location inventory.locations%ROWTYPE; mrp_conversion catalog.uom_conversions%ROWTYPE;
        existing_batch inventory.batches%ROWTYPE; purchase_artifact calculation.artifacts%ROWTYPE;
        requested_line jsonb; requested_batch jsonb; resolved_lines jsonb:='[]'::jsonb;
        source_versions jsonb:='[]'::jsonb; license_sources jsonb;
        batch_count integer; artifact_count integer; medicine_count integer:=0;
        requested_base_billed numeric(20,6); requested_base_free numeric(20,6);
        prior_base_billed numeric(20,6); prior_base_free numeric(20,6);
        base_accepted numeric(20,6); base_free numeric(20,6);
        unit_cost numeric(20,4); extended_cost numeric(20,2);
        total_base numeric(20,6):=0; total_value numeric(20,2):=0;
        batch_id uuid; batch_origin text; batch_status text; qc_status text;
        order_line_version_hash text; mrp_conversion_version_hash text;
        requested_received numeric(20,6); requested_accepted numeric(20,6);
        requested_rejected numeric(20,6); requested_free numeric(20,6);
        license_type_count integer;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
       OR application_user_id IS NULL OR grant_id IS NULL OR goods_receipt_id IS NULL
       OR requested_branch_id IS NULL OR requested_purchase_order_id IS NULL
       OR requested_supplier_account_id IS NULL
       OR received_at IS NULL OR received_at>pg_catalog.transaction_timestamp()
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt input is incomplete or invalid'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' AND country_code='IN' AND base_currency='INR' FOR SHARE;
    received_day:=(received_at AT TIME ZONE organization.timezone)::date;
    IF (NULLIF(request_document->>'supplier_challan_number','') IS NULL) IS DISTINCT FROM
       (NULLIF(request_document->>'supplier_challan_date','') IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier challan number and date must be supplied together'; END IF;
    IF NULLIF(request_document->>'supplier_challan_date','')::date>received_day THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier challan date follows physical receipt'; END IF;
    IF (SELECT count(DISTINCT value->>'purchase_order_line_id')
          FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
       <>pg_catalog.jsonb_array_length(request_document->'lines') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-order lines must be unique within one goods receipt'; END IF;
    PERFORM 1 FROM core.memberships membership
      JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id
       AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id
       AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id
       AND membership.user_id=application_user_id AND membership.status='active'
       AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND grant_row.id=grant_id
       AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
       AND capability.capability_code='procurement.goods_receipt.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='goods-receipt delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='goods-receipt verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.receipt.post',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('inventory.document.post',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='goods-receipt branch permission is inactive'; END IF;
    SELECT * INTO STRICT branch FROM core.branches
     WHERE org_id=organization_id AND id=requested_branch_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
     WHERE org_id=organization_id AND id=requested_purchase_order_id
       AND branch_id=requested_branch_id
       AND supplier_account_id=requested_supplier_account_id
       AND status IN ('approved','partially_received')
       AND currency_code='INR' AND supply_type IN ('intra_state','inter_state')
       AND zero_rated_payment_mode='not_applicable' AND tax_charge_mechanism='normal' FOR SHARE;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts
     WHERE org_id=organization_id AND id=requested_supplier_account_id
       AND id=purchase_order.supplier_account_id
       AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_party FROM parties.parties
     WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
    SELECT count(*) INTO artifact_count FROM calculation.artifacts artifact
     WHERE artifact.org_id=organization_id AND artifact.purchase_order_id=purchase_order.id
       AND artifact.operation='procurement.purchase_order.approve' AND artifact.status='consumed';
    IF artifact_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='approved purchase order lacks one exact consumed calculation artifact'; END IF;
    SELECT * INTO STRICT purchase_artifact FROM calculation.artifacts artifact
     WHERE artifact.org_id=organization_id AND artifact.purchase_order_id=purchase_order.id
       AND artifact.operation='procurement.purchase_order.approve' AND artifact.status='consumed' FOR SHARE;
    source_versions:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
      pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,
        'status',purchase_order.status,'supply_type',purchase_order.supply_type,'tax_charge_mechanism',purchase_order.tax_charge_mechanism),
      pg_catalog.jsonb_build_object('resource_type','purchase_order_calculation_artifact','id',purchase_artifact.id,
        'aggregate_version',purchase_artifact.aggregate_version,'engine_version',purchase_artifact.engine_version,
        'ruleset_version',purchase_artifact.ruleset_version,'authority_hash',pg_catalog.encode(purchase_artifact.authority_hash,'hex')));
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      SELECT * INTO STRICT order_line FROM procurement.purchase_order_lines
       WHERE org_id=organization_id AND id=NULLIF(requested_line->>'purchase_order_line_id','')::uuid
         AND purchase_order_id=purchase_order.id AND line_kind='product' FOR SHARE;
      order_line_version_hash:=pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(pg_catalog.to_jsonb(order_line)::text,'UTF8'),'sha256'),'hex');
      SELECT * INTO STRICT product FROM catalog.products
       WHERE org_id=organization_id AND id=order_line.product_id AND status='active' FOR SHARE;
      SELECT * INTO STRICT manufacturer FROM parties.parties
       WHERE org_id=organization_id AND id=product.manufacturer_party_id AND status='active' FOR SHARE;
      IF product.drug_schedule IN ('H','H1','X') OR product.ndps_regulated THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='H, H1, X, NDPS, and controlled-product receipts remain fail-closed until typed movement evidence is integrated'; END IF;
      IF product.product_kind='medicine' THEN medicine_count:=medicine_count+1; END IF;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions
       WHERE id=order_line.tax_code_version_id AND code=order_line.tax_classification_code_snapshot
         AND code_kind='hsn' FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases
       WHERE id=tax_version.release_id AND dataset_kind='hsn_sac_tax' FOR SHARE;
      SELECT COALESCE(sum(receipt_line.base_accepted_quantity),0),COALESCE(sum(receipt_line.base_free_quantity),0)
        INTO prior_base_billed,prior_base_free
        FROM procurement.goods_receipt_lines receipt_line
        JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
         AND receipt.id=receipt_line.goods_receipt_id
       WHERE receipt_line.org_id=organization_id AND receipt_line.purchase_order_line_id=order_line.id
         AND receipt.status='posted' AND receipt.id<>goods_receipt_id;
      requested_base_billed:=0; requested_base_free:=0;
      IF pg_catalog.jsonb_typeof(requested_line->'batches')<>'array'
         OR pg_catalog.jsonb_array_length(requested_line->'batches') NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt PO line requires explicit batches'; END IF;
      unit_cost:=pg_catalog.round(order_line.net_value_amount/
        NULLIF(order_line.base_billed_quantity+order_line.base_free_quantity,0),4);
      IF unit_cost IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-order line has no provisional per-base acquisition cost'; END IF;
      FOR requested_batch IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batches') LOOP
        requested_received:=(requested_batch->>'received_quantity')::numeric;
        requested_accepted:=(requested_batch->>'accepted_quantity')::numeric;
        requested_rejected:=(requested_batch->>'rejected_quantity')::numeric;
        requested_free:=(requested_batch->>'free_quantity')::numeric;
        qc_status:=requested_batch->>'qc_status';
        IF pg_catalog.btrim(COALESCE(requested_batch->>'manufacturer_batch_number',''))=''
           OR requested_received<=0 OR requested_accepted<0 OR requested_rejected<0 OR requested_free<0
           OR requested_accepted+requested_rejected<>requested_received
           OR requested_accepted+requested_free<=0
           OR (qc_status='accepted' AND (requested_rejected<>0 OR requested_accepted<>requested_received))
           OR (qc_status='partial' AND (requested_accepted<=0 OR requested_rejected<=0
               OR pg_catalog.btrim(COALESCE(requested_batch->>'qc_notes',''))=''))
           OR qc_status NOT IN ('accepted','partial')
           OR NULLIF(requested_batch->>'expires_on','')::date<=received_day
           OR NULLIF(requested_batch->>'manufactured_on','')::date>received_day
           OR (requested_batch->>'mrp')::numeric<=0 THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt batch quantity, QC, date, or MRP evidence is invalid'; END IF;
        SELECT * INTO STRICT location FROM inventory.locations
         WHERE org_id=organization_id AND id=NULLIF(requested_batch->>'to_location_id','')::uuid
           AND branch_id=branch.id AND status='active' FOR SHARE;
        IF location.location_type NOT IN ('saleable','quarantine','cold_storage')
           OR (product.cold_chain_required AND (location.location_type<>'cold_storage'
             OR location.temperature_min_c IS NULL OR location.temperature_max_c IS NULL
             OR location.temperature_min_c<product.minimum_storage_celsius
             OR location.temperature_max_c>product.maximum_storage_celsius)) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destination location does not prove active same-branch product storage conditions'; END IF;
        SELECT * INTO STRICT mrp_conversion FROM catalog.uom_conversions
         WHERE org_id=organization_id AND id=NULLIF(requested_batch->>'mrp_uom_conversion_id','')::uuid
           AND product_id=product.id AND to_uom_code=product.base_uom_code AND status='active'
           AND valid_from<=received_day AND (valid_until IS NULL OR valid_until>=received_day) FOR SHARE;
        mrp_conversion_version_hash:=pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(pg_catalog.to_jsonb(mrp_conversion)::text,'UTF8'),'sha256'),'hex');
        SELECT count(*) INTO batch_count FROM inventory.batches
         WHERE org_id=organization_id AND product_id=product.id
           AND batch_number=requested_batch->>'manufacturer_batch_number';
        batch_id:=NULLIF(requested_batch->>'batch_id','')::uuid;
        IF batch_id IS NULL OR batch_count>1 THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt batch identity is missing or ambiguous'; END IF;
        IF batch_count=1 THEN
          SELECT * INTO STRICT existing_batch FROM inventory.batches
           WHERE org_id=organization_id AND product_id=product.id
             AND batch_number=requested_batch->>'manufacturer_batch_number' FOR SHARE;
          IF existing_batch.lot_kind<>'manufacturer_batch'
             OR existing_batch.status NOT IN ('quarantined','released')
             OR existing_batch.manufactured_on IS DISTINCT FROM NULLIF(requested_batch->>'manufactured_on','')::date
             OR existing_batch.expires_on IS DISTINCT FROM (requested_batch->>'expires_on')::date
             OR existing_batch.mrp IS DISTINCT FROM (requested_batch->>'mrp')::numeric
             OR existing_batch.mrp_uom_conversion_id IS DISTINCT FROM mrp_conversion.id THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='existing manufacturer batch immutable facts differ from receipt evidence'; END IF;
          batch_id:=existing_batch.id;
          batch_origin:=CASE WHEN existing_batch.id=NULLIF(requested_batch->>'batch_id','')::uuid
            THEN 'command_candidate' ELSE 'preexisting' END;
          batch_status:=existing_batch.status;
        ELSE
          IF NOT (mrp_conversion.valid_from<=received_day
             AND (mrp_conversion.valid_until IS NULL OR mrp_conversion.valid_until>=received_day)) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new batch MRP conversion is not effective on creation date'; END IF;
          batch_origin:='command_candidate';
          batch_status:='quarantined';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_lines) prior(value)
          WHERE prior.value->>'product_id'=product.id::text
            AND prior.value->>'manufacturer_batch_number'=requested_batch->>'manufacturer_batch_number') THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='one product manufacturer batch may appear only once per goods receipt'; END IF;
        base_accepted:=pg_catalog.round(requested_accepted*order_line.uom_conversion_factor,6);
        base_free:=pg_catalog.round(requested_free*order_line.uom_conversion_factor,6);
        extended_cost:=pg_catalog.round((base_accepted+base_free)*unit_cost,2);
        requested_base_billed:=requested_base_billed+base_accepted;
        requested_base_free:=requested_base_free+base_free;
        total_base:=total_base+base_accepted+base_free;
        total_value:=total_value+extended_cost;
        resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,
          'goods_receipt_line_id',requested_batch->>'goods_receipt_line_id',
          'inventory_document_line_id',requested_batch->>'inventory_document_line_id',
          'purchase_order_line_id',order_line.id,'purchase_order_line_version_hash',order_line_version_hash,
          'product_id',product.id,'product_row_version',product.row_version,
          'manufacturer_party_id',manufacturer.id,'manufacturer_row_version',manufacturer.row_version,
          'batch_id',batch_id,'batch_origin',batch_origin,
          'manufacturer_batch_number',requested_batch->>'manufacturer_batch_number',
          'manufactured_on',requested_batch->>'manufactured_on','expires_on',requested_batch->>'expires_on',
          'mrp',requested_batch->>'mrp','mrp_uom_conversion_id',mrp_conversion.id,
          'mrp_uom_code',mrp_conversion.from_uom_code,'mrp_uom_multiplier',mrp_conversion.multiplier::text,
          'location_id',location.id,'location_row_version',location.row_version,'location_type',location.location_type,
          'uom_code',order_line.uom_code,'uom_conversion_factor',order_line.uom_conversion_factor::text,
          'received_quantity',requested_batch->>'received_quantity','accepted_quantity',requested_batch->>'accepted_quantity',
          'rejected_quantity',requested_batch->>'rejected_quantity','free_quantity',requested_batch->>'free_quantity',
          'base_accepted_quantity',base_accepted::text,'base_free_quantity',base_free::text,
          'qc_status',qc_status,'qc_notes',requested_batch->>'qc_notes',
          'unit_cost',unit_cost::text,'extended_cost',extended_cost::text,
          'tax_code_version_id',order_line.tax_code_version_id,'taxability_snapshot',order_line.taxability_snapshot,
          'cgst_rate',order_line.cgst_rate::text,'sgst_rate',order_line.sgst_rate::text,
          'igst_rate',order_line.igst_rate::text,'cess_rate',order_line.cess_rate::text));
        source_versions:=source_versions||pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('resource_type','purchase_order_line','id',order_line.id,'version_hash',order_line_version_hash,
            'base_billed_quantity',order_line.base_billed_quantity::text,'base_free_quantity',order_line.base_free_quantity::text,
            'net_value_amount',order_line.net_value_amount::text,'uom_conversion_factor',order_line.uom_conversion_factor::text),
          pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version,
            'manufacturer_party_id',manufacturer.id,'cold_chain_required',product.cold_chain_required,
            'minimum_storage_celsius',product.minimum_storage_celsius,'maximum_storage_celsius',product.maximum_storage_celsius,
            'drug_schedule',product.drug_schedule,'ndps_regulated',product.ndps_regulated),
          pg_catalog.jsonb_build_object('resource_type','manufacturer_party','id',manufacturer.id,'row_version',manufacturer.row_version),
          pg_catalog.jsonb_build_object('resource_type','purchase_tax_snapshot','tax_code_version_id',tax_version.id,
            'tax_version_number',tax_version.version_number,'tax_release_id',tax_release.id,
            'tax_release_ruleset_version',tax_release.ruleset_version,'taxability',order_line.taxability_snapshot,
            'cgst_rate',order_line.cgst_rate::text,'sgst_rate',order_line.sgst_rate::text,
            'igst_rate',order_line.igst_rate::text,'cess_rate',order_line.cess_rate::text),
          pg_catalog.jsonb_build_object('resource_type','receipt_ceiling','purchase_order_line_id',order_line.id,
            'posted_base_billed_quantity',prior_base_billed::text,'posted_base_free_quantity',prior_base_free::text),
          pg_catalog.jsonb_build_object('resource_type','inventory_location','id',location.id,'row_version',location.row_version,
            'location_type',location.location_type,'temperature_min_c',location.temperature_min_c,'temperature_max_c',location.temperature_max_c),
          pg_catalog.jsonb_build_object('resource_type','mrp_uom_conversion','id',mrp_conversion.id,'version_hash',mrp_conversion_version_hash,
            'from_uom_code',mrp_conversion.from_uom_code,'to_uom_code',mrp_conversion.to_uom_code,
            'multiplier',mrp_conversion.multiplier::text,'valid_from',mrp_conversion.valid_from,'valid_until',mrp_conversion.valid_until),
          CASE WHEN batch_origin='preexisting' THEN pg_catalog.jsonb_build_object('resource_type','manufacturer_batch','id',existing_batch.id,
            'row_version',existing_batch.row_version,'status',existing_batch.status,'batch_number',existing_batch.batch_number,
            'manufactured_on',existing_batch.manufactured_on,'expires_on',existing_batch.expires_on,
            'mrp',existing_batch.mrp::text,'mrp_uom_conversion_id',existing_batch.mrp_uom_conversion_id)
          ELSE pg_catalog.jsonb_build_object('resource_type','manufacturer_batch_candidate','id',batch_id,'status',batch_status,
            'batch_number',requested_batch->>'manufacturer_batch_number','manufactured_on',requested_batch->>'manufactured_on',
            'expires_on',requested_batch->>'expires_on','mrp',requested_batch->>'mrp','mrp_uom_conversion_id',mrp_conversion.id) END);
      END LOOP;
      IF prior_base_billed+requested_base_billed>order_line.base_billed_quantity
         OR prior_base_free+requested_base_free>order_line.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods-receipt request exceeds remaining accepted billed or free PO quantity'; END IF;
    END LOOP;
    IF medicine_count>0 THEN
      SELECT count(DISTINCT license.license_type_code),
             pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'resource_type','receiving_branch_wholesale_license','id',license.id,
               'row_version',license.row_version,'license_type_code',license.license_type_code,
               'evidence_attachment_id',license.evidence_attachment_id,'evidence_status',attachment.status,
               'next_verification_due_on',license.next_verification_due_on) ORDER BY license.license_type_code,license.id)
        INTO license_type_count,license_sources
        FROM compliance.licenses license JOIN core.attachments attachment
          ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
       WHERE license.org_id=organization_id AND license.branch_id=branch.id
         AND license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')
         AND license.status='active' AND license.valid_from<=received_day
         AND (license.valid_until IS NULL OR license.valid_until>=received_day)
         AND license.next_verification_due_on>=received_day
         AND attachment.status IN ('verified','retained');
      IF license_type_count<>2 THEN RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='receiving branch lacks verified effective Forms 20B and 21B wholesale evidence'; END IF;
      source_versions:=source_versions||license_sources;
      SELECT count(DISTINCT license.license_type_code),
             pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'resource_type','supplier_wholesale_license','id',license.id,
               'row_version',license.row_version,'license_type_code',license.license_type_code,
               'evidence_attachment_id',license.evidence_attachment_id,'evidence_status',attachment.status,
               'next_verification_due_on',license.next_verification_due_on) ORDER BY license.license_type_code,license.id)
        INTO license_type_count,license_sources
        FROM compliance.licenses license JOIN core.attachments attachment
          ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
       WHERE license.org_id=organization_id AND license.party_id=supplier_party.id
         AND license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')
         AND license.status='active' AND license.valid_from<=received_day
         AND (license.valid_until IS NULL OR license.valid_until>=received_day)
         AND license.next_verification_due_on>=received_day
         AND attachment.status IN ('verified','retained');
      IF license_type_count<>2 THEN RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier lacks verified effective Forms 20B and 21B wholesale evidence'; END IF;
      source_versions:=source_versions||license_sources;
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'branch_id',branch.id,'branch_row_version',branch.row_version,'purchase_order_id',purchase_order.id,
      'purchase_order_row_version',purchase_order.row_version,'supplier_account_id',supplier.id,
      'received_at',received_at,'received_day',received_day,'supplier_challan_number',request_document->>'supplier_challan_number',
      'supplier_challan_date',request_document->>'supplier_challan_date','lines',resolved_lines,
      'total_abs_base_quantity',total_base::text,'total_value',total_value::text,
      'costing_method','moving_weighted_average','tax_effect','reference_only_no_payable_or_itc',
      'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','supply_type',purchase_order.supply_type,
        'tax_charge_mechanism','normal','controlled_products_supported',false,'full_rejection_supported',false),
      'source_versions',source_versions);
END
''',
            runtime=True,
        ),
        *_function(
            '"assert_goods_receipt_draft"(organization_id uuid, goods_receipt_id uuid, inventory_document_id uuid, request_document jsonb, resolved_document jsonb)',
            "void",
            '''
DECLARE bad_count integer; receipt procurement.goods_receipts%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
BEGIN
    SELECT * INTO STRICT receipt FROM procurement.goods_receipts
     WHERE org_id=organization_id AND id=goods_receipt_id FOR UPDATE;
    SELECT * INTO STRICT document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=inventory_document_id FOR UPDATE;
    IF receipt.status<>'approved' OR receipt.branch_id IS DISTINCT FROM (resolved_document->>'branch_id')::uuid
       OR receipt.supplier_account_id IS DISTINCT FROM (resolved_document->>'supplier_account_id')::uuid
       OR receipt.received_at IS DISTINCT FROM (resolved_document->>'received_at')::timestamptz
       OR receipt.supplier_challan_number IS DISTINCT FROM NULLIF(resolved_document->>'supplier_challan_number','')
       OR receipt.supplier_challan_date IS DISTINCT FROM NULLIF(resolved_document->>'supplier_challan_date','')::date
       OR document.status<>'approved' OR document.document_type<>'purchase_receipt'
       OR document.goods_receipt_id IS DISTINCT FROM receipt.id OR document.branch_id IS DISTINCT FROM receipt.branch_id
       OR document.costing_method_snapshot<>'moving_weighted_average'
       OR document.total_abs_base_quantity IS DISTINCT FROM (resolved_document->>'total_abs_base_quantity')::numeric
       OR document.total_value IS DISTINCT FROM (resolved_document->>'total_value')::numeric THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods-receipt header or MWA inventory draft differs from resolution'; END IF;
    SELECT count(*) INTO bad_count FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') resolved(value)
      LEFT JOIN procurement.goods_receipt_lines line ON line.org_id=organization_id
       AND line.id=(resolved.value->>'goods_receipt_line_id')::uuid
      LEFT JOIN inventory.batches batch ON batch.org_id=organization_id AND batch.id=(resolved.value->>'batch_id')::uuid
      LEFT JOIN inventory.inventory_document_lines inventory_line ON inventory_line.org_id=organization_id
       AND inventory_line.id=(resolved.value->>'inventory_document_line_id')::uuid
     WHERE line.id IS NULL OR line.goods_receipt_id IS DISTINCT FROM goods_receipt_id
       OR ROW(line.purchase_order_line_id,line.product_id,line.batch_id,line.location_id,line.uom_code,
              line.received_quantity,line.accepted_quantity,line.rejected_quantity,line.free_quantity,
              line.base_accepted_quantity,line.base_free_quantity,line.qc_status,line.qc_notes,line.unit_cost,line.extended_cost)
          IS DISTINCT FROM ROW((resolved.value->>'purchase_order_line_id')::uuid,(resolved.value->>'product_id')::uuid,
              (resolved.value->>'batch_id')::uuid,(resolved.value->>'location_id')::uuid,resolved.value->>'uom_code',
              (resolved.value->>'received_quantity')::numeric,(resolved.value->>'accepted_quantity')::numeric,
              (resolved.value->>'rejected_quantity')::numeric,(resolved.value->>'free_quantity')::numeric,
              (resolved.value->>'base_accepted_quantity')::numeric,(resolved.value->>'base_free_quantity')::numeric,
              resolved.value->>'qc_status',NULLIF(resolved.value->>'qc_notes',''),
              (resolved.value->>'unit_cost')::numeric,(resolved.value->>'extended_cost')::numeric)
       OR ROW(batch.product_id,batch.batch_number,batch.manufactured_on,batch.expires_on,batch.mrp,batch.mrp_uom_conversion_id)
          IS DISTINCT FROM ROW((resolved.value->>'product_id')::uuid,resolved.value->>'manufacturer_batch_number',
              NULLIF(resolved.value->>'manufactured_on','')::date,(resolved.value->>'expires_on')::date,
              (resolved.value->>'mrp')::numeric,(resolved.value->>'mrp_uom_conversion_id')::uuid)
       OR inventory_line.id IS NULL OR inventory_line.inventory_document_id IS DISTINCT FROM inventory_document_id
       OR ROW(inventory_line.movement_kind,inventory_line.product_id,inventory_line.batch_id,inventory_line.uom_code,
              inventory_line.entered_quantity,inventory_line.base_quantity,inventory_line.from_location_id,
              inventory_line.to_location_id,inventory_line.unit_cost,inventory_line.extended_cost,inventory_line.goods_receipt_line_id)
          IS DISTINCT FROM ROW('receipt'::text,(resolved.value->>'product_id')::uuid,(resolved.value->>'batch_id')::uuid,
              resolved.value->>'uom_code',(resolved.value->>'accepted_quantity')::numeric+(resolved.value->>'free_quantity')::numeric,
              (resolved.value->>'base_accepted_quantity')::numeric+(resolved.value->>'base_free_quantity')::numeric,
              NULL::uuid,(resolved.value->>'location_id')::uuid,(resolved.value->>'unit_cost')::numeric,
              (resolved.value->>'extended_cost')::numeric,(resolved.value->>'goods_receipt_line_id')::uuid);
    IF bad_count<>0
       OR (SELECT count(*) FROM procurement.goods_receipt_lines receipt_line_count
            WHERE receipt_line_count.org_id=organization_id AND receipt_line_count.goods_receipt_id=goods_receipt_id)
          <>pg_catalog.jsonb_array_length(resolved_document->'lines')
       OR (SELECT count(*) FROM inventory.inventory_document_lines inventory_line_count
            WHERE inventory_line_count.org_id=organization_id AND inventory_line_count.inventory_document_id=inventory_document_id)
          <>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods-receipt batch, QC, PO, cost, or inventory draft differs from exact resolution'; END IF;
END
''',
        ),
        *_function(
            '"persist_goods_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, goods_receipt_id uuid, inventory_document_id uuid, command_id uuid, request_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; receipt_number text;
        fiscal_year integer; aggregate_hash bytea; resolved_line jsonb;
BEGIN
    IF SESSION_USER<>'erp_runtime' OR goods_receipt_id IS NULL OR inventory_document_id IS NULL
       OR command_id IS NULL OR request_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
       OR pg_catalog.octet_length(sequence_key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt persistence envelope is invalid'; END IF;
    BEGIN
      request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
      resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
      preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='goods-receipt persistence requires UTF-8 JSON'; END;
    current_resolution:="{SCHEMA}"."resolve_goods_receipt_prepare"(
      organization_id,membership_id,auth_user_id,application_user_id,grant_id,caller_client_id,goods_receipt_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document
       OR request_document->>'goods_receipt_id' IS DISTINCT FROM goods_receipt_id::text
       OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
       OR preview_document->>'calculation_hash' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='goods-receipt PO, batch, QC, licence, location, or MWA source changed'; END IF;
    SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='procurement.goods_receipt.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM goods_receipt_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='goods-receipt idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
    PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'procurement.goods_receipt.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,goods_receipt_id,NULL,NULL,key_hash,
      request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'received_day')::date)>=4
      THEN pg_catalog.date_part('year',(resolved_document->>'received_day')::date)::integer
      ELSE pg_catalog.date_part('year',(resolved_document->>'received_day')::date)::integer-1 END;
    SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence
     WHERE sequence.org_id=organization_id AND sequence.branch_id=(resolved_document->>'branch_id')::uuid
       AND sequence.document_type='goods_receipt' AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
       AND sequence.status='active' FOR SHARE;
    receipt_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
    INSERT INTO procurement.goods_receipts(org_id,id,branch_id,supplier_account_id,goods_receipt_number,fiscal_year,
      received_at,supplier_challan_number,supplier_challan_date,status)
    VALUES(organization_id,goods_receipt_id,(resolved_document->>'branch_id')::uuid,
      (resolved_document->>'supplier_account_id')::uuid,receipt_number,fiscal_year,
      (resolved_document->>'received_at')::timestamptz,NULLIF(resolved_document->>'supplier_challan_number',''),
      NULLIF(resolved_document->>'supplier_challan_date','')::date,'approved');
    INSERT INTO inventory.inventory_documents(org_id,id,branch_id,destination_branch_id,physical_movement_required,
      document_type,document_number,fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
      total_abs_base_quantity,total_value,goods_receipt_id,approved_at,approved_by_membership_id)
    VALUES(organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,NULL,false,
      'purchase_receipt',receipt_number,fiscal_year,(resolved_document->>'received_day')::date,'approved','goods_receipt',
      'INR','moving_weighted_average',(resolved_document->>'total_abs_base_quantity')::numeric,
      (resolved_document->>'total_value')::numeric,goods_receipt_id,pg_catalog.transaction_timestamp(),membership_id);
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      IF resolved_line->>'batch_origin'='command_candidate' AND NOT EXISTS (
        SELECT 1 FROM inventory.batches batch WHERE batch.org_id=organization_id AND batch.id=(resolved_line->>'batch_id')::uuid
      ) THEN
        INSERT INTO inventory.batches(org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,mrp,mrp_uom_conversion_id,status)
        VALUES(organization_id,(resolved_line->>'batch_id')::uuid,(resolved_line->>'product_id')::uuid,
          resolved_line->>'manufacturer_batch_number','manufacturer_batch',NULLIF(resolved_line->>'manufactured_on','')::date,
          (resolved_line->>'expires_on')::date,(resolved_line->>'mrp')::numeric,
          (resolved_line->>'mrp_uom_conversion_id')::uuid,'quarantined');
      END IF;
      INSERT INTO procurement.goods_receipt_lines(org_id,id,goods_receipt_id,line_number,purchase_order_line_id,
        product_id,batch_id,location_id,uom_code,received_quantity,accepted_quantity,rejected_quantity,free_quantity,
        base_accepted_quantity,base_free_quantity,qc_status,qc_notes,unit_cost,extended_cost)
      VALUES(organization_id,(resolved_line->>'goods_receipt_line_id')::uuid,goods_receipt_id,
        (resolved_line->>'line_number')::integer,(resolved_line->>'purchase_order_line_id')::uuid,
        (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,(resolved_line->>'location_id')::uuid,
        resolved_line->>'uom_code',(resolved_line->>'received_quantity')::numeric,(resolved_line->>'accepted_quantity')::numeric,
        (resolved_line->>'rejected_quantity')::numeric,(resolved_line->>'free_quantity')::numeric,
        (resolved_line->>'base_accepted_quantity')::numeric,(resolved_line->>'base_free_quantity')::numeric,
        resolved_line->>'qc_status',NULLIF(resolved_line->>'qc_notes',''),(resolved_line->>'unit_cost')::numeric,
        (resolved_line->>'extended_cost')::numeric);
      INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,
        product_id,batch_id,uom_code,entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,
        extended_cost,goods_receipt_line_id)
      VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,inventory_document_id,
        (resolved_line->>'line_number')::integer,'receipt',(resolved_line->>'product_id')::uuid,
        (resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',
        (resolved_line->>'accepted_quantity')::numeric+(resolved_line->>'free_quantity')::numeric,
        (resolved_line->>'base_accepted_quantity')::numeric+(resolved_line->>'base_free_quantity')::numeric,
        NULL,(resolved_line->>'location_id')::uuid,(resolved_line->>'unit_cost')::numeric,
        (resolved_line->>'extended_cost')::numeric,(resolved_line->>'goods_receipt_line_id')::uuid);
    END LOOP;
    PERFORM "{SCHEMA}"."assert_goods_receipt_draft"(
      organization_id,goods_receipt_id,inventory_document_id,request_document,resolved_document);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            runtime=True,
        ),
    ]


def _supplier_invoice_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        requested_supplier_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        requested_registration_id uuid:=NULLIF(request_document->>'supplier_tax_registration_id','')::uuid;
        requested_portal_line_id uuid:=NULLIF(request_document->>'portal_document_line_id','')::uuid;
        invoice_date date:=NULLIF(request_document->>'invoice_date','')::date;
        received_date date:=NULLIF(request_document->>'received_date','')::date;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        buyer_registration tax.registrations%ROWTYPE; buyer_scope tax.registration_branches%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        supplier_registration parties.tax_registrations%ROWTYPE; supplier_address parties.addresses%ROWTYPE;
        portal_line tax.portal_document_lines%ROWTYPE; portal_document tax.portal_documents%ROWTYPE;
        portal_period tax.return_periods%ROWTYPE; inventory_account finance.accounts%ROWTYPE;
        payable_account finance.accounts%ROWTYPE; input_cgst_account finance.accounts%ROWTYPE;
        input_sgst_account finance.accounts%ROWTYPE; input_igst_account finance.accounts%ROWTYPE;
        input_cess_account finance.accounts%ROWTYPE; rounding_gain_account finance.accounts%ROWTYPE;
        rounding_loss_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        receipt_line procurement.goods_receipt_lines%ROWTYPE; receipt procurement.goods_receipts%ROWTYPE;
        balance inventory.stock_balances%ROWTYPE;
        order_line procurement.purchase_order_lines%ROWTYPE; purchase_order procurement.purchase_orders%ROWTYPE;
        product catalog.products%ROWTYPE;
        tax_version tax.tax_code_versions%ROWTYPE; tax_release core.reference_data_releases%ROWTYPE;
        profile catalog.commercial_charge_tax_profiles%ROWTYPE; expense_account finance.accounts%ROWTYPE;
        requested_line jsonb; requested_allocation jsonb; resolved_allocations jsonb;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        resolved_receipt_ids jsonb:='[]'::jsonb; source_purchase_order_id uuid;
        base_billed numeric(20,6); base_free numeric(20,6); prior_billed numeric(20,6); prior_free numeric(20,6);
        receipt_cost numeric(20,2); line_product_id uuid; line_purchase_order_line_id uuid;
        line_uom text; line_factor numeric(20,6);
        ruleset_version text; supply_type text; candidate_count integer; address_count integer;
        allocation_count integer; distinct_allocation_count integer; foreign_positive_count integer;
        exact_receipt_source_provenance boolean;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
       OR grant_id IS NULL OR supplier_invoice_id IS NULL OR requested_branch_id IS NULL
       OR requested_supplier_id IS NULL OR requested_registration_id IS NULL OR requested_portal_line_id IS NULL
       OR invoice_date IS NULL OR received_date<invoice_date OR pg_catalog.btrim(COALESCE(request_document->>'supplier_invoice_number',''))=''
       OR request_document->>'tax_charge_mechanism'<>'normal'
       OR request_document->>'zero_rated_payment_mode'<>'not_applicable'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
       OR pg_catalog.jsonb_typeof(request_document->'goods_receipt_ids')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'goods_receipt_ids')<1
       OR pg_catalog.jsonb_typeof(COALESCE(request_document->'expense_charge_lines','[]'::jsonb))<>'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-invoice input is incomplete or outside the domestic normal-charge pilot'; END IF;
    SELECT count(*),count(DISTINCT line.value->>'goods_receipt_line_id')
      INTO allocation_count,distinct_allocation_count
      FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value);
    IF allocation_count<>distinct_allocation_count OR allocation_count=0
       OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids'))
          <>(SELECT count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice requires unique receipt lines and a unique exact GRN set'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
      WHERE line.value->>'product_inventory_cost_treatment'<>'capitalize'
         OR line.value->>'landed_cost_allocation_method' NOT IN ('direct','quantity_weighted','value_weighted')
         OR line.value->>'itc_eligibility'<>'eligible'
         OR line.value->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17')
       OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'expense_charge_lines','[]'::jsonb)) line(value)
      WHERE line.value->>'charge_inventory_cost_treatment' NOT IN ('expense','capitalize')
         OR (line.value->>'charge_inventory_cost_treatment'='capitalize'
             AND line.value->>'landed_cost_allocation_method' NOT IN ('direct','quantity_weighted','value_weighted'))
         OR (line.value->>'charge_inventory_cost_treatment'='expense'
             AND line.value ? 'landed_cost_allocation_method')
         OR line.value->>'itc_eligibility'<>'eligible'
         OR line.value->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
         OR line.value->>'expense_charge_code' NOT IN ('freight','packing','insurance','handling')) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier-invoice requires reviewed ITC and explicit product or charge landed-cost treatment'; END IF;
    PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
       AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id
       AND grant_row.status='active' AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
       AND capability.capability_code='procurement.supplier_invoice.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.supplier_invoice.create',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.invoice.post',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice cross-domain permission is inactive'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations WHERE id=organization_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=requested_branch_id AND status='active' FOR SHARE;
    IF organization.country_code<>'IN' OR organization.base_currency<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier-invoice pilot supports only Indian INR organizations'; END IF;
    SELECT count(*) INTO candidate_count FROM tax.registration_branches association JOIN tax.registrations registration
      ON registration.org_id=association.org_id AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.registration_type='regular' AND registration.status='active'
       AND registration.effective_from<=invoice_date AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date);
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='buyer requires one exact effective regular branch GST registration'; END IF;
    SELECT registration.* INTO STRICT buyer_registration FROM tax.registration_branches association JOIN tax.registrations registration
      ON registration.org_id=association.org_id AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.registration_type='regular' AND registration.status='active'
       AND registration.effective_from<=invoice_date AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date)
     FOR SHARE OF association,registration;
    SELECT * INTO STRICT buyer_scope FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=buyer_registration.id
       AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date) FOR SHARE;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts
     WHERE org_id=organization_id AND id=requested_supplier_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_party FROM parties.parties
     WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_registration FROM parties.tax_registrations
     WHERE org_id=organization_id AND id=requested_registration_id AND party_id=supplier.party_id
       AND registration_type='GSTIN' AND status='active' AND verified_at IS NOT NULL
       AND taxpayer_type IN ('regular','casual') AND (valid_from IS NULL OR valid_from<=invoice_date)
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    SELECT count(*) INTO address_count FROM parties.addresses WHERE org_id=organization_id AND party_id=supplier.party_id
       AND address_kind='registered' AND is_primary AND status='active' AND state_code=supplier_registration.state_code
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date);
    IF address_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier GSTIN requires one exact effective registered address'; END IF;
    SELECT * INTO STRICT supplier_address FROM parties.addresses WHERE org_id=organization_id AND party_id=supplier.party_id
       AND address_kind='registered' AND is_primary AND status='active' AND state_code=supplier_registration.state_code
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    IF supplier_address.country_code<>'IN' THEN RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='import supplier invoices remain fail-closed'; END IF;
    supply_type:=CASE WHEN buyer_registration.state_code=supplier_registration.state_code THEN 'intra_state' ELSE 'inter_state' END;
    SELECT * INTO STRICT portal_line FROM tax.portal_document_lines
     WHERE org_id=organization_id AND id=requested_portal_line_id AND document_type='invoice'
       AND supplier_gstin=supplier_registration.registration_number
       AND invoice_number=request_document->>'supplier_invoice_number' AND invoice_date=invoice_date
       AND place_of_supply_state_code=buyer_registration.state_code FOR SHARE;
    SELECT * INTO STRICT portal_document FROM tax.portal_documents
     WHERE org_id=organization_id AND id=portal_line.portal_document_id AND registration_id=buyer_registration.id
       AND portal_document_type='gstr2b' AND status='parsed' AND parsed_at IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT portal_period FROM tax.return_periods
     WHERE org_id=organization_id AND id=portal_document.return_period_id AND registration_id=buyer_registration.id
       AND period_start<=invoice_date AND period_end>=invoice_date FOR SHARE;
    SELECT count(*) INTO candidate_count FROM tax.portal_document_lines line JOIN tax.portal_documents document
      ON document.org_id=line.org_id AND document.id=line.portal_document_id
     WHERE line.org_id=organization_id AND line.supplier_gstin=supplier_registration.registration_number
       AND line.invoice_number=request_document->>'supplier_invoice_number' AND line.invoice_date=invoice_date
       AND line.document_type='invoice' AND document.registration_id=buyer_registration.id
       AND document.portal_document_type='gstr2b' AND document.status='parsed';
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier invoice requires one unique parsed GSTR-2B row'; END IF;
    SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'inventory_asset','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT payable_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'accounts_payable','liability','INR',true) FOR SHARE;
    IF supplier.default_payable_account_id IS DISTINCT FROM payable_account.id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier default payable account differs from the reviewed branch account role'; END IF;
    SELECT * INTO STRICT input_cgst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_cgst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_sgst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_sgst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_igst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_igst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_cess_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_cess','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT rounding_gain_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'rounding_gain','income','INR',false) FOR SHARE;
    SELECT * INTO STRICT rounding_loss_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'rounding_loss','expense','INR',false) FOR SHARE;
    SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'purchase_price_variance','expense','INR',false) FOR SHARE;
    source_versions:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','buyer_tax_registration','id',buyer_registration.id,'row_version',buyer_registration.row_version),
      pg_catalog.jsonb_build_object('resource_type','buyer_registration_branch','registration_id',buyer_scope.registration_id,'branch_id',buyer_scope.branch_id,'effective_from',buyer_scope.effective_from,'effective_to',buyer_scope.effective_to),
      pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version,'payment_days',supplier.payment_days),
      pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_tax_registration','id',supplier_registration.id,'row_version',supplier_registration.row_version,'registration_number',supplier_registration.registration_number,'taxpayer_type',supplier_registration.taxpayer_type,'verified_at',supplier_registration.verified_at),
      pg_catalog.jsonb_build_object('resource_type','supplier_registered_address','id',supplier_address.id,'row_version',supplier_address.row_version),
      pg_catalog.jsonb_build_object('resource_type','gstr2b_portal_document','id',portal_document.id,'status',portal_document.status,'parsed_at',portal_document.parsed_at,'source_sha256',pg_catalog.encode(portal_document.source_sha256,'hex')),
      pg_catalog.jsonb_build_object('resource_type','gstr2b_portal_line','id',portal_line.id,'source_row_hash',pg_catalog.encode(portal_line.source_row_hash,'hex')),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','accounts_payable','id',payable_account.id,'row_version',payable_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cgst','id',input_cgst_account.id,'row_version',input_cgst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_sgst','id',input_sgst_account.id,'row_version',input_sgst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_igst','id',input_igst_account.id,'row_version',input_igst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cess','id',input_cess_account.id,'row_version',input_cess_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','rounding_gain','id',rounding_gain_account.id,'row_version',rounding_gain_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','rounding_loss','id',rounding_loss_account.id,'row_version',rounding_loss_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','purchase_price_variance','id',variance_account.id,'row_version',variance_account.row_version));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        organization_id::text||':supplier-receipt:'||locked.goods_receipt_line_id,630195401))
      FROM (
        SELECT DISTINCT line.value->>'goods_receipt_line_id' AS goods_receipt_line_id
          FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
         ORDER BY goods_receipt_line_id
      ) locked;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      IF NULLIF(requested_line->>'line_id','')::uuid IS NULL OR NULLIF(requested_line->>'allocation_id','')::uuid IS NULL
         OR NULLIF(requested_line->>'goods_receipt_line_id','')::uuid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier product line requires identity and one explicit receipt line'; END IF;
      base_billed:=0; base_free:=0; receipt_cost:=0; line_product_id:=NULL; line_purchase_order_line_id:=NULL;
      line_uom:=NULL; line_factor:=NULL; resolved_allocations:='[]'::jsonb;
      FOR requested_allocation IN SELECT pg_catalog.jsonb_build_object(
        'allocation_id',requested_line->>'allocation_id',
        'goods_receipt_line_id',requested_line->>'goods_receipt_line_id',
        'allocated_base_billed_quantity',requested_line->>'allocated_base_billed_quantity',
        'allocated_base_free_quantity',requested_line->>'allocated_base_free_quantity') LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||':supplier-receipt:'||(requested_allocation->>'goods_receipt_line_id'),630195401));
        SELECT line.* INTO STRICT receipt_line FROM procurement.goods_receipt_lines line JOIN procurement.goods_receipts header
          ON header.org_id=line.org_id AND header.id=line.goods_receipt_id
         WHERE line.org_id=organization_id AND line.id=NULLIF(requested_allocation->>'goods_receipt_line_id','')::uuid
           AND header.status='posted' AND header.branch_id=branch.id AND header.supplier_account_id=supplier.id
           AND line.purchase_order_line_id IS NOT NULL FOR SHARE OF line,header;
        SELECT * INTO STRICT receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id AND status='posted' FOR SHARE;
        SELECT * INTO STRICT balance FROM inventory.stock_balances
         WHERE org_id=organization_id AND location_id=receipt_line.location_id
           AND product_id=receipt_line.product_id AND batch_id=receipt_line.batch_id FOR SHARE;
        SELECT * INTO STRICT order_line FROM procurement.purchase_order_lines
         WHERE org_id=organization_id AND id=receipt_line.purchase_order_line_id AND line_kind='product' FOR SHARE;
        SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
         WHERE org_id=organization_id AND id=order_line.purchase_order_id
           AND branch_id=branch.id AND supplier_account_id=supplier.id
           AND status IN ('partially_received','received') FOR SHARE;
        IF source_purchase_order_id IS NULL THEN source_purchase_order_id:=purchase_order.id;
        ELSIF source_purchase_order_id IS DISTINCT FROM purchase_order.id THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice receipt allocations must belong to one purchase order'; END IF;
        IF receipt_line.uom_code IS DISTINCT FROM order_line.uom_code THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted receipt UOM differs from its locked purchase-order line'; END IF;
        SELECT * INTO STRICT product FROM catalog.products
         WHERE org_id=organization_id AND id=receipt_line.product_id AND id=order_line.product_id
           AND product_kind IN ('medicine','medical_device','consumable') AND status='active' FOR SHARE;
        IF line_product_id IS NULL THEN line_product_id:=product.id; line_purchase_order_line_id:=order_line.id;
          line_uom:=receipt_line.uom_code; line_factor:=order_line.uom_conversion_factor;
        ELSIF ROW(line_product_id,line_purchase_order_line_id,line_uom,line_factor)
          IS DISTINCT FROM ROW(product.id,order_line.id,receipt_line.uom_code,order_line.uom_conversion_factor) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='one supplier invoice line cannot mix PO line, product, or UOM receipt facts'; END IF;
        PERFORM allocation.id
          FROM procurement.supplier_invoice_receipt_allocations allocation
          JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id
         ORDER BY allocation.id FOR SHARE OF allocation,invoice_line;
        prior_billed:=COALESCE((SELECT sum(allocation.allocated_base_billed_quantity)
          FROM procurement.supplier_invoice_receipt_allocations allocation JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id),0);
        prior_free:=COALESCE((SELECT sum(allocation.allocated_base_free_quantity)
          FROM procurement.supplier_invoice_receipt_allocations allocation JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id),0);
        IF (requested_allocation->>'allocated_base_billed_quantity')::numeric<0
           OR (requested_allocation->>'allocated_base_free_quantity')::numeric<0
           OR (requested_allocation->>'allocated_base_billed_quantity')::numeric+(requested_allocation->>'allocated_base_free_quantity')::numeric<=0
           OR prior_billed+(requested_allocation->>'allocated_base_billed_quantity')::numeric>receipt_line.base_accepted_quantity
           OR prior_free+(requested_allocation->>'allocated_base_free_quantity')::numeric>receipt_line.base_free_quantity THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice exceeds separate posted receipt billed or free ceiling'; END IF;
        SELECT count(*) INTO foreign_positive_count
          FROM inventory.stock_ledger_entries AS entry
          JOIN inventory.inventory_document_lines AS document_line
            ON document_line.org_id=entry.org_id
           AND document_line.id=entry.inventory_document_line_id
         WHERE entry.org_id=organization_id
           AND entry.location_id=receipt_line.location_id
           AND entry.product_id=receipt_line.product_id
           AND entry.batch_id=receipt_line.batch_id
           AND entry.quantity_delta>0
           AND document_line.goods_receipt_line_id IS DISTINCT FROM receipt_line.id;
        exact_receipt_source_provenance:=
          (requested_allocation->>'allocated_base_billed_quantity')::numeric
            IS NOT DISTINCT FROM receipt_line.base_accepted_quantity
          AND (requested_allocation->>'allocated_base_free_quantity')::numeric
            IS NOT DISTINCT FROM receipt_line.base_free_quantity
          AND foreign_positive_count=0;
        base_billed:=base_billed+(requested_allocation->>'allocated_base_billed_quantity')::numeric;
        base_free:=base_free+(requested_allocation->>'allocated_base_free_quantity')::numeric;
        receipt_cost:=receipt_cost+pg_catalog.round(((requested_allocation->>'allocated_base_billed_quantity')::numeric+
          (requested_allocation->>'allocated_base_free_quantity')::numeric)*receipt_line.unit_cost,2);
        resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(requested_allocation||pg_catalog.jsonb_build_object(
          'goods_receipt_id',receipt.id,'goods_receipt_row_version',receipt.row_version,'goods_receipt_line_row_id',receipt_line.id,
          'product_id',product.id,'receipt_unit_cost',receipt_line.unit_cost::text,'receipt_base_accepted_quantity',receipt_line.base_accepted_quantity::text,
          'receipt_base_free_quantity',receipt_line.base_free_quantity::text,'prior_allocated_base_billed_quantity',prior_billed::text,
          'prior_allocated_base_free_quantity',prior_free::text,'location_id',receipt_line.location_id,'batch_id',receipt_line.batch_id,
          'stock_on_hand_quantity',balance.on_hand_quantity::text,'stock_inventory_value',balance.inventory_value::text,
          'stock_average_unit_cost',balance.average_unit_cost::text,'stock_row_version',balance.row_version,
          'exact_receipt_source_provenance',exact_receipt_source_provenance));
        resolved_receipt_ids:=resolved_receipt_ids||pg_catalog.jsonb_build_array(receipt.id::text);
        source_versions:=source_versions||pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,'status',purchase_order.status),
          pg_catalog.jsonb_build_object('resource_type','purchase_order_line','id',order_line.id,'purchase_order_id',purchase_order.id),
          pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version,'status',receipt.status),
          pg_catalog.jsonb_build_object('resource_type','goods_receipt_line','id',receipt_line.id,'goods_receipt_line_id',receipt_line.id,'base_accepted_quantity',receipt_line.base_accepted_quantity::text,'base_free_quantity',receipt_line.base_free_quantity::text,'unit_cost',receipt_line.unit_cost::text),
          pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',receipt_line.location_id,'product_id',receipt_line.product_id,
            'batch_id',receipt_line.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,
            'inventory_value',balance.inventory_value::text,'average_unit_cost',balance.average_unit_cost::text),
          pg_catalog.jsonb_build_object('resource_type','receipt_invoice_ceiling','goods_receipt_line_id',receipt_line.id,'allocated_base_billed_quantity',prior_billed::text,'allocated_base_free_quantity',prior_free::text));
      END LOOP;
      IF base_billed IS DISTINCT FROM pg_catalog.round((requested_line->>'billed_quantity')::numeric*line_factor,6)
         OR base_free IS DISTINCT FROM pg_catalog.round((requested_line->>'free_quantity')::numeric*line_factor,6) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice billed and free quantities do not reconcile exact receipt base allocations'; END IF;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE code=product.hsn_code AND code_kind='hsn'
       AND status='active' AND taxability='taxable' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','product','line_id',requested_line->>'line_id',
        'purchase_order_line_id',line_purchase_order_line_id,'product_id',product.id,'hsn_code',product.hsn_code,'uom_code',line_uom,'multiplier',line_factor::text,
        'tax_code_version_id',tax_version.id,'taxability','taxable','gst_rate',tax_version.igst_rate::text,'cess_rate',tax_version.cess_rate::text,
        'ruleset_version',tax_version.ruleset_version,'net_value_account_id',inventory_account.id,'inventory_cost_treatment','capitalize',
        'landed_cost_allocation_method',requested_line->>'landed_cost_allocation_method',
        'itc_eligibility','eligible','receipt_cost',receipt_cost::text,'receipt_allocations',resolved_allocations,'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','supplier_invoice_product_tax','product_id',product.id,'product_row_version',product.row_version,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,'tax_release_id',tax_release.id,
        'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'expense_charge_lines','[]'::jsonb)) LOOP
      SELECT * INTO STRICT profile FROM catalog.commercial_charge_tax_profiles WHERE org_id=organization_id
       AND direction='procurement' AND charge_code=requested_line->>'expense_charge_code' AND status='active'
       AND effective_from<=invoice_date AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE id=profile.tax_code_version_id AND code_kind='sac'
       AND status='active' AND taxability='taxable' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF requested_line->>'charge_inventory_cost_treatment'='capitalize' THEN
        IF NULLIF(requested_line->>'net_value_account_id','')::uuid IS DISTINCT FROM inventory_account.id THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier charge account differs from the canonical inventory role'; END IF;
        expense_account:=inventory_account;
      ELSE
        SELECT * INTO STRICT expense_account FROM finance.accounts WHERE org_id=organization_id
         AND id=NULLIF(requested_line->>'net_value_account_id','')::uuid AND account_type='expense'
         AND currency_code='INR' AND status='active' AND NOT allows_party_posting FOR SHARE;
      END IF;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','charge','line_id',requested_line->>'line_id',
        'charge_code',profile.charge_code,'sac_code',tax_version.code,'tax_code_version_id',tax_version.id,
        'taxability','taxable','gst_rate',tax_version.igst_rate::text,'cess_rate',tax_version.cess_rate::text,
        'ruleset_version',tax_version.ruleset_version,'net_value_account_id',expense_account.id,
        'inventory_cost_treatment',requested_line->>'charge_inventory_cost_treatment',
        'landed_cost_allocation_method',requested_line->>'landed_cost_allocation_method',
        'itc_eligibility','eligible','input',requested_line||pg_catalog.jsonb_build_object(
          'charge_code',profile.charge_code,'price_basis',requested_line->>'expense_price_basis',
          'document_discount_eligible',requested_line->'expense_document_discount_eligible')));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','commercial_charge_tax_profile','id',profile.id,'row_version',profile.row_version,'charge_code',profile.charge_code),
        pg_catalog.jsonb_build_object('resource_type','supplier_invoice_charge_tax','charge_code',profile.charge_code,
          'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
          'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version),
        pg_catalog.jsonb_build_object('resource_type','finance_account','id',expense_account.id,'row_version',expense_account.row_version,'account_type',expense_account.account_type));
    END LOOP;
    IF EXISTS (
      (SELECT value FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids') requested(value)
       EXCEPT SELECT value FROM pg_catalog.jsonb_array_elements_text(resolved_receipt_ids) resolved(value))
      UNION ALL
      (SELECT value FROM pg_catalog.jsonb_array_elements_text(resolved_receipt_ids) resolved(value)
       EXCEPT SELECT value FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids') requested(value))
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='requested GRN header set differs from the exact receipt allocation lineage'; END IF;
    RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'supplier_account_id',supplier.id,
      'purchase_order_id',source_purchase_order_id,'goods_receipt_ids',request_document->'goods_receipt_ids',
      'supplier_party_id',supplier_party.id,'supplier_tax_registration_id',supplier_registration.id,
      'supplier_gstin',supplier_registration.registration_number,'supplier_legal_name',supplier_registration.registered_legal_name,
      'supplier_address',pg_catalog.concat_ws(', ',supplier_address.line1,supplier_address.line2,supplier_address.city,supplier_address.state_code,supplier_address.postal_code),
      'buyer_tax_registration_id',buyer_registration.id,'buyer_gstin',buyer_registration.gstin,
      'buyer_legal_name',organization.legal_name,'buyer_address',pg_catalog.concat_ws(', ',branch.address_line1,branch.address_line2,branch.city,branch.state_code,branch.postal_code),
      'invoice_date',invoice_date,'received_date',received_date,'due_date',invoice_date+supplier.payment_days,
      'supply_type',supply_type,'zero_rated_payment_mode','not_applicable','tax_charge_mechanism','normal',
      'place_of_supply_state_code',buyer_registration.state_code,'portal_document_line_id',portal_line.id,
      'portal_taxable_amount',portal_line.taxable_amount::text,'portal_cgst_amount',portal_line.cgst_amount::text,
      'portal_sgst_amount',portal_line.sgst_amount::text,'portal_igst_amount',portal_line.igst_amount::text,
      'portal_cess_amount',portal_line.cess_amount::text,'ruleset_version',ruleset_version,'lines',resolved_lines,
      'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','normal_charge',true,
        'posted_grn_match_required',true,'gstr2b_required',true,'itc_business_use_attestation_required',true,
        'landed_cost_supported',true,'landed_cost_methods',pg_catalog.jsonb_build_array('direct','quantity_weighted','value_weighted'),
        'consumed_variance_role','purchase_price_variance','import_supported',false,'sez_supported',false,'reverse_charge_supported',false),
      'source_versions',source_versions);
END
''',
            runtime=True,
            calculator=True,
        ),
        *_function(
            '"persist_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb; allocation jsonb;
        existing automation.command_requests%ROWTYPE; aggregate_hash bytea; claim_id uuid; replay_id uuid;
        requested_total numeric(20,2);
BEGIN
    IF SESSION_USER<>'erp_calculator' OR supplier_invoice_id IS NULL OR command_id IS NULL OR artifact_id IS NULL
       OR request_id IS NULL OR tax_document_id IS NULL OR journal_id IS NULL OR event_id IS NULL OR open_item_id IS NULL
       OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-invoice persistence envelope is invalid'; END IF;
    request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
    output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
    current_resolution:="{SCHEMA}"."resolve_supplier_invoice_prepare"(organization_id,membership_id,auth_user_id,application_user_id,
      grant_id,caller_client_id,supplier_invoice_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document OR output_document->>'operation'<>'procurement.supplier_invoice.post'
       OR output_document->>'resource_type'<>'supplier_invoice' OR output_document->>'resource_id'<>supplier_invoice_id::text
       OR preview_document->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope' THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier-invoice resolution, calculation, or ITC attestation changed'; END IF;
    totals:=output_document->'totals';
    IF (totals->>'gst_taxable_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_taxable_amount')::numeric
       OR (totals->>'cgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cgst_amount')::numeric
       OR (totals->>'sgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_sgst_amount')::numeric
       OR (totals->>'igst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_igst_amount')::numeric
       OR (totals->>'cess_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cess_amount')::numeric THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculated supplier invoice GST components differ from the unique GSTR-2B evidence'; END IF;
    SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
      AND capability_code='procurement.supplier_invoice.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM supplier_invoice_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier-invoice idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    requested_total:=(totals->>'grand_total')::numeric;
    INSERT INTO procurement.supplier_invoices(org_id,id,branch_id,supplier_account_id,buyer_tax_registration_id,
      supplier_tax_registration_id,supplier_invoice_number,supplier_invoice_date,received_date,due_date,fiscal_year,status,
      supply_type,zero_rated_payment_mode,tax_charge_mechanism,place_of_supply_state_code,calculation_ruleset_version,
      document_discount_kind,document_discount_basis,document_discount_value,supplier_legal_name_snapshot,supplier_gstin_snapshot,
      supplier_address_snapshot,buyer_legal_name_snapshot,buyer_gstin_snapshot,buyer_address_snapshot,currency_code,
      subtotal,discount_total,charges_total,net_value_total,gst_taxable_total,cgst_total,sgst_total,igst_total,cess_total,
      recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
    VALUES(organization_id,supplier_invoice_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_account_id')::uuid,
      (resolved_document->>'buyer_tax_registration_id')::uuid,(resolved_document->>'supplier_tax_registration_id')::uuid,
      request_document->>'supplier_invoice_number',(resolved_document->>'invoice_date')::date,(resolved_document->>'received_date')::date,
      (resolved_document->>'due_date')::date,CASE WHEN pg_catalog.date_part('month',(resolved_document->>'invoice_date')::date)>=4
        THEN pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer
        ELSE pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer-1 END,'approved',
      resolved_document->>'supply_type','not_applicable','normal',resolved_document->>'place_of_supply_state_code',output_document->>'ruleset_version',
      request_document->'document_discount'->>'document_discount_kind',request_document->'document_discount'->>'document_discount_basis',
      (request_document->'document_discount'->>'document_discount_value')::numeric,resolved_document->>'supplier_legal_name',
      resolved_document->>'supplier_gstin',resolved_document->>'supplier_address',resolved_document->>'buyer_legal_name',
      resolved_document->>'buyer_gstin',resolved_document->>'buyer_address','INR',(totals->>'subtotal')::numeric,
      (totals->>'discount_total')::numeric,(totals->>'charges_total')::numeric,(totals->>'net_value_total')::numeric,
      (totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,
      (totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,(totals->>'recipient_assessed_tax_total')::numeric,
      request_document->>'rounding_policy',(totals->>'rounding_adjustment')::numeric,requested_total);
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines') WHERE value->>'line_id'=resolved_line->>'line_id';
      INSERT INTO procurement.supplier_invoice_lines(org_id,id,supplier_invoice_id,line_number,line_kind,purchase_order_line_id,
        product_id,charge_code,uom_code,uom_conversion_factor,billed_quantity,free_quantity,base_billed_quantity,base_free_quantity,
        free_supply_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,gross_amount,line_discount_kind,line_discount_basis,
        line_discount_value,document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,
        document_taxable_discount_amount,net_value_amount,gst_taxable_value,tax_classification_code_snapshot,tax_code_version_id,
        taxability_snapshot,inventory_cost_treatment,landed_cost_allocation_method,net_value_account_id,withholding_nature_code,itc_eligibility,cgst_rate,sgst_rate,igst_rate,cess_rate,
        cgst_amount,sgst_amount,igst_amount,cess_amount,line_total)
      VALUES(organization_id,(resolved_line->>'line_id')::uuid,supplier_invoice_id,(resolved_line->>'line_number')::integer,
        resolved_line->>'line_kind',NULLIF(resolved_line->>'purchase_order_line_id','')::uuid,
        NULLIF(resolved_line->>'product_id','')::uuid,resolved_line->>'charge_code',resolved_line->>'uom_code',
        NULLIF(resolved_line->>'multiplier','')::numeric,NULLIF(resolved_line->'input'->>'billed_quantity','')::numeric,
        NULLIF(resolved_line->'input'->>'free_quantity','')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->>'billed_quantity')::numeric*(resolved_line->>'multiplier')::numeric END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->>'free_quantity')::numeric*(resolved_line->>'multiplier')::numeric END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->>'free_supply_tax_treatment' END,
        NULLIF(resolved_line->'input'->>'quoted_unit_rate','')::numeric,resolved_line->'input'->>'price_basis','normal',
        (calculated_line->>'gross_amount')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_kind' ELSE 'none' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_basis' ELSE 'price_value' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->'line_discount'->>'line_discount_value')::numeric ELSE 0 END,
        (resolved_line->'input'->>'document_discount_eligible')::boolean,(calculated_line->>'line_discount_amount')::numeric,
        (calculated_line->>'line_taxable_discount_amount')::numeric,(calculated_line->>'document_discount_amount')::numeric,
        (calculated_line->>'document_taxable_discount_amount')::numeric,(calculated_line->>'net_value_amount')::numeric,
        (calculated_line->>'gst_taxable_value')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code' ELSE resolved_line->>'sac_code' END,
        (resolved_line->>'tax_code_version_id')::uuid,'taxable',resolved_line->>'inventory_cost_treatment',
        NULLIF(resolved_line->>'landed_cost_allocation_method',''),
        (resolved_line->>'net_value_account_id')::uuid,
        CASE WHEN resolved_line->>'line_kind'='product' THEN 'purchase_of_goods' END,
        'eligible',(calculated_line->>'cgst_rate')::numeric,
        (calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,
        (calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,
        (calculated_line->>'cess_amount')::numeric,(calculated_line->>'line_total')::numeric);
      IF resolved_line->>'line_kind'='product' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'receipt_allocations') LOOP
          INSERT INTO procurement.supplier_invoice_receipt_allocations(org_id,id,supplier_invoice_line_id,goods_receipt_line_id,
            allocated_base_billed_quantity,allocated_base_free_quantity)
          VALUES(organization_id,(allocation->>'allocation_id')::uuid,(resolved_line->>'line_id')::uuid,
            (allocation->>'goods_receipt_line_id')::uuid,(allocation->>'allocated_base_billed_quantity')::numeric,
            (allocation->>'allocated_base_free_quantity')::numeric);
        END LOOP;
      END IF;
    END LOOP;
    PERFORM erp_commercial_commands.assert_supplier_invoice_artifact(organization_id,supplier_invoice_id,input_document,output_document);
    aggregate_hash:="{SCHEMA}"."aggregate_version_hash"('supplier_invoice',supplier_invoice_id,1);
    PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'procurement.supplier_invoice.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,supplier_invoice_id,requested_total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
      'procurement.supplier_invoice.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
    IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier-invoice prepare replay reached completed execution'; END IF;
    PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,
      'procurement.supplier_invoice.post','supplier_invoice',supplier_invoice_id,1,request_id,command_id,claim_id,
      extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,output_document->>'engine_version',
      output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            calculator=True,
        ),
    ]


def _sales_invoice_prepare_definition() -> list[str]:
    statements = _function(
        '"resolve_sales_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, invoice_id uuid, request_document jsonb)',
        "jsonb",
        '''
DECLARE
    branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
    customer_account_id uuid:=NULLIF(request_document->>'customer_account_id','')::uuid;
    delivery_address_id uuid:=NULLIF(request_document->>'delivery_address_id','')::uuid;
    delivery_address_row_version bigint:=NULLIF(request_document->>'delivery_address_row_version','')::bigint;
    from_location_id uuid:=NULLIF(request_document->>'from_location_id','')::uuid;
    invoice_date date:=NULLIF(request_document->>'invoice_date','')::date;
    place_of_supply text;
    zero_mode text:=request_document->>'zero_rated_payment_mode';
    logistics jsonb:=request_document->'logistics';
    transport_mode text:=logistics->>'transport_mode';
    transporter_party_id uuid:=NULLIF(logistics->>'transporter_party_id','')::uuid;
    has_direct boolean;
    has_allocated boolean;
    supply_type text;
    branch core.branches%ROWTYPE;
    organization core.organizations%ROWTYPE;
    customer parties.customer_accounts%ROWTYPE;
    customer_party parties.parties%ROWTYPE;
    customer_registration parties.tax_registrations%ROWTYPE;
    seller_registration tax.registrations%ROWTYPE;
    seller_registration_branch tax.registration_branches%ROWTYPE;
    billing parties.addresses%ROWTYPE;
    shipping parties.addresses%ROWTYPE;
    location inventory.locations%ROWTYPE;
    transporter parties.parties%ROWTYPE;
    transporter_registration parties.tax_registrations%ROWTYPE;
    revenue_account finance.accounts%ROWTYPE;
    product catalog.products%ROWTYPE;
    conversion catalog.uom_conversions%ROWTYPE;
    tax_version tax.tax_code_versions%ROWTYPE;
    tax_release core.reference_data_releases%ROWTYPE;
    profile catalog.commercial_charge_tax_profiles%ROWTYPE;
    batch inventory.batches%ROWTYPE;
    balance inventory.stock_balances%ROWTYPE;
    dispatch_line sales.dispatch_lines%ROWTYPE;
    dispatch_header sales.dispatches%ROWTYPE;
    order_line sales.order_lines%ROWTYPE;
    eligible record;
    requested_line jsonb;
    requested_allocation jsonb;
    resolved_line jsonb;
    resolved_lines jsonb:='[]'::jsonb;
    resolved_allocations jsonb;
    source_versions jsonb:='[]'::jsonb;
    allocation_tracker jsonb:='{}'::jsonb;
    dispatch_tracker jsonb:='{}'::jsonb;
    auto_allocations jsonb;
    allocation_mode text;
    billed numeric(20,6);
    free numeric(20,6);
    base_billed numeric(20,6);
    base_free numeric(20,6);
    allocated_billed numeric(20,6);
    allocated_free numeric(20,6);
    allocation_billed numeric(20,6);
    allocation_free numeric(20,6);
    prior_base numeric(20,6);
    prior_value numeric(20,2);
    current_quantity numeric(20,6);
    current_value numeric(20,2);
    current_unit_cost numeric(20,4);
    extended_cost numeric(20,2);
    existing_billed numeric(20,6);
    existing_free numeric(20,6);
    remaining_billed numeric(20,6);
    remaining_free numeric(20,6);
    candidate_billed numeric(20,6);
    candidate_free numeric(20,6);
    available_entered numeric(20,6);
    total_base numeric(20,6):=0;
    total_value numeric(20,2):=0;
    line_number integer:=0;
    registration_count integer;
    address_count integer;
    bad_count integer;
    ruleset_version text;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
       OR application_user_id IS NULL OR grant_id IS NULL OR invoice_id IS NULL
       OR branch_id IS NULL OR customer_account_id IS NULL OR invoice_date IS NULL
       OR delivery_address_id IS NULL OR delivery_address_row_version IS NULL
       OR delivery_address_row_version<1 OR request_document?'place_of_supply_state_code'
       OR request_document?'shipping_address_id'
       OR request_document->>'tax_charge_mechanism'<>'normal'
       OR zero_mode NOT IN ('not_applicable','with_igst')
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
       OR pg_catalog.jsonb_typeof(COALESCE(request_document->'charge_lines','[]'::jsonb))<>'array' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-invoice resolve input is incomplete or outside the pilot legal scope';
    END IF;
    has_direct:=EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
       WHERE line.value->>'fulfillment_source'='direct_issue');
    has_allocated:=EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
       WHERE line.value->>'fulfillment_source'='dispatch_allocated');
    IF EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
       WHERE line.value->>'fulfillment_source' NOT IN ('direct_issue','dispatch_allocated'))
       OR (has_direct AND (from_location_id IS NULL OR pg_catalog.jsonb_typeof(logistics)<>'object'))
       OR (NOT has_direct AND (from_location_id IS NOT NULL OR logistics IS NOT NULL)) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice fulfillment source, location, and logistics shape differ';
    END IF;
    IF has_direct THEN
      IF transport_mode NOT IN ('road','rail','air','ship','multimodal','in_person')
         OR NULLIF(logistics->>'distance_km','')::numeric<0
         OR (transport_mode='road' AND (NULLIF(logistics->>'vehicle_number','') IS NULL
             OR logistics->>'vehicle_type' NOT IN ('regular','over_dimensional_cargo')))
         OR (transport_mode<>'road' AND (NULLIF(logistics->>'vehicle_number','') IS NOT NULL
             OR NULLIF(logistics->>'vehicle_type','') IS NOT NULL))
         OR (transport_mode IN ('rail','air','ship','multimodal') AND
             (NULLIF(logistics->>'transport_document_number','') IS NULL
              OR NULLIF(logistics->>'transport_document_date','')::date IS NULL))
         OR ((NULLIF(logistics->>'transport_document_number','') IS NULL) IS DISTINCT FROM
             (NULLIF(logistics->>'transport_document_date','') IS NULL))
         OR (transport_mode='in_person' AND
             (transporter_party_id IS NOT NULL OR NULLIF(logistics->>'transport_document_number','') IS NOT NULL))
         OR (transport_mode<>'in_person' AND transporter_party_id IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice logistics fields do not match the selected transport mode';
      END IF;
    END IF;
    PERFORM 1
      FROM core.memberships membership
      JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id
       AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id
       AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id
       AND membership.user_id=application_user_id AND membership.status='active'
       AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND grant_row.id=grant_id
       AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
       AND capability.capability_code='sales.invoice.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-invoice delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-invoice verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.invoice.create',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.invoice.post',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
       OR (has_direct AND erp_security.has_permission('inventory.document.post',branch_id) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-invoice cross-domain permission is inactive'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' FOR SHARE;
    IF organization.country_code<>'IN' OR organization.base_currency<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='sales-invoice pilot supports only Indian INR organizations'; END IF;
    SELECT * INTO STRICT branch FROM core.branches
     WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
    SELECT count(*) INTO registration_count FROM tax.registration_branches association
      JOIN tax.registrations registration ON registration.org_id=association.org_id
       AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id
       AND association.status='active' AND association.effective_from<=invoice_date
       AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.status='active'
       AND registration.effective_from<=invoice_date
       AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date);
    IF registration_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='seller has no exact effective branch-state GST registration'; END IF;
    SELECT registration.* INTO STRICT seller_registration FROM tax.registration_branches association
      JOIN tax.registrations registration ON registration.org_id=association.org_id
       AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id
       AND association.status='active' AND association.effective_from<=invoice_date
       AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.status='active'
       AND registration.effective_from<=invoice_date
       AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date)
     FOR SHARE OF association,registration;
    SELECT * INTO STRICT seller_registration_branch FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=seller_registration.id
       AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date
       AND (association.effective_to IS NULL OR association.effective_to>=invoice_date) FOR SHARE;
    IF seller_registration.registration_type<>'regular' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='pilot invoice posting requires a regular seller GST registration'; END IF;
    SELECT * INTO STRICT customer FROM parties.customer_accounts
     WHERE org_id=organization_id AND id=customer_account_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT customer_party FROM parties.parties
     WHERE org_id=organization_id AND id=customer.party_id AND status='active' FOR SHARE;
    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=customer.party_id AND address_kind='billing'
       AND is_primary AND status='active' AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date);
    IF address_count>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer billing address is ambiguous';
    ELSIF address_count=1 THEN
      SELECT * INTO STRICT billing FROM parties.addresses WHERE org_id=organization_id AND party_id=customer.party_id
       AND address_kind='billing' AND is_primary AND status='active' AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    ELSE
      SELECT * INTO STRICT billing FROM parties.addresses WHERE org_id=organization_id AND party_id=customer.party_id
       AND address_kind='registered' AND is_primary AND status='active' AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    END IF;
    SELECT * INTO STRICT shipping FROM parties.addresses
     WHERE org_id=organization_id AND id=delivery_address_id
       AND party_id=customer.party_id
       AND address_kind IN ('registered','billing','shipping') AND status='active'
       AND row_version=delivery_address_row_version
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date)
     FOR SHARE;
    place_of_supply:=shipping.state_code;
    IF billing.country_code<>'IN' OR shipping.country_code<>'IN' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='export sales invoices remain fail-closed in the pilot'; END IF;
    SELECT count(*) INTO registration_count FROM parties.tax_registrations
     WHERE org_id=organization_id AND party_id=customer.party_id AND registration_type='GSTIN'
       AND state_code=place_of_supply
       AND status='active' AND (valid_from IS NULL OR valid_from<=invoice_date)
       AND (valid_until IS NULL OR valid_until>=invoice_date);
    IF registration_count>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer GST registration is ambiguous';
    ELSIF registration_count=1 THEN
      SELECT * INTO STRICT customer_registration FROM parties.tax_registrations
       WHERE org_id=organization_id AND party_id=customer.party_id AND registration_type='GSTIN'
         AND state_code=place_of_supply
         AND status='active' AND (valid_from IS NULL OR valid_from<=invoice_date)
         AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    END IF;
    supply_type:=CASE WHEN registration_count=1 AND customer_registration.taxpayer_type IN ('sez_unit','sez_developer')
      THEN 'sez' WHEN seller_registration.state_code=place_of_supply THEN 'intra_state' ELSE 'inter_state' END;
    IF place_of_supply<>shipping.state_code
       OR (supply_type='sez' AND (zero_mode<>'with_igst' OR customer_registration.state_code<>place_of_supply))
       OR (supply_type<>'sez' AND zero_mode<>'not_applicable') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='place of supply or zero-rated mode lacks exact supported legal evidence'; END IF;
     SELECT * INTO STRICT revenue_account FROM finance.accounts AS resolved_revenue_account
      WHERE resolved_revenue_account.org_id=organization_id
        AND resolved_revenue_account.id=erp_commercial_commands.resolve_role_account(
          organization_id,branch_id,'sales_revenue','income','INR',false) FOR SHARE;
    IF has_direct THEN
      SELECT * INTO STRICT location FROM inventory.locations
       WHERE org_id=organization_id AND id=from_location_id AND branch_id=branch_id
         AND status='active' AND allows_sale FOR SHARE;
      IF branch.postal_code!~'^[0-9]{6}$' OR shipping.postal_code!~'^[0-9]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct invoice requires exact Indian origin and destination pincodes'; END IF;
      IF transporter_party_id IS NOT NULL THEN
        SELECT * INTO STRICT transporter FROM parties.parties
         WHERE org_id=organization_id AND id=transporter_party_id AND status='active' FOR SHARE;
        SELECT count(*) INTO registration_count FROM parties.tax_registrations
         WHERE org_id=organization_id AND party_id=transporter.id AND registration_type='GSTIN'
           AND status='active' AND (valid_from IS NULL OR valid_from<=invoice_date)
           AND (valid_until IS NULL OR valid_until>=invoice_date);
        IF registration_count>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='transporter GST registration is ambiguous';
        ELSIF registration_count=1 THEN
          SELECT * INTO STRICT transporter_registration FROM parties.tax_registrations
           WHERE org_id=organization_id AND party_id=transporter.id AND registration_type='GSTIN'
             AND status='active' AND (valid_from IS NULL OR valid_from<=invoice_date)
             AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
        END IF;
      END IF;
    END IF;
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','seller_tax_registration','id',seller_registration.id,'row_version',seller_registration.row_version,'effective_from',seller_registration.effective_from,'effective_to',seller_registration.effective_to),
      pg_catalog.jsonb_build_object('resource_type','seller_registration_branch','registration_id',seller_registration_branch.registration_id,'branch_id',seller_registration_branch.branch_id,'status',seller_registration_branch.status,'effective_from',seller_registration_branch.effective_from,'effective_to',seller_registration_branch.effective_to),
      pg_catalog.jsonb_build_object('resource_type','customer_account','id',customer.id,'row_version',customer.row_version),
      pg_catalog.jsonb_build_object('resource_type','customer_party','id',customer_party.id,'row_version',customer_party.row_version),
      pg_catalog.jsonb_build_object('resource_type','billing_address','id',billing.id,'row_version',billing.row_version,'valid_from',billing.valid_from,'valid_until',billing.valid_until),
      pg_catalog.jsonb_build_object('resource_type','shipping_address','id',shipping.id,'row_version',shipping.row_version,'valid_from',shipping.valid_from,'valid_until',shipping.valid_until),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','sales_revenue','id',revenue_account.id,'row_version',revenue_account.row_version)
    );
    IF customer_registration.id IS NOT NULL THEN
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','customer_tax_registration','id',customer_registration.id,'row_version',customer_registration.row_version,
        'taxpayer_type',customer_registration.taxpayer_type,'valid_from',customer_registration.valid_from,'valid_until',customer_registration.valid_until));
    END IF;
    IF has_direct THEN
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','inventory_location','id',location.id,'row_version',location.row_version,'allows_sale',location.allows_sale));
      IF transporter.id IS NOT NULL THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','transporter_party','id',transporter.id,'row_version',transporter.row_version)); END IF;
      IF transporter_registration.id IS NOT NULL THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','transporter_gstin','id',transporter_registration.id,'row_version',transporter_registration.row_version,'registration_number',transporter_registration.registration_number)); END IF;
    END IF;

    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      billed:=NULLIF(requested_line->>'billed_quantity','')::numeric;
      free:=NULLIF(requested_line->>'free_quantity','')::numeric;
      IF billed<0 OR free<0 OR billed+free<=0 OR NULLIF(requested_line->>'line_id','')::uuid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice product line quantities are invalid'; END IF;
      SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
       AND id=NULLIF(requested_line->>'product_id','')::uuid AND status='active' FOR SHARE;
      SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
       AND id=NULLIF(requested_line->>'uom_conversion_id','')::uuid AND product_id=product.id
       AND status='active' AND to_uom_code=product.base_uom_code AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE code=product.hsn_code
       AND code_kind='hsn' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice tax lines resolve to different ruleset versions'; END IF;
      base_billed:=pg_catalog.round(billed*conversion.multiplier,6);
      base_free:=pg_catalog.round(free*conversion.multiplier,6);
      resolved_allocations:='[]'::jsonb; allocated_billed:=0; allocated_free:=0;
      order_line.id:=NULL;
      IF requested_line->>'fulfillment_source'='direct_issue' THEN
        allocation_mode:=COALESCE(NULLIF(requested_line->>'batch_allocation_mode',''),
          CASE WHEN requested_line->'batch_allocations' IS NULL THEN 'auto_fefo' ELSE 'explicit_fefo' END);
        IF allocation_mode NOT IN ('auto_fefo','explicit_fefo') THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='direct invoice batch allocation mode is invalid';
        END IF;
        source_versions:=source_versions||pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('resource_type','invoice_batch_allocation_policy',
            'invoice_line_id',requested_line->>'line_id','mode',allocation_mode,
            'algorithm_version','sales_invoice_auto_fefo_v1','later_expiry_override_supported',false));
        IF allocation_mode='auto_fefo' THEN
          IF requested_line->'dispatch_allocations' IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='automatic FEFO invoice line cannot carry dispatch allocations'; END IF;
          auto_allocations:='[]'::jsonb;
          remaining_billed:=billed;
          remaining_free:=free;
          FOR eligible IN
            SELECT batch_row.id AS batch_id,batch_row.batch_number,batch_row.expires_on,
                   stock.on_hand_quantity-
                     coalesce((allocation_tracker#>>ARRAY[batch_row.id::text,'base_quantity'])::numeric,0)
                     AS on_hand_quantity
              FROM inventory.stock_balances stock
              JOIN inventory.batches batch_row ON batch_row.org_id=stock.org_id
               AND batch_row.id=stock.batch_id
             WHERE stock.org_id=organization_id AND stock.location_id=location.id
               AND stock.product_id=product.id
               AND stock.on_hand_quantity-
                     coalesce((allocation_tracker#>>ARRAY[batch_row.id::text,'base_quantity'])::numeric,0)>0
               AND batch_row.lot_kind='manufacturer_batch' AND batch_row.status='released'
               AND batch_row.released_at IS NOT NULL AND batch_row.expires_on IS NOT NULL
               AND invoice_date<batch_row.expires_on
             ORDER BY batch_row.expires_on,batch_row.batch_number,batch_row.id
             FOR SHARE OF stock,batch_row
          LOOP
            available_entered:=pg_catalog.trunc(eligible.on_hand_quantity/conversion.multiplier,6);
            candidate_billed:=LEAST(remaining_billed,available_entered);
            available_entered:=available_entered-candidate_billed;
            candidate_free:=LEAST(remaining_free,available_entered);
            IF candidate_billed+candidate_free>0 THEN
              auto_allocations:=auto_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
                'batch_id',eligible.batch_id,'billed_quantity',candidate_billed::text,
                'free_quantity',candidate_free::text));
              remaining_billed:=remaining_billed-candidate_billed;
              remaining_free:=remaining_free-candidate_free;
            END IF;
            EXIT WHEN remaining_billed=0 AND remaining_free=0;
          END LOOP;
          IF remaining_billed<>0 OR remaining_free<>0 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='automatic FEFO allocation cannot satisfy locked stock'; END IF;
          IF requested_line->'batch_allocations' IS NULL THEN
            requested_line:=pg_catalog.jsonb_set(requested_line,'{batch_allocations}',auto_allocations,true);
          ELSIF pg_catalog.jsonb_typeof(requested_line->'batch_allocations')<>'array'
             OR pg_catalog.jsonb_array_length(requested_line->'batch_allocations')<>pg_catalog.jsonb_array_length(auto_allocations)
             OR EXISTS (
               WITH expected AS (
                 SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(auto_allocations) WITH ORDINALITY item(value,ordinality)
               ), supplied AS (
                 SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') WITH ORDINALITY item(value,ordinality)
               )
               SELECT 1 FROM expected FULL JOIN supplied USING(ordinality)
                WHERE ROW(expected.value->>'batch_id',expected.value->>'billed_quantity',expected.value->>'free_quantity')
                  IS DISTINCT FROM ROW(supplied.value->>'batch_id',supplied.value->>'billed_quantity',supplied.value->>'free_quantity')
             ) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='automatic FEFO allocation changed before persistence';
          END IF;
        END IF;
        IF pg_catalog.jsonb_typeof(requested_line->'batch_allocations')<>'array'
           OR pg_catalog.jsonb_array_length(requested_line->'batch_allocations')<1
           OR requested_line->'dispatch_allocations' IS NOT NULL
           OR (SELECT count(DISTINCT value->>'batch_id') FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations'))
              <>pg_catalog.jsonb_array_length(requested_line->'batch_allocations') THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='direct invoice batch allocations are invalid'; END IF;
        FOR requested_allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') LOOP
          allocation_billed:=NULLIF(requested_allocation->>'billed_quantity','')::numeric;
          allocation_free:=NULLIF(requested_allocation->>'free_quantity','')::numeric;
          IF allocation_billed<0 OR allocation_free<0 OR allocation_billed+allocation_free<=0
             OR (allocation_mode='explicit_fefo'
                 AND NULLIF(requested_allocation->>'inventory_line_id','')::uuid IS NULL) THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='direct invoice batch allocation is invalid'; END IF;
          SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id
           AND id=NULLIF(requested_allocation->>'batch_id','')::uuid AND product_id=product.id
           AND lot_kind='manufacturer_batch' AND status='released' AND released_at IS NOT NULL
           AND expires_on IS NOT NULL AND invoice_date<expires_on FOR SHARE;
          SELECT * INTO STRICT balance FROM inventory.stock_balances WHERE org_id=organization_id
           AND location_id=location.id AND product_id=product.id AND batch_id=batch.id FOR SHARE;
          prior_base:=coalesce((allocation_tracker#>>ARRAY[batch.id::text,'base_quantity'])::numeric,0);
          prior_value:=coalesce((allocation_tracker#>>ARRAY[batch.id::text,'issued_value'])::numeric,0);
          current_quantity:=balance.on_hand_quantity-prior_base;
          current_value:=balance.inventory_value-prior_value;
          current_unit_cost:=CASE WHEN current_quantity=0 THEN 0 ELSE pg_catalog.round(current_value/current_quantity,4) END;
          IF pg_catalog.round((allocation_billed+allocation_free)*conversion.multiplier,6)>current_quantity THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct invoice batch allocation exceeds locked stock'; END IF;
          extended_cost:=CASE WHEN pg_catalog.round((allocation_billed+allocation_free)*conversion.multiplier,6)=current_quantity
            THEN current_value ELSE pg_catalog.round(pg_catalog.round((allocation_billed+allocation_free)*conversion.multiplier,6)*current_unit_cost,2) END;
          allocation_tracker:=pg_catalog.jsonb_set(allocation_tracker,ARRAY[batch.id::text],pg_catalog.jsonb_build_object(
            'base_quantity',(prior_base+pg_catalog.round((allocation_billed+allocation_free)*conversion.multiplier,6))::text,
            'issued_value',(prior_value+extended_cost)::text),true);
          line_number:=line_number+1;
          resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'line_number',line_number,'inventory_line_id',requested_allocation->>'inventory_line_id','batch_id',batch.id,
            'batch_number',batch.batch_number,'batch_row_version',batch.row_version,'expires_on',batch.expires_on,
            'billed_quantity',allocation_billed::text,'free_quantity',allocation_free::text,
            'base_billed_quantity',pg_catalog.round(allocation_billed*conversion.multiplier,6)::text,
            'base_free_quantity',pg_catalog.round(allocation_free*conversion.multiplier,6)::text,
            'stock_balance_row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,
            'inventory_value',balance.inventory_value::text,'unit_cost',current_unit_cost::text,'extended_cost',extended_cost::text));
          source_versions:=source_versions||pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('resource_type','manufacturer_batch','id',batch.id,'row_version',batch.row_version,'product_id',batch.product_id,'expires_on',batch.expires_on,'status',batch.status),
            pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',balance.location_id,'product_id',balance.product_id,'batch_id',balance.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,'average_unit_cost',balance.average_unit_cost::text));
          allocated_billed:=allocated_billed+allocation_billed; allocated_free:=allocated_free+allocation_free;
          total_base:=total_base+pg_catalog.round((allocation_billed+allocation_free)*conversion.multiplier,6);
          total_value:=total_value+extended_cost;
        END LOOP;
        IF allocated_billed IS DISTINCT FROM billed OR allocated_free IS DISTINCT FROM free THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct invoice batches do not reconcile billed and free quantities separately'; END IF;
      ELSE
        IF pg_catalog.jsonb_typeof(requested_line->'dispatch_allocations')<>'array'
           OR pg_catalog.jsonb_array_length(requested_line->'dispatch_allocations')<1
           OR requested_line->'batch_allocations' IS NOT NULL
           OR (SELECT count(DISTINCT value->>'dispatch_line_id') FROM pg_catalog.jsonb_array_elements(requested_line->'dispatch_allocations'))
              <>pg_catalog.jsonb_array_length(requested_line->'dispatch_allocations') THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice dispatch allocations are invalid'; END IF;
        FOR requested_allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'dispatch_allocations') LOOP
          allocation_billed:=NULLIF(requested_allocation->>'allocated_base_billed_quantity','')::numeric;
          allocation_free:=NULLIF(requested_allocation->>'allocated_base_free_quantity','')::numeric;
          IF allocation_billed<0 OR allocation_free<0 OR allocation_billed+allocation_free<=0
             OR NULLIF(requested_allocation->>'invoice_dispatch_allocation_id','')::uuid IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice dispatch allocation quantity is invalid'; END IF;
          SELECT * INTO STRICT dispatch_line FROM sales.dispatch_lines WHERE org_id=organization_id
           AND id=NULLIF(requested_allocation->>'dispatch_line_id','')::uuid FOR SHARE;
          SELECT * INTO STRICT dispatch_header FROM sales.dispatches WHERE org_id=organization_id
           AND id=dispatch_line.dispatch_id AND status='posted' AND branch_id=branch_id
           AND customer_account_id=customer.id AND shipping_address_id=shipping.id FOR SHARE;
          IF order_line.id IS NULL THEN
            SELECT * INTO STRICT order_line FROM sales.order_lines WHERE org_id=organization_id
             AND id=dispatch_line.order_line_id AND line_kind='product' FOR SHARE;
          ELSIF order_line.id IS DISTINCT FROM dispatch_line.order_line_id THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='one invoice line cannot combine different approved order lines'; END IF;
          IF ROW(dispatch_line.product_id,order_line.product_id,order_line.uom_code,order_line.uom_conversion_factor,
                 order_line.quoted_unit_rate,order_line.price_basis,order_line.free_supply_tax_treatment,order_line.tax_code_version_id)
             IS DISTINCT FROM ROW(product.id,product.id,conversion.from_uom_code,conversion.multiplier,
                 (requested_line->>'quoted_unit_rate')::numeric,requested_line->>'price_basis',
                 requested_line->>'free_supply_tax_treatment',tax_version.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch invoice terms differ from the approved source order line'; END IF;
          SELECT coalesce(sum(allocation.allocated_base_billed_quantity),0),coalesce(sum(allocation.allocated_base_free_quantity),0)
            INTO existing_billed,existing_free FROM sales.invoice_dispatch_allocations allocation
            JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.invoice_line_id
           WHERE allocation.org_id=organization_id AND allocation.dispatch_line_id=dispatch_line.id
             AND invoice_line.invoice_id<>invoice_id;
          prior_base:=coalesce((dispatch_tracker#>>ARRAY[dispatch_line.id::text,'billed'])::numeric,0);
          prior_value:=coalesce((dispatch_tracker#>>ARRAY[dispatch_line.id::text,'free'])::numeric,0);
          IF existing_billed+prior_base+allocation_billed>dispatch_line.base_billed_quantity
             OR existing_free+prior_value+allocation_free>dispatch_line.base_free_quantity THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice exceeds separate dispatch billed or free ceiling'; END IF;
          dispatch_tracker:=pg_catalog.jsonb_set(dispatch_tracker,ARRAY[dispatch_line.id::text],
            pg_catalog.jsonb_build_object('billed',(prior_base+allocation_billed)::text,'free',(prior_value+allocation_free)::text),true);
          IF (SELECT count(*) FROM (
            SELECT 1 FROM inventory.inventory_document_lines issue_line
            JOIN inventory.inventory_documents issue ON issue.org_id=issue_line.org_id
             AND issue.id=issue_line.inventory_document_id AND issue.sales_dispatch_id=dispatch_header.id
             AND issue.status='posted' AND issue.document_type='sales_issue'
            JOIN finance.accounting_events valuation ON valuation.org_id=issue.org_id
             AND valuation.inventory_document_id=issue.id AND valuation.event_type='inventory_valuation'
           WHERE issue_line.org_id=organization_id AND issue_line.sales_dispatch_line_id=dispatch_line.id
             AND ROW(issue_line.product_id,issue_line.batch_id,issue_line.uom_code)
                 IS NOT DISTINCT FROM ROW(dispatch_line.product_id,dispatch_line.batch_id,dispatch_line.uom_code)
          ) posted_lineage)<>1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch invoice allocation lacks posted stock and valuation lineage'; END IF;
          line_number:=line_number+1;
          resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'line_number',line_number,'invoice_dispatch_allocation_id',requested_allocation->>'invoice_dispatch_allocation_id',
            'dispatch_line_id',dispatch_line.id,'dispatch_id',dispatch_header.id,'order_line_id',order_line.id,
            'allocated_base_billed_quantity',allocation_billed::text,'allocated_base_free_quantity',allocation_free::text));
          source_versions:=source_versions||pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('resource_type','sales_dispatch','id',dispatch_header.id,'row_version',dispatch_header.row_version,'status',dispatch_header.status),
            pg_catalog.jsonb_build_object('resource_type','sales_dispatch_line','id',dispatch_line.id,'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.to_jsonb(dispatch_line)::text,'UTF8'),'sha256'),'hex')),
            pg_catalog.jsonb_build_object('resource_type','sales_order_line','id',order_line.id,'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.to_jsonb(order_line)::text,'UTF8'),'sha256'),'hex')));
          allocated_billed:=allocated_billed+allocation_billed; allocated_free:=allocated_free+allocation_free;
        END LOOP;
        IF allocated_billed IS DISTINCT FROM base_billed OR allocated_free IS DISTINCT FROM base_free THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice dispatch allocations do not reconcile base billed and free quantities separately'; END IF;
      END IF;
      resolved_line:=pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','product',
        'line_id',requested_line->>'line_id','product_id',product.id,'product_row_version',product.row_version,
        'hsn_code',product.hsn_code,'uom_conversion_id',conversion.id,'uom_code',conversion.from_uom_code,
        'to_uom_code',conversion.to_uom_code,'multiplier',conversion.multiplier::text,
        'uom_valid_from',conversion.valid_from,'uom_valid_until',conversion.valid_until,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
        'taxability',CASE WHEN supply_type='sez' THEN 'zero_rated' ELSE tax_version.taxability END,
        'gst_rate',CASE WHEN supply_type='sez' OR tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
        'cess_rate',CASE WHEN supply_type<>'sez' AND tax_version.taxability='taxable' THEN tax_version.cess_rate::text ELSE '0' END,
        'ruleset_version',tax_version.ruleset_version,'revenue_account_id',revenue_account.id,
        'order_line_id',order_line.id,'fulfillment_source',requested_line->>'fulfillment_source',
        'batch_allocation_mode',CASE WHEN requested_line->>'fulfillment_source'='direct_issue' THEN allocation_mode END,
        CASE WHEN requested_line->>'fulfillment_source'='direct_issue' THEN 'batch_allocations' ELSE 'dispatch_allocations' END,
        resolved_allocations,'input',requested_line);
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(resolved_line);
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version,
          'uom_conversion_id',conversion.id,'uom_valid_from',conversion.valid_from,'uom_valid_until',conversion.valid_until,
          'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
          'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
          'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'charge_lines','[]'::jsonb)) LOOP
      SELECT * INTO STRICT profile FROM catalog.commercial_charge_tax_profiles WHERE org_id=organization_id
       AND direction='sales' AND charge_code=requested_line->>'charge_code' AND status='active'
       AND effective_from<=invoice_date AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE id=profile.tax_code_version_id
       AND code_kind='sac' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice charge resolves to a different ruleset version'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','charge','line_id',requested_line->>'line_id',
        'charge_code',profile.charge_code,'charge_tax_profile_id',profile.id,'charge_tax_profile_row_version',profile.row_version,
        'charge_tax_profile_effective_from',profile.effective_from,'charge_tax_profile_effective_to',profile.effective_to,
        'sac_code',tax_version.code,'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
        'taxability',CASE WHEN supply_type='sez' THEN 'zero_rated' ELSE tax_version.taxability END,
        'gst_rate',CASE WHEN supply_type='sez' OR tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
        'cess_rate',CASE WHEN supply_type<>'sez' AND tax_version.taxability='taxable' THEN tax_version.cess_rate::text ELSE '0' END,
        'ruleset_version',tax_version.ruleset_version,'revenue_account_id',revenue_account.id,'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','commercial_charge_tax_profile','id',profile.id,'row_version',profile.row_version,
        'charge_code',profile.charge_code,'effective_from',profile.effective_from,'effective_to',profile.effective_to,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
        'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
        'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    IF ruleset_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice has no effective tax ruleset'; END IF;
    IF has_direct THEN
      WITH requested AS (
        SELECT (line.value->>'product_id')::uuid product_id,(allocation.value->>'batch_id')::uuid batch_id,
          sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+(allocation.value->>'free_quantity')::numeric)*requested_conversion.multiplier,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        JOIN catalog.uom_conversions requested_conversion
          ON requested_conversion.org_id=organization_id
         AND requested_conversion.id=(line.value->>'uom_conversion_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(line.value->'batch_allocations','[]'::jsonb)) allocation(value)
        WHERE line.value->>'fulfillment_source'='direct_issue'
        GROUP BY (line.value->>'product_id')::uuid,(allocation.value->>'batch_id')::uuid
      ), totals AS (SELECT product_id,sum(requested_base) requested_base FROM requested GROUP BY product_id),
      /* sales_invoice_fefo_expiry_date_equivalence_v3 */
      eligible_lots AS (
        SELECT stock.product_id,stock.batch_id,stock.on_hand_quantity,batch_row.expires_on
        FROM inventory.stock_balances stock JOIN inventory.batches batch_row ON batch_row.org_id=stock.org_id AND batch_row.id=stock.batch_id
        JOIN totals ON totals.product_id=stock.product_id WHERE stock.org_id=organization_id AND stock.location_id=from_location_id
          AND stock.on_hand_quantity>0 AND batch_row.lot_kind='manufacturer_batch' AND batch_row.status='released'
          AND batch_row.released_at IS NOT NULL AND batch_row.expires_on IS NOT NULL AND invoice_date<batch_row.expires_on),
      expiry_groups AS (
        SELECT eligible_lot.product_id,eligible_lot.expires_on,
          sum(eligible_lot.on_hand_quantity) expiry_available,
          coalesce(sum(requested.requested_base),0) expiry_requested
        FROM eligible_lots eligible_lot
        LEFT JOIN requested ON requested.product_id=eligible_lot.product_id AND requested.batch_id=eligible_lot.batch_id
        GROUP BY eligible_lot.product_id,eligible_lot.expires_on),
      fefo_eligible AS (
        SELECT expiry_group.product_id,expiry_group.expires_on,
          expiry_group.expiry_available,expiry_group.expiry_requested,
          coalesce(sum(expiry_group.expiry_available) OVER (
            PARTITION BY expiry_group.product_id ORDER BY expiry_group.expires_on
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_available
        FROM expiry_groups expiry_group)
      SELECT count(*) INTO bad_count FROM fefo_eligible JOIN totals USING(product_id)
       WHERE fefo_eligible.expiry_requested IS DISTINCT FROM
         greatest(least(totals.requested_base-fefo_eligible.prior_available,fefo_eligible.expiry_available),0);
      IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct invoice batches do not follow FEFO'; END IF;
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'branch_id',branch.id,'branch_row_version',branch.row_version,'invoice_date',invoice_date,
      'place_of_supply_state_code',place_of_supply,'supply_type',supply_type,'zero_rated_payment_mode',zero_mode,
      'tax_charge_mechanism','normal','customer_account_id',customer.id,'customer_account_row_version',customer.row_version,
      'customer_party_id',customer_party.id,'customer_party_row_version',customer_party.row_version,
      'seller_tax_registration_id',seller_registration.id,'seller_tax_registration_row_version',seller_registration.row_version,
      'customer_tax_registration_id',customer_registration.id,'customer_tax_registration_row_version',customer_registration.row_version,
      'customer_taxpayer_type',customer_registration.taxpayer_type,'billing_address_id',billing.id,'billing_address_row_version',billing.row_version,
      'shipping_address_id',shipping.id,'shipping_address_row_version',shipping.row_version,
      'revenue_account_id',revenue_account.id,'revenue_account_row_version',revenue_account.row_version,
      'from_location_id',location.id,'has_direct_issue',has_direct,'has_dispatch_allocated',has_allocated,
      'seller_legal_name',seller_registration.legal_name,'seller_gstin',seller_registration.gstin,
      'seller_address',pg_catalog.concat_ws(', ',branch.address_line1,branch.address_line2,branch.city,branch.state_code,branch.postal_code),
      'buyer_legal_name',COALESCE(customer_registration.registered_legal_name,customer_party.legal_name),'buyer_gstin',customer_registration.registration_number,
      'buyer_address',pg_catalog.concat_ws(', ',billing.line1,billing.line2,billing.city,billing.state_code,billing.postal_code),
      'origin',CASE WHEN has_direct THEN pg_catalog.jsonb_build_object('line1',branch.address_line1,'line2',branch.address_line2,'city',branch.city,'state_code',branch.state_code,'pincode',branch.postal_code) ELSE NULL END,
      'destination',CASE WHEN has_direct THEN pg_catalog.jsonb_build_object('line1',shipping.line1,'line2',shipping.line2,'city',shipping.city,'state_code',shipping.state_code,'pincode',shipping.postal_code) ELSE NULL END,
      'transport_mode',transport_mode,'distance_km',NULLIF(logistics->>'distance_km','')::numeric::text,
      'transporter_party_id',transporter.id,'transporter_name',transporter.legal_name,'transporter_gstin',transporter_registration.registration_number,
      'vehicle_number',NULLIF(logistics->>'vehicle_number',''),'vehicle_type',NULLIF(logistics->>'vehicle_type',''),
      'transport_document_number',NULLIF(logistics->>'transport_document_number',''),
      'transport_document_date',NULLIF(logistics->>'transport_document_date','')::date,
      'ruleset_version',ruleset_version,'lines',resolved_lines,
      'total_abs_base_quantity',total_base::text,'total_inventory_value',total_value::text,
      'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','outward_rcm_supported',false,
        'export_supported',false,'sez_without_payment_supported',false,'sez_evidence_registration_id',customer_registration.id),
      'source_versions',source_versions);
END
''',
        runtime=True,
        calculator=True,
    )
    statements.extend(_function(
        '"assert_sales_invoice_draft"(organization_id uuid, invoice_resource_id uuid, inventory_resource_id uuid, resolution jsonb)',
        "void",
        '''
DECLARE header sales.invoices%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        resolved_line jsonb; allocation jsonb; invoice_line sales.invoice_lines%ROWTYPE;
        inventory_line inventory.inventory_document_lines%ROWTYPE;
        dispatch_allocation sales.invoice_dispatch_allocations%ROWTYPE;
        expected_inventory integer:=0; expected_dispatch integer:=0; expected_lines integer:=0;
BEGIN
    SELECT * INTO STRICT header FROM sales.invoices
     WHERE org_id=organization_id AND id=invoice_resource_id FOR UPDATE;
    IF header.status<>'draft'
       OR ROW(header.branch_id,header.customer_account_id,header.seller_tax_registration_id,
              header.customer_tax_registration_id,header.invoice_date,header.invoice_type,header.supply_type,
              header.zero_rated_payment_mode,header.tax_charge_mechanism,header.place_of_supply_state_code,
              header.calculation_ruleset_version,header.seller_legal_name_snapshot,header.seller_gstin_snapshot,
              header.seller_address_snapshot,header.buyer_legal_name_snapshot,header.buyer_gstin_snapshot,
              header.buyer_address_snapshot,header.currency_code)
          IS DISTINCT FROM ROW((resolution->>'branch_id')::uuid,(resolution->>'customer_account_id')::uuid,
              (resolution->>'seller_tax_registration_id')::uuid,NULLIF(resolution->>'customer_tax_registration_id','')::uuid,
              (resolution->>'invoice_date')::date,'tax_invoice',resolution->>'supply_type',
              resolution->>'zero_rated_payment_mode','normal',resolution->>'place_of_supply_state_code',
              resolution->>'ruleset_version',resolution->>'seller_legal_name',resolution->>'seller_gstin',
              resolution->>'seller_address',resolution->>'buyer_legal_name',resolution->>'buyer_gstin',
              resolution->>'buyer_address','INR'::bpchar) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice draft header changed'; END IF;
    IF (resolution->>'has_direct_issue')::boolean THEN
      SELECT * INTO STRICT document FROM inventory.inventory_documents
       WHERE org_id=organization_id AND id=inventory_resource_id AND sales_invoice_id=invoice_resource_id FOR UPDATE;
      IF document.status<>'approved' OR document.document_type<>'sales_issue'
         OR ROW(document.branch_id,document.destination_branch_id,document.physical_movement_required,
                document.document_number,document.document_date,document.reason_code,document.currency_code,
                document.costing_method_snapshot,document.total_abs_base_quantity,document.total_value,
                document.origin_address_line1,document.origin_address_line2,document.origin_city,document.origin_state_code,document.origin_pincode,
                document.destination_address_line1,document.destination_address_line2,document.destination_city,document.destination_state_code,document.destination_pincode,
                document.transport_mode,document.distance_km,document.transporter_party_id,document.transporter_name_snapshot,
                document.transporter_gstin_snapshot,document.vehicle_number_snapshot,document.vehicle_type_snapshot,
                document.transport_document_number_snapshot,document.transport_document_date)
            IS DISTINCT FROM ROW(header.branch_id,NULL::uuid,true,header.invoice_number,header.invoice_date,'sales_invoice','INR'::bpchar,
                'moving_weighted_average',(resolution->>'total_abs_base_quantity')::numeric,
                (resolution->>'total_inventory_value')::numeric,resolution#>>'{origin,line1}',resolution#>>'{origin,line2}',
                resolution#>>'{origin,city}',resolution#>>'{origin,state_code}',resolution#>>'{origin,pincode}',
                resolution#>>'{destination,line1}',resolution#>>'{destination,line2}',resolution#>>'{destination,city}',
                resolution#>>'{destination,state_code}',resolution#>>'{destination,pincode}',resolution->>'transport_mode',
                (resolution->>'distance_km')::numeric,NULLIF(resolution->>'transporter_party_id','')::uuid,
                resolution->>'transporter_name',resolution->>'transporter_gstin',resolution->>'vehicle_number',
                resolution->>'vehicle_type',resolution->>'transport_document_number',
                NULLIF(resolution->>'transport_document_date','')::date) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice direct inventory draft changed'; END IF;
    ELSIF inventory_resource_id IS NOT NULL OR EXISTS(
      SELECT 1 FROM inventory.inventory_documents WHERE org_id=organization_id AND sales_invoice_id=invoice_resource_id) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='dispatch-allocated invoice cannot own inventory';
    END IF;
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolution->'lines') LOOP
      expected_lines:=expected_lines+1;
      SELECT * INTO STRICT invoice_line FROM sales.invoice_lines WHERE org_id=organization_id
       AND id=(resolved_line->>'line_id')::uuid AND invoice_id=invoice_resource_id FOR SHARE;
      IF ROW(invoice_line.line_number,invoice_line.line_kind,invoice_line.order_line_id,invoice_line.product_id,
             invoice_line.charge_code,invoice_line.uom_code,invoice_line.uom_conversion_factor,
             invoice_line.tax_classification_code_snapshot,invoice_line.tax_code_version_id,
             invoice_line.taxability_snapshot,invoice_line.revenue_account_id)
         IS DISTINCT FROM ROW((resolved_line->>'line_number')::integer,resolved_line->>'line_kind',
             NULLIF(resolved_line->>'order_line_id','')::uuid,NULLIF(resolved_line->>'product_id','')::uuid,
             resolved_line->>'charge_code',resolved_line->>'uom_code',NULLIF(resolved_line->>'multiplier','')::numeric,
             CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code' ELSE resolved_line->>'sac_code' END,
             (resolved_line->>'tax_code_version_id')::uuid,resolved_line->>'taxability',
             (resolved_line->>'revenue_account_id')::uuid) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice typed line changed'; END IF;
      IF resolved_line->>'fulfillment_source'='direct_issue' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'batch_allocations') LOOP
          expected_inventory:=expected_inventory+1;
          SELECT * INTO STRICT inventory_line FROM inventory.inventory_document_lines WHERE org_id=organization_id
           AND id=(allocation->>'inventory_line_id')::uuid AND inventory_document_id=inventory_resource_id FOR SHARE;
          IF ROW(inventory_line.line_number,inventory_line.movement_kind,inventory_line.product_id,inventory_line.batch_id,
                 inventory_line.uom_code,inventory_line.entered_quantity,inventory_line.base_quantity,
                 inventory_line.from_location_id,inventory_line.to_location_id,inventory_line.unit_cost,
                 inventory_line.extended_cost,inventory_line.sales_invoice_line_id)
             IS DISTINCT FROM ROW((allocation->>'line_number')::integer,'issue',invoice_line.product_id,
                 (allocation->>'batch_id')::uuid,invoice_line.uom_code,
                 (allocation->>'billed_quantity')::numeric+(allocation->>'free_quantity')::numeric,
                 (allocation->>'base_billed_quantity')::numeric+(allocation->>'base_free_quantity')::numeric,
                 (resolution->>'from_location_id')::uuid,NULL::uuid,(allocation->>'unit_cost')::numeric,
                 (allocation->>'extended_cost')::numeric,invoice_line.id) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice direct inventory line changed'; END IF;
        END LOOP;
      ELSIF resolved_line->>'fulfillment_source'='dispatch_allocated' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'dispatch_allocations') LOOP
          expected_dispatch:=expected_dispatch+1;
          SELECT * INTO STRICT dispatch_allocation FROM sales.invoice_dispatch_allocations WHERE org_id=organization_id
           AND id=(allocation->>'invoice_dispatch_allocation_id')::uuid AND invoice_line_id=invoice_line.id FOR SHARE;
          IF ROW(dispatch_allocation.dispatch_line_id,dispatch_allocation.allocated_base_billed_quantity,
                 dispatch_allocation.allocated_base_free_quantity)
             IS DISTINCT FROM ROW((allocation->>'dispatch_line_id')::uuid,
                 (allocation->>'allocated_base_billed_quantity')::numeric,
                 (allocation->>'allocated_base_free_quantity')::numeric) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice dispatch allocation changed'; END IF;
        END LOOP;
      END IF;
    END LOOP;
    IF expected_lines<>(SELECT count(*) FROM sales.invoice_lines WHERE org_id=organization_id AND invoice_id=invoice_resource_id)
       OR expected_dispatch<>(SELECT count(*) FROM sales.invoice_dispatch_allocations allocation
          JOIN sales.invoice_lines line ON line.org_id=allocation.org_id AND line.id=allocation.invoice_line_id
         WHERE line.org_id=organization_id AND line.invoice_id=invoice_resource_id)
       OR expected_inventory<>(SELECT count(*) FROM inventory.inventory_document_lines
         WHERE org_id=organization_id AND inventory_document_id=inventory_resource_id) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice draft cardinality changed'; END IF;
END
''',
    ))
    statements.extend(_function(
        '"persist_sales_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, invoice_id uuid, inventory_document_id uuid, command_id uuid, artifact_id uuid, request_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
        "jsonb",
        f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb;
        preview_document jsonb; input_document jsonb; output_document jsonb; totals jsonb;
        resolved_line jsonb; calculated_line jsonb; allocation jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; invoice_number text;
        fiscal_year integer; requested_total numeric(20,2); aggregate_hash bytea;
        claim_id uuid; replay_id uuid; movement_time timestamptz:=pg_catalog.transaction_timestamp();
BEGIN
    IF SESSION_USER<>'erp_calculator' OR invoice_id IS NULL OR command_id IS NULL OR artifact_id IS NULL OR request_id IS NULL
       OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_input_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_output_bytes) NOT BETWEEN 2 AND 1048576 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-invoice prepare persistence envelope is invalid'; END IF;
    BEGIN
      request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
      resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
      preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
      input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
      output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-invoice prepare requires UTF-8 JSON'; END;
    current_resolution:="{SCHEMA}"."resolve_sales_invoice_prepare"(
      organization_id,membership_id,auth_user_id,application_user_id,grant_id,caller_client_id,invoice_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document
       OR request_document->>'invoice_id' IS DISTINCT FROM invoice_id::text
       OR NULLIF(request_document->>'tax_document_id','')::uuid IS NULL
       OR NULLIF(request_document->>'journal_id','')::uuid IS NULL
       OR NULLIF(request_document->>'event_id','')::uuid IS NULL
       OR NULLIF(request_document->>'open_item_id','')::uuid IS NULL
       OR ((resolved_document->>'has_direct_issue')::boolean IS DISTINCT FROM (inventory_document_id IS NOT NULL))
       OR NULLIF(request_document->>'inventory_document_id','')::uuid IS DISTINCT FROM inventory_document_id
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
       OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
       OR preview_document->'inventory_impact' IS NULL OR preview_document->'financial_impact' IS NULL
       OR input_document->>'operation'<>'sales.invoice.post' OR input_document->>'resource_type'<>'sales_invoice'
       OR input_document->>'resource_id'<>invoice_id::text OR (input_document->>'aggregate_version')::bigint<>1
       OR output_document->>'operation'<>'sales.invoice.post' OR output_document->>'resource_type'<>'sales_invoice'
       OR output_document->>'resource_id'<>invoice_id::text OR (output_document->>'aggregate_version')::bigint<>1
       OR input_document#>>'{{document,tax_charge_mechanism}}'<>'normal'
       OR input_document#>>'{{document,zero_rated_mode}}' IS DISTINCT FROM resolved_document->>'zero_rated_payment_mode'
       OR input_document#>>'{{document,gst_type}}' IS DISTINCT FROM
          (CASE WHEN resolved_document->>'supply_type'='intra_state' THEN 'intra_state' ELSE 'inter_state' END)
       OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version'
       OR pg_catalog.jsonb_array_length(output_document->'lines')<>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-invoice resolution, legal scope, or calculation output changed'; END IF;
    SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='sales.invoice.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM invoice_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-invoice idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    totals:=output_document->'totals'; requested_total:=(totals->>'grand_total')::numeric;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'invoice_date')::date)>=4
      THEN pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer
      ELSE pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer-1 END;
    SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence
     WHERE sequence.org_id=organization_id AND sequence.branch_id=(resolved_document->>'branch_id')::uuid
       AND sequence.document_type='sales_invoice' AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
       AND sequence.status='active' FOR SHARE;
    invoice_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
    INSERT INTO sales.invoices(org_id,id,branch_id,customer_account_id,seller_tax_registration_id,customer_tax_registration_id,
      invoice_number,fiscal_year,invoice_date,due_date,invoice_type,status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
      place_of_supply_state_code,calculation_ruleset_version,document_discount_kind,document_discount_basis,document_discount_value,
      seller_legal_name_snapshot,seller_gstin_snapshot,seller_address_snapshot,buyer_legal_name_snapshot,buyer_gstin_snapshot,
      buyer_address_snapshot,currency_code,subtotal,discount_total,charges_total,net_value_total,gst_taxable_total,
      cgst_total,sgst_total,igst_total,cess_total,recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
    VALUES(organization_id,invoice_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'customer_account_id')::uuid,
      (resolved_document->>'seller_tax_registration_id')::uuid,NULLIF(resolved_document->>'customer_tax_registration_id','')::uuid,
      invoice_number,fiscal_year,(resolved_document->>'invoice_date')::date,
      (resolved_document->>'invoice_date')::date+(SELECT credit_days FROM parties.customer_accounts WHERE org_id=organization_id AND id=(resolved_document->>'customer_account_id')::uuid),
      'tax_invoice','draft',resolved_document->>'supply_type',resolved_document->>'zero_rated_payment_mode','normal',
      resolved_document->>'place_of_supply_state_code',resolved_document->>'ruleset_version',
      request_document->'document_discount'->>'document_discount_kind',request_document->'document_discount'->>'document_discount_basis',
      (request_document->'document_discount'->>'document_discount_value')::numeric,resolved_document->>'seller_legal_name',
      resolved_document->>'seller_gstin',resolved_document->>'seller_address',resolved_document->>'buyer_legal_name',
      resolved_document->>'buyer_gstin',resolved_document->>'buyer_address','INR',(totals->>'subtotal')::numeric,
      (totals->>'discount_total')::numeric,(totals->>'charges_total')::numeric,(totals->>'net_value_total')::numeric,
      (totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,
      (totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,(totals->>'recipient_assessed_tax_total')::numeric,
      request_document->>'rounding_policy',(totals->>'rounding_adjustment')::numeric,requested_total);
    IF (resolved_document->>'has_direct_issue')::boolean THEN
      INSERT INTO inventory.inventory_documents(org_id,id,branch_id,destination_branch_id,physical_movement_required,
        origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
        destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
        transport_mode,distance_km,transporter_party_id,transporter_name_snapshot,transporter_gstin_snapshot,
        vehicle_number_snapshot,vehicle_type_snapshot,transport_document_number_snapshot,transport_document_date,movement_started_at,
        document_type,document_number,fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
        total_abs_base_quantity,total_value,sales_invoice_id,approved_at,approved_by_membership_id)
      VALUES(organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,NULL,true,
        resolved_document#>>'{{origin,line1}}',resolved_document#>>'{{origin,line2}}',resolved_document#>>'{{origin,city}}',
        resolved_document#>>'{{origin,state_code}}',resolved_document#>>'{{origin,pincode}}',resolved_document#>>'{{destination,line1}}',
        resolved_document#>>'{{destination,line2}}',resolved_document#>>'{{destination,city}}',resolved_document#>>'{{destination,state_code}}',
        resolved_document#>>'{{destination,pincode}}',resolved_document->>'transport_mode',(resolved_document->>'distance_km')::numeric,
        NULLIF(resolved_document->>'transporter_party_id','')::uuid,resolved_document->>'transporter_name',resolved_document->>'transporter_gstin',
        resolved_document->>'vehicle_number',resolved_document->>'vehicle_type',resolved_document->>'transport_document_number',
        NULLIF(resolved_document->>'transport_document_date','')::date,movement_time,'sales_issue',invoice_number,fiscal_year,
        (resolved_document->>'invoice_date')::date,'approved','sales_invoice','INR','moving_weighted_average',
        (resolved_document->>'total_abs_base_quantity')::numeric,(resolved_document->>'total_inventory_value')::numeric,
        invoice_id,movement_time,membership_id);
    END IF;
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines')
       WHERE value->>'line_id'=resolved_line->>'line_id';
      INSERT INTO sales.invoice_lines(org_id,id,invoice_id,line_number,line_kind,order_line_id,product_id,charge_code,
        uom_code,uom_conversion_factor,billed_quantity,free_quantity,base_billed_quantity,base_free_quantity,
        free_supply_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,gross_amount,
        line_discount_kind,line_discount_basis,line_discount_value,document_discount_eligible,line_discount_amount,
        line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,net_value_amount,
        gst_taxable_value,tax_classification_code_snapshot,tax_code_version_id,taxability_snapshot,revenue_account_id,
        cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,line_total)
      VALUES(organization_id,(resolved_line->>'line_id')::uuid,invoice_id,(resolved_line->>'line_number')::integer,
        resolved_line->>'line_kind',NULLIF(resolved_line->>'order_line_id','')::uuid,NULLIF(resolved_line->>'product_id','')::uuid,
        resolved_line->>'charge_code',resolved_line->>'uom_code',NULLIF(resolved_line->>'multiplier','')::numeric,
        NULLIF(resolved_line->'input'->>'billed_quantity','')::numeric,NULLIF(resolved_line->'input'->>'free_quantity','')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN pg_catalog.round((resolved_line->'input'->>'billed_quantity')::numeric*(resolved_line->>'multiplier')::numeric,6) END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN pg_catalog.round((resolved_line->'input'->>'free_quantity')::numeric*(resolved_line->>'multiplier')::numeric,6) END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->>'free_supply_tax_treatment' END,
        NULLIF(resolved_line->'input'->>'quoted_unit_rate','')::numeric,resolved_line->'input'->>'price_basis','normal',
        (calculated_line->>'gross_amount')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_kind' ELSE 'none' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_basis' ELSE 'price_value' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->'line_discount'->>'line_discount_value')::numeric ELSE 0 END,
        (resolved_line->'input'->>'document_discount_eligible')::boolean,(calculated_line->>'line_discount_amount')::numeric,
        (calculated_line->>'line_taxable_discount_amount')::numeric,(calculated_line->>'document_discount_amount')::numeric,
        (calculated_line->>'document_taxable_discount_amount')::numeric,(calculated_line->>'net_value_amount')::numeric,
        (calculated_line->>'gst_taxable_value')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code' ELSE resolved_line->>'sac_code' END,
        (resolved_line->>'tax_code_version_id')::uuid,resolved_line->>'taxability',(resolved_line->>'revenue_account_id')::uuid,
        (calculated_line->>'cgst_rate')::numeric,(calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,
        (calculated_line->>'cess_rate')::numeric,(calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,
        (calculated_line->>'igst_amount')::numeric,(calculated_line->>'cess_amount')::numeric,(calculated_line->>'line_total')::numeric);
      IF resolved_line->>'fulfillment_source'='direct_issue' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'batch_allocations') LOOP
          INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
            uom_code,entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,extended_cost,sales_invoice_line_id)
          VALUES(organization_id,(allocation->>'inventory_line_id')::uuid,inventory_document_id,(allocation->>'line_number')::integer,
            'issue',(resolved_line->>'product_id')::uuid,(allocation->>'batch_id')::uuid,resolved_line->>'uom_code',
            (allocation->>'billed_quantity')::numeric+(allocation->>'free_quantity')::numeric,
            (allocation->>'base_billed_quantity')::numeric+(allocation->>'base_free_quantity')::numeric,
            (resolved_document->>'from_location_id')::uuid,NULL,(allocation->>'unit_cost')::numeric,
            (allocation->>'extended_cost')::numeric,(resolved_line->>'line_id')::uuid);
        END LOOP;
      ELSIF resolved_line->>'fulfillment_source'='dispatch_allocated' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'dispatch_allocations') LOOP
          INSERT INTO sales.invoice_dispatch_allocations(org_id,id,invoice_line_id,dispatch_line_id,
            allocated_base_billed_quantity,allocated_base_free_quantity)
          VALUES(organization_id,(allocation->>'invoice_dispatch_allocation_id')::uuid,(resolved_line->>'line_id')::uuid,
            (allocation->>'dispatch_line_id')::uuid,(allocation->>'allocated_base_billed_quantity')::numeric,
            (allocation->>'allocated_base_free_quantity')::numeric);
        END LOOP;
      END IF;
    END LOOP;
    PERFORM erp_commercial_commands.assert_sales_invoice_artifact(organization_id,invoice_id,input_document,output_document);
    PERFORM "{SCHEMA}"."assert_sales_invoice_draft"(organization_id,invoice_id,inventory_document_id,resolved_document);
    aggregate_hash:="{SCHEMA}"."aggregate_version_hash"('sales_invoice',invoice_id,1);
    PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'sales.invoice.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,invoice_id,requested_total,'INR',key_hash,
      request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,membership_id,'sales.invoice.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
    IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-invoice prepare replay reached a completed execution claim'; END IF;
    PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,
      'sales.invoice.post','sales_invoice',invoice_id,1,request_id,command_id,claim_id,
      extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,
      output_document->>'engine_version',output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
        calculator=True,
    ))
    return statements


def _request_match_definition() -> list[str]:
    operator_capabilities = _sql_text_list(sorted(BASELINE_OPERATOR_COMMANDS))
    trigger_target_case = _target_case("NEW.capability_code")
    trigger_operation_case = _operation_case("NEW.capability_code")
    prepare_target_case = _target_case("capability_name")
    prepare_operation_case = _operation_case("capability_name")
    return [
        *_function(
            '"guard_command_request_match"()',
            "trigger",
            f'''
DECLARE
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    request_document jsonb;
    preview_document jsonb;
    expected_request jsonb;
    expected_preview jsonb;
    expected_target_type text;
    expected_operation text;
    source_versions jsonb;
BEGIN
    IF NEW.status<>'prepared' OR NEW.row_version<>1
       OR NEW.execution_started_at IS NOT NULL OR NEW.completed_at IS NOT NULL
       OR NEW.response_bytes IS NOT NULL OR NEW.result_resource_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new command request must be an unexecuted prepared snapshot';
    END IF;
    SELECT * INTO grant_row FROM automation.agent_grants
     WHERE org_id=NEW.org_id AND id=NEW.agent_grant_id FOR SHARE;
    SELECT * INTO capability FROM automation.agent_grant_capabilities
     WHERE org_id=NEW.org_id AND agent_grant_id=NEW.agent_grant_id
       AND capability_code=NEW.capability_code FOR SHARE;
    IF grant_row.id IS NULL OR capability.capability_code IS NULL
       OR grant_row.status<>'active' OR grant_row.expires_at<=pg_catalog.transaction_timestamp()
       OR grant_row.subject_membership_id IS DISTINCT FROM NEW.requested_by_membership_id
       OR capability.status<>'active'
       OR NEW.operation_mode IS DISTINCT FROM capability.operation_mode
       OR NEW.risk_class IS DISTINCT FROM capability.risk_class
       OR NEW.approval_policy IS DISTINCT FROM capability.approval_policy
       OR NEW.required_approval_count<>1
       OR NEW.expires_at<=pg_catalog.transaction_timestamp()
       OR NEW.expires_at>grant_row.expires_at THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command request exceeds its active exact capability consent';
    END IF;
    IF NEW.operation='automation.agent_grant.revoke' THEN
        IF NEW.branch_id IS DISTINCT FROM grant_row.branch_id
           OR NEW.destination_branch_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='grant revocation branch scope changed';
        END IF;
    ELSIF NEW.capability_code IN ({operator_capabilities}) THEN
        IF NEW.branch_id IS NULL
           OR erp_security.can_access_branch(NEW.branch_id) IS DISTINCT FROM true
           OR (NEW.destination_branch_id IS NOT NULL
               AND erp_security.can_access_branch(NEW.destination_branch_id) IS DISTINCT FROM true)
           OR (grant_row.branch_id IS NOT NULL AND
               (NEW.branch_id IS DISTINCT FROM grant_row.branch_id
                OR NEW.destination_branch_id IS NOT NULL))
           OR (NEW.capability_code='inventory.transfer.prepare' AND
               (NEW.destination_branch_id IS NULL OR NEW.destination_branch_id=NEW.branch_id))
           OR (NEW.capability_code<>'inventory.transfer.prepare' AND NEW.destination_branch_id IS NOT NULL) THEN
            RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command branches exceed the active grant or actor access';
        END IF;
    ELSE
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='operation has no reviewed prepare boundary';
    END IF;
    IF NEW.requested_amount IS NOT NULL AND (
          capability.maximum_amount IS NULL
          OR NEW.requested_amount>capability.maximum_amount
          OR NEW.currency_code IS DISTINCT FROM capability.currency_code
       ) OR NEW.requested_amount IS NULL AND NEW.currency_code IS NOT NULL
       OR NEW.requests_sensitive_read AND NOT capability.allow_sensitive_read THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command amount, currency, or sensitive-read intent exceeds consent';
    END IF;
    IF NEW.serializer_version<>'aasopharma-pg-jsonb-v1'
       OR NEW.request_media_type<>'application/vnd.aasopharma.command+json'
       OR NEW.preview_media_type<>'application/vnd.aasopharma.command-preview+json'
       OR NEW.request_hash IS DISTINCT FROM extensions.digest(NEW.request_bytes,'sha256')
       OR NEW.preview_hash IS DISTINCT FROM extensions.digest(NEW.preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='command serializer, media type, or exact-byte hash is invalid';
    END IF;
    BEGIN
        request_document := pg_catalog.convert_from(NEW.request_bytes,'UTF8')::jsonb;
        preview_document := pg_catalog.convert_from(NEW.preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='command request and preview must be UTF-8 JSON';
    END;
    IF NEW.operation='automation.agent_grant.revoke' THEN
        IF NEW.operation_mode<>'write' OR NEW.target_resource_type<>'agent_grant'
           OR NEW.target_resource_id IS DISTINCT FROM NEW.agent_grant_id
           OR NEW.target_row_version IS DISTINCT FROM grant_row.row_version
           OR NEW.requested_amount IS NOT NULL OR NEW.currency_code IS NOT NULL
           OR NEW.requests_sensitive_read OR NEW.calculation_hash IS NOT NULL
           OR NEW.request_reason IS NULL OR pg_catalog.btrim(NEW.request_reason)='' THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='incomplete typed grant revocation';
        END IF;
        expected_request := pg_catalog.jsonb_build_object(
            'agent_grant_id',NEW.agent_grant_id,
            'branch_id',NEW.branch_id,
            'operation',NEW.operation,
            'organization_id',NEW.org_id,
            'reason',NEW.request_reason,
            'serializer_version',NEW.serializer_version,
            'target_row_version',NEW.target_row_version
        );
        expected_preview := pg_catalog.jsonb_build_object(
            'effect','revoke_agent_grant',
            'operation',NEW.operation,
            'organization_id',NEW.org_id,
            'reason',NEW.request_reason,
            'serializer_version',NEW.serializer_version,
            'target_resource_id',NEW.target_resource_id,
            'target_resource_type',NEW.target_resource_type,
            'target_row_version',NEW.target_row_version
        );
        IF request_document IS DISTINCT FROM expected_request
           OR preview_document IS DISTINCT FROM expected_preview
           OR NEW.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version
           ) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='grant revocation envelope differs from persisted facts';
        END IF;
        RETURN NEW;
    END IF;

    expected_target_type := {trigger_target_case};
    expected_operation := {trigger_operation_case};
    source_versions := preview_document->'source_versions';
    IF expected_target_type IS NULL OR expected_operation IS NULL
       OR NEW.operation IS DISTINCT FROM expected_operation OR NEW.operation_mode<>'write'
       OR NEW.target_resource_type IS DISTINCT FROM expected_target_type
       OR NEW.target_row_version<>1 OR NEW.requests_sensitive_read
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(preview_document)<>'object'
       OR pg_catalog.jsonb_typeof(source_versions)<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'resolved_references')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'calculation_ruleset')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'inventory_impact')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'financial_impact')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'tax_impact')<>'array'
       OR preview_document->>'command_request_id' IS DISTINCT FROM NEW.id::text
       OR preview_document->>'capability_code' IS DISTINCT FROM NEW.capability_code
       OR preview_document->>'operation' IS DISTINCT FROM NEW.operation
       OR preview_document->>'organization_id' IS DISTINCT FROM NEW.org_id::text
       OR preview_document->>'target_resource_type' IS DISTINCT FROM NEW.target_resource_type
       OR preview_document->>'target_resource_id' IS DISTINCT FROM NEW.target_resource_id::text
       OR preview_document->>'branch_id' IS DISTINCT FROM NEW.branch_id::text
       OR NULLIF(preview_document->>'destination_branch_id','')::uuid IS DISTINCT FROM NEW.destination_branch_id
       OR preview_document->>'request_hash' IS DISTINCT FROM pg_catalog.encode(NEW.request_hash,'hex')
       OR (NEW.capability_code IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare'
           ) AND
           NULLIF(preview_document->>'calculation_artifact_id','')::uuid IS NULL)
       OR (NEW.capability_code IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare'
           ) AND
           NEW.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
               NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version
           ))
       OR (NEW.capability_code NOT IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare'
           ) AND
           NEW.aggregate_version_hash IS DISTINCT FROM extensions.digest(
               pg_catalog.convert_to(source_versions::text,'UTF8'),'sha256'
           ))
       OR (NEW.calculation_hash IS NULL) IS DISTINCT FROM
          (NULLIF(preview_document->>'calculation_hash','') IS NULL)
       OR (NEW.calculation_hash IS NOT NULL AND
           preview_document->>'calculation_hash' IS DISTINCT FROM pg_catalog.encode(NEW.calculation_hash,'hex'))
       OR COALESCE(request_document->>'branch_id',request_document->>'source_branch_id') IS DISTINCT FROM NEW.branch_id::text
       OR NULLIF(request_document->>'destination_branch_id','')::uuid IS DISTINCT FROM NEW.destination_branch_id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='operator command envelope differs from exact typed persisted facts';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "command_requests_exact_capability_guard",
            "INSERT",
            "automation.command_requests",
            "guard_command_request_match",
        ),
        *_function(
            '"resolve_sales_order_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, request_document jsonb)',
            "jsonb",
            '''
DECLARE
    branch_id uuid := NULLIF(request_document->>'branch_id','')::uuid;
    customer_account_id uuid := NULLIF(request_document->>'customer_account_id','')::uuid;
    customer_party_id uuid;
    order_date date := NULLIF(request_document->>'order_date','')::date;
    zero_rated_payment_mode text := request_document->>'zero_rated_payment_mode';
    supply_type text;
    customer_account parties.customer_accounts%ROWTYPE;
    customer_registration parties.tax_registrations%ROWTYPE;
    billing_address parties.addresses%ROWTYPE;
    shipping_address parties.addresses%ROWTYPE;
    branch core.branches%ROWTYPE;
    line_count integer;
    resolved_count integer;
    ruleset_count integer;
    address_count integer;
    registration_count integer;
    resolved_lines jsonb;
BEGIN
    IF SESSION_USER<>'erp_calculator' OR organization_id IS NULL OR membership_id IS NULL
       OR auth_user_id IS NULL OR application_user_id IS NULL OR grant_id IS NULL
       OR branch_id IS NULL OR customer_account_id IS NULL OR order_date IS NULL
       OR zero_rated_payment_mode NOT IN ('not_applicable','without_payment','with_igst')
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-order resolve input is incomplete';
    END IF;
    PERFORM 1
      FROM core.memberships AS membership
      JOIN core.users AS user_row ON user_row.id=membership.user_id
      JOIN core.organizations AS organization ON organization.id=membership.org_id
      JOIN automation.agent_grants AS grant_row
        ON grant_row.org_id=membership.org_id
       AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities AS capability
        ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id
       AND membership.user_id=application_user_id AND membership.status='active'
       AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization.status='active' AND grant_row.id=grant_id
       AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
       AND capability.capability_code='sales.order.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-order delegated authority is inactive';
    END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-order verified auth context resolved a different membership';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.order.create',branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-order branch permission is inactive';
    END IF;
    SELECT * INTO STRICT branch FROM core.branches
     WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT customer_account FROM parties.customer_accounts
     WHERE org_id=organization_id AND id=customer_account_id AND status='active' FOR SHARE;
    customer_party_id:=customer_account.party_id;
    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=customer_party_id
       AND address_kind='billing' AND is_primary AND status='active'
       AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date);
    IF address_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer has ambiguous effective primary billing addresses';
    ELSIF address_count=1 THEN
        SELECT * INTO STRICT billing_address FROM parties.addresses
         WHERE org_id=organization_id AND party_id=customer_party_id
           AND address_kind='billing' AND is_primary AND status='active'
           AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    ELSE
        SELECT * INTO STRICT billing_address FROM parties.addresses
         WHERE org_id=organization_id AND party_id=customer_party_id
           AND address_kind='registered' AND is_primary AND status='active'
           AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    END IF;
    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=customer_party_id
       AND address_kind='shipping' AND is_primary AND status='active'
       AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date);
    IF address_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer has ambiguous effective primary shipping addresses';
    ELSIF address_count=1 THEN
        SELECT * INTO STRICT shipping_address FROM parties.addresses
         WHERE org_id=organization_id AND party_id=customer_party_id
           AND address_kind='shipping' AND is_primary AND status='active'
           AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    ELSE
        shipping_address:=billing_address;
    END IF;

    SELECT count(*) INTO registration_count FROM parties.tax_registrations
     WHERE org_id=organization_id AND party_id=customer_party_id
       AND registration_type='GSTIN' AND status='active'
       AND (valid_from IS NULL OR valid_from<=order_date)
       AND (valid_until IS NULL OR valid_until>=order_date);
    IF registration_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer has ambiguous effective active GST registrations';
    ELSIF registration_count=1 THEN
        SELECT * INTO STRICT customer_registration FROM parties.tax_registrations
         WHERE org_id=organization_id AND party_id=customer_party_id
           AND registration_type='GSTIN' AND status='active'
           AND (valid_from IS NULL OR valid_from<=order_date)
           AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    END IF;
    supply_type:=CASE
      WHEN registration_count=1 AND customer_registration.taxpayer_type IN ('sez_unit','sez_developer') THEN 'sez'
      WHEN branch.state_code=shipping_address.state_code THEN 'intra_state'
      ELSE 'inter_state'
    END;
    IF (supply_type='sez' AND zero_rated_payment_mode NOT IN ('without_payment','with_igst'))
       OR (supply_type<>'sez' AND zero_rated_payment_mode<>'not_applicable') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='zero-rated payment mode does not match exact customer GST status';
    END IF;

    line_count:=pg_catalog.jsonb_array_length(request_document->'lines')
      +pg_catalog.jsonb_array_length(COALESCE(request_document->'charge_lines','[]'::jsonb));
    WITH requested_products AS (
        SELECT item.value AS line, item.ordinality::integer AS line_number
          FROM pg_catalog.jsonb_array_elements(request_document->'lines') WITH ORDINALITY AS item(value,ordinality)
    ), resolved_products AS (
        SELECT requested.line_number,tax_version.ruleset_version,
               pg_catalog.jsonb_build_object(
                 'line_number',requested.line_number,'line_kind','product',
                 'line_id',NULLIF(requested.line->>'line_id','')::uuid,
                 'product_id',product.id,'product_row_version',product.row_version,
                 'hsn_code',product.hsn_code,'uom_conversion_id',conversion.id,
                 'uom_code',conversion.from_uom_code,'to_uom_code',conversion.to_uom_code,
                 'multiplier',conversion.multiplier::text,
                 'uom_valid_from',conversion.valid_from,'uom_valid_until',conversion.valid_until,
                 'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
                 'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
                 'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
                 'taxability',CASE WHEN supply_type='sez' THEN 'zero_rated' ELSE tax_version.taxability END,
                 'gst_rate',CASE
                   WHEN supply_type='sez' AND zero_rated_payment_mode='without_payment' THEN '0'
                   WHEN supply_type='sez' THEN tax_version.igst_rate::text
                   WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
                 'cess_rate',CASE WHEN supply_type<>'sez' AND tax_version.taxability='taxable'
                                  THEN tax_version.cess_rate::text ELSE '0' END,
                 'ruleset_version',tax_version.ruleset_version,'input',requested.line
               ) AS resolved_line
          FROM requested_products AS requested
          JOIN catalog.products AS product
            ON product.org_id=organization_id
           AND product.id=NULLIF(requested.line->>'product_id','')::uuid
           AND product.status='active'
          JOIN catalog.uom_conversions AS conversion
            ON conversion.org_id=product.org_id
           AND conversion.id=NULLIF(requested.line->>'uom_conversion_id','')::uuid
           AND conversion.product_id=product.id AND conversion.status='active'
           AND conversion.to_uom_code=product.base_uom_code
           AND conversion.valid_from<=order_date
           AND (conversion.valid_until IS NULL OR conversion.valid_until>=order_date)
          JOIN tax.tax_code_versions AS tax_version
            ON tax_version.code=product.hsn_code AND tax_version.code_kind='hsn'
           AND tax_version.status='active' AND tax_version.effective_from<=order_date
           AND (tax_version.effective_to IS NULL OR tax_version.effective_to>=order_date)
          JOIN core.reference_data_releases AS tax_release
            ON tax_release.id=tax_version.release_id AND tax_release.dataset_kind='hsn_sac_tax'
           AND tax_release.status='active' AND tax_release.effective_from<=order_date
           AND (tax_release.effective_to IS NULL OR tax_release.effective_to>=order_date)
         FOR SHARE OF product,conversion,tax_version,tax_release
    ), requested_charges AS (
        SELECT item.value AS line,
               pg_catalog.jsonb_array_length(request_document->'lines')+item.ordinality::integer AS line_number
          FROM pg_catalog.jsonb_array_elements(
                 COALESCE(request_document->'charge_lines','[]'::jsonb)
               ) WITH ORDINALITY AS item(value,ordinality)
    ), resolved_charges AS (
        SELECT requested.line_number,tax_version.ruleset_version,
               pg_catalog.jsonb_build_object(
                 'line_number',requested.line_number,'line_kind','charge',
                 'line_id',NULLIF(requested.line->>'line_id','')::uuid,
                 'charge_code',profile.charge_code,
                 'charge_tax_profile_id',profile.id,'charge_tax_profile_row_version',profile.row_version,
                 'charge_tax_profile_effective_from',profile.effective_from,
                 'charge_tax_profile_effective_to',profile.effective_to,
                 'sac_code',tax_version.code,'tax_code_version_id',tax_version.id,
                 'tax_version_number',tax_version.version_number,
                 'tax_effective_from',tax_version.effective_from,'tax_effective_to',tax_version.effective_to,
                 'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version,
                 'taxability',CASE WHEN supply_type='sez' THEN 'zero_rated' ELSE tax_version.taxability END,
                 'gst_rate',CASE
                   WHEN supply_type='sez' AND zero_rated_payment_mode='without_payment' THEN '0'
                   WHEN supply_type='sez' THEN tax_version.igst_rate::text
                   WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate::text ELSE '0' END,
                 'cess_rate',CASE WHEN supply_type<>'sez' AND tax_version.taxability='taxable'
                                  THEN tax_version.cess_rate::text ELSE '0' END,
                 'ruleset_version',tax_version.ruleset_version,'input',requested.line
               ) AS resolved_line
          FROM requested_charges AS requested
          JOIN catalog.commercial_charge_tax_profiles AS profile
            ON profile.org_id=organization_id AND profile.direction='sales'
           AND profile.charge_code=requested.line->>'charge_code' AND profile.status='active'
           AND profile.effective_from<=order_date
           AND (profile.effective_to IS NULL OR profile.effective_to>=order_date)
          JOIN tax.tax_code_versions AS tax_version
            ON tax_version.id=profile.tax_code_version_id AND tax_version.code_kind='sac'
           AND tax_version.status='active' AND tax_version.effective_from<=order_date
           AND (tax_version.effective_to IS NULL OR tax_version.effective_to>=order_date)
          JOIN core.reference_data_releases AS tax_release
            ON tax_release.id=tax_version.release_id AND tax_release.dataset_kind='hsn_sac_tax'
           AND tax_release.status='active' AND tax_release.effective_from<=order_date
           AND (tax_release.effective_to IS NULL OR tax_release.effective_to>=order_date)
         FOR SHARE OF profile,tax_version,tax_release
    ), resolved AS (
        SELECT * FROM resolved_products UNION ALL SELECT * FROM resolved_charges
    )
    SELECT count(*),count(DISTINCT ruleset_version),
           pg_catalog.jsonb_agg(resolved_line ORDER BY line_number)
      INTO resolved_count,ruleset_count,resolved_lines FROM resolved;
    IF resolved_count<>line_count OR ruleset_count<>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales-order product, charge, UOM, or effective tax resolution is not exact';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
        'branch_id',branch.id,'branch_row_version',branch.row_version,
        'branch_state_code',branch.state_code,
        'supply_type',supply_type,'zero_rated_payment_mode',zero_rated_payment_mode,
        'customer_party_id',customer_party_id,'customer_account_id',customer_account.id,
        'customer_account_row_version',customer_account.row_version,
        'customer_tax_registration_id',CASE WHEN registration_count=1 THEN customer_registration.id ELSE NULL END,
        'customer_tax_registration_row_version',CASE WHEN registration_count=1 THEN customer_registration.row_version ELSE NULL END,
        'customer_taxpayer_type',CASE WHEN registration_count=1 THEN customer_registration.taxpayer_type ELSE NULL END,
        'billing_address_id',billing_address.id,'billing_address_row_version',billing_address.row_version,
        'shipping_address_id',shipping_address.id,'shipping_address_row_version',shipping_address.row_version,
        'shipping_state_code',shipping_address.state_code,
        'order_date',order_date,'lines',resolved_lines,
        'ruleset_version',resolved_lines->0->>'ruleset_version'
    );
END
''',
            calculator=True,
        ),
        *_function(
            '"link_calculation_artifact"(organization_id uuid, command_request_id uuid, artifact_id uuid, authority_hash bytea)',
            "void",
            f'''
DECLARE request_row automation.command_requests%ROWTYPE; preview_document jsonb;
BEGIN
    IF SESSION_USER<>'erp_calculator' OR pg_catalog.octet_length(authority_hash)<>32 THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='only the isolated calculator may link exact calculation evidence';
    END IF;
    SELECT * INTO STRICT request_row FROM automation.command_requests
     WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
    preview_document:=pg_catalog.convert_from(request_row.preview_bytes,'UTF8')::jsonb;
    IF request_row.status<>'prepared' OR request_row.calculation_hash IS NOT NULL
       OR NULLIF(preview_document->>'calculation_artifact_id','')::uuid IS DISTINCT FROM artifact_id
       OR NOT EXISTS (
           SELECT 1 FROM calculation.artifacts AS artifact
            WHERE artifact.org_id=organization_id AND artifact.id=artifact_id
              AND artifact.command_request_id=command_request_id
              AND artifact.authority_hash=authority_hash AND artifact.status='issued'
       ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact differs from immutable command preview';
    END IF;
    INSERT INTO "{SCHEMA}"."write_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'calculation_link',organization_id,command_request_id);
    UPDATE automation.command_requests
       SET calculation_hash=authority_hash,row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id
       AND status='prepared' AND calculation_hash IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='calculation link lost exact command ownership';
    END IF;
    DELETE FROM "{SCHEMA}"."write_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='calculation_link' AND scope.org_id=organization_id
       AND scope.command_request_id=command_request_id;
END
''',
        ),
        *_function(
            '"guard_command_request_prepare_scope"()',
            "trigger",
            f'''
BEGIN
    IF NOT "{SCHEMA}"."write_scope_active"('prepare',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command requests may be inserted only by a reviewed prepare authority';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "command_requests_prepare_scope_guard",
            "INSERT",
            "automation.command_requests",
            "guard_command_request_prepare_scope",
        ),
        *_function(
            '"prepare_operator_command"(organization_id uuid, command_id uuid, grant_id uuid, capability_name varchar, source_branch_id uuid, destination_branch_id uuid, target_id uuid, requested_amount numeric, currency_code char(3), key_hash bytea, request_bytes bytea, preview_bytes bytea, calculation_hash bytea, aggregate_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE
    actor_id uuid := erp_security.current_membership_id();
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    existing automation.command_requests%ROWTYPE;
    request_hash bytea := extensions.digest(request_bytes,'sha256');
    preview_hash bytea := extensions.digest(preview_bytes,'sha256');
    preview_document jsonb;
    target_type text := {prepare_target_case};
    operation_name text := {prepare_operation_case};
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL OR target_type IS NULL OR operation_name IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
       OR erp_security.has_permission('automation.command.execute',source_branch_id) IS DISTINCT FROM true
       OR (destination_branch_id IS NOT NULL AND
           erp_security.has_permission('automation.command.execute',destination_branch_id) IS DISTINCT FROM true) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='operator prepare context or permission is invalid';
    END IF;
    IF pg_catalog.octet_length(key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(aggregate_hash)<>32
       OR (calculation_hash IS NOT NULL AND pg_catalog.octet_length(calculation_hash)<>32) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operator prepare envelope size or hash is invalid';
    END IF;
    BEGIN
        preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operator preview must be UTF-8 JSON';
    END;
    SELECT * INTO STRICT grant_row FROM automation.agent_grants
     WHERE org_id=organization_id AND id=grant_id FOR SHARE;
    SELECT * INTO STRICT capability FROM automation.agent_grant_capabilities
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code=capability_name FOR SHARE;
    SELECT * INTO existing FROM automation.command_requests
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code=capability_name AND idempotency_key_hash=key_hash;
    IF FOUND THEN
        IF existing.request_hash IS DISTINCT FROM request_hash
           OR existing.preview_hash IS DISTINCT FROM preview_hash
           OR existing.target_resource_id IS DISTINCT FROM target_id THEN
            RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='operator prepare idempotency key has different exact input';
        END IF;
        RETURN existing.id;
    END IF;
    PERFORM pg_catalog.set_config('app.command_request_id',command_id::text,true);
    INSERT INTO "{SCHEMA}"."write_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'prepare',organization_id,command_id);
    INSERT INTO automation.command_requests(
        org_id,id,agent_grant_id,requested_by_membership_id,capability_code,operation,
        operation_mode,branch_id,destination_branch_id,requested_amount,currency_code,
        requests_sensitive_read,target_resource_type,target_resource_id,target_row_version,
        serializer_version,idempotency_key_hash,request_media_type,request_bytes,request_hash,
        preview_media_type,preview_bytes,preview_hash,calculation_hash,aggregate_version_hash,
        risk_class,approval_policy,required_approval_count,status,expires_at)
    VALUES(
        organization_id,command_id,grant_id,actor_id,capability_name,operation_name,
        'write',source_branch_id,destination_branch_id,requested_amount,currency_code,
        false,target_type,target_id,1,'aasopharma-pg-jsonb-v1',key_hash,
        'application/vnd.aasopharma.command+json',request_bytes,request_hash,
        'application/vnd.aasopharma.command-preview+json',preview_bytes,preview_hash,
        calculation_hash,aggregate_hash,capability.risk_class,capability.approval_policy,1,
        'prepared',expires_at);
    DELETE FROM "{SCHEMA}"."write_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='prepare' AND scope.org_id=organization_id
       AND scope.command_request_id=command_id;
    RETURN command_id;
END
''',
        ),
        *_function(
            '"persist_sales_order_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, order_id uuid, command_id uuid, artifact_id uuid, request_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE
    request_document jsonb;
    resolved_document jsonb;
    current_resolution jsonb;
    input_document jsonb;
    output_document jsonb;
    totals jsonb;
    line jsonb;
    resolved_line jsonb;
    sequence_id uuid;
    claim_id uuid;
    replay_id uuid;
    order_number text;
    branch_id uuid;
    order_date date;
    fiscal_year integer;
    aggregate_hash bytea;
    requested_total numeric(20,2);
    existing automation.command_requests%ROWTYPE;
BEGIN
    IF SESSION_USER<>'erp_calculator' OR order_id IS NULL OR command_id IS NULL
       OR artifact_id IS NULL OR request_id IS NULL
       OR pg_catalog.octet_length(key_hash)<>32
       OR pg_catalog.octet_length(sequence_key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_input_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(calculation_output_bytes) NOT BETWEEN 2 AND 1048576 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-order prepare persistence envelope is invalid';
    END IF;
    BEGIN
        request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
        output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-order prepare persistence requires UTF-8 JSON';
    END;
    current_resolution:="{SCHEMA}"."resolve_sales_order_prepare"(
        organization_id,membership_id,auth_user_id,application_user_id,grant_id,
        caller_client_id,request_document
    );
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document
       OR output_document->>'operation'<>'sales.order.approve'
       OR output_document->>'resource_type'<>'sales_order'
       OR output_document->>'resource_id'<>order_id::text
       OR (output_document->>'aggregate_version')::bigint<>1
       OR output_document->>'serializer_version'<>'aasopharma-jcs-decimal-v1'
       OR input_document->>'serializer_version'<>'aasopharma-jcs-decimal-v1'
       OR input_document#>>'{{document,zero_rated_mode}}' IS DISTINCT FROM resolved_document->>'zero_rated_payment_mode'
       OR input_document#>>'{{document,gst_type}}' IS DISTINCT FROM
          (CASE WHEN resolved_document->>'supply_type'='intra_state' THEN 'intra_state' ELSE 'inter_state' END)
       OR pg_catalog.jsonb_typeof(output_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(output_document->'lines')<>
          pg_catalog.jsonb_array_length(resolved_document->'lines')
       OR pg_catalog.jsonb_array_length(input_document#>'{{document,products}}')
          +pg_catalog.jsonb_array_length(input_document#>'{{document,charges}}')<>
          pg_catalog.jsonb_array_length(resolved_document->'lines') THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-order resolution or calculation output changed';
    END IF;
    SELECT * INTO existing FROM automation.command_requests
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code='sales.order.prepare' AND idempotency_key_hash=key_hash
     FOR SHARE;
    IF FOUND THEN
        IF existing.target_resource_id IS DISTINCT FROM order_id
           OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
           OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
            RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-order idempotency key has different exact input';
        END IF;
        RETURN pg_catalog.jsonb_build_object(
            'command_request_id',existing.id,'expires_at',existing.expires_at,
            'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true
        );
    END IF;
    branch_id:=NULLIF(resolved_document->>'branch_id','')::uuid;
    order_date:=(resolved_document->>'order_date')::date;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',order_date)>=4
                      THEN pg_catalog.date_part('year',order_date)::integer
                      ELSE pg_catalog.date_part('year',order_date)::integer-1 END;
    SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences AS sequence
     WHERE sequence.org_id=organization_id AND sequence.branch_id=branch_id
       AND sequence.document_type='sales_order'
       AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
       AND sequence.status='active' FOR SHARE;
    order_number:=erp_core_commands.allocate_document_number(
        organization_id,sequence_id,sequence_key_hash,expires_at
    );
    totals:=output_document->'totals';
    requested_total:=(totals->>'grand_total')::numeric;
    INSERT INTO sales.orders(
        org_id,id,branch_id,customer_account_id,order_number,fiscal_year,order_date,status,
        supply_type,zero_rated_payment_mode,tax_charge_mechanism,billing_address_id,
        shipping_address_id,currency_code,calculation_ruleset_version,
        document_discount_kind,document_discount_basis,document_discount_value,
        subtotal,discount_total,charges_total,net_value_total,gst_taxable_total,
        cgst_total,sgst_total,igst_total,cess_total,recipient_assessed_tax_total,
        rounding_policy,rounding_adjustment,grand_total)
    VALUES(
        organization_id,order_id,branch_id,
        (resolved_document->>'customer_account_id')::uuid,order_number,fiscal_year,order_date,'submitted',
        resolved_document->>'supply_type',resolved_document->>'zero_rated_payment_mode',
        'normal',(resolved_document->>'billing_address_id')::uuid,
        (resolved_document->>'shipping_address_id')::uuid,'INR',output_document->>'ruleset_version',
        request_document->'document_discount'->>'document_discount_kind',
        request_document->'document_discount'->>'document_discount_basis',
        (request_document->'document_discount'->>'document_discount_value')::numeric,
        (totals->>'subtotal')::numeric,(totals->>'discount_total')::numeric,
        (totals->>'charges_total')::numeric,(totals->>'net_value_total')::numeric,
        (totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,
        (totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,
        (totals->>'cess_total')::numeric,(totals->>'recipient_assessed_tax_total')::numeric,
        request_document->>'rounding_policy',(totals->>'rounding_adjustment')::numeric,
        requested_total);

    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
        SELECT value INTO STRICT line FROM pg_catalog.jsonb_array_elements(output_document->'lines')
         WHERE value->>'line_id'=resolved_line->>'line_id';
        INSERT INTO sales.order_lines(
            org_id,id,order_id,line_number,line_kind,product_id,charge_code,uom_code,uom_conversion_factor,
            billed_quantity,free_quantity,base_billed_quantity,base_free_quantity,
            free_supply_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,
            gross_amount,line_discount_kind,line_discount_basis,line_discount_value,
            document_discount_eligible,line_discount_amount,line_taxable_discount_amount,
            document_discount_amount,document_taxable_discount_amount,net_value_amount,
            gst_taxable_value,tax_classification_code_snapshot,tax_code_version_id,
            taxability_snapshot,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,
            sgst_amount,igst_amount,cess_amount,line_total)
        VALUES(
            organization_id,(resolved_line->>'line_id')::uuid,order_id,
            (resolved_line->>'line_number')::integer,resolved_line->>'line_kind',
            NULLIF(resolved_line->>'product_id','')::uuid,resolved_line->>'charge_code',
            resolved_line->>'uom_code',NULLIF(resolved_line->>'multiplier','')::numeric,
            NULLIF(resolved_line->'input'->>'billed_quantity','')::numeric,
            NULLIF(resolved_line->'input'->>'free_quantity','')::numeric,
            CASE WHEN resolved_line->>'line_kind'='product' THEN
              (resolved_line->'input'->>'billed_quantity')::numeric*(resolved_line->>'multiplier')::numeric ELSE NULL END,
            CASE WHEN resolved_line->>'line_kind'='product' THEN
              (resolved_line->'input'->>'free_quantity')::numeric*(resolved_line->>'multiplier')::numeric ELSE NULL END,
            CASE WHEN resolved_line->>'line_kind'='product'
                 THEN resolved_line->'input'->>'free_supply_tax_treatment' ELSE NULL END,
            NULLIF(resolved_line->'input'->>'quoted_unit_rate','')::numeric,
            resolved_line->'input'->>'price_basis','normal',(line->>'gross_amount')::numeric,
            CASE WHEN resolved_line->>'line_kind'='product'
                 THEN resolved_line->'input'->'line_discount'->>'line_discount_kind' ELSE 'none' END,
            CASE WHEN resolved_line->>'line_kind'='product'
                 THEN resolved_line->'input'->'line_discount'->>'line_discount_basis' ELSE 'price_value' END,
            CASE WHEN resolved_line->>'line_kind'='product'
                 THEN (resolved_line->'input'->'line_discount'->>'line_discount_value')::numeric ELSE 0 END,
            (resolved_line->'input'->>'document_discount_eligible')::boolean,
            (line->>'line_discount_amount')::numeric,
            (line->>'line_taxable_discount_amount')::numeric,
            (line->>'document_discount_amount')::numeric,
            (line->>'document_taxable_discount_amount')::numeric,
            (line->>'net_value_amount')::numeric,(line->>'gst_taxable_value')::numeric,
            CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code'
                 ELSE resolved_line->>'sac_code' END,(resolved_line->>'tax_code_version_id')::uuid,
            resolved_line->>'taxability',(line->>'cgst_rate')::numeric,
            (line->>'sgst_rate')::numeric,(line->>'igst_rate')::numeric,
            (line->>'cess_rate')::numeric,(line->>'cgst_amount')::numeric,
            (line->>'sgst_amount')::numeric,(line->>'igst_amount')::numeric,
            (line->>'cess_amount')::numeric,(line->>'line_total')::numeric);
    END LOOP;
    PERFORM erp_trade_commands_v2.assert_sales_order_artifact(
        organization_id,order_id,input_document,output_document
    );
    aggregate_hash:="{SCHEMA}"."aggregate_version_hash"('sales_order',order_id,1);
    PERFORM "{SCHEMA}"."prepare_operator_command"(
        organization_id,command_id,grant_id,'sales.order.prepare',branch_id,NULL::uuid,
        order_id,requested_total,'INR',key_hash,request_bytes,preview_bytes,NULL::bytea,
        aggregate_hash,expires_at
    );
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id
      FROM erp_trade_commands.claim(
        organization_id,membership_id,'sales.order.approve',key_hash,
        extensions.digest(request_bytes,'sha256'),expires_at
      );
    IF replay_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-order prepare replay reached a completed execution claim';
    END IF;
    PERFORM erp_calculation_authority.issue_artifact(
        artifact_id,branch_id,'sales.order.approve','sales_order',order_id,1,
        request_id,command_id,claim_id,extensions.digest(request_bytes,'sha256'),
        calculation_input_bytes,calculation_output_bytes,output_document->>'engine_version',
        output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at
    );
    RETURN pg_catalog.jsonb_build_object(
        'command_request_id',command_id,'expires_at',expires_at,
        'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),
        'replayed',false
    );
END
''',
            calculator=True,
        ),
        *_purchase_order_prepare_definition(),
        *_goods_receipt_prepare_definition(),
        *_supplier_invoice_prepare_definition(),
        *_sales_dispatch_prepare_definition(),
        *_sales_invoice_prepare_definition(),
        *_sales_return_prepare_definition(),
        *_purchase_return_prepare_definition(),
        *_adjustment_note_prepare_definition(),
        *_customer_receipt_prepare_definition(),
        *_customer_cheque_lifecycle_prepare_definition(),
        *_supplier_payment_prepare_definition(),
        *_supplier_advance_prepare_definition(),
        *_inventory_transfer_prepare_definition(),
        *_inventory_adjustment_prepare_definition(),
    ]


def _inventory_transfer_prepare_definition() -> list[str]:
    """Atomic, reviewed inter-branch transfer of one FEFO expiry tier."""
    return [
        *_function(
            '"resolve_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE source_branch_id uuid:=NULLIF(request_document->>'source_branch_id','')::uuid;
        destination_branch_id uuid:=NULLIF(request_document->>'destination_branch_id','')::uuid;
        source_location_id uuid:=NULLIF(request_document->>'source_location_id','')::uuid;
        destination_location_id uuid:=NULLIF(request_document->>'destination_location_id','')::uuid;
        transfer_date date:=NULLIF(request_document->>'transfer_date','')::date;
        organization core.organizations%ROWTYPE;
        source_branch core.branches%ROWTYPE; destination_branch core.branches%ROWTYPE;
        source_location inventory.locations%ROWTYPE; destination_location inventory.locations%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        batch inventory.batches%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        transporter parties.parties%ROWTYPE; requested_line jsonb; allocation jsonb;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        base_quantity numeric(20,6); extended_cost numeric(20,2);
        total_quantity numeric(20,6):=0; total_value numeric(20,2):=0;
        earliest_expiry date; line_number integer:=0; recall_count integer;
        pending_count integer; transporter_name text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR inventory_document_id IS NULL OR source_branch_id IS NULL
     OR destination_branch_id IS NULL OR source_branch_id=destination_branch_id
     OR source_location_id IS NULL OR destination_location_id IS NULL OR source_location_id=destination_location_id
     OR transfer_date IS NULL
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
     OR pg_catalog.jsonb_typeof(request_document->'logistics')<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='inter-branch transfer input is incomplete'; END IF;
  SELECT * INTO STRICT organization FROM core.organizations
   WHERE id=organization_id AND status='active' AND country_code='IN' AND base_currency='INR' FOR SHARE;
  IF transfer_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='inter-branch transfer must use the organization business date'; END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value))
     <> (SELECT count(DISTINCT item.value->>'batch_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='each manufacturer batch may appear only once in a transfer'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND grant_row.branch_id IS NULL
     AND capability.capability_code='inventory.transfer.prepare' AND capability.operation_mode='write'
     AND capability.risk_class='consequential_write' AND capability.approval_policy='actor_confirmation'
     AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer delegated authority is inactive or branch-limited'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(source_branch_id) IS DISTINCT FROM true
     OR erp_security.can_access_branch(destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.transfer.create',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.transfer.create',destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',destination_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer context or two-branch permission is inactive'; END IF;
  SELECT * INTO STRICT source_branch FROM core.branches WHERE org_id=organization_id AND id=source_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT destination_branch FROM core.branches WHERE org_id=organization_id AND id=destination_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT source_location FROM inventory.locations WHERE org_id=organization_id AND id=source_location_id
    AND branch_id=source_branch.id AND status='active' AND location_type='saleable' AND allows_sale
    AND NOT allows_negative_stock FOR SHARE;
  SELECT * INTO STRICT destination_location FROM inventory.locations WHERE org_id=organization_id AND id=destination_location_id
    AND branch_id=destination_branch.id AND status='active' AND location_type='saleable' AND allows_sale
    AND NOT allows_negative_stock FOR SHARE;
  IF ROW(source_location.temperature_min_c,source_location.temperature_max_c)
     IS DISTINCT FROM ROW(destination_location.temperature_min_c,destination_location.temperature_max_c) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='transfer locations require identical storage temperature bounds'; END IF;
  IF NULLIF(request_document#>>'{logistics,transport_mode}','') IS NULL
     OR request_document#>>'{logistics,transport_mode}' NOT IN ('road','rail','air','ship','multimodal','in_person')
     OR NULLIF(request_document#>>'{logistics,distance_km}','') IS NULL
     OR (request_document#>>'{logistics,distance_km}')::numeric<0
     OR (request_document#>>'{logistics,distance_km}')::numeric<>pg_catalog.round((request_document#>>'{logistics,distance_km}')::numeric,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer logistics mode and exact distance are invalid'; END IF;
  IF NULLIF(request_document#>>'{logistics,transporter_party_id}','') IS NOT NULL THEN
    SELECT * INTO STRICT transporter FROM parties.parties WHERE org_id=organization_id
      AND id=(request_document#>>'{logistics,transporter_party_id}')::uuid AND status='active' FOR SHARE;
    transporter_name:=transporter.legal_name;
  ELSIF request_document#>>'{logistics,transport_mode}'<>'in_person' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-person transfer requires an active canonical transporter';
  END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','role','source','id',source_branch.id,'row_version',source_branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','role','destination','id',destination_branch.id,'row_version',destination_branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','role','source','id',source_location.id,'row_version',source_location.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','role','destination','id',destination_location.id,'row_version',destination_location.row_version));
  IF transporter.id IS NOT NULL THEN
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','transporter_party','id',transporter.id,'row_version',transporter.row_version,'legal_name',transporter.legal_name));
  END IF;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    IF NULLIF(requested_line->>'product_id','')::uuid IS NULL OR NULLIF(requested_line->>'uom_conversion_id','')::uuid IS NULL
       OR pg_catalog.jsonb_typeof(requested_line->'batch_allocations')<>'array'
       OR pg_catalog.jsonb_array_length(requested_line->'batch_allocations') NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='each transfer product requires an effective UOM and batch allocation'; END IF;
    SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
      AND id=(requested_line->>'product_id')::uuid AND status='active'
      AND cold_chain_required=false AND ndps_regulated=false FOR SHARE;
    SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
      AND id=(requested_line->>'uom_conversion_id')::uuid AND product_id=product.id AND status='active'
      AND to_uom_code=product.base_uom_code AND multiplier>0 AND valid_from<=transfer_date
      AND (valid_until IS NULL OR valid_until>=transfer_date) FOR SHARE;
    SELECT min(eligible_batch.expires_on) INTO earliest_expiry
      FROM inventory.batches eligible_batch JOIN inventory.stock_balances eligible_balance
        ON eligible_balance.org_id=eligible_batch.org_id AND eligible_balance.batch_id=eligible_batch.id
       AND eligible_balance.product_id=eligible_batch.product_id
     WHERE eligible_batch.org_id=organization_id AND eligible_batch.product_id=product.id
       AND eligible_batch.status='released' AND eligible_batch.released_at IS NOT NULL AND eligible_batch.expires_on>transfer_date
       AND eligible_balance.branch_id=source_branch.id AND eligible_balance.location_id=source_location.id
       AND eligible_balance.on_hand_quantity>0
       AND NOT EXISTS (SELECT 1 FROM compliance.recall_batches rb JOIN compliance.recalls active_recall
         ON active_recall.org_id=rb.org_id AND active_recall.id=rb.recall_id
        WHERE rb.org_id=eligible_batch.org_id AND rb.batch_id=eligible_batch.id
          AND active_recall.status IN ('initiated','in_progress') AND rb.status IN ('identified','quarantined'))
       AND NOT EXISTS (SELECT 1 FROM inventory.inventory_document_lines pending_line
         JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id
          AND pending.id=pending_line.inventory_document_id
        WHERE pending_line.org_id=eligible_batch.org_id AND pending.id<>inventory_document_id
          AND pending.status IN ('draft','submitted','approved') AND pending_line.batch_id=eligible_batch.id
          AND source_location.id IN (pending_line.from_location_id,pending_line.to_location_id));
    IF earliest_expiry IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='no released nonexpired source stock is eligible'; END IF;
    FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') LOOP
      line_number:=line_number+1;
      IF NULLIF(allocation->>'inventory_document_line_id','')::uuid IS NULL
         OR NULLIF(allocation->>'batch_id','')::uuid IS NULL
         OR NULLIF(allocation->>'entered_quantity','')::numeric<=0
         OR (allocation->>'entered_quantity')::numeric<>pg_catalog.round((allocation->>'entered_quantity')::numeric,6) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer batch and positive six-decimal quantity are required'; END IF;
      SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id
        AND id=(allocation->>'batch_id')::uuid AND product_id=product.id AND lot_kind='manufacturer_batch'
        AND status='released' AND released_at IS NOT NULL AND expires_on=earliest_expiry FOR SHARE;
      SELECT count(*) INTO recall_count FROM compliance.recall_batches recall_batch JOIN compliance.recalls recall
        ON recall.org_id=recall_batch.org_id AND recall.id=recall_batch.recall_id
       WHERE recall_batch.org_id=organization_id AND recall_batch.batch_id=batch.id
         AND recall.status IN ('initiated','in_progress') AND recall_batch.status IN ('identified','quarantined');
      IF recall_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recalled batch cannot be transferred'; END IF;
      SELECT * INTO STRICT balance FROM inventory.stock_balances stock_balance
       WHERE stock_balance.org_id=organization_id AND stock_balance.branch_id=source_branch.id
         AND stock_balance.location_id=source_location.id AND stock_balance.product_id=product.id
         AND stock_balance.batch_id=batch.id AND stock_balance.on_hand_quantity>0
         AND stock_balance.inventory_value>=0 AND stock_balance.average_unit_cost>=0 FOR UPDATE;
      base_quantity:=pg_catalog.round((allocation->>'entered_quantity')::numeric*conversion.multiplier,6);
      IF base_quantity<=0 OR base_quantity>balance.on_hand_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='transfer quantity exceeds locked available source stock'; END IF;
      extended_cost:=CASE WHEN base_quantity=balance.on_hand_quantity THEN balance.inventory_value
                          ELSE pg_catalog.round(base_quantity*balance.average_unit_cost,2) END;
      SELECT count(*) INTO pending_count FROM inventory.inventory_document_lines pending_line
        JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id AND pending.id=pending_line.inventory_document_id
       WHERE pending_line.org_id=organization_id AND pending.id<>inventory_document_id
         AND pending.status IN ('draft','submitted','approved') AND pending_line.batch_id=batch.id
         AND source_location.id IN (pending_line.from_location_id,pending_line.to_location_id);
      IF pending_count<>0 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='source batch has a pending inventory movement'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_number,'inventory_document_line_id',allocation->>'inventory_document_line_id',
        'product_id',product.id,'batch_id',batch.id,'batch_number',batch.batch_number,'expires_on',batch.expires_on,
        'uom_conversion_id',conversion.id,'selected_uom_code',conversion.from_uom_code,'uom_code',product.base_uom_code,
        'uom_multiplier',conversion.multiplier::text,'entered_quantity',allocation->>'entered_quantity',
        'base_quantity',base_quantity::text,'source_available_base_quantity',balance.on_hand_quantity::text,
        'unit_cost',balance.average_unit_cost::text,'extended_cost',extended_cost::text));
      total_quantity:=total_quantity+base_quantity; total_value:=total_value+extended_cost;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version),
        pg_catalog.jsonb_build_object('resource_type','uom_conversion','id',conversion.id,'multiplier',conversion.multiplier::text,
          'valid_from',conversion.valid_from,'valid_until',conversion.valid_until),
        pg_catalog.jsonb_build_object('resource_type','inventory_batch','id',batch.id,'row_version',batch.row_version,
          'status',batch.status,'released_at',batch.released_at,'expires_on',batch.expires_on),
        pg_catalog.jsonb_build_object('resource_type','stock_balance','id',balance.last_ledger_entry_id,'row_version',balance.row_version,
          'branch_id',source_branch.id,'location_id',source_location.id,'product_id',product.id,'batch_id',batch.id,
          'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,
          'average_unit_cost',balance.average_unit_cost::text,'last_ledger_entry_id',balance.last_ledger_entry_id),
        pg_catalog.jsonb_build_object('resource_type','active_recall_state','batch_id',batch.id,'active_count',recall_count),
        pg_catalog.jsonb_build_object('resource_type','pending_inventory_document_state','batch_id',batch.id,'active_count',pending_count));
    END LOOP;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'source_branch_id',source_branch.id,'source_branch_name',source_branch.name,
    'destination_branch_id',destination_branch.id,'destination_branch_name',destination_branch.name,
    'source_location_id',source_location.id,'source_location_name',source_location.name,
    'destination_location_id',destination_location.id,'destination_location_name',destination_location.name,
    'transfer_date',transfer_date,'lines',resolved_lines,'total_base_quantity',total_quantity::text,
    'total_value',total_value::text,'transporter_name',transporter_name,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','movement','inter_branch_atomic',
      'approval_policy','actor_confirmation','batch_policy','strict_fefo_earliest_expiry_tier','tax_supply_created',false));
END
''', runtime=True),
        *_function(
            '"assert_inventory_transfer_draft"(organization_id uuid, inventory_document_id uuid, resolved_document jsonb)',
            "void",
            '''
DECLARE document inventory.inventory_documents%ROWTYPE;
BEGIN
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR SHARE;
  IF ROW(document.branch_id,document.destination_branch_id,document.document_type,document.document_date,document.status,
         document.reason_code,document.currency_code,document.costing_method_snapshot,document.total_abs_base_quantity,document.total_value,
         document.physical_movement_required)
     IS DISTINCT FROM ROW((resolved_document->>'source_branch_id')::uuid,(resolved_document->>'destination_branch_id')::uuid,
       'transfer',(resolved_document->>'transfer_date')::date,'submitted','inter_branch_transfer','INR'::bpchar,
       'moving_weighted_average',(resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric,true)
     OR (SELECT count(*) FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id)<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR EXISTS(SELECT 1 FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id AND NOT EXISTS(
            SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') expected(value)
             WHERE (expected.value->>'inventory_document_line_id')::uuid=line.id
               AND (expected.value->>'line_number')::integer=line.line_number AND line.movement_kind='transfer'
               AND (expected.value->>'product_id')::uuid=line.product_id AND (expected.value->>'batch_id')::uuid=line.batch_id
               AND expected.value->>'uom_code'=line.uom_code
               AND (expected.value->>'base_quantity')::numeric=line.entered_quantity
               AND (expected.value->>'base_quantity')::numeric=line.base_quantity
               AND (resolved_document->>'source_location_id')::uuid=line.from_location_id
               AND (resolved_document->>'destination_location_id')::uuid=line.to_location_id
               AND (expected.value->>'unit_cost')::numeric=line.unit_cost
               AND (expected.value->>'extended_cost')::numeric=line.extended_cost)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared inter-branch transfer differs from approved preview'; END IF;
END
'''),
        *_function(
            '"persist_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, key_hash bytea, document_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document jsonb:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        preview_document jsonb:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
        current_resolution jsonb; existing automation.command_requests%ROWTYPE;
        aggregate_hash bytea; sequence_id uuid; document_number text; fiscal_year integer; resolved_line jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR command_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
     OR expires_at<=pg_catalog.transaction_timestamp()
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer persistence envelope is invalid'; END IF;
  current_resolution:="{SCHEMA}"."resolve_inventory_transfer_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,inventory_document_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR preview_document->>'operation'<>'inventory.document.post'
     OR preview_document->>'capability_code'<>'inventory.transfer.prepare'
     OR preview_document->>'target_resource_type'<>'inventory_document'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='inter-branch transfer resolution or preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='inventory.transfer.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM inventory_document_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='inter-branch transfer idempotency key has different input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'transfer_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'transfer_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'transfer_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'inventory.transfer.prepare',
    (resolved_document->>'source_branch_id')::uuid,(resolved_document->>'destination_branch_id')::uuid,
    inventory_document_id,(resolved_document->>'total_value')::numeric,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'source_branch_id')::uuid AND document_type='stock_transfer'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  document_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,document_sequence_key_hash,expires_at);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,destination_branch_id,physical_movement_required,
    origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
    destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
    transport_mode,distance_km,transporter_party_id,transporter_name_snapshot,vehicle_number_snapshot,vehicle_type_snapshot,
    transport_document_number_snapshot,transport_document_date,movement_started_at,document_type,document_number,
    fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,total_value)
  SELECT organization_id,inventory_document_id,source.id,destination.id,true,
    source.address_line1,source.address_line2,source.city,source.state_code,source.postal_code,
    destination.address_line1,destination.address_line2,destination.city,destination.state_code,destination.postal_code,
    request_document#>>'{{logistics,transport_mode}}',(request_document#>>'{{logistics,distance_km}}')::numeric,
    NULLIF(request_document#>>'{{logistics,transporter_party_id}}','')::uuid,resolved_document->>'transporter_name',
    request_document#>>'{{logistics,vehicle_number}}',request_document#>>'{{logistics,vehicle_type}}',
    request_document#>>'{{logistics,transport_document_number}}',NULLIF(request_document#>>'{{logistics,transport_document_date}}','')::date,
    pg_catalog.transaction_timestamp(),'transfer',document_number,fiscal_year,(resolved_document->>'transfer_date')::date,
    'submitted','inter_branch_transfer','INR','moving_weighted_average',
    (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric
   FROM core.branches source JOIN core.branches destination ON destination.org_id=source.org_id
   WHERE source.org_id=organization_id AND source.id=(resolved_document->>'source_branch_id')::uuid
     AND destination.id=(resolved_document->>'destination_branch_id')::uuid;
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,
      product_id,batch_id,uom_code,entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,extended_cost)
    VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,inventory_document_id,
      (resolved_line->>'line_number')::integer,'transfer',(resolved_line->>'product_id')::uuid,
      (resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',(resolved_line->>'base_quantity')::numeric,
      (resolved_line->>'base_quantity')::numeric,(resolved_document->>'source_location_id')::uuid,
      (resolved_document->>'destination_location_id')::uuid,(resolved_line->>'unit_cost')::numeric,
      (resolved_line->>'extended_cost')::numeric);
  END LOOP;
  PERFORM "{SCHEMA}"."assert_inventory_transfer_draft"(organization_id,inventory_document_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''', runtime=True),
    ]


def _inventory_adjustment_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        adjustment_date date:=NULLIF(request_document->>'adjustment_date','')::date;
        counted_at timestamptz:=NULLIF(request_document->>'counted_at','')::timestamptz;
        counted_by uuid:=NULLIF(request_document->>'counted_by_membership_id','')::uuid;
        location_id uuid:=NULLIF(request_document->>'location_id','')::uuid;
        evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        location inventory.locations%ROWTYPE; evidence core.attachments%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        batch inventory.batches%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        last_ledger inventory.stock_ledger_entries%ROWTYPE;
        inventory_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        requested_line jsonb; requested_count jsonb; resolved_lines jsonb:='[]'::jsonb;
        source_versions jsonb:='[]'::jsonb; counted_base numeric(20,6);
        variance_base numeric(20,6); extended_cost numeric(20,2);
        total_base numeric(20,6):=0; total_value numeric(20,2):=0;
        pending_count integer; recall_count integer; line_no integer:=0;
        medicine_count integer:=0; license_type_count integer; license_sources jsonb;
        conversion_version_hash text; variance_effect text; line_effect text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR inventory_document_id IS NULL OR branch_id IS NULL OR adjustment_date IS NULL
     OR counted_at IS NULL OR counted_by IS NULL OR location_id IS NULL OR evidence_id IS NULL
     OR request_document->>'reason_code'<>'cycle_count'
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count input is incomplete'; END IF;
  SELECT * INTO STRICT organization FROM core.organizations WHERE id=organization_id AND status='active'
    AND country_code='IN' AND base_currency='INR' FOR SHARE;
  IF adjustment_date IS DISTINCT FROM (counted_at AT TIME ZONE organization.timezone)::date
     OR adjustment_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
     OR counted_at>pg_catalog.transaction_timestamp()
     OR counted_at<pg_catalog.transaction_timestamp()-interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='cycle count must be recent, nonfuture, and posted on the organization business date'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') item(value)
      WHERE pg_catalog.jsonb_typeof(item.value->'batch_counts')<>'array'
         OR pg_catalog.jsonb_array_length(item.value->'batch_counts') NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='every cycle-count product requires one or more exact lot counts'; END IF;
  IF (SELECT count(DISTINCT count_row.value->>'batch_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value))
     <> (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='each manufacturer batch may appear only once in a cycle count'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='inventory.adjustment.prepare' AND capability.operation_mode='write'
     AND capability.risk_class='consequential_write' AND capability.approval_policy='separate_approver'
     AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.adjustment.create',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT location FROM inventory.locations AS candidate_location
   WHERE candidate_location.org_id=organization_id AND candidate_location.id=location_id
    AND candidate_location.branch_id=branch.id AND candidate_location.status='active'
    AND candidate_location.location_type='saleable' AND candidate_location.allows_sale
    AND NOT candidate_location.allows_negative_stock AND candidate_location.temperature_min_c IS NULL
    AND candidate_location.temperature_max_c IS NULL FOR SHARE;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND evidence_kind='inventory_cycle_count_sheet' AND status IN ('verified','retained')
    AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp()
    AND document_date=adjustment_date AND retention_until IS NOT NULL AND retention_until>=adjustment_date
    AND sha256 IS NOT NULL FOR SHARE;
  PERFORM 1 FROM core.memberships counter WHERE counter.org_id=organization_id AND counter.id=counted_by
    AND counter.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='physical counter membership is inactive'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':inventory-cycle-count-evidence:'||evidence.id::text,727118));
  IF EXISTS(SELECT 1 FROM automation.command_requests prior
      WHERE prior.org_id=organization_id AND prior.capability_code='inventory.adjustment.prepare'
        AND prior.target_resource_id<>inventory_document_id AND prior.status NOT IN ('failed','expired','cancelled')
        AND pg_catalog.convert_from(prior.request_bytes,'UTF8')::jsonb->>'evidence_attachment_id'=evidence.id::text) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cycle-count sheet was already consumed by another command'; END IF;
  SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'inventory_asset','asset','INR',false)
    AND status='active' AND account_type='asset' AND currency_code='INR' AND NOT allows_party_posting FOR SHARE;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','id',location.id,'row_version',location.row_version),
    pg_catalog.jsonb_build_object('resource_type','physical_count_attachment','id',evidence.id,'status',evidence.status,
      'evidence_kind',evidence.evidence_kind,'document_date',evidence.document_date,'verified_at',evidence.verified_at,
      'retention_until',evidence.retention_until,'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','membership','role','physical_counter','id',counted_by),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version));
  PERFORM balance.batch_id FROM inventory.stock_balances balance
    JOIN (SELECT DISTINCT (count_row.value->>'batch_id')::uuid batch_id
      FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value)) requested
      ON requested.batch_id=balance.batch_id
   WHERE balance.org_id=organization_id AND balance.branch_id=branch.id AND balance.location_id=location.id
   ORDER BY balance.batch_id FOR UPDATE OF balance;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    IF NULLIF(requested_line->>'product_id','')::uuid IS NULL OR NULLIF(requested_line->>'uom_conversion_id','')::uuid IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count product and effective UOM conversion are required'; END IF;
    SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
      AND id=(requested_line->>'product_id')::uuid AND status='active' AND cold_chain_required=false
      AND COALESCE(drug_schedule,'NONE') NOT IN ('H','H1','X') AND COALESCE(ndps_regulated,false)=false FOR SHARE;
    IF product.product_kind='medicine' THEN medicine_count:=medicine_count+1; END IF;
    SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
      AND id=(requested_line->>'uom_conversion_id')::uuid AND product_id=product.id AND status='active'
      AND from_uom_code<>to_uom_code AND to_uom_code=product.base_uom_code AND multiplier>0
      AND valid_from<=adjustment_date AND (valid_until IS NULL OR valid_until>=adjustment_date) FOR SHARE;
    conversion_version_hash:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(conversion)::text,'UTF8'),'sha256'),'hex');
    FOR requested_count IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_counts') LOOP
      line_no:=line_no+1;
      IF NULLIF(requested_count->>'inventory_document_line_id','')::uuid IS NULL
         OR NULLIF(requested_count->>'batch_id','')::uuid IS NULL
         OR NULLIF(requested_count->>'stock_balance_row_version','')::bigint IS NULL
         OR NULLIF(requested_count->>'counted_quantity','')::numeric<0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count lot, expected stock version, and nonnegative count are required'; END IF;
      SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id
        AND id=(requested_count->>'batch_id')::uuid AND product_id=product.id AND lot_kind='manufacturer_batch'
        AND status='released' AND released_at IS NOT NULL AND released_at<=counted_at
        AND expires_on IS NOT NULL AND expires_on>adjustment_date AND mrp>0 AND mrp_uom_conversion_id IS NOT NULL FOR SHARE;
      SELECT count(*) INTO recall_count FROM compliance.recall_batches recall_batch
        JOIN compliance.recalls recall ON recall.org_id=recall_batch.org_id AND recall.id=recall_batch.recall_id
       WHERE recall_batch.org_id=organization_id AND recall_batch.batch_id=batch.id
         AND recall.status IN ('initiated','in_progress') AND recall_batch.status IN ('identified','quarantined');
      IF recall_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recalled lot cannot be cycle-counted into available stock'; END IF;
      SELECT * INTO STRICT balance FROM inventory.stock_balances AS stock_balance
       WHERE stock_balance.org_id=organization_id AND stock_balance.branch_id=branch.id
        AND stock_balance.location_id=location.id AND stock_balance.product_id=product.id
        AND stock_balance.batch_id=batch.id AND stock_balance.on_hand_quantity>0
        AND stock_balance.inventory_value>0 AND stock_balance.average_unit_cost>0
        AND stock_balance.row_version=(requested_count->>'stock_balance_row_version')::bigint FOR UPDATE;
      SELECT * INTO STRICT last_ledger FROM inventory.stock_ledger_entries AS ledger_entry
       WHERE ledger_entry.org_id=organization_id AND ledger_entry.id=balance.last_ledger_entry_id
        AND ledger_entry.branch_id=branch.id AND ledger_entry.location_id=location.id
        AND ledger_entry.product_id=product.id AND ledger_entry.batch_id=batch.id
        AND ledger_entry.posted_at<=counted_at FOR SHARE;
      SELECT count(*) INTO pending_count FROM inventory.inventory_document_lines pending_line
        JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id AND pending.id=pending_line.inventory_document_id
       WHERE pending_line.org_id=organization_id AND pending.id<>inventory_document_id
         AND pending.status IN ('draft','submitted','approved') AND pending_line.product_id=product.id
         AND pending_line.batch_id=batch.id AND location.id IN (pending_line.from_location_id,pending_line.to_location_id);
      IF pending_count<>0 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='cycle-count lot has a pending inventory source or movement document'; END IF;
      counted_base:=pg_catalog.round((requested_count->>'counted_quantity')::numeric*conversion.multiplier,6);
      variance_base:=counted_base-balance.on_hand_quantity;
      extended_cost:=CASE WHEN pg_catalog.abs(variance_base)=balance.on_hand_quantity
        THEN balance.inventory_value
        ELSE pg_catalog.round(pg_catalog.abs(variance_base)*balance.average_unit_cost,2) END;
      IF variance_base=0 OR extended_cost<=0 OR counted_base<0 THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='cycle count requires one nonzero valued variance'; END IF;
      line_effect:=CASE WHEN variance_base>0 THEN 'gain' ELSE 'loss' END;
      IF variance_effect IS NULL THEN variance_effect:=line_effect;
      ELSIF variance_effect<>line_effect THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='one cycle-count command cannot mix gain and loss variances'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_no,'inventory_document_line_id',requested_count->>'inventory_document_line_id',
        'product_id',product.id,'batch_id',batch.id,'uom_conversion_id',conversion.id,'uom_code',product.base_uom_code,
        'selected_uom_code',conversion.from_uom_code,'uom_multiplier',conversion.multiplier::text,
        'counted_quantity',(requested_count->>'counted_quantity'),'system_base_quantity',balance.on_hand_quantity::text,
        'counted_base_quantity',counted_base::text,'variance_base_quantity',variance_base::text,
        'unit_cost',balance.average_unit_cost::text,'extended_cost',extended_cost::text));
      total_base:=total_base+pg_catalog.abs(variance_base); total_value:=total_value+extended_cost;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version,
          'drug_schedule',product.drug_schedule,'ndps_regulated',product.ndps_regulated,'cold_chain_required',product.cold_chain_required),
        pg_catalog.jsonb_build_object('resource_type','uom_conversion','id',conversion.id,'version_hash',conversion_version_hash,
          'from_uom_code',conversion.from_uom_code,'to_uom_code',conversion.to_uom_code,'multiplier',conversion.multiplier::text,
          'valid_from',conversion.valid_from,'valid_until',conversion.valid_until),
        pg_catalog.jsonb_build_object('resource_type','inventory_batch','id',batch.id,'row_version',batch.row_version,
          'status',batch.status,'expires_on',batch.expires_on,'mrp',batch.mrp::text,'mrp_uom_conversion_id',batch.mrp_uom_conversion_id),
        pg_catalog.jsonb_build_object('resource_type','stock_balance','branch_id',branch.id,
          'location_id',location.id,'product_id',product.id,'batch_id',batch.id,'row_version',balance.row_version,
          'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,
          'average_unit_cost',balance.average_unit_cost::text,'last_ledger_entry_id',balance.last_ledger_entry_id,
          'last_ledger_posted_at',last_ledger.posted_at),
        pg_catalog.jsonb_build_object('resource_type','active_recall_state','batch_id',batch.id,'active_count',recall_count),
        pg_catalog.jsonb_build_object('resource_type','pending_inventory_document_state','batch_id',batch.id,'active_count',pending_count));
    END LOOP;
  END LOOP;
  SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,
      CASE variance_effect WHEN 'gain' THEN 'inventory_count_gain' ELSE 'inventory_count_loss' END,
      CASE variance_effect WHEN 'gain' THEN 'income' ELSE 'expense' END,'INR',false)
    AND status='active' AND account_type=CASE variance_effect WHEN 'gain' THEN 'income' ELSE 'expense' END
    AND currency_code='INR' AND NOT allows_party_posting FOR SHARE;
  source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'resource_type','finance_account','role',CASE variance_effect WHEN 'gain' THEN 'inventory_count_gain' ELSE 'inventory_count_loss' END,
    'id',variance_account.id,'row_version',variance_account.row_version));
  IF medicine_count>0 THEN
    SELECT count(DISTINCT license.license_type_code),
           pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'resource_type','counting_branch_wholesale_license','id',license.id,'row_version',license.row_version,
             'license_type_code',license.license_type_code,'evidence_attachment_id',license.evidence_attachment_id,
             'evidence_status',attachment.status,'evidence_sha256',pg_catalog.encode(attachment.sha256,'hex'),
             'next_verification_due_on',license.next_verification_due_on) ORDER BY license.license_type_code,license.id)
      INTO license_type_count,license_sources
      FROM compliance.licenses license JOIN core.attachments attachment
        ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
     WHERE license.org_id=organization_id AND license.branch_id=branch.id
       AND license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')
       AND license.status='active' AND license.valid_from<=adjustment_date
       AND (license.valid_until IS NULL OR license.valid_until>=adjustment_date)
       AND license.next_verification_due_on>=adjustment_date
       AND attachment.status IN ('verified','retained') AND attachment.verified_at IS NOT NULL
       AND attachment.verified_at<=pg_catalog.transaction_timestamp();
    IF license_type_count<>2 THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='counting branch lacks verified effective Forms 20B and 21B wholesale custody evidence'; END IF;
    source_versions:=source_versions||license_sources;
  END IF;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'adjustment_date',adjustment_date,
    'counted_at',counted_at,'counted_by_membership_id',counted_by,'location_id',location.id,
    'evidence_attachment_id',evidence.id,'inventory_asset_account_id',inventory_account.id,
    'inventory_variance_account_id',variance_account.id,'variance_effect',variance_effect,'lines',resolved_lines,
    'total_base_quantity',total_base::text,'total_value',total_value::text,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','reason','cycle_count',
      'supported_effect','homogeneous_gain_or_loss','variance_effect',variance_effect,'valuation','current_moving_weighted_average',
      'tax_effect','no_supply_no_gst_no_itc_claim_or_reversal','physical_movement_required',false,
      'unsupported_fail_closed',pg_catalog.jsonb_build_array('zero_or_mixed_variance','backdated_count',
        'cold_chain_or_controlled_product','active_recall','pending_inventory_source','reversal')));
END
''',
            runtime=True,
        ),
        *_function(
            '"assert_inventory_adjustment_draft"(organization_id uuid, inventory_document_id uuid, journal_id uuid, resolved_document jsonb)',
            "void",
            '''
DECLARE document inventory.inventory_documents%ROWTYPE; journal finance.journal_entries%ROWTYPE;
BEGIN
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR SHARE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR SHARE;
  IF ROW(document.branch_id,document.document_type,document.document_date,document.status,document.reason_code,
         document.currency_code,document.costing_method_snapshot,document.total_abs_base_quantity,document.total_value,
         document.physical_movement_required,document.destination_branch_id,document.reverses_document_id)
     IS DISTINCT FROM ROW((resolved_document->>'branch_id')::uuid,'stock_count',(resolved_document->>'adjustment_date')::date,
         'submitted','cycle_count','INR'::bpchar,'moving_weighted_average',
         (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric,false,NULL::uuid,NULL::uuid)
     OR (SELECT count(*) FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id)<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR EXISTS(SELECT 1 FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id AND NOT EXISTS(
            SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') expected(value)
             WHERE (expected.value->>'inventory_document_line_id')::uuid=line.id
               AND (expected.value->>'line_number')::integer=line.line_number AND line.movement_kind='count_adjustment'
               AND (expected.value->>'product_id')::uuid=line.product_id AND (expected.value->>'batch_id')::uuid=line.batch_id
               AND expected.value->>'uom_code'=line.uom_code
               AND pg_catalog.abs((expected.value->>'variance_base_quantity')::numeric)=line.entered_quantity
               AND pg_catalog.abs((expected.value->>'variance_base_quantity')::numeric)=line.base_quantity
               AND (resolved_document->>'location_id')::uuid=line.from_location_id AND line.to_location_id IS NULL
               AND (expected.value->>'system_base_quantity')::numeric=line.system_quantity
               AND (expected.value->>'counted_base_quantity')::numeric=line.counted_quantity
               AND (expected.value->>'variance_base_quantity')::numeric=line.variance_quantity
               AND (expected.value->>'unit_cost')::numeric=line.unit_cost
               AND (expected.value->>'extended_cost')::numeric=line.extended_cost)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared cycle-count inventory draft differs from approved preview'; END IF;
  IF ROW(journal.posting_date,journal.status,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,journal.functional_credit_total)
     IS DISTINCT FROM ROW((resolved_document->>'adjustment_date')::date,'draft','INR'::bpchar,'INR'::bpchar,1::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)<>2
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.line_number=1 AND line.account_id=CASE resolved_document->>'variance_effect'
         WHEN 'gain' THEN (resolved_document->>'inventory_asset_account_id')::uuid
         ELSE (resolved_document->>'inventory_variance_account_id')::uuid END
       AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
       AND line.transaction_debit=(resolved_document->>'total_value')::numeric AND line.transaction_credit=0
       AND line.functional_debit=(resolved_document->>'total_value')::numeric AND line.functional_credit=0)
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.line_number=2 AND line.account_id=CASE resolved_document->>'variance_effect'
         WHEN 'gain' THEN (resolved_document->>'inventory_variance_account_id')::uuid
         ELSE (resolved_document->>'inventory_asset_account_id')::uuid END
       AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
       AND line.transaction_debit=0 AND line.transaction_credit=(resolved_document->>'total_value')::numeric
       AND line.functional_debit=0 AND line.functional_credit=(resolved_document->>'total_value')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared cycle-count valuation journal differs from approved preview'; END IF;
END
''',
        ),
        *_function(
            '"persist_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, document_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document jsonb:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        preview_document jsonb:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
        current_resolution jsonb; existing automation.command_requests%ROWTYPE;
        aggregate_hash bytea; document_sequence_id uuid; journal_sequence_id uuid;
        document_number text; journal_number text; fiscal_year integer; resolved_line jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR expires_at<=pg_catalog.transaction_timestamp()
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text
     OR request_document->>'event_id' IS DISTINCT FROM event_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count runtime persistence boundary is invalid'; END IF;
  current_resolution:="{SCHEMA}"."resolve_inventory_adjustment_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,inventory_document_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document
     OR preview_document->>'operation'<>'inventory.document.post'
     OR preview_document->>'capability_code'<>'inventory.adjustment.prepare'
     OR preview_document->>'target_resource_type'<>'inventory_document'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='inventory.adjustment.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM inventory_document_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cycle-count idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'adjustment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'adjustment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'adjustment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'inventory.adjustment.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,inventory_document_id,(resolved_document->>'total_value')::numeric,'INR',
    key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT document_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='stock_count'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  document_number:=erp_core_commands.allocate_document_number(organization_id,document_sequence_id,document_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,physical_movement_required,document_type,document_number,
    fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,total_value)
  VALUES(organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,false,'stock_count',document_number,
    fiscal_year,(resolved_document->>'adjustment_date')::date,'submitted','cycle_count','INR','moving_weighted_average',
    (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric);
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,
      product_id,batch_id,uom_code,entered_quantity,base_quantity,from_location_id,system_quantity,counted_quantity,
      variance_quantity,unit_cost,extended_cost)
    VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,inventory_document_id,
      (resolved_line->>'line_number')::integer,'count_adjustment',(resolved_line->>'product_id')::uuid,
      (resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',pg_catalog.abs((resolved_line->>'variance_base_quantity')::numeric),
      pg_catalog.abs((resolved_line->>'variance_base_quantity')::numeric),(resolved_document->>'location_id')::uuid,
      (resolved_line->>'system_base_quantity')::numeric,(resolved_line->>'counted_base_quantity')::numeric,
      (resolved_line->>'variance_base_quantity')::numeric,(resolved_line->>'unit_cost')::numeric,
      (resolved_line->>'extended_cost')::numeric);
  END LOOP;
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'adjustment_date')::date,
    'Physical cycle-count '||(resolved_document->>'variance_effect')||' '||document_number,'INR','INR',1,(resolved_document->>'total_value')::numeric,
    (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
    (resolved_document->>'total_value')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,CASE resolved_document->>'variance_effect'
        WHEN 'gain' THEN (resolved_document->>'inventory_asset_account_id')::uuid
        ELSE (resolved_document->>'inventory_variance_account_id')::uuid END,
      (resolved_document->>'branch_id')::uuid,'Cycle-count '||(resolved_document->>'variance_effect')||' debit',
      (resolved_document->>'total_value')::numeric,0,(resolved_document->>'total_value')::numeric,0),
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,CASE resolved_document->>'variance_effect'
        WHEN 'gain' THEN (resolved_document->>'inventory_variance_account_id')::uuid
        ELSE (resolved_document->>'inventory_asset_account_id')::uuid END,
      (resolved_document->>'branch_id')::uuid,'Cycle-count '||(resolved_document->>'variance_effect')||' credit',0,(resolved_document->>'total_value')::numeric,
      0,(resolved_document->>'total_value')::numeric);
  PERFORM "{SCHEMA}"."assert_inventory_adjustment_draft"(organization_id,inventory_document_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            runtime=True,
        ),
    ]


def _sales_return_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_sales_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, sales_return_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        original_invoice_id uuid:=NULLIF(request_document->>'original_invoice_id','')::uuid;
        return_date date:=NULLIF(request_document->>'return_date','')::date;
        invoice sales.invoices%ROWTYPE; original_tax tax.documents%ROWTYPE;
        customer parties.customer_accounts%ROWTYPE; buyer_registration parties.tax_registrations%ROWTYPE;
        rule tax.gst_adjustment_rule_versions%ROWTYPE; rule_release core.reference_data_releases%ROWTYPE;
        evidence core.attachments%ROWTYPE; original_artifact calculation.artifacts%ROWTYPE;
        requested_line jsonb; source sales.invoice_lines%ROWTYPE; invoice_allocation sales.invoice_dispatch_allocations%ROWTYPE;
        dispatch_line sales.dispatch_lines%ROWTYPE; dispatch sales.dispatches%ROWTYPE;
        issue_line inventory.inventory_document_lines%ROWTYPE; issue_document inventory.inventory_documents%ROWTYPE;
        issue_ledger inventory.stock_ledger_entries%ROWTYPE; batch inventory.batches%ROWTYPE; destination inventory.locations%ROWTYPE;
        receivable finance.accounts%ROWTYPE; inventory_account finance.accounts%ROWTYPE; cogs_account finance.accounts%ROWTYPE;
        revenue_account finance.accounts%ROWTYPE; resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        prior_state jsonb; prior_billed numeric(20,6); prior_free numeric(20,6);
        requested_billed numeric(20,6); requested_free numeric(20,6); base_billed numeric(20,6); base_free numeric(20,6);
        candidate_count integer; line_number integer:=0; is_final boolean; legal_scope jsonb; adjustment_deadline date;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
       OR grant_id IS NULL OR sales_return_id IS NULL OR requested_branch_id IS NULL OR original_invoice_id IS NULL
       OR return_date IS NULL OR request_document->>'reason_code' IS NULL
       OR request_document->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-return input is incomplete'; END IF;
    IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
       <>(SELECT count(DISTINCT value->>'original_invoice_line_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales-return pilot requires one unique invoice line and batch per command'; END IF;
    PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
       AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
       AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
       AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
       AND capability.capability_code='sales.return.prepare' AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-return delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
       OR erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.return.create',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('sales.return.post',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-return verified context or cross-domain permission is inactive'; END IF;
    SELECT * INTO STRICT invoice FROM sales.invoices WHERE org_id=organization_id AND id=original_invoice_id
       AND branch_id=requested_branch_id AND status='posted' AND invoice_type='tax_invoice' AND currency_code='INR'
       AND tax_charge_mechanism='normal' FOR UPDATE;
    IF return_date<invoice.invoice_date THEN RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales return cannot precede original invoice'; END IF;
    SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND sales_invoice_id=invoice.id
       AND document_effect='original' AND direction='outward' FOR SHARE;
    SELECT * INTO STRICT customer FROM parties.customer_accounts WHERE org_id=organization_id AND id=invoice.customer_account_id
       AND status='active' FOR SHARE;
    SELECT count(*) INTO candidate_count FROM tax.gst_adjustment_rule_versions adjustment_rule
     WHERE adjustment_rule.status='active' AND adjustment_rule.side='sales' AND adjustment_rule.direction='credit'
       AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
       AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment'
       AND adjustment_rule.effective_from<=return_date AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date);
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='sales return requires one exact effective GST adjustment authority matching requested treatment'; END IF;
    SELECT * INTO STRICT rule FROM tax.gst_adjustment_rule_versions adjustment_rule
     WHERE adjustment_rule.status='active' AND adjustment_rule.side='sales' AND adjustment_rule.direction='credit'
       AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
       AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment'
       AND adjustment_rule.effective_from<=return_date AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date) FOR SHARE;
    SELECT * INTO STRICT rule_release FROM core.reference_data_releases WHERE id=rule.release_id AND status='active' FOR SHARE;
    IF rule.tax_effect='statutory' THEN
      IF invoice.customer_tax_registration_id IS NULL OR NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid IS NULL
         OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz IS NULL
         OR (request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz>pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires registered buyer and explicit past ITC-reversal confirmation'; END IF;
      SELECT * INTO STRICT buyer_registration FROM parties.tax_registrations WHERE org_id=organization_id
        AND id=invoice.customer_tax_registration_id AND party_id=customer.party_id AND registration_type='GSTIN'
        AND status='active' AND verified_at IS NOT NULL AND taxpayer_type IN ('regular','casual')
        AND (valid_from IS NULL OR valid_from<=return_date) AND (valid_until IS NULL OR valid_until>=return_date) FOR SHARE;
      SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id
        AND id=(request_document->>'recipient_itc_reversal_evidence_attachment_id')::uuid
        AND evidence_kind='recipient_itc_reversal'
        AND status IN ('verified','retained') AND verified_at IS NOT NULL
        AND verified_at<=(request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz FOR SHARE;
      IF rule.deadline_policy='days_after_original' THEN adjustment_deadline:=invoice.invoice_date+rule.deadline_days;
      ELSIF rule.deadline_policy='november_30_following_fy' THEN
        adjustment_deadline:=pg_catalog.make_date(pg_catalog.date_part('year',invoice.invoice_date)::integer+
          CASE WHEN pg_catalog.date_part('month',invoice.invoice_date)>=4 THEN 1 ELSE 0 END,11,30);
        SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
          FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
         WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
           AND filing.return_type='gstr9' AND filing.status='filed'
           AND period.period_start<=invoice.invoice_date AND period.period_end>=invoice.invoice_date;
      END IF;
      IF adjustment_deadline IS NOT NULL AND return_date>adjustment_deadline THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales return is after the exact effective-rule deadline'; END IF;
    ELSIF NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','') IS NOT NULL
       OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','') IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only sales return forbids ITC-reversal evidence fields';
    END IF;
    SELECT * INTO STRICT original_artifact FROM calculation.artifacts WHERE org_id=organization_id
      AND sales_invoice_id=invoice.id AND operation='sales.invoice.post' AND status='consumed' FOR SHARE;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||invoice.id::text,734821));
    SELECT pg_catalog.jsonb_build_object(
      'products',coalesce(pg_catalog.jsonb_agg(item ORDER BY item->>'line_id'),'[]'::jsonb),
      'charges','[]'::jsonb,
      'rounding_adjustment',coalesce((SELECT sum(prior.rounding_adjustment) FROM sales.returns prior
        WHERE prior.org_id=organization_id AND prior.invoice_id=invoice.id AND prior.status='posted'),0)::text)
      INTO prior_state
      FROM (
        SELECT pg_catalog.jsonb_build_object('line_id',line.invoice_line_id,'value_basis',min(line.reversal_value_basis),
          'reversed_billed_quantity',sum(line.billed_quantity)::text,'reversed_free_quantity',sum(line.free_quantity)::text,
          'reversed_base_billed_quantity',sum(line.base_billed_quantity)::text,'reversed_base_free_quantity',sum(line.base_free_quantity)::text,
          'gross_price_amount',sum((calculated.value->>'gross_amount')::numeric)::text,
          'line_discount_amount',sum((calculated.value->>'line_discount_amount')::numeric)::text,
          'document_discount_amount',sum((calculated.value->>'document_discount_amount')::numeric)::text,
          'net_value_amount',sum(line.net_value_amount)::text,'gst_taxable_value',sum(line.gst_taxable_value)::text,
          'cgst_amount',sum(line.cgst_amount)::text,'sgst_amount',sum(line.sgst_amount)::text,
          'igst_amount',sum(line.igst_amount)::text,'cess_amount',sum(line.cess_amount)::text) item
        FROM sales.return_lines line JOIN sales.returns parent ON parent.org_id=line.org_id AND parent.id=line.return_id AND parent.status='posted'
        JOIN calculation.artifacts artifact ON artifact.org_id=parent.org_id AND artifact.sales_return_id=parent.id AND artifact.status='consumed'
        JOIN LATERAL pg_catalog.jsonb_array_elements(pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb->'lines') calculated(value)
          ON calculated.value->>'line_id'=line.invoice_line_id::text
        WHERE line.org_id=organization_id AND parent.invoice_id=invoice.id
          AND line.invoice_line_id IN (SELECT (value->>'original_invoice_line_id')::uuid FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
        GROUP BY line.invoice_line_id
      ) prior_items;
    SELECT * INTO STRICT receivable FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'accounts_receivable','asset','INR',true) FOR SHARE;
    IF customer.default_receivable_account_id IS DISTINCT FROM receivable.id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receivable account differs from branch role'; END IF;
    SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'inventory_asset','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT cogs_account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'cost_of_goods_sold','expense','INR',false) FOR SHARE;
    source_versions:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','sales_invoice','id',invoice.id,'row_version',invoice.row_version),
      pg_catalog.jsonb_build_object('resource_type','original_tax_document','id',original_tax.id,'source_hash',pg_catalog.encode(original_tax.source_hash,'hex')),
      pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule','id',rule.id,'release_id',rule.release_id,'rule_version',rule.rule_version,'effective_from',rule.effective_from,'effective_to',rule.effective_to),
      pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule_release','id',rule_release.id,'dataset_sha256',pg_catalog.encode(rule_release.dataset_sha256,'hex')),
      pg_catalog.jsonb_build_object('resource_type','original_calculation_artifact','id',original_artifact.id,'authority_hash',pg_catalog.encode(original_artifact.authority_hash,'hex')),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','accounts_receivable','id',receivable.id,'row_version',receivable.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','cost_of_goods_sold','id',cogs_account.id,'row_version',cogs_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','sales_return_prior_state','invoice_id',invoice.id,
        'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(prior_state::text,'UTF8'),'sha256'),'hex')));
    IF rule.tax_effect='statutory' THEN
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','buyer_tax_registration','id',buyer_registration.id,'row_version',buyer_registration.row_version,
          'valid_from',buyer_registration.valid_from,'valid_until',buyer_registration.valid_until,'verified_at',buyer_registration.verified_at),
        pg_catalog.jsonb_build_object('resource_type','recipient_itc_reversal_evidence','id',evidence.id,'evidence_kind',evidence.evidence_kind,
          'status',evidence.status,'verified_at',evidence.verified_at,'sha256',pg_catalog.encode(evidence.sha256,'hex')));
    END IF;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      line_number:=line_number+1;
      IF requested_line->>'return_condition' NOT IN ('sealed_resaleable','opened','damaged','expired','recalled','quality_hold')
         OR NULLIF(requested_line->>'invoice_dispatch_allocation_id','')::uuid IS NULL
         OR pg_catalog.jsonb_typeof(requested_line->'batch_allocation')<>'object' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-return line requires one dispatch allocation, batch, and condition'; END IF;
      requested_billed:=(requested_line->>'billed_quantity')::numeric; requested_free:=(requested_line->>'free_quantity')::numeric;
      IF requested_billed<0 OR requested_free<0 OR requested_billed+requested_free<=0
         OR (requested_line#>>'{batch_allocation,billed_quantity}')::numeric IS DISTINCT FROM requested_billed
         OR (requested_line#>>'{batch_allocation,free_quantity}')::numeric IS DISTINCT FROM requested_free THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales-return batch quantities must be positive and reconcile separately'; END IF;
      SELECT * INTO STRICT source FROM sales.invoice_lines WHERE org_id=organization_id
        AND id=(requested_line->>'original_invoice_line_id')::uuid AND invoice_id=invoice.id AND line_kind='product' FOR SHARE;
      SELECT * INTO STRICT invoice_allocation FROM sales.invoice_dispatch_allocations WHERE org_id=organization_id
        AND id=(requested_line->>'invoice_dispatch_allocation_id')::uuid AND invoice_line_id=source.id FOR UPDATE;
      SELECT * INTO STRICT dispatch_line FROM sales.dispatch_lines WHERE org_id=organization_id AND id=invoice_allocation.dispatch_line_id FOR SHARE;
      SELECT * INTO STRICT dispatch FROM sales.dispatches WHERE org_id=organization_id AND id=dispatch_line.dispatch_id
        AND status='posted' AND branch_id=invoice.branch_id AND customer_account_id=invoice.customer_account_id FOR SHARE;
      SELECT * INTO STRICT issue_document FROM inventory.inventory_documents WHERE org_id=organization_id
        AND sales_dispatch_id=dispatch.id AND document_type='sales_issue' AND status='posted' FOR SHARE;
      SELECT * INTO STRICT issue_line FROM inventory.inventory_document_lines WHERE org_id=organization_id
        AND inventory_document_id=issue_document.id AND sales_dispatch_line_id=dispatch_line.id
        AND product_id=source.product_id AND batch_id=(requested_line#>>'{batch_allocation,batch_id}')::uuid FOR SHARE;
      SELECT * INTO STRICT issue_ledger FROM inventory.stock_ledger_entries WHERE org_id=organization_id
        AND inventory_document_line_id=issue_line.id AND inventory_document_id=issue_document.id AND entry_kind='issue'
        AND unit_cost=issue_line.unit_cost AND value_delta=-issue_line.extended_cost FOR SHARE;
      SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id AND id=issue_line.batch_id
        AND product_id=source.product_id FOR SHARE;
      SELECT * INTO STRICT destination FROM inventory.locations WHERE org_id=organization_id
        AND id=(requested_line->>'to_location_id')::uuid AND branch_id=invoice.branch_id AND status='active'
        AND location_type='quarantine' AND allows_sale=false FOR SHARE;
      SELECT * INTO STRICT revenue_account FROM finance.accounts WHERE org_id=organization_id AND id=source.revenue_account_id
        AND account_type='income' AND currency_code='INR' AND status='active' FOR SHARE;
      base_billed:=pg_catalog.round(requested_billed*source.uom_conversion_factor,6);
      base_free:=pg_catalog.round(requested_free*source.uom_conversion_factor,6);
      SELECT coalesce(sum(line.base_billed_quantity),0),coalesce(sum(line.base_free_quantity),0) INTO prior_billed,prior_free
        FROM sales.return_lines line JOIN sales.returns parent ON parent.org_id=line.org_id AND parent.id=line.return_id
       WHERE line.org_id=organization_id AND line.invoice_dispatch_allocation_id=invoice_allocation.id AND parent.status='posted';
      IF prior_billed+base_billed>invoice_allocation.allocated_base_billed_quantity
         OR prior_free+base_free>invoice_allocation.allocated_base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales-return billed or free quantity exceeds dispatch allocation'; END IF;
      is_final:=((SELECT coalesce(sum(returned.base_billed_quantity),0) FROM sales.return_lines returned
                    JOIN sales.returns parent ON parent.org_id=returned.org_id AND parent.id=returned.return_id
                   WHERE returned.org_id=organization_id AND returned.invoice_line_id=source.id AND parent.status='posted')+base_billed=source.base_billed_quantity
                 AND (SELECT coalesce(sum(returned.base_free_quantity),0) FROM sales.return_lines returned
                    JOIN sales.returns parent ON parent.org_id=returned.org_id AND parent.id=returned.return_id
                   WHERE returned.org_id=organization_id AND returned.invoice_line_id=source.id AND parent.status='posted')+base_free=source.base_free_quantity);
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_number,'line_id',requested_line->>'line_id','original_invoice_line_id',source.id,
        'invoice_dispatch_allocation_id',invoice_allocation.id,'product_id',source.product_id,'batch_id',batch.id,
        'to_location_id',destination.id,'uom_code',source.uom_code,'uom_conversion_factor',source.uom_conversion_factor,
        'billed_quantity',requested_billed,'free_quantity',requested_free,'base_billed_quantity',base_billed,'base_free_quantity',base_free,
        'final_residual',is_final,'unit_cost',issue_line.unit_cost,
        'extended_cost',pg_catalog.round((base_billed+base_free)*issue_line.unit_cost,2),'inventory_source_line_id',issue_line.id,
        'source',pg_catalog.to_jsonb(source),'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','sales_invoice_line','id',source.id,'invoice_row_version',invoice.row_version),
        pg_catalog.jsonb_build_object('resource_type','invoice_dispatch_allocation','id',invoice_allocation.id,'allocated_base_billed_quantity',invoice_allocation.allocated_base_billed_quantity,'allocated_base_free_quantity',invoice_allocation.allocated_base_free_quantity,'prior_returned_base_billed_quantity',prior_billed,'prior_returned_base_free_quantity',prior_free),
        pg_catalog.jsonb_build_object('resource_type','dispatch','id',dispatch.id,'row_version',dispatch.row_version),
        pg_catalog.jsonb_build_object('resource_type','dispatch_line','id',dispatch_line.id),
        pg_catalog.jsonb_build_object('resource_type','original_issue_line','id',issue_line.id,'unit_cost',issue_line.unit_cost,'extended_cost',issue_line.extended_cost),
        pg_catalog.jsonb_build_object('resource_type','original_issue_ledger','id',issue_ledger.id,'posted_at',issue_ledger.posted_at,'unit_cost',issue_ledger.unit_cost),
        pg_catalog.jsonb_build_object('resource_type','batch','id',batch.id,'row_version',batch.row_version,'status',batch.status),
        pg_catalog.jsonb_build_object('resource_type','quarantine_location','id',destination.id,'row_version',destination.row_version,'allows_sale',destination.allows_sale),
        pg_catalog.jsonb_build_object('resource_type','revenue_account','id',revenue_account.id,'row_version',revenue_account.row_version));
    END LOOP;
    legal_scope:=pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','fulfillment_source','dispatch_allocated',
      'disposition','return_to_stock','destination_location_type','quarantine','tax_charge_mechanism','normal',
      'gst_tax_treatment',rule.tax_effect,'posted_return_reversal','unavailable');
    RETURN pg_catalog.jsonb_build_object('branch_id',invoice.branch_id,'customer_account_id',invoice.customer_account_id,
      'invoice_id',invoice.id,'return_date',return_date,'reason_code',rule.reason_code,'gst_adjustment_rule_version_id',rule.id,
      'gst_tax_treatment',rule.tax_effect,'zero_rated_payment_mode',invoice.zero_rated_payment_mode,
      'tax_charge_mechanism',invoice.tax_charge_mechanism,'rounding_policy',invoice.rounding_policy,
      'ruleset_version',invoice.calculation_ruleset_version,'original_calculation_input',pg_catalog.convert_from(original_artifact.input_bytes,'UTF8')::jsonb,
      'original_calculation_output',pg_catalog.convert_from(original_artifact.output_bytes,'UTF8')::jsonb,
      'prior_state',prior_state,'lines',resolved_lines,'source_versions',source_versions,'legal_scope',legal_scope);
END
''', runtime=True, calculator=True),
        *_function(
            '"assert_sales_return_draft"(organization_id uuid, sales_return_id uuid, inventory_document_id uuid, resolution jsonb)',
            "void",
            '''
DECLARE expected_count bigint:=0; expected_line jsonb; header sales.returns%ROWTYPE;
        document inventory.inventory_documents%ROWTYPE; prepared_return_line sales.return_lines%ROWTYPE;
        prepared_inventory_line inventory.inventory_document_lines%ROWTYPE;
BEGIN
  SELECT * INTO STRICT header FROM sales.returns WHERE org_id=organization_id AND id=sales_return_id FOR UPDATE;
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR UPDATE;
  IF header.status<>'draft' OR header.branch_id IS DISTINCT FROM (resolution->>'branch_id')::uuid
     OR header.invoice_id IS DISTINCT FROM (resolution->>'invoice_id')::uuid OR header.gst_tax_treatment IS DISTINCT FROM resolution->>'gst_tax_treatment'
     OR header.gst_adjustment_rule_version_id IS DISTINCT FROM (resolution->>'gst_adjustment_rule_version_id')::uuid
     OR document.sales_return_id IS DISTINCT FROM header.id OR document.document_type<>'sales_return_receipt'
     OR document.status<>'approved' OR document.branch_id IS DISTINCT FROM header.branch_id THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-return header or owned inventory draft changed'; END IF;
  FOR expected_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolution->'lines') LOOP
    expected_count:=expected_count+1;
    SELECT persisted_return.* INTO STRICT prepared_return_line FROM sales.return_lines persisted_return
     WHERE persisted_return.org_id=organization_id AND persisted_return.return_id=sales_return_id
       AND persisted_return.id=(expected_line->>'line_id')::uuid FOR SHARE;
    SELECT persisted_inventory.* INTO STRICT prepared_inventory_line FROM inventory.inventory_document_lines persisted_inventory
     WHERE persisted_inventory.org_id=organization_id AND persisted_inventory.inventory_document_id=inventory_document_id
       AND persisted_inventory.sales_return_line_id=prepared_return_line.id FOR SHARE;
    IF ROW(prepared_return_line.invoice_line_id,prepared_return_line.invoice_dispatch_allocation_id,
           prepared_return_line.product_id,prepared_return_line.batch_id,prepared_return_line.disposition_location_id,
           prepared_return_line.disposition,prepared_return_line.billed_quantity,prepared_return_line.free_quantity,
           prepared_return_line.uom_conversion_factor,prepared_return_line.base_billed_quantity,
           prepared_return_line.base_free_quantity,prepared_return_line.final_residual,
           prepared_inventory_line.movement_kind,prepared_inventory_line.product_id,prepared_inventory_line.batch_id,
           prepared_inventory_line.to_location_id,prepared_inventory_line.base_quantity,
           prepared_inventory_line.unit_cost,prepared_inventory_line.extended_cost)
       IS DISTINCT FROM ROW((expected_line->>'original_invoice_line_id')::uuid,
           (expected_line->>'invoice_dispatch_allocation_id')::uuid,(expected_line->>'product_id')::uuid,
           (expected_line->>'batch_id')::uuid,(expected_line->>'to_location_id')::uuid,'return_to_stock',
           (expected_line->>'billed_quantity')::numeric,(expected_line->>'free_quantity')::numeric,
           (expected_line->>'uom_conversion_factor')::numeric,(expected_line->>'base_billed_quantity')::numeric,
           (expected_line->>'base_free_quantity')::numeric,(expected_line->>'final_residual')::boolean,'receipt',
           (expected_line->>'product_id')::uuid,(expected_line->>'batch_id')::uuid,(expected_line->>'to_location_id')::uuid,
           (expected_line->>'base_billed_quantity')::numeric+(expected_line->>'base_free_quantity')::numeric,
           (expected_line->>'unit_cost')::numeric,(expected_line->>'extended_cost')::numeric) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-return persisted line differs from locked resolution'; END IF;
  END LOOP;
  IF expected_count=0
     OR expected_count<>(SELECT count(*) FROM sales.return_lines persisted_return
                          WHERE persisted_return.org_id=organization_id AND persisted_return.return_id=sales_return_id)
     OR expected_count<>(SELECT count(*) FROM inventory.inventory_document_lines persisted_inventory
                          WHERE persisted_inventory.org_id=organization_id
                            AND persisted_inventory.inventory_document_id=inventory_document_id) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-return draft line cardinality changed'; END IF;
END
'''),
        *_function(
            '"persist_sales_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, sales_return_id uuid, inventory_document_id uuid, command_id uuid, artifact_id uuid, request_id uuid, adjustment_note_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, return_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
            "jsonb",
            '''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; return_number text; fiscal_year integer;
        claim_id uuid; replay_id uuid; aggregate_hash bytea; requested_total numeric(20,2); return_line_id uuid;
BEGIN
  IF SESSION_USER<>'erp_calculator' OR sales_return_id IS NULL OR inventory_document_id IS NULL OR command_id IS NULL
     OR artifact_id IS NULL OR request_id IS NULL OR adjustment_note_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR allocation_id IS NULL OR residual_open_item_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
     OR pg_catalog.octet_length(return_sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-return prepare persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
  resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
  output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
  current_resolution:="erp_automation_commands"."resolve_sales_return_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,sales_return_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'sales_return_id' IS DISTINCT FROM sales_return_id::text
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
     OR input_document->>'operation'<>'sales.return.post' OR input_document->>'resource_type'<>'sales_return'
     OR input_document->>'resource_id'<>sales_return_id::text OR output_document->>'operation'<>'sales.return.post'
     OR output_document->>'resource_id'<>sales_return_id::text OR output_document->>'gst_tax_treatment' IS DISTINCT FROM resolved_document->>'gst_tax_treatment'
     OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version'
     OR pg_catalog.jsonb_array_length(output_document->'lines')<>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales-return resolution, legal scope, or calculation output changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='sales.return.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM sales_return_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-return idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  totals:=output_document->'totals'; requested_total:=(totals->>'grand_total')::numeric;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'return_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'return_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'return_date')::date)::integer-1 END;
  SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence WHERE sequence.org_id=organization_id
    AND sequence.branch_id=(resolved_document->>'branch_id')::uuid AND sequence.document_type='sales_return'
    AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND sequence.status='active' FOR SHARE;
  return_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,return_sequence_key_hash,expires_at);
  INSERT INTO sales.returns(org_id,id,branch_id,customer_account_id,invoice_id,return_number,fiscal_year,return_date,reason_code,
    gst_adjustment_rule_version_id,gst_tax_treatment,recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,
    status,calculation_ruleset_version,zero_rated_payment_mode,tax_charge_mechanism,net_value_total,gst_taxable_total,cgst_total,
    sgst_total,igst_total,cess_total,recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
  VALUES(organization_id,sales_return_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'customer_account_id')::uuid,
    (resolved_document->>'invoice_id')::uuid,return_number,fiscal_year,(resolved_document->>'return_date')::date,
    resolved_document->>'reason_code',(resolved_document->>'gst_adjustment_rule_version_id')::uuid,resolved_document->>'gst_tax_treatment',
    NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid,
    NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz,'draft',resolved_document->>'ruleset_version',
    resolved_document->>'zero_rated_payment_mode',resolved_document->>'tax_charge_mechanism',(totals->>'net_value_total')::numeric,
    (totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,
    (totals->>'cess_total')::numeric,(totals->>'recipient_assessed_tax_total')::numeric,resolved_document->>'rounding_policy',
    (totals->>'rounding_adjustment')::numeric,requested_total);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,physical_movement_required,document_type,document_number,fiscal_year,
    document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,total_value,sales_return_id,
    approved_at,approved_by_membership_id)
  SELECT organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,false,'sales_return_receipt',return_number,
    fiscal_year,(resolved_document->>'return_date')::date,'approved','sales_return','INR','moving_weighted_average',
    sum((value->>'base_billed_quantity')::numeric+(value->>'base_free_quantity')::numeric),sum((value->>'extended_cost')::numeric),
    sales_return_id,pg_catalog.transaction_timestamp(),membership_id FROM pg_catalog.jsonb_array_elements(resolved_document->'lines');
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines')
      WHERE value->>'line_id'=resolved_line->>'original_invoice_line_id';
    return_line_id:=(resolved_line->>'line_id')::uuid;
    INSERT INTO sales.return_lines(org_id,id,return_id,line_number,invoice_line_id,invoice_dispatch_allocation_id,product_id,batch_id,
      disposition_location_id,disposition,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,
      reversal_value_basis,final_residual,gst_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,free_supply_tax_treatment,
      net_value_amount,hsn_code_snapshot,tax_code_version_id,taxability_snapshot,gst_taxable_value,cgst_rate,sgst_rate,igst_rate,
      cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,line_total)
    VALUES(organization_id,return_line_id,sales_return_id,(resolved_line->>'line_number')::integer,
      (resolved_line->>'original_invoice_line_id')::uuid,(resolved_line->>'invoice_dispatch_allocation_id')::uuid,
      (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,(resolved_line->>'to_location_id')::uuid,'return_to_stock',
      (resolved_line->>'billed_quantity')::numeric,(resolved_line->>'free_quantity')::numeric,
      (resolved_line->>'uom_conversion_factor')::numeric,(resolved_line->>'base_billed_quantity')::numeric,
      (resolved_line->>'base_free_quantity')::numeric,'billed_quantity',(resolved_line->>'final_residual')::boolean,
      resolved_document->>'gst_tax_treatment',(resolved_line#>>'{source,quoted_unit_rate}')::numeric,
      resolved_line#>>'{source,price_basis}',resolved_document->>'tax_charge_mechanism',resolved_line#>>'{source,free_supply_tax_treatment}',
      (calculated_line->>'net_value_amount')::numeric,resolved_line#>>'{source,tax_classification_code_snapshot}',
      (resolved_line#>>'{source,tax_code_version_id}')::uuid,resolved_line#>>'{source,taxability_snapshot}',
      (calculated_line->>'gst_taxable_value')::numeric,(calculated_line->>'cgst_rate')::numeric,(calculated_line->>'sgst_rate')::numeric,
      (calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,(calculated_line->>'cgst_amount')::numeric,
      (calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,(calculated_line->>'cess_amount')::numeric,
      (calculated_line->>'line_total')::numeric);
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
      uom_code,entered_quantity,base_quantity,to_location_id,unit_cost,extended_cost,sales_return_line_id)
    VALUES(organization_id,gen_random_uuid(),inventory_document_id,(resolved_line->>'line_number')::integer,'receipt',
      (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',
      (resolved_line->>'billed_quantity')::numeric+(resolved_line->>'free_quantity')::numeric,
      (resolved_line->>'base_billed_quantity')::numeric+(resolved_line->>'base_free_quantity')::numeric,
      (resolved_line->>'to_location_id')::uuid,(resolved_line->>'unit_cost')::numeric,(resolved_line->>'extended_cost')::numeric,return_line_id);
  END LOOP;
  PERFORM erp_commercial_commands.assert_sales_return_artifact(organization_id,sales_return_id,input_document,output_document);
  PERFORM "erp_automation_commands"."assert_sales_return_draft"(organization_id,sales_return_id,inventory_document_id,resolved_document);
  aggregate_hash:="erp_automation_commands"."aggregate_version_hash"('sales_return',sales_return_id,1);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'sales.return.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,sales_return_id,requested_total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
    'sales.return.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
  IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='sales-return prepare replay reached a completed execution claim'; END IF;
  PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,'sales.return.post',
    'sales_return',sales_return_id,1,request_id,command_id,claim_id,extensions.digest(request_bytes,'sha256'),
    calculation_input_bytes,calculation_output_bytes,output_document->>'engine_version',output_document->>'ruleset_version',
    'aasopharma-jcs-decimal-v1',expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''', calculator=True),
    ]


def _purchase_return_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_purchase_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_return_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        supplier_invoice_id uuid:=NULLIF(request_document->>'original_supplier_invoice_id','')::uuid;
        return_date date:=NULLIF(request_document->>'return_date','')::date;
        logistics jsonb:=request_document->'logistics'; transport_mode text:=logistics->>'transport_mode';
        transporter_party_id uuid:=NULLIF(logistics->>'transporter_party_id','')::uuid;
        invoice procurement.supplier_invoices%ROWTYPE; original_tax tax.documents%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        supplier_registration parties.tax_registrations%ROWTYPE; destination parties.addresses%ROWTYPE;
        branch core.branches%ROWTYPE; transporter parties.parties%ROWTYPE; transporter_registration parties.tax_registrations%ROWTYPE;
        rule tax.gst_adjustment_rule_versions%ROWTYPE; rule_release core.reference_data_releases%ROWTYPE;
        portal_line tax.portal_document_lines%ROWTYPE; portal_document tax.portal_documents%ROWTYPE;
        original_artifact calculation.artifacts%ROWTYPE; original_open finance.open_items%ROWTYPE; original_event finance.accounting_events%ROWTYPE;
        requested_line jsonb; source procurement.supplier_invoice_lines%ROWTYPE;
        invoice_allocation procurement.supplier_invoice_receipt_allocations%ROWTYPE;
        receipt_line procurement.goods_receipt_lines%ROWTYPE; receipt procurement.goods_receipts%ROWTYPE;
        receipt_document inventory.inventory_documents%ROWTYPE; receipt_inventory_line inventory.inventory_document_lines%ROWTYPE;
        batch inventory.batches%ROWTYPE; source_location inventory.locations%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        inventory_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb; prior_state jsonb;
        requested_billed numeric(20,6); requested_free numeric(20,6); base_billed numeric(20,6); base_free numeric(20,6);
        prior_billed numeric(20,6); prior_free numeric(20,6); line_number integer:=0; candidate_count integer;
        is_final boolean; legal_scope jsonb; adjustment_deadline date; original_output jsonb;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR purchase_return_id IS NULL OR requested_branch_id IS NULL OR supplier_invoice_id IS NULL
     OR return_date IS NULL OR request_document->>'return_source_kind'<>'invoiced'
     OR request_document->>'reason_code' NOT IN ('wrong_supply','excess_supply')
     OR request_document->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
     OR NULLIF(request_document->>'supplier_destination_address_id','')::uuid IS NULL
     OR pg_catalog.jsonb_typeof(logistics)<>'object' OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-return invoiced pilot input is incomplete'; END IF;
  IF transport_mode NOT IN ('road','rail','air','ship','multimodal','in_person')
     OR NULLIF(logistics->>'distance_km','')::numeric<0
     OR (transport_mode='road' AND (NULLIF(logistics->>'vehicle_number','') IS NULL OR logistics->>'vehicle_type' NOT IN ('regular','over_dimensional_cargo')))
     OR (transport_mode<>'road' AND (NULLIF(logistics->>'vehicle_number','') IS NOT NULL OR NULLIF(logistics->>'vehicle_type','') IS NOT NULL))
     OR (transport_mode IN ('rail','air','ship','multimodal') AND (NULLIF(logistics->>'transport_document_number','') IS NULL OR NULLIF(logistics->>'transport_document_date','')::date IS NULL))
     OR ((NULLIF(logistics->>'transport_document_number','') IS NULL) IS DISTINCT FROM (NULLIF(logistics->>'transport_document_date','') IS NULL))
     OR (transport_mode='in_person' AND (transporter_party_id IS NOT NULL OR NULLIF(logistics->>'transport_document_number','') IS NOT NULL))
     OR (transport_mode<>'in_person' AND transporter_party_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return logistics fields do not match the selected transport mode'; END IF;
  IF (SELECT count(DISTINCT value->>'goods_receipt_line_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
       <>pg_catalog.jsonb_array_length(request_document->'lines') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return pilot requires unique receipt lines and supplier-invoice sources'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp()
     AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
     AND capability.capability_code='procurement.purchase_return.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('procurement.purchase_return.create',requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('procurement.return.post',requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=requested_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT invoice FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=supplier_invoice_id
    AND branch_id=requested_branch_id AND status='posted' AND currency_code='INR' AND supply_type IN ('intra_state','inter_state')
    AND zero_rated_payment_mode='not_applicable' AND tax_charge_mechanism='normal' FOR UPDATE;
  IF return_date<invoice.supplier_invoice_date THEN RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='purchase return cannot precede supplier invoice'; END IF;
  SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=invoice.supplier_account_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT supplier_party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT destination FROM parties.addresses WHERE org_id=organization_id
    AND id=(request_document->>'supplier_destination_address_id')::uuid AND party_id=supplier.party_id
    AND address_kind IN ('registered','shipping','warehouse') AND status='active'
    AND (valid_from IS NULL OR valid_from<=return_date) AND (valid_until IS NULL OR valid_until>=return_date) FOR SHARE;
  IF transporter_party_id IS NOT NULL THEN
    SELECT * INTO STRICT transporter FROM parties.parties WHERE org_id=organization_id AND id=transporter_party_id
      AND status='active' FOR SHARE;
    SELECT * INTO transporter_registration FROM parties.tax_registrations WHERE org_id=organization_id AND party_id=transporter.id
      AND registration_type='GSTIN' AND status='active' AND (valid_from IS NULL OR valid_from<=return_date)
      AND (valid_until IS NULL OR valid_until>=return_date) ORDER BY id LIMIT 1 FOR SHARE;
  END IF;
  SELECT tax_document.* INTO STRICT original_tax FROM tax.documents tax_document
   WHERE tax_document.org_id=organization_id AND tax_document.supplier_invoice_id=invoice.id
     AND tax_document.direction='inward' AND tax_document.document_effect='original' FOR SHARE;
  SELECT * INTO STRICT supplier_registration FROM parties.tax_registrations WHERE org_id=organization_id
    AND id=invoice.supplier_tax_registration_id AND party_id=supplier.party_id AND registration_type='GSTIN'
    AND registration_number=original_tax.counterparty_gstin AND status='active' AND verified_at IS NOT NULL
    AND taxpayer_type IN ('regular','casual') AND (valid_from IS NULL OR valid_from<=return_date)
    AND (valid_until IS NULL OR valid_until>=return_date) FOR SHARE;
  SELECT artifact.* INTO STRICT original_artifact FROM calculation.artifacts artifact
   WHERE artifact.org_id=organization_id AND artifact.supplier_invoice_id=invoice.id
     AND artifact.operation='procurement.supplier_invoice.post' AND artifact.status='consumed' FOR SHARE;
  SELECT * INTO STRICT original_event FROM finance.accounting_events event
   WHERE event.org_id=organization_id AND event.supplier_invoice_id=invoice.id FOR SHARE;
  SELECT * INTO STRICT original_open FROM finance.open_items open_item
   WHERE open_item.org_id=organization_id AND open_item.accounting_event_id=original_event.id FOR UPDATE;
  SELECT count(*) INTO candidate_count FROM tax.gst_adjustment_rule_versions adjustment_rule
   WHERE adjustment_rule.status='active' AND adjustment_rule.side='purchase' AND adjustment_rule.direction='debit'
     AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
     AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment' AND adjustment_rule.effective_from<=return_date
     AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date);
  IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='purchase return requires one exact effective GST adjustment authority matching treatment'; END IF;
  SELECT * INTO STRICT rule FROM tax.gst_adjustment_rule_versions adjustment_rule
   WHERE adjustment_rule.status='active' AND adjustment_rule.side='purchase' AND adjustment_rule.direction='debit'
     AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
     AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment' AND adjustment_rule.effective_from<=return_date
     AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date) FOR SHARE;
  SELECT * INTO STRICT rule_release FROM core.reference_data_releases WHERE id=rule.release_id AND status='active' FOR SHARE;
  IF rule.tax_effect='statutory' THEN
    IF NULLIF(request_document->>'supplier_credit_note_portal_line_id','')::uuid IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory purchase return requires exact supplier GSTR-2B credit-note evidence'; END IF;
    SELECT line.* INTO STRICT portal_line FROM tax.portal_document_lines line JOIN tax.portal_documents parent
      ON parent.org_id=line.org_id AND parent.id=line.portal_document_id
     WHERE line.org_id=organization_id AND line.id=(request_document->>'supplier_credit_note_portal_line_id')::uuid
       AND parent.portal_document_type='gstr2b' AND parent.status='parsed' AND parent.registration_id=original_tax.registration_id
       AND line.document_type='credit_note' AND line.supplier_gstin=original_tax.counterparty_gstin
       AND line.place_of_supply_state_code=original_tax.place_of_supply_state_code FOR SHARE OF line,parent;
    SELECT * INTO STRICT portal_document FROM tax.portal_documents WHERE org_id=organization_id AND id=portal_line.portal_document_id FOR SHARE;
    SELECT count(*) INTO candidate_count FROM tax.portal_document_lines line JOIN tax.portal_documents parent
      ON parent.org_id=line.org_id AND parent.id=line.portal_document_id
     WHERE line.org_id=organization_id AND parent.portal_document_type='gstr2b' AND parent.status='parsed'
       AND parent.registration_id=original_tax.registration_id AND line.document_type='credit_note'
       AND ROW(line.supplier_gstin,line.invoice_number,line.invoice_date,line.place_of_supply_state_code)
         IS NOT DISTINCT FROM ROW(portal_line.supplier_gstin,portal_line.invoice_number,portal_line.invoice_date,portal_line.place_of_supply_state_code);
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier credit note is ambiguous across parsed GSTR-2B evidence'; END IF;
    IF rule.deadline_policy='days_after_original' THEN adjustment_deadline:=invoice.supplier_invoice_date+rule.deadline_days;
    ELSIF rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date(pg_catalog.date_part('year',invoice.supplier_invoice_date)::integer+
        CASE WHEN pg_catalog.date_part('month',invoice.supplier_invoice_date)>=4 THEN 1 ELSE 0 END,11,30);
    END IF;
    IF adjustment_deadline IS NOT NULL AND return_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory purchase return is after the exact effective-rule deadline'; END IF;
  ELSIF NULLIF(request_document->>'supplier_credit_note_portal_line_id','') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only purchase return forbids supplier portal credit-note evidence';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||invoice.id::text,734821));
  SELECT pg_catalog.jsonb_build_object(
    'products',coalesce(pg_catalog.jsonb_agg(item ORDER BY item->>'line_id'),'[]'::jsonb),'charges','[]'::jsonb,
    'rounding_adjustment',coalesce((SELECT sum(prior.rounding_adjustment) FROM procurement.purchase_returns prior
      WHERE prior.org_id=organization_id AND prior.supplier_invoice_id=invoice.id AND prior.status='posted'),0)::text)
    INTO prior_state FROM (
      SELECT pg_catalog.jsonb_build_object('line_id',allocation.supplier_invoice_line_id,'value_basis',min(line.reversal_value_basis),
        'reversed_billed_quantity',sum(line.billed_quantity)::text,'reversed_free_quantity',sum(line.free_quantity)::text,
        'reversed_base_billed_quantity',sum(line.base_billed_quantity)::text,'reversed_base_free_quantity',sum(line.base_free_quantity)::text,
        'gross_price_amount',sum((calculated.value->>'gross_amount')::numeric)::text,
        'line_discount_amount',sum((calculated.value->>'line_discount_amount')::numeric)::text,
        'document_discount_amount',sum((calculated.value->>'document_discount_amount')::numeric)::text,
        'net_value_amount',sum(line.net_value_amount)::text,'gst_taxable_value',sum(line.gst_taxable_value)::text,
        'cgst_amount',sum(line.cgst_amount)::text,'sgst_amount',sum(line.sgst_amount)::text,
        'igst_amount',sum(line.igst_amount)::text,'cess_amount',sum(line.cess_amount)::text) item
      FROM procurement.purchase_return_lines line JOIN procurement.purchase_returns parent
        ON parent.org_id=line.org_id AND parent.id=line.purchase_return_id AND parent.status='posted'
      JOIN procurement.supplier_invoice_receipt_allocations allocation
        ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
      JOIN calculation.artifacts artifact ON artifact.org_id=parent.org_id AND artifact.purchase_return_id=parent.id AND artifact.status='consumed'
      JOIN LATERAL pg_catalog.jsonb_array_elements(pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb->'lines') calculated(value)
        ON calculated.value->>'line_id'=allocation.supplier_invoice_line_id::text
      WHERE line.org_id=organization_id AND parent.supplier_invoice_id=invoice.id
        AND allocation.supplier_invoice_line_id IN (
          SELECT source_allocation.supplier_invoice_line_id FROM pg_catalog.jsonb_array_elements(request_document->'lines') requested(value)
          JOIN procurement.supplier_invoice_receipt_allocations source_allocation ON source_allocation.org_id=organization_id
            AND source_allocation.id=(requested.value->>'supplier_invoice_receipt_allocation_id')::uuid)
      GROUP BY allocation.supplier_invoice_line_id
    ) prior_items;
  SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'inventory_asset','asset','INR',false) FOR SHARE;
  SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'purchase_return_inventory_variance','expense','INR',false) FOR SHARE;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_invoice','id',invoice.id,'row_version',invoice.row_version),
    pg_catalog.jsonb_build_object('resource_type','original_tax_document','id',original_tax.id,'source_hash',pg_catalog.encode(original_tax.source_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_calculation_artifact','id',original_artifact.id,'authority_hash',pg_catalog.encode(original_artifact.authority_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_tax_registration','id',supplier_registration.id,'row_version',supplier_registration.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_destination_address','id',destination.id,'row_version',destination.row_version),
    pg_catalog.jsonb_build_object('resource_type','original_payable_event','id',original_event.id,'source_posted_at',original_event.source_posted_at),
    pg_catalog.jsonb_build_object('resource_type','original_payable_open_item','id',original_open.id,'principal_amount',original_open.principal_amount,'status',original_open.status),
    pg_catalog.jsonb_build_object('resource_type','original_payable_allocation_state','open_item_id',original_open.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.id)
        FROM finance.allocations item WHERE item.org_id=organization_id AND item.open_item_id=original_open.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_invoice_adjustment_state','supplier_invoice_id',invoice.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'headers',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(note) ORDER BY note.id) FROM finance.adjustment_notes note
          WHERE note.org_id=organization_id AND note.supplier_invoice_id=invoice.id AND note.status='posted'),'[]'::jsonb),
        'lines',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.id) FROM finance.adjustment_note_lines line
          JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
          WHERE note.org_id=organization_id AND note.supplier_invoice_id=invoice.id AND note.status='posted'),'[]'::jsonb))::text,'UTF8'),'sha256'),'hex')),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule','id',rule.id,'release_id',rule.release_id,'rule_version',rule.rule_version),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule_release','id',rule_release.id,'dataset_sha256',pg_catalog.encode(rule_release.dataset_sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','purchase_return_inventory_variance','id',variance_account.id,'row_version',variance_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','purchase_return_prior_state','supplier_invoice_id',invoice.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(prior_state::text,'UTF8'),'sha256'),'hex')));
  IF transporter_party_id IS NOT NULL THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','transporter','id',transporter.id,'row_version',transporter.row_version)); END IF;
  IF rule.tax_effect='statutory' THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_document','id',portal_document.id,'source_hash',pg_catalog.encode(portal_document.source_sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_line','id',portal_line.id,'source_hash',pg_catalog.encode(portal_line.source_row_hash,'hex'))); END IF;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    line_number:=line_number+1;
    IF NULLIF(requested_line->>'supplier_invoice_receipt_allocation_id','')::uuid IS NULL
       OR pg_catalog.jsonb_typeof(requested_line->'batch_allocation')<>'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-return line requires one invoice allocation and batch'; END IF;
    requested_billed:=(requested_line->>'billed_quantity')::numeric; requested_free:=(requested_line->>'free_quantity')::numeric;
    IF requested_billed<0 OR requested_free<0 OR requested_billed+requested_free<=0
       OR (requested_line#>>'{batch_allocation,billed_quantity}')::numeric IS DISTINCT FROM requested_billed
       OR (requested_line#>>'{batch_allocation,free_quantity}')::numeric IS DISTINCT FROM requested_free THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return batch quantities must be positive and reconcile separately'; END IF;
    SELECT * INTO STRICT invoice_allocation FROM procurement.supplier_invoice_receipt_allocations WHERE org_id=organization_id
      AND id=(requested_line->>'supplier_invoice_receipt_allocation_id')::uuid
      AND goods_receipt_line_id=(requested_line->>'goods_receipt_line_id')::uuid FOR UPDATE;
    SELECT invoice_line.* INTO STRICT source FROM procurement.supplier_invoice_lines invoice_line
     WHERE invoice_line.org_id=organization_id AND invoice_line.id=invoice_allocation.supplier_invoice_line_id
       AND invoice_line.supplier_invoice_id=invoice.id AND invoice_line.line_kind='product'
       AND invoice_line.inventory_cost_treatment='capitalize' AND invoice_line.itc_eligibility='eligible'
       AND invoice_line.tax_charge_mechanism='normal' FOR SHARE;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') other(value)
      JOIN procurement.supplier_invoice_receipt_allocations other_allocation ON other_allocation.org_id=organization_id
        AND other_allocation.id=(other.value->>'supplier_invoice_receipt_allocation_id')::uuid
      WHERE other.value IS DISTINCT FROM requested_line AND other_allocation.supplier_invoice_line_id=source.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return pilot requires one unique supplier invoice line per command'; END IF;
    SELECT * INTO STRICT receipt_line FROM procurement.goods_receipt_lines WHERE org_id=organization_id
      AND id=invoice_allocation.goods_receipt_line_id AND product_id=source.product_id AND uom_code=source.uom_code FOR SHARE;
    SELECT * INTO STRICT receipt FROM procurement.goods_receipts WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id
      AND status='posted' AND branch_id=invoice.branch_id AND supplier_account_id=invoice.supplier_account_id FOR SHARE;
    SELECT * INTO STRICT receipt_document FROM inventory.inventory_documents WHERE org_id=organization_id
      AND goods_receipt_id=receipt.id AND document_type='purchase_receipt' AND status='posted' FOR SHARE;
    SELECT * INTO STRICT receipt_inventory_line FROM inventory.inventory_document_lines WHERE org_id=organization_id
      AND inventory_document_id=receipt_document.id AND goods_receipt_line_id=receipt_line.id
      AND product_id=receipt_line.product_id AND batch_id=receipt_line.batch_id AND to_location_id=receipt_line.location_id FOR SHARE;
    SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id AND id=receipt_line.batch_id
      AND id=(requested_line#>>'{batch_allocation,batch_id}')::uuid AND product_id=source.product_id
      AND lot_kind='manufacturer_batch' AND status='released' AND released_at IS NOT NULL
      AND expires_on IS NOT NULL AND return_date<expires_on FOR SHARE;
    SELECT * INTO STRICT source_location FROM inventory.locations WHERE org_id=organization_id
      AND id=receipt_line.location_id AND id=(requested_line->>'from_location_id')::uuid AND branch_id=invoice.branch_id
      AND status='active' AND allows_sale=true AND location_type IN ('saleable','cold_storage') FOR SHARE;
    SELECT * INTO STRICT balance FROM inventory.stock_balances WHERE org_id=organization_id
      AND location_id=source_location.id AND product_id=source.product_id AND batch_id=batch.id FOR UPDATE;
    base_billed:=pg_catalog.round(requested_billed*source.uom_conversion_factor,6);
    base_free:=pg_catalog.round(requested_free*source.uom_conversion_factor,6);
    IF base_billed+base_free>balance.on_hand_quantity OR balance.average_unit_cost<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return exact receipt location lacks sufficient valued stock'; END IF;
    SELECT coalesce(sum(line.base_billed_quantity),0),coalesce(sum(line.base_free_quantity),0) INTO prior_billed,prior_free
      FROM procurement.purchase_return_lines line JOIN procurement.purchase_returns parent
        ON parent.org_id=line.org_id AND parent.id=line.purchase_return_id
     WHERE line.org_id=organization_id AND line.supplier_invoice_receipt_allocation_id=invoice_allocation.id AND parent.status='posted';
    IF prior_billed+base_billed>invoice_allocation.allocated_base_billed_quantity
       OR prior_free+base_free>invoice_allocation.allocated_base_free_quantity THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return billed or free quantity exceeds supplier invoice receipt allocation'; END IF;
    is_final:=((SELECT coalesce(sum(returned.base_billed_quantity),0) FROM procurement.purchase_return_lines returned
      JOIN procurement.purchase_returns parent ON parent.org_id=returned.org_id AND parent.id=returned.purchase_return_id
      JOIN procurement.supplier_invoice_receipt_allocations allocated ON allocated.org_id=returned.org_id AND allocated.id=returned.supplier_invoice_receipt_allocation_id
      WHERE returned.org_id=organization_id AND allocated.supplier_invoice_line_id=source.id AND parent.status='posted')+base_billed=source.base_billed_quantity
      AND (SELECT coalesce(sum(returned.base_free_quantity),0) FROM procurement.purchase_return_lines returned
      JOIN procurement.purchase_returns parent ON parent.org_id=returned.org_id AND parent.id=returned.purchase_return_id
      JOIN procurement.supplier_invoice_receipt_allocations allocated ON allocated.org_id=returned.org_id AND allocated.id=returned.supplier_invoice_receipt_allocation_id
      WHERE returned.org_id=organization_id AND allocated.supplier_invoice_line_id=source.id AND parent.status='posted')+base_free=source.base_free_quantity);
    resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_number',line_number,'line_id',requested_line->>'line_id','goods_receipt_line_id',receipt_line.id,
      'supplier_invoice_line_id',source.id,'supplier_invoice_receipt_allocation_id',invoice_allocation.id,
      'product_id',source.product_id,'batch_id',batch.id,'from_location_id',source_location.id,'uom_code',source.uom_code,
      'uom_conversion_factor',source.uom_conversion_factor,'billed_quantity',requested_billed,'free_quantity',requested_free,
      'base_billed_quantity',base_billed,'base_free_quantity',base_free,'final_residual',is_final,
      'unit_cost',balance.average_unit_cost,'extended_cost',pg_catalog.round((base_billed+base_free)*balance.average_unit_cost,2),
      'source',pg_catalog.to_jsonb(source),'input',requested_line));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','supplier_invoice_line','id',source.id,'invoice_row_version',invoice.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_invoice_receipt_allocation','id',invoice_allocation.id,
        'allocated_base_billed_quantity',invoice_allocation.allocated_base_billed_quantity,'allocated_base_free_quantity',invoice_allocation.allocated_base_free_quantity,
        'prior_returned_base_billed_quantity',prior_billed,'prior_returned_base_free_quantity',prior_free),
      pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version),
      pg_catalog.jsonb_build_object('resource_type','goods_receipt_line','id',receipt_line.id,'extended_cost',receipt_line.extended_cost),
      pg_catalog.jsonb_build_object('resource_type','original_purchase_receipt_line','id',receipt_inventory_line.id,'unit_cost',receipt_inventory_line.unit_cost),
      pg_catalog.jsonb_build_object('resource_type','batch','id',batch.id,'row_version',batch.row_version,'expires_on',batch.expires_on),
      pg_catalog.jsonb_build_object('resource_type','source_location','id',source_location.id,'row_version',source_location.row_version),
      pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',balance.location_id,'product_id',balance.product_id,
        'batch_id',balance.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity,'average_unit_cost',balance.average_unit_cost));
  END LOOP;
  original_output:=pg_catalog.convert_from(original_artifact.output_bytes,'UTF8')::jsonb;
  legal_scope:=pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','return_source_kind','invoiced',
    'tax_charge_mechanism','normal','gst_tax_treatment',rule.tax_effect,'physical_stock','released_unexpired_original_grn_location',
    'posted_return_reversal','unavailable','uninvoiced_return','unavailable');
  RETURN pg_catalog.jsonb_build_object('branch_id',invoice.branch_id,'supplier_account_id',invoice.supplier_account_id,
    'supplier_invoice_id',invoice.id,'return_date',return_date,'reason_code',rule.reason_code,'return_source_kind','invoiced',
    'gst_adjustment_rule_version_id',rule.id,'gst_tax_treatment',rule.tax_effect,'zero_rated_payment_mode',invoice.zero_rated_payment_mode,
    'tax_charge_mechanism',invoice.tax_charge_mechanism,'rounding_policy',invoice.rounding_policy,
    'ruleset_version',invoice.calculation_ruleset_version,'original_calculation_input',pg_catalog.convert_from(original_artifact.input_bytes,'UTF8')::jsonb,
    'original_calculation_output',original_output,'prior_state',prior_state,'lines',resolved_lines,
    'portal_taxable_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.taxable_amount END,
    'portal_cgst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.cgst_amount END,
    'portal_sgst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.sgst_amount END,
    'portal_igst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.igst_amount END,
    'portal_cess_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.cess_amount END,
    'portal_total_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.total_amount END,
    'origin',pg_catalog.jsonb_build_object('line1',branch.address_line1,'line2',branch.address_line2,'city',branch.city,'state_code',branch.state_code,'pincode',branch.postal_code),
    'destination',pg_catalog.jsonb_build_object('address_id',destination.id,'line1',destination.line1,'line2',destination.line2,'city',destination.city,'state_code',destination.state_code,'pincode',destination.postal_code),
    'transport_mode',transport_mode,'distance_km',(logistics->>'distance_km')::numeric::text,'transporter_party_id',transporter_party_id,
    'transporter_name',transporter.legal_name,'transporter_gstin',transporter_registration.registration_number,
    'vehicle_number',NULLIF(logistics->>'vehicle_number',''),'vehicle_type',NULLIF(logistics->>'vehicle_type',''),
    'transport_document_number',NULLIF(logistics->>'transport_document_number',''),
    'transport_document_date',NULLIF(logistics->>'transport_document_date','')::date,
    'source_versions',source_versions,'legal_scope',legal_scope);
END
''', runtime=True, calculator=True),
        *_function(
            '"assert_purchase_return_draft"(organization_id uuid, purchase_return_id uuid, inventory_document_id uuid, resolution jsonb)',
            "void",
            '''
DECLARE expected_count bigint:=0; expected_line jsonb; header procurement.purchase_returns%ROWTYPE;
        document inventory.inventory_documents%ROWTYPE; prepared_return_line procurement.purchase_return_lines%ROWTYPE;
        prepared_inventory_line inventory.inventory_document_lines%ROWTYPE;
BEGIN
  SELECT * INTO STRICT header FROM procurement.purchase_returns WHERE org_id=organization_id AND id=purchase_return_id FOR UPDATE;
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR UPDATE;
  IF header.status NOT IN ('draft','submitted') OR header.return_source_kind<>'invoiced'
     OR header.supplier_invoice_id IS DISTINCT FROM (resolution->>'supplier_invoice_id')::uuid
     OR header.gst_tax_treatment IS DISTINCT FROM resolution->>'gst_tax_treatment'
     OR header.gst_adjustment_rule_version_id IS DISTINCT FROM (resolution->>'gst_adjustment_rule_version_id')::uuid
     OR document.purchase_return_id IS DISTINCT FROM header.id OR document.document_type<>'purchase_return_issue'
     OR document.status<>'approved' OR document.branch_id IS DISTINCT FROM header.branch_id
     OR ROW(document.origin_address_line1,document.origin_address_line2,document.origin_city,document.origin_state_code,document.origin_pincode,
            document.destination_address_line1,document.destination_address_line2,document.destination_city,document.destination_state_code,document.destination_pincode,
            document.transport_mode,document.distance_km,document.transporter_party_id,document.transporter_name_snapshot,document.transporter_gstin_snapshot,
            document.vehicle_number_snapshot,document.vehicle_type_snapshot,document.transport_document_number_snapshot,document.transport_document_date)
        IS DISTINCT FROM ROW(resolution#>>'{origin,line1}',resolution#>>'{origin,line2}',resolution#>>'{origin,city}',resolution#>>'{origin,state_code}',resolution#>>'{origin,pincode}',
            resolution#>>'{destination,line1}',resolution#>>'{destination,line2}',resolution#>>'{destination,city}',resolution#>>'{destination,state_code}',resolution#>>'{destination,pincode}',
            resolution->>'transport_mode',(resolution->>'distance_km')::numeric,NULLIF(resolution->>'transporter_party_id','')::uuid,
            resolution->>'transporter_name',resolution->>'transporter_gstin',resolution->>'vehicle_number',resolution->>'vehicle_type',
            resolution->>'transport_document_number',NULLIF(resolution->>'transport_document_date','')::date) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return header, logistics, or inventory draft changed'; END IF;
  FOR expected_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolution->'lines') LOOP
    expected_count:=expected_count+1;
    SELECT persisted_return.* INTO STRICT prepared_return_line FROM procurement.purchase_return_lines persisted_return
     WHERE persisted_return.org_id=organization_id AND persisted_return.purchase_return_id=purchase_return_id
       AND persisted_return.id=(expected_line->>'line_id')::uuid FOR SHARE;
    SELECT persisted_inventory.* INTO STRICT prepared_inventory_line FROM inventory.inventory_document_lines persisted_inventory
     WHERE persisted_inventory.org_id=organization_id AND persisted_inventory.inventory_document_id=inventory_document_id
       AND persisted_inventory.purchase_return_line_id=prepared_return_line.id FOR SHARE;
    IF ROW(prepared_return_line.goods_receipt_line_id,prepared_return_line.product_id,prepared_return_line.batch_id,
           prepared_return_line.from_location_id,prepared_return_line.billed_quantity,prepared_return_line.free_quantity,
           prepared_return_line.uom_conversion_factor,prepared_return_line.base_billed_quantity,
           prepared_return_line.base_free_quantity,prepared_return_line.final_residual,
           prepared_inventory_line.movement_kind,prepared_inventory_line.product_id,prepared_inventory_line.batch_id,
           prepared_inventory_line.from_location_id,prepared_inventory_line.base_quantity,
           prepared_inventory_line.unit_cost,prepared_inventory_line.extended_cost)
       IS DISTINCT FROM ROW((expected_line->>'goods_receipt_line_id')::uuid,(expected_line->>'product_id')::uuid,
           (expected_line->>'batch_id')::uuid,(expected_line->>'from_location_id')::uuid,
           (expected_line->>'billed_quantity')::numeric,(expected_line->>'free_quantity')::numeric,
           (expected_line->>'uom_conversion_factor')::numeric,(expected_line->>'base_billed_quantity')::numeric,
           (expected_line->>'base_free_quantity')::numeric,(expected_line->>'final_residual')::boolean,'issue',
           (expected_line->>'product_id')::uuid,(expected_line->>'batch_id')::uuid,(expected_line->>'from_location_id')::uuid,
           (expected_line->>'base_billed_quantity')::numeric+(expected_line->>'base_free_quantity')::numeric,
           (expected_line->>'unit_cost')::numeric,(expected_line->>'extended_cost')::numeric) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return persisted line differs from locked resolution'; END IF;
  END LOOP;
  IF expected_count=0
     OR expected_count<>(SELECT count(*) FROM procurement.purchase_return_lines persisted_return
                          WHERE persisted_return.org_id=organization_id
                            AND persisted_return.purchase_return_id=purchase_return_id)
     OR expected_count<>(SELECT count(*) FROM inventory.inventory_document_lines persisted_inventory
                          WHERE persisted_inventory.org_id=organization_id
                            AND persisted_inventory.inventory_document_id=inventory_document_id) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return draft line cardinality changed'; END IF;
END
'''),
        *_function(
            '"persist_purchase_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_return_id uuid, inventory_document_id uuid, command_id uuid, artifact_id uuid, request_id uuid, adjustment_note_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, return_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
            "jsonb",
            '''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; return_number text; fiscal_year integer;
        claim_id uuid; replay_id uuid; aggregate_hash bytea; requested_total numeric(20,2); return_line_id uuid;
        movement_time timestamptz:=pg_catalog.transaction_timestamp();
BEGIN
  IF SESSION_USER<>'erp_calculator' OR purchase_return_id IS NULL OR inventory_document_id IS NULL OR command_id IS NULL
     OR artifact_id IS NULL OR request_id IS NULL OR adjustment_note_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR allocation_id IS NULL OR residual_open_item_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
     OR pg_catalog.octet_length(return_sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-return prepare persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb; resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb; input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
  output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
  current_resolution:="erp_automation_commands"."resolve_purchase_return_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,purchase_return_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'purchase_return_id' IS DISTINCT FROM purchase_return_id::text
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
     OR input_document->>'operation'<>'procurement.purchase_return.post' OR input_document->>'resource_type'<>'purchase_return'
     OR input_document->>'resource_id'<>purchase_return_id::text OR output_document->>'operation'<>'procurement.purchase_return.post'
     OR output_document->>'resource_id'<>purchase_return_id::text
     OR output_document->>'gst_tax_treatment' IS DISTINCT FROM resolved_document->>'gst_tax_treatment'
     OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return resolution, legal scope, or calculation output changed'; END IF;
  totals:=output_document->'totals';
  IF resolved_document->>'gst_tax_treatment'='statutory' AND (
       (totals->>'gst_taxable_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_taxable_amount')::numeric
       OR (totals->>'cgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cgst_amount')::numeric
       OR (totals->>'sgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_sgst_amount')::numeric
       OR (totals->>'igst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_igst_amount')::numeric
       OR (totals->>'cess_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cess_amount')::numeric
       OR ((totals->>'gst_taxable_total')::numeric+(totals->>'cgst_total')::numeric+
           (totals->>'sgst_total')::numeric+(totals->>'igst_total')::numeric+(totals->>'cess_total')::numeric)
          IS DISTINCT FROM (resolved_document->>'portal_total_amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculated purchase return GST components differ from exact GSTR-2B credit note'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='procurement.purchase_return.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM purchase_return_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='purchase-return idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  requested_total:=(totals->>'grand_total')::numeric;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'return_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'return_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'return_date')::date)::integer-1 END;
  SELECT sequence.id INTO STRICT sequence_id FROM core.document_sequences sequence WHERE sequence.org_id=organization_id
    AND sequence.branch_id=(resolved_document->>'branch_id')::uuid AND sequence.document_type='purchase_return'
    AND sequence.fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND sequence.status='active' FOR SHARE;
  return_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,return_sequence_key_hash,expires_at);
  INSERT INTO procurement.purchase_returns(org_id,id,branch_id,supplier_account_id,return_source_kind,supplier_invoice_id,
    supplier_credit_note_portal_line_id,purchase_return_number,fiscal_year,return_date,reason_code,gst_adjustment_rule_version_id,
    gst_tax_treatment,status,calculation_ruleset_version,zero_rated_payment_mode,tax_charge_mechanism,net_value_total,gst_taxable_total,
    cgst_total,sgst_total,igst_total,cess_total,recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
  VALUES(organization_id,purchase_return_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_account_id')::uuid,
    'invoiced',(resolved_document->>'supplier_invoice_id')::uuid,NULLIF(request_document->>'supplier_credit_note_portal_line_id','')::uuid,
    return_number,fiscal_year,(resolved_document->>'return_date')::date,resolved_document->>'reason_code',
    (resolved_document->>'gst_adjustment_rule_version_id')::uuid,resolved_document->>'gst_tax_treatment','draft',
    resolved_document->>'ruleset_version',resolved_document->>'zero_rated_payment_mode',resolved_document->>'tax_charge_mechanism',
    (totals->>'net_value_total')::numeric,(totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,
    (totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,
    (totals->>'recipient_assessed_tax_total')::numeric,resolved_document->>'rounding_policy',(totals->>'rounding_adjustment')::numeric,requested_total);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,physical_movement_required,origin_address_line1,origin_address_line2,
    origin_city,origin_state_code,origin_pincode,destination_address_line1,destination_address_line2,destination_city,
    destination_state_code,destination_pincode,transport_mode,distance_km,transporter_party_id,transporter_name_snapshot,
    transporter_gstin_snapshot,vehicle_number_snapshot,vehicle_type_snapshot,transport_document_number_snapshot,transport_document_date,
    movement_started_at,document_type,document_number,fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
    total_abs_base_quantity,total_value,purchase_return_id,approved_at,approved_by_membership_id)
  SELECT organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,true,resolved_document#>>'{origin,line1}',
    resolved_document#>>'{origin,line2}',resolved_document#>>'{origin,city}',resolved_document#>>'{origin,state_code}',resolved_document#>>'{origin,pincode}',
    resolved_document#>>'{destination,line1}',resolved_document#>>'{destination,line2}',resolved_document#>>'{destination,city}',
    resolved_document#>>'{destination,state_code}',resolved_document#>>'{destination,pincode}',resolved_document->>'transport_mode',
    (resolved_document->>'distance_km')::numeric,NULLIF(resolved_document->>'transporter_party_id','')::uuid,
    resolved_document->>'transporter_name',resolved_document->>'transporter_gstin',resolved_document->>'vehicle_number',
    resolved_document->>'vehicle_type',resolved_document->>'transport_document_number',NULLIF(resolved_document->>'transport_document_date','')::date,
    movement_time,'purchase_return_issue',return_number,fiscal_year,(resolved_document->>'return_date')::date,'approved','purchase_return','INR',
    'moving_weighted_average',sum((value->>'base_billed_quantity')::numeric+(value->>'base_free_quantity')::numeric),
    sum((value->>'extended_cost')::numeric),purchase_return_id,pg_catalog.transaction_timestamp(),membership_id
    FROM pg_catalog.jsonb_array_elements(resolved_document->'lines');
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines')
      WHERE value->>'line_id'=resolved_line->>'supplier_invoice_line_id';
    return_line_id:=(resolved_line->>'line_id')::uuid;
    INSERT INTO procurement.purchase_return_lines(org_id,id,purchase_return_id,line_number,goods_receipt_line_id,
      supplier_invoice_receipt_allocation_id,product_id,batch_id,from_location_id,billed_quantity,free_quantity,uom_conversion_factor,
      base_billed_quantity,base_free_quantity,reversal_value_basis,final_residual,gst_tax_treatment,quoted_unit_rate,price_basis,
      tax_charge_mechanism,free_supply_tax_treatment,net_value_amount,hsn_code_snapshot,tax_code_version_id,taxability_snapshot,
      gst_taxable_value,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,line_total)
    VALUES(organization_id,return_line_id,purchase_return_id,(resolved_line->>'line_number')::integer,
      (resolved_line->>'goods_receipt_line_id')::uuid,(resolved_line->>'supplier_invoice_receipt_allocation_id')::uuid,
      (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,(resolved_line->>'from_location_id')::uuid,
      (resolved_line->>'billed_quantity')::numeric,(resolved_line->>'free_quantity')::numeric,
      (resolved_line->>'uom_conversion_factor')::numeric,(resolved_line->>'base_billed_quantity')::numeric,
      (resolved_line->>'base_free_quantity')::numeric,'billed_quantity',(resolved_line->>'final_residual')::boolean,
      resolved_document->>'gst_tax_treatment',(resolved_line#>>'{source,quoted_unit_rate}')::numeric,
      resolved_line#>>'{source,price_basis}',resolved_document->>'tax_charge_mechanism',resolved_line#>>'{source,free_supply_tax_treatment}',
      (calculated_line->>'net_value_amount')::numeric,resolved_line#>>'{source,tax_classification_code_snapshot}',
      (resolved_line#>>'{source,tax_code_version_id}')::uuid,resolved_line#>>'{source,taxability_snapshot}',
      (calculated_line->>'gst_taxable_value')::numeric,(calculated_line->>'cgst_rate')::numeric,(calculated_line->>'sgst_rate')::numeric,
      (calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,(calculated_line->>'cgst_amount')::numeric,
      (calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,(calculated_line->>'cess_amount')::numeric,
      (calculated_line->>'line_total')::numeric);
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
      uom_code,entered_quantity,base_quantity,from_location_id,unit_cost,extended_cost,purchase_return_line_id)
    VALUES(organization_id,gen_random_uuid(),inventory_document_id,(resolved_line->>'line_number')::integer,'issue',
      (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',
      (resolved_line->>'billed_quantity')::numeric+(resolved_line->>'free_quantity')::numeric,
      (resolved_line->>'base_billed_quantity')::numeric+(resolved_line->>'base_free_quantity')::numeric,
      (resolved_line->>'from_location_id')::uuid,(resolved_line->>'unit_cost')::numeric,(resolved_line->>'extended_cost')::numeric,return_line_id);
  END LOOP;
  PERFORM erp_commercial_commands.assert_purchase_return_artifact(organization_id,purchase_return_id,input_document,output_document);
  PERFORM "erp_automation_commands"."assert_purchase_return_draft"(organization_id,purchase_return_id,inventory_document_id,resolved_document);
  UPDATE procurement.purchase_returns
     SET status='submitted',updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=membership_id
   WHERE org_id=organization_id AND id=purchase_return_id AND status='draft' AND row_version=1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return submission transition lost its draft'; END IF;
  aggregate_hash:="erp_automation_commands"."aggregate_version_hash"('purchase_return',purchase_return_id,1);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'procurement.purchase_return.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,purchase_return_id,requested_total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
    'procurement.purchase_return.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
  IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='purchase-return prepare replay reached completed execution claim'; END IF;
  PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,'procurement.purchase_return.post',
    'purchase_return',purchase_return_id,1,request_id,command_id,claim_id,extensions.digest(request_bytes,'sha256'),
    calculation_input_bytes,calculation_output_bytes,output_document->>'engine_version',output_document->>'ruleset_version',
    'aasopharma-jcs-decimal-v1',expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''', calculator=True),
    ]


def _adjustment_note_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb)',
            "jsonb",
            r'''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        original_id uuid:=NULLIF(request_document->>'original_document_id','')::uuid;
        note_date date:=NULLIF(request_document->>'note_date','')::date;
        side text:=request_document->>'side'; direction text:=request_document->>'direction';
        treatment text:=request_document->>'gst_tax_treatment'; reason_code text:=request_document->>'reason_code';
        sales_header sales.invoices%ROWTYPE; purchase_header procurement.supplier_invoices%ROWTYPE;
        sales_line sales.invoice_lines%ROWTYPE; purchase_line procurement.supplier_invoice_lines%ROWTYPE;
        customer parties.customer_accounts%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE;
        original_tax tax.documents%ROWTYPE; original_artifact calculation.artifacts%ROWTYPE;
        original_event finance.accounting_events%ROWTYPE; original_open finance.open_items%ROWTYPE;
        rule tax.gst_adjustment_rule_versions%ROWTYPE; release core.reference_data_releases%ROWTYPE;
        evidence core.attachments%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        account finance.accounts%ROWTYPE; requested jsonb; resolved_lines jsonb:='[]'::jsonb;
        sources jsonb:='[]'::jsonb; party_id uuid; branch_row_version bigint; document_row_version bigint;
        document_date date; supply_type text; zero_mode text; charge_mechanism text; ruleset text;
        prior_billed numeric(20,6); prior_free numeric(20,6); outstanding numeric(20,2);
        allocation_hash text; candidate_count integer; rate numeric(9,6); line_number integer:=0;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR adjustment_note_id IS NULL OR branch_id IS NULL OR original_id IS NULL OR note_date IS NULL
     OR treatment NOT IN ('statutory','commercial_only') OR reason_code IS NULL
     OR NOT ((side='sales' AND direction='credit') OR (side='purchase' AND direction='debit'))
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment-note input is incomplete or outside sales-credit/purchase-debit scope'; END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines')) <>
     (SELECT count(DISTINCT value->>'original_line_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment-note original line identities must be unique'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.adjustment_note.prepare' AND capability.operation_mode='write'
     AND capability.approval_policy='separate_approver' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.adjustment_note.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note verified context or cross-domain permission is inactive'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original_id::text,734821));
  IF side='sales' THEN
    SELECT invoice.* INTO STRICT sales_header FROM sales.invoices invoice WHERE invoice.org_id=organization_id AND invoice.id=original_id
      AND invoice.branch_id=branch_id AND invoice.status='posted' AND invoice.invoice_type='tax_invoice' AND invoice.currency_code='INR'
      AND invoice.tax_charge_mechanism='normal' FOR UPDATE;
    document_date:=sales_header.invoice_date; branch_row_version:=(SELECT row_version FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE);
    document_row_version:=sales_header.row_version; supply_type:=sales_header.supply_type; zero_mode:=sales_header.zero_rated_payment_mode;
    charge_mechanism:=sales_header.tax_charge_mechanism; ruleset:=sales_header.calculation_ruleset_version;
    SELECT * INTO STRICT customer FROM parties.customer_accounts WHERE org_id=organization_id AND id=sales_header.customer_account_id AND status='active' FOR SHARE;
    party_id:=customer.party_id;
    SELECT * INTO STRICT account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
      organization_id,branch_id,'accounts_receivable','asset','INR',true) FOR SHARE;
    IF customer.default_receivable_account_id IS DISTINCT FROM account.id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receivable account differs from canonical branch role'; END IF;
    SELECT * INTO STRICT original_event FROM finance.accounting_events WHERE org_id=organization_id AND sales_invoice_id=original_id AND event_type='sales_invoice' FOR SHARE;
  ELSE
    SELECT invoice.* INTO STRICT purchase_header FROM procurement.supplier_invoices invoice WHERE invoice.org_id=organization_id AND invoice.id=original_id
      AND invoice.branch_id=branch_id AND invoice.status='posted' AND invoice.currency_code='INR' AND invoice.tax_charge_mechanism='normal' FOR UPDATE;
    document_date:=purchase_header.supplier_invoice_date; branch_row_version:=(SELECT row_version FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE);
    document_row_version:=purchase_header.row_version; supply_type:=purchase_header.supply_type; zero_mode:=purchase_header.zero_rated_payment_mode;
    charge_mechanism:=purchase_header.tax_charge_mechanism; ruleset:=purchase_header.calculation_ruleset_version;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=purchase_header.supplier_account_id AND status='active' FOR SHARE;
    party_id:=supplier.party_id;
    SELECT * INTO STRICT account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
      organization_id,branch_id,'accounts_payable','liability','INR',true) FOR SHARE;
    IF supplier.default_payable_account_id IS DISTINCT FROM account.id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payable account differs from canonical branch role'; END IF;
    SELECT * INTO STRICT original_event FROM finance.accounting_events WHERE org_id=organization_id AND supplier_invoice_id=original_id AND event_type='supplier_invoice' FOR SHARE;
  END IF;
  IF note_date<document_date OR zero_mode<>'not_applicable' THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='adjustment note must follow a domestic non-zero-rated original'; END IF;
  SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND document_effect='original'
    AND ((side='sales' AND sales_invoice_id=original_id) OR (side='purchase' AND supplier_invoice_id=original_id)) FOR SHARE;
  SELECT * INTO STRICT original_artifact FROM calculation.artifacts WHERE org_id=organization_id AND status='consumed'
    AND ((side='sales' AND sales_invoice_id=original_id AND operation='sales.invoice.post')
      OR (side='purchase' AND supplier_invoice_id=original_id AND operation='procurement.supplier_invoice.post')) FOR SHARE;
  SELECT * INTO STRICT original_open FROM finance.open_items WHERE org_id=organization_id AND accounting_event_id=original_event.id
    AND party_id=party_id AND item_side=CASE WHEN side='sales' THEN 'receivable' ELSE 'payable' END AND currency_code='INR' FOR UPDATE;
  SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id AND reversal.status='reversed')),0),
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',allocation.id,'amount',allocation.amount::text,'status',allocation.status,'reversal_of_allocation_id',allocation.reversal_of_allocation_id)
      ORDER BY allocation.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
    INTO outstanding,allocation_hash FROM finance.allocations allocation WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
  IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
  SELECT count(*) INTO candidate_count FROM tax.gst_adjustment_rule_versions candidate WHERE candidate.status='active'
    AND candidate.side=side AND candidate.direction=direction AND candidate.document_effect='decrease'
    AND candidate.reason_code=reason_code AND candidate.tax_effect=treatment AND candidate.effective_from<=note_date
    AND (candidate.effective_to IS NULL OR candidate.effective_to>=note_date);
  IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='adjustment note requires one exact effective reviewed GST rule'; END IF;
  SELECT * INTO STRICT rule FROM tax.gst_adjustment_rule_versions candidate WHERE candidate.status='active'
    AND candidate.side=side AND candidate.direction=direction AND candidate.document_effect='decrease'
    AND candidate.reason_code=reason_code AND candidate.tax_effect=treatment AND candidate.effective_from<=note_date
    AND (candidate.effective_to IS NULL OR candidate.effective_to>=note_date) FOR SHARE;
  SELECT * INTO STRICT release FROM core.reference_data_releases WHERE id=rule.release_id AND status='active' FOR SHARE;
  IF treatment='statutory' AND side='sales' THEN
    IF sales_header.customer_tax_registration_id IS NULL OR NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid IS NULL
       OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz IS NULL
       OR (request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz>pg_catalog.transaction_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires registered buyer and past ITC-reversal confirmation'; END IF;
    SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id
      AND id=(request_document->>'recipient_itc_reversal_evidence_attachment_id')::uuid AND evidence_kind='recipient_itc_reversal'
      AND status IN ('verified','retained') AND verified_at IS NOT NULL
      AND verified_at<=(request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz FOR SHARE;
  ELSIF treatment='statutory' AND side='purchase' THEN
    SELECT source.* INTO STRICT portal_line FROM tax.portal_document_lines source JOIN tax.portal_documents document
      ON document.org_id=source.org_id AND document.id=source.portal_document_id AND document.status='parsed'
      AND document.portal_document_type IN ('gstr2a','gstr2b') WHERE source.org_id=organization_id
      AND source.id=NULLIF(request_document->>'counterparty_portal_document_line_id','')::uuid
      AND source.document_type='credit_note' AND source.supplier_gstin=original_tax.counterparty_gstin FOR SHARE OF source,document;
  ELSIF NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','') IS NOT NULL
     OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','') IS NOT NULL
     OR NULLIF(request_document->>'counterparty_portal_document_line_id','') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only adjustment forbids statutory evidence';
  END IF;
  sources:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch_id,'row_version',branch_row_version),
    pg_catalog.jsonb_build_object('resource_type',CASE WHEN side='sales' THEN 'sales_invoice' ELSE 'supplier_invoice' END,'id',original_id,'row_version',document_row_version),
    pg_catalog.jsonb_build_object('resource_type','original_tax_document','id',original_tax.id,'source_hash',pg_catalog.encode(original_tax.source_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_calculation_artifact','id',original_artifact.id,'authority_hash',pg_catalog.encode(original_artifact.authority_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_open_item','id',original_open.id,'principal_amount',original_open.principal_amount::text,
      'outstanding_amount',outstanding::text,'status',original_open.status,'allocation_state_hash',allocation_hash),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule','id',rule.id,'release_id',release.id,'rule_version',rule.rule_version,'tax_effect',rule.tax_effect),
    pg_catalog.jsonb_build_object('resource_type','party_account_role','id',account.id,'row_version',account.row_version));
  IF evidence.id IS NOT NULL THEN sources:=sources||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('resource_type','recipient_itc_reversal_evidence','id',evidence.id,'sha256',pg_catalog.encode(evidence.sha256,'hex'))); END IF;
  IF portal_line.id IS NOT NULL THEN sources:=sources||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('resource_type','counterparty_portal_document_line','id',portal_line.id,'portal_document_id',portal_line.portal_document_id)); END IF;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    line_number:=line_number+1;
    IF NULLIF(requested->>'line_id','')::uuid IS NULL OR NULLIF(requested->>'original_line_id','')::uuid IS NULL
       OR coalesce((requested->>'billed_quantity')::numeric,0)+coalesce((requested->>'free_quantity')::numeric,0)<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment line requires identities and positive quantity'; END IF;
    IF side='sales' THEN
      SELECT * INTO STRICT sales_line FROM sales.invoice_lines WHERE org_id=organization_id AND id=(requested->>'original_line_id')::uuid
        AND invoice_id=original_id AND line_kind='product' FOR SHARE;
      SELECT coalesce(sum(line.billed_quantity),0),coalesce(sum(line.free_quantity),0) INTO prior_billed,prior_free
        FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
       WHERE line.org_id=organization_id AND line.sales_invoice_line_id=sales_line.id AND note.status='posted' AND note.document_effect='decrease';
      IF prior_billed+(requested->>'billed_quantity')::numeric>sales_line.billed_quantity OR prior_free+(requested->>'free_quantity')::numeric>sales_line.free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales credit quantity exceeds remaining original invoice quantity'; END IF;
      rate:=CASE WHEN supply_type='intra_state' THEN sales_line.cgst_rate+sales_line.sgst_rate ELSE sales_line.igst_rate END;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_number',line_number,'line_kind','product','line_id',requested->>'line_id',
        'original_line_id',sales_line.id,'product_id',sales_line.product_id,'account_id',sales_line.revenue_account_id,'uom_code',sales_line.uom_code,
        'multiplier',sales_line.uom_conversion_factor::text,'hsn_code',sales_line.tax_classification_code_snapshot,'tax_code_version_id',sales_line.tax_code_version_id,
        'taxability',sales_line.taxability_snapshot,'gst_rate',rate::text,'cess_rate',sales_line.cess_rate::text,
        'inventory_cost_treatment',NULL,'itc_eligibility',NULL,'input',requested));
    ELSE
      SELECT * INTO STRICT purchase_line FROM procurement.supplier_invoice_lines WHERE org_id=organization_id AND id=(requested->>'original_line_id')::uuid
        AND supplier_invoice_id=original_id AND line_kind='product' FOR SHARE;
      SELECT coalesce(sum(line.billed_quantity),0),coalesce(sum(line.free_quantity),0) INTO prior_billed,prior_free
        FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
       WHERE line.org_id=organization_id AND line.supplier_invoice_line_id=purchase_line.id AND note.status='posted' AND note.document_effect='decrease';
      IF prior_billed+(requested->>'billed_quantity')::numeric>purchase_line.billed_quantity OR prior_free+(requested->>'free_quantity')::numeric>purchase_line.free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase debit quantity exceeds remaining original supplier-invoice quantity'; END IF;
      rate:=CASE WHEN supply_type='intra_state' THEN purchase_line.cgst_rate+purchase_line.sgst_rate ELSE purchase_line.igst_rate END;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_number',line_number,'line_kind','product','line_id',requested->>'line_id',
        'original_line_id',purchase_line.id,'product_id',purchase_line.product_id,'account_id',purchase_line.net_value_account_id,'uom_code',purchase_line.uom_code,
        'multiplier',purchase_line.uom_conversion_factor::text,'hsn_code',purchase_line.tax_classification_code_snapshot,'tax_code_version_id',purchase_line.tax_code_version_id,
        'taxability',purchase_line.taxability_snapshot,'gst_rate',rate::text,'cess_rate',purchase_line.cess_rate::text,
        'inventory_cost_treatment',purchase_line.inventory_cost_treatment,'itc_eligibility',purchase_line.itc_eligibility,'input',requested));
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('adjustment_note_id',adjustment_note_id,'branch_id',branch_id,'side',side,'direction',direction,
    'document_effect','decrease','original_document_id',original_id,'original_open_item_id',original_open.id,
    'original_open_item_outstanding',outstanding::text,'party_id',party_id,'note_date',note_date,'reason_code',reason_code,
    'gst_adjustment_rule_version_id',rule.id,'gst_tax_treatment',treatment,'supply_type',supply_type,
    'zero_rated_payment_mode',zero_mode,'tax_charge_mechanism',charge_mechanism,'ruleset_version',ruleset,'rounding_policy',request_document->>'rounding_policy',
    'lines',resolved_lines,'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','supported_pair',side||'_'||direction,
      'original_document_status','posted','original_open_item_lineage',true,'return_linked_notes','owned_by_return_commands',
      'increases_reversals_charges_foreign_currency_reverse_charge','unavailable'), 'source_versions',sources);
END
''', runtime=True, calculator=True),
        *_function(
            '"persist_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)',
            "jsonb",
            r'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; note_number text; fiscal_year integer;
        total numeric(20,2); aggregate_hash bytea; claim_id uuid; replay_id uuid;
BEGIN
  IF SESSION_USER<>'erp_calculator' OR adjustment_note_id IS NULL OR command_id IS NULL OR artifact_id IS NULL OR request_id IS NULL
     OR journal_id IS NULL OR event_id IS NULL OR allocation_id IS NULL OR residual_open_item_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment-note persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb; resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb; input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
  output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
  current_resolution:=erp_automation_commands.resolve_adjustment_note_prepare(organization_id,membership_id,auth_user_id,application_user_id,
    grant_id,caller_client_id,adjustment_note_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'adjustment_note_id' IS DISTINCT FROM adjustment_note_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
     OR input_document->>'operation'<>'finance.adjustment_note.post' OR input_document->>'resource_type'<>'adjustment_note'
     OR input_document->>'resource_id'<>adjustment_note_id::text OR output_document->>'operation'<>'finance.adjustment_note.post'
     OR output_document->>'resource_id'<>adjustment_note_id::text OR output_document->>'gst_tax_treatment' IS DISTINCT FROM resolved_document->>'gst_tax_treatment'
     OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version'
     OR pg_catalog.jsonb_array_length(output_document->'lines')<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR (resolved_document->>'gst_tax_treatment'='statutory')<>(tax_document_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note resolution, legal scope, calculation, or tax identity changed'; END IF;
  IF resolved_document->>'side'='purchase' AND resolved_document->>'gst_tax_treatment'='statutory' AND NOT EXISTS (
    SELECT 1 FROM tax.portal_document_lines portal WHERE portal.org_id=organization_id
      AND portal.id=(request_document->>'counterparty_portal_document_line_id')::uuid
      AND ROW(portal.taxable_amount,portal.cgst_amount,portal.sgst_amount,portal.igst_amount,portal.cess_amount,portal.total_amount)
       IS NOT DISTINCT FROM ROW((output_document#>>'{totals,gst_taxable_total}')::numeric,(output_document#>>'{totals,cgst_total}')::numeric,
        (output_document#>>'{totals,sgst_total}')::numeric,(output_document#>>'{totals,igst_total}')::numeric,
        (output_document#>>'{totals,cess_total}')::numeric,(output_document#>>'{totals,gst_taxable_total}')::numeric+
        (output_document#>>'{totals,cgst_total}')::numeric+(output_document#>>'{totals,sgst_total}')::numeric+
        (output_document#>>'{totals,igst_total}')::numeric+(output_document#>>'{totals,cess_total}')::numeric)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier portal credit-note totals differ from canonical calculation'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.adjustment_note.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM adjustment_note_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment-note idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  totals:=output_document->'totals'; total:=(totals->>'grand_total')::numeric;
  IF total<=0 OR (resolved_document->>'gst_tax_treatment'='commercial_only' AND
     ((totals->>'gst_taxable_total')::numeric<>0 OR (totals->>'cgst_total')::numeric<>0 OR (totals->>'sgst_total')::numeric<>0
       OR (totals->>'igst_total')::numeric<>0 OR (totals->>'cess_total')::numeric<>0)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment-note total or commercial-only GST output is invalid'; END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'note_date')::date)>=4 THEN pg_catalog.date_part('year',(resolved_document->>'note_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'note_date')::date)::integer-1 END;
  SELECT id INTO STRICT sequence_id FROM core.document_sequences WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
    AND document_type='adjustment_note' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  note_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
  INSERT INTO finance.adjustment_notes(org_id,id,note_number,note_date,side,direction,party_id,sales_invoice_id,supplier_invoice_id,
    adjusts_open_item_id,counterparty_portal_document_line_id,gst_adjustment_rule_version_id,gst_tax_treatment,
    recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,zero_rated_payment_mode,tax_charge_mechanism,
    currency_code,document_effect,rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,
    calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,
    cess_amount,recipient_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,reason_code,reason,status,
    created_by_membership_id,updated_by_membership_id)
  VALUES(organization_id,adjustment_note_id,note_number,(resolved_document->>'note_date')::date,resolved_document->>'side',resolved_document->>'direction',
    (resolved_document->>'party_id')::uuid,CASE WHEN resolved_document->>'side'='sales' THEN (resolved_document->>'original_document_id')::uuid END,
    CASE WHEN resolved_document->>'side'='purchase' THEN (resolved_document->>'original_document_id')::uuid END,
    (resolved_document->>'original_open_item_id')::uuid,NULLIF(request_document->>'counterparty_portal_document_line_id','')::uuid,
    (resolved_document->>'gst_adjustment_rule_version_id')::uuid,resolved_document->>'gst_tax_treatment',
    NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid,NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz,
    resolved_document->>'zero_rated_payment_mode',resolved_document->>'tax_charge_mechanism','INR','decrease',request_document->>'rounding_policy',
    request_document->'document_discount'->>'document_discount_kind',request_document->'document_discount'->>'document_discount_basis',
    (request_document->'document_discount'->>'document_discount_value')::numeric,resolved_document->>'ruleset_version',(totals->>'subtotal')::numeric,
    (totals->>'discount_total')::numeric,(totals->>'net_value_total')::numeric,(totals->>'gst_taxable_total')::numeric,
    (totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,
    (totals->>'recipient_assessed_tax_total')::numeric,(totals->>'rounding_adjustment')::numeric,total,resolved_document->>'reason_code',
    request_document->>'reason','draft',membership_id,membership_id);
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines') WHERE value->>'line_id'=resolved_line->>'line_id';
    INSERT INTO finance.adjustment_note_lines(org_id,id,adjustment_note_id,line_number,line_kind,product_id,account_id,sales_invoice_line_id,
      supplier_invoice_line_id,description,uom_code,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,
      free_supply_tax_treatment,quoted_unit_rate,price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,
      document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,
      final_residual,gst_tax_treatment,discount_amount,net_value_amount,gst_taxable_value,hsn_sac_code,tax_code_version_id,taxability_snapshot,
      inventory_cost_treatment,itc_eligibility,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,
      cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,created_by_membership_id)
    VALUES(organization_id,(resolved_line->>'line_id')::uuid,adjustment_note_id,(resolved_line->>'line_number')::integer,'product',
      (resolved_line->>'product_id')::uuid,(resolved_line->>'account_id')::uuid,CASE WHEN resolved_document->>'side'='sales' THEN (resolved_line->>'original_line_id')::uuid END,
      CASE WHEN resolved_document->>'side'='purchase' THEN (resolved_line->>'original_line_id')::uuid END,request_document->>'reason',resolved_line->>'uom_code',
      (resolved_line#>>'{input,billed_quantity}')::numeric,(resolved_line#>>'{input,free_quantity}')::numeric,(resolved_line->>'multiplier')::numeric,
      (resolved_line#>>'{input,billed_quantity}')::numeric*(resolved_line->>'multiplier')::numeric,
      (resolved_line#>>'{input,free_quantity}')::numeric*(resolved_line->>'multiplier')::numeric,resolved_line#>>'{input,free_supply_tax_treatment}',
      (resolved_line#>>'{input,quoted_unit_rate}')::numeric,resolved_line#>>'{input,price_basis}',(calculated_line->>'gross_amount')::numeric,
      resolved_line#>>'{input,line_discount,line_discount_kind}',resolved_line#>>'{input,line_discount,line_discount_basis}',
      (resolved_line#>>'{input,line_discount,line_discount_value}')::numeric,(resolved_line#>>'{input,document_discount_eligible}')::boolean,
      (calculated_line->>'line_discount_amount')::numeric,(calculated_line->>'line_taxable_discount_amount')::numeric,
      (calculated_line->>'document_discount_amount')::numeric,(calculated_line->>'document_taxable_discount_amount')::numeric,false,
      resolved_document->>'gst_tax_treatment',(calculated_line->>'line_discount_amount')::numeric+(calculated_line->>'document_discount_amount')::numeric,
      (calculated_line->>'net_value_amount')::numeric,(calculated_line->>'gst_taxable_value')::numeric,resolved_line->>'hsn_code',
      (resolved_line->>'tax_code_version_id')::uuid,resolved_line->>'taxability',NULLIF(resolved_line->>'inventory_cost_treatment',''),
      NULLIF(resolved_line->>'itc_eligibility',''),resolved_document->>'tax_charge_mechanism',(calculated_line->>'cgst_rate')::numeric,
      (calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,
      (calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,
      (calculated_line->>'cess_amount')::numeric,(calculated_line->>'recipient_assessed_tax_amount')::numeric,(calculated_line->>'line_total')::numeric,
      resolved_document->>'ruleset_version',membership_id);
  END LOOP;
  IF (SELECT count(*) FROM finance.adjustment_note_lines persisted WHERE persisted.org_id=organization_id AND persisted.adjustment_note_id=adjustment_note_id)
       <>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note persisted line cardinality differs'; END IF;
  aggregate_hash:="erp_automation_commands"."aggregate_version_hash"('adjustment_note',adjustment_note_id,1);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.adjustment_note.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,adjustment_note_id,total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
    'finance.adjustment_note.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
  IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment-note prepare replay reached completed execution claim'; END IF;
  PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,'finance.adjustment_note.post','adjustment_note',
    adjustment_note_id,1,request_id,command_id,claim_id,extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,
    output_document->>'engine_version',output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''', calculator=True),
    ]


def _supplier_payment_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        payment_date date:=NULLIF(request_document->>'payment_date','')::date;
        supplier_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        settlement_id uuid:=NULLIF(request_document->>'settlement_account_id','')::uuid;
        gross numeric(20,2):=NULLIF(request_document->>'gross_amount','')::numeric;
        method text:=request_document->>'payment_method';
        reference text:=upper(NULLIF(pg_catalog.btrim(request_document->>'external_reference'),''));
        branch core.branches%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE; party parties.parties%ROWTYPE;
        party_evidence core.attachments%ROWTYPE; bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE;
        payable finance.accounts%ROWTYPE; payment_fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        payment_fiscal_evidence core.attachments%ROWTYPE; credit_fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        credit_fiscal_evidence core.attachments%ROWTYPE; requested jsonb; item finance.open_items%ROWTYPE;
        event finance.accounting_events%ROWTYPE; invoice procurement.supplier_invoices%ROWTYPE;
        resolved_allocations jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        prior_allocated numeric(20,2); requested_total numeric(20,2):=0; allocation_count integer;
        duplicate_count integer; allocation_state_hash text; applicable_advance_state_hash text; fiscal_year smallint;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR payment_id IS NULL OR branch_id IS NULL OR payment_date IS NULL OR supplier_id IS NULL
     OR bank_id IS NULL OR settlement_id IS NULL OR gross<=0 OR method NOT IN ('bank_transfer','upi')
     OR reference IS NULL OR pg_catalog.length(reference)>256
     OR pg_catalog.jsonb_typeof(request_document->'allocations')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'allocations') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-payment INR bank pilot input is incomplete'; END IF;
  IF payment_date>CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier payment date cannot be in the future'; END IF;
  IF (SELECT count(DISTINCT value->>'open_item_id') FROM pg_catalog.jsonb_array_elements(request_document->'allocations'))
       <>pg_catalog.jsonb_array_length(request_document->'allocations') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment requires unique payable allocations'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.supplier_payment.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-payment delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.allocate',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-payment verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=supplier_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id AND status='active'
    AND tax_residency_status='resident' AND pan IS NOT NULL AND pan_verification_status='verified'
    AND tax_profile_verified_at IS NOT NULL AND tax_profile_verified_at<=pg_catalog.transaction_timestamp()
    AND tax_profile_evidence_attachment_id IS NOT NULL FOR SHARE;
  SELECT * INTO STRICT party_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=party.tax_profile_evidence_attachment_id AND status IN ('verified','retained')
    AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',payment_date)>=4 THEN pg_catalog.date_part('year',payment_date)::smallint
                    ELSE (pg_catalog.date_part('year',payment_date)-1)::smallint END;
  SELECT * INTO STRICT payment_fiscal_fact FROM tax.organization_fiscal_tax_facts WHERE org_id=organization_id
    AND fiscal_year_start_year=fiscal_year AND status='active' AND payment_date BETWEEN effective_from AND effective_to
    AND prior_fiscal_year_turnover<=100000000 AND gst_tds_notified_deductor=false FOR SHARE;
  SELECT * INTO STRICT payment_fiscal_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=payment_fiscal_fact.evidence_attachment_id AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT payable FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'accounts_payable','liability','INR',true)
    AND status='active' AND account_type='liability' AND currency_code='INR' AND allows_party_posting FOR SHARE;
  IF supplier.default_payable_account_id IS DISTINCT FROM payable.id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier default payable does not match canonical branch account role'; END IF;
  SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
    AND status='active' AND currency_code='INR' FOR SHARE;
  SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id
    AND id=bank.account_id AND status='active' AND account_type='asset' AND currency_code='INR'
    AND allows_bank_reconciliation FOR SHARE;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':supplier-payment-reference:'||bank.id::text||':'||reference,672011));
  SELECT count(*) INTO duplicate_count FROM finance.payments existing WHERE existing.org_id=organization_id
    AND existing.bank_account_id=bank.id AND upper(pg_catalog.btrim(existing.external_reference))=reference
    AND existing.reversal_of_payment_id IS NULL AND existing.id<>payment_id;
  IF duplicate_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier payment bank reference was already consumed'; END IF;
  PERFORM 1 FROM finance.open_items candidate
   JOIN pg_catalog.jsonb_array_elements(request_document->'allocations') payload(value)
     ON candidate.id=(payload.value->>'open_item_id')::uuid
   WHERE candidate.org_id=organization_id ORDER BY candidate.id FOR UPDATE OF candidate;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'allocations') LOOP
    IF NULLIF(requested->>'allocation_id','')::uuid IS NULL OR NULLIF(requested->>'open_item_id','')::uuid IS NULL
       OR NULLIF(requested->>'amount','')::numeric<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier payment allocation identity and positive amount are required'; END IF;
    SELECT * INTO STRICT item FROM finance.open_items WHERE org_id=organization_id
      AND id=(requested->>'open_item_id')::uuid AND item_side='payable' AND party_id=party.id
      AND currency_code='INR' AND status='open' AND document_date<=payment_date FOR UPDATE;
    SELECT * INTO STRICT event FROM finance.accounting_events WHERE org_id=organization_id
      AND id=item.accounting_event_id AND event_type='supplier_invoice' AND supplier_invoice_id IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT invoice FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=event.supplier_invoice_id
      AND branch_id=branch.id AND supplier_account_id=supplier.id AND currency_code='INR' AND status='posted'
      AND supply_type IN ('intra_state','inter_state') AND zero_rated_payment_mode='not_applicable'
      AND tax_charge_mechanism='normal' FOR SHARE;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',item.document_date)>=4
                      THEN pg_catalog.date_part('year',item.document_date)::smallint
                      ELSE (pg_catalog.date_part('year',item.document_date)-1)::smallint END;
    SELECT * INTO STRICT credit_fiscal_fact FROM tax.organization_fiscal_tax_facts WHERE org_id=organization_id
      AND fiscal_year_start_year=fiscal_year AND status='active' AND item.document_date BETWEEN effective_from AND effective_to
      AND prior_fiscal_year_turnover<=100000000 AND gst_tds_notified_deductor=false FOR SHARE;
    SELECT * INTO STRICT credit_fiscal_evidence FROM core.attachments WHERE org_id=organization_id
      AND id=credit_fiscal_fact.evidence_attachment_id AND status IN ('verified','retained') AND verified_at IS NOT NULL
      AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
    IF (SELECT count(*) FROM procurement.supplier_invoice_lines invoice_line WHERE invoice_line.org_id=organization_id
         AND invoice_line.supplier_invoice_id=invoice.id AND invoice_line.line_kind='product'
         AND invoice_line.withholding_nature_code='purchase_of_goods')=0
       OR EXISTS (SELECT 1 FROM procurement.supplier_invoice_lines invoice_line WHERE invoice_line.org_id=organization_id
         AND invoice_line.supplier_invoice_id=invoice.id
         AND (invoice_line.line_kind<>'product' OR invoice_line.withholding_nature_code IS DISTINCT FROM 'purchase_of_goods')) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot supports only purchase-of-goods product invoices without charge withholding ambiguity'; END IF;
    PERFORM 1 FROM procurement.purchase_order_advance_allocations advance
     WHERE advance.org_id=organization_id AND EXISTS (
       SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
       JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
         ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
       JOIN procurement.goods_receipt_lines receipt_line
         ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
        AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
       WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id)
     ORDER BY advance.id FOR UPDATE OF advance;
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',advance.id,'purchase_order_line_id',advance.purchase_order_line_id,
          'gross_advance_amount',advance.gross_advance_amount::text,'status',advance.status,
          'reversal_of_allocation_id',advance.reversal_of_allocation_id,
          'applied',EXISTS (SELECT 1 FROM finance.accounting_events application
            WHERE application.org_id=advance.org_id AND application.purchase_order_advance_allocation_id=advance.id))
        ORDER BY advance.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO applicable_advance_state_hash
      FROM procurement.purchase_order_advance_allocations advance
     WHERE advance.org_id=organization_id AND EXISTS (
       SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
       JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
         ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
       JOIN procurement.goods_receipt_lines receipt_line
         ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
        AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
       WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id);
    IF EXISTS (SELECT 1 FROM procurement.purchase_order_advance_allocations advance
       WHERE advance.org_id=organization_id AND advance.status='posted' AND advance.reversal_of_allocation_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
           WHERE reversal.org_id=advance.org_id AND reversal.reversal_of_allocation_id=advance.id AND reversal.status='reversed')
         AND NOT EXISTS (SELECT 1 FROM finance.accounting_events application
           WHERE application.org_id=advance.org_id AND application.purchase_order_advance_allocation_id=advance.id)
         AND EXISTS (SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
           JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
             ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
           JOIN procurement.goods_receipt_lines receipt_line
             ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
            AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
          WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id)) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot cannot leave an applicable supplier advance unapplied'; END IF;
    PERFORM 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
      AND prior.payment_id IS DISTINCT FROM payment_id ORDER BY prior.id FOR UPDATE OF prior;
    IF EXISTS (SELECT 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
         AND prior.payment_id IS DISTINCT FROM payment_id AND prior.status='posted' AND prior.reversal_of_allocation_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
           AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed')
         AND prior.payment_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot cannot mix advance, withholding, or adjustment allocations'; END IF;
    SELECT coalesce(sum(prior.amount),0),count(*) INTO prior_allocated,allocation_count FROM finance.allocations prior
     WHERE prior.org_id=organization_id AND prior.open_item_id=item.id AND prior.payment_id IS NOT NULL
       AND prior.payment_id<>payment_id AND prior.status='posted' AND prior.reversal_of_allocation_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
         AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed');
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',prior.id,'payment_id',prior.payment_id,'withholding_id',prior.withholding_id,
          'adjustment_note_id',prior.adjustment_note_id,'purchase_order_advance_allocation_id',prior.purchase_order_advance_allocation_id,
          'amount',prior.amount::text,'status',prior.status,'reversal_of_allocation_id',prior.reversal_of_allocation_id)
        ORDER BY prior.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO allocation_state_hash
      FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
        AND prior.payment_id IS DISTINCT FROM payment_id;
    IF prior_allocated+(requested->>'amount')::numeric>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment allocation exceeds live payable balance'; END IF;
    requested_total:=requested_total+(requested->>'amount')::numeric;
    resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'allocation_id',requested->>'allocation_id','open_item_id',item.id,'supplier_invoice_id',invoice.id,
      'document_number',item.document_number,'principal_amount',item.principal_amount::text,
      'prior_cash_allocated_amount',prior_allocated::text,'amount',(requested->>'amount')::numeric::text,
      'residual_after',(item.principal_amount-prior_allocated-(requested->>'amount')::numeric)::text));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','payable_allocation_state','id',item.id,'supplier_invoice_id',invoice.id,'invoice_row_version',invoice.row_version,
      'principal_amount',item.principal_amount::text,'status',item.status,'allocation_count',allocation_count,
      'active_cash_allocated_amount',prior_allocated::text,'allocation_state_hash',allocation_state_hash,
      'applicable_advance_state_hash',applicable_advance_state_hash),
      pg_catalog.jsonb_build_object('resource_type','invoice_credit_fiscal_tax_fact','id',credit_fiscal_fact.id,
        'supplier_invoice_id',invoice.id,'credit_date',item.document_date,
        'fiscal_year_start_year',credit_fiscal_fact.fiscal_year_start_year,
        'prior_fiscal_year_turnover',credit_fiscal_fact.prior_fiscal_year_turnover::text,
        'gst_tds_notified_deductor',credit_fiscal_fact.gst_tds_notified_deductor,
        'evidence_attachment_id',credit_fiscal_evidence.id,
        'evidence_sha256',pg_catalog.encode(credit_fiscal_evidence.sha256,'hex')));
  END LOOP;
  IF requested_total<>gross THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment allocations must exactly equal gross liability and bank cash'; END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_party_tax_profile','id',party.id,'row_version',party.row_version,
      'pan_verification_status',party.pan_verification_status,'tax_residency_status',party.tax_residency_status,
      'evidence_attachment_id',party_evidence.id,'evidence_sha256',pg_catalog.encode(party_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','payment_date_fiscal_tax_fact','id',payment_fiscal_fact.id,
      'payment_date',payment_date,'fiscal_year_start_year',payment_fiscal_fact.fiscal_year_start_year,
      'prior_fiscal_year_turnover',payment_fiscal_fact.prior_fiscal_year_turnover::text,
      'gst_tds_notified_deductor',payment_fiscal_fact.gst_tds_notified_deductor,
      'evidence_attachment_id',payment_fiscal_evidence.id,
      'evidence_sha256',pg_catalog.encode(payment_fiscal_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','accounts_payable_role','id',payable.id,'row_version',payable.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_disbursement_collision','bank_account_id',bank.id,
      'external_reference',reference,'original_payment_candidate_count',duplicate_count))||source_versions;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'payment_id',payment_id,'payment_date',payment_date,
    'supplier_account_id',supplier.id,'supplier_party_id',party.id,'bank_account_id',bank.id,
    'settlement_account_id',settlement.id,'accounts_payable_account_id',payable.id,'payment_method',method,
    'external_reference',reference,'gross_amount',gross::text,'cash_amount',gross::text,'withheld_amount','0.00',
    'currency_code','INR','allocations',resolved_allocations,
    'legal_scope',pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','settlement','posted_supplier_invoice_payables_only',
      'supported_payment_methods',pg_catalog.jsonb_build_array('bank_transfer','upi'),
      'income_tax_withholding','not_applicable_verified_prior_fy_turnover_at_or_below_inr_10_crore',
      'gst_tds','not_applicable_verified_notified_deductor_false',
      'gross_liability_equals_bank_cash',true,'advance_withholding_adjustment_or_supplier_credit_netting','unavailable',
      'payment_reversal','unavailable_operator_action'),
    'source_versions',source_versions);
END
''', runtime=True),
        *_function(
            '"assert_supplier_payment_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb)',
            "void",
            '''
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE; line_count integer;
BEGIN
  SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF ROW(payment.payment_date,payment.direction,payment.party_id,payment.branch_id,payment.bank_account_id,
         payment.settlement_account_id,payment.payment_method,payment.payment_purpose,payment.currency_code,
         payment.amount,payment.functional_amount,payment.fx_rate,payment.external_reference,payment.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'disbursement',(resolution->>'supplier_party_id')::uuid,
         (resolution->>'branch_id')::uuid,(resolution->>'bank_account_id')::uuid,(resolution->>'settlement_account_id')::uuid,
         resolution->>'payment_method','commercial_settlement','INR'::bpchar,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,1.000000::numeric,resolution->>'external_reference','approved')
     OR ROW(journal.posting_date,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,
         journal.functional_credit_total,journal.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'INR'::bpchar,'INR'::bpchar,1.000000::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,'draft') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment or journal draft changed'; END IF;
  SELECT count(*) INTO line_count FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
  IF line_count<>2 OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=1 AND account_id=(resolution->>'accounts_payable_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id=(resolution->>'supplier_party_id')::uuid
       AND transaction_debit=(resolution->>'gross_amount')::numeric AND transaction_credit=0
       AND functional_debit=(resolution->>'gross_amount')::numeric AND functional_credit=0)
     OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=2 AND account_id=(resolution->>'settlement_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id IS NULL
       AND transaction_debit=0 AND transaction_credit=(resolution->>'cash_amount')::numeric
       AND functional_debit=0 AND functional_credit=(resolution->>'cash_amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment exact two-line journal changed'; END IF;
END
'''),
        *_function(
            '"persist_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; payment_sequence_id uuid; journal_sequence_id uuid;
        payment_number text; journal_number text; fiscal_year integer; aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR payment_id IS NULL OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(payment_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier payment persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
  resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  current_resolution:="{SCHEMA}"."resolve_supplier_payment_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'payment_id' IS DISTINCT FROM payment_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text OR request_document->>'event_id' IS DISTINCT FROM event_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb OR preview_document->'tax_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.supplier_payment.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier payment idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'payment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.supplier_payment.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'gross_amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='supplier_payment'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'payment_date')::date,'disbursement',
    (resolved_document->>'supplier_party_id')::uuid,(resolved_document->>'branch_id')::uuid,
    (resolved_document->>'bank_account_id')::uuid,(resolved_document->>'settlement_account_id')::uuid,
    resolved_document->>'payment_method','commercial_settlement','INR',(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,1,resolved_document->>'external_reference','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'payment_date')::date,
    'Supplier payment '||payment_number,'INR','INR',1,(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(resolved_document->>'accounts_payable_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_party_id')::uuid,'Supplier payable settlement',
    (resolved_document->>'gross_amount')::numeric,0,(resolved_document->>'gross_amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'settlement_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,NULL,'Supplier payment bank settlement',0,
    (resolved_document->>'cash_amount')::numeric,0,(resolved_document->>'cash_amount')::numeric);
  PERFORM "{SCHEMA}"."assert_supplier_payment_draft"(organization_id,payment_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''', runtime=True),
    ]


def _supplier_advance_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_supplier_advance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        payment_date date:=NULLIF(request_document->>'payment_date','')::date;
        supplier_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        purchase_order_id uuid:=NULLIF(request_document->>'purchase_order_id','')::uuid;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        settlement_id uuid:=NULLIF(request_document->>'settlement_account_id','')::uuid;
        gross numeric(20,2):=NULLIF(request_document->>'gross_amount','')::numeric;
        method text:=request_document->>'payment_method';
        reference text:=upper(NULLIF(pg_catalog.btrim(request_document->>'external_reference'),''));
        requested jsonb; branch core.branches%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE;
        party parties.parties%ROWTYPE; party_evidence core.attachments%ROWTYPE;
        purchase_order procurement.purchase_orders%ROWTYPE; line procurement.purchase_order_lines%ROWTYPE;
        bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE; prepayment finance.accounts%ROWTYPE;
        fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE; fiscal_evidence core.attachments%ROWTYPE;
        fiscal_year smallint; prior_gross numeric(20,2); prior_count integer; duplicate_count integer;
        prior_state_hash text; source_versions jsonb; resolved_allocations jsonb;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR payment_id IS NULL OR branch_id IS NULL OR payment_date IS NULL OR supplier_id IS NULL
     OR purchase_order_id IS NULL OR bank_id IS NULL OR settlement_id IS NULL OR gross<=0
     OR method NOT IN ('bank_transfer','upi') OR reference IS NULL OR pg_catalog.length(reference)>256
     OR pg_catalog.jsonb_typeof(request_document->'allocations')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'allocations')<>1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-advance INR bank pilot requires exactly one complete allocation'; END IF;
  IF payment_date>CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier advance date cannot be in the future'; END IF;
  requested:=request_document->'allocations'->0;
  IF NULLIF(requested->>'purchase_order_line_id','')::uuid IS NULL
     OR NULLIF(requested->>'advance_allocation_id','')::uuid IS NULL
     OR NULLIF(requested->>'prepayment_open_item_id','')::uuid IS NULL
     OR NULLIF(requested->>'gross_amount','')::numeric<=0
     OR (requested->>'gross_amount')::numeric IS DISTINCT FROM gross THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance allocation must be positive and exactly equal gross amount'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':supplier-advance-line:'||(requested->>'purchase_order_line_id'),672004));
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.supplier_advance.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-advance delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('procurement.order.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-advance verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=supplier_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id AND status='active'
    AND tax_residency_status='resident' AND pan IS NOT NULL AND pan_verification_status='verified'
    AND tax_profile_verified_at IS NOT NULL AND tax_profile_verified_at<=pg_catalog.transaction_timestamp()
    AND tax_profile_evidence_attachment_id IS NOT NULL FOR SHARE;
  SELECT * INTO STRICT party_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=party.tax_profile_evidence_attachment_id AND status IN ('verified','retained')
    AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders WHERE org_id=organization_id AND id=purchase_order_id
    AND branch_id=branch.id AND supplier_account_id=supplier.id AND status='approved' AND currency_code='INR'
    AND supply_type IN ('intra_state','inter_state') AND zero_rated_payment_mode='not_applicable'
    AND tax_charge_mechanism='normal' AND order_date<=payment_date FOR UPDATE;
  SELECT * INTO STRICT line FROM procurement.purchase_order_lines WHERE org_id=organization_id
    AND id=(requested->>'purchase_order_line_id')::uuid AND purchase_order_id=purchase_order.id
    AND line_kind='product' AND withholding_nature_code='purchase_of_goods' AND net_value_amount>0 FOR UPDATE;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',payment_date)>=4 THEN pg_catalog.date_part('year',payment_date)::smallint
                    ELSE (pg_catalog.date_part('year',payment_date)-1)::smallint END;
  SELECT * INTO STRICT fiscal_fact FROM tax.organization_fiscal_tax_facts WHERE org_id=organization_id
    AND fiscal_year_start_year=fiscal_year AND status='active' AND payment_date BETWEEN effective_from AND effective_to
    AND prior_fiscal_year_turnover<=100000000 AND gst_tds_notified_deductor=false FOR SHARE;
  SELECT * INTO STRICT fiscal_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=fiscal_fact.evidence_attachment_id AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT prepayment FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'supplier_prepayment','asset','INR',true)
    AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_party_posting FOR SHARE;
  SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
    AND status='active' AND currency_code='INR' FOR SHARE;
  SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id
    AND id=bank.account_id AND status='active' AND account_type='asset' AND currency_code='INR'
    AND allows_bank_reconciliation FOR SHARE;
  PERFORM 1 FROM procurement.purchase_order_advance_allocations prior WHERE prior.org_id=organization_id
    AND prior.purchase_order_line_id=line.id AND prior.payment_id<>payment_id ORDER BY prior.id FOR UPDATE OF prior;
  SELECT coalesce(sum(prior.gross_advance_amount),0),count(*) INTO prior_gross,prior_count
    FROM procurement.purchase_order_advance_allocations prior
   WHERE prior.org_id=organization_id AND prior.purchase_order_line_id=line.id AND prior.status='posted'
     AND prior.payment_id<>payment_id AND prior.reversal_of_allocation_id IS NULL AND NOT EXISTS (
       SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
        WHERE reversal.org_id=prior.org_id AND reversal.reversal_of_allocation_id=prior.id);
  SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',prior.id,'payment_id',prior.payment_id,'gross_advance_amount',prior.gross_advance_amount::text,
        'status',prior.status,'reversal_of_allocation_id',prior.reversal_of_allocation_id) ORDER BY prior.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
    INTO prior_state_hash FROM procurement.purchase_order_advance_allocations prior
   WHERE prior.org_id=organization_id AND prior.purchase_order_line_id=line.id AND prior.payment_id<>payment_id;
  IF prior_gross+gross>line.net_value_amount THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance exceeds remaining purchase-order line net value'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':supplier-advance:'||bank.id::text||':'||reference||':'||payment_date::text||':'||gross::text,672010));
  SELECT count(*) INTO duplicate_count FROM finance.payments existing WHERE existing.org_id=organization_id
    AND existing.bank_account_id=bank.id AND upper(pg_catalog.btrim(existing.external_reference))=reference
    AND existing.payment_date=payment_date AND existing.amount=gross AND existing.status<>'reversed' AND existing.id<>payment_id;
  IF duplicate_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier advance bank reference, date, and amount already exist'; END IF;
  resolved_allocations:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id',requested->>'advance_allocation_id','purchase_order_line_id',line.id,
    'prepayment_open_item_id',requested->>'prepayment_open_item_id','cash_disbursed_amount',gross::text,
    'withheld_amount','0.00','gross_advance_amount',gross::text,'withholding_id',NULL));
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_party_tax_profile','id',party.id,'row_version',party.row_version,
      'pan_verification_status',party.pan_verification_status,'tax_residency_status',party.tax_residency_status,
      'evidence_attachment_id',party_evidence.id,'evidence_sha256',pg_catalog.encode(party_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,'status',purchase_order.status),
    pg_catalog.jsonb_build_object('resource_type','purchase_order_line_advance_state','id',line.id,
      'net_value_amount',line.net_value_amount::text,'withholding_nature_code',line.withholding_nature_code,
      'prior_active_gross',prior_gross::text,'prior_count',prior_count,'prior_state_hash',prior_state_hash),
    pg_catalog.jsonb_build_object('resource_type','organization_fiscal_tax_fact','id',fiscal_fact.id,
      'fiscal_year_start_year',fiscal_fact.fiscal_year_start_year,'prior_fiscal_year_turnover',fiscal_fact.prior_fiscal_year_turnover::text,
      'gst_tds_notified_deductor',fiscal_fact.gst_tds_notified_deductor,'evidence_attachment_id',fiscal_evidence.id,
      'evidence_sha256',pg_catalog.encode(fiscal_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_prepayment_role','id',prepayment.id,'row_version',prepayment.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_disbursement_collision','bank_account_id',bank.id,
      'external_reference',reference,'payment_date',payment_date,'amount',gross::text,'candidate_count',duplicate_count));
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'payment_id',payment_id,'payment_date',payment_date,
    'supplier_account_id',supplier.id,'supplier_party_id',party.id,'purchase_order_id',purchase_order.id,
    'bank_account_id',bank.id,'settlement_account_id',settlement.id,'supplier_prepayment_account_id',prepayment.id,
    'payment_method',method,'external_reference',reference,'gross_amount',gross::text,'cash_amount',gross::text,
    'withheld_amount','0.00','currency_code','INR','allocations',resolved_allocations,
    'legal_scope',pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','advance_subject','goods_net_value',
      'gst_on_goods_advance','not_payable_notification_66_2017','income_tax_withholding','not_applicable_verified_prior_fy_turnover_at_or_below_inr_10_crore',
      'gst_tds','not_applicable_verified_notified_deductor_false','supported_payment_methods',pg_catalog.jsonb_build_array('bank_transfer','upi'),
      'allocation_cardinality','exactly_one_purchase_order_product_line','withholding_application_and_reversal','unavailable'),
    'source_versions',source_versions);
END
''',
            runtime=True,
        ),
        *_function(
            '"assert_supplier_advance_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb)',
            "void",
            '''
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE; line_count integer;
BEGIN
  SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF ROW(payment.payment_date,payment.direction,payment.party_id,payment.branch_id,payment.bank_account_id,
         payment.settlement_account_id,payment.payment_method,payment.payment_purpose,payment.currency_code,
         payment.amount,payment.functional_amount,payment.fx_rate,payment.external_reference,payment.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'disbursement',(resolution->>'supplier_party_id')::uuid,
         (resolution->>'branch_id')::uuid,(resolution->>'bank_account_id')::uuid,(resolution->>'settlement_account_id')::uuid,
         resolution->>'payment_method','supplier_advance','INR'::bpchar,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,1.000000::numeric,resolution->>'external_reference','approved')
     OR ROW(journal.posting_date,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,
         journal.functional_credit_total,journal.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'INR'::bpchar,'INR'::bpchar,1.000000::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,'draft') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier advance payment or journal draft changed'; END IF;
  SELECT count(*) INTO line_count FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
  IF line_count<>2 OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=1 AND account_id=(resolution->>'supplier_prepayment_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id=(resolution->>'supplier_party_id')::uuid
       AND transaction_debit=(resolution->>'gross_amount')::numeric AND transaction_credit=0
       AND functional_debit=(resolution->>'gross_amount')::numeric AND functional_credit=0)
     OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=2 AND account_id=(resolution->>'settlement_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id IS NULL
       AND transaction_debit=0 AND transaction_credit=(resolution->>'cash_amount')::numeric
       AND functional_debit=0 AND functional_credit=(resolution->>'cash_amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier advance exact two-line journal changed'; END IF;
END
''',
        ),
        *_function(
            '"persist_supplier_advance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; payment_sequence_id uuid; journal_sequence_id uuid;
        payment_number text; journal_number text; fiscal_year integer; aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR payment_id IS NULL OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(payment_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32 OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576 OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier advance persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
  resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  current_resolution:="{SCHEMA}"."resolve_supplier_advance_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'payment_id' IS DISTINCT FROM payment_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text OR request_document->>'event_id' IS DISTINCT FROM event_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb OR preview_document->'tax_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier advance resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.supplier_advance.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier advance idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'payment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.supplier_advance.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'gross_amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='supplier_advance'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'payment_date')::date,'disbursement',
    (resolved_document->>'supplier_party_id')::uuid,(resolved_document->>'branch_id')::uuid,
    (resolved_document->>'bank_account_id')::uuid,(resolved_document->>'settlement_account_id')::uuid,
    resolved_document->>'payment_method','supplier_advance','INR',(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,1,resolved_document->>'external_reference','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'payment_date')::date,
    'Supplier advance '||payment_number,'INR','INR',1,(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(resolved_document->>'supplier_prepayment_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_party_id')::uuid,'Supplier goods prepayment',
    (resolved_document->>'gross_amount')::numeric,0,(resolved_document->>'gross_amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'settlement_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,NULL,'Supplier advance bank settlement',0,
    (resolved_document->>'cash_amount')::numeric,0,(resolved_document->>'cash_amount')::numeric);
  PERFORM "{SCHEMA}"."assert_supplier_advance_draft"(organization_id,payment_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            runtime=True,
        ),
    ]


def _customer_receipt_prepare_definition() -> list[str]:
    return [
        *_function(
            '"resolve_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)',
            "jsonb",
            '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        payment_date date:=NULLIF(request_document->>'payment_date','')::date;
        customer_id uuid:=NULLIF(request_document->>'customer_account_id','')::uuid;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        settlement_id uuid; evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        sales_order_id uuid:=NULLIF(request_document->>'sales_order_id','')::uuid;
        payment_amount numeric(20,2):=NULLIF(request_document->>'amount','')::numeric;
        method text:=request_document->>'payment_method'; purpose text:=request_document->>'receipt_purpose';
        reference text:=upper(NULLIF(pg_catalog.btrim(request_document->>'external_reference'),''));
        branch core.branches%ROWTYPE; customer parties.customer_accounts%ROWTYPE; party parties.parties%ROWTYPE;
        bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE; receivable finance.accounts%ROWTYPE;
        evidence core.attachments%ROWTYPE; sales_order sales.orders%ROWTYPE; cash_limit_setting core.settings%ROWTYPE;
        cash_rolling_setting core.settings%ROWTYPE; cash_days_setting core.settings%ROWTYPE;
        cash_prior numeric(20,2); customer_advance_prior numeric(20,2); customer_advance_account finance.accounts%ROWTYPE;
        requested jsonb; item finance.open_items%ROWTYPE; event finance.accounting_events%ROWTYPE; invoice sales.invoices%ROWTYPE;
        resolved_allocations jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        prior_allocated numeric(20,2); requested_total numeric(20,2):=0; allocation_count integer; duplicate_count integer;
        allocation_state_hash text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR payment_id IS NULL OR branch_id IS NULL OR payment_date IS NULL OR customer_id IS NULL
     OR payment_amount<=0 OR method NOT IN ('cash','cheque','bank_transfer','card','upi')
     OR purpose NOT IN ('invoice_settlement','customer_advance')
     OR reference IS NULL OR pg_catalog.length(reference)>256
     OR pg_catalog.jsonb_typeof(request_document->'allocations')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'allocations') NOT BETWEEN 0 AND 500
     OR (purpose='invoice_settlement' AND pg_catalog.jsonb_array_length(request_document->'allocations')=0)
     OR (purpose='customer_advance' AND (pg_catalog.jsonb_array_length(request_document->'allocations')<>0 OR sales_order_id IS NULL))
     OR (purpose='invoice_settlement' AND sales_order_id IS NOT NULL)
     OR (method IN ('cash','cheque') AND bank_id IS NOT NULL)
     OR (method NOT IN ('cash','cheque') AND bank_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt method, purpose, and allocation identity are incomplete'; END IF;
  IF payment_date>CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='customer receipt date cannot be in the future'; END IF;
  IF (SELECT count(DISTINCT value->>'open_item_id') FROM pg_catalog.jsonb_array_elements(request_document->'allocations'))
       <>pg_catalog.jsonb_array_length(request_document->'allocations') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt requires unique receivable allocations'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.customer_receipt.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer-receipt delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.allocate',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer-receipt verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT customer FROM parties.customer_accounts WHERE org_id=organization_id AND id=customer_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=customer.party_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT receivable FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'accounts_receivable','asset','INR',true)
    AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_party_posting FOR SHARE;
  IF customer.default_receivable_account_id IS DISTINCT FROM receivable.id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer default receivable does not match canonical branch account role'; END IF;
  IF method IN ('bank_transfer','card','upi') THEN
    SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
      AND status='active' AND currency_code='INR' FOR SHARE;
    settlement_id:=bank.account_id;
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id
      AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_bank_reconciliation FOR SHARE;
  ELSIF method='cash' THEN
    settlement_id:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cash_on_hand','asset','INR',false);
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id FOR SHARE;
    SELECT * INTO STRICT cash_limit_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='max_single_amount' AND value_type='numeric'
      AND status='active' AND value_numeric>0 FOR SHARE;
    SELECT * INTO STRICT cash_rolling_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='max_customer_rolling_amount' AND value_type='numeric'
      AND status='active' AND value_numeric>0 FOR SHARE;
    SELECT * INTO STRICT cash_days_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='rolling_window_days' AND value_type='numeric'
      AND status='active' AND value_numeric=pg_catalog.trunc(value_numeric) AND value_numeric>0 FOR SHARE;
    SELECT coalesce(sum(existing.amount),0) INTO cash_prior FROM finance.payments existing
      WHERE existing.org_id=organization_id AND existing.party_id=party.id AND existing.branch_id=branch_id
        AND existing.payment_method='cash' AND existing.direction='receipt' AND existing.status='posted'
        AND existing.payment_date BETWEEN payment_date-cash_days_setting.value_numeric::integer+1 AND payment_date;
    IF payment_amount>cash_limit_setting.value_numeric OR cash_prior+payment_amount>cash_rolling_setting.value_numeric THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cash receipt exceeds effective canonical branch or customer aggregation rule'; END IF;
  ELSE
    IF request_document->>'instrument_number' IS NULL OR NULLIF(request_document->>'instrument_date','')::date IS NULL
       OR NULLIF(pg_catalog.btrim(request_document->>'drawee_bank_name'),'') IS NULL
       OR coalesce((request_document->>'account_payee_confirmed')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque receipt requires exact account-payee instrument evidence'; END IF;
    settlement_id:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cheques_in_hand','asset','INR',false);
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id FOR SHARE;
  END IF;
  IF purpose='customer_advance' THEN
    SELECT * INTO STRICT sales_order FROM sales.orders WHERE org_id=organization_id AND id=sales_order_id
      AND branch_id=branch_id AND customer_account_id=customer.id AND status IN ('approved','partially_fulfilled')
      AND currency_code='INR' AND tax_charge_mechanism='normal' AND supply_type IN ('intra_state','inter_state') FOR SHARE;
    IF EXISTS (SELECT 1 FROM sales.order_lines line WHERE line.org_id=organization_id AND line.order_id=sales_order.id
       AND line.line_kind<>'product') OR NOT EXISTS (SELECT 1 FROM sales.order_lines line
       WHERE line.org_id=organization_id AND line.order_id=sales_order.id AND line.line_kind='product') THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='customer advance is restricted to an approved goods-only sales order'; END IF;
    SELECT coalesce(sum(existing.amount),0) INTO customer_advance_prior FROM finance.payments existing
      WHERE existing.org_id=organization_id AND existing.sales_order_id=sales_order.id
        AND existing.payment_purpose='customer_advance' AND existing.status='posted'
        AND NOT EXISTS (SELECT 1 FROM finance.payments reversal WHERE reversal.org_id=existing.org_id
          AND reversal.reversal_of_payment_id=existing.id AND reversal.status='posted');
    IF customer_advance_prior+payment_amount>sales_order.grand_total THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer advance exceeds locked goods-order residual'; END IF;
    SELECT * INTO STRICT customer_advance_account FROM finance.accounts WHERE org_id=organization_id
      AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'customer_advance','liability','INR',true) FOR SHARE;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':customer-receipt:'||coalesce(bank.id::text,settlement.id::text)||':'||reference||':'||payment_date::text||':'||payment_amount::text,672009));
  SELECT count(*) INTO duplicate_count FROM finance.payments existing
   WHERE existing.org_id=organization_id AND existing.settlement_account_id=settlement.id
     AND upper(pg_catalog.btrim(existing.external_reference))=reference AND existing.payment_date=payment_date
     AND existing.amount=payment_amount AND existing.status<>'reversed' AND existing.id<>payment_id;
  IF duplicate_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='customer receipt bank reference, date, and amount already exist'; END IF;
  PERFORM 1 FROM finance.open_items candidate
   JOIN pg_catalog.jsonb_array_elements(request_document->'allocations') payload(value)
     ON candidate.id=(payload.value->>'open_item_id')::uuid
   WHERE candidate.org_id=organization_id ORDER BY candidate.id FOR UPDATE OF candidate;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'allocations') LOOP
    IF NULLIF(requested->>'allocation_id','')::uuid IS NULL OR NULLIF(requested->>'open_item_id','')::uuid IS NULL
       OR NULLIF(requested->>'amount','')::numeric<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt allocation identity and positive amount are required'; END IF;
    SELECT * INTO STRICT item FROM finance.open_items WHERE org_id=organization_id
      AND id=(requested->>'open_item_id')::uuid AND item_side='receivable' AND party_id=party.id
      AND currency_code='INR' AND status='open' AND document_date<=payment_date FOR UPDATE;
    SELECT * INTO STRICT event FROM finance.accounting_events WHERE org_id=organization_id
      AND id=item.accounting_event_id AND event_type='sales_invoice' AND sales_invoice_id IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT invoice FROM sales.invoices WHERE org_id=organization_id AND id=event.sales_invoice_id
      AND branch_id=branch.id AND customer_account_id=customer.id AND currency_code='INR' AND status='posted' FOR SHARE;
    PERFORM 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id ORDER BY prior.id FOR SHARE;
    SELECT coalesce(sum(prior.amount),0),count(*) INTO prior_allocated,allocation_count FROM finance.allocations prior
     WHERE prior.org_id=organization_id AND prior.open_item_id=item.id AND prior.status='posted'
       AND prior.reversal_of_allocation_id IS NULL AND NOT EXISTS (
         SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
           AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed');
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',prior.id,'payment_id',prior.payment_id,'withholding_id',prior.withholding_id,
          'adjustment_note_id',prior.adjustment_note_id,'purchase_order_advance_allocation_id',prior.purchase_order_advance_allocation_id,
          'amount',prior.amount::text,'status',prior.status,'reversal_of_allocation_id',prior.reversal_of_allocation_id)
        ORDER BY prior.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO allocation_state_hash
      FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id;
    IF prior_allocated+(requested->>'amount')::numeric>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt allocation exceeds live receivable balance'; END IF;
    requested_total:=requested_total+(requested->>'amount')::numeric;
    resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'allocation_id',requested->>'allocation_id','open_item_id',item.id,'invoice_id',invoice.id,
      'document_number',item.document_number,'principal_amount',item.principal_amount::text,
      'prior_allocated_amount',prior_allocated::text,'amount',(requested->>'amount')::numeric::text,
      'residual_after',(item.principal_amount-prior_allocated-(requested->>'amount')::numeric)::text));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','receivable_allocation_state','id',item.id,'invoice_id',invoice.id,'invoice_row_version',invoice.row_version,
      'principal_amount',item.principal_amount::text,'status',item.status,'allocation_count',allocation_count,
      'active_allocated_amount',prior_allocated::text,'allocation_state_hash',allocation_state_hash));
  END LOOP;
  IF (purpose='invoice_settlement' AND requested_total<>payment_amount)
     OR (purpose='customer_advance' AND requested_total<>0) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='receipt allocations do not match the selected settlement purpose'; END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','customer_account','id',customer.id,'row_version',customer.row_version),
    pg_catalog.jsonb_build_object('resource_type','customer_party','id',party.id,'row_version',party.row_version),
    pg_catalog.jsonb_build_object('resource_type','accounts_receivable_role','id',receivable.id,'row_version',receivable.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version),
    pg_catalog.jsonb_build_object('resource_type','receipt_evidence','id',evidence.id,
      'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','bank_receipt_collision','bank_account_id',bank.id,'external_reference',reference,
      'payment_date',payment_date,'amount',payment_amount::text,'candidate_count',duplicate_count))||source_versions;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'payment_id',payment_id,'payment_date',payment_date,
    'customer_account_id',customer.id,'customer_party_id',party.id,'bank_account_id',bank.id,
    'settlement_account_id',settlement.id,'accounts_receivable_account_id',receivable.id,
    'customer_advance_account_id',customer_advance_account.id,'payment_method',method,'receipt_purpose',purpose,
    'sales_order_id',sales_order.id,'evidence_attachment_id',evidence.id,
    'instrument_number',request_document->>'instrument_number','instrument_date',request_document->>'instrument_date',
    'drawee_bank_name',request_document->>'drawee_bank_name','account_payee_confirmed',request_document->>'account_payee_confirmed',
    'external_reference',reference,'amount',payment_amount::text,'currency_code','INR','allocations',resolved_allocations,
    'legal_scope',pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','settlement',purpose,
      'supported_payment_methods',pg_catalog.jsonb_build_array('cash','cheque','bank_transfer','card','upi'),
      'cash','canonical_branch_rule_and_verified_evidence','cheque','account_payee_cheques_in_hand_until_named_terminal_action',
      'customer_deducted_tds','unavailable_seller_tds_receivable_form16a_26as_authority',
      'fx','unavailable','customer_advance','goods_order_liability_without_gst_document_or_invoice_allocation'),
    'source_versions',source_versions);
END
''',
            runtime=True,
        ),
        *_function(
            '"assert_customer_receipt_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb)',
            "void",
            '''
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE; line_count integer;
BEGIN
  SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF ROW(payment.payment_date,payment.direction,payment.party_id,payment.branch_id,payment.bank_account_id,
         payment.settlement_account_id,payment.payment_method,payment.payment_purpose,payment.currency_code,
         payment.amount,payment.functional_amount,payment.fx_rate,payment.external_reference,payment.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'receipt',(resolution->>'customer_party_id')::uuid,
         (resolution->>'branch_id')::uuid,(resolution->>'bank_account_id')::uuid,(resolution->>'settlement_account_id')::uuid,
         resolution->>'payment_method',CASE resolution->>'receipt_purpose' WHEN 'customer_advance' THEN 'customer_advance' ELSE 'commercial_settlement' END,
         'INR'::bpchar,(resolution->>'amount')::numeric,
         (resolution->>'amount')::numeric,1.000000::numeric,resolution->>'external_reference','approved')
     OR ROW(journal.posting_date,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,
         journal.functional_credit_total,journal.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'INR'::bpchar,'INR'::bpchar,1.000000::numeric,
         (resolution->>'amount')::numeric,(resolution->>'amount')::numeric,(resolution->>'amount')::numeric,
         (resolution->>'amount')::numeric,'draft') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt payment or journal draft changed'; END IF;
  SELECT count(*) INTO line_count FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
  IF line_count<>2 OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=1 AND account_id=(resolution->>'settlement_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id IS NULL
       AND transaction_debit=(resolution->>'amount')::numeric AND transaction_credit=0
       AND functional_debit=(resolution->>'amount')::numeric AND functional_credit=0)
     OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=2 AND account_id=(CASE WHEN resolution->>'receipt_purpose'='customer_advance'
         THEN resolution->>'customer_advance_account_id' ELSE resolution->>'accounts_receivable_account_id' END)::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id=(resolution->>'customer_party_id')::uuid
       AND transaction_debit=0 AND transaction_credit=(resolution->>'amount')::numeric
       AND functional_debit=0 AND functional_credit=(resolution->>'amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt exact two-line journal changed'; END IF;
END
''',
        ),
        *_function(
            '"persist_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; payment_sequence_id uuid; journal_sequence_id uuid;
        payment_number text; journal_number text; fiscal_year integer; aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR payment_id IS NULL OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(payment_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32 OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576 OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt persistence envelope is invalid'; END IF;
  BEGIN request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt persistence requires UTF-8 JSON'; END;
  current_resolution:="{SCHEMA}"."resolve_customer_receipt_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'payment_id' IS DISTINCT FROM payment_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text OR request_document->>'event_id' IS DISTINCT FROM event_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb OR preview_document->'tax_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.customer_receipt.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='customer receipt idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'payment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.customer_receipt.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='customer_receipt'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    sales_order_id,evidence_attachment_id,instrument_number,instrument_date,drawee_bank_name,account_payee_confirmed,
    status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'payment_date')::date,'receipt',
    (resolved_document->>'customer_party_id')::uuid,(resolved_document->>'branch_id')::uuid,
    (resolved_document->>'bank_account_id')::uuid,(resolved_document->>'settlement_account_id')::uuid,
    resolved_document->>'payment_method',CASE resolved_document->>'receipt_purpose' WHEN 'customer_advance' THEN 'customer_advance' ELSE 'commercial_settlement' END,
    'INR',(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,1,resolved_document->>'external_reference',
    (resolved_document->>'sales_order_id')::uuid,(resolved_document->>'evidence_attachment_id')::uuid,
    resolved_document->>'instrument_number',(resolved_document->>'instrument_date')::date,
    resolved_document->>'drawee_bank_name',(resolved_document->>'account_payee_confirmed')::boolean,
    'approved',pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'payment_date')::date,
    'Customer receipt '||payment_number,'INR','INR',1,(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(resolved_document->>'settlement_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,NULL,'Customer receipt bank settlement',(resolved_document->>'amount')::numeric,0,
    (resolved_document->>'amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(CASE WHEN resolved_document->>'receipt_purpose'='customer_advance'
      THEN resolved_document->>'customer_advance_account_id' ELSE resolved_document->>'accounts_receivable_account_id' END)::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'customer_party_id')::uuid,
    CASE WHEN resolved_document->>'receipt_purpose'='customer_advance' THEN 'Customer goods advance liability' ELSE 'Customer receivable allocation' END,0,
    (resolved_document->>'amount')::numeric,0,(resolved_document->>'amount')::numeric);
  PERFORM "{SCHEMA}"."assert_customer_receipt_draft"(organization_id,payment_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
''',
            runtime=True,
        ),
    ]


def _customer_cheque_lifecycle_prepare_definition() -> list[str]:
    statements = [
        *_function(
            '"resolve_customer_cheque_action_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, action_payment_id uuid, action_kind text, request_document jsonb)',
            "jsonb",
            '''
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        original_id uuid:=NULLIF(request_document->>'original_payment_id','')::uuid;
        action_date date:=CASE action_kind WHEN 'clearance' THEN NULLIF(request_document->>'clearance_date','')::date
          ELSE NULLIF(request_document->>'bounce_date','')::date END;
        evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        requested_version bigint:=NULLIF(request_document->>'original_payment_row_version','')::bigint;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        original finance.payments%ROWTYPE; bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE;
        evidence core.attachments%ROWTYPE; cheque_account finance.accounts%ROWTYPE; offset_account finance.accounts%ROWTYPE;
        capability_code text:='finance.customer_cheque_'||action_kind||'.prepare';
        operation_name text:='finance.customer_cheque_'||action_kind||'.post';
        terminal_count integer; compensating jsonb:='[]'::jsonb; source_versions jsonb;
BEGIN
  IF action_kind NOT IN ('clearance','bounce') OR action_payment_id IS NULL OR branch_id IS NULL OR original_id IS NULL
     OR action_date IS NULL OR evidence_id IS NULL OR requested_version IS NULL OR action_date>CURRENT_DATE
     OR (action_kind='clearance' AND (bank_id IS NULL OR NULLIF(pg_catalog.btrim(request_document->>'clearance_reference'),'') IS NULL))
     OR (action_kind='bounce' AND (bank_id IS NOT NULL OR request_document->>'reason_code' NOT IN
       ('funds_insufficient','signature_mismatch','account_closed','payment_stopped','instrument_invalid','other'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cheque terminal-action input is incomplete'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code=capability_code AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cheque terminal-action delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cheque terminal-action permission is inactive'; END IF;
  SELECT * INTO STRICT original FROM finance.payments WHERE org_id=organization_id AND id=original_id
    AND branch_id=branch_id AND status='posted' AND direction='receipt' AND payment_method='cheque'
    AND payment_purpose IN ('commercial_settlement','customer_advance')
    AND account_payee_confirmed AND row_version=requested_version FOR UPDATE;
  IF action_date<original.payment_date OR (action_kind='bounce' AND original.payment_purpose='customer_advance'
     AND NOT EXISTS (SELECT 1 FROM finance.open_items item JOIN finance.accounting_events event
       ON event.org_id=item.org_id AND event.id=item.accounting_event_id
       WHERE event.org_id=organization_id AND event.payment_id=original.id AND item.item_side='payable' AND item.status='open')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque terminal action is stale or inconsistent with its open balance'; END IF;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT count(*) INTO terminal_count FROM finance.payments terminal WHERE terminal.org_id=organization_id
    AND terminal.related_payment_id=original.id AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce')
    AND terminal.status='posted';
  IF terminal_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque already has a posted terminal action'; END IF;
  SELECT * INTO STRICT cheque_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cheques_in_hand','asset','INR',false)
    AND id=original.settlement_account_id FOR SHARE;
  IF action_kind='clearance' THEN
    SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
      AND status='active' AND currency_code='INR' FOR SHARE;
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=bank.account_id
      AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_bank_reconciliation FOR SHARE;
  ELSE
    settlement:=cheque_account;
    SELECT * INTO STRICT offset_account FROM finance.accounts WHERE org_id=organization_id
      AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,
        CASE original.payment_purpose WHEN 'customer_advance' THEN 'customer_advance' ELSE 'accounts_receivable' END,
        CASE original.payment_purpose WHEN 'customer_advance' THEN 'liability' ELSE 'asset' END,'INR',true) FOR SHARE;
    IF original.payment_purpose='commercial_settlement' THEN
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'original_allocation_id',allocation.id,'open_item_id',allocation.open_item_id,
        'reversal_allocation_id',ids.value->>'reversal_allocation_id') ORDER BY allocation.id),'[]'::jsonb)
        INTO compensating FROM finance.allocations allocation
        JOIN pg_catalog.jsonb_array_elements(request_document->'compensating_allocations') ids(value)
          ON (ids.value->>'original_allocation_id')::uuid=allocation.id
       WHERE allocation.org_id=organization_id AND allocation.payment_id=original.id AND allocation.status='posted'
         AND allocation.reversal_of_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.allocations reversal
           WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id);
    ELSE
      SELECT pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('open_item_id',item.id,
        'allocation_id',request_document#>>'{compensating_allocations,0,allocation_id}')) INTO compensating
       FROM finance.accounting_events event JOIN finance.open_items item
         ON item.org_id=event.org_id AND item.accounting_event_id=event.id
       WHERE event.org_id=organization_id AND event.payment_id=original.id AND item.item_side='payable' FOR UPDATE OF item;
    END IF;
  END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','customer_cheque_receipt','id',original.id,'row_version',original.row_version,
      'status',original.status,'payment_purpose',original.payment_purpose,'amount',original.amount::text,
      'instrument_number',original.instrument_number,'instrument_date',original.instrument_date,
      'evidence_attachment_id',original.evidence_attachment_id),
    pg_catalog.jsonb_build_object('resource_type','terminal_action_collision','id',original.id,'candidate_count',terminal_count),
    pg_catalog.jsonb_build_object('resource_type','terminal_evidence','id',evidence.id,'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version));
  RETURN pg_catalog.jsonb_build_object('branch_id',branch_id,'payment_id',action_payment_id,'original_payment_id',original.id,
    'action_kind',action_kind,'operation',operation_name,'action_date',action_date,'customer_party_id',original.party_id,
    'bank_account_id',bank.id,'settlement_account_id',settlement.id,'cheques_in_hand_account_id',cheque_account.id,
    'offset_account_id',offset_account.id,'amount',original.amount::text,'currency_code','INR',
    'external_reference',CASE action_kind WHEN 'clearance' THEN upper(pg_catalog.btrim(request_document->>'clearance_reference'))
      ELSE original.external_reference||':BOUNCE:'||upper(request_document->>'reason_code') END,
    'evidence_attachment_id',evidence.id,'reason_code',request_document->>'reason_code',
    'compensating_allocations',compensating,
    'legal_scope',pg_catalog.jsonb_build_object('instrument','account_payee_cheque','terminal_action',action_kind,
      'allocation_effect',CASE action_kind WHEN 'bounce' THEN 'exact_compensating_reopen' ELSE 'none' END),
    'source_versions',source_versions);
END
''',
        ),
    ]
    for action in ("clearance", "bounce"):
        operation = f"finance.customer_cheque_{action}.prepare"
        statements.extend(_function(
            f'"resolve_customer_cheque_{action}_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)',
            "jsonb",
            f'''BEGIN
  RETURN "{SCHEMA}"."resolve_customer_cheque_action_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,'{action}',request_document);
END''',
            runtime=True,
        ))
        statements.extend(_function(
            f'"persist_customer_cheque_{action}_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)',
            "jsonb",
            f'''
DECLARE request_document jsonb:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document jsonb:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        preview_document jsonb:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
        current_resolution jsonb; existing automation.command_requests%ROWTYPE;
        payment_sequence_id uuid; journal_sequence_id uuid; original_journal_id uuid;
        payment_number text; journal_number text; fiscal_year integer;
BEGIN
  current_resolution:="{SCHEMA}"."resolve_customer_cheque_{action}_prepare"(organization_id,membership_id,
    auth_user_id,application_user_id,grant_id,caller_client_id,payment_id,request_document);
  IF current_resolution IS DISTINCT FROM resolved_document OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cheque {action} resolution changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='{operation}' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque {action} idempotency input changed'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  PERFORM "{SCHEMA}"."prepare_operator_command"(organization_id,command_id,grant_id,'{operation}',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256'),expires_at);
  fiscal_year:=CASE WHEN extract(month FROM (resolved_document->>'action_date')::date)>=4
    THEN extract(year FROM (resolved_document->>'action_date')::date)::integer
    ELSE extract(year FROM (resolved_document->>'action_date')::date)::integer-1 END;
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='customer_receipt'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  IF '{action}'='bounce' THEN SELECT journal_entry_id INTO STRICT original_journal_id FROM finance.accounting_events
    WHERE org_id=organization_id AND payment_id=(resolved_document->>'original_payment_id')::uuid FOR SHARE; END IF;
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    related_payment_id,evidence_attachment_id,memo,status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'action_date')::date,
    CASE '{action}' WHEN 'bounce' THEN 'disbursement' ELSE 'receipt' END,(resolved_document->>'customer_party_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'bank_account_id')::uuid,
    (resolved_document->>'settlement_account_id')::uuid,CASE '{action}' WHEN 'bounce' THEN 'cheque' ELSE 'bank_transfer' END,
    'cheque_{action}','INR',(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,1,
    resolved_document->>'external_reference',(resolved_document->>'original_payment_id')::uuid,
    (resolved_document->>'evidence_attachment_id')::uuid,resolved_document->>'reason_code','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,
    reversal_of_journal_entry_id,reversal_reason,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'action_date')::date,'Customer cheque {action}',
    'INR','INR',1,(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,original_journal_id,
    CASE '{action}' WHEN 'bounce' THEN resolved_document->>'reason_code' ELSE NULL END,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(CASE '{action}' WHEN 'bounce' THEN resolved_document->>'offset_account_id'
      ELSE resolved_document->>'settlement_account_id' END)::uuid,(resolved_document->>'branch_id')::uuid,
      CASE '{action}' WHEN 'bounce' THEN (resolved_document->>'customer_party_id')::uuid ELSE NULL END,'Cheque {action} debit',
      (resolved_document->>'amount')::numeric,0,(resolved_document->>'amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'cheques_in_hand_account_id')::uuid,
      (resolved_document->>'branch_id')::uuid,NULL,'Cheque {action} credit',0,(resolved_document->>'amount')::numeric,
      0,(resolved_document->>'amount')::numeric);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END''',
            runtime=True,
        ))
    return statements


def _execution_definition() -> list[str]:
    return [
        *_function(
            '"guard_command_request_mutation"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='command request evidence cannot be deleted';
    END IF;
    IF "{SCHEMA}"."write_scope_active"('calculation_link',NEW.org_id,NEW.id) THEN
        IF OLD.status<>'prepared' OR NEW.status<>'prepared'
           OR OLD.calculation_hash IS NOT NULL OR pg_catalog.octet_length(NEW.calculation_hash)<>32
           OR NEW.row_version<>OLD.row_version+1
           OR ROW(NEW.org_id,NEW.id,NEW.agent_grant_id,NEW.requested_by_membership_id,
                  NEW.capability_code,NEW.operation,NEW.operation_mode,NEW.branch_id,NEW.destination_branch_id,
                  NEW.requested_amount,NEW.currency_code,NEW.requests_sensitive_read,
                  NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version,
                  NEW.request_reason,NEW.serializer_version,NEW.idempotency_key_hash,
                  NEW.request_media_type,NEW.request_bytes,NEW.request_hash,
                  NEW.preview_media_type,NEW.preview_bytes,NEW.preview_hash,
                  NEW.aggregate_version_hash,NEW.risk_class,NEW.approval_policy,
                  NEW.required_approval_count,NEW.expires_at,NEW.created_at)
              IS DISTINCT FROM
              ROW(OLD.org_id,OLD.id,OLD.agent_grant_id,OLD.requested_by_membership_id,
                  OLD.capability_code,OLD.operation,OLD.operation_mode,OLD.branch_id,OLD.destination_branch_id,
                  OLD.requested_amount,OLD.currency_code,OLD.requests_sensitive_read,
                  OLD.target_resource_type,OLD.target_resource_id,OLD.target_row_version,
                  OLD.request_reason,OLD.serializer_version,OLD.idempotency_key_hash,
                  OLD.request_media_type,OLD.request_bytes,OLD.request_hash,
                  OLD.preview_media_type,OLD.preview_bytes,OLD.preview_hash,
                  OLD.aggregate_version_hash,OLD.risk_class,OLD.approval_policy,
                  OLD.required_approval_count,OLD.expires_at,OLD.created_at) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation link may set only the exact authority hash once';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT "{SCHEMA}"."execution_scope_active"(NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command state changes require the exact execution boundary';
    END IF;
    IF OLD.status IN ('succeeded','failed','rejected','expired','cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal command request is immutable';
    END IF;
    IF OLD.status='prepared' AND NEW.status NOT IN ('approved','cancelled','expired')
       OR OLD.status='pending_approval' AND NEW.status NOT IN ('approved','rejected','cancelled','expired')
       OR OLD.status='approved' AND NEW.status NOT IN ('executing','expired')
       OR OLD.status='executing' AND NEW.status NOT IN ('succeeded','failed') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid command request lifecycle transition';
    END IF;
    IF ROW(NEW.org_id,NEW.id,NEW.agent_grant_id,NEW.requested_by_membership_id,
           NEW.capability_code,NEW.operation,NEW.operation_mode,NEW.branch_id,NEW.destination_branch_id,
           NEW.requested_amount,NEW.currency_code,NEW.requests_sensitive_read,
           NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version,
           NEW.request_reason,NEW.serializer_version,NEW.idempotency_key_hash,
           NEW.request_media_type,NEW.request_bytes,NEW.request_hash,
           NEW.preview_media_type,NEW.preview_bytes,NEW.preview_hash,
           NEW.calculation_hash,NEW.aggregate_version_hash,NEW.risk_class,
           NEW.approval_policy,NEW.required_approval_count,NEW.expires_at,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.org_id,OLD.id,OLD.agent_grant_id,OLD.requested_by_membership_id,
           OLD.capability_code,OLD.operation,OLD.operation_mode,OLD.branch_id,OLD.destination_branch_id,
           OLD.requested_amount,OLD.currency_code,OLD.requests_sensitive_read,
           OLD.target_resource_type,OLD.target_resource_id,OLD.target_row_version,
           OLD.request_reason,OLD.serializer_version,OLD.idempotency_key_hash,
           OLD.request_media_type,OLD.request_bytes,OLD.request_hash,
           OLD.preview_media_type,OLD.preview_bytes,OLD.preview_hash,
           OLD.calculation_hash,OLD.aggregate_version_hash,OLD.risk_class,
           OLD.approval_policy,OLD.required_approval_count,OLD.expires_at,OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved command snapshot facts are immutable';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='command row version must advance exactly once per transition';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "command_requests_execution_guard",
            "UPDATE OR DELETE",
            "automation.command_requests",
            "guard_command_request_mutation",
        ),
        *_function(
            '"guard_command_approval_write"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='command approval evidence is append-only';
    END IF;
    IF NOT "{SCHEMA}"."write_scope_active"('approval',NEW.org_id,NEW.command_request_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command approvals may be inserted only by the reviewed approval authority';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "command_approvals_reviewed_write_guard",
            "INSERT OR UPDATE OR DELETE",
            "automation.command_approvals",
            "guard_command_approval_write",
        ),
        *_function(
            '"approve_operator_command"(organization_id uuid, command_request_id uuid, approval_id uuid, preview_hash_input bytea, key_hash bytea, valid_until_at timestamptz)',
            "uuid",
            f'''
DECLARE
    actor_id uuid := erp_security.current_membership_id();
    request_row automation.command_requests%ROWTYPE;
    existing automation.command_approvals%ROWTYPE;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
       OR erp_security.has_permission('automation.command.approve',NULL::uuid) IS DISTINCT FROM true
       OR pg_catalog.octet_length(preview_hash_input)<>32
       OR pg_catalog.octet_length(key_hash)<>32 THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='operator approval context, permission, or hash is invalid';
    END IF;
    SELECT * INTO STRICT request_row FROM automation.command_requests
     WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
    IF request_row.status NOT IN ('prepared','pending_approval','approved')
       OR request_row.expires_at<=pg_catalog.transaction_timestamp()
       OR request_row.preview_hash IS DISTINCT FROM preview_hash_input
       OR valid_until_at<=pg_catalog.transaction_timestamp()
       OR valid_until_at>request_row.expires_at THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='command is not eligible for this exact approval';
    END IF;
    SELECT * INTO existing FROM automation.command_approvals
     WHERE org_id=organization_id AND approver_membership_id=actor_id
       AND idempotency_key_hash=key_hash;
    IF FOUND THEN
        IF existing.command_request_id IS DISTINCT FROM command_request_id
           OR existing.preview_hash IS DISTINCT FROM preview_hash_input
           OR existing.decision<>'approved' THEN
            RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='approval idempotency key has different exact input';
        END IF;
        RETURN command_request_id;
    END IF;
    PERFORM pg_catalog.set_config('app.command_request_id',command_request_id::text,true);
    INSERT INTO "{SCHEMA}"."write_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'approval',organization_id,command_request_id);
    INSERT INTO automation.command_approvals(
        org_id,id,command_request_id,approver_membership_id,decision,preview_hash,
        aggregate_version_hash,authentication_strength,idempotency_key_hash,valid_until_at)
    VALUES(
        organization_id,approval_id,command_request_id,actor_id,'approved',preview_hash_input,
        request_row.aggregate_version_hash,'session',key_hash,valid_until_at);
    DELETE FROM "{SCHEMA}"."write_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='approval' AND scope.org_id=organization_id
       AND scope.command_request_id=command_request_id;
    RETURN command_request_id;
END
''',
            runtime=True,
        ),
        *_function(
            '"execute_approved_command"(organization_id uuid, command_request_id uuid)',
            "bytea",
            f'''
DECLARE
    actor_id uuid := NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
    request_context uuid := NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
    command_context uuid := NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid;
    request_row automation.command_requests%ROWTYPE;
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    calculation_artifact calculation.artifacts%ROWTYPE;
    sales_order sales.orders%ROWTYPE;
    purchase_order procurement.purchase_orders%ROWTYPE;
    goods_receipt procurement.goods_receipts%ROWTYPE;
    supplier_invoice procurement.supplier_invoices%ROWTYPE;
    sales_invoice sales.invoices%ROWTYPE;
    sales_return sales.returns%ROWTYPE;
    purchase_return procurement.purchase_returns%ROWTYPE;
    adjustment_note finance.adjustment_notes%ROWTYPE;
    payment finance.payments%ROWTYPE;
    inventory_document inventory.inventory_documents%ROWTYPE;
    valuation_journal finance.journal_entries%ROWTYPE;
    application_membership core.memberships%ROWTYPE;
    application_user core.users%ROWTYPE;
    preview_document jsonb;
    request_document jsonb;
    current_resolution jsonb;
    resolved_allocation jsonb;
    inventory_document_id uuid;
    valuation_sequence_id uuid;
    valuation_journal_number text;
    invoice_journal_number text;
    approval_count integer;
    response_document jsonb;
    response_body bytea;
    posted_allocation_count integer;
    posted_allocation_total numeric(20,2);
    approving_membership_id uuid;
    approval_decided_at timestamptz;
    count_variance_ledger_count integer;
    count_variance_ledger_value numeric(20,2);
    transfer_out_count integer;
    transfer_in_count integer;
    transfer_quantity_net numeric(20,6);
    transfer_value_net numeric(20,2);
BEGIN
    IF organization_id IS DISTINCT FROM NULLIF(pg_catalog.current_setting('app.org_id',true),'')::uuid
       OR actor_id IS NULL OR request_context IS NULL
       OR command_context IS DISTINCT FROM command_request_id
       OR erp_security.has_permission('automation.command.execute',NULL::uuid) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='automation execution context or permission is invalid';
    END IF;
    SELECT * INTO request_row FROM automation.command_requests
     WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='command request not found';
    END IF;
    IF request_row.status='succeeded' THEN
        RETURN request_row.response_bytes;
    END IF;
    IF request_row.status NOT IN ('prepared','pending_approval','approved')
       OR request_row.expires_at<=pg_catalog.transaction_timestamp()
       OR request_row.requested_by_membership_id IS DISTINCT FROM actor_id THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='command request is not executable';
    END IF;
    SELECT * INTO grant_row FROM automation.agent_grants
     WHERE org_id=organization_id AND id=request_row.agent_grant_id FOR UPDATE;
    SELECT * INTO capability FROM automation.agent_grant_capabilities
     WHERE org_id=organization_id AND agent_grant_id=request_row.agent_grant_id
       AND capability_code=request_row.capability_code FOR SHARE;
    IF grant_row.status<>'active' OR grant_row.expires_at<=pg_catalog.transaction_timestamp()
       OR grant_row.subject_membership_id IS DISTINCT FROM actor_id
       OR capability.status<>'active'
       OR capability.operation_mode IS DISTINCT FROM request_row.operation_mode
       OR capability.risk_class IS DISTINCT FROM request_row.risk_class
       OR capability.approval_policy IS DISTINCT FROM request_row.approval_policy
       OR (request_row.operation='automation.agent_grant.revoke'
           AND request_row.branch_id IS DISTINCT FROM grant_row.branch_id)
       OR (request_row.operation<>'automation.agent_grant.revoke' AND
           (request_row.branch_id IS NULL
            OR erp_security.can_access_branch(request_row.branch_id) IS DISTINCT FROM true
            OR erp_security.has_permission('automation.command.execute',request_row.branch_id) IS DISTINCT FROM true
            OR (request_row.destination_branch_id IS NOT NULL AND
                (erp_security.can_access_branch(request_row.destination_branch_id) IS DISTINCT FROM true
                 OR erp_security.has_permission('automation.command.execute',request_row.destination_branch_id) IS DISTINCT FROM true))
            OR (grant_row.branch_id IS NOT NULL AND
                (request_row.branch_id IS DISTINCT FROM grant_row.branch_id
                 OR request_row.destination_branch_id IS NOT NULL)))) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='grant or exact capability consent changed before execution';
    END IF;
    IF request_row.request_hash IS DISTINCT FROM extensions.digest(request_row.request_bytes,'sha256')
       OR request_row.preview_hash IS DISTINCT FROM extensions.digest(request_row.preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command request, preview, calculation, or aggregate version changed';
    END IF;
    preview_document:=pg_catalog.convert_from(request_row.preview_bytes,'UTF8')::jsonb;
    request_document:=pg_catalog.convert_from(request_row.request_bytes,'UTF8')::jsonb;
    -- aggregate authority: exact_execute_aggregate_bindings_v2
    IF request_row.operation='automation.agent_grant.revoke' THEN
        IF request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                request_row.target_resource_type,request_row.target_resource_id,grant_row.row_version
           ) OR request_row.target_row_version IS DISTINCT FROM grant_row.row_version
           OR request_row.calculation_hash IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='grant revocation aggregate changed';
        END IF;
    ELSIF request_row.operation='sales.order.approve' THEN
        SELECT * INTO STRICT sales_order FROM sales.orders
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_order_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.order.prepare'
           OR request_row.target_resource_type<>'sales_order'
           OR request_row.target_row_version IS DISTINCT FROM sales_order.row_version
           OR sales_order.status<>'submitted'
           OR sales_order.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'sales_order',sales_order.id,sales_order.row_version
           )
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.order.approve'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_order.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales order or exact calculation evidence changed';
        END IF;
    ELSIF request_row.operation='procurement.purchase_order.approve' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND purchase_order_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_purchase_order_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.purchase_order.prepare'
           OR request_row.target_resource_type<>'purchase_order'
           OR request_row.target_row_version IS DISTINCT FROM purchase_order.row_version
           OR purchase_order.status<>'submitted' OR purchase_order.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'purchase_order_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'purchase_order',purchase_order.id,purchase_order.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.purchase_order.approve'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM purchase_order.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase order supplier, GST, UOM, tax, charge, or calculation source changed';
        END IF;
        PERFORM erp_trade_commands_v2.assert_purchase_order_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
    ELSIF request_row.operation='procurement.receipt.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT goods_receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND goods_receipt_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_goods_receipt_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.goods_receipt.prepare'
           OR request_row.target_resource_type<>'goods_receipt'
           OR request_row.target_row_version IS DISTINCT FROM goods_receipt.row_version
           OR goods_receipt.status<>'approved' OR goods_receipt.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'goods_receipt_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='goods receipt PO, ceiling, batch, MRP, QC, licence, location, or cost source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_goods_receipt_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,request_document,current_resolution);
    ELSIF request_row.operation='procurement.supplier_invoice.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT supplier_invoice FROM procurement.supplier_invoices
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND supplier_invoice_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_supplier_invoice_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.supplier_invoice.prepare'
           OR request_row.target_resource_type<>'supplier_invoice'
           OR request_row.target_row_version IS DISTINCT FROM supplier_invoice.row_version
           OR supplier_invoice.status<>'approved'
           OR supplier_invoice.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'supplier_invoice_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR preview_document->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR current_resolution->'goods_receipt_ids' IS DISTINCT FROM request_document->'goods_receipt_ids'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'supplier_invoice',supplier_invoice.id,supplier_invoice.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.supplier_invoice.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM supplier_invoice.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash
           OR EXISTS (SELECT 1 FROM inventory.inventory_documents document
                WHERE document.org_id=organization_id AND document.supplier_invoice_id=request_row.target_resource_id) THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier invoice GRN, ceiling, GST, portal, ITC, account, or calculation source changed'; END IF;
        PERFORM erp_commercial_commands.assert_supplier_invoice_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
    ELSIF request_row.operation='sales.dispatch.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        current_resolution:="{SCHEMA}"."resolve_sales_dispatch_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_dispatch_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.dispatch.prepare'
           OR request_row.target_resource_type<>'dispatch'
           OR request_row.target_row_version<>1
           OR request_row.calculation_hash IS NOT NULL
           OR request_document->>'dispatch_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256') THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales dispatch order, batch, FEFO, stock, logistics, or valuation source changed';
        END IF;
        PERFORM "{SCHEMA}"."assert_sales_dispatch_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,request_document,current_resolution);
    ELSIF request_row.operation='sales.invoice.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT sales_invoice FROM sales.invoices
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_invoice_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_sales_invoice_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        SELECT id INTO inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_invoice_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.invoice.prepare'
           OR request_row.target_resource_type<>'sales_invoice'
           OR request_row.target_row_version IS DISTINCT FROM sales_invoice.row_version
           OR sales_invoice.status<>'draft' OR sales_invoice.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'invoice_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'inventory_document_id','')::uuid IS DISTINCT FROM inventory_document_id
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'sales_invoice',sales_invoice.id,sales_invoice.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.invoice.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_invoice.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales invoice legal, tax, fulfillment, stock, cost, account, or calculation source changed';
        END IF;
        PERFORM "{SCHEMA}"."assert_sales_invoice_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='sales.return.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT sales_return FROM sales.returns
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_return_id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_return_id=request_row.target_resource_id
           AND document_type='sales_return_receipt' FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_sales_return_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'sales.return.prepare'
           OR request_row.target_resource_type<>'sales_return'
           OR request_row.target_row_version IS DISTINCT FROM sales_return.row_version
           OR sales_return.status<>'draft' OR sales_return.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'sales_return_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'sales_return',sales_return.id,sales_return.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.return.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_return.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales return invoice, dispatch, batch, quarantine, GST rule, evidence, prior return, account, or calculation source changed';
        END IF;
        PERFORM erp_commercial_commands.assert_sales_return_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
        PERFORM "{SCHEMA}"."assert_sales_return_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='procurement.purchase_return.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT purchase_return FROM procurement.purchase_returns
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND purchase_return_id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND purchase_return_id=request_row.target_resource_id
           AND document_type='purchase_return_issue' FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_purchase_return_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.purchase_return.prepare'
           OR request_row.target_resource_type<>'purchase_return'
           OR request_row.target_row_version IS DISTINCT FROM purchase_return.row_version
           OR purchase_return.status<>'submitted' OR purchase_return.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'purchase_return_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'purchase_return',purchase_return.id,purchase_return.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.purchase_return.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM purchase_return.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase return invoice, receipt allocation, batch, location, stock, GST rule, portal evidence, payable, prior return, account, logistics, or calculation source changed';
        END IF;
        PERFORM erp_commercial_commands.assert_purchase_return_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
        PERFORM "{SCHEMA}"."assert_purchase_return_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='finance.adjustment_note.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT adjustment_note FROM finance.adjustment_notes
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND adjustment_note_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_adjustment_note_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'finance.adjustment_note.prepare'
           OR request_row.target_resource_type<>'adjustment_note'
           OR request_row.target_row_version IS DISTINCT FROM adjustment_note.row_version
           OR adjustment_note.status<>'draft' OR adjustment_note.sales_return_id IS NOT NULL
           OR adjustment_note.purchase_return_id IS NOT NULL OR adjustment_note.reversal_of_adjustment_note_id IS NOT NULL
           OR request_document->>'adjustment_note_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "{SCHEMA}"."aggregate_version_hash"(
                'adjustment_note',adjustment_note.id,adjustment_note.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'finance.adjustment_note.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM adjustment_note.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment note original invoice, open item, GST rule, evidence, line ceiling, account, or calculation source changed';
        END IF;
    ELSIF request_row.operation IN ('finance.customer_cheque_clearance.post','finance.customer_cheque_bounce.post') THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        IF request_row.operation='finance.customer_cheque_clearance.post' THEN
          current_resolution:="{SCHEMA}"."resolve_customer_cheque_clearance_prepare"(
            organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
            grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        ELSE
          current_resolution:="{SCHEMA}"."resolve_customer_cheque_bounce_prepare"(
            organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
            grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        END IF;
        IF request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.related_payment_id IS DISTINCT FROM (request_document->>'original_payment_id')::uuid
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256') THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer cheque instrument, evidence, terminal state, or journal source changed'; END IF;
    ELSIF request_row.operation='finance.payment.post' AND request_row.capability_code='finance.customer_receipt.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_customer_receipt_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'receipt' OR payment.payment_purpose<>'commercial_settlement'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt customer, bank, reference, invoice, open-item, allocation, or account source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_customer_receipt_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='finance.payment.post' AND request_row.capability_code='finance.supplier_payment.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_supplier_payment_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'disbursement' OR payment.payment_purpose<>'commercial_settlement'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment supplier, PAN, fiscal fact, bank, reference, invoice, payable, allocation, or account source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_supplier_payment_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='finance.supplier_advance.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_supplier_advance_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'finance.supplier_advance.prepare'
           OR request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'disbursement' OR payment.payment_purpose<>'supplier_advance'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier advance supplier, PAN, fiscal fact, PO line, prior advance, bank, reference, or account source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_supplier_advance_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='inventory.document.post' AND request_row.capability_code='inventory.transfer.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT inventory_document FROM inventory.inventory_documents
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_inventory_transfer_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'inventory_document'
           OR request_row.target_row_version IS DISTINCT FROM inventory_document.row_version
           OR inventory_document.status<>'submitted' OR inventory_document.document_type<>'transfer'
           OR inventory_document.reason_code<>'inter_branch_transfer'
           OR inventory_document.branch_id IS DISTINCT FROM request_row.branch_id
           OR inventory_document.destination_branch_id IS DISTINCT FROM request_row.destination_branch_id
           OR request_document->>'inventory_document_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='transfer branch, location, FEFO batch, available balance, MWA, recall, pending movement, or logistics source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_inventory_transfer_draft"(
          organization_id,request_row.target_resource_id,current_resolution);
    ELSIF request_row.operation='inventory.document.post' AND request_row.capability_code='inventory.adjustment.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT inventory_document FROM inventory.inventory_documents
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT valuation_journal FROM finance.journal_entries
         WHERE org_id=organization_id AND id=(request_document->>'journal_id')::uuid FOR UPDATE;
        current_resolution:="{SCHEMA}"."resolve_inventory_adjustment_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'inventory_document'
           OR request_row.target_row_version IS DISTINCT FROM inventory_document.row_version
           OR inventory_document.status<>'submitted' OR inventory_document.document_type<>'stock_count'
           OR inventory_document.reason_code<>'cycle_count' OR inventory_document.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'inventory_document_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count evidence, lot, location, balance, MWA, licence, recall, pending movement, or account source changed'; END IF;
        PERFORM "{SCHEMA}"."assert_inventory_adjustment_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSE
        IF request_row.target_row_version<>1
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256'
           ) OR (request_row.calculation_hash IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM calculation.artifacts AS artifact
                 WHERE artifact.org_id=organization_id
                   AND artifact.command_request_id=request_row.id
                   AND artifact.authority_hash=request_row.calculation_hash
                   AND artifact.status='issued'
                   AND artifact.expires_at>pg_catalog.transaction_timestamp()
           )) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='operator preview source or calculation evidence changed';
        END IF;
    END IF;
    IF EXISTS (
        SELECT 1 FROM automation.command_approvals AS approval
         WHERE approval.org_id=organization_id
           AND approval.command_request_id=command_request_id
           AND approval.decision='rejected'
           AND approval.preview_hash=request_row.preview_hash
           AND approval.aggregate_version_hash=request_row.aggregate_version_hash
    ) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command has an exact-preview rejection';
    END IF;
    SELECT count(*) INTO approval_count
      FROM automation.command_approvals AS approval
     WHERE approval.org_id=organization_id
       AND approval.command_request_id=command_request_id
       AND approval.decision='approved'
       AND approval.preview_hash=request_row.preview_hash
       AND approval.aggregate_version_hash=request_row.aggregate_version_hash
       AND approval.valid_until_at>pg_catalog.transaction_timestamp()
       AND (request_row.approval_policy<>'actor_confirmation'
            OR approval.approver_membership_id=request_row.requested_by_membership_id)
       AND (request_row.approval_policy='actor_confirmation'
            OR approval.approver_membership_id<>request_row.requested_by_membership_id)
       AND (request_row.approval_policy<>'human_compliance_approver'
            OR approval.authentication_strength='mfa');
    IF approval_count<request_row.required_approval_count THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='unexpired exact-preview approval quorum is incomplete';
    END IF;
    INSERT INTO "{SCHEMA}"."execution_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,command_request_id);
    IF request_row.status<>'approved' THEN
        UPDATE automation.command_requests
           SET status='approved',row_version=row_version+1
         WHERE org_id=organization_id AND id=command_request_id;
    END IF;
    UPDATE automation.command_requests
       SET status='executing',execution_started_at=pg_catalog.transaction_timestamp(),
           row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id AND status='approved';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command begin boundary lost ownership';
    END IF;
    CASE request_row.operation
      WHEN 'automation.agent_grant.revoke' THEN
        IF request_row.target_resource_type<>'agent_grant'
           OR request_row.target_resource_id IS DISTINCT FROM request_row.agent_grant_id
           OR request_row.request_reason IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed grant revocation handler binding is invalid';
        END IF;
        UPDATE automation.agent_grants
           SET status='revoked',revoked_at=pg_catalog.transaction_timestamp(),
               revoked_by_membership_id=actor_id,revocation_reason=request_row.request_reason,
               updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
               row_version=row_version+1
         WHERE org_id=organization_id AND id=request_row.target_resource_id
           AND status='active' AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='grant changed before typed revocation handler';
        END IF;
      WHEN 'sales.order.approve' THEN
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_trade_commands_v2.approve_sales_order(
            organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
            calculation_artifact.request_id,request_row.id,request_row.idempotency_key_hash,
            request_row.request_hash,
            least(request_row.expires_at,calculation_artifact.expires_at)
        );
      WHEN 'procurement.purchase_order.approve' THEN
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_trade_commands_v2.approve_purchase_order(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,request_row.idempotency_key_hash,
          request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'procurement.receipt.post' THEN
        PERFORM erp_trade_commands.post_goods_receipt(
          organization_id,request_row.target_resource_id,inventory_document_id,actor_id,
          request_row.idempotency_key_hash,request_row.request_hash,request_row.expires_at);
      WHEN 'procurement.supplier_invoice.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(supplier_invoice.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':supplier-invoice-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_supplier_invoice(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,
          (request_document->>'tax_document_id')::uuid,(request_document->>'journal_id')::uuid,
          invoice_journal_number,(request_document->>'event_id')::uuid,(request_document->>'open_item_id')::uuid,
          (request_document->>'inventory_document_id')::uuid,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':landed-cost','UTF8'),'sha256'),
          extensions.digest(request_row.request_hash||pg_catalog.convert_to(':landed-cost','UTF8'),'sha256'),
          request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'sales.dispatch.post' THEN
        PERFORM erp_trade_commands.post_dispatch(
          organization_id,request_row.target_resource_id,inventory_document_id,actor_id,
          request_row.idempotency_key_hash,request_row.request_hash,request_row.expires_at);
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         JOIN sales.dispatches dispatch ON dispatch.org_id=sequence.org_id
           AND dispatch.id=request_row.target_resource_id AND dispatch.branch_id=sequence.branch_id
         WHERE sequence.org_id=organization_id AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(dispatch.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE OF sequence;
        valuation_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':dispatch-valuation-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM erp_commercial_commands.post_dispatch_inventory_valuation(
          organization_id,inventory_document_id,actor_id,
          (request_document->>'valuation_journal_id')::uuid,valuation_journal_number,
          (request_document->>'valuation_event_id')::uuid,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':dispatch-valuation','UTF8'),'sha256'),
          extensions.digest(request_row.request_hash||pg_catalog.convert_to(':dispatch-valuation','UTF8'),'sha256'),
          request_row.expires_at);
      WHEN 'sales.invoice.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(sales_invoice.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':sales-invoice-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_sales_invoice(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,
          (request_document->>'tax_document_id')::uuid,(request_document->>'journal_id')::uuid,
          invoice_journal_number,(request_document->>'event_id')::uuid,(request_document->>'open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'sales.return.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(sales_return.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':sales-return-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_sales_return(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,(request_document->>'adjustment_note_id')::uuid,
          sales_return.return_number,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'procurement.purchase_return.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(purchase_return.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':purchase-return-journal','UTF8'),'sha256'),
          request_row.expires_at);
        UPDATE procurement.purchase_returns
           SET status='approved',updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id
         WHERE org_id=organization_id AND id=request_row.target_resource_id
           AND status='submitted' AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return approval transition lost its submitted state'; END IF;
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_purchase_return(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,(request_document->>'adjustment_note_id')::uuid,
          purchase_return.purchase_return_number,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'finance.adjustment_note.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(
             CASE WHEN pg_catalog.date_part('month',adjustment_note.note_date)>=4
               THEN pg_catalog.date_part('year',adjustment_note.note_date)::integer
               ELSE pg_catalog.date_part('year',adjustment_note.note_date)::integer-1 END,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':adjustment-note-journal','UTF8'),'sha256'),
          request_row.expires_at);
        SELECT approval.approver_membership_id,approval.decided_at
          INTO STRICT approving_membership_id,approval_decided_at
          FROM automation.command_approvals approval
         WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
           AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
           AND approval.aggregate_version_hash=request_row.aggregate_version_hash
           AND approval.valid_until_at>pg_catalog.transaction_timestamp()
           AND approval.approver_membership_id<>request_row.requested_by_membership_id
         ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        UPDATE finance.adjustment_notes SET status='approved',approved_at=approval_decided_at,
          approved_by_membership_id=approving_membership_id,updated_at=pg_catalog.transaction_timestamp(),
          updated_by_membership_id=actor_id
         WHERE org_id=organization_id AND id=request_row.target_resource_id AND status='draft'
           AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note approval transition lost its draft state'; END IF;
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_adjustment_note(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'finance.customer_cheque_clearance.post' THEN
        PERFORM erp_finance_commands.post_customer_cheque_clearance(organization_id,
          (request_document->>'original_payment_id')::uuid,request_row.target_resource_id,
          (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid);
      WHEN 'finance.customer_cheque_bounce.post' THEN
        PERFORM erp_finance_commands.post_customer_cheque_bounce(organization_id,
          (request_document->>'original_payment_id')::uuid,request_row.target_resource_id,
          (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid,
          current_resolution->'compensating_allocations');
      WHEN 'finance.payment.post' THEN
        IF request_row.capability_code NOT IN ('finance.customer_receipt.prepare','finance.supplier_payment.prepare') THEN
          RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='finance payment operation has no reviewed capability-specific dispatcher'; END IF;
        IF request_row.capability_code='finance.customer_receipt.prepare' THEN
          PERFORM erp_finance_commands.post_customer_receipt(organization_id,request_row.target_resource_id,
            (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid,
            current_resolution->'allocations',NULLIF(request_document->>'customer_advance_open_item_id','')::uuid);
        ELSE
          PERFORM erp_finance_commands.post_supplier_payment(organization_id,request_row.target_resource_id,
            (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid,
            current_resolution->'settlement_components');
        END IF;
      WHEN 'finance.supplier_advance.post' THEN
        PERFORM erp_finance_commands.post_supplier_advance_payment(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,
          (request_document->>'event_id')::uuid,current_resolution->'allocations');
      WHEN 'inventory.document.post' THEN
        IF request_row.capability_code NOT IN ('inventory.transfer.prepare','inventory.adjustment.prepare') THEN
          RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='inventory document operation has no reviewed capability-specific dispatcher'; END IF;
        IF request_row.capability_code='inventory.transfer.prepare' THEN
          SELECT approval.approver_membership_id,approval.decided_at
            INTO STRICT approving_membership_id,approval_decided_at
            FROM automation.command_approvals approval
           WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
             AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
             AND approval.aggregate_version_hash=request_row.aggregate_version_hash
             AND approval.valid_until_at>pg_catalog.transaction_timestamp()
             AND approval.approver_membership_id=request_row.requested_by_membership_id
           ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        ELSE
          SELECT approval.approver_membership_id,approval.decided_at
            INTO STRICT approving_membership_id,approval_decided_at
            FROM automation.command_approvals approval
           WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
             AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
             AND approval.aggregate_version_hash=request_row.aggregate_version_hash
             AND approval.valid_until_at>pg_catalog.transaction_timestamp()
             AND approval.approver_membership_id<>request_row.requested_by_membership_id
           ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        END IF;
        UPDATE inventory.inventory_documents SET status='approved',approved_at=approval_decided_at,
          approved_by_membership_id=approving_membership_id,updated_at=pg_catalog.transaction_timestamp(),
          updated_by_membership_id=actor_id,row_version=row_version+1
         WHERE org_id=organization_id AND id=request_row.target_resource_id AND status='submitted';
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='inventory approval transition lost its lock'; END IF;
        PERFORM erp_trade_commands.post_locked_document(organization_id,request_row.target_resource_id,actor_id);
        IF request_row.capability_code='inventory.transfer.prepare' THEN
          SELECT count(*) FILTER (WHERE entry.entry_kind='transfer_out'),
                 count(*) FILTER (WHERE entry.entry_kind='transfer_in'),
                 coalesce(sum(entry.quantity_delta),0),coalesce(sum(entry.value_delta),0)
            INTO transfer_out_count,transfer_in_count,transfer_quantity_net,transfer_value_net
            FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
             AND entry.inventory_document_id=request_row.target_resource_id;
          IF transfer_out_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR transfer_in_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR transfer_quantity_net<>0 OR transfer_value_net<>0
             OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(current_resolution->'lines') expected(value)
                  WHERE NOT EXISTS(SELECT 1 FROM inventory.stock_ledger_entries source_entry
                    JOIN inventory.stock_ledger_entries destination_entry
                      ON destination_entry.org_id=source_entry.org_id
                     AND destination_entry.inventory_document_line_id=source_entry.inventory_document_line_id
                   WHERE source_entry.org_id=organization_id
                     AND source_entry.inventory_document_id=request_row.target_resource_id
                     AND source_entry.inventory_document_line_id=(expected.value->>'inventory_document_line_id')::uuid
                     AND destination_entry.inventory_document_id=request_row.target_resource_id
                     AND source_entry.entry_kind='transfer_out' AND destination_entry.entry_kind='transfer_in'
                     AND source_entry.branch_id=(current_resolution->>'source_branch_id')::uuid
                     AND destination_entry.branch_id=(current_resolution->>'destination_branch_id')::uuid
                     AND source_entry.location_id=(current_resolution->>'source_location_id')::uuid
                     AND destination_entry.location_id=(current_resolution->>'destination_location_id')::uuid
                     AND source_entry.product_id=(expected.value->>'product_id')::uuid
                     AND destination_entry.product_id=(expected.value->>'product_id')::uuid
                     AND source_entry.batch_id=(expected.value->>'batch_id')::uuid
                     AND destination_entry.batch_id=(expected.value->>'batch_id')::uuid
                     AND source_entry.quantity_delta=-(expected.value->>'base_quantity')::numeric
                     AND destination_entry.quantity_delta=(expected.value->>'base_quantity')::numeric
                     AND source_entry.unit_cost=(expected.value->>'unit_cost')::numeric
                     AND destination_entry.unit_cost=(expected.value->>'unit_cost')::numeric
                     AND source_entry.value_delta=-(expected.value->>'extended_cost')::numeric
                     AND destination_entry.value_delta=(expected.value->>'extended_cost')::numeric)) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted transfer ledger is not the exact balanced approved quantity and valuation'; END IF;
        ELSE
          SELECT count(*),coalesce(sum(pg_catalog.abs(entry.value_delta)),0)
            INTO count_variance_ledger_count,count_variance_ledger_value
            FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
             AND entry.inventory_document_id=request_row.target_resource_id
             AND entry.entry_kind=CASE current_resolution->>'variance_effect'
               WHEN 'gain' THEN 'count_gain' ELSE 'count_loss' END;
          IF count_variance_ledger_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR count_variance_ledger_value<>(current_resolution->>'total_value')::numeric THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted count-variance ledger differs from the approved MWA preview'; END IF;
          UPDATE finance.journal_entries SET status='posted',posted_at=pg_catalog.transaction_timestamp(),
            posted_by_membership_id=actor_id,updated_at=pg_catalog.transaction_timestamp(),
            updated_by_membership_id=actor_id,row_version=row_version+1
           WHERE org_id=organization_id AND id=(request_document->>'journal_id')::uuid AND status='draft'
             AND transaction_debit_total=count_variance_ledger_value AND transaction_credit_total=count_variance_ledger_value
             AND functional_debit_total=count_variance_ledger_value AND functional_credit_total=count_variance_ledger_value;
          IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count valuation journal changed before atomic posting'; END IF;
          INSERT INTO finance.accounting_events(org_id,id,event_type,inventory_document_id,journal_entry_id,
            occurred_at,source_posted_at,created_by_membership_id)
          SELECT organization_id,(request_document->>'event_id')::uuid,'inventory_valuation',document.id,
            (request_document->>'journal_id')::uuid,document.posted_at,document.posted_at,actor_id
            FROM inventory.inventory_documents document WHERE document.org_id=organization_id
             AND document.id=request_row.target_resource_id AND document.status='posted';
        END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='operation has no reviewed typed dispatcher';
    END CASE;
    response_document := pg_catalog.jsonb_build_object(
        'command_request_id',command_request_id,
        'operation',request_row.operation,
        'resource_id',request_row.target_resource_id,
        'resource_type',request_row.target_resource_type,
        'status','succeeded'
    );
    response_body := pg_catalog.convert_to(response_document::text,'UTF8');
    UPDATE automation.command_requests
       SET status='succeeded',completed_at=pg_catalog.transaction_timestamp(),
           result_resource_type=request_row.target_resource_type,
           result_resource_id=request_row.target_resource_id,response_status=200,
           response_media_type='application/vnd.aasopharma.command-result+json',
           response_bytes=response_body,response_hash=extensions.digest(response_body,'sha256'),
           row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id AND status='executing';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command finish boundary lost ownership';
    END IF;
    DELETE FROM "{SCHEMA}"."execution_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.org_id=request_row.org_id
       AND scope.command_request_id=request_row.id;
    RETURN response_body;
END
''',
            runtime=True,
        ),
    ]


def _definitions() -> dict[str, list[str]]:
    return {
        "automation.agent_grant_capabilities:agent_grant_capabilities_revocation": _capability_definition(),
        "automation.command_requests:command_execution_guard": _baseline_execution_definition(),
        "automation.command_requests:command_request_matches_grant": _baseline_request_match_definition(),
    }


def _baseline_execution_definition() -> list[str]:
    """Keep revision 0001 immutable; adjustment execution ships in 0007."""
    statements = _execution_definition()
    start = "    ELSIF request_row.operation='finance.adjustment_note.post' THEN\n"
    end = (
        "    ELSIF request_row.operation='finance.payment.post' "
        "AND request_row.capability_code='finance.customer_receipt.prepare' THEN\n"
    )
    dispatch_start = "      WHEN 'finance.adjustment_note.post' THEN\n"
    dispatch_end = "      WHEN 'finance.payment.post' THEN\n"
    result: list[str] = []
    for statement in statements:
        if not statement.startswith(
            'CREATE FUNCTION "erp_automation_commands"."execute_approved_command"'
        ):
            result.append(statement)
            continue
        statement = statement.replace(
            "    adjustment_note finance.adjustment_notes%ROWTYPE;\n", ""
        )
        prefix, separator, remainder = statement.partition(start)
        if not separator:
            raise ContractError("adjustment-note execute branch marker is missing")
        _removed, separator, suffix = remainder.partition(end)
        if not separator:
            raise ContractError("adjustment-note execute branch end marker is missing")
        statement = prefix + end + suffix
        prefix, separator, remainder = statement.partition(dispatch_start)
        if not separator:
            raise ContractError("adjustment-note dispatcher marker is missing")
        _removed, separator, suffix = remainder.partition(dispatch_end)
        if not separator:
            raise ContractError("adjustment-note dispatcher end marker is missing")
        result.append(prefix + dispatch_end + suffix)
    return result


def _baseline_request_match_definition() -> list[str]:
    """Keep adjustment prepare functions out of the immutable 0001 package."""
    return [
        statement
        for statement in _request_match_definition()
        if "adjustment_note_prepare" not in statement.splitlines()[0]
    ]


def generated_artifacts() -> tuple[str, str]:
    invariants = _invariants()
    definitions = _definitions()
    if set(definitions) != REVIEW_KEYS:
        raise ContractError("automation definitions must resolve exactly the reviewed set")
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append(
            {
                "enforcement": invariant["enforcement"],
                "invariant": invariant["invariant"],
                "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
                "reviewed": True,
                "statements": definitions[key],
                "table": invariant["table"],
            }
        )
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "catalog_sha256": _catalog_hash(),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "reviewed_count": len(REVIEW_KEYS),
        "resolved_count": len(REVIEW_KEYS),
        "resolved_invariants": sorted(REVIEW_KEYS),
        "blocked_count": 0,
        "blocked_invariants": {},
        "dispatcher": {
            "registered_prepare_capabilities": sorted(OPERATOR_COMMANDS),
            "executable_prepare_capabilities": [
                "finance.adjustment_note.prepare",
                "finance.bank_reconciliation.prepare",
                "finance.customer_receipt.prepare",
                "finance.expense_claim.prepare",
                "finance.supplier_advance.prepare",
                "finance.supplier_payment.prepare",
                "inventory.adjustment.prepare",
                "inventory.destruction.prepare",
                "inventory.transfer.prepare",
                "procurement.goods_receipt.prepare",
                "procurement.purchase_order.prepare",
                "procurement.purchase_return.prepare",
                "procurement.supplier_invoice.prepare",
                "sales.dispatch.prepare",
                "sales.invoice.prepare",
                "sales.order.prepare",
                "sales.return.prepare",
            ],
            "blocked_prepare_capabilities": sorted(
                set(OPERATOR_COMMANDS)
                - {
                    "finance.adjustment_note.prepare",
                    "finance.bank_reconciliation.prepare",
                    "finance.customer_receipt.prepare",
                    "finance.expense_claim.prepare",
                    "finance.supplier_advance.prepare",
                    "finance.supplier_payment.prepare",
                    "inventory.adjustment.prepare",
                    "inventory.destruction.prepare",
                    "inventory.transfer.prepare",
                    "procurement.goods_receipt.prepare",
                    "procurement.purchase_order.prepare",
                    "procurement.purchase_return.prepare",
                    "procurement.supplier_invoice.prepare",
                    "sales.dispatch.prepare",
                    "sales.invoice.prepare",
                    "sales.order.prepare",
                    "sales.return.prepare",
                }
            ),
            "capability_operation_map": {
                capability: operation
                for capability, (operation, _) in sorted(OPERATOR_COMMANDS.items())
            },
            "execution_operations": [
                "automation.agent_grant.revoke",
                "compliance.destruction.post",
                "finance.adjustment_note.post",
                "finance.bank_reconciliation.match",
                "finance.expense_claim.post",
                "finance.payment.post",
                "finance.supplier_advance.post",
                "inventory.document.post",
                "procurement.purchase_order.approve",
                "procurement.receipt.post",
                "procurement.purchase_return.post",
                "procurement.supplier_invoice.post",
                "sales.dispatch.post",
                "sales.invoice.post",
                "sales.order.approve",
                "sales.return.post",
            ],
            "adjustment_note_pilot_scope": {
                "supported_pairs": ["sales_credit", "purchase_debit"],
                "supported_effect": "decrease_against_posted_original_invoice_open_item",
                "supported_currency": "INR",
                "required_matching": [
                    "posted_original_invoice_tax_document_and_consumed_calculation_artifact",
                    "exact_original_product_line_and_cumulative_quantity_ceiling",
                    "exact_original_accounting_event_and_open_item_allocation_state",
                    "effective_reviewed_gst_adjustment_rule",
                    "side_specific_statutory_itc_or_portal_evidence",
                    "separate_unexpired_exact_preview_approval",
                    "balanced_journal_tax_document_allocation_and_residual_open_item",
                ],
                "unsupported_fail_closed": [
                    "sales_debit_or_purchase_credit",
                    "increase_reversal_or_return_linked_note",
                    "charge_line_foreign_currency_zero_rated_or_reverse_charge",
                ],
            },
            "bank_reconciliation_pilot_scope": {
                "supported_currency": "INR",
                "supported_cardinality": "one_statement_line_to_one_posted_journal",
                "required_matching": [
                    "active_reconcilable_bank_asset",
                    "imported_or_reconciling_statement",
                    "exact_statement_amount_direction_and_transaction_date",
                    "posted_balanced_same_day_journal",
                    "exactly_one_branch_bank_ledger_line",
                    "immutable_source_versions_revalidated_under_advisory_locks",
                    "distinct_exact_preview_approver",
                ],
                "unsupported_fail_closed": [
                    "partial_match",
                    "foreign_currency",
                    "date_mismatch",
                    "multi_bank_line_journal",
                    "already_matched_owner",
                    "reversal",
                    "automatic_tolerance",
                ],
            },
            "expense_claim_pilot_scope": {
                "supported_currency": "INR",
                "approval_policy": "separate_approver",
                "required_matching": [
                    "active_claimant_membership_and_optional_active_employee",
                    "active_branch_expense_and_reimbursement_liability_accounts",
                    "verified_retained_unique_receipt_for_each_line",
                    "receipt_document_date_within_claim_period",
                    "full_line_approval_bound_to_exact_preview",
                    "balanced_journal_and_exactly_one_accounting_event",
                ],
                "unsupported_fail_closed": [
                    "partial_approval",
                    "gst_input_tax_credit",
                    "withholding",
                    "foreign_currency",
                    "mileage_or_per_diem",
                    "cash_advance",
                    "unverified_or_reused_receipt",
                    "backdated_submission",
                    "inactive_or_cross_branch_employee",
                    "expense_reversal",
                ],
            },
            "customer_receipt_pilot_scope": {
                "supported_currency": "INR",
                "supported_payment_methods": ["bank_transfer", "card", "upi"],
                "required_matching": [
                    "active_customer_and_posted_sales_invoice_receivables",
                    "unique_positive_allocations_exactly_equal_payment",
                    "active_reconcilable_bank_asset",
                    "canonical_branch_accounts_receivable_role",
                    "exact_two_line_bank_debit_and_party_receivable_credit",
                    "duplicate_bank_reference_date_amount_rejection",
                    "execute_time_synthetic_allocation_state_recheck",
                ],
                "unsupported_fail_closed": [
                    "cash_section_269st_or_cash_account_without_authority",
                    "cheque_without_account_payee_evidence",
                    "foreign_currency",
                    "advance_or_unapplied_receipt",
                    "customer_deducted_tds_without_form16a_26as_authority",
                ],
            },
            "supplier_advance_pilot_scope": {
                "supported_currency": "INR",
                "supported_payment_methods": ["bank_transfer", "upi"],
                "supported_cardinality": "one_product_purchase_order_line_per_payment",
                "required_matching": [
                    "active_resident_supplier_with_verified_operative_pan_and_retained_evidence",
                    "approved_domestic_normal_charge_purchase_order",
                    "purchase_of_goods_withholding_nature_snapshot",
                    "verified_prior_fy_turnover_at_or_below_inr_10_crore",
                    "verified_gst_tds_notified_deductor_false",
                    "gross_equals_cash_and_remaining_po_line_net_value_ceiling",
                    "active_reconcilable_bank_asset_and_supplier_prepayment_role",
                    "duplicate_bank_reference_date_amount_rejection",
                    "execute_time_prior_advance_and_source_recheck",
                ],
                "gst_treatment": "no_gst_on_goods_advance_notification_66_2017",
                "unsupported_fail_closed": [
                    "section_194q_or_other_withholding_applicable",
                    "gst_tds_notified_deductor",
                    "non_resident_or_unverified_supplier_tax_profile",
                    "cash_cheque_card_or_foreign_currency",
                    "multiple_po_line_allocations",
                    "received_or_invoiced_po",
                    "advance_application_or_reversal",
                ],
            },
            "supplier_payment_pilot_scope": {
                "supported_currency": "INR",
                "supported_payment_methods": ["bank_transfer", "upi"],
                "required_matching": [
                    "active_resident_supplier_with_verified_operative_pan_and_retained_evidence",
                    "posted_domestic_normal_charge_product_supplier_invoice",
                    "purchase_of_goods_withholding_nature_snapshot",
                    "verified_payment_and_each_invoice_credit_fy_turnover_at_or_below_inr_10_crore",
                    "verified_payment_and_each_invoice_credit_fy_gst_tds_notified_deductor_false",
                    "unique_positive_payable_allocations_exactly_equal_gross_and_cash",
                    "canonical_branch_accounts_payable_and_reconcilable_bank_asset",
                    "permanent_normalized_bank_reference_consumption",
                    "execute_time_allocation_fiscal_fact_and_applicable_advance_state_recheck",
                ],
                "unsupported_fail_closed": [
                    "section_194q_or_other_withholding_applicable",
                    "gst_tds_notified_deductor",
                    "charge_line_or_non_goods_invoice",
                    "supplier_advance_withholding_adjustment_or_credit_netting",
                    "cash_cheque_card_or_foreign_currency",
                    "operator_payment_reversal_or_reconciled_bank_reversal",
                ],
            },
            "inventory_adjustment_pilot_scope": {
                "supported_effect": "same_day_homogeneous_cycle_count_gain_or_loss",
                "supported_currency": "INR",
                "valuation": "locked_current_moving_weighted_average",
                "required_matching": [
                    "verified_retained_unique_inventory_cycle_count_sheet",
                    "active_physical_counter_and_distinct_command_approver",
                    "existing_positive_owned_stock_balance_after_last_ledger_movement",
                    "released_unexpired_manufacturer_batch_without_active_recall",
                    "active_same_branch_saleable_non_cold_location",
                    "effective_product_uom_conversion_and_exact_base_count",
                    "branch_forms_20b_and_21b_for_medicine_custody",
                    "no_pending_inventory_document_for_the_lot",
                    "expected_stock_balance_row_version",
                    "canonical_inventory_count_gain_or_loss_account",
                    "atomic_signed_count_ledger_and_two_line_inventory_valuation_journal",
                ],
                "tax_effect": "no_supply_no_gst_no_itc_claim_or_reversal",
                "unsupported_fail_closed": [
                    "zero_or_mixed_sign_variance",
                    "backdated_or_stale_count",
                    "cold_chain_h_h1_x_ndps_or_recalled_product",
                    "unowned_zero_balance_or_pending_source_stock",
                    "damage_expiry_theft_or_quality_loss",
                    "stock_count_reversal",
                ],
            },
            "inventory_destruction_pilot_scope": {
                "status": "available_reviewed_certified_full_balance_gst_registered",
                "approval_policy": "separate_approver",
                "supported_currency": "INR",
                "supported_method": "licensed_incineration",
                "valuation": "locked_current_moving_weighted_average",
                "required_matching": [
                    "verified_retained_unique_inventory_destruction_certificate",
                    "licensed_incineration_authority_and_witness_credentials",
                    "same_day_completed_physical_destruction",
                    "active_quarantine_or_damaged_non_cold_location",
                    "non_h_h1_x_ndps_unrecalled_manufacturer_batch",
                    "full_locked_batch_location_balance",
                    "branch_forms_20b_and_21b_for_medicine_custody",
                    "no_pending_inventory_document_for_the_lot",
                    "active_gst_registration_open_return_and_unfiled_gstr3b",
                    "exact_residual_batch_input_credit_lineage",
                    "verified_retained_unique_itc_reversal_evidence",
                    "atomic_issue_itc_reversal_and_balanced_journal",
                ],
                "tax_effect": "section_17_5_h_exact_component_input_tax_credit_reversal",
                "unsupported_fail_closed": [
                    "missing_exact_itc_lineage",
                    "closed_or_filed_gstr3b",
                    "missing_or_reused_reversal_evidence",
                    "partial_batch",
                    "backdated_or_future",
                    "cold_chain",
                    "schedule_h_h1_x_or_ndps",
                    "recall_linked",
                    "saleable_location",
                    "unverified_or_reused_certificate",
                    "unsupported_disposal_method",
                    "destruction_reversal",
                ],
            },
            "inventory_transfer_pilot_scope": {
                "status": "available_reviewed_atomic_interbranch",
                "approval_policy": "actor_confirmation",
                "required_matching": [
                    "organization_scoped_authority_for_both_distinct_branches",
                    "active_locations_belonging_to_their_explicit_branches",
                    "released_nonexpired_unrecalled_manufacturer_batch",
                    "strict_fefo_earliest_expiry_tier",
                    "positive_exact_six_decimal_quantity_with_locked_available_stock",
                    "preserved_locked_moving_weighted_average_value",
                    "one_inventory_document_and_balanced_transfer_out_transfer_in_ledger",
                    "execute_time_source_version_and_pending_movement_recheck",
                ],
                "unsupported_fail_closed": [
                    "same_branch_or_same_location_transfer",
                    "cold_chain_product",
                    "expired_unreleased_or_recalled_batch",
                    "later_expiry_batch_when_earlier_stock_exists",
                    "insufficient_or_pending_source_stock",
                    "backdated_transfer",
                    "negative_stock_or_unbalanced_valuation",
                    "transfer_reversal",
                ],
            },
            "purchase_order_pilot_scope": {
                "supported_supply_types": ["intra_state", "inter_state"],
                "supported_supplier_taxpayer_types": ["regular", "casual"],
                "supported_tax_charge_mechanisms": ["normal"],
                "unsupported_fail_closed": [
                    "import",
                    "sez",
                    "reverse_charge",
                    "composition_or_unregistered_supplier",
                ],
            },
            "goods_receipt_pilot_scope": {
                "supported_po_supply_types": ["intra_state", "inter_state"],
                "supported_qc_statuses": ["accepted", "partial"],
                "required_batch_facts": [
                    "manufacturer_batch_number",
                    "manufactured_on_when_present",
                    "exclusive_expiry_date",
                    "tax_inclusive_inr_mrp",
                    "effective_mrp_uom_conversion",
                ],
                "costing_method": "moving_weighted_average",
                "tax_effect": "reference_only_no_payable_or_itc",
                "unsupported_fail_closed": [
                    "fully_rejected_or_free_only_receipt",
                    "H_H1_X_NDPS_or_controlled_product",
                    "import_sez_or_reverse_charge_po",
                    "missing_branch_or_supplier_forms_20B_and_21B",
                ],
            },
            "supplier_invoice_pilot_scope": {
                "supported_product_kinds": ["medicine", "medical_device", "consumable"],
                "supported_supply_types": ["intra_state", "inter_state"],
                "supported_tax_charge_mechanisms": ["normal"],
                "required_matching": [
                    "one_purchase_order",
                    "exact_posted_grn_set",
                    "separate_billed_and_free_receipt_ceilings",
                    "one_unique_parsed_gstr2b_row",
                ],
                "itc_basis": "explicit_human_attestation_taxable_resale_not_blocked_under_section_17",
                "landed_cost_effect": "reviewed_zero_quantity_value_adjustment_for_exclusive_remaining_receipt_stock",
                "supported_allocation_methods": ["direct", "quantity_weighted", "value_weighted"],
                "consumed_variance_role": "purchase_price_variance",
                "supported_charge_treatment": "reviewed_expense_or_capitalize_with_explicit_basis",
                "unsupported_fail_closed": [
                    "import",
                    "sez",
                    "reverse_charge",
                    "composition_or_unregistered_supplier",
                    "direct_unreceived_product_lines",
                    "partial_or_co_mingled_receipt_stock",
                    "ineligible_blocked_or_deferred_itc",
                    "withholding",
                ],
            },
            "purchase_return_pilot_scope": {
                "supported_return_source_kinds": ["invoiced"],
                "supported_supply_types": ["intra_state", "inter_state"],
                "supported_tax_charge_mechanisms": ["normal"],
                "supported_reasons": ["wrong_supply", "excess_supply"],
                "required_lineage": [
                    "posted_supplier_invoice_receipt_allocation",
                    "one_unique_supplier_invoice_line_per_command",
                    "one_exact_batch_at_original_goods_receipt_location",
                    "separate_billed_and_free_cumulative_ceilings",
                    "current_moving_weighted_average_issue_value",
                ],
                "statutory_evidence": "one_exact_parsed_gstr2b_supplier_credit_note",
                "unsupported_fail_closed": [
                    "uninvoiced_return",
                    "import_sez_or_reverse_charge",
                    "expired_recalled_damaged_or_quarantined_stock",
                    "multi_batch_or_direct_return",
                    "posted_return_reversal",
                ],
            },
            "sales_invoice_pilot_scope": {
                "supported_supply_types": ["intra_state", "inter_state", "sez"],
                "supported_tax_charge_mechanisms": ["normal"],
                "supported_zero_rated_payment_modes": ["not_applicable", "with_igst"],
                "unsupported_fail_closed": [
                    "export",
                    "outward_reverse_charge",
                    "sez_without_payment_without_effective_lut_bond_evidence",
                ],
            },
            "sales_return_pilot_scope": {
                "supported_fulfillment_source": "dispatch_allocated",
                "supported_disposition": "return_to_stock_into_non_saleable_quarantine",
                "supported_gst_tax_treatments": ["statutory", "commercial_only"],
                "required_matching": [
                    "one_unique_original_invoice_line_and_dispatch_allocation",
                    "separate_billed_and_free_cumulative_ceilings",
                    "exact_original_batch_and_outbound_ledger_cost",
                    "effective_reason_specific_gst_adjustment_rule",
                ],
                "unsupported_fail_closed": [
                    "direct_issue",
                    "multiple_batches_for_one_invoice_line",
                    "saleable_location_auto_release",
                    "outward_reverse_charge",
                    "statutory_unregistered_recipient_or_missing_itc_reversal_evidence",
                    "late_statutory_credit_without_matching_authority",
                    "posted_return_reversal",
                ],
            },
            "unsupported_operations": "fail_closed",
            "dynamic_sql": False,
            "mcp_mounted": False,
        },
        "security": {
            "function_schema": SCHEMA,
            "runtime_commands": [
                "approve_operator_command(uuid,uuid,uuid,bytea,bytea,timestamptz)",
                "execute_approved_command(uuid,uuid)",
                "approve_expense_claim_command(uuid,uuid)",
                "execute_approved_expense_claim(uuid,uuid)",
                "persist_expense_claim_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_customer_receipt_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_supplier_advance_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_supplier_payment_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_inventory_adjustment_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_inventory_transfer_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_goods_receipt_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "resolve_goods_receipt_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_expense_claim_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_adjustment_note_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_customer_receipt_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_supplier_advance_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_supplier_payment_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_inventory_adjustment_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_inventory_transfer_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_purchase_order_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_purchase_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_supplier_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "persist_sales_dispatch_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "resolve_sales_dispatch_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_sales_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
            ],
            "runtime_role": "erp_runtime",
            "calculator_role": "erp_calculator",
            "calculator_commands": [
                "persist_adjustment_note_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "resolve_adjustment_note_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "persist_purchase_order_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_sales_order_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_supplier_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_sales_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "persist_purchase_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)",
                "resolve_purchase_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_sales_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_supplier_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_purchase_order_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)",
                "resolve_sales_order_prepare(uuid,uuid,uuid,uuid,uuid,varchar,jsonb)",
            ],
            "fixed_empty_search_path": True,
            "scope_table_private": True,
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping, manifest = generated_artifacts()
    MAPPING_PATH.write_text(mapping, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
