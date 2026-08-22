"""Official MCP SDK Streamable HTTP application."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from pydantic import AnyHttpUrl, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from .auth import SupabaseTokenVerifier
from .config import Settings
from .operations import (
    OPERATIONS,
    OPERATOR_OPERATIONS,
    OperationGateway,
    published_operator_action_tool_names,
)
from .operator_actions import OPERATOR_TOOL_DESCRIPTIONS


def registered_tool_names() -> tuple[str, ...]:
    return tuple(sorted((*OPERATIONS, *published_operator_action_tool_names())))


def _access_token():
    access = get_access_token()
    if access is None:
        raise PermissionError("authenticated HTTP bearer context is required")
    return access


def create_app(
    settings: Settings | None = None,
    verifier: SupabaseTokenVerifier | None = None,
    gateway: OperationGateway | None = None,
):
    config = settings or Settings.from_env()
    token_verifier = verifier or SupabaseTokenVerifier(config)
    operation_gateway = gateway or OperationGateway(config)
    server = MCPServer(
        "AASOPharma ERP",
        token_verifier=token_verifier,
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(config.supabase_issuer),
            resource_server_url=AnyHttpUrl(config.resource_server_url),
            required_scopes=list(config.required_scopes),
        ),
    )

    @server.tool()
    async def erp_product_search(
        q: Annotated[str, Field(max_length=128, description="Optional product name, generic name, SKU, or HSN fragment.")] = "",
        limit: Annotated[int, Field(ge=1, le=100, description="Maximum matching products to return.")] = 20,
        offset: Annotated[int, Field(ge=0, description="Zero-based product result offset.")] = 0,
    ) -> Any:
        """Search the current organization's products by name, generic name, SKU, or HSN."""
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("limit must be 1..100 and offset must be nonnegative")
        return await operation_gateway.execute(
            OPERATIONS["erp_product_search"], _access_token(),
            {"q": q, "limit": limit, "offset": offset},
        )

    @server.tool()
    async def erp_supplier_search(
        search_term: Annotated[str | None, Field(max_length=128, description="Optional supplier name, code, GSTIN, or phone fragment.")] = None,
        limit: Annotated[int, Field(ge=1, le=200, description="Maximum matching suppliers to return.")] = 50,
        offset: Annotated[int, Field(ge=0, description="Zero-based supplier result offset.")] = 0,
    ) -> Any:
        """Search the current organization's suppliers by name, code, GSTIN, or phone."""
        if not 1 <= limit <= 200 or offset < 0:
            raise ValueError("limit must be 1..200 and offset must be nonnegative")
        return await operation_gateway.execute(
            OPERATIONS["erp_supplier_search"], _access_token(),
            {"search_term": search_term, "limit": limit, "offset": offset},
        )

    @server.tool()
    async def erp_gst_settings_get() -> Any:
        """Return the current organization's GST settings."""
        return await operation_gateway.execute(
            OPERATIONS["erp_gst_settings_get"], _access_token(), {},
        )

    @server.tool()
    async def erp_customer_search(
        search_term: Annotated[
            str, Field(min_length=1, max_length=128, description="Customer name, code, GSTIN, or phone to resolve.")
        ],
        limit: Annotated[int, Field(ge=1, le=50, description="Maximum candidate customers to return.")] = 20,
    ) -> Any:
        """Resolve a customer; ambiguous results require explicit selection."""
        return await operation_gateway.execute(
            OPERATIONS["erp_customer_search"], _access_token(),
            {"search_term": search_term, "limit": limit},
        )

    @server.tool()
    async def erp_inventory_location_search(
        branch_id: Annotated[str, Field(description="Authorized branch UUID containing the location.")],
        search_term: Annotated[str, Field(min_length=1, max_length=128, description="Exact location code or name.")],
        limit: Annotated[int, Field(ge=1, le=50, description="Maximum matching locations to return.")] = 20,
    ) -> Any:
        """Resolve an inventory location inside one authorized branch."""
        return await operation_gateway.execute(
            OPERATIONS["erp_inventory_location_search"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_stock_batch_search(
        branch_id: Annotated[str, Field(description="Authorized branch UUID whose stock is searched.")],
        product_id: Annotated[str, Field(description="Canonical product UUID selected from product search.")],
        location_id: Annotated[str | None, Field(description="Optional exact inventory location UUID.")] = None,
        limit: Annotated[int, Field(ge=1, le=100, description="Maximum FEFO-ranked batch balances to return.")] = 50,
    ) -> Any:
        """Return bounded batch availability, UOM, expiry, and FEFO facts."""
        return await operation_gateway.execute(
            OPERATIONS["erp_stock_batch_search"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_sales_order_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the sales order.")],
        sales_order_id: Annotated[str | None, Field(description="Exact canonical sales-order UUID.")] = None,
        order_number: Annotated[str | None, Field(max_length=64, description="Exact sales-order number; use instead of sales_order_id.")] = None,
        fiscal_year: Annotated[int | None, Field(ge=2000, le=9999, description="Optional fiscal year used only with order_number.")] = None,
    ) -> Any:
        """Resolve one sales order and its remaining dispatch quantities."""
        return await operation_gateway.execute(
            OPERATIONS["erp_sales_order_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_sales_invoice_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the sales invoice.")],
        sales_invoice_id: Annotated[str | None, Field(description="Exact canonical sales-invoice UUID.")] = None,
        invoice_number: Annotated[str | None, Field(max_length=64, description="Exact sales-invoice number; use instead of sales_invoice_id.")] = None,
        fiscal_year: Annotated[int | None, Field(ge=2000, le=9999, description="Optional fiscal year used only with invoice_number.")] = None,
    ) -> Any:
        """Resolve one posted sales invoice and its returnable balances."""
        return await operation_gateway.execute(
            OPERATIONS["erp_sales_invoice_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_purchase_order_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the purchase order.")],
        purchase_order_id: Annotated[str | None, Field(description="Exact canonical purchase-order UUID.")] = None,
        purchase_order_number: Annotated[str | None, Field(max_length=64, description="Exact purchase-order number; use instead of purchase_order_id.")] = None,
        fiscal_year: Annotated[int | None, Field(ge=2000, le=9999, description="Optional fiscal year used only with purchase_order_number.")] = None,
    ) -> Any:
        """Resolve one purchase order and remaining receipt and advance balances."""
        return await operation_gateway.execute(
            OPERATIONS["erp_purchase_order_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_goods_receipt_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the goods receipt.")],
        goods_receipt_id: Annotated[str | None, Field(description="Exact canonical goods-receipt UUID.")] = None,
        goods_receipt_number: Annotated[str | None, Field(max_length=64, description="Exact GRN number; use instead of goods_receipt_id.")] = None,
        fiscal_year: Annotated[int | None, Field(ge=2000, le=9999, description="Optional fiscal year used only with goods_receipt_number.")] = None,
    ) -> Any:
        """Resolve one posted GRN, challan facts, batches, and invoiceable balances."""
        return await operation_gateway.execute(
            OPERATIONS["erp_goods_receipt_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_supplier_invoice_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the supplier invoice.")],
        supplier_invoice_id: Annotated[str | None, Field(description="Exact canonical supplier-invoice UUID.")] = None,
        supplier_invoice_number: Annotated[str | None, Field(max_length=64, description="Exact supplier document number; use instead of supplier_invoice_id.")] = None,
        fiscal_year: Annotated[int | None, Field(ge=2000, le=9999, description="Optional fiscal year used only with supplier_invoice_number.")] = None,
    ) -> Any:
        """Resolve one posted supplier invoice and returnable/payable balances."""
        return await operation_gateway.execute(
            OPERATIONS["erp_supplier_invoice_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_open_item_search(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the open items.")],
        party_id: Annotated[str, Field(description="Exact canonical customer or supplier party UUID.")],
        item_side: Annotated[Literal["receivable", "payable"], Field(description="Receivable for customer collection or payable for supplier settlement.")],
        currency_code: Annotated[str, Field(pattern=r"^[A-Z]{3}$", description="Three-letter settlement currency code.")] = "INR",
        due_on_or_before: Annotated[str | None, Field(description="Optional ISO date upper bound for due items.")] = None,
        limit: Annotated[int, Field(ge=1, le=100, description="Maximum open items to return.")] = 50,
    ) -> Any:
        """Return open receivables or payables for explicit allocation."""
        return await operation_gateway.execute(
            OPERATIONS["erp_open_item_search"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_settlement_choice_search(
        branch_id: Annotated[str, Field(description="Authorized branch UUID for the payment.")],
        currency_code: Annotated[str, Field(pattern=r"^[A-Z]{3}$", description="Three-letter settlement currency code.")] = "INR",
        limit: Annotated[int, Field(ge=1, le=100, description="Maximum settlement account choices to return.")] = 50,
    ) -> Any:
        """Return valid cash or bank settlement-account choices."""
        return await operation_gateway.execute(
            OPERATIONS["erp_settlement_choice_search"], _access_token(), locals(),
        )

    def register_operator_tool(tool_name: str) -> None:
        operation = OPERATOR_OPERATIONS[tool_name]

        async def invoke(**arguments: Any) -> Any:
            return await operation_gateway.execute_operator(
                operation, _access_token(), arguments
            )

        server.add_tool(
            invoke,
            name=tool_name,
            description=OPERATOR_TOOL_DESCRIPTIONS[tool_name],
            structured_output=False,
        )
        registered = server._tool_manager.get_tool(tool_name)
        if registered is None:
            raise RuntimeError(f"official MCP SDK did not register {tool_name}")
        # MCP SDK 2.0 derives schemas from signatures but has no public exact-schema
        # override. The pinned SDK exposes the registered Tool model; fail closed if
        # that compatibility boundary changes.
        registered.parameters = dict(operation.input_schema)

    for operator_tool_name in published_operator_action_tool_names():
        register_operator_tool(operator_tool_name)

    @server.custom_route("/health", methods=["GET"])
    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "service": "aasopharma-mcp"})

    @server.custom_route("/ready", methods=["GET"])
    async def ready(_: Request) -> JSONResponse:
        try:
            await token_verifier.readiness()
            await operation_gateway.readiness()
        except Exception:
            return JSONResponse({"status": "not_ready"}, status_code=503)
        return JSONResponse(
            {"status": "ready", "tools": list(registered_tool_names())}
        )

    return server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        streamable_http_path="/mcp",
        host=config.bind_host,
    )
