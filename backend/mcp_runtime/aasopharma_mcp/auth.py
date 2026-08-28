"""Supabase OAuth access-token verification for the MCP resource server."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any, Protocol
from uuid import UUID

import jwt
from jwt import InvalidTokenError, PyJWKClient
from mcp.server.auth.provider import AccessToken

from .config import Settings


ALLOWED_ALGORITHMS = ("RS256", "ES256")
ALLOWED_STANDARD_SCOPES = {"openid", "profile", "email", "phone", "offline_access"}


class SigningKeyResolver(Protocol):
    def resolve(self, token: str) -> Any: ...

    def warm(self) -> None: ...


class SupabaseJwksResolver:
    def __init__(self, jwks_url: str) -> None:
        self._client = PyJWKClient(jwks_url, cache_keys=True, lifespan=300)

    def resolve(self, token: str) -> Any:
        return self._client.get_signing_key_from_jwt(token).key

    def warm(self) -> None:
        keys = self._client.get_signing_keys()
        if not keys:
            raise RuntimeError("Supabase JWKS contains no signing keys")


class SupabaseTokenVerifier:
    """Verify signature, asymmetric algorithm, issuer, audience, expiry and subject."""

    def __init__(
        self,
        settings: Settings,
        resolver: SigningKeyResolver | None = None,
        decoder: Callable[..., dict[str, Any]] = jwt.decode,
    ) -> None:
        self.settings = settings
        self.resolver = resolver or SupabaseJwksResolver(settings.supabase_jwks_url)
        self._decoder = decoder

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in ALLOWED_ALGORITHMS or not header.get("kid"):
                return None
            key = await asyncio.to_thread(self.resolver.resolve, token)
            claims = self._decoder(
                token,
                key=key,
                algorithms=list(ALLOWED_ALGORITHMS),
                audience=self.settings.supabase_audience,
                issuer=self.settings.supabase_issuer,
                leeway=30,
                options={"require": ["iss", "sub", "aud", "exp", "iat", "client_id"]},
            )
            subject = str(UUID(str(claims["sub"])))
            app_metadata = claims.get("app_metadata")
            if not isinstance(app_metadata, dict):
                return None
            # Supabase Auth metadata uses the same canonical tenant key as the
            # web/API session boundary.  Keep the gateway-facing claim name
            # descriptive, but do not accept a second metadata alias.
            organization_id = str(UUID(str(app_metadata.get("org_id"))))
            client_id = claims["client_id"]
            scope_claim = claims.get("scope", "")
            if not isinstance(client_id, str) or not client_id.strip():
                return None
            if client_id not in self.settings.pre_registered_client_ids:
                return None
            if not isinstance(scope_claim, str):
                return None
            scopes = sorted(set(scope_claim.split()))
            if not set(scopes).issubset(ALLOWED_STANDARD_SCOPES):
                return None
            if not set(self.settings.required_scopes).issubset(scopes):
                return None
            return AccessToken(
                token=token,
                client_id=client_id,
                scopes=scopes,
                expires_at=int(claims["exp"]),
                resource=self.settings.resource_server_url,
                subject=subject,
                claims={
                    "iss": claims["iss"],
                    "aud": claims["aud"],
                    "sub": subject,
                    "organization_id": organization_id,
                    "client_id": client_id,
                },
            )
        except (InvalidTokenError, KeyError, TypeError, ValueError, RuntimeError):
            return None

    async def readiness(self) -> None:
        await asyncio.to_thread(self.resolver.warm)
