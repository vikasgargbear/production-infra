"""Reviewed API operations that may be adapted by external agent clients.

This module is a contract registry, not an MCP transport. An operation is only
eligible for a future adapter when it is explicitly listed here and carries the
required security metadata. Unregistered OpenAPI operations remain ordinary API
operations and are not agent-exportable.
"""

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import FastAPI
from fastapi.routing import APIRoute

try:
    from fastapi.routing import iter_route_contexts
except ImportError:  # FastAPI <= 0.136 flattens included routers.
    iter_route_contexts = None

from .auth.org_context import get_org_context
from .security.permissions import PermissionChecker


CONTRACT_VERSION = "2026-08-19"


class OperationRisk(str, Enum):
    """Side-effect risk classes from the production architecture."""

    READ_ONLY = "read_only"
    REVERSIBLE_WRITE = "reversible_write"
    CONSEQUENTIAL_WRITE = "consequential_write"
    REGULATED_EXTERNAL = "regulated_external"


class TenantScope(str, Enum):
    ORGANIZATION = "organization"
    ORGANIZATION_BRANCH = "organization_branch"


class OperationBranchScope(str, Enum):
    NONE = "none"
    OPTIONAL = "optional"
    REQUIRED = "required"


@dataclass(frozen=True)
class OperationContract:
    """Machine-readable policy for one reviewed backend operation."""

    key: str
    method: str
    path: str
    operation_id: str
    domain: str
    owner: str
    permission: str
    oauth_scope: str
    risk: OperationRisk
    tenant_scope: TenantScope
    branch_scope: OperationBranchScope
    side_effects: str
    approval: str
    idempotency: str
    data_classification: str
    max_records: int
    mcp_export: bool = False
    tool_name: Optional[str] = None
    deprecated: bool = False
    replaced_by: Optional[str] = None
    status: str = "pilot"

    def openapi_extensions(self) -> Dict[str, Any]:
        """Return the vendor extensions attached to the OpenAPI operation."""
        return {
            "x-erp-contract-key": self.key,
            "x-erp-domain": self.domain,
            "x-erp-owner": self.owner,
            "x-erp-permission": self.permission,
            "x-erp-oauth-scope": self.oauth_scope,
            "x-erp-risk": self.risk.value,
            "x-erp-tenant-scope": self.tenant_scope.value,
            "x-erp-branch-scope": self.branch_scope.value,
            "x-erp-side-effects": self.side_effects,
            "x-erp-approval": self.approval,
            "x-erp-idempotency": self.idempotency,
            "x-erp-data-classification": self.data_classification,
            "x-erp-max-records": self.max_records,
            "x-erp-mcp-export": self.mcp_export,
            "x-erp-tool-name": self.tool_name,
            "x-erp-contract-status": self.status,
            "x-erp-deprecated": self.deprecated,
            "x-erp-replaced-by": self.replaced_by,
        }

    def as_public_dict(self) -> Dict[str, Any]:
        """Serialize enums for the top-level OpenAPI registry extension."""
        value = asdict(self)
        value["risk"] = self.risk.value
        value["tenant_scope"] = self.tenant_scope.value
        value["branch_scope"] = self.branch_scope.value
        return value


