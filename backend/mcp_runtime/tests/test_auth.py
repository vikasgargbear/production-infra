from __future__ import annotations

import base64
import json
import time
from uuid import uuid4

import pytest

from aasopharma_mcp.auth import SupabaseTokenVerifier
from conftest import settings


def _part(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def _token(algorithm: str = "RS256", kid: str | None = "key-1") -> str:
    header = {"alg": algorithm, "typ": "JWT"}
    if kid is not None:
        header["kid"] = kid
    return f"{_part(header)}.{_part({'sub': 'ignored'})}.c2lnbmF0dXJl"


class Resolver:
    def __init__(self) -> None:
        self.tokens: list[str] = []
        self.warmed = False

    def resolve(self, token: str):
        self.tokens.append(token)
        return object()

    def warm(self) -> None:
        self.warmed = True


@pytest.mark.asyncio
async def test_valid_asymmetric_token_checks_issuer_audience_and_required_claims() -> None:
    config = settings()
    resolver = Resolver()
    subject = str(uuid4())
    calls = []

    def decode(token, **kwargs):
        calls.append((token, kwargs))
        return {
            "iss": config.supabase_issuer,
            "aud": config.supabase_audience,
            "sub": subject,
            "client_id": "chatgpt-installation",
            "scope": "openid offline_access email profile",
            "iat": int(time.time()) - 1,
            "exp": int(time.time()) + 300,
        }

    verified = await SupabaseTokenVerifier(config, resolver, decode).verify_token(_token())

    assert verified is not None
    assert verified.subject == subject
    assert verified.client_id == "chatgpt-installation"
    assert verified.resource == config.resource_server_url
    assert calls[0][1]["issuer"] == config.supabase_issuer
    assert calls[0][1]["audience"] == config.supabase_audience
    assert calls[0][1]["algorithms"] == ["RS256", "ES256"]
    assert set(calls[0][1]["options"]["require"]) >= {"iss", "aud", "sub", "exp"}


@pytest.mark.asyncio
@pytest.mark.parametrize("algorithm,kid", [("HS256", "key-1"), ("none", "key-1"), ("RS256", None)])
async def test_symmetric_unsigned_and_unkeyed_tokens_are_rejected(
    algorithm: str, kid: str | None
) -> None:
    resolver = Resolver()
    verifier = SupabaseTokenVerifier(settings(), resolver, lambda *_args, **_kwargs: {})
    assert await verifier.verify_token(_token(algorithm, kid)) is None
    assert resolver.tokens == []


@pytest.mark.asyncio
async def test_missing_scope_or_non_uuid_subject_is_rejected_without_network() -> None:
    config = settings()
    base = {
        "iss": config.supabase_issuer,
        "aud": config.supabase_audience,
        "client_id": "client",
        "iat": int(time.time()) - 1,
        "exp": int(time.time()) + 300,
    }
    for claims in (
        dict(base, sub=str(uuid4()), scope="email profile"),
        dict(base, sub="not-a-uuid", scope="openid offline_access email"),
        dict(base, sub=str(uuid4()), scope="openid offline_access erp.master.read"),
        dict(base, sub=str(uuid4()), scope="openid email"),
    ):
        verifier = SupabaseTokenVerifier(
            config, Resolver(), lambda *_args, **_kwargs: claims
        )
        assert await verifier.verify_token(_token()) is None


@pytest.mark.asyncio
async def test_readiness_warms_real_resolver_boundary() -> None:
    resolver = Resolver()
    verifier = SupabaseTokenVerifier(settings(), resolver, lambda *_args, **_kwargs: {})
    await verifier.readiness()
    assert resolver.warmed is True
