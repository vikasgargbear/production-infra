#!/usr/bin/env python3
"""Generate the reviewed PostgreSQL trade command boundary.

The generated fragment deliberately resolves only invariants for which the
current canonical columns are sufficient.  It does not turn an application
digest into proof of a calculation and it does not invent regulated reference
data or landed-cost allocation facts.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Optional


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
TRADE_MANIFEST_PATH = ROOT.parent / "invariants_trade" / "trade-invariants-manifest.json"
MAPPING_PATH = ROOT / "baseline-trade-command-enforcements.json"
MANIFEST_PATH = ROOT / "trade-commands-manifest.json"
SCHEMA = "erp_trade_commands"


class ContractError(RuntimeError):
    """The command contract no longer matches the reviewed catalog."""


def _invariants() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for domain in ("inventory", "sales", "procurement"):
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in result:
                    raise ContractError(f"duplicate invariant key: {key}")
                result[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return result


def _function(
    signature: str,
    returns: str,
    body: str,
    *,
    security_definer: bool = True,
    identity: Optional[str] = None,
) -> list[str]:
    security = "SECURITY DEFINER" if security_definer else "SECURITY INVOKER"
    name, arguments = signature.split("(", 1)
    qualified = f'"{SCHEMA}"."{name}"({arguments}'
    if identity is None:
        identity_parts = []
        for argument in arguments[:-1].split(",") if arguments[:-1].strip() else []:
            words = argument.strip().split()
            identity_parts.append(words[-1])
        identity = ",".join(identity_parts)
    identity_signature = f'"{SCHEMA}"."{name}"({identity})'
    return [
        f"""CREATE FUNCTION {qualified}
RETURNS {returns}
LANGUAGE plpgsql
{security}
SET search_path = ''
AS $function$
{body.strip()}
$function$""",
        f'ALTER FUNCTION {identity_signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {identity_signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE TRIGGER "{name}" BEFORE {events} ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function}"()'
    )


def _definitions() -> dict[str, list[str]]:
    definitions: dict[str, list[str]] = {}

    definitions[
        "inventory.inventory_document_lines:inventory_inventory_document_lines_invariant_1"
    ] = [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_function(
            "assert_context(p_org_id uuid, p_actor_id uuid)",
            "void",
            """
BEGIN
    IF NULLIF(pg_catalog.current_setting('app.org_id', true), '')::uuid IS DISTINCT FROM p_org_id
       OR NULLIF(pg_catalog.current_setting('app.membership_id', true), '')::uuid IS DISTINCT FROM p_actor_id
       OR NOT EXISTS (
           SELECT 1 FROM core.memberships AS membership
            WHERE membership.org_id=p_org_id AND membership.id=p_actor_id
              AND membership.status='active'
       ) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trade command context is not an active exact organization membership';
    END IF;
END
            """,
        ),
        *_function(
            "claim(p_org_id uuid, p_actor_id uuid, p_operation varchar, p_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz, OUT p_claim_id uuid, OUT p_replay_resource_id uuid)",
            "record",
            """
DECLARE existing core.idempotency_keys%ROWTYPE;
BEGIN
    IF pg_catalog.octet_length(p_key_hash)<>32 OR pg_catalog.octet_length(p_request_hash)<>32
       OR p_expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid command idempotency hashes or expiry';
    END IF;
    INSERT INTO core.idempotency_keys(
        org_id,actor_membership_id,operation,idempotency_key_hash,request_hash,expires_at
    ) VALUES (p_org_id,p_actor_id,p_operation,p_key_hash,p_request_hash,p_expires_at)
    ON CONFLICT (org_id,actor_membership_id,operation,idempotency_key_hash) DO NOTHING;

    SELECT * INTO existing FROM core.idempotency_keys
     WHERE org_id=p_org_id AND actor_membership_id=p_actor_id AND operation=p_operation
       AND idempotency_key_hash=p_key_hash FOR UPDATE;
    IF existing.request_hash IS DISTINCT FROM p_request_hash THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='idempotency key was claimed with a different request hash';
    END IF;
    IF existing.status='succeeded' THEN
        p_claim_id := existing.id;
        p_replay_resource_id := existing.resource_id;
        RETURN;
    END IF;
    IF existing.status<>'claimed' OR existing.expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim is not executable';
    END IF;
    p_claim_id := existing.id;
    p_replay_resource_id := NULL;
END
""",
            identity="uuid,uuid,varchar,bytea,bytea,timestamptz",
        ),
        *_function(
            "assert_permission(p_permission_code text, p_branch_id uuid)",
            "void",
            """
BEGIN
    IF NOT erp_security.can_access_branch(p_branch_id)
       OR NOT erp_security.has_permission(p_permission_code,p_branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trade command permission or branch scope is not active';
    END IF;
END
""",
        ),
        *_function(
            "finish_claim(p_org_id uuid, p_claim_id uuid, p_resource_type varchar, p_resource_id uuid)",
            "void",
            """
DECLARE terminal_response_body bytea;
BEGIN
    terminal_response_body := pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'resource_type',p_resource_type,'resource_id',p_resource_id
      )::text,'UTF8');
    UPDATE core.idempotency_keys
       SET status='succeeded',resource_type=p_resource_type,resource_id=p_resource_id,
           response_status=200,response_media_type='application/json',
           response_body=terminal_response_body,
           response_hash=extensions.digest(terminal_response_body,'sha256'),
           completed_at=pg_catalog.transaction_timestamp()
     WHERE org_id=p_org_id AND id=p_claim_id AND status='claimed';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim could not be completed exactly once';
    END IF;
END
""",
        ),
        *_function(
            "assert_inventory_document(p_org_id uuid, p_document_id uuid)",
            "void",
            """
