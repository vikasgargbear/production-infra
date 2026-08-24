#!/usr/bin/env python3
"""Fail-closed static audit for ERP identifier and API contract consistency."""

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple


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


def _literal_assignment(relative_path: str, variable_name: str) -> Dict:
    tree = ast.parse(_read(relative_path))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if any(
            isinstance(target, ast.Name) and target.id == variable_name
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    return {}


def _line_for_token(relative_path: str, token: str) -> int:
    path = REPOSITORY_ROOT / relative_path
    if not path.exists():
        return 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if token in line:
            return line_number
    return 0


def _route_block(relative_path: str, function_name: str) -> Tuple[int, str]:
    source = _read(relative_path)
    function_match = re.search(rf"^(?:async )?def {re.escape(function_name)}\(", source, re.MULTILINE)
    if not function_match:
        return 0, ""
    decorator_start = source.rfind("@router.", 0, function_match.start())
    next_route = source.find("\n@router.", function_match.end())
    if next_route < 0:
        next_route = len(source)
    line_number = source.count("\n", 0, decorator_start) + 1
    return line_number, source[decorator_start:next_route]


def _literal_document_number_callers() -> Set[str]:
    """Return number types with a statically provable application caller."""
    document_types: Set[str] = set()
    for path in (REPOSITORY_ROOT / "backend/app").rglob("*.py"):
        if path.name == "document_number_service.py":
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr == "generate_batch_number":
                document_types.add("batch")
                continue
            if node.func.attr not in {"generate_number", "reserve_number"}:
                continue
            if len(node.args) < 2:
                continue
            document_type = node.args[1]
            if isinstance(document_type, ast.Constant) and isinstance(document_type.value, str):
                document_types.add(document_type.value)
    document_types.update(
        _literal_assignment(
            "backend/app/api/routes/documents.py", "DOC_TYPE_MAPPING"
        ).values()
    )
    return document_types


def _ddl_has_target(sql_sources: str, table: str, columns: Sequence[str]) -> bool:
    table_pattern = re.compile(
        r"CREATE TABLE(?: IF NOT EXISTS)?\s+" + re.escape(table) + r"\s*\((.*?)\n\);",
        re.IGNORECASE | re.DOTALL,
    )
    for match in table_pattern.finditer(sql_sources):
        block = match.group(1)
        if all(re.search(rf"(?m)^\s*{re.escape(column)}\b", block) for column in columns):
            return True
    return False


def collect_issues() -> List[ConsistencyIssue]:
    issues: List[ConsistencyIssue] = []
    document_service = _read("backend/app/api/services/document_number_service.py")
    public_sequence_ddl = _read("database/migrations/create_number_sequences.sql")
    legacy_sequence_path = REPOSITORY_ROOT / "database/setup/create_document_sequences_table.sql"
    system_sequence_ddl = (
        legacy_sequence_path.read_text(encoding="utf-8")
        if legacy_sequence_path.exists()
        else ""
    )

    if (
        'strftime("%Y%m%d")' in document_service
        and "year_prefix VARCHAR(4)" in public_sequence_ddl
    ):
        issues.append(ConsistencyIssue(
            "DOCUMENT_SEQUENCE_KEY_WIDTH_MISMATCH",
            "document_number_service.py:221 generates an 8-character date key, but "
            "database/migrations/create_number_sequences.sql:6 permits only VARCHAR(4)",
        ))

    if (
        "public.document_number_sequences" in public_sequence_ddl
        and "system.document_sequences" in system_sequence_ddl
    ):
        issues.append(ConsistencyIssue(
            "COMPETING_DOCUMENT_SEQUENCE_AUTHORITIES",
            "database/migrations/create_number_sequences.sql:2 uses daily organization "
            "sequences while database/setup/create_document_sequences_table.sql:5 uses "
            "fiscal-year, month, and optional branch sequences",
        ))

    if "org_id UUID," in public_sequence_ddl:
        issues.append(ConsistencyIssue(
            "NULLABLE_DOCUMENT_SEQUENCE_TENANT",
            "database/migrations/create_number_sequences.sql:5 allows NULL org_id, for "
            "which PostgreSQL UNIQUE does not prevent duplicate sequence keys",
        ))

    if "org_id: Optional[str] = None" in document_service:
        issues.append(ConsistencyIssue(
            "OPTIONAL_DOCUMENT_NUMBER_TENANT",
            "document number generation still permits an unscoped tenant key",
        ))

    if "len(number_part) != 10" in document_service:
        issues.append(ConsistencyIssue(
            "DOCUMENT_NUMBER_VALIDATOR_DIVERGENCE",
            "document number validator rejects the 12-digit date-plus-sequence body generated by the service",
        ))

    document_configs = _literal_assignment(
        "backend/app/api/services/document_number_service.py", "DOCUMENT_CONFIGS"
    )
    document_aliases = _literal_assignment(
        "backend/app/api/routes/documents.py", "DOC_TYPE_MAPPING"
    )
    alias_mismatches = [
        f"{alias}->{document_type} generates {document_configs[document_type]['prefix']}"
        for alias, document_type in document_aliases.items()
        if document_type in document_configs
        and document_configs[document_type]["prefix"] != alias
    ]
    if alias_mismatches:
        issues.append(ConsistencyIssue(
            "DOCUMENT_TYPE_ALIAS_PREFIX_DIVERGENCE",
            "documents.py:12 accepts prefix codes that do not match the returned number: "
            + ", ".join(alias_mismatches),
        ))

    sql_sources = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (REPOSITORY_ROOT / "database").rglob("*.sql")
    )
    missing_targets = [
        f"{document_type}->{config['table']}.{config['column']}"
        for document_type, config in document_configs.items()
        if not _ddl_has_target(
            sql_sources,
            config["table"],
            (config["id_column"], config["column"]),
        )
    ]
    if missing_targets:
        issues.append(ConsistencyIssue(
            "DOCUMENT_CONFIG_TARGETS_UNBASELINED",
            "document number targets are absent or lack their configured identifier column in "
            "checked-in CREATE TABLE statements: " + ", ".join(missing_targets),
        ))

    unowned_configs = sorted(set(document_configs) - _literal_document_number_callers())
    if unowned_configs:
        issues.append(ConsistencyIssue(
            "DOCUMENT_CONFIG_WITHOUT_PROVEN_CALLER",
            "document number types have no mounted/static application caller: "
            + ", ".join(unowned_configs),
        ))

    ad_hoc_generators = []
    ad_hoc_patterns = (
        ("backend/app/repositories/invoices/invoice_repository.py", "MAX(CAST(SUBSTRING"),
        ("backend/app/api/services/document_number_service.py", "random.randint(1000, 9999)"),
        ("backend/app/api/routes/master/departments/routes.py", "count + 1"),
        ("backend/app/api/routes/master/suppliers/routes.py", "count + 1"),
        ("backend/app/api/routes/master/branches/routes.py", "count + 1"),
        ("backend/app/api/routes/master/employees/routes.py", "count + 1"),
        ("backend/app/api/routes/master/products/routes.py", "random.randint"),
        ("backend/app/api/routes/purchase/upload/routes.py", "strftime('%Y%m%d%H%M')"),
    )
    for path, token in ad_hoc_patterns:
        line_number = _line_for_token(path, token)
        if line_number:
            ad_hoc_generators.append(f"{path}:{line_number}")
    if ad_hoc_generators:
        issues.append(ConsistencyIssue(
            "AD_HOC_REFERENCE_GENERATORS",
            "non-atomic count, timestamp, MAX, or random identifier generation remains at "
            + ", ".join(ad_hoc_generators),
        ))

    retired_purchase_services = (
        "backend/app/api/services/purchase/purchase_service.py",
        "backend/app/api/services/purchase/grn_service.py",
        "backend/app/api/services/purchase/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_repository.py",
    )
    reintroduced_purchase_services = [
        path for path in retired_purchase_services if (REPOSITORY_ROOT / path).exists()
    ]
    if reintroduced_purchase_services:
        issues.append(ConsistencyIssue(
            "DUPLICATE_PURCHASE_SERVICE_SURFACES",
            "retired purchase compatibility services duplicate the mounted domain boundary: "
            + ", ".join(reintroduced_purchase_services),
        ))

    number_routes = (
        ("backend/app/api/routes/documents.py", "generate_document_number"),
        ("backend/app/api/routes/sales/invoices/routes.py", "generate_invoice_number"),
        ("backend/app/api/routes/sales/orders/routes.py", "generate_sales_order_number"),
        ("backend/app/api/routes/purchase/grn.py", "generate_grn_number"),
        ("backend/app/api/routes/finance/payments/routes.py", "generate_receipt_number"),
        ("backend/app/api/routes/finance/journal/routes.py", "generate_journal_number"),
        ("backend/app/api/routes/finance/expenses/routes.py", "generate_claim_number"),
        ("backend/app/api/routes/returns/sales/routes.py", "generate_sales_return_number"),
    )
    mutating_gets = []
    uncommitted_reservations = []
    for path, function_name in number_routes:
        line_number, block = _route_block(path, function_name)
        if not block:
            continue
        evidence = f"{path}:{line_number}"
        if "@router.get" in block:
            mutating_gets.append(evidence)
        if "DocumentNumberService.reserve_number" not in block:
            uncommitted_reservations.append(evidence)
    if mutating_gets:
        issues.append(ConsistencyIssue(
            "DOCUMENT_NUMBER_MUTATION_USES_GET",
            "sequence-consuming number generation is exposed as GET and cannot be treated "
            "as read-only by agents or caches: " + ", ".join(mutating_gets),
        ))
    if uncommitted_reservations:
        issues.append(ConsistencyIssue(
            "DOCUMENT_NUMBER_RESERVATION_NOT_COMMITTED",
            "number endpoints return a reserved identifier without committing the sequence "
            "transaction: " + ", ".join(uncommitted_reservations),
        ))

    sequence_schema = _read("database/migrations/create_number_sequences.sql")
    if "idempotency_key" not in sequence_schema:
        issues.append(ConsistencyIssue(
            "DOCUMENT_NUMBER_RESERVATION_IDEMPOTENCY_UNBASELINED",
            "standalone number reservations cannot replay a client retry because the checked-in "
            "sequence schema has no tenant-scoped idempotency key and response record",
        ))

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

    invoice_service = _read("backend/app/api/services/sales/invoice/invoice_service.py")
    order_service = _read("backend/app/api/services/sales/order/order_service.py")
    invoice_repository = _read("backend/app/api/services/sales/invoice/invoice_repository.py")
    product_service = _read("backend/app/api/services/master/product/service.py")
    product_ddl = _read("database/02-tables/03_inventory_tables.sql")
    gst_ddl = _read("database/02-tables/07_gst_tables.sql")
    if (
        "item.get('gst_percent', 0)" in invoice_service
        and 'item_data.get("tax_percent", 0)' in order_service
        and "SELECT product_id, product_name, hsn_code" in invoice_repository
        and "p.gst_percent" in product_service
        and "gst_percentage NUMERIC" in product_ddl
        and "effective_from DATE" in gst_ddl
    ):
        issues.append(ConsistencyIssue(
            "CLIENT_SUPPLIED_GST_RATE_AUTHORITY",
            "invoice_service.py:568 and order_service.py:45 trust request GST rates; "
            "invoice_repository.py:275 omits an authoritative rate; product_service.py:678 "
            "queries gst_percent while 03_inventory_tables.sql:135 defines gst_percentage "
            "and 07_gst_tables.sql:24-26 defines versioned HSN rates. Commit-time tax needs "
            "a baselined product/HSN authority plus permissioned, reasoned overrides",
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