# Initial allowlist: read-only routes with explicit RBAC, JWT-derived tenant
# context, bounded result shapes, and no external side effects. Other GET routes
# remain excluded until their branch and permission behavior is reviewed.
OPERATION_REGISTRY: Tuple[OperationContract, ...] = (
    OperationContract(
        key="master.products.search",
        method="GET",
        path="/api/products",
        operation_id="master_search_products_v1",
        domain="master_data",
        owner="inventory",
        permission="master.view",
        oauth_scope="erp.master.read",
        risk=OperationRisk.READ_ONLY,
        tenant_scope=TenantScope.ORGANIZATION,
        branch_scope=OperationBranchScope.NONE,
        side_effects="none",
        approval="none",
        idempotency="not_applicable",
        data_classification="internal",
        max_records=100,
        mcp_export=True,
        tool_name="erp_product_search",
    ),
    OperationContract(
        key="master.suppliers.search",
        method="GET",
        path="/api/suppliers",
        operation_id="master_search_suppliers_v1",
        domain="master_data",
        owner="procurement",
        permission="master.view",
        oauth_scope="erp.master.read",
        risk=OperationRisk.READ_ONLY,
        tenant_scope=TenantScope.ORGANIZATION,
        branch_scope=OperationBranchScope.NONE,
        side_effects="none",
        approval="none",
        idempotency="not_applicable",
        data_classification="confidential",
        max_records=200,
        mcp_export=True,
        tool_name="erp_supplier_search",
    ),
    OperationContract(
        key="gst.settings.get",
        method="GET",
        path="/api/gst/settings",
        operation_id="gst_get_settings_v1",
        domain="gst",
        owner="compliance",
        permission="gst.view",
        oauth_scope="erp.gst.read",
        risk=OperationRisk.READ_ONLY,
        tenant_scope=TenantScope.ORGANIZATION,
        branch_scope=OperationBranchScope.NONE,
        side_effects="none",
        approval="none",
        idempotency="not_applicable",
        data_classification="confidential",
        max_records=1,
        mcp_export=True,
        tool_name="erp_gst_settings_get",
    ),
)


# Add a record here only after a measured compatibility surface has an owner,
# replacement, and removal date. Keeping this empty is explicit evidence that no
# route deprecation is being asserted by this implementation.
DEPRECATIONS: Tuple[Dict[str, str], ...] = ()


def validate_operation_definitions(
    operations: Iterable[OperationContract],
) -> Tuple[OperationContract, ...]:
    """Validate invariants independent of any FastAPI application instance."""
    definitions = tuple(operations)
    keys = set()
    route_keys = set()
    operation_ids = set()
    tool_names = set()

    for operation in definitions:
        method = operation.method.upper()
        route_key = (operation.path, method)

        if operation.key in keys:
            raise ValueError(f"Duplicate contract key: {operation.key}")
        if route_key in route_keys:
            raise ValueError(f"Duplicate route contract: {method} {operation.path}")
        if operation.operation_id in operation_ids:
            raise ValueError(f"Duplicate operation_id: {operation.operation_id}")

        keys.add(operation.key)
        route_keys.add(route_key)
        operation_ids.add(operation.operation_id)

        if operation.mcp_export:
            if method != "GET":
                raise ValueError(
                    f"MCP allowlist is read-only: {operation.key} uses {method}"
                )
            if operation.risk != OperationRisk.READ_ONLY:
                raise ValueError(
                    f"MCP export must be read-only: {operation.key} is {operation.risk.value}"
                )
            if operation.side_effects != "none":
                raise ValueError(f"MCP read declares side effects: {operation.key}")
            if operation.approval != "none":
                raise ValueError(f"MCP read declares an approval flow: {operation.key}")
            if operation.idempotency != "not_applicable":
                raise ValueError(f"MCP read declares idempotency: {operation.key}")
            if not operation.tool_name:
                raise ValueError(f"MCP export has no tool name: {operation.key}")
            if operation.tool_name in tool_names:
                raise ValueError(f"Duplicate MCP tool name: {operation.tool_name}")
            if operation.deprecated:
                raise ValueError(f"Deprecated operation cannot be exported: {operation.key}")
            tool_names.add(operation.tool_name)

        if not operation.permission or "." not in operation.permission:
            raise ValueError(f"Invalid permission metadata: {operation.key}")
        if not operation.oauth_scope.startswith("erp."):
            raise ValueError(f"Invalid OAuth scope metadata: {operation.key}")
        if operation.data_classification not in {"public", "internal", "confidential"}:
            raise ValueError(f"Invalid data classification: {operation.key}")
        if operation.max_records < 1:
            raise ValueError(f"Invalid record limit metadata: {operation.key}")
        if operation.deprecated and not operation.replaced_by:
            raise ValueError(f"Deprecated operation has no replacement: {operation.key}")

    return definitions