DECLARE doc inventory.inventory_documents%ROWTYPE; bad_count bigint; expected_lines bigint;
BEGIN
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR UPDATE;
    IF doc.status<>'approved' OR doc.costing_method_snapshot<>'moving_weighted_average'
       OR doc.document_type='cost_adjustment' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory command requires an approved non-landed-cost MWA document';
    END IF;
    PERFORM erp_trade_commands.assert_physical_logistics(p_org_id,p_document_id);
    SELECT count(*) INTO expected_lines FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF expected_lines=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory document has no lines';
    END IF;

    SELECT count(*) INTO bad_count
      FROM inventory.inventory_document_lines AS line
      JOIN inventory.batches AS batch ON batch.org_id=line.org_id AND batch.id=line.batch_id
      JOIN catalog.products AS product ON product.org_id=line.org_id AND product.id=line.product_id
      LEFT JOIN inventory.locations AS from_location ON from_location.org_id=line.org_id AND from_location.id=line.from_location_id
      LEFT JOIN inventory.locations AS to_location ON to_location.org_id=line.org_id AND to_location.id=line.to_location_id
     WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
       AND (batch.product_id IS DISTINCT FROM line.product_id
         OR (from_location.id IS NOT NULL AND from_location.branch_id IS DISTINCT FROM doc.branch_id)
         OR (to_location.id IS NOT NULL AND to_location.branch_id IS DISTINCT FROM
              CASE WHEN doc.document_type='transfer' THEN doc.destination_branch_id ELSE doc.branch_id END)
         OR (doc.document_type IN ('sales_issue','purchase_return_issue','transfer')
             AND (batch.lot_kind<>'manufacturer_batch' OR batch.status<>'released'
                  OR batch.released_at IS NULL OR batch.expires_on IS NULL
                  OR NOT (doc.document_date < batch.expires_on)))
         OR (line.movement_kind<>'count_adjustment' AND line.movement_kind<>'value_adjustment'
             AND line.extended_cost IS DISTINCT FROM pg_catalog.round(line.base_quantity*line.unit_cost,2))
         OR (doc.document_type IN ('opening_receipt','transfer','adjustment','stock_count')
             AND (line.uom_code IS DISTINCT FROM product.base_uom_code
                  OR (line.movement_kind<>'count_adjustment' AND line.base_quantity IS DISTINCT FROM line.entered_quantity)))
         OR (line.movement_kind='count_adjustment'
             AND (line.base_quantity IS DISTINCT FROM pg_catalog.abs(line.variance_quantity)
                  OR line.entered_quantity IS DISTINCT FROM pg_catalog.abs(line.variance_quantity))));
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory line product, batch, branch, UOM, quantity, or cost snapshot is inconsistent';
    END IF;

    IF doc.document_type='purchase_receipt' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        LEFT JOIN procurement.goods_receipt_lines source
          ON source.org_id=line.org_id AND source.id=line.goods_receipt_line_id
        WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
          AND (doc.goods_receipt_id IS NULL OR line.movement_kind<>'receipt'
            OR source.goods_receipt_id IS DISTINCT FROM doc.goods_receipt_id
            OR ROW(source.product_id,source.batch_id,source.location_id,source.uom_code,
                   source.base_accepted_quantity+source.base_free_quantity,source.unit_cost,source.extended_cost)
               IS DISTINCT FROM ROW(line.product_id,line.batch_id,line.to_location_id,line.uom_code,
                   line.base_quantity,line.unit_cost,line.extended_cost));
    ELSIF doc.document_type='sales_issue' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        LEFT JOIN sales.dispatch_lines dispatch_line
          ON dispatch_line.org_id=line.org_id AND dispatch_line.id=line.sales_dispatch_line_id
        LEFT JOIN sales.invoice_lines invoice_line
          ON invoice_line.org_id=line.org_id AND invoice_line.id=line.sales_invoice_line_id
        WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
          AND (line.movement_kind<>'issue' OR NOT (
             (doc.sales_dispatch_id IS NOT NULL AND dispatch_line.dispatch_id=doc.sales_dispatch_id
              AND ROW(dispatch_line.product_id,dispatch_line.batch_id,dispatch_line.from_location_id,dispatch_line.uom_code,
                      dispatch_line.base_billed_quantity+dispatch_line.base_free_quantity)
                  IS NOT DISTINCT FROM ROW(line.product_id,line.batch_id,line.from_location_id,line.uom_code,line.base_quantity))
             OR
             (doc.sales_invoice_id IS NOT NULL AND invoice_line.invoice_id=doc.sales_invoice_id
              AND invoice_line.line_kind='product' AND invoice_line.product_id=line.product_id
              AND invoice_line.uom_code=line.uom_code
              AND invoice_line.base_billed_quantity+invoice_line.base_free_quantity=line.base_quantity)
          ));
    ELSIF doc.document_type='sales_return_receipt' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        LEFT JOIN sales.return_lines source ON source.org_id=line.org_id AND source.id=line.sales_return_line_id
        WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
          AND (doc.sales_return_id IS NULL OR line.movement_kind<>'receipt' OR source.return_id IS DISTINCT FROM doc.sales_return_id
            OR ROW(source.product_id,source.batch_id,source.disposition_location_id,
                   source.base_billed_quantity+source.base_free_quantity)
               IS DISTINCT FROM ROW(line.product_id,line.batch_id,line.to_location_id,line.base_quantity));
    ELSIF doc.document_type='purchase_return_issue' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        LEFT JOIN procurement.purchase_return_lines source ON source.org_id=line.org_id AND source.id=line.purchase_return_line_id
        WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
          AND (doc.purchase_return_id IS NULL OR line.movement_kind<>'issue' OR source.purchase_return_id IS DISTINCT FROM doc.purchase_return_id
            OR ROW(source.product_id,source.batch_id,source.from_location_id,
                   source.base_billed_quantity+source.base_free_quantity)
               IS DISTINCT FROM ROW(line.product_id,line.batch_id,line.from_location_id,line.base_quantity));
    ELSIF doc.document_type='transfer' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        LEFT JOIN inventory.locations source_location ON source_location.org_id=line.org_id AND source_location.id=line.from_location_id
        LEFT JOIN inventory.locations destination_location ON destination_location.org_id=line.org_id AND destination_location.id=line.to_location_id
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
           AND (line.movement_kind<>'transfer' OR doc.destination_branch_id IS NULL
             OR doc.destination_branch_id=doc.branch_id
             OR source_location.branch_id IS DISTINCT FROM doc.branch_id
             OR destination_location.branch_id IS DISTINCT FROM doc.destination_branch_id);
    ELSIF doc.document_type='stock_count' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id AND line.movement_kind<>'count_adjustment';
    ELSIF doc.document_type='opening_receipt' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id AND line.movement_kind<>'receipt';
    ELSIF doc.document_type IN ('recall_quarantine','recall_release') THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        JOIN inventory.batches batch ON batch.org_id=line.org_id AND batch.id=line.batch_id
        JOIN compliance.recalls recall ON recall.org_id=doc.org_id AND recall.id=doc.recall_id
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
           AND (line.movement_kind<>'transfer' OR batch.product_id IS DISTINCT FROM recall.product_id
             OR recall.status NOT IN ('initiated','in_progress'));
        IF doc.recall_id IS NULL THEN bad_count:=bad_count+1; END IF;
    ELSIF doc.document_type='recall_recovery' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
        JOIN inventory.batches batch ON batch.org_id=line.org_id AND batch.id=line.batch_id
        JOIN compliance.recalls recall ON recall.org_id=doc.org_id AND recall.id=doc.recall_id
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
           AND (line.movement_kind<>'receipt' OR batch.product_id IS DISTINCT FROM recall.product_id
             OR recall.status NOT IN ('initiated','in_progress'));
        IF doc.recall_id IS NULL THEN bad_count:=bad_count+1; END IF;
    ELSIF doc.document_type='destruction' THEN
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id AND line.movement_kind<>'issue';
        IF doc.destruction_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM compliance.destructions d WHERE d.org_id=p_org_id AND d.id=doc.destruction_id
              AND d.inventory_document_id=doc.id AND d.status='posted'
        ) THEN bad_count := bad_count+1; END IF;
    ELSIF doc.document_type='reversal' THEN
        IF doc.reverses_document_id IS NULL OR EXISTS (
            SELECT 1 FROM inventory.inventory_documents original
             WHERE original.org_id=p_org_id AND original.id=doc.reverses_document_id
               AND (original.status<>'posted' OR original.document_type IN ('cost_adjustment','destruction','transfer')
                 OR original.recall_id IS NOT NULL)
        ) OR EXISTS (
            SELECT 1 FROM finance.accounting_events event
             WHERE event.org_id=p_org_id AND event.inventory_document_id=doc.reverses_document_id
        ) OR (SELECT count(*) FROM inventory.inventory_document_lines line
              WHERE line.org_id=p_org_id AND line.inventory_document_id=doc.id)
           <> (SELECT count(*) FROM inventory.inventory_document_lines line
               WHERE line.org_id=p_org_id AND line.inventory_document_id=doc.reverses_document_id)
        THEN bad_count := 1; ELSE bad_count := 0; END IF;
        IF bad_count=0 AND EXISTS (
            SELECT 1 FROM inventory.inventory_document_lines reversal_line
            JOIN inventory.inventory_document_lines original_line
              ON original_line.org_id=reversal_line.org_id
             AND original_line.inventory_document_id=doc.reverses_document_id
             AND original_line.line_number=reversal_line.line_number
            WHERE reversal_line.org_id=p_org_id AND reversal_line.inventory_document_id=doc.id
              AND ROW(reversal_line.product_id,reversal_line.batch_id,reversal_line.base_quantity,
                      reversal_line.unit_cost,reversal_line.extended_cost)
                 IS DISTINCT FROM ROW(original_line.product_id,original_line.batch_id,
                      original_line.base_quantity,original_line.unit_cost,original_line.extended_cost)
        ) THEN bad_count := 1; END IF;
    ELSE
        SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
           AND line.movement_kind NOT IN ('receipt','issue','count_adjustment');
    END IF;
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory document type and typed source-line evidence do not match';
    END IF;
