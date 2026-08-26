#!/usr/bin/env python3
"""Verify exact-SHA public provenance while canonical database writes are fenced."""

from __future__ import annotations

import argparse

try:
    from scripts.verify_live18_deployment_sha import (
        PROVIDERS,
        serialize_evidence,
        verify_provenance,
    )
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    from verify_live18_deployment_sha import (  # type: ignore[no-redef]
        PROVIDERS,
        serialize_evidence,
        verify_provenance,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, choices=PROVIDERS)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--frontend-origin", required=True)
    parser.add_argument("--api-origin", required=True)
    parser.add_argument("--mcp-origin", required=True)
    args = parser.parse_args()
    evidence = verify_provenance(
        provider=args.provider,
        commit_sha=args.commit_sha,
        frontend_origin=args.frontend_origin,
        api_origin=args.api_origin,
        mcp_origin=args.mcp_origin,
    )
    print(serialize_evidence(evidence), end="")


if __name__ == "__main__":
    main()
