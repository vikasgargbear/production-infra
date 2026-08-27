from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_automation"
GENERATOR = ROOT / "generate_automation_commands.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_automation_commands", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sql() -> str:
    mapping = json.loads((ROOT / "baseline-automation-command-enforcements.json").read_text())
    return "\n".join(
        statement
        for enforcement in mapping["enforcements"]
        for statement in enforcement["statements"]
    )


def test_generated_automation_artifacts_are_current() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-automation-command-enforcements.json").read_text()
    assert manifest == (ROOT / "automation-command-manifest.json").read_text()
    assert "pg_catalog.extract(" not in mapping
    assert "pg_catalog.current_date" not in mapping
    assert "pg_catalog.least(" not in mapping
    assert "pg_catalog.greatest(" not in mapping
    assert "pg_catalog.date_part('month'" in mapping
    assert "Asia/Kolkata" not in mapping


def test_exactly_three_automation_invariants_are_resolved() -> None:
    manifest = json.loads((ROOT / "automation-command-manifest.json").read_text())
    assert manifest["resolved_count"] == 3
    assert manifest["blocked_count"] == 0
    assert set(manifest["resolved_invariants"]) == {
        "automation.agent_grant_capabilities:agent_grant_capabilities_revocation",
        "automation.command_requests:command_execution_guard",
        "automation.command_requests:command_request_matches_grant",
    }


def test_dispatcher_is_closed_typed_and_not_mcp_mounted() -> None:
    mapping = _sql()
    manifest = json.loads((ROOT / "automation-command-manifest.json").read_text())
    dispatcher = manifest["dispatcher"]
    executable = set(dispatcher["executable_prepare_capabilities"])
    assert dispatcher["registered_prepare_capabilities"] == sorted(_module().OPERATOR_COMMANDS)
    assert dispatcher["blocked_prepare_capabilities"] == sorted(
        set(_module().OPERATOR_COMMANDS) - executable
    )
    assert dispatcher["capability_operation_map"] == {
        capability: operation
        for capability, (operation, _) in sorted(_module().OPERATOR_COMMANDS.items())
    }
    assert "inventory.adjustment.prepare" in executable
    assert "inventory.destruction.prepare" in executable
    assert "inventory.transfer.prepare" in executable
    assert "compliance.destruction.post" in dispatcher["execution_operations"]
    assert "inventory.document.post" in dispatcher["execution_operations"]
    assert dispatcher["inventory_adjustment_pilot_scope"]["supported_effect"] == (
        "same_day_positive_cycle_count_gain_only"
    )
    assert dispatcher["inventory_destruction_pilot_scope"]["status"] == (
        "available_reviewed_certified_full_balance_gst_registered"
    )
    assert dispatcher["inventory_transfer_pilot_scope"]["status"] == (
        "available_reviewed_atomic_interbranch"
    )
    assert "inventory.transfer.prepare" not in dispatcher["blocked_prepare_capabilities"]
    assert dispatcher["dynamic_sql"] is False
    assert dispatcher["mcp_mounted"] is False
    assert "EXECUTE FORMAT" not in mapping.upper()
    assert "operation has no reviewed typed dispatcher" in mapping
    assert "GRANT EXECUTE ON FUNCTION" in mapping
    assert "TO \"erp_runtime\"" in mapping
    assert "TO \"erp_app\"" not in mapping


def test_inventory_adjustment_uses_the_catalog_risk_vocabulary() -> None:
    sql = _sql()
    assert "capability.risk_class='consequential_write'" in sql
    assert "capability.risk_class='controlled_batched_movement'" not in sql
    assert "conversion.row_version" not in sql
    assert "mrp_conversion.row_version" not in sql
    assert "effective_from<=adjustment_date" not in sql
    assert "valid_from<=adjustment_date" in sql
    assert "'version_hash',conversion_version_hash" in sql
    assert "'version_hash',mrp_conversion_version_hash" in sql


def test_typed_consent_and_request_facts_are_checked() -> None:
    mapping = _sql()
    for fragment in (
        "typed capability consent bounds are immutable",
        "NEW.branch_id IS DISTINCT FROM grant_row.branch_id",
        "NEW.destination_branch_id",
        "erp_security.can_access_branch(NEW.branch_id)",
        "NEW.requested_amount>capability.maximum_amount",
        "NEW.currency_code IS DISTINCT FROM capability.currency_code",
        "NEW.requests_sensitive_read AND NOT capability.allow_sensitive_read",
        "NEW.operation IS DISTINCT FROM expected_operation",
        "operation has no reviewed prepare boundary",
    ):
        assert fragment in mapping


def test_prepare_resolvers_activate_only_the_verified_auth_user_context() -> None:
    mapping = _sql()
    assert mapping.count(
        "erp_security.activate_context(auth_user_id,organization_id)"
    ) == 13
    assert "erp_security.activate_context(organization_id,membership_id)" not in mapping
    assert mapping.count(
        "erp_security.current_membership_id() IS DISTINCT FROM membership_id"
    ) == 13