END
""",
        ),
    ]

    definitions[
        "inventory.inventory_document_lines:inventory_inventory_document_lines_invariant_2"
    ] = [
        *_function(
            "project_entry(p_org_id uuid, p_entry_id uuid)",
            "void",
            """
DECLARE entry inventory.stock_ledger_entries%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        new_quantity numeric(20,6); new_value numeric(20,2); new_average numeric(20,4);
BEGIN
    SELECT * INTO STRICT entry FROM inventory.stock_ledger_entries
     WHERE org_id=p_org_id AND id=p_entry_id FOR SHARE;
    SELECT * INTO balance FROM inventory.stock_balances
     WHERE org_id=entry.org_id AND location_id=entry.location_id
       AND product_id=entry.product_id AND batch_id=entry.batch_id FOR UPDATE;
    new_quantity := COALESCE(balance.on_hand_quantity,0)+entry.quantity_delta;
    new_value := COALESCE(balance.inventory_value,0)+entry.value_delta;
    IF new_quantity<0 OR new_value<0 OR (new_quantity=0 AND new_value<>0) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ledger projection would create negative or stranded inventory value';
    END IF;
    new_average := CASE WHEN new_quantity=0 THEN 0 ELSE pg_catalog.round(new_value/new_quantity,4) END;
    INSERT INTO inventory.stock_balances(
        org_id,branch_id,location_id,product_id,batch_id,on_hand_quantity,
        inventory_value,average_unit_cost,last_ledger_entry_id,projected_at,row_version
    ) VALUES (
        entry.org_id,entry.branch_id,entry.location_id,entry.product_id,entry.batch_id,
        new_quantity,new_value,new_average,entry.id,entry.posted_at,1
    ) ON CONFLICT (org_id,location_id,product_id,batch_id) DO UPDATE SET
        branch_id=EXCLUDED.branch_id,on_hand_quantity=EXCLUDED.on_hand_quantity,
        inventory_value=EXCLUDED.inventory_value,average_unit_cost=EXCLUDED.average_unit_cost,
        last_ledger_entry_id=EXCLUDED.last_ledger_entry_id,projected_at=EXCLUDED.projected_at,
        row_version=inventory.stock_balances.row_version+1;