def _route_index(app: FastAPI) -> Dict[Tuple[str, str], List[Any]]:
    index: Dict[Tuple[str, str], List[Any]] = {}
    contexts = iter_route_contexts(app.routes) if iter_route_contexts else app.routes
    for context in contexts:
        original_route = getattr(context, "original_route", context)
        if not isinstance(original_route, APIRoute):
            continue
        effective_route = context if context is not original_route else original_route
        path = getattr(effective_route, "path", original_route.path)
        for method in effective_route.methods or set():
            key = (path, method.upper())
            index.setdefault(key, []).append(effective_route)
    return index


def _dependency_calls(route: APIRoute) -> List[Any]:
    calls: List[Any] = []

    def collect(dependant: Any) -> None:
        calls.append(dependant.call)
        for child in dependant.dependencies:
            collect(child)

    collect(route.dependant)
    return calls


def _validate_route_security(route: APIRoute, operation: OperationContract) -> None:
    calls = _dependency_calls(route)
    permission_checks = [call for call in calls if isinstance(call, PermissionChecker)]
    # Canonical routes resolve the verified ERP JWT once through
    # PermissionChecker; its returned user contains the signed org_id consumed
    # by the RLS activation boundary.  Older tenant-aware routes expose the
    # equivalent claim through get_org_context.  Either is JWT-derived; a raw
    # header or request parameter is never accepted as organization authority.
    if get_org_context not in calls and not permission_checks:
        raise RuntimeError(
            f"Contract route has no JWT organization context: {operation.key}"
        )

    permission_module, permission_action = operation.permission.split(".", 1)
    if not any(
        checker.module == permission_module
        and checker.permission == permission_action
        and not checker.require_admin
        for checker in permission_checks
    ):
        raise RuntimeError(
            f"Contract permission is not enforced by route: {operation.key} "
            f"expects {operation.permission}"
        )


def _registry_extension(operations: Iterable[OperationContract]) -> Dict[str, Any]:
    definitions = tuple(operations)
    return {
        "version": CONTRACT_VERSION,
        "boundary": "backend_application_api",
        "mcp_transport_implemented": False,
        "write_operations_exported": False,
        "allowlist": [
            operation.as_public_dict()
            for operation in definitions
            if operation.mcp_export
        ],
        "deprecations": list(DEPRECATIONS),
    }


def install_operation_registry(
    app: FastAPI,
    operations: Iterable[OperationContract] = OPERATION_REGISTRY,
) -> None:
    """Validate registered routes and install OpenAPI contract metadata.

    Failing at application construction is intentional: a renamed/missing route
    must not silently leave a stale agent allowlist in production.
    """
    if getattr(app.state, "erp_operation_registry_installed", False):
        return

    definitions = validate_operation_definitions(operations)
    routes = _route_index(app)

    for operation in definitions:
        key = (operation.path, operation.method.upper())
        matches = routes.get(key, [])
        if len(matches) != 1:
            raise RuntimeError(
                f"Contract route must resolve exactly once: {key[1]} {key[0]} "
                f"(found {len(matches)})"
            )

        route = matches[0]
        _validate_route_security(route, operation)

    original_openapi = app.openapi

    def contract_openapi() -> Dict[str, Any]:
        schema = original_openapi()
        for operation in definitions:
            path_operation = schema["paths"][operation.path][operation.method.lower()]
            path_operation["operationId"] = operation.operation_id
            path_operation.update(operation.openapi_extensions())
        schema["x-erp-contract"] = _registry_extension(definitions)
        return schema

    app.openapi_schema = None
    app.openapi = contract_openapi
    app.state.erp_operation_registry_installed = True