def test_purchase_return_prepare_and_execute_reauthorize_exact_invoiced_lineage() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_purchase_return_prepare"',
        "request_document->>'return_source_kind'<>'invoiced'",
        "branch_id=requested_branch_id AND status='posted'",
        "tax_document.supplier_invoice_id=invoice.id",
        "artifact.supplier_invoice_id=invoice.id",
        "invoice_line.supplier_invoice_id=invoice.id",
        "persisted_return.id=(expected_line->>'line_id')::uuid",
        "purchase-return draft line cardinality changed",
        "purchase-return submission transition lost its draft",
        "purchase-return approval transition lost its submitted state",
        "movement_started_at,document_type,document_number",
        "parent.portal_document_type='gstr2b'",
        "parent.registration_id=original_tax.registration_id",
        "line.document_type='credit_note'",
        "supplier_invoice_receipt_allocation_id",
        "prior_billed+base_billed>invoice_allocation.allocated_base_billed_quantity",
        "prior_free+base_free>invoice_allocation.allocated_base_free_quantity",
        "lot_kind='manufacturer_batch' AND status='released'",
        "return_date<expires_on",
        "id=receipt_line.location_id",
        "balance.average_unit_cost",
        '"assert_purchase_return_draft"',
        "request_row.operation='procurement.purchase_return.post'",
        "current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'",
        "erp_commercial_commands.assert_purchase_return_artifact",
        "erp_commercial_commands.post_purchase_return",
    ):
        assert fragment in mapping


def test_customer_receipt_prepare_and_execute_reauthorize_exact_non_cash_allocation() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_customer_receipt_prepare"',
        "method NOT IN ('bank_transfer','card','upi')",
        "finance.payment.allocate",
        "accounts_receivable",
        "allows_bank_reconciliation",
        "customer receipt bank reference, date, and amount already exist",
        "ORDER BY candidate.id FOR UPDATE OF candidate",
        "item_side='receivable'",
        "document_date<=payment_date",
        "event_type='sales_invoice'",
        "status='posted' FOR SHARE",
        "customer receipt allocation exceeds live receivable balance",
        "allocation_state_hash",
        "customer receipt allocations must exactly equal payment amount",
        '"assert_customer_receipt_draft"',
        "line_count<>2",
        "SESSION_USER<>'erp_runtime'",
        "document_type='customer_receipt'",
        "request_row.operation='finance.payment.post'",
        "current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'",
        "erp_finance_commands.post_payment",
        "INSERT INTO finance.allocations",
        "posted allocation set differs from approved preview",
    ):
        assert fragment in mapping


def test_finance_payment_dates_use_one_organization_timezone_authority() -> None:
    mapping = _sql()
    business_clock = (
        'payment_date>"erp_core_commands".'
        '"current_organization_business_date"()'
    )

    assert mapping.count(business_clock) == 3
    assert "payment_date>CURRENT_DATE" not in mapping


def test_supplier_advance_prepare_and_execute_reauthorize_bounded_goods_pilot() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_supplier_advance_prepare"',
        "pg_catalog.jsonb_array_length(request_document->'allocations')<>1",
        "method NOT IN ('bank_transfer','upi')",
        "withholding_nature_code='purchase_of_goods'",
        "prior_fiscal_year_turnover<=100000000",
        "gst_tds_notified_deductor=false",
        "tax_residency_status='resident'",
        "pan_verification_status='verified'",
        "status IN ('verified','retained')",
        "supplier_account_id=supplier.id AND status='approved'",
        "':supplier-advance-line:'||(requested->>'purchase_order_line_id')",
        "prior.payment_id<>payment_id",
        "prior_gross+gross>line.net_value_amount",
        "supplier advance bank reference, date, and amount already exist",
        "supplier_prepayment",
        '"assert_supplier_advance_draft"',
        "line_count<>2",
        "request_row.operation='finance.supplier_advance.post'",
        "current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'",
        "erp_finance_commands.post_supplier_advance_payment",
    ):
        assert fragment in mapping


def test_supplier_payment_prepare_and_execute_reauthorize_exact_inr_payables() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_supplier_payment_prepare"',
        "method NOT IN ('bank_transfer','upi')",
        "capability.capability_code='finance.supplier_payment.prepare'",
        "tax_residency_status='resident'",
        "pan_verification_status='verified'",
        "payment_date BETWEEN effective_from AND effective_to",
        "item.document_date BETWEEN effective_from AND effective_to",
        "prior_fiscal_year_turnover<=100000000",
        "gst_tds_notified_deductor=false",
        "'resource_type','payment_date_fiscal_tax_fact'",
        "'resource_type','invoice_credit_fiscal_tax_fact'",
        "withholding_nature_code='purchase_of_goods'",
        "supplier payment pilot cannot mix advance, withholding, or adjustment allocations",
        "supplier payment pilot cannot leave an applicable supplier advance unapplied",
        "applicable_advance_state_hash",
        "':supplier-payment-reference:'||bank.id::text||':'||reference",
        "existing.reversal_of_payment_id IS NULL",
        "supplier payment bank reference was already consumed",
        "supplier payment allocation exceeds live payable balance",
        "supplier payment allocations must exactly equal gross liability and bank cash",
        '"assert_supplier_payment_draft"',
        "supplier payment exact two-line journal changed",
        "request_row.operation='finance.payment.post' AND request_row.capability_code='finance.supplier_payment.prepare'",
        "current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'",
        "supplier payment posted allocation set differs from approved preview",
        "erp_finance_commands.post_payment",
    ):
        assert fragment in mapping