END
""",
        ),
        *_function(
            "emit_entry(p_org_id uuid, p_document_id uuid, p_line_id uuid, p_kind text, p_location_id uuid, p_quantity numeric, p_unit_cost numeric, p_value numeric, p_reverses_entry_id uuid, p_actor_id uuid, p_posted_at timestamptz)",
            "uuid",
            """
DECLARE new_id uuid; branch_id uuid;
BEGIN
    SELECT location.branch_id INTO STRICT branch_id FROM inventory.locations AS location
     WHERE location.org_id=p_org_id AND location.id=p_location_id FOR SHARE;
    INSERT INTO inventory.stock_ledger_entries(
        org_id,branch_id,inventory_document_id,inventory_document_line_id,entry_kind,
        location_id,product_id,batch_id,quantity_delta,unit_cost,value_delta,
        reverses_entry_id,posted_at,posted_by_membership_id
    ) SELECT p_org_id,branch_id,p_document_id,line.id,p_kind,p_location_id,
             line.product_id,line.batch_id,p_quantity,p_unit_cost,p_value,
             p_reverses_entry_id,p_posted_at,p_actor_id
        FROM inventory.inventory_document_lines AS line
       WHERE line.org_id=p_org_id AND line.id=p_line_id
    RETURNING id INTO new_id;
    PERFORM erp_trade_commands.project_entry(p_org_id,new_id);
    RETURN new_id;
END
""",
        ),
        *_function(
            "emit_document(p_org_id uuid, p_document_id uuid, p_actor_id uuid, p_posted_at timestamptz)",
            "void",
            """
DECLARE doc inventory.inventory_documents%ROWTYPE; line inventory.inventory_document_lines%ROWTYPE;
        balance inventory.stock_balances%ROWTYPE; original_entry inventory.stock_ledger_entries%ROWTYPE;
        cost numeric(20,4); value numeric(20,2); expected_count bigint; actual_count bigint;
BEGIN
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM inventory.stock_ledger_entries WHERE org_id=p_org_id AND inventory_document_id=p_document_id) THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='inventory document already owns ledger evidence';
    END IF;

    FOR line IN SELECT * FROM inventory.inventory_document_lines
                 WHERE org_id=p_org_id AND inventory_document_id=p_document_id ORDER BY line_number,id
    LOOP
        IF doc.document_type='reversal' THEN
            FOR original_entry IN
                SELECT entry.* FROM inventory.stock_ledger_entries entry
                JOIN inventory.inventory_document_lines original_line
                  ON original_line.org_id=entry.org_id AND original_line.id=entry.inventory_document_line_id
                WHERE entry.org_id=p_org_id AND entry.inventory_document_id=doc.reverses_document_id
                  AND original_line.line_number=line.line_number ORDER BY entry.location_id,entry.id
            LOOP
                IF ROW(line.product_id,line.batch_id) IS DISTINCT FROM
                   ROW(original_entry.product_id,original_entry.batch_id) THEN
                    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reversal line stock identity differs from original ledger evidence';
                END IF;
                PERFORM erp_trade_commands.emit_entry(
                    p_org_id,p_document_id,line.id,'reversal',original_entry.location_id,
                    -original_entry.quantity_delta,original_entry.unit_cost,-original_entry.value_delta,
                    original_entry.id,p_actor_id,p_posted_at
                );
            END LOOP;
            CONTINUE;
        END IF;

        IF line.movement_kind IN ('issue','transfer')
           OR (line.movement_kind='count_adjustment' AND line.variance_quantity<0) THEN
            SELECT * INTO STRICT balance FROM inventory.stock_balances
             WHERE org_id=p_org_id AND location_id=line.from_location_id
               AND product_id=line.product_id AND batch_id=line.batch_id FOR UPDATE;
            cost := balance.average_unit_cost;
            value := CASE WHEN line.base_quantity=balance.on_hand_quantity
                          THEN balance.inventory_value
                          ELSE pg_catalog.round(line.base_quantity*cost,2) END;
            IF line.unit_cost IS DISTINCT FROM cost OR line.extended_cost IS DISTINCT FROM value THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='outbound line cost is not the locked moving weighted average';
            END IF;
        ELSE
            cost := line.unit_cost; value := line.extended_cost;
        END IF;

        CASE line.movement_kind
          WHEN 'receipt' THEN
            PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'receipt',line.to_location_id,line.base_quantity,cost,value,NULL,p_actor_id,p_posted_at);
          WHEN 'issue' THEN
            PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'issue',line.from_location_id,-line.base_quantity,cost,-value,NULL,p_actor_id,p_posted_at);
          WHEN 'transfer' THEN
            PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'transfer_out',line.from_location_id,-line.base_quantity,cost,-value,NULL,p_actor_id,p_posted_at);
            PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'transfer_in',line.to_location_id,line.base_quantity,cost,value,NULL,p_actor_id,p_posted_at);
          WHEN 'count_adjustment' THEN
            IF line.variance_quantity>0 THEN
                PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'count_gain',line.from_location_id,line.base_quantity,cost,value,NULL,p_actor_id,p_posted_at);
            ELSIF line.variance_quantity<0 THEN
                PERFORM erp_trade_commands.emit_entry(p_org_id,p_document_id,line.id,'count_loss',line.from_location_id,-line.base_quantity,cost,-value,NULL,p_actor_id,p_posted_at);
            END IF;
          ELSE
            RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='landed-cost value adjustment remains blocked';
        END CASE;
    END LOOP;
    SELECT COALESCE(sum(CASE WHEN movement_kind='transfer' THEN 2
                             WHEN movement_kind='count_adjustment' AND variance_quantity=0 THEN 0 ELSE 1 END),0)
      INTO expected_count FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF doc.document_type='reversal' THEN
        SELECT count(*) INTO expected_count FROM inventory.stock_ledger_entries
         WHERE org_id=p_org_id AND inventory_document_id=doc.reverses_document_id;
    END IF;
    SELECT count(*) INTO actual_count FROM inventory.stock_ledger_entries
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF actual_count<>expected_count THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory ledger cardinality is not exact';
    END IF;
