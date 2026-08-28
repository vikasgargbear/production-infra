#!/usr/bin/env python3
"""Fail-closed static audit for ERP identifier and API contract consistency."""

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class ConsistencyIssue:
    code: str
    message: str


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def _enum_values(relative_path: str, enum_name: str) -> Tuple[int, Tuple[str, ...]]:
    tree = ast.parse(_read(relative_path))
    for node in tree.body:
        if not isinstance(node, ast.ClassDef) or node.name != enum_name:
            continue
        values = []
        for statement in node.body:
            if isinstance(statement, (ast.Assign, ast.AnnAssign)):
                value = statement.value
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    values.append(value.value)
        return node.lineno, tuple(values)
    return 0, ()


def _imported_name_line(
    relative_path: str,
    module_suffix: str,
    imported_name: str,
) -> int:
    tree = ast.parse(_read(relative_path))
    for node in tree.body:
        if not isinstance(node, ast.ImportFrom):
            continue
        if not (node.module or "").endswith(module_suffix):
            continue
        if any(alias.name == imported_name for alias in node.names):
            return node.lineno
    return 0


def _divergent_enum_definitions(paths: Iterable[Path]) -> List[str]:
    definitions: Dict[str, List[Tuple[Path, int, Tuple[str, ...]]]] = {}
    for path in paths:
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue
            base_names = {
                base.id for base in node.bases if isinstance(base, ast.Name)
            }
            if "Enum" not in base_names:
                continue
            values = []
            for statement in node.body:
                if not isinstance(statement, (ast.Assign, ast.AnnAssign)):
                    continue
                value = statement.value
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    values.append(value.value)
            if values:
                definitions.setdefault(node.name, []).append(
                    (path, node.lineno, tuple(values))
                )

    evidence = []
    for name, enum_definitions in sorted(definitions.items()):
        value_sets = {frozenset(values) for _, _, values in enum_definitions}
        if len(enum_definitions) < 2 or len(value_sets) == 1:
            continue
        locations = ", ".join(
            f"{path.relative_to(REPOSITORY_ROOT)}:{line_number}"
            for path, line_number, _ in enum_definitions
        )
        evidence.append(f"{name} ({locations})")
    return evidence


def _dict_float_money_evidence(paths: Iterable[Path]) -> List[str]:
    money_tokens = (
        "advance", "allocated", "amount", "balance", "collections", "cost",
        "credit", "debit", "discount", "due", "mrp", "outstanding", "paid",
        "payable", "pipeline", "price", "revenue", "risk", "subtotal", "tax",
        "total", "unallocated",
    )
    non_money_suffixes = (
        "_percent", "percent", "_percentage", "percentage", "_rate", "rate",
        "_utilization", "utilization", "_efficiency", "efficiency",
        "_multiplier", "multiplier",
    )
    def root_name(node: ast.AST) -> str:
        while isinstance(node, (ast.Attribute, ast.Subscript)):
            node = node.value
        return node.id if isinstance(node, ast.Name) else ""

    def target_names(node: ast.AST) -> set[str]:
        if isinstance(node, ast.Name):
            return {node.id}
        if isinstance(node, (ast.Tuple, ast.List)):
            return {
                name
                for element in node.elts
                for name in target_names(element)
            }
        return set()

    def referenced_names(node: ast.AST) -> set[str]:
        return {
            child.id
            for child in ast.walk(node)
            if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load)
        }

    def money_key(key: ast.AST) -> str:
        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
            return ""
        normalized = key.value.lower()
        if normalized.endswith(non_money_suffixes):
            return ""
        return key.value if any(token in normalized for token in money_tokens) else ""

    def contains_float(node: ast.AST) -> bool:
        return any(
            isinstance(child, ast.Call)
            and isinstance(child.func, ast.Name)
            and child.func.id == "float"
            for child in ast.walk(node)
        )

    def inspect_node(path: Path, node: ast.AST, found: set[str]) -> None:
        try:
            display_path = path.relative_to(REPOSITORY_ROOT)
        except ValueError:
            display_path = path
        for child in ast.walk(node):
            if not isinstance(child, ast.Dict):
                continue
            for key, value in zip(child.keys, child.values):
                field = money_key(key)
                if field and contains_float(value):
                    found.add(
                        f"{display_path}:{value.lineno}:{field}"
                    )

    evidence: List[str] = []
    for path in paths:
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for function in (
            node
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ):
            returns = [
                node for node in ast.walk(function)
                if isinstance(node, ast.Return) and node.value is not None
            ]
            reachable = {
                name
                for returned in returns
                for name in referenced_names(returned.value)
            }
            found: set[str] = set()
            for returned in returns:
                inspect_node(path, returned.value, found)

            changed = True
            while changed:
                changed = False
                for node in ast.walk(function):
                    if isinstance(node, (ast.For, ast.AsyncFor)):
                        if root_name(node.iter) in reachable:
                            aliases = target_names(node.target) - reachable
                            if aliases:
                                reachable.update(aliases)
                                changed = True
                        continue

                    if isinstance(node, (ast.Assign, ast.AnnAssign)):
                        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                        value = node.value
                        if value is None:
                            continue
                        assigned_names = {
                            name for target in targets for name in target_names(target)
                        }
                        if assigned_names & reachable and isinstance(
                            value, (ast.Dict, ast.List, ast.ListComp, ast.DictComp)
                        ):
                            inspect_node(path, value, found)
                            references = referenced_names(value) - reachable
                            if references:
                                reachable.update(references)
                                changed = True
                        for target in targets:
                            if not isinstance(target, ast.Subscript):
                                continue
                            if root_name(target) not in reachable:
                                continue
                            inspect_node(path, value, found)
                            field = money_key(target.slice)
                            if field and contains_float(value):
                                try:
                                    display_path = path.relative_to(REPOSITORY_ROOT)
                                except ValueError:
                                    display_path = path
                                found.add(
                                    f"{display_path}:{value.lineno}:{field}"
                                )
                        continue

                    if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
                        continue
                    call = node.value
                    if not isinstance(call.func, ast.Attribute):
                        continue
                    if call.func.attr not in {"append", "extend"}:
                        continue
                    if root_name(call.func.value) not in reachable:
                        continue
                    for argument in call.args:
                        inspect_node(path, argument, found)
                        references = referenced_names(argument) - reachable
                        if references:
                            reachable.update(references)
                            changed = True

            evidence.extend(sorted(found))
    return sorted(set(evidence))