def test_inventory_cycle_count_gain_prepare_and_execute_are_closed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_inventory_adjustment_prepare"',
        '"persist_inventory_adjustment_prepare"',
        '"assert_inventory_adjustment_draft"',
        "SESSION_USER<>'erp_runtime'",
        "capability.capability_code='inventory.adjustment.prepare'",
        "evidence_kind='inventory_cycle_count_sheet'",
        "adjustment_date IS DISTINCT FROM (counted_at AT TIME ZONE organization.timezone)::date",
        "adjustment_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date",
        "candidate_location.location_type='saleable' AND candidate_location.allows_sale",
        "candidate_location.branch_id=branch.id",
        "stock_balance.branch_id=branch.id",
        "stock_balance.location_id=location.id",
        "ledger_entry.location_id=location.id",
        "cold_chain_required=false",
        "COALESCE(drug_schedule,'NONE') NOT IN ('H','H1','X')",
        "COALESCE(ndps_regulated,false)=false",
        "batch.status='released'",
        "expires_on>adjustment_date",
        "pending.status IN ('draft','submitted','approved')",
        "variance_base:=counted_base-balance.on_hand_quantity",
        "extended_cost:=pg_catalog.round(variance_base*balance.average_unit_cost,2)",
        "'inventory_count_gain','income','INR',false",
        "license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')",
        "inventory_document.status<>'submitted'",
        "approval.approver_membership_id<>request_row.requested_by_membership_id",
        "PERFORM erp_trade_commands.post_locked_document",
        "entry.entry_kind='count_gain'",
        "INSERT INTO finance.accounting_events",
        "'inventory_valuation'",
    ):
        assert fragment in mapping
    reauthorize_at = mapping.index(
        "request_row.operation='inventory.document.post' AND request_row.capability_code='inventory.adjustment.prepare'"
    )
    approval_at = mapping.index("SET status='approved',approved_at=approval_decided_at", reauthorize_at)
    ledger_at = mapping.index("PERFORM erp_trade_commands.post_locked_document", approval_at)
    journal_at = mapping.index("UPDATE finance.journal_entries SET status='posted'", ledger_at)
    event_at = mapping.index("INSERT INTO finance.accounting_events", journal_at)
    success_at = mapping.index("SET status='succeeded'", event_at)
    assert reauthorize_at < approval_at < ledger_at < journal_at < event_at < success_at


def test_exact_hash_quorum_and_exact_once_boundaries_are_present() -> None:
    mapping = _sql()
    for fragment in (
        "extensions.digest(NEW.request_bytes,'sha256')",
        "extensions.digest(NEW.preview_bytes,'sha256')",
        '"aggregate_version_hash"',
        "approval.valid_until_at>pg_catalog.transaction_timestamp()",
        "approval_count<request_row.required_approval_count",
        "status='executing'",
        "status='succeeded'",
        "IF request_row.status='succeeded'",
        "RETURN request_row.response_bytes",
        '"prepare_operator_command"',
        '"approve_operator_command"',
        '"link_calculation_artifact"',
        "idempotency_key_hash=key_hash",
        "command requests may be inserted only by a reviewed prepare authority",
        "command approvals may be inserted only by the reviewed approval authority",
    ):
        assert fragment in mapping
    approval_start = mapping.index('"approve_operator_command"')
    approval_end = mapping.index('"execute_approved_command"', approval_start)
    approval = mapping[approval_start:approval_end]
    assert "id=command_request_id FOR UPDATE" in approval


def test_mapping_composes_and_removes_the_three_blockers() -> None:
    scripts = REPO / "backend" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        import generate_canonical_baseline as baseline
    finally:
        sys.path.remove(str(scripts))

    catalog = baseline.load_and_validate_catalog(REPO / "database/canonical/domains")
    before = baseline.generate_baseline(catalog, allow_draft=True)
    command_mapping = baseline._load_enforcement_mapping(
        ROOT / "baseline-automation-command-enforcements.json"
    )
    after = baseline.generate_baseline(
        catalog,
        enforcement_mapping=command_mapping.invariants,
        platform_mapping=command_mapping.platform,
        allow_draft=True,
    )
    removed = {item["key"] for item in before.blockers} - {item["key"] for item in after.blockers}
    manifest = json.loads((ROOT / "automation-command-manifest.json").read_text())
    assert removed == set(manifest["resolved_invariants"])


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_automation_commands_rollback.sql").read_text()
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "has_function_privilege" in fixture
    assert "execution_scopes" in fixture
    assert "THEN 21" in fixture
    assert "THEN 28" in fixture
    assert "ELSE 32" in fixture
    assert "calculator_count<>12" in fixture
    assert "calculator can execute an unreviewed automation helper" in fixture