END
""",
        ),
    ]

    definitions[
        "inventory.inventory_documents:inventory_inventory_documents_invariant_1"
    ] = [
        *_function(
            "post_locked_document(p_org_id uuid, p_document_id uuid, p_actor_id uuid)",
            "void",
            """
DECLARE quantity_total numeric(20,6); value_total numeric(20,2); command_posted_at timestamptz;
BEGIN
    PERFORM erp_trade_commands.assert_inventory_document(p_org_id,p_document_id);
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_org_id::text||':inventory-document:'||p_document_id::text,74139017)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(lock_key,74139018)
    ) FROM (
        SELECT DISTINCT p_org_id::text||':'||location_id::text||':'||product_id::text||':'||batch_id::text AS lock_key
        FROM (
          SELECT from_location_id AS location_id,product_id,batch_id FROM inventory.inventory_document_lines
           WHERE org_id=p_org_id AND inventory_document_id=p_document_id AND from_location_id IS NOT NULL
          UNION
          SELECT to_location_id,product_id,batch_id FROM inventory.inventory_document_lines
           WHERE org_id=p_org_id AND inventory_document_id=p_document_id AND to_location_id IS NOT NULL
        ) identities ORDER BY lock_key
    ) ordered_locks;
    SELECT COALESCE(sum(pg_catalog.abs(base_quantity)),0),COALESCE(sum(pg_catalog.abs(extended_cost)),0)
      INTO quantity_total,value_total FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF EXISTS (SELECT 1 FROM inventory.inventory_documents WHERE org_id=p_org_id AND id=p_document_id
               AND (total_abs_base_quantity IS DISTINCT FROM quantity_total OR total_value IS DISTINCT FROM value_total)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='inventory header totals do not equal locked line totals';
    END IF;
    command_posted_at := pg_catalog.transaction_timestamp();
    PERFORM erp_trade_commands.emit_document(p_org_id,p_document_id,p_actor_id,command_posted_at);
    UPDATE inventory.inventory_documents SET status='posted',posted_at=command_posted_at,
           posted_by_membership_id=p_actor_id,updated_at=command_posted_at,
           updated_by_membership_id=p_actor_id,row_version=row_version+1
     WHERE org_id=p_org_id AND id=p_document_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='inventory state transition lost its lock'; END IF;
END
""",
        ),
        *_function(
            "post_inventory_document(p_org_id uuid, p_document_id uuid, p_actor_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)",
            "uuid",
            """
DECLARE claim_id uuid; replay_id uuid; source_count integer; document_branch_id uuid;
        document_recall_id uuid; locked_document_type text;
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      p_org_id,p_actor_id,'inventory.document.post',p_idempotency_key_hash,p_request_hash,p_expires_at
    );
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT document_row.branch_id,num_nonnulls(document_row.sales_dispatch_id,document_row.sales_invoice_id,
                        document_row.sales_return_id,document_row.goods_receipt_id,document_row.supplier_invoice_id,
                        document_row.purchase_return_id,document_row.destruction_id),document_row.recall_id,document_row.document_type
      INTO document_branch_id,source_count,document_recall_id,locked_document_type
      FROM inventory.inventory_documents document_row
     WHERE document_row.org_id=p_org_id AND document_row.id=p_document_id FOR UPDATE;
    IF source_count IS NULL OR source_count<>0 OR document_recall_id IS NOT NULL
       OR locked_document_type IN ('stock_count','transfer') THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='typed source documents must use their owning domain command';
    END IF;
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',document_branch_id);
    PERFORM erp_trade_commands.post_locked_document(p_org_id,p_document_id,p_actor_id);
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'inventory.inventory_documents',p_document_id);
    RETURN p_document_id;
END
""",
        ),
        'GRANT USAGE ON SCHEMA "erp_trade_commands" TO "erp_app", "erp_runtime"',
        'GRANT EXECUTE ON FUNCTION "erp_trade_commands"."post_inventory_document"(uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime"',
        *_function(
            "guard_inventory_evidence()",
            "trigger",
            """
