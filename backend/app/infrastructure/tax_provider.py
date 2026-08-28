"""Isolated PostgreSQL gateway for canonical tax-provider commands."""

from __future__ import annotations

import base64
import hashlib
import os
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from ..core.database import validate_direct_database_peer
from ..domain.tax_provider import (
    ProviderCompletionRequest,
    ProviderRequestFetchRequest,
    ProviderRequestFetchResponse,
)


class TaxProviderConfigurationError(RuntimeError):
    pass


class TaxProviderDatabase:
    """Runs only reviewed SECURITY DEFINER commands as `erp_tax_provider`."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def dispose(self) -> None:
        self._engine.dispose()

    def _verify_principal(self, connection) -> None:
        principal = connection.execute(text("SELECT session_user")).scalar_one()
        if principal != "erp_tax_provider":
            raise TaxProviderConfigurationError(
                "TAX_PROVIDER_DATABASE_URL must authenticate exactly as erp_tax_provider"
            )

    @staticmethod
    def _activate_request(connection, request_id) -> None:
        connection.execute(
            text("SELECT pg_catalog.set_config('app.request_id', :request_id, true)"),
            {"request_id": str(request_id)},
        )

    def fetch_request(self, request: ProviderRequestFetchRequest) -> ProviderRequestFetchResponse:
        with self._engine.begin() as connection:
            self._verify_principal(connection)
            self._activate_request(connection, request.worker_request_id)
            row = connection.execute(
                text(
                    '''SELECT request_media_type,request_bytes,request_sha256,adapter_name,provider_request_id
                         FROM erp_tax_provider_commands.read_request(
                           :organization_id,:artifact_id,:artifact_kind
                         )'''
                ),
                {
                    "organization_id": request.organization_id,
                    "artifact_id": request.artifact_id,
                    "artifact_kind": request.artifact_kind,
                },
            ).mappings().one()
        request_bytes = bytes(row["request_bytes"])
        request_sha256 = bytes(row["request_sha256"]).hex()
        if hashlib.sha256(request_bytes).hexdigest() != request_sha256:
            raise RuntimeError("database returned inconsistent canonical request evidence")
        return ProviderRequestFetchResponse(
            organization_id=request.organization_id,
            artifact_id=request.artifact_id,
            artifact_kind=request.artifact_kind,
            request_media_type=row["request_media_type"],
            request_base64=base64.b64encode(request_bytes).decode("ascii"),
            request_sha256=request_sha256,
            adapter_name=row["adapter_name"],
            provider_request_id=row["provider_request_id"],
        )

    def complete(self, request: ProviderCompletionRequest) -> None:
        response_bytes = base64.b64decode(request.response_base64, validate=True)
        signed_qr_bytes = (
            base64.b64decode(request.signed_qr_base64, validate=True)
            if request.signed_qr_base64 is not None
            else None
        )
        common = {
            "organization_id": request.organization_id,
            "artifact_id": request.artifact_id,
            "expected_adapter_name": request.adapter_name,
            "expected_provider_request_id": request.provider_request_id,
            "expected_request_sha256": bytes.fromhex(request.canonical_request_sha256),
            "outcome": request.outcome,
            "response_media_type": request.response_media_type,
            "response_bytes": response_bytes,
            "response_sha256": bytes.fromhex(request.response_sha256),
        }
        with self._engine.begin() as connection:
            self._verify_principal(connection)
            self._activate_request(connection, request.worker_request_id)
            if request.artifact_kind == "einvoice":
                result = connection.execute(
                    text(
                        '''SELECT erp_tax_provider_commands.complete_einvoice(
                             :organization_id,:artifact_id,:expected_adapter_name,
                             :expected_provider_request_id,:expected_request_sha256,
                             :outcome,:response_media_type,:response_bytes,:response_sha256,
                             :irn,:acknowledgement_number,:acknowledged_at,
                             :signed_qr_bytes,:signed_qr_sha256
                           )'''
                    ),
                    {
                        **common,
                        "irn": request.irn,
                        "acknowledgement_number": request.acknowledgement_number,
                        "acknowledged_at": request.acknowledged_at,
                        "signed_qr_bytes": signed_qr_bytes,
                        "signed_qr_sha256": (
                            bytes.fromhex(request.signed_qr_sha256)
                            if request.signed_qr_sha256 is not None
                            else None
                        ),
                    },
                ).scalar_one()
            else:
                result = connection.execute(
                    text(
                        '''SELECT erp_tax_provider_commands.complete_eway_bill(
                             :organization_id,:artifact_id,:expected_adapter_name,
                             :expected_provider_request_id,:expected_request_sha256,
                             :outcome,:response_media_type,:response_bytes,:response_sha256,
                             :eway_bill_number,:transport_mode,:vehicle_number,:transporter_id,
                             :valid_from_at,:valid_until_at
                           )'''
                    ),
                    {
                        **common,
                        "eway_bill_number": request.eway_bill_number,
                        "transport_mode": request.transport_mode,
                        "vehicle_number": request.vehicle_number,
                        "transporter_id": request.transporter_id,
                        "valid_from_at": request.valid_from_at,
                        "valid_until_at": request.valid_until_at,
                    },
                ).scalar_one()
            if str(result) != str(request.artifact_id):
                raise RuntimeError("provider completion returned an unexpected artifact")


@lru_cache(maxsize=1)
def get_tax_provider_database() -> TaxProviderDatabase:
    database_url = os.getenv("TAX_PROVIDER_DATABASE_URL", "").strip()
    if not database_url:
        raise TaxProviderConfigurationError("TAX_PROVIDER_DATABASE_URL is not configured")
    transport_requirement = os.getenv(
        "DATABASE_TRANSPORT_REQUIREMENT", ""
    ).strip()
    if transport_requirement:
        try:
            validate_direct_database_peer(
                database_url,
                os.getenv("DATABASE_URL", "").strip(),
                "erp_tax_provider",
                transport_requirement,
            )
        except RuntimeError as exc:
            raise TaxProviderConfigurationError(str(exc)) from exc
    if database_url in {
        os.getenv("DATABASE_URL", "").strip(),
        os.getenv("ERP_CALCULATOR_DATABASE_URL", "").strip(),
    }:
        raise TaxProviderConfigurationError(
            "TAX_PROVIDER_DATABASE_URL must use an independent database principal"
        )
    engine = create_engine(
        database_url,
        pool_size=1,
        max_overflow=0,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=10,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000",
        },
    )
    return TaxProviderDatabase(engine)


def dispose_tax_provider_engine() -> None:
    """Dispose the lazy tax-provider pool without creating it during shutdown."""

    if get_tax_provider_database.cache_info().currsize == 0:
        return
    database = get_tax_provider_database()
    database.dispose()
    get_tax_provider_database.cache_clear()
