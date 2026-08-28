"""Regression tests for explicit mutation response contracts."""

import ast
from pathlib import Path

ROUTES_ROOT = Path(__file__).resolve().parents[2] / "app" / "api" / "routes"
MUTATION_METHODS = {"post", "put", "patch", "delete"}

EXPECTED_MUTATION_RESPONSES = {
    ("post", "/api/branches/"): "BranchCreateResponse",
    ("put", "/api/branches/{branch_id}"): "BranchUpdateResponse",
    ("delete", "/api/branches/{branch_id}"): "MasterDeleteResponse",
    ("post", "/api/departments/"): "DepartmentCreateResponse",
    ("put", "/api/departments/{department_id}"): "DepartmentUpdateResponse",
    ("delete", "/api/departments/{department_id}"): "MasterDeleteResponse",
    ("post", "/api/employees"): "EmployeeCreateResponse",
    ("put", "/api/employees/{employee_id}"): "EmployeeUpdateResponse",
    ("delete", "/api/employees/{employee_id}"): "MasterDeleteResponse",
    ("post", "/api/payments/"): "GeneralPaymentCreateResponse",
    ("post", "/api/payments/customer-receipt"): "CustomerReceiptCreateResponse",
    ("post", "/api/journal-entries"): "JournalEntryCreateResponse",
    ("post", "/api/expense-claims"): "ExpenseClaimCreateResponse",
    ("post", "/api/compliance/compliance/drug-licenses"): "DrugLicenseMutationResponse",
}


def _is_generic_dict(annotation: ast.expr) -> bool:
    if isinstance(annotation, ast.Name):
        return annotation.id in {"dict", "Dict", "Any"}
    if not isinstance(annotation, ast.Subscript):
        return False
    return isinstance(annotation.value, ast.Name) and annotation.value.id in {"dict", "Dict"}


def test_mutation_decorators_do_not_publish_generic_dict_responses():
    violations = []
    for path in ROUTES_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                if decorator.func.attr not in MUTATION_METHODS:
                    continue
                for keyword in decorator.keywords:
                    if keyword.arg == "response_model" and _is_generic_dict(keyword.value):
                        violations.append(f"{path.relative_to(ROUTES_ROOT)}:{decorator.lineno}")

    assert violations == []


def test_retired_high_risk_legacy_mutations_are_absent_from_openapi():
    from app.main import app

    schema = app.openapi()
    assert len(EXPECTED_MUTATION_RESPONSES) == 14
    for method, path in EXPECTED_MUTATION_RESPONSES:
        assert method not in schema["paths"].get(path, {})