DECLARE parent_status text;
BEGIN
    IF TG_TABLE_NAME='inventory_documents' THEN
        IF TG_OP='DELETE' AND OLD.status IN ('posted','reversed') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted inventory evidence is immutable';
        END IF;
        IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed') AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted inventory evidence is immutable';
        END IF;
        IF TG_OP<>'DELETE' AND NEW.status IN ('posted','reversed')
           AND current_user<>'erp_migration_owner' THEN
            RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='only the inventory command may post or reverse evidence';
        END IF;
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END IF;
    SELECT status INTO parent_status FROM inventory.inventory_documents
     WHERE org_id=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END
       AND id=CASE WHEN TG_OP='DELETE' THEN OLD.inventory_document_id ELSE NEW.inventory_document_id END;
    IF parent_status IN ('posted','reversed') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted inventory lines are immutable';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        _trigger("inventory_documents_command_guard", "INSERT OR UPDATE OR DELETE", "inventory.inventory_documents", "guard_inventory_evidence"),
        _trigger("inventory_document_lines_command_guard", "INSERT OR UPDATE OR DELETE", "inventory.inventory_document_lines", "guard_inventory_evidence"),
        'CREATE UNIQUE INDEX "uq_inventory_documents_reverses_once" ON "inventory"."inventory_documents" (org_id,reverses_document_id) WHERE reverses_document_id IS NOT NULL',
    ]

    definitions[
        "inventory.inventory_documents:inventory_inventory_documents_physical_logistics"
    ] = [
        *_function(
            "assert_physical_logistics(p_org_id uuid, p_document_id uuid)",
            "void",
            """
DECLARE doc inventory.inventory_documents%ROWTYPE; source_status text; destination_status text; transporter_status text;
BEGIN
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR SHARE;
    IF NOT doc.physical_movement_required THEN RETURN; END IF;
    SELECT status INTO source_status FROM core.branches
     WHERE org_id=p_org_id AND id=doc.branch_id FOR SHARE;
    IF source_status<>'active' OR doc.movement_started_at>pg_catalog.transaction_timestamp()
       OR (doc.transport_mode<>'in_person' AND pg_catalog.num_nonnulls(
             doc.transporter_party_id,doc.transporter_name_snapshot)=0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='physical movement snapshot lacks active source, carrier, or valid start time';
    END IF;
    IF doc.document_type='transfer' THEN
      SELECT status INTO destination_status FROM core.branches
       WHERE org_id=p_org_id AND id=doc.destination_branch_id FOR SHARE;
      IF doc.destination_branch_id IS NULL OR doc.destination_branch_id=doc.branch_id OR destination_status<>'active' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='interbranch transfer requires a distinct active destination branch'; END IF;
    ELSIF doc.destination_branch_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='external physical issue cannot claim an internal destination branch';
    END IF;
    IF doc.transporter_party_id IS NOT NULL THEN
      SELECT status INTO transporter_status FROM parties.parties
       WHERE org_id=p_org_id AND id=doc.transporter_party_id FOR SHARE;
      IF transporter_status<>'active' OR doc.transporter_name_snapshot IS NULL
         OR pg_catalog.btrim(doc.transporter_name_snapshot)='' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='transporter snapshot requires the exact active party and frozen name'; END IF;
    END IF;
END
""",
        ),
    ]

    definitions[
        "inventory.stock_balances:inventory_stock_balances_invariant_1"
    ] = [
        *_function(
            "guard_projection_owner()",
            "trigger",
            """
BEGIN
    IF current_user<>'erp_migration_owner' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='stock balances are writable only by the canonical ledger projector';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        _trigger("stock_balances_projector_owner_guard", "INSERT OR UPDATE OR DELETE", "inventory.stock_balances", "guard_projection_owner"),
    ]

    definitions[
        "inventory.stock_ledger_entries:inventory_stock_ledger_entries_invariant_1"
    ] = [
        *_function(
            "guard_ledger_owner()",
            "trigger",
            """
BEGIN
    IF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='stock ledger entries are append-only';
    END IF;
    IF current_user<>'erp_migration_owner' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='stock ledger entries are writable only by the canonical inventory command';
    END IF;
    RETURN NEW;
END
""",
            security_definer=False,
        ),
        _trigger("stock_ledger_command_owner_guard", "INSERT OR UPDATE OR DELETE", "inventory.stock_ledger_entries", "guard_ledger_owner"),
    ]

    definitions[
        "inventory.stock_ledger_entries:inventory_stock_ledger_entries_invariant_2"
    ] = [
        """CREATE CONSTRAINT TRIGGER "stock_ledger_posted_parent_ct"
AFTER INSERT ON "inventory"."stock_ledger_entries"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "erp_trade_commands"."guard_posted_ledger_set"()"""
    ]
    # The function is included before the constraint trigger so deferred commit
    # verifies the complete set after the header transition.
    definitions[
        "inventory.stock_ledger_entries:inventory_stock_ledger_entries_invariant_2"
    ][0:0] = _function(
        "guard_posted_ledger_set()",
        "trigger",
        """
DECLARE parent_status text; expected_count bigint; actual_count bigint;
BEGIN
    SELECT status INTO parent_status FROM inventory.inventory_documents
     WHERE org_id=NEW.org_id AND id=NEW.inventory_document_id;
    IF parent_status<>'posted' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ledger set committed without a posted inventory document';
    END IF;
    SELECT COALESCE(sum(CASE WHEN movement_kind='transfer' THEN 2
                             WHEN movement_kind='count_adjustment' AND variance_quantity=0 THEN 0 ELSE 1 END),0)
      INTO expected_count FROM inventory.inventory_document_lines
     WHERE org_id=NEW.org_id AND inventory_document_id=NEW.inventory_document_id;
    IF EXISTS (SELECT 1 FROM inventory.inventory_documents WHERE org_id=NEW.org_id
               AND id=NEW.inventory_document_id AND document_type='reversal') THEN
        SELECT count(*) INTO expected_count FROM inventory.stock_ledger_entries original_entry
        JOIN inventory.inventory_documents reversal ON reversal.org_id=original_entry.org_id
          AND reversal.reverses_document_id=original_entry.inventory_document_id
        WHERE reversal.org_id=NEW.org_id AND reversal.id=NEW.inventory_document_id;
    END IF;
    SELECT count(*) INTO actual_count FROM inventory.stock_ledger_entries
     WHERE org_id=NEW.org_id AND inventory_document_id=NEW.inventory_document_id;
    IF actual_count<>expected_count THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='committed inventory ledger set cardinality is incomplete';
    END IF;
    RETURN NEW;
END
""",
            security_definer=False,
    )

    definitions["sales.dispatches:sales_dispatches_invariant_1"] = [
        _trigger("dispatches_command_guard", "INSERT OR UPDATE OR DELETE", "sales.dispatches", "guard_typed_source_posting"),
        *_function(
            "post_dispatch(p_org_id uuid, p_dispatch_id uuid, p_inventory_document_id uuid, p_actor_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)",
            "uuid",
            """
DECLARE claim_id uuid; replay_id uuid; source sales.dispatches%ROWTYPE;
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      p_org_id,p_actor_id,'sales.dispatch.post',p_idempotency_key_hash,p_request_hash,p_expires_at
    );
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO STRICT source FROM sales.dispatches WHERE org_id=p_org_id AND id=p_dispatch_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('sales.dispatch.post',source.branch_id);
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',source.branch_id);
    IF source.status<>'draft' OR NOT EXISTS (
        SELECT 1 FROM inventory.inventory_documents doc WHERE doc.org_id=p_org_id AND doc.id=p_inventory_document_id
          AND doc.sales_dispatch_id=p_dispatch_id AND doc.document_type='sales_issue' AND doc.status='approved'
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch requires one approved typed inventory issue'; END IF;
    PERFORM erp_trade_commands.post_locked_document(p_org_id,p_inventory_document_id,p_actor_id);
    UPDATE sales.dispatches SET status='posted',posted_at=pg_catalog.transaction_timestamp(),posted_by_membership_id=p_actor_id,
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,row_version=row_version+1
      WHERE org_id=p_org_id AND id=p_dispatch_id AND status='draft';
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'sales.dispatches',p_dispatch_id);
    RETURN p_dispatch_id;
END
""",
        ),
        'GRANT EXECUTE ON FUNCTION "erp_trade_commands"."post_dispatch"(uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime"',
    ]

    definitions[
        "procurement.goods_receipts:procurement_goods_receipts_invariant_1"
    ] = [
        *_function(
            "guard_typed_source_posting()",
            "trigger",
            """
BEGIN
    IF TG_OP='DELETE' AND OLD.status IN ('posted','reversed') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted trade source evidence is immutable';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted trade source evidence is immutable';
    END IF;
    IF TG_OP<>'DELETE' AND NEW.status IN ('posted','reversed')
       AND current_user<>'erp_migration_owner' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='typed trade source may post only through its canonical command';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        _trigger("goods_receipts_command_guard", "INSERT OR UPDATE OR DELETE", "procurement.goods_receipts", "guard_typed_source_posting"),
        *_function(
            "post_goods_receipt(p_org_id uuid, p_goods_receipt_id uuid, p_inventory_document_id uuid, p_actor_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)",
            "uuid",
            """
DECLARE claim_id uuid; replay_id uuid; source procurement.goods_receipts%ROWTYPE;
        v_purchase_order_id uuid; purchase_order_count integer; remaining_count integer;
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      p_org_id,p_actor_id,'procurement.receipt.post',p_idempotency_key_hash,p_request_hash,p_expires_at
    );
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO STRICT source FROM procurement.goods_receipts WHERE org_id=p_org_id AND id=p_goods_receipt_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('procurement.receipt.post',source.branch_id);
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',source.branch_id);
    SELECT count(DISTINCT line.purchase_order_id)
      INTO purchase_order_count
      FROM procurement.goods_receipt_lines receipt_line
      JOIN procurement.purchase_order_lines line ON line.org_id=receipt_line.org_id
       AND line.id=receipt_line.purchase_order_line_id
     WHERE receipt_line.org_id=p_org_id AND receipt_line.goods_receipt_id=p_goods_receipt_id;
    SELECT line.purchase_order_id INTO v_purchase_order_id
      FROM procurement.goods_receipt_lines receipt_line
      JOIN procurement.purchase_order_lines line ON line.org_id=receipt_line.org_id
       AND line.id=receipt_line.purchase_order_line_id
     WHERE receipt_line.org_id=p_org_id AND receipt_line.goods_receipt_id=p_goods_receipt_id
     LIMIT 1;
    PERFORM 1 FROM procurement.purchase_orders purchase_order
     WHERE purchase_order.org_id=p_org_id AND purchase_order.id=v_purchase_order_id
       AND purchase_order.branch_id=source.branch_id
       AND purchase_order.supplier_account_id=source.supplier_account_id
       AND purchase_order.status IN ('approved','partially_received')
     FOR UPDATE;
    IF purchase_order_count<>1 OR NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt must own lines from one exact receivable purchase order';
    END IF;
    IF EXISTS (
      SELECT 1 FROM procurement.purchase_order_lines ordered
       WHERE ordered.org_id=p_org_id AND ordered.purchase_order_id=v_purchase_order_id
         AND ordered.line_kind='product' AND (
           COALESCE((SELECT sum(receipt_line.base_accepted_quantity)
                       FROM procurement.goods_receipt_lines receipt_line
                       JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                        AND receipt.id=receipt_line.goods_receipt_id
                      WHERE receipt_line.org_id=ordered.org_id
                        AND receipt_line.purchase_order_line_id=ordered.id
                        AND (receipt.status='posted' OR receipt.id=p_goods_receipt_id)),0)>ordered.base_billed_quantity
           OR COALESCE((SELECT sum(receipt_line.base_free_quantity)
                          FROM procurement.goods_receipt_lines receipt_line
                          JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                           AND receipt.id=receipt_line.goods_receipt_id
                         WHERE receipt_line.org_id=ordered.org_id
                           AND receipt_line.purchase_order_line_id=ordered.id
                           AND (receipt.status='posted' OR receipt.id=p_goods_receipt_id)),0)>ordered.base_free_quantity
         )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt exceeds the locked accepted billed or free purchase-order ceiling';
    END IF;
    IF source.status<>'approved' OR NOT EXISTS (
        SELECT 1 FROM inventory.inventory_documents doc WHERE doc.org_id=p_org_id AND doc.id=p_inventory_document_id
          AND doc.goods_receipt_id=p_goods_receipt_id AND doc.document_type='purchase_receipt' AND doc.status='approved'
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt requires one approved typed inventory receipt'; END IF;
    PERFORM erp_trade_commands.post_locked_document(p_org_id,p_inventory_document_id,p_actor_id);
    UPDATE procurement.goods_receipts SET status='posted',posted_at=pg_catalog.transaction_timestamp(),posted_by_membership_id=p_actor_id,
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,row_version=row_version+1
      WHERE org_id=p_org_id AND id=p_goods_receipt_id AND status='approved';
    SELECT count(*) INTO remaining_count
      FROM procurement.purchase_order_lines ordered
     WHERE ordered.org_id=p_org_id AND ordered.purchase_order_id=v_purchase_order_id
       AND ordered.line_kind='product' AND (
         COALESCE((SELECT sum(receipt_line.base_accepted_quantity)
                     FROM procurement.goods_receipt_lines receipt_line
                     JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                      AND receipt.id=receipt_line.goods_receipt_id
                    WHERE receipt_line.org_id=ordered.org_id
                      AND receipt_line.purchase_order_line_id=ordered.id
                      AND receipt.status='posted'),0)<ordered.base_billed_quantity
         OR COALESCE((SELECT sum(receipt_line.base_free_quantity)
                        FROM procurement.goods_receipt_lines receipt_line
                        JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                         AND receipt.id=receipt_line.goods_receipt_id
                       WHERE receipt_line.org_id=ordered.org_id
                         AND receipt_line.purchase_order_line_id=ordered.id
                         AND receipt.status='posted'),0)<ordered.base_free_quantity
       );
    UPDATE procurement.purchase_orders
       SET status=CASE WHEN remaining_count=0 THEN 'received' ELSE 'partially_received' END,
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,
           row_version=row_version+1
     WHERE org_id=p_org_id AND id=v_purchase_order_id AND status IN ('approved','partially_received');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase order receipt lifecycle changed during posting';
    END IF;
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'procurement.goods_receipts',p_goods_receipt_id);
    RETURN p_goods_receipt_id;
END
""",
        ),
        'GRANT EXECUTE ON FUNCTION "erp_trade_commands"."post_goods_receipt"(uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime"',
    ]

    return definitions