def test_calculator_has_no_table_privileges_or_broad_command_grant() -> None:
    mapping = _sql()
    calculation_sql = (
        REPO
        / "database/canonical/calculation_authority/calculation-authority.sql"
    ).read_text()
    assert (
        'REVOKE ALL ON TABLE "erp_automation_commands"."write_scopes" '
        'FROM PUBLIC, "erp_app", "erp_runtime", "erp_calculator"'
    ) in mapping
    calculator_command_grants = [
        line
        for line in mapping.splitlines()
        if line.startswith("GRANT ") and 'TO "erp_calculator"' in line
    ]
    assert len(calculator_command_grants) == 13
    assert calculator_command_grants[0] == (
        'GRANT USAGE ON SCHEMA "erp_automation_commands" TO "erp_calculator"'
    )
    assert {
        line.split('FUNCTION "erp_automation_commands".', 1)[1].split("(", 1)[0]
        for line in calculator_command_grants[1:]
    } == {
        '"persist_sales_invoice_prepare"',
        '"persist_sales_order_prepare"',
        '"persist_purchase_order_prepare"',
        '"resolve_sales_invoice_prepare"',
        '"resolve_sales_order_prepare"',
        '"resolve_purchase_order_prepare"',
        '"persist_supplier_invoice_prepare"',
        '"resolve_supplier_invoice_prepare"',
        '"persist_sales_return_prepare"',
        '"resolve_sales_return_prepare"',
        '"persist_purchase_return_prepare"',
        '"resolve_purchase_return_prepare"',
    }
    assert all("prepare_operator_command" not in line for line in calculator_command_grants)
    assert all("execute_approved_command" not in line for line in calculator_command_grants)
    assert (
        'REVOKE ALL ON TABLE "calculation"."artifacts" FROM PUBLIC, '
        '"erp_app", "erp_runtime", "erp_calculator"'
    ) in calculation_sql
    calculator_grants = [
        line
        for line in calculation_sql.splitlines()
        if line.startswith("GRANT ") and 'TO "erp_calculator"' in line
    ]
    assert calculator_grants == [
        'GRANT USAGE ON SCHEMA "erp_calculation_authority" TO "erp_calculator";',
        'GRANT EXECUTE ON FUNCTION "erp_calculation_authority".'
        '"issue_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid,'
        'bytea,bytea,bytea,varchar,varchar,varchar,timestamptz) TO "erp_calculator";',
    ]


def test_calculation_issue_atomically_links_exact_command_evidence() -> None:
    calculation_sql = (
        REPO
        / "database/canonical/calculation_authority/calculation-authority.sql"
    ).read_text()
    insert_at = calculation_sql.index("INSERT INTO calculation.artifacts SELECT candidate.*")
    link_at = calculation_sql.index("erp_automation_commands.link_calculation_artifact", insert_at)
    return_at = calculation_sql.index("RETURN candidate.id", link_at)
    assert insert_at < link_at < return_at
    mapping = _sql()
    assert "SESSION_USER<>'erp_calculator'" in mapping
    assert "calculation artifact differs from immutable command preview" in mapping
    assert "calculation link may set only the exact authority hash once" in mapping