def _generic_mutation_responses(paths: Iterable[Path]) -> List[str]:
    mutation_methods = {"post", "put", "patch", "delete"}

    def is_generic_dict(annotation: ast.expr) -> bool:
        if isinstance(annotation, ast.Name):
            return annotation.id in {"dict", "Dict", "Any"}
        if not isinstance(annotation, ast.Subscript):
            return False
        return (
            isinstance(annotation.value, ast.Name)
            and annotation.value.id in {"dict", "Dict"}
        )

    evidence: List[str] = []
    for path in paths:
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                if not isinstance(decorator.func, ast.Attribute):
                    continue
                if decorator.func.attr not in mutation_methods:
                    continue
                if any(
                    keyword.arg == "response_model"
                    and is_generic_dict(keyword.value)
                    for keyword in decorator.keywords
                ):
                    evidence.append(
                        f"{path.relative_to(REPOSITORY_ROOT)}:{decorator.lineno}"
                    )
    return evidence


def _naive_timestamp_evidence(paths: Iterable[Path]) -> List[str]:
    pattern = re.compile(r"datetime\.now\(\)\.isoformat\(\)")
    evidence: List[str] = []
    for path in paths:
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                evidence.append(f"{path.relative_to(REPOSITORY_ROOT)}:{line_number}")
    return evidence