BLOCKED_REASONS = {
    "procurement.purchase_order_advance_allocations:purchase_order_advance_allocations_cross_row_guard": "The inventory writer does not own supplier-payment, prepayment open-item, or withholding basis orchestration; a dedicated locked advance command is required.",
    "inventory.inventory_document_lines:inventory_inventory_document_lines_landed_cost_allocation": "The catalog still lacks an approved eligible variance/capitalized-charge allocation fact. A command cannot reconstruct legal allocation authority from invoice totals.",
    "inventory.inventory_documents:inventory_inventory_documents_landed_cost": "Landed-cost posting remains fail-closed until eligible price variance and capitalized charge pools are persisted and approved.",
    "inventory.inventory_documents:inventory_inventory_documents_invariant_2": "The inventory command enforces one reversal and implemented dispatch/receipt ownership, but sales-return, purchase-return, supplier-invoice-cost, and destruction commands are not all present; global posted-source ownership cannot yet be claimed.",
    "inventory.stock_ledger_entries:inventory_stock_ledger_entries_landed_cost": "The projector supports quantity/value folding, but value-adjustment entry creation remains blocked without the landed-cost allocation authority.",
    "procurement.purchase_order_lines:procurement_purchase_order_lines_invariant_1": "PostgreSQL has no reviewed implementation of the canonical Decimal engine and the catalog has no database-recomputable calculation digest.",
    "procurement.purchase_orders:procurement_purchase_orders_invariant_1": "Approval remains blocked until PostgreSQL can recompute the exact canonical Decimal outputs, including paise residual allocation.",
    "procurement.purchase_return_lines:procurement_purchase_return_lines_invariant_1": "The row has no explicit final-residual marker and no persisted original component allocation authority, so exact cumulative reversal intent cannot be proved for every partial return.",
    "procurement.purchase_returns:procurement_purchase_returns_invariant_1": "A complete return command still needs exact Decimal reversal proof plus typed tax, payable, accounting, and inventory facts.",
    "procurement.supplier_invoice_lines:procurement_supplier_invoice_lines_invariant_1": "The database cannot yet recompute the canonical Decimal engine or prove eligible capitalize-versus-expense allocation pools.",
    "procurement.supplier_invoices:procurement_supplier_invoices_invariant_1": "Supplier invoice posting remains blocked on Decimal equivalence and approved landed-cost allocation authority.",
    "sales.invoice_lines:sales_invoice_lines_invariant_1": "PostgreSQL has no reviewed implementation of the canonical Decimal engine and the catalog has no database-recomputable calculation digest.",
    "sales.invoices:sales_invoices_invariant_1": "Invoice posting remains blocked until exact Decimal recomputation can precede typed tax, receivable, accounting, and outbox fan-out.",
    "sales.order_lines:sales_order_lines_invariant_1": "PostgreSQL has no reviewed implementation of the canonical Decimal engine and the catalog has no database-recomputable calculation digest.",
    "sales.orders:sales_orders_invariant_1": "Approval remains blocked until PostgreSQL can recompute the exact canonical Decimal outputs, including paise residual allocation.",
    "sales.return_lines:sales_return_lines_invariant_1": "The row has no explicit final-residual marker and no persisted original component allocation authority, so exact cumulative reversal intent cannot be proved for every partial return.",
    "sales.returns:sales_returns_invariant_1": "A complete return command still needs exact Decimal reversal proof plus typed tax, receivable, accounting, and inventory facts.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _invariants()
    trade_manifest = json.loads(TRADE_MANIFEST_PATH.read_text(encoding="utf-8"))
    originally_blocked = set(trade_manifest["blocked_invariants"])
    definitions = _definitions()
    if set(definitions) & set(trade_manifest["resolved_invariants"]):
        raise ContractError("trade command mapping duplicates an existing trade invariant mapping")
    if set(definitions) | set(BLOCKED_REASONS) != originally_blocked:
        raise ContractError(
            "command disposition does not exactly partition prior trade blockers: "
            f"missing={sorted(originally_blocked-set(definitions)-set(BLOCKED_REASONS))}, "
            f"extra={sorted((set(definitions)|set(BLOCKED_REASONS))-originally_blocked)}"
        )

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
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)},
        "ownership": {
            "idempotency_claim_owner": f"{SCHEMA}.claim",
            "inventory_ledger_writer_count": 1,
            "inventory_projector_writer_count": 1,
            "runtime_commands": [
                f"{SCHEMA}.post_inventory_document",
                f"{SCHEMA}.post_dispatch",
                f"{SCHEMA}.post_goods_receipt",
            ],
        },
        "limitations": [
            "No landed-cost posting until approved eligible allocation pools are persisted.",
            "No order, invoice, supplier-invoice, or return posting until canonical Decimal equivalence is database-verifiable.",
            "PostgreSQL 15 numeric arithmetic is exact, but reproducing the Python engine's residual-allocation order requires a separately reviewed SQL engine and vectors.",
        ],
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping, manifest = generated_artifacts()
    ROOT.mkdir(parents=True, exist_ok=True)
    MAPPING_PATH.write_text(mapping, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