def test_calculated_prepares_bind_commands_to_persisted_document_versions() -> None:
    mapping = _sql()
    calculated_prepares = (
        ("purchase_order", "purchase_order_id", "procurement.purchase_order.prepare"),
        ("supplier_invoice", "supplier_invoice_id", "procurement.supplier_invoice.prepare"),
        ("sales_invoice", "invoice_id", "sales.invoice.prepare"),
        ("sales_order", "order_id", "sales.order.prepare"),
        ("sales_return", "sales_return_id", "sales.return.prepare"),
        ("purchase_return", "purchase_return_id", "procurement.purchase_return.prepare"),
    )
    for resource_type, resource_id, capability in calculated_prepares:
        start = mapping.index(f'CREATE FUNCTION "erp_automation_commands"."persist_{resource_type}_prepare"')
        end = mapping.index("\nREVOKE ALL ON FUNCTION", start)
        function_sql = mapping[start:end]
        aggregate = (
            f'"aggregate_version_hash"(\'{resource_type}\',{resource_id},1)'
        )
        assert aggregate in function_sql
        assert "resolved_document->'source_versions'" not in function_sql[
            function_sql.index("aggregate_hash:=") : function_sql.index(
                '"prepare_operator_command"'
            )
        ]
        assert function_sql.index("INSERT INTO ") < function_sql.index(aggregate)
        assert function_sql.index(aggregate) < function_sql.index(
            f"'{capability}'", function_sql.index('"prepare_operator_command"')
        )
        assert function_sql.index('"prepare_operator_command"') < function_sql.index(
            "erp_calculation_authority.issue_artifact"
        )
    capability_list = (
        "'sales.order.prepare','procurement.purchase_order.prepare',\n"
        "             'sales.invoice.prepare','procurement.supplier_invoice.prepare',\n"
        "             'sales.return.prepare','procurement.purchase_return.prepare'"
    )
    assert mapping.count(f"NEW.capability_code IN (\n             {capability_list}") == 2
    assert mapping.count(f"NEW.capability_code NOT IN (\n             {capability_list}") == 1
    assert (
        '"aggregate_version_hash"(\n               NEW.target_resource_type,'
        "NEW.target_resource_id,NEW.target_row_version"
    ) in mapping
    compact_mapping = "".join(mapping.split())
    for resource_type, variable in (
        ("sales_order", "sales_order"),
        ("purchase_order", "purchase_order"),
        ("supplier_invoice", "supplier_invoice"),
        ("sales_invoice", "sales_invoice"),
        ("sales_return", "sales_return"),
        ("purchase_return", "purchase_return"),
    ):
        assert (
            f'"aggregate_version_hash"(\'{resource_type}\','
            f"{variable}.id,{variable}.row_version)"
        ) in compact_mapping

    execute_start = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."execute_approved_command"'
    )
    execute_end = mapping.index("\nREVOKE ALL ON FUNCTION", execute_start)
    execute_sql = mapping[execute_start:execute_end]
    calculated_execute_branches = (
        ("procurement.purchase_order.approve", "purchase_order", "purchase_order"),
        ("procurement.supplier_invoice.post", "supplier_invoice", "supplier_invoice"),
        ("sales.invoice.post", "sales_invoice", "sales_invoice"),
        ("sales.return.post", "sales_return", "sales_return"),
        ("procurement.purchase_return.post", "purchase_return", "purchase_return"),
    )
    for operation, resource_type, variable in calculated_execute_branches:
        branch_start = execute_sql.index(f"request_row.operation='{operation}'")
        branch_end = execute_sql.find("ELSIF request_row.operation=", branch_start + 1)
        if branch_end == -1:
            branch_end = execute_sql.index("\n    ELSE", branch_start)
        branch = "".join(execute_sql[branch_start:branch_end].split())
        assert (
            f'"aggregate_version_hash"(\'{resource_type}\','
            f"{variable}.id,{variable}.row_version)"
        ) in branch
    receipt_start = execute_sql.index("request_row.operation='procurement.receipt.post'")
    receipt_end = execute_sql.index("ELSIF request_row.operation=", receipt_start + 1)
    receipt_branch = execute_sql[receipt_start:receipt_end]
    assert "preview_document->'source_versions'" in receipt_branch
    assert "extensions.digest(" in receipt_branch
    assert "supplier_invoice.id" not in receipt_branch


def test_every_executable_prepare_sets_request_context_before_command_persistence() -> None:
    mapping = _sql()
    request_id_prepares = {
        "sales_dispatch",
        "purchase_order",
        "goods_receipt",
        "supplier_invoice",
        "sales_invoice",
        "sales_order",
        "sales_return",
        "purchase_return",
    }
    command_id_prepares = {
        "inventory_adjustment",
        "supplier_payment",
        "supplier_advance",
        "customer_receipt",
    }
    for resource_type in sorted(request_id_prepares | command_id_prepares):
        start = mapping.index(
            f'CREATE FUNCTION "erp_automation_commands"."persist_{resource_type}_prepare"'
        )
        end = mapping.index("\nREVOKE ALL ON FUNCTION", start)
        function_sql = mapping[start:end]
        expected_id = (
            "request_id::text" if resource_type in request_id_prepares else "command_id::text"
        )
        request_context_at = function_sql.index(
            f"pg_catalog.set_config('app.request_id',{expected_id},true)"
        )
        command_at = function_sql.index('"prepare_operator_command"')
        assert request_context_at < command_at


def test_sales_order_prepare_resolves_and_persists_only_canonical_typed_facts() -> None:
    mapping = _sql()
    assert mapping.count(
        "IS DISTINCT FROM\n          (CASE WHEN resolved_document->>'supply_type'="
    ) == 3
    for fragment in (
        '"resolve_sales_order_prepare"',
        '"persist_sales_order_prepare"',
        "SESSION_USER<>'erp_calculator'",
        "capability.capability_code='sales.order.prepare'",
        "erp_security.has_permission('sales.order.create',branch_id)",
        "conversion.id=NULLIF(requested.line->>'uom_conversion_id','')::uuid",
        "conversion.to_uom_code=product.base_uom_code",
        "conversion.valid_from<=order_date",
        "tax_version.effective_from<=order_date",
        "catalog.commercial_charge_tax_profiles AS profile",
        "profile.direction='sales'",
        "tax_version.code_kind='sac'",
        "tax_release.dataset_kind='hsn_sac_tax'",
        "FOR SHARE OF profile,tax_version,tax_release",
        "customer_registration.taxpayer_type IN ('sez_unit','sez_developer')",
        "supply_type='sez' AND zero_rated_payment_mode NOT IN ('without_payment','with_igst')",
        "supply_type<>'sez' AND zero_rated_payment_mode<>'not_applicable'",
        "customer has ambiguous effective primary billing addresses",
        "customer has ambiguous effective primary shipping addresses",
        "INSERT INTO sales.orders",
        "INSERT INTO sales.order_lines",
        "'submitted'",
        "erp_calculation_authority.issue_artifact",
        "erp_trade_commands.claim",
        "erp_trade_commands_v2.assert_sales_order_artifact",
        "sales-order idempotency key has different exact input",
    ):
        assert fragment in mapping