def collect_issues() -> List[ConsistencyIssue]:
    issues: List[ConsistencyIssue] = []
    canonical_enum_contracts: Sequence[Tuple[str, str]] = (
        ("InvoiceStatus", "backend/app/api/schemas/sales/billing.py"),
        ("OrderStatus", "backend/app/api/schemas/sales/order.py"),
        ("POStatus", "backend/app/api/schemas/purchase/purchase_order.py"),
        ("GRNStatus", "backend/app/api/schemas/purchase/grn.py"),
        ("SupplierInvoiceStatus", "backend/app/api/schemas/purchase/supplier_invoice.py"),
        ("ReturnStatus", "backend/app/api/schemas/sales/returns.py"),
    )
    constants_path = "backend/app/core/utils/constants.py"
    divergent_enums = []
    for name, schema_path in canonical_enum_contracts:
        constants_line, constants_values = _enum_values(constants_path, name)
        schema_line, schema_values = _enum_values(schema_path, name)
        import_line = _imported_name_line(
            schema_path,
            "core.utils.constants",
            name,
        )
        if not constants_values or schema_values or not import_line:
            divergent_enums.append(
                f"{name} ({constants_path}:{constants_line} authority; "
                f"{schema_path}:{schema_line or import_line or 0} consumer)"
            )

    distinct_wire_contracts: Sequence[Tuple[str, str, Tuple[str, ...]]] = (
        (
            "SupplierInvoicePaymentStatus",
            "backend/app/api/schemas/purchase/supplier_invoice.py",
            ("pending", "overdue", "paid", "partially_paid"),
        ),
        (
            "BillingGSTCode",
            "backend/app/api/schemas/sales/billing.py",
            ("cgst_sgst", "igst"),
        ),
        (
            "StockOperationMovementType",
            "backend/app/api/schemas/inventory/stock.py",
            (
                "sale", "purchase", "stock_receive", "stock_issue", "stock_transfer",
                "stock_adjustment", "stock_damage", "stock_expiry", "stock_count",
                "stock_return", "writeoff",
            ),
        ),
        (
            "StockAdjustmentReason",
            "backend/app/api/schemas/inventory/stock.py",
            ("damage", "expiry", "count", "other"),
        ),
        (
            "InventoryAdjustmentReason",
            "backend/app/api/schemas/inventory/inventory.py",
            ("damage", "expiry", "theft", "counting", "breakage", "other"),
        ),
    )
    for name, schema_path, expected_values in distinct_wire_contracts:
        line_number, values = _enum_values(schema_path, name)
        if set(values) != set(expected_values):
            divergent_enums.append(f"{name} ({schema_path}:{line_number})")

    retired_ambiguous_contracts: Sequence[Tuple[str, str]] = (
        ("PaymentStatus", "backend/app/api/schemas/purchase/supplier_invoice.py"),
        ("GSTType", "backend/app/api/schemas/sales/billing.py"),
        ("StockMovementType", "backend/app/api/schemas/inventory/stock.py"),
        ("AdjustmentType", "backend/app/api/schemas/inventory/stock.py"),
        ("AdjustmentType", "backend/app/api/schemas/inventory/inventory.py"),
    )
    for name, schema_path in retired_ambiguous_contracts:
        line_number, values = _enum_values(schema_path, name)
        if values:
            divergent_enums.append(f"{name} ({schema_path}:{line_number})")

    divergent_enums.extend(
        _divergent_enum_definitions(
            (REPOSITORY_ROOT / "backend/app").rglob("*.py")
        )
    )

    if divergent_enums:
        issues.append(ConsistencyIssue(
            "DIVERGENT_ENUM_CONTRACTS",
            "enum authority or domain-specific wire contracts diverged: "
            + "; ".join(divergent_enums),
        ))

    legacy_sales_authorities = (
        "backend/app/api/services/sales/invoice/invoice_service.py",
        "backend/app/api/services/sales/order/order_service.py",
        "backend/app/api/services/master/product/service.py",
        "backend/app/api/routes/sales/invoices/routes.py",
        "backend/app/api/routes/sales/orders/routes.py",
        "backend/app/api/routes/master/products/routes.py",
    )
    legacy_tax_authorities = (
        "backend/app/api/services/compliance/gst_service.py",
        "backend/app/api/services/compliance/gst_engine.py",
        "backend/app/core/utils/state_utils.py",
        "backend/app/api/routes/finance/tax/routes.py",
        "backend/app/api/routes/master/customers/routes.py",
        "backend/app/api/routes/master/suppliers/routes.py",
    )
    if any((REPOSITORY_ROOT / path).exists() for path in legacy_tax_authorities):
        issues.append(ConsistencyIssue(
            "BROWSER_OWNED_GST_AUTHORITY",
            "legacy GST/state-name services or integer master routers were reintroduced; "
            "tax facts must resolve from effective canonical registrations and releases",
        ))
    uuid_master_code_evidence = []
    for path in (REPOSITORY_ROOT / "backend/app").rglob("*.py"):
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if "uuid4" in line and any(
                prefix in line for prefix in ("CUST-", "SUP-", "DRAFT-")
            ):
                uuid_master_code_evidence.append(
                    f"{path.relative_to(REPOSITORY_ROOT)}:{line_number}"
                )
    if uuid_master_code_evidence:
        issues.append(ConsistencyIssue(
            "UUID_DERIVED_MASTER_CODES",
            "customer, supplier, and product master codes must be explicit operator-owned "
            "identifiers, not request UUID derivatives: "
            + ", ".join(uuid_master_code_evidence),
        ))
    calculation_routes = _read("backend/app/api/routes/calculations.py")
    calculation_schemas = _read("backend/app/api/schemas/calculations.py")
    tax_authority = _read("backend/app/api/services/sales/tax_authority.py")
    sales_calculation = _read("backend/app/api/services/sales/calculation.py")
    canonical_commands = _read(
        "database/canonical/commands_automation/generate_automation_commands.py"
    )
    canonical_line = calculation_schemas.split(
        "class CanonicalSalesCalculationLine", 1
    )[1].split("class InvoiceCalculationRequest", 1)[0]
    if (
        any((REPOSITORY_ROOT / path).exists() for path in legacy_sales_authorities)
        or "gst_percent" in canonical_line
        or "tax_percent" in canonical_line
        or any(token not in calculation_routes for token in (
            "resolve_sales_tax_authority", "calculate_sales_totals", "authority.lines",
        ))
        or any(token not in tax_authority for token in (
            "tax.tax_code_versions",
            "core.reference_data_releases",
            "version.effective_from<=:document_date",
            "release.dataset_kind='hsn_sac_tax'",
            "release.status='active'",
        ))
        or any(token not in sales_calculation for token in (
            'item["resolved_gst_percent"]', '"resolved_gst_percent"',
        ))
        or any(token not in canonical_commands for token in (
            "tax.tax_code_versions AS tax_version",
            "core.reference_data_releases AS tax_release",
            "tax_version.effective_from<=order_date",
            "tax_release.dataset_kind='hsn_sac_tax'",
        ))
    ):
        issues.append(ConsistencyIssue(
            "CLIENT_SUPPLIED_GST_RATE_AUTHORITY",
            "sales preview or canonical command no longer proves exact effective-dated "
            "HSN tax authority, or a retired request-owned GST service was reintroduced",
        ))

    org_context = _read("backend/app/core/auth/org_context.py")
    tenant_service = _read("backend/app/core/auth/tenant_service.py")
    if "List[UUID]" in org_context or "List[UUID]" in tenant_service or "UUID(bid)" in org_context:
        issues.append(ConsistencyIssue(
            "BRANCH_ID_TYPE_MISMATCH",
            "branch context treats IDs as UUIDs while checked-in master.org_branches keys are INTEGER",
        ))
    if "treat as ALL for safety" in org_context:
        issues.append(ConsistencyIssue(
            "MISSING_BRANCH_SCOPE_FAILS_OPEN",
            "backend/app/core/auth/org_context.py:167 grants ALL branch access to legacy tokens missing branch_scope",
        ))

    frontend_types = _read("frontend/src/types/api.types.ts")
    if "organization_id: number" in frontend_types and "org_id: UUID" in _read(
        "backend/app/api/schemas/sales/billing.py"
    ):
        issues.append(ConsistencyIssue(
            "TENANT_KEY_WIRE_CONTRACT_DIVERGENCE",
            "frontend/src/types/api.types.ts:447 exposes organization_id as number while "
            "backend response schemas expose org_id as UUID",
        ))

    route_paths = tuple((REPOSITORY_ROOT / "backend/app/api/routes").rglob("*.py"))
    money_evidence = _dict_float_money_evidence(route_paths)
    if money_evidence:
        issues.append(ConsistencyIssue(
            "MONEY_RESPONSE_FLOAT_SERIALIZATION",
            f"{len(money_evidence)} route response fields coerce money to binary float; "
            "examples: " + ", ".join(money_evidence[:5]),
        ))

    timestamp_evidence = _naive_timestamp_evidence(route_paths)
    if timestamp_evidence:
        issues.append(ConsistencyIssue(
            "NAIVE_TIMESTAMP_SERIALIZATION",
            f"{len(timestamp_evidence)} response timestamps omit an offset; examples: "
            + ", ".join(timestamp_evidence[:5]),
        ))

    generic_responses = _generic_mutation_responses(route_paths)
    if generic_responses:
        issues.append(ConsistencyIssue(
            "UNTYPED_MUTATION_RESPONSE_CONTRACTS",
            f"{len(generic_responses)} mutation routes publish only generic dict response models; "
            "examples: " + ", ".join(generic_responses[:5]),
        ))

    return issues


def main() -> int:
    issues = collect_issues()
    print("=== ERP Contract Consistency Audit ===")
    if not issues:
        print("PASS: no identifier or API contract inconsistencies found")
        return 0
    for issue in issues:
        print(f"FAIL [{issue.code}] {issue.message}")
    print(f"\n{len(issues)} release blocker(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
