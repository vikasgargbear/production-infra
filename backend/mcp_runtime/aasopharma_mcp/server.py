"""Official MCP SDK Streamable HTTP application."""

from __future__ import annotations

import os
from typing import Annotated, Any, Literal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.utilities.func_metadata import ArgModelBase
from pydantic import AnyHttpUrl, ConfigDict, Field, create_model
from starlette.middleware.cors import CORSMiddleware
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
from .purchase_bill_mapping import (
    PURCHASE_BILL_MAPPING_ARGUMENT_SCHEMA,
    review_purchase_bill_mapping,
)


LOCAL_REVIEW_TOOL_NAMES = frozenset({"erp_purchase_bill_mapping_review"})


class ExactOperatorArguments(ArgModelBase):
    """SDK argument base that preserves each top-level field for JSON Schema validation."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    def model_dump_one_level(self) -> dict[str, Any]:
        return {
            field.alias or name: getattr(self, name)
            for name, field in self.__class__.model_fields.items()
            if name in self.model_fields_set
        }


def registered_tool_names() -> tuple[str, ...]:
    return tuple(
        sorted(
            (*OPERATIONS, *published_operator_action_tool_names(), *LOCAL_REVIEW_TOOL_NAMES)
        )
    )


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
    async def erp_party_aging_get(
        party_type: Annotated[Literal["customer", "supplier"], Field(description="Customer receivables or supplier payables.")],
    ) -> Any:
        """Return exact current branch-authorized party and document aging."""
        return await operation_gateway.execute(
            OPERATIONS["erp_party_aging_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_party_statement_get(
        party_account_id: Annotated[str, Field(description="Canonical customer or supplier account UUID.")],
        party_type: Annotated[Literal["customer", "supplier"], Field(description="Canonical party-account side.")],
        date_from: Annotated[str, Field(description="Inclusive ISO statement start date.")],
        date_to: Annotated[str, Field(description="Inclusive ISO statement end date.")],
        page: Annotated[int, Field(ge=1, description="One-based result page.")] = 1,
        page_size: Annotated[int, Field(ge=1, le=200, description="Maximum journal lines per page.")] = 100,
    ) -> Any:
        """Return one exact posted and reversal-safe canonical party statement."""
        return await operation_gateway.execute(
            OPERATIONS["erp_party_statement_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_trial_balance_get(
        date_from: Annotated[str, Field(description="Inclusive ISO report start date.")],
        date_to: Annotated[str, Field(description="Inclusive ISO report end date.")],
    ) -> Any:
        """Return the canonical factual trial balance for an exact period."""
        return await operation_gateway.execute(
            OPERATIONS["erp_trial_balance_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_profit_loss_get(
        date_from: Annotated[str, Field(description="Inclusive ISO report start date.")],
        date_to: Annotated[str, Field(description="Inclusive ISO report end date.")],
    ) -> Any:
        """Return income, expense, and result from canonical account classifications."""
        return await operation_gateway.execute(
            OPERATIONS["erp_profit_loss_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_customer_activity_get(
        date_from: Annotated[str, Field(description="Inclusive invoice-date start.")],
        date_to: Annotated[str, Field(description="Inclusive invoice-date end.")],
    ) -> Any:
        """Return factual posted customer invoice activity without lifecycle inference."""
        return await operation_gateway.execute(
            OPERATIONS["erp_customer_activity_get"], _access_token(), locals(),
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
    async def erp_product_setup_options_get(
        manufacturer_search: Annotated[str, Field(max_length=100, description="Optional manufacturer or supplier name/code prefix.")] = "",
    ) -> Any:
        """Return canonical units, categories, manufacturers, and reference readiness for product setup."""
        return await operation_gateway.execute(
            OPERATIONS["erp_product_setup_options_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_product_ingredient_search(
        search: Annotated[str, Field(min_length=1, max_length=100, description="Reviewed salt or ingredient name prefix.")],
        limit: Annotated[int, Field(ge=1, le=50, description="Maximum reviewed ingredients to return.")] = 20,
    ) -> Any:
        """Search the effective reviewed ingredient classification used by product setup."""
        return await operation_gateway.execute(
            OPERATIONS["erp_product_ingredient_search"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_product_hsn_search(
        search: Annotated[str, Field(min_length=1, max_length=100, description="HSN digits or official goods-description terms.")],
        limit: Annotated[int, Field(ge=1, le=50, description="Maximum effective reviewed HSN records to return.")] = 20,
    ) -> Any:
        """Search effective reviewed HSN and GST references; never infer tax from a product name."""
        return await operation_gateway.execute(
            OPERATIONS["erp_product_hsn_search"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_product_setup_get(
        product_id: Annotated[str, Field(description="Canonical product UUID returned by product creation.")],
    ) -> Any:
        """Read one product's exact setup, missing fields, row version, packing, and composition."""
        return await operation_gateway.execute(
            OPERATIONS["erp_product_setup_get"], _access_token(), locals(),
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
    async def erp_customer_get(
        customer_account_id: Annotated[str, Field(description="Exact canonical customer-account UUID returned by customer creation or search.")],
    ) -> Any:
        """Read one exact current customer account after creation or selection."""
        return await operation_gateway.execute(
            OPERATIONS["erp_customer_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_supplier_get(
        supplier_account_id: Annotated[str, Field(description="Exact canonical supplier-account UUID returned by supplier creation or search.")],
    ) -> Any:
        """Read one exact current supplier account after creation or selection."""
        return await operation_gateway.execute(
            OPERATIONS["erp_supplier_get"], _access_token(), locals(),
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
        """Resolve a customer and bounded active primary delivery-address authority."""
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
        """Return availability and expiry-date FEFO tiers; equal expiry shares one tier."""
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

    @server.tool()
    async def erp_adjustment_note_readback_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the posted adjustment note.")],
        note_id: Annotated[str, Field(description="Exact posted canonical adjustment-note UUID.")],
    ) -> Any:
        """Return exact posted note, journal, tax, allocation, and residual effects."""
        return await operation_gateway.execute(
            OPERATIONS["erp_adjustment_note_readback_get"], _access_token(), locals(),
        )

    @server.tool()
    async def erp_inventory_destruction_readback_get(
        branch_id: Annotated[str, Field(description="Authorized branch UUID owning the posted destruction.")],
        command_request_id: Annotated[str, Field(description="Exact succeeded destruction command UUID.")],
    ) -> Any:
        """Return exact posted destruction, stock, valuation, and journal effects."""
        return await operation_gateway.execute(
            OPERATIONS["erp_inventory_destruction_readback_get"], _access_token(), locals(),
        )

    async def purchase_bill_mapping_review(**arguments: Any) -> Any:
        return review_purchase_bill_mapping(arguments["mapping"])

    server.add_tool(
        purchase_bill_mapping_review,
        name="erp_purchase_bill_mapping_review",
        description=(
            "Validate and resume a stateless, non-posting purchase-bill evidence mapping; "
            "preserve unresolved/skipped facts and report the remaining canonical "
            "purchase-order, goods-receipt, and supplier-invoice gates."
        ),
        structured_output=False,
    )
    purchase_bill_review_tool = server._tool_manager.get_tool(
        "erp_purchase_bill_mapping_review"
    )
    if purchase_bill_review_tool is None:
        raise RuntimeError("official MCP SDK did not register purchase-bill mapping review")
    purchase_bill_review_tool.parameters = dict(PURCHASE_BILL_MAPPING_ARGUMENT_SCHEMA)
    purchase_bill_review_tool.fn_metadata.arg_model = create_model(
        "erp_purchase_bill_mapping_reviewArguments",
        __base__=ExactOperatorArguments,
        mapping=(Any, ...),
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
        properties = operation.input_schema.get("properties", {})
        required = set(operation.input_schema.get("required", ()))
        if not isinstance(properties, dict) or not properties:
            raise RuntimeError(f"operator schema for {tool_name} has no properties")
        model_fields = {
            field_name: (Any, ... if field_name in required else None)
            for field_name in properties
        }
        exact_argument_model = create_model(
            f"{tool_name}Arguments",
            __base__=ExactOperatorArguments,
            **model_fields,
        )
        # MCP SDK 2.0 has no public exact JSON-Schema registration API. Both the
        # advertised Tool schema and the internal Pydantic argument model must be
        # replaced at this pinned compatibility boundary; the gateway then performs
        # recursive Draft 2020-12 validation before authorization or network I/O.
        registered.parameters = dict(operation.input_schema)
        registered.fn_metadata.arg_model = exact_argument_model

    for operator_tool_name in published_operator_action_tool_names():
        register_operator_tool(operator_tool_name)

    @server.custom_route("/health", methods=["GET"])
    async def health(_: Request) -> JSONResponse:
        git_commit = None
        for variable_name in ("RENDER_GIT_COMMIT", "RAILWAY_GIT_COMMIT_SHA"):
            candidate = os.getenv(variable_name, "").strip().lower()
            if len(candidate) == 40 and all(
                character in "0123456789abcdef" for character in candidate
            ):
                git_commit = candidate
                break
        return JSONResponse(
            {"status": "ok", "service": "aasopharma-mcp", "git_commit": git_commit}
        )

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

    asgi_app = server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        streamable_http_path="/mcp",
        host=config.bind_host,
    )

    # CORSMiddleware must wrap the outer ASGI app so OPTIONS preflight is answered
    # before auth middleware evaluates the bearer token. Without this, browsers
    # receive a 401 on preflight and cannot initiate the OAuth/MCP session.
    if config.allowed_origins:
        asgi_app = CORSMiddleware(
            app=asgi_app,
            allow_origins=list(config.allowed_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "MCP-Session-ID",
                "Last-Event-ID",
                "Accept",
            ],
            expose_headers=["MCP-Session-ID"],
        )

    return asgi_app