def test_sales_invoice_dispatch_accumulator_is_declared_in_its_own_resolver() -> None:
    mapping = _sql()
    invoice_start = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."resolve_sales_invoice_prepare"'
    )
    invoice_end = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."assert_sales_invoice_draft"',
        invoice_start,
    )
    dispatch_start = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."resolve_sales_dispatch_prepare"'
    )
    dispatch_end = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."assert_sales_dispatch_draft"',
        dispatch_start,
    )

    assert "dispatch_tracker jsonb:='{}'::jsonb" in mapping[invoice_start:invoice_end]
    assert "dispatch_tracker jsonb:='{}'::jsonb" not in mapping[dispatch_start:dispatch_end]


def test_sales_dispatch_prepare_and_execute_are_closed_typed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_sales_dispatch_prepare"',
        '"persist_sales_dispatch_prepare"',
        '"assert_sales_dispatch_draft"',
        "capability.capability_code='sales.dispatch.prepare'",
        "candidate_order.status='approved'",
        "candidate_location.allows_sale",
        "erp_commercial_commands.resolve_role_account(",
        "'cost_of_goods_sold','expense','INR',false",
        "'inventory_asset','asset','INR',false",
        "eligible_batch.lot_kind='manufacturer_batch'",
        "eligible_batch.status='released'",
        "dispatch_date<eligible_batch.expires_on",
        "sales_dispatch_fefo_expiry_date_equivalence_v1",
        "GROUP BY eligible_lot.eligible_product_id,eligible_lot.expires_on",
        "ORDER BY expiry_group.expires_on",
        "dispatch batch allocations do not reconcile billed and free quantities separately",
        "explicit dispatch batches do not follow FEFO",
        "current_unit_cost:=CASE WHEN current_quantity=0 THEN 0",
        "base_billed+base_free=current_quantity THEN current_value",
        "sales-dispatch draft header or physical inventory snapshot changed",
        "erp_trade_commands.post_dispatch(",
        "erp_commercial_commands.post_dispatch_inventory_valuation(",
    ):
        assert fragment in mapping
    post_at = mapping.index("erp_trade_commands.post_dispatch(")
    valuation_at = mapping.index(
        "erp_commercial_commands.post_dispatch_inventory_valuation(", post_at
    )
    success_at = mapping.index("SET status='succeeded'", valuation_at)
    assert post_at < valuation_at < success_at
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'sales.dispatch.prepare\''
    )
    sequence_at = mapping.index(
        "dispatch_number:=erp_core_commands.allocate_document_number", prepare_at
    )
    draft_at = mapping.index("INSERT INTO sales.dispatches", sequence_at)
    assert prepare_at < sequence_at < draft_at
    assert "requested.line->>'unit_id'" not in mapping
    assert "requested.line->>'quantity'" not in mapping
    assert "requested.line->>'unit_price'" not in mapping


def test_sales_invoice_prepare_and_execute_are_closed_typed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_sales_invoice_prepare"',
        '"persist_sales_invoice_prepare"',
        '"assert_sales_invoice_draft"',
        "capability.capability_code='sales.invoice.prepare'",
        "request_document->>'tax_charge_mechanism'<>'normal'",
        "zero_rated_payment_mode='without_payment'",
        "customer_registration.taxpayer_type IN ('sez_unit','sez_developer')",
        "FROM tax.registration_branches association",
        "FOR SHARE OF association,registration",
        "'resource_type','seller_registration_branch'",
        "state_code=place_of_supply",
        "'sales_revenue','income','INR',false",
        "SELECT * INTO STRICT revenue_account FROM finance.accounts AS resolved_revenue_account",
        "batch.lot_kind='manufacturer_batch'",
        "batch.status='released'",
        "invoice_date<expires_on",
        "sales_invoice_fefo_expiry_date_equivalence_v3",
        "'auto_fefo','explicit_fefo'",
        "automatic FEFO allocation cannot satisfy locked stock",
        "ORDER BY batch_row.expires_on,batch_row.batch_number,batch_row.id",
        "automatic FEFO allocation changed before persistence",
        "'batch_allocation_mode'",
        "GROUP BY eligible_lot.product_id,eligible_lot.expires_on",
        "direct invoice batches do not follow FEFO",
        "invoice exceeds separate dispatch billed or free ceiling",
        "INSERT INTO sales.invoice_dispatch_allocations",
        "INSERT INTO inventory.inventory_document_lines",
        "erp_calculation_authority.issue_artifact",
        "erp_commercial_commands.post_sales_invoice(",
        "(resolved_document->>'branch_id')::uuid,false,'sales_return_receipt'",
    ):
        assert fragment in mapping
    function_at = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."persist_sales_invoice_prepare"'
    )
    sequence_at = mapping.index(
        "invoice_number:=erp_core_commands.allocate_document_number", function_at
    )
    draft_at = mapping.index("INSERT INTO sales.invoices", sequence_at)
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'sales.invoice.prepare\''
        , draft_at
    )
    assert sequence_at < draft_at < prepare_at
    reauthorize_at = mapping.index(
        'current_resolution:="erp_automation_commands"."resolve_sales_invoice_prepare"'
    )
    post_at = mapping.index("erp_commercial_commands.post_sales_invoice(", reauthorize_at)
    success_at = mapping.index("SET status='succeeded'", post_at)
    assert reauthorize_at < post_at < success_at
    assert "requested.line->>'unit_id'" not in mapping
    assert "requested.line->>'quantity'" not in mapping
    assert "requested.line->>'unit_price'" not in mapping


