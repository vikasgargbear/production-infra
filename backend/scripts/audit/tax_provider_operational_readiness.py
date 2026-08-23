#!/usr/bin/env python3
"""Fail closed until non-secret tax-provider production evidence is reviewed."""

from __future__ import annotations

import json
import hashlib
import re
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
EVIDENCE = REPO / "database/canonical/commands_tax_provider/provider-operational-readiness.json"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SECRET_KEYS = {"password", "token", "api_key", "client_secret", "private_key", "secret_value"}


def _contains_secret_key(value: object) -> bool:
    if isinstance(value, dict):
        return any(
            str(key).lower() in SECRET_KEYS or _contains_secret_key(child)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(_contains_secret_key(child) for child in value)
    return False


def blockers(payload: dict) -> list[str]:
    blocked: list[str] = []
    if _contains_secret_key(payload):
        blocked.append("secret_field_present_in_readiness_evidence")
    adapter = payload.get("adapter_contract", {})
    source_hashes = adapter.get("source_sha256", {})
    adapter_sources_are_current = bool(source_hashes) and all(
        SHA256.fullmatch(str(expected or ""))
        and (REPO / relative).is_file()
        and hashlib.sha256((REPO / relative).read_bytes()).hexdigest() == expected
        for relative, expected in source_hashes.items()
    )
    if not (
        adapter.get("reviewed") is True
        and adapter.get("adapter_name") == "aasopharma_provider_neutral_worker_boundary"
        and adapter.get("adapter_version") == "1.0.0"
        and adapter.get("official_schema_version") == "declared_per_completion"
        and adapter_sources_are_current
        and adapter.get("reviewed_by")
        and adapter.get("reviewed_at")
    ):
        blocked.append("adapter_contract_unreviewed")

    feature = payload.get("external_provider_feature", {})
    provider_enabled = feature.get("enabled") is True
    provider_deferred = (
        feature.get("enabled") is False
        and feature.get("reviewed") is True
        and feature.get("release_scope") == "initial_production_disabled"
        and feature.get("reason")
        and feature.get("reviewed_by")
        and feature.get("reviewed_at")
    )
    if not provider_enabled and not provider_deferred:
        blocked.append("provider_feature_state_unreviewed")

    if provider_enabled:
        sandbox = payload.get("sandbox_conformance", {})
        if not (
            sandbox.get("reviewed") is True
            and sandbox.get("report_uri")
            and SHA256.fullmatch(str(sandbox.get("report_sha256", "")))
            and sandbox.get("reviewed_by")
            and sandbox.get("reviewed_at")
        ):
            blocked.append("sandbox_conformance_unreviewed")

        credentials = payload.get("credential_provisioning", {})
        if credentials.get("secret_values_stored") is not False:
            blocked.append("credential_evidence_contains_secret")
        if not (
            credentials.get("provisioned_outside_repository") is True
            and credentials.get("static_indian_egress_provisioned") is True
            and credentials.get("provider_ip_allowlist_provisioned") is True
            and credentials.get("evidence_reference")
            and credentials.get("reviewed_by")
            and credentials.get("reviewed_at")
        ):
            blocked.append("provider_credentials_unprovisioned")

        route = payload.get("provider_route", {})
        if not (
            route.get("reviewed") is True
            and route.get("route_kind") == "authenticated_internal_worker_boundary"
            and route.get("authentication_contract") == "bearer_plus_raw_body_hmac_v1"
            and route.get("database_principal") == "erp_tax_provider"
            and route.get("evidence_reference")
            and route.get("reviewed_by")
            and route.get("reviewed_at")
        ):
            blocked.append("provider_route_unreviewed")

    applicability = payload.get("einvoice_applicability", {})
    if not (
        applicability.get("reviewed") is True
        and applicability.get("profile_contract_version")
        and applicability.get("rule_release_id")
        and applicability.get("reviewed_by")
        and applicability.get("reviewed_at")
    ):
        blocked.append("einvoice_applicability_unreviewed")
    return blocked


def main() -> int:
    payload = json.loads(EVIDENCE.read_text())
    unresolved = blockers(payload)
    if unresolved:
        print("tax provider operational readiness BLOCKED:")
        for item in unresolved:
            print(f"- {item}")
        return 1
    print("tax provider operational readiness evidence is complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
