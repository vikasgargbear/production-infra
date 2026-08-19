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
    ("post", "/api/payroll/salary-structures"): "SalaryStructureCreateResponse",
    ("put", "/api/payroll/salary-structures/{structure_id}"): "SalaryStructureUpdateResponse",
    ("post", "/api/payroll/leave-policies"): "LeavePolicyMutationResponse",
    ("put", "/api/payroll/leave-policies/{policy_id}"): "LeavePolicyMutationResponse",
    ("delete", "/api/payroll/leave-policies/{policy_id}"): "LeavePolicyDeleteResponse",
    ("post", "/api/payroll/attendance"): "AttendanceMutationResponse",
    ("post", "/api/payroll/attendance/bulk"): "PayrollCountResponse",
    ("post", "/api/payroll/leave/balances/initialize"): "PayrollCountResponse",
    ("post", "/api/payroll/leave/applications"): "LeaveApplicationMutationResponse",
    ("post", "/api/payroll/leave/applications/{application_id}/approve"): "LeaveApplicationMutationResponse",
    ("post", "/api/payroll/leave/applications/{application_id}/reject"): "LeaveApplicationMutationResponse",
    ("post", "/api/payroll/calculate"): "PayrollCalculationResponse",
    ("post", "/api/payroll/generate"): "PayrollRunGenerationResponse",
    ("post", "/api/payroll/runs/{run_id}/confirm"): "PayrollRunConfirmationResponse",
    ("post", "/api/compliance/compliance/drug-licenses"): "DrugLicenseMutationResponse",
    ("post", "/api/compliance/compliance/audits"): "ComplianceAuditMutationResponse",
    ("post", "/api/compliance/compliance/inspector-visits"): "InspectorVisitMutationResponse",
    ("post", "/api/loyalty/loyalty/programs"): "LoyaltyProgramCreateResponse",
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


def test_high_risk_mutations_publish_strict_named_openapi_responses():
    from app.main import app

    schema = app.openapi()
    components = schema["components"]["schemas"]

    assert len(EXPECTED_MUTATION_RESPONSES) == 31
    for (method, path), component_name in EXPECTED_MUTATION_RESPONSES.items():
        response_schema = schema["paths"][path][method]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert response_schema == {"$ref": f"#/components/schemas/{component_name}"}
        assert components[component_name]["additionalProperties"] is False