def test_purchase_order_prepare_and_execute_are_closed_typed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_purchase_order_prepare"',
        '"persist_purchase_order_prepare"',
        "capability.capability_code='procurement.purchase_order.prepare'",
        "erp_security.has_permission('procurement.order.manage',branch_id)",
        "request_document->>'tax_charge_mechanism'<>'normal'",
        "request_document->>'zero_rated_payment_mode'<>'not_applicable'",
        "buyer has no exact effective branch-state GST registration",
        "supplier requires one effective primary registered address",
        "import purchase orders remain fail-closed in the pilot",
        "supplier_registration.taxpayer_type NOT IN ('regular','casual')",
        "direction='procurement'",
        "conversion.to_uom_code=product.base_uom_code",
        "'resource_type','buyer_registration_branch'",
        "'resource_type','supplier_tax_registration'",
        "INSERT INTO procurement.purchase_orders",
        "INSERT INTO procurement.purchase_order_lines",
        "erp_trade_commands_v2.assert_purchase_order_artifact",
        "erp_calculation_authority.issue_artifact",
        "erp_trade_commands_v2.approve_purchase_order(",
    ):
        assert fragment in mapping
    function_at = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."persist_purchase_order_prepare"'
    )
    sequence_at = mapping.index(
        "order_number:=erp_core_commands.allocate_document_number", function_at
    )
    draft_at = mapping.index("INSERT INTO procurement.purchase_orders", sequence_at)
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'procurement.purchase_order.prepare\''
        , draft_at
    )
    assert sequence_at < draft_at < prepare_at
    reauthorize_at = mapping.index(
        'current_resolution:="erp_automation_commands"."resolve_purchase_order_prepare"'
    )
    approve_at = mapping.index(
        "erp_trade_commands_v2.approve_purchase_order(", reauthorize_at
    )
    success_at = mapping.index("SET status='succeeded'", approve_at)
    assert reauthorize_at < approve_at < success_at
    assert "requested_line->>'unit_id'" not in mapping
    assert "requested_line->>'quantity'" not in mapping
    assert "requested_line->>'unit_price'" not in mapping
    assert "procurement.purchase_order.create" not in mapping


def test_goods_receipt_prepare_and_execute_are_closed_typed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_goods_receipt_prepare"',
        '"persist_goods_receipt_prepare"',
        '"assert_goods_receipt_draft"',
        "capability.capability_code='procurement.goods_receipt.prepare'",
        "erp_security.has_permission('procurement.receipt.post',requested_branch_id)",
        "status IN ('approved','partially_received')",
        "receipt.status='posted' AND receipt.id<>goods_receipt_id",
        "received_day:=(received_at AT TIME ZONE organization.timezone)::date",
        "requested_accepted+requested_rejected<>requested_received",
        "requested_accepted+requested_free<=0",
        "requested_base_billed>order_line.base_billed_quantity",
        "requested_base_free>order_line.base_free_quantity",
        "product.drug_schedule IN ('H','H1','X')",
        "license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')",
        "attachment.status IN ('verified','retained')",
        "location.location_type<>'cold_storage'",
        "product_id=product.id AND to_uom_code=product.base_uom_code",
        "existing manufacturer batch immutable facts differ from receipt evidence",
        "mrp_conversion.valid_from<=received_day",
        "pg_catalog.to_jsonb(order_line)::text",
        "'purchase_order_line_version_hash',order_line_version_hash",
        "'version_hash',order_line_version_hash",
        "order_line.net_value_amount/",
        "order_line.base_billed_quantity+order_line.base_free_quantity",
        "INSERT INTO procurement.goods_receipts",
        "INSERT INTO procurement.goods_receipt_lines",
        "INSERT INTO inventory.inventory_document_lines",
        "'reference_only_no_payable_or_itc'",
        "erp_trade_commands.post_goods_receipt(",
    ):
        assert fragment in mapping
    assert "order_line.row_version" not in mapping
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'procurement.goods_receipt.prepare\''
    )
    sequence_at = mapping.index(
        "receipt_number:=erp_core_commands.allocate_document_number", prepare_at
    )
    draft_at = mapping.index("INSERT INTO procurement.goods_receipts", sequence_at)
    assert prepare_at < sequence_at < draft_at
    reauthorize_at = mapping.index(
        'current_resolution:="erp_automation_commands"."resolve_goods_receipt_prepare"'
    )
    assert_at = mapping.index(
        '"assert_goods_receipt_draft"(', reauthorize_at
    )
    post_at = mapping.index("erp_trade_commands.post_goods_receipt(", assert_at)
    success_at = mapping.index("SET status='succeeded'", post_at)
    assert reauthorize_at < assert_at < post_at < success_at


