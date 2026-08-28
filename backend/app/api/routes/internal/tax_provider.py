"""Hidden authenticated worker boundary for canonical India GST evidence."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Annotated, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import DBAPIError

from ....domain.tax_provider import (
    ProviderCompletionRequest,
    ProviderCompletionResponse,
    ProviderRequestFetchRequest,
    ProviderRequestFetchResponse,
)
from ....infrastructure.tax_provider import (
    TaxProviderConfigurationError,
    get_tax_provider_database,
)


router = APIRouter(
    prefix="/internal/tax-provider",
    tags=["Internal Tax Provider"],
    include_in_schema=False,
)
bearer = HTTPBearer(auto_error=False)
SIGNATURE_VERSION = "v1"
SIGNATURE_MAX_AGE_SECONDS = 300

# External sandbox conformance, credentials/route evidence, and organization
# applicability evidence must be reviewed before a release changes this gate.
TAX_PROVIDER_PROMOTION_VERIFIED = False
APPROVED_PROVIDER_SCHEMA_PROFILES: frozenset[tuple[str, str, str]] = frozenset()


def _signed_message(timestamp: str, method: str, path: str, raw_body: bytes) -> bytes:
    return b"\n".join(
        (SIGNATURE_VERSION.encode(), timestamp.encode(), method.upper().encode(), path.encode(), raw_body)
    )


def verify_worker_authentication(
    *,
    raw_body: bytes,
    method: str,
    path: str,
    credentials: Optional[HTTPAuthorizationCredentials],
    timestamp: str,
    signature: str,
    idempotency_key: str,
    worker_request_id: str,
    now: int | None = None,
) -> None:
    token = os.getenv("TAX_PROVIDER_INTERNAL_SERVICE_TOKEN", "")
    signing_secret = os.getenv("TAX_PROVIDER_INTERNAL_HMAC_SECRET", "")
    configured_peer_secrets = {
        value
        for value in (
            os.getenv("MCP_INTERNAL_SERVICE_TOKEN", ""),
            os.getenv("JWT_SECRET_KEY", ""),
        )
        if value
    }
    supplied_token = credentials.credentials if credentials else ""
    if token and (token == signing_secret or token in configured_peer_secrets):
        raise HTTPException(status_code=503, detail="Tax-provider worker secrets are not independent")
    if signing_secret and signing_secret in configured_peer_secrets:
        raise HTTPException(status_code=503, detail="Tax-provider worker secrets are not independent")
    if (
        len(token) < 32
        or len(signing_secret) < 32
        or not hmac.compare_digest(token, supplied_token)
    ):
        raise HTTPException(status_code=401, detail="Invalid tax-provider worker credential")
    try:
        signed_at = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid tax-provider signature timestamp") from exc
    current_time = int(time.time()) if now is None else now
    if abs(current_time - signed_at) > SIGNATURE_MAX_AGE_SECONDS:
        raise HTTPException(status_code=401, detail="Expired tax-provider worker signature")
    if not hmac.compare_digest(idempotency_key, worker_request_id):
        raise HTTPException(status_code=409, detail="Worker idempotency key does not match the request")
    expected = hmac.new(
        signing_secret.encode(),
        _signed_message(timestamp, method, path, raw_body),
        hashlib.sha256,
    ).hexdigest()
    supplied = signature.removeprefix(f"{SIGNATURE_VERSION}=")
    if not signature.startswith(f"{SIGNATURE_VERSION}=") or not hmac.compare_digest(
        expected, supplied
    ):
        raise HTTPException(status_code=401, detail="Invalid tax-provider worker signature")


def _require_promotion(profile: tuple[str, str, str] | None = None) -> None:
    if not TAX_PROVIDER_PROMOTION_VERIFIED or not APPROVED_PROVIDER_SCHEMA_PROFILES:
        raise HTTPException(
            status_code=503,
            detail="Tax-provider external promotion evidence is incomplete",
        )
    if profile is not None and profile not in APPROVED_PROVIDER_SCHEMA_PROFILES:
        raise HTTPException(
            status_code=503,
            detail="Tax-provider schema conformance profile is not promoted",
        )


def _require_promoted_adapter(adapter_name: str) -> None:
    if not any(profile[0] == adapter_name for profile in APPROVED_PROVIDER_SCHEMA_PROFILES):
        raise HTTPException(
            status_code=503,
            detail="Tax-provider adapter is not promoted",
        )


def _database_error(exc: DBAPIError) -> HTTPException:
    sqlstate = getattr(exc.orig, "pgcode", None) or getattr(exc.orig, "sqlstate", None)
    if sqlstate == "23505":
        return HTTPException(status_code=409, detail="Provider evidence replay differs")
    if sqlstate in {"22023", "23514"}:
        return HTTPException(status_code=422, detail="Provider evidence violates the canonical contract")
    if sqlstate == "42501":
        return HTTPException(status_code=403, detail="Provider command authority denied")
    return HTTPException(status_code=503, detail="Tax-provider database command failed")


async def _authenticate_request(
    http_request: Request,
    worker_request_id: str,
    credentials: Optional[HTTPAuthorizationCredentials],
    timestamp: str,
    signature: str,
    idempotency_key: str,
) -> None:
    verify_worker_authentication(
        raw_body=await http_request.body(),
        method=http_request.method,
        path=http_request.url.path,
        credentials=credentials,
        timestamp=timestamp,
        signature=signature,
        idempotency_key=idempotency_key,
        worker_request_id=worker_request_id,
    )


@router.post("/requests:fetch", response_model=ProviderRequestFetchResponse)
async def fetch_provider_request(
    http_request: Request,
    payload: Annotated[ProviderRequestFetchRequest, Body()],
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    timestamp: str = Header(..., alias="X-Tax-Provider-Timestamp", min_length=1, max_length=20),
    signature: str = Header(..., alias="X-Tax-Provider-Signature", min_length=67, max_length=67),
    idempotency_key: str = Header(..., alias="X-Tax-Provider-Idempotency-Key", min_length=36, max_length=36),
) -> ProviderRequestFetchResponse:
    await _authenticate_request(
        http_request,
        str(payload.worker_request_id),
        credentials,
        timestamp,
        signature,
        idempotency_key,
    )
    _require_promotion()
    try:
        database = get_tax_provider_database()
        response = database.fetch_request(payload)
        _require_promoted_adapter(response.adapter_name)
        return response
    except TaxProviderConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DBAPIError as exc:
        raise _database_error(exc) from exc


@router.post("/completions", response_model=ProviderCompletionResponse)
async def complete_provider_request(
    http_request: Request,
    payload: Annotated[ProviderCompletionRequest, Body()],
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    timestamp: str = Header(..., alias="X-Tax-Provider-Timestamp", min_length=1, max_length=20),
    signature: str = Header(..., alias="X-Tax-Provider-Signature", min_length=67, max_length=67),
    idempotency_key: str = Header(..., alias="X-Tax-Provider-Idempotency-Key", min_length=36, max_length=36),
) -> ProviderCompletionResponse:
    await _authenticate_request(
        http_request,
        str(payload.worker_request_id),
        credentials,
        timestamp,
        signature,
        idempotency_key,
    )
    _require_promotion(
        (
            payload.adapter_name,
            payload.verification.official_schema_version,
            payload.verification.conformance_profile_sha256,
        )
    )
    try:
        database = get_tax_provider_database()
        database.complete(payload)
    except TaxProviderConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DBAPIError as exc:
        raise _database_error(exc) from exc
    return ProviderCompletionResponse(
        organization_id=payload.organization_id,
        artifact_id=payload.artifact_id,
        artifact_kind=payload.artifact_kind,
        outcome=payload.outcome,
        response_sha256=payload.response_sha256,
    )