def test_supplier_invoice_prepare_and_execute_are_closed_typed_and_atomic() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_supplier_invoice_prepare"',
        '"persist_supplier_invoice_prepare"',
        "capability.capability_code='procurement.supplier_invoice.prepare'",
        "erp_security.has_permission('procurement.invoice.post',requested_branch_id)",
        "tax_charge_mechanism'<>'normal'",
        "zero_rated_payment_mode'<>'not_applicable'",
        "taxpayer_type IN ('regular','casual')",
        "portal_document_type='gstr2b'",
        "supplier invoice requires one unique parsed GSTR-2B row",
        "supplier invoice requires unique receipt lines and a unique exact GRN set",
        "requested GRN header set differs from the exact receipt allocation lineage",
        "supplier invoice receipt allocations must belong to one purchase order",
        "supplier invoice exceeds separate posted receipt billed or free ceiling",
        "taxable_resale_not_blocked_under_section_17",
        "product_kind IN ('medicine','medical_device','consumable')",
        "product invoice price variance requires reviewed unsold-stock landed-cost allocation",
        "INSERT INTO procurement.supplier_invoices",
        "INSERT INTO procurement.supplier_invoice_lines",
        "INSERT INTO procurement.supplier_invoice_receipt_allocations",
        "erp_commercial_commands.assert_supplier_invoice_artifact(",
        "erp_calculation_authority.issue_artifact(",
        "erp_commercial_commands.post_supplier_invoice(",
        "NULL::uuid,NULL::bytea,NULL::bytea",
    ):
        assert fragment in mapping
    function_at = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."persist_supplier_invoice_prepare"'
    )
    draft_at = mapping.index("INSERT INTO procurement.supplier_invoices", function_at)
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'procurement.supplier_invoice.prepare\''
        , draft_at
    )
    reauthorize_at = mapping.index(
        'current_resolution:="erp_automation_commands"."resolve_supplier_invoice_prepare"'
    )
    post_at = mapping.index(
        "erp_commercial_commands.post_supplier_invoice(", reauthorize_at
    )
    success_at = mapping.index("SET status='succeeded'", post_at)
    assert draft_at < prepare_at
    assert reauthorize_at < post_at < success_at
    artifact_at = mapping.index("erp_calculation_authority.issue_artifact(", draft_at)
    assert "INSERT INTO inventory.inventory_documents" not in mapping[
        prepare_at:artifact_at
    ]


def test_sales_return_prepare_and_execute_pin_lineage_tax_and_cost_atomically() -> None:
    mapping = _sql()
    for fragment in (
        '"resolve_sales_return_prepare"',
        '"persist_sales_return_prepare"',
        '"assert_sales_return_draft"',
        "persisted_return.id=(expected_line->>'line_id')::uuid",
        "sales-return draft line cardinality changed",
        "capability.capability_code='sales.return.prepare'",
        "erp_security.has_permission('sales.return.post',requested_branch_id)",
        "status='posted' AND invoice_type='tax_invoice'",
        "adjustment_rule.tax_effect=request_document->>'gst_tax_treatment'",
        "statutory sales credit requires registered buyer and explicit past ITC-reversal confirmation",
        "valid_from IS NULL OR valid_from<=return_date",
        "evidence_kind='recipient_itc_reversal'",
        "statutory sales return is after the exact effective-rule deadline",
        "commercial-only sales return forbids ITC-reversal evidence fields",
        "'resource_type','sales_return_prior_state'",
        "pg_catalog.pg_advisory_xact_lock",
        "invoice_allocation.allocated_base_billed_quantity",
        "invoice_allocation.allocated_base_free_quantity",
        "value_delta=-issue_line.extended_cost",
        "location_type='quarantine' AND allows_sale=false",
        "'final_residual',is_final",
        "INSERT INTO sales.returns",
        "INSERT INTO sales.return_lines",
        "'sales_return_receipt'",
        "erp_commercial_commands.assert_sales_return_artifact(",
        "erp_calculation_authority.issue_artifact(",
        "erp_commercial_commands.post_sales_return(",
    ):
        assert fragment in mapping
    assert mapping.count("'resource_type','sales_return_prior_state'") == 1
    function_at = mapping.index(
        'CREATE FUNCTION "erp_automation_commands"."persist_sales_return_prepare"'
    )
    draft_at = mapping.index("INSERT INTO sales.returns", function_at)
    prepare_at = mapping.index(
        '"prepare_operator_command"(organization_id,command_id,grant_id,\'sales.return.prepare\''
        , draft_at
    )
    artifact_at = mapping.index("erp_calculation_authority.issue_artifact(", prepare_at)
    reauthorize_at = mapping.index(
        'current_resolution:="erp_automation_commands"."resolve_sales_return_prepare"'
    )
    assert_at = mapping.index('"assert_sales_return_draft"(', reauthorize_at)
    post_at = mapping.index("erp_commercial_commands.post_sales_return(", assert_at)
    success_at = mapping.index("SET status='succeeded'", post_at)
    assert draft_at < prepare_at < artifact_at
    assert reauthorize_at < assert_at < post_at < success_at
