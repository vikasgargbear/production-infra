#!/usr/bin/env python3
"""Provision and exercise the disposable canonical staging organization.

This script is intentionally staging-only. Regulatory source data is fetched
from CBIC, while every organization, party, identifier, and transaction is
synthetic and isolated under one deterministic demo organization UUID.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from io import BytesIO
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

import jwt
import pdfplumber
import psycopg2
import requests


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SOURCE_URI = "https://gstcouncil.gov.in/sites/default/files/2024-09/02_2024_ctr_eng.pdf"
SOURCE_RETRIEVED_ON = date(2026, 8, 20)
SOURCE_PUBLICATION_DATE = date(2024, 7, 12)
SOURCE_EFFECTIVE_FROM = date(2024, 7, 15)
ADJUSTMENT_SOURCE_URI = (
    "https://gstcouncil.gov.in/sites/default/files/2024-02/faq-minin.pdf"
)
ADJUSTMENT_SOURCE_PUBLICATION_DATE = date(2017, 7, 1)
CLIENT_ID = "aasopharma-canonical-staging-demo-v2"

IDS = {
    "org": "d3000000-0000-7000-8000-000000000001",
    "reviewer_auth_user": "d3000000-0000-7000-8000-000000000002",
    "reviewer_user": "d3000000-0000-7000-8000-000000000003",
    "reviewer_membership": "d3000000-0000-7000-8000-000000000004",
    "branch": "d3000000-0000-7000-8000-000000000005",
    "role": "d3000000-0000-7000-8000-000000000006",
    "reviewer_access_grant": "d3000000-0000-7000-8000-000000000007",
    "safety_setting": "d3000000-0000-7000-8000-000000000008",
    "agent_grant": "d3000000-0000-7000-8000-000000000021",
    "legacy_approver_agent_grant": "d3000000-0000-7000-8000-000000000020",
    "operator_auth_user": "d3000000-0000-7000-8000-000000000022",
    "operator_user": "d3000000-0000-7000-8000-000000000023",
    "operator_membership": "d3000000-0000-7000-8000-000000000024",
    "operator_access_grant": "d3000000-0000-7000-8000-000000000025",
    "customer_party": "d3000000-0000-7000-8000-000000000010",
    "customer_account": "d3000000-0000-7000-8000-000000000011",
    "customer_address": "d3000000-0000-7000-8000-000000000012",
    "manufacturer_party": "d3000000-0000-7000-8000-000000000013",
    "receivable_account": "d3000000-0000-7000-8000-000000000014",
    "product": "d3000000-0000-7000-8000-000000000015",
    "uom_conversion": "d3000000-0000-7000-8000-000000000016",
    "count_uom_conversion": "d3000000-0000-7000-8000-000000000026",
    "sales_order_sequence": "d3000000-0000-7000-8000-000000000017",
    "customer_gstin": "d3000000-0000-7000-8000-000000000018",
    "request": "d3000000-0000-7000-8000-000000000019",
    "tax_release": "d3100000-0000-7000-8000-000000000001",
    "tax_version": "d3100000-0000-7000-8000-000000000002",
    "adjustment_rule_release": "d3100000-0000-7000-8000-000000000003",
    "sales_return_rule": "d3100000-0000-7000-8000-000000000004",
    "purchase_return_rule": "d3100000-0000-7000-8000-000000000005",
    "supplier_party": "d3200000-0000-7000-8000-000000000001",
    "supplier_account": "d3200000-0000-7000-8000-000000000002",
    "supplier_address": "d3200000-0000-7000-8000-000000000003",
    "supplier_gstin": "d3200000-0000-7000-8000-000000000004",
    "org_gst_registration": "d3200000-0000-7000-8000-000000000005",
    "saleable_location": "d3200000-0000-7000-8000-000000000006",
    "quarantine_location": "d3200000-0000-7000-8000-000000000007",
    "bank_account": "d3200000-0000-7000-8000-000000000008",
    "tax_profile_evidence": "d3200000-0000-7000-8000-000000000009",
    "fiscal_fact_evidence": "d3200000-0000-7000-8000-00000000000a",
    "fiscal_tax_fact": "d3200000-0000-7000-8000-00000000000b",
    "cycle_count_evidence": "d3200000-0000-7000-8000-00000000000c",
    "recipient_itc_evidence": "d3200000-0000-7000-8000-00000000000d",
    "bank_ledger": "d3210000-0000-7000-8000-000000000001",
    "payable_account": "d3210000-0000-7000-8000-000000000002",
    "inventory_account": "d3210000-0000-7000-8000-000000000003",
    "cogs_account": "d3210000-0000-7000-8000-000000000004",
    "sales_revenue_account": "d3210000-0000-7000-8000-000000000005",
    "supplier_prepayment_account": "d3210000-0000-7000-8000-000000000006",
    "input_cgst_account": "d3210000-0000-7000-8000-000000000007",
    "input_sgst_account": "d3210000-0000-7000-8000-000000000008",
    "input_igst_account": "d3210000-0000-7000-8000-000000000009",
    "input_cess_account": "d3210000-0000-7000-8000-00000000000a",
    "output_cgst_account": "d3210000-0000-7000-8000-00000000000b",
    "output_sgst_account": "d3210000-0000-7000-8000-00000000000c",
    "output_igst_account": "d3210000-0000-7000-8000-00000000000d",
    "output_cess_account": "d3210000-0000-7000-8000-00000000000e",
    "grni_account": "d3210000-0000-7000-8000-00000000000f",
    "purchase_return_variance_account": "d3210000-0000-7000-8000-000000000010",
    "inventory_count_gain_account": "d3210000-0000-7000-8000-000000000011",
    "rounding_gain_account": "d3210000-0000-7000-8000-000000000012",
    "rounding_loss_account": "d3210000-0000-7000-8000-000000000013",
}

REQUIRED_PERMISSIONS = (
    "sales.order.create",
    "sales.order.manage",
    "sales.dispatch.create",
    "sales.invoice.create",
    "sales.return.create",
    "procurement.order.manage",
    "procurement.receipt.post",
    "procurement.supplier_invoice.create",
    "procurement.purchase_return.create",
    "finance.customer_receipt.create",
    "finance.supplier_advance.create",
    "finance.supplier_payment.create",
    "inventory.adjustment.create",
    "catalog.product.manage",
    "automation.command.approve",
    "automation.command.execute",
    "automation.command.view",
    "internal.sequence.allocate",
)


PREPARE_CAPABILITIES = (
    ("sales.order.prepare", "actor_confirmation"),
    ("sales.dispatch.prepare", "actor_confirmation"),
    ("sales.invoice.prepare", "actor_confirmation"),
    ("sales.return.prepare", "separate_approver"),
    ("procurement.purchase_order.prepare", "actor_confirmation"),
    ("procurement.goods_receipt.prepare", "actor_confirmation"),
    ("procurement.supplier_invoice.prepare", "actor_confirmation"),
    ("procurement.purchase_return.prepare", "separate_approver"),
    ("finance.customer_receipt.prepare", "actor_confirmation"),
    ("finance.supplier_advance.prepare", "separate_approver"),
    ("finance.supplier_payment.prepare", "actor_confirmation"),
    ("inventory.adjustment.prepare", "separate_approver"),
)


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def demo_run_uuid(label: str) -> str:
    run_id = os.getenv("GITHUB_RUN_ID", "local")
    return str(uuid5(NAMESPACE_URL, f"aasopharma-canonical-demo:{run_id}:{label}"))


def assert_target() -> None:
    if required("CANONICAL_DEMO_WRITE_ACK") != "PROVISION_DISPOSABLE_DEMO":
        raise RuntimeError("canonical demo write acknowledgement is absent")
    project_ref = required("CANONICAL_STAGING_PROJECT_REF")
    if project_ref != PROJECT_REF:
        raise RuntimeError("refusing a project other than the reviewed free staging project")
    production_refs = {
        item.strip()
        for item in required("CANONICAL_PRODUCTION_PROJECT_REFS").split(",")
        if item.strip()
    }
    if project_ref in production_refs:
        raise RuntimeError("refusing to provision demo data in a production project")


def fetch_official_source(evidence_dir: Path) -> bytes:
    response = requests.get(
        SOURCE_URI,
        timeout=60,
        headers={"User-Agent": "AasoPharma canonical staging evidence/1.0"},
    )
    response.raise_for_status()
    source = response.content
    if not 10_000 <= len(source) <= 100 * 1024 * 1024:
        raise RuntimeError("CBIC rate source has an unexpected size")
    if not source.startswith(b"%PDF"):
        raise RuntimeError("GST Council source is not a PDF")
    with pdfplumber.open(BytesIO(source)) as document:
        text = re.sub(r"\s+", " ", " ".join(page.extract_text() or "" for page in document.pages))
    required_fragments = (
        "Notification No. 02/2024-Central Tax (Rate)",
        "4819 10",
        "4819 20",
        "Cartons, boxes and cases",
        "15th day of July, 2024",
    )
    if any(fragment.lower() not in text.lower() for fragment in required_fragments):
        raise RuntimeError("GST Council notification lacks the reviewed HSN 4819 rate evidence")
    path = evidence_dir / "gst-council-notification-02-2024.pdf"
    path.write_bytes(source)
    return source


def fetch_adjustment_source(evidence_dir: Path) -> bytes:
    """Fetch the official GST Council return-of-goods and ITC evidence FAQ."""

    response = requests.get(
        ADJUSTMENT_SOURCE_URI,
        timeout=60,
        headers={"User-Agent": "AasoPharma canonical staging evidence/1.0"},
    )
    response.raise_for_status()
    source = response.content
    if not 10_000 <= len(source) <= 100 * 1024 * 1024 or not source.startswith(b"%PDF"):
        raise RuntimeError("GST Council return authority has an unexpected envelope")
    with pdfplumber.open(BytesIO(source)) as document:
        text = re.sub(
            r"\s+", " ", " ".join(page.extract_text() or "" for page in document.pages)
        )
    required_fragments = (
        "Section 34(1)",
        "return of goods on which GST was paid",
        "may issue a credit note for the full value",
        "has reversed his ITC",
    )
    if any(fragment.casefold() not in text.casefold() for fragment in required_fragments):
        raise RuntimeError("GST Council return authority lacks reviewed Section 34 fragments")
    (evidence_dir / "gst-council-return-of-goods-faq.pdf").write_bytes(source)
    return source


def bootstrap_identity(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO auth.users (id) VALUES (%s), (%s) ON CONFLICT (id) DO NOTHING",
            (IDS["reviewer_auth_user"], IDS["operator_auth_user"]),
        )
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        cursor.execute("SELECT set_config('app.org_id', %s, true)", (IDS["org"],))
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            INSERT INTO core.organizations (
                id, legal_name, trade_name, pan, registered_address_line1,
                registered_city, registered_state_code, registered_postal_code,
                status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, 'AasoPharma Disposable Demo Private Limited',
                'AasoPharma Demo', 'ABCDE1234F', '101 Demo Market Road',
                'Mumbai', '27', '400001', 'active', %s, %s
            ) ON CONFLICT (id) DO NOTHING
            """,
            (IDS["org"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Independent Approver', 'active')
            ON CONFLICT (id) DO NOTHING
            """,
            (IDS["reviewer_user"], IDS["reviewer_auth_user"]),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Business Operator', 'active')
            ON CONFLICT (id) DO NOTHING
            """,
            (IDS["operator_user"], IDS["operator_auth_user"]),
        )
        cursor.execute(
            """
            INSERT INTO core.memberships (
                org_id, id, user_id, status, joined_at,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, 'active', transaction_timestamp(), %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["reviewer_membership"], IDS["reviewer_user"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            "SELECT set_config('app.membership_id', %s, true)",
            (IDS["reviewer_membership"],),
        )
        cursor.execute(
            "SELECT set_config('app.user_id', %s, true)", (IDS["reviewer_user"],)
        )
        cursor.execute(
            "SELECT set_config('app.auth_user_id', %s, true)", (IDS["reviewer_auth_user"],)
        )
        cursor.execute(
            """
            INSERT INTO core.memberships (
                org_id, id, user_id, status, joined_at,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, 'active', transaction_timestamp(), %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["operator_membership"], IDS["operator_user"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.branches (
                org_id, id, code, name, address_line1, city, state_code,
                postal_code, status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'MUM-DEMO', 'Mumbai Demo Branch', '101 Demo Market Road',
                'Mumbai', '27', '400001', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["branch"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO core.roles (
                org_id, id, code, name, description, is_system, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'demo_operator', 'Demo operator',
                'Staging-only role for disposable canonical business journeys',
                false, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["role"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            "SELECT code FROM core.permissions WHERE code = ANY(%s) AND status='active'",
            (list(REQUIRED_PERMISSIONS),),
        )
        found = {row[0] for row in cursor.fetchall()}
        if found != set(REQUIRED_PERMISSIONS):
            raise RuntimeError(f"canonical permissions are missing: {set(REQUIRED_PERMISSIONS) - found}")
        cursor.execute("SELECT code FROM core.permissions WHERE status='active' ORDER BY code")
        demo_permissions = [row[0] for row in cursor.fetchall()]
        cursor.executemany(
            """
            INSERT INTO core.role_permissions (
                org_id, role_id, permission_code, created_by_membership_id
            ) VALUES (%s, %s, %s, %s)
            ON CONFLICT (org_id, role_id, permission_code) DO NOTHING
            """,
            [
                (IDS["org"], IDS["role"], permission, IDS["reviewer_membership"])
                for permission in demo_permissions
            ],
        )
        cursor.execute(
            """
            INSERT INTO core.access_grants (
                org_id, id, membership_id, role_id, scope_kind, branch_id,
                valid_from_at, expires_at, status, created_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'organization', NULL,
                transaction_timestamp(), transaction_timestamp() + interval '30 days',
                'active', %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["reviewer_access_grant"], IDS["reviewer_membership"],
                IDS["role"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.access_grants (
                org_id, id, membership_id, role_id, scope_kind, branch_id,
                valid_from_at, expires_at, status, created_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'organization', NULL,
                transaction_timestamp(), transaction_timestamp() + interval '30 days',
                'active', %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["operator_access_grant"],
                IDS["operator_membership"], IDS["role"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.settings (
                org_id, id, scope_kind, branch_id, namespace, key,
                value_type, value_boolean, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'organization', NULL, 'test_safety',
                'disposable_live_write_target', 'boolean', true, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["safety_setting"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grants (
                org_id, id, subject_membership_id, client_id, client_display_name,
                branch_id, authorization_mode, consent_version, consent_text_hash,
                consented_by_membership_id, consented_at, granted_by_membership_id,
                granted_at, expires_at, status, created_by_membership_id,
                updated_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'Canonical staging demo runner', NULL,
                'self_consent', 'demo-v2',
                extensions.digest('canonical staging demo consent; INR 1000000 maximum','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["agent_grant"], IDS["operator_membership"], CLIENT_ID,
                IDS["operator_membership"], IDS["operator_membership"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grants (
                org_id, id, subject_membership_id, client_id, client_display_name,
                branch_id, authorization_mode, consent_version, consent_text_hash,
                consented_by_membership_id, consented_at, granted_by_membership_id,
                granted_at, expires_at, status, created_by_membership_id,
                updated_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'Canonical staging independent approver', NULL,
                'self_consent', 'demo-v2-approver',
                extensions.digest('canonical staging independent approval consent','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["legacy_approver_agent_grant"],
                IDS["reviewer_membership"], CLIENT_ID,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        capabilities = tuple(
            (
                capability, "write", "consequential_write", approval,
                "1000000.00", "INR",
            )
            for capability, approval in PREPARE_CAPABILITIES
        ) + (
            (
                "automation.command.approve", "write", "consequential_write",
                "actor_confirmation", None, None,
            ),
            (
                "automation.command.execute", "write", "consequential_write",
                "actor_confirmation", None, None,
            ),
            (
                "automation.command.status.get", "read", "read_only", "none",
                None, None,
            ),
        )
        cursor.executemany(
            """
            INSERT INTO automation.agent_grant_capabilities (
                org_id, agent_grant_id, capability_code, operation_mode,
                risk_class, approval_policy, maximum_amount, currency_code,
                allow_sensitive_read, status,
                created_by_membership_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, false, 'active', %s)
            ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
            """,
            [
                (IDS["org"], IDS["agent_grant"], *capability, IDS["reviewer_membership"])
                for capability in capabilities
            ],
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grant_capabilities (
                org_id, agent_grant_id, capability_code, operation_mode,
                risk_class, approval_policy, maximum_amount, currency_code,
                allow_sensitive_read, status, created_by_membership_id
            ) VALUES (
                %s,%s,'automation.command.approve','write','consequential_write',
                'actor_confirmation',NULL,NULL,false,'active',%s
            ) ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
            """,
            (
                IDS["org"], IDS["legacy_approver_agent_grant"],
                IDS["reviewer_membership"],
            ),
        )


def canonical_dataset_bytes(connection) -> bytes:
    dataset = [
        {
            "id": IDS["tax_version"],
            "code": "481910",
            "code_kind": "hsn",
            "version_number": "1",
            "description": "Cartons, boxes and cases of corrugated paper or paper board (demo subset)",
            "effective_from": SOURCE_EFFECTIVE_FROM.isoformat(),
            "effective_to": "",
            "taxability": "taxable",
            "default_supply_type": "goods",
            "cgst_rate": "6",
            "sgst_rate": "6",
            "igst_rate": "12",
            "cess_rate": "0",
        }
    ]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        return cursor.fetchone()[0].encode("utf-8")


def demo_tax_release_exists(connection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM core.reference_data_releases WHERE id=%s",
            (IDS["tax_release"],),
        )
        if cursor.fetchone() is None:
            return False
        cursor.execute(
            """
            SELECT count(*) FROM tax.tax_code_versions
             WHERE id=%s AND release_id=%s AND code='481910'
               AND cgst_rate=6 AND sgst_rate=6 AND igst_rate=12 AND cess_rate=0
               AND status='active'
            """,
            (IDS["tax_version"], IDS["tax_release"]),
        )
        if cursor.fetchone() != (1,):
            raise RuntimeError("existing demo tax release differs from the reviewed fixture")
        return True


def import_tax_release(connection, source: bytes, dataset_bytes: bytes) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_tax_release(
                %s, %s, 'gst_council', %s, 'github-actions-artifact', %s, 'application/pdf',
                %s, %s, 'github-actions-artifact', %s, %s, %s,
                %s, %s, NULL, %s, transaction_timestamp(), %s
            )
            """,
            (
                IDS["tax_release"],
                "demo-gst-council-notification-02-2024",
                SOURCE_URI,
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-council-notification-02-2024.pdf",
                psycopg2.Binary(source),
                psycopg2.Binary(hashlib.sha256(source).digest()),
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/hsn-481910-demo.json",
                psycopg2.Binary(dataset_bytes),
                psycopg2.Binary(hashlib.sha256(dataset_bytes).digest()),
                SOURCE_PUBLICATION_DATE,
                SOURCE_EFFECTIVE_FROM,
                IDS["reviewer_user"],
                IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["tax_release"],):
            raise RuntimeError("regulatory importer returned an unexpected release")


def adjustment_dataset_bytes(connection) -> bytes:
    dataset = [
        {
            "id": IDS["sales_return_rule"],
            "rule_code": "DEMO_SECTION_34_CUSTOMER_REJECTION",
            "rule_version": "2026-08-20-demo",
            "side": "sales",
            "direction": "credit",
            "document_effect": "decrease",
            "reason_code": "customer_rejection",
            "deadline_policy": "none",
            "deadline_days": "",
            "portal_evidence_required": False,
            "tax_effect": "statutory",
            "effective_from": SOURCE_RETRIEVED_ON.isoformat(),
            "effective_to": SOURCE_RETRIEVED_ON.isoformat(),
        },
        {
            "id": IDS["purchase_return_rule"],
            "rule_code": "DEMO_SECTION_34_WRONG_SUPPLY",
            "rule_version": "2026-08-20-demo",
            "side": "purchase",
            "direction": "debit",
            "document_effect": "decrease",
            "reason_code": "wrong_supply",
            "deadline_policy": "none",
            "deadline_days": "",
            "portal_evidence_required": True,
            "tax_effect": "statutory",
            "effective_from": SOURCE_RETRIEVED_ON.isoformat(),
            "effective_to": SOURCE_RETRIEVED_ON.isoformat(),
        },
    ]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        return cursor.fetchone()[0].encode("utf-8")


def demo_adjustment_release_exists(connection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT count(*)
              FROM tax.gst_adjustment_rule_versions
             WHERE release_id=%s AND id IN (%s,%s) AND status='active'
            """,
            (
                IDS["adjustment_rule_release"],
                IDS["sales_return_rule"],
                IDS["purchase_return_rule"],
            ),
        )
        count = cursor.fetchone()[0]
        if count not in (0, 2):
            raise RuntimeError("demo GST adjustment release is only partially present")
        return count == 2


def import_adjustment_release(
    connection, source: bytes, dataset_bytes: bytes
) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_gst_adjustment_rule_release(
                %s,%s,'gst_council',%s,'github-actions-artifact',%s,
                'application/pdf',%s,%s,'github-actions-artifact',%s,%s,%s,
                %s,%s,%s,%s,transaction_timestamp(),%s
            )
            """,
            (
                IDS["adjustment_rule_release"],
                "demo-gst-return-of-goods-section-34",
                ADJUSTMENT_SOURCE_URI,
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-return-faq.pdf",
                psycopg2.Binary(source),
                psycopg2.Binary(hashlib.sha256(source).digest()),
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-adjustment-rules.json",
                psycopg2.Binary(dataset_bytes),
                psycopg2.Binary(hashlib.sha256(dataset_bytes).digest()),
                ADJUSTMENT_SOURCE_PUBLICATION_DATE,
                SOURCE_RETRIEVED_ON,
                SOURCE_RETRIEVED_ON,
                IDS["reviewer_user"],
                IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["adjustment_rule_release"],):
            raise RuntimeError("GST adjustment importer returned an unexpected release")


def seed_business_master(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO finance.accounts (
                org_id, id, code, name, account_type, currency_code,
                allows_party_posting, allows_bank_reconciliation, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, '1100-DEMO-AR', 'Demo trade receivables', 'asset', 'INR',
                true, false, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["receivable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        parties = (
            (IDS["customer_party"], "Demo Retail Customer Private Limited", "DEMOA1234B"),
            (IDS["manufacturer_party"], "Demo Paper Products Private Limited", "DEMOB1234C"),
        )
        cursor.executemany(
            """
            INSERT INTO parties.parties (
                org_id, id, party_kind, legal_name, pan, tax_residency_status,
                tax_person_type, pan_verification_status, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'organization', %s, %s, 'resident', 'company',
                'unverified', 'draft', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (IDS["org"], party_id, name, pan, IDS["reviewer_membership"], IDS["reviewer_membership"])
                for party_id, name, pan in parties
            ],
        )
        cursor.executemany(
            """
            UPDATE parties.parties
               SET status='active', row_version=row_version+1,
                   updated_by_membership_id=%s
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            [
                (IDS["reviewer_membership"], IDS["org"], party_id)
                for party_id, _name, _pan in parties
            ],
        )
        cursor.execute(
            """
            INSERT INTO parties.addresses (
                org_id, id, party_id, address_kind, line1, city, state_code,
                postal_code, country_code, is_primary, valid_from, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'billing', '202 Synthetic Retail Lane', 'Mumbai',
                '27', '400002', 'IN', true, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_address"], IDS["customer_party"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.tax_registrations (
                org_id, id, party_id, registration_type, registration_number,
                registered_legal_name, state_code, taxpayer_type, valid_from,
                verified_at, status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'GSTIN', '27ABCDE1234F1Z5',
                'Demo Retail Customer Private Limited', '27', 'regular', %s,
                transaction_timestamp(), 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_gstin"], IDS["customer_party"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.customer_accounts (
                org_id, id, party_id, customer_code, credit_limit, credit_days,
                default_receivable_account_id, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'CUST-DEMO-001', 1000000, 30, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_account"], IDS["customer_party"],
                IDS["receivable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.units_of_measure (
                code,name,symbol,dimension,decimal_places,status
            ) VALUES ('PK','Pack','pk','count',3,'active')
            ON CONFLICT (code) DO NOTHING
            """
        )
        cursor.execute(
            "SELECT count(*) FROM catalog.units_of_measure "
            "WHERE code IN ('EA','PK') AND status='active'"
        )
        if cursor.fetchone() != (2,):
            raise RuntimeError("canonical EA and PK units of measure are unavailable")
        cursor.execute(
            """
            INSERT INTO catalog.products (
                org_id, id, sku, product_kind, name, generic_name,
                manufacturer_party_id, base_uom_code, hsn_code,
                cold_chain_required, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'DEMO-CARTON-481910', 'consumable',
                'Synthetic Corrugated Pharmacy Packing Carton', 'Paperboard carton',
                %s, 'EA', '481910', false, 'draft', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["product"], IDS["manufacturer_party"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.uom_conversions (
                org_id, id, product_id, from_uom_code, to_uom_code,
                multiplier, valid_from, status, created_by_membership_id
            ) VALUES (%s, %s, %s, 'EA', 'EA', 1, %s, 'active', %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["uom_conversion"], IDS["product"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.uom_conversions (
                org_id, id, product_id, from_uom_code, to_uom_code,
                multiplier, valid_from, status, created_by_membership_id
            ) VALUES (%s, %s, %s, 'PK', 'EA', 10, %s, 'active', %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["count_uom_conversion"], IDS["product"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.document_sequences (
                org_id, id, branch_id, document_type, fiscal_year_start,
                prefix, suffix, padding, next_value, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'sales_order', DATE '2026-04-01',
                'DEMO-SO-', '', 6, 1, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["sales_order_sequence"], IDS["branch"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )


def seed_end_to_end_master(connection) -> None:
    """Add the synthetic supplier, tax, inventory, banking, and ledger facts."""

    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))

        attachments = (
            (IDS["tax_profile_evidence"], "supplier_tax_profile", "supplier-pan-verification.json"),
            (IDS["fiscal_fact_evidence"], "organization_fiscal_tax_profile", "fy-2026-tax-facts.json"),
            (IDS["cycle_count_evidence"], "inventory_cycle_count_sheet", "cycle-count-sheet.json"),
            (IDS["recipient_itc_evidence"], "recipient_itc_reversal", "recipient-itc-reversal.json"),
        )
        cursor.executemany(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,%s,'application/json',128,
                extensions.digest(%s,'sha256'),%s,%s,%s,'retained',
                transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (
                    IDS["org"], attachment_id, f"demo/{filename}", filename,
                    f"canonical-demo:{evidence_kind}", evidence_kind,
                    SOURCE_RETRIEVED_ON, date(2034, 8, 20), IDS["reviewer_membership"],
                )
                for attachment_id, evidence_kind, filename in attachments
            ],
        )

        cursor.execute(
            """
            INSERT INTO parties.parties (
                org_id,id,party_kind,legal_name,trade_name,pan,
                tax_residency_status,tax_person_type,pan_verification_status,
                tax_profile_evidence_attachment_id,tax_profile_verified_at,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,'organization','Synthetic Medicines Distributor Private Limited',
                'Synthetic Medicines Distributor','DEMOC5678D','resident','company',
                'verified',%s,transaction_timestamp(),'draft',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_party"], IDS["tax_profile_evidence"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            UPDATE parties.parties
               SET status='active',row_version=row_version+1,
                   updated_by_membership_id=%s
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            (IDS["reviewer_membership"], IDS["org"], IDS["supplier_party"]),
        )
        cursor.execute(
            """
            INSERT INTO parties.addresses (
                org_id,id,party_id,address_kind,line1,city,state_code,postal_code,
                country_code,is_primary,valid_from,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'shipping','88 Synthetic Wholesale Avenue','Mumbai','27',
                '400003','IN',true,%s,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_address"], IDS["supplier_party"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.tax_registrations (
                org_id,id,party_id,registration_type,registration_number,
                registered_legal_name,state_code,taxpayer_type,valid_from,
                verified_at,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'GSTIN','27DEMOC5678D1Z5',
                'Synthetic Medicines Distributor Private Limited','27','regular',%s,
                transaction_timestamp(),'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_gstin"], IDS["supplier_party"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )

        account_rows = (
            (IDS["bank_ledger"], "1000-DEMO-BANK", "Demo current bank", "asset", False, True),
            (IDS["payable_account"], "2100-DEMO-AP", "Demo trade payables", "liability", True, False),
            (IDS["inventory_account"], "1200-DEMO-INV", "Demo inventory asset", "asset", False, False),
            (IDS["cogs_account"], "5100-DEMO-COGS", "Demo cost of goods sold", "expense", False, False),
            (IDS["sales_revenue_account"], "4100-DEMO-REV", "Demo sales revenue", "income", False, False),
            (IDS["supplier_prepayment_account"], "1300-DEMO-PREPAY", "Demo supplier prepayments", "asset", True, False),
            (IDS["input_cgst_account"], "1401-DEMO-ICGST", "Demo input CGST", "asset", False, False),
            (IDS["input_sgst_account"], "1402-DEMO-ISGST", "Demo input SGST", "asset", False, False),
            (IDS["input_igst_account"], "1403-DEMO-IIGST", "Demo input IGST", "asset", False, False),
            (IDS["input_cess_account"], "1404-DEMO-ICESS", "Demo input cess", "asset", False, False),
            (IDS["output_cgst_account"], "2201-DEMO-OCGST", "Demo output CGST", "liability", False, False),
            (IDS["output_sgst_account"], "2202-DEMO-OSGST", "Demo output SGST", "liability", False, False),
            (IDS["output_igst_account"], "2203-DEMO-OIGST", "Demo output IGST", "liability", False, False),
            (IDS["output_cess_account"], "2204-DEMO-OCESS", "Demo output cess", "liability", False, False),
            (IDS["grni_account"], "2300-DEMO-GRNI", "Demo goods received not invoiced", "liability", False, False),
            (IDS["purchase_return_variance_account"], "5200-DEMO-PRV", "Demo purchase return inventory variance", "expense", False, False),
            (IDS["inventory_count_gain_account"], "4200-DEMO-ICG", "Demo inventory count gain", "income", False, False),
            (IDS["rounding_gain_account"], "4900-DEMO-RG", "Demo rounding gain", "income", False, False),
            (IDS["rounding_loss_account"], "5900-DEMO-RL", "Demo rounding loss", "expense", False, False),
        )
        cursor.executemany(
            """
            INSERT INTO finance.accounts (
                org_id,id,code,name,account_type,currency_code,
                allows_party_posting,allows_bank_reconciliation,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,%s,'INR',%s,%s,'active',%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (IDS["org"], *row, IDS["reviewer_membership"], IDS["reviewer_membership"])
                for row in account_rows
            ],
        )
        cursor.execute(
            """
            INSERT INTO parties.supplier_accounts (
                org_id,id,party_id,supplier_code,payment_days,
                default_payable_account_id,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,'SUP-DEMO-001',30,%s,'active',%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_account"], IDS["supplier_party"],
                IDS["payable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO finance.bank_accounts (
                org_id,id,account_id,bank_name,account_holder_name,
                account_number_ciphertext,account_number_hash,ifsc,currency_code,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'Demo Bank','AasoPharma Disposable Demo Private Limited',
                convert_to('encrypted-demo-bank-account','UTF8'),
                extensions.digest('demo-bank-account','sha256'),'HDFC0000001','INR','active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["bank_account"], IDS["bank_ledger"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )

        role_accounts = {
            "accounts_receivable": IDS["receivable_account"],
            "accounts_payable": IDS["payable_account"],
            "sales_revenue": IDS["sales_revenue_account"],
            "supplier_prepayment": IDS["supplier_prepayment_account"],
            "input_cgst": IDS["input_cgst_account"],
            "input_sgst": IDS["input_sgst_account"],
            "input_igst": IDS["input_igst_account"],
            "input_cess": IDS["input_cess_account"],
            "output_cgst": IDS["output_cgst_account"],
            "output_sgst": IDS["output_sgst_account"],
            "output_igst": IDS["output_igst_account"],
            "output_cess": IDS["output_cess_account"],
            "goods_received_not_invoiced": IDS["grni_account"],
            "purchase_return_inventory_variance": IDS["purchase_return_variance_account"],
            "inventory_asset": IDS["inventory_account"],
            "inventory_count_gain": IDS["inventory_count_gain_account"],
            "cost_of_goods_sold": IDS["cogs_account"],
            "rounding_gain": IDS["rounding_gain_account"],
            "rounding_loss": IDS["rounding_loss_account"],
        }
        cursor.executemany(
            """
            INSERT INTO core.settings (
                org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,
                status,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,'organization',NULL,'finance.account_roles',%s,'text',%s,
                'active',%s,%s)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    IDS["org"],
                    str(uuid5(NAMESPACE_URL, f"aasopharma-demo-account-role:{role}")),
                    role, account_id, IDS["reviewer_membership"], IDS["reviewer_membership"],
                )
                for role, account_id in sorted(role_accounts.items())
            ],
        )

        cursor.execute(
            """
            INSERT INTO tax.registrations (
                org_id,id,gstin,legal_name,trade_name,state_code,registration_type,
                effective_from,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,'27ABCDE1234F1Z5','AasoPharma Disposable Demo Private Limited',
                'AasoPharma Demo','27','regular',%s,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["org_gst_registration"], SOURCE_RETRIEVED_ON,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.registration_branches (
                org_id,registration_id,branch_id,place_of_business_kind,
                effective_from,status,created_by_membership_id
            ) VALUES (%s,%s,%s,'principal',%s,'active',%s)
            ON CONFLICT (org_id,registration_id,branch_id,effective_from) DO NOTHING
            """,
            (
                IDS["org"], IDS["org_gst_registration"], IDS["branch"],
                SOURCE_RETRIEVED_ON, IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO inventory.locations (
                org_id,id,branch_id,code,name,location_type,status,allows_sale,
                allows_negative_stock,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,%s,%s,'active',%s,false,%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (IDS["org"], IDS["saleable_location"], IDS["branch"], "SALE-DEMO", "Demo saleable stock", "saleable", True, IDS["reviewer_membership"], IDS["reviewer_membership"]),
                (IDS["org"], IDS["quarantine_location"], IDS["branch"], "QUAR-DEMO", "Demo returned quarantine", "quarantine", False, IDS["reviewer_membership"], IDS["reviewer_membership"]),
            ],
        )
        sequence_types = {
            "sales_dispatch": "DEMO-SD-",
            "sales_invoice": "DEMO-SI-",
            "sales_return": "DEMO-SR-",
            "purchase_order": "DEMO-PO-",
            "goods_receipt": "DEMO-GRN-",
            "purchase_return": "DEMO-PR-",
            "supplier_payment": "DEMO-SP-",
            "supplier_advance": "DEMO-SA-",
            "customer_receipt": "DEMO-CR-",
            "journal_entry": "DEMO-JE-",
            "stock_count": "DEMO-SC-",
        }
        cursor.executemany(
            """
            INSERT INTO core.document_sequences (
                org_id,id,branch_id,document_type,fiscal_year_start,prefix,suffix,
                padding,next_value,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,DATE '2026-04-01',%s,'',6,1,'active',%s,%s)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    IDS["org"],
                    str(uuid5(NAMESPACE_URL, f"aasopharma-demo-sequence:{document_type}")),
                    IDS["branch"], document_type, prefix,
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                )
                for document_type, prefix in sorted(sequence_types.items())
            ],
        )


def verify_fiscal_tax_fact(connection) -> None:
    """Create the fiscal fact through its maker-checker command boundary."""

    key_bytes = b"canonical-demo-fiscal-tax-fact-v1"
    request_bytes = json.dumps(
        {
            "fact_id": IDS["fiscal_tax_fact"],
            "fiscal_year_start_year": 2026,
            "organization_person_type": "company",
            "prior_fiscal_year_turnover": "50000000.00",
            "gst_tds_notified_deductor": False,
            "evidence_attachment_id": IDS["fiscal_fact_evidence"],
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["operator_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT erp_compliance_commands.verify_organization_fiscal_tax_fact(
                %s::uuid,%s::uuid,%s::uuid,2026::smallint,'company'::varchar,
                50000000::numeric,false,NULL::varchar,%s::uuid,%s::bytea,%s::bytea,
                transaction_timestamp() + interval '30 minutes'
            )
            """,
            (
                IDS["org"], IDS["fiscal_tax_fact"], IDS["operator_membership"],
                IDS["fiscal_fact_evidence"],
                psycopg2.Binary(hashlib.sha256(key_bytes).digest()),
                psycopg2.Binary(hashlib.sha256(request_bytes).digest()),
            ),
        )
        if cursor.fetchone() != (IDS["fiscal_tax_fact"],):
            raise RuntimeError("fiscal tax fact verification returned an unexpected resource")


def activate_demo_product(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute("SELECT status, row_version FROM catalog.products WHERE org_id=%s AND id=%s FOR UPDATE", (IDS["org"], IDS["product"]))
        status, row_version = cursor.fetchone()
        if status == "active":
            return
        if status != "draft":
            raise RuntimeError("demo product is not in an activatable state")
        cursor.execute(
            "SELECT erp_regulatory_commands.activate_product(%s, %s, %s, NULL, %s, transaction_timestamp() + interval '15 minutes')",
            (
                IDS["org"],
                IDS["product"],
                row_version,
                psycopg2.Binary(hashlib.sha256(b"demo-product-activation-v1").digest()),
            ),
        )
        if cursor.fetchone() != (IDS["product"],):
            raise RuntimeError("demo product activation returned an unexpected product")


def token(
    operation: str,
    permission: str,
    *,
    command_id: str | None = None,
    approver: bool = False,
) -> str:
    now = datetime.now(timezone.utc)
    auth_user_id = IDS["reviewer_auth_user"] if approver else IDS["operator_auth_user"]
    user_id = IDS["reviewer_user"] if approver else IDS["operator_user"]
    membership_id = IDS["reviewer_membership"] if approver else IDS["operator_membership"]
    agent_grant_id = IDS["legacy_approver_agent_grant"] if approver else IDS["agent_grant"]
    claims: dict[str, Any] = {
        "operator_delegated": True,
        "token_profile": "canonical_operator_delegation_v1",
        "operator_operation": operation,
        "operator_permission": permission,
        "operator_organization_scope": True,
        "mcp_client_id": CLIENT_ID,
        "branch_ids": [IDS["branch"]],
        "auth_user_id": auth_user_id,
        "user_id": user_id,
        "org_id": IDS["org"],
        "membership_id": membership_id,
        "agent_grant_id": agent_grant_id,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "sub": auth_user_id,
        "iss": "aasopharma-api",
        "aud": "aasopharma-api",
        "token_use": "access",
    }
    if command_id:
        claims["operator_command_request_id"] = command_id
    return jwt.encode(claims, required("JWT_SECRET_KEY"), algorithm="HS256")


def api_call(
    method: str,
    path: str,
    operation: str,
    permission: str,
    payload=None,
    command_id=None,
    *,
    approver: bool = False,
):
    response = requests.request(
        method,
        required("CANONICAL_DEMO_API_URL").rstrip("/") + path,
        timeout=90,
        headers={
            "Authorization": f"Bearer {required('MCP_INTERNAL_SERVICE_TOKEN')}",
            "X-MCP-Delegated-Authorization": f"Bearer {token(operation, permission, command_id=command_id, approver=approver)}",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    if not response.ok:
        raise RuntimeError(f"canonical demo API failed ({response.status_code}): {response.text[:1200]}")
    body = response.json()
    if not isinstance(body, dict):
        raise RuntimeError("canonical demo API returned a non-object")
    return body


def action_context(operation: str, permission: str):
    from app.domain.operator_actions.models import ActionContext

    return ActionContext(
        auth_user_id=UUID(IDS["operator_auth_user"]),
        user_id=UUID(IDS["operator_user"]),
        organization_id=UUID(IDS["org"]),
        membership_id=UUID(IDS["operator_membership"]),
        agent_grant_id=UUID(IDS["agent_grant"]),
        client_id=CLIENT_ID,
        operation_key=operation,
        permission=permission,
        branch_ids=(UUID(IDS["branch"]),),
        organization_scope=True,
    )


def preflight_action(operation: str, payload: dict[str, Any]) -> None:
    """Exercise the exact service transaction and roll back every write."""

    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.domain.operator_actions.contract import ACTION_POLICIES
    from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService

    runtime_engine = create_engine(required("ERP_RUNTIME_DATABASE_URL"), pool_pre_ping=True)
    calculator_engine = create_engine(required("ERP_CALCULATOR_DATABASE_URL"), pool_pre_ping=True)
    runtime_connection = runtime_engine.connect()
    calculator_connection = calculator_engine.connect()
    runtime_transaction = runtime_connection.begin()
    calculator_transaction = calculator_connection.begin()
    try:
        service = SqlAlchemyOperatorActionService(
            session_factory=lambda: Session(
                bind=runtime_connection, join_transaction_mode="create_savepoint"
            ),
            calculator_factory=lambda: Session(
                bind=calculator_connection, join_transaction_mode="create_savepoint"
            ),
            runtime_principal_configured=True,
        )
        policy = ACTION_POLICIES[operation]
        prepared = service.prepare(
            policy=policy,
            payload={key: value for key, value in payload.items() if key != "idempotency_key"},
            idempotency_key=payload["idempotency_key"],
            context=action_context(operation, policy.permission),
        )
        if prepared.command_request_id is None or not prepared.preview_hash.startswith("sha256:"):
            raise RuntimeError(f"{operation} rollback preflight returned invalid evidence")
    finally:
        calculator_transaction.rollback()
        runtime_transaction.rollback()
        calculator_connection.close()
        runtime_connection.close()
        calculator_engine.dispose()
        runtime_engine.dispose()
    print(f"canonical demo {operation} rollback preflight passed")


def exercise_action(
    evidence_dir: Path,
    operation: str,
    permission: str,
    payload: dict[str, Any],
    *,
    separate_approver: bool = False,
) -> dict[str, Any]:
    prepared = api_call(
        "POST", f"/api/internal/mcp/actions/{operation}/prepare",
        operation, permission, payload,
    )
    command_id = str(prepared["command_request_id"])
    preview_hash = str(prepared["preview_hash"])
    approved = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/approve",
        "automation.command.approve", "automation.command.approve",
        {
            "preview_hash": preview_hash,
            "approval_intent": "approve",
            "idempotency_key": f"demo-approve-{operation}-{os.getenv('GITHUB_RUN_ID', 'local')}",
        },
        command_id,
        approver=separate_approver,
    )
    executed = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {
            "preview_hash": preview_hash,
            "idempotency_key": f"demo-execute-{operation}-{os.getenv('GITHUB_RUN_ID', 'local')}",
        }, command_id,
    )
    evidence = {
        "payload": payload,
        "prepared": prepared,
        "approved": approved,
        "executed": executed,
    }
    evidence_name = operation.replace(".", "-")
    (evidence_dir / f"canonical-demo-{evidence_name}.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return evidence


def assert_unavailable_actions(connection) -> dict[str, Any]:
    """Prove the two intentionally blocked actions reject before persistence."""

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            "SELECT count(*) FROM automation.command_requests WHERE org_id=%s",
            (IDS["org"],),
        )
        before = cursor.fetchone()[0]

    rejected: dict[str, int] = {}
    for operation, permission in (
        ("inventory.transfer.prepare", "inventory.transfer.create"),
        ("inventory.destruction.prepare", "inventory.destruction.create"),
    ):
        response = requests.post(
            required("CANONICAL_DEMO_API_URL").rstrip("/")
            + f"/api/internal/mcp/actions/{operation}/prepare",
            timeout=30,
            headers={
                "Authorization": f"Bearer {required('MCP_INTERNAL_SERVICE_TOKEN')}",
                "X-MCP-Delegated-Authorization": (
                    f"Bearer {token(operation, permission)}"
                ),
                "Content-Type": "application/json",
            },
            json={},
        )
        if response.status_code != 409 or "COMMAND_ADAPTER_UNAVAILABLE" not in response.text:
            raise RuntimeError(
                f"{operation} did not fail closed at its unavailable adapter boundary"
            )
        rejected[operation] = response.status_code

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM automation.command_requests WHERE org_id=%s",
            (IDS["org"],),
        )
        after = cursor.fetchone()[0]
    if after != before:
        raise RuntimeError("unavailable action probes persisted a command request")
    return {
        "command_count_before": before,
        "command_count_after": after,
        "rejected_http_statuses": rejected,
    }


def sales_order_payload() -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-sales-order-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "order_date": SOURCE_RETRIEVED_ON.isoformat(),
        "document_discount": {
            "document_discount_kind": "amount",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "25.00",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "customer_account_id": IDS["customer_account"],
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "12",
                "free_quantity": "2",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "125.50",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "percent",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "7.5",
                },
                "document_discount_eligible": True,
            }
        ],
    }


def purchase_order_payload() -> dict[str, Any]:
    no_discount = {
        "line_discount_kind": "none",
        "line_discount_basis": "taxable_value",
        "line_discount_value": "0",
    }
    return {
        "idempotency_key": f"demo-purchase-order-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "order_date": SOURCE_RETRIEVED_ON.isoformat(),
        "expected_on": (SOURCE_RETRIEVED_ON + timedelta(days=5)).isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "10",
                "free_quantity": "0",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": no_discount,
                "document_discount_eligible": True,
            },
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "100",
                "free_quantity": "5",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": no_discount,
                "document_discount_eligible": True,
            },
        ],
    }


def reconcile_purchase_order(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT purchase_order.id,purchase_order.order_number,purchase_order.status,
                   purchase_order.subtotal,purchase_order.gst_taxable_total,
                   purchase_order.cgst_total,purchase_order.sgst_total,
                   purchase_order.igst_total,purchase_order.grand_total,
                   count(line.id) AS line_count,
                   array_agg(line.id ORDER BY line.line_number) AS line_ids
              FROM procurement.purchase_orders AS purchase_order
              JOIN procurement.purchase_order_lines AS line
                ON line.org_id=purchase_order.org_id
               AND line.purchase_order_id=purchase_order.id
             WHERE purchase_order.org_id=%s AND purchase_order.id=%s
             GROUP BY purchase_order.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "approved" or row[9] != 2:
            raise RuntimeError("executed demo purchase order did not reconcile")
        columns = [item.name for item in cursor.description]
        result = dict(zip(columns, row))
        result["line_ids"] = [str(item) for item in result["line_ids"]]
        for key, value in tuple(result.items()):
            if key != "line_ids" and value is not None:
                result[key] = str(value)
        return result


def supplier_advance_payload(purchase_order_id: str, purchase_order_line_id: str) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-supplier-advance-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": SOURCE_RETRIEVED_ON.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "purchase_order_id": purchase_order_id,
        "settlement_account_id": IDS["bank_ledger"],
        "bank_account_id": IDS["bank_account"],
        "payment_method": "upi",
        "gross_amount": "500.00",
        "allocations": [
            {"purchase_order_line_id": purchase_order_line_id, "gross_amount": "500.00"}
        ],
        "external_reference": f"DEMO-UPI-ADV-{os.getenv('GITHUB_RUN_ID', 'local')}",
    }


def goods_receipt_payload(purchase_order_id: str, purchase_order_line_id: str) -> dict[str, Any]:
    received_at = datetime.now(timezone.utc).replace(microsecond=0)
    return {
        "idempotency_key": f"demo-goods-receipt-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "received_at": received_at.isoformat(),
        "purchase_order_id": purchase_order_id,
        "supplier_account_id": IDS["supplier_account"],
        "supplier_challan_number": f"DEMO-CH-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "supplier_challan_date": SOURCE_RETRIEVED_ON.isoformat(),
        "lines": [
            {
                "purchase_order_line_id": purchase_order_line_id,
                "batches": [
                    {
                        "manufacturer_batch_number": f"DEMO-BATCH-{os.getenv('GITHUB_RUN_ID', 'local')}",
                        "manufactured_on": "2026-07-01",
                        "expires_on": "2028-09-01",
                        "mrp": "150.00",
                        "mrp_uom_conversion_id": IDS["uom_conversion"],
                        "received_quantity": "100",
                        "accepted_quantity": "100",
                        "rejected_quantity": "0",
                        "free_quantity": "0",
                        "qc_status": "accepted",
                        "to_location_id": IDS["saleable_location"],
                    }
                ],
            }
        ],
    }


def seed_supplier_invoice_portal_evidence(connection) -> dict[str, str]:
    supplier_invoice_number = f"DEMO-SUP-{os.getenv('GITHUB_RUN_ID', 'local')}"
    source_attachment_id = demo_run_uuid("gstr2b-source-attachment")
    return_period_id = demo_run_uuid("gstr2b-return-period")
    portal_document_id = demo_run_uuid("gstr2b-portal-document")
    portal_line_id = demo_run_uuid("gstr2b-invoice-line")
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,'synthetic-gstr2b.json',
                'application/json',256,extensions.digest(%s,'sha256'),'gstr2b_import',
                %s,%s,'retained',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], source_attachment_id,
                f"demo/{os.getenv('GITHUB_RUN_ID', 'local')}/synthetic-gstr2b.json",
                f"synthetic-gstr2b:{supplier_invoice_number}",
                SOURCE_RETRIEVED_ON, date(2034, 8, 20), IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.return_periods (
                org_id,id,registration_id,period_start,period_end,due_date,
                period_kind,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,DATE '2026-08-01',DATE '2026-08-31',DATE '2026-09-20',
                'monthly','open',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], return_period_id, IDS["org_gst_registration"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.portal_documents (
                org_id,id,registration_id,return_period_id,portal_document_type,
                portal_generation_date,source_attachment_id,source_sha256,status,
                parsed_at,created_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,'gstr2b',%s,%s,
                extensions.digest(%s,'sha256'),'parsed',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], portal_document_id, IDS["org_gst_registration"],
                return_period_id, SOURCE_RETRIEVED_ON, source_attachment_id,
                f"synthetic-gstr2b:{supplier_invoice_number}", IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.portal_document_lines (
                org_id,id,portal_document_id,line_number,supplier_gstin,
                counterparty_name,invoice_number,invoice_date,document_type,
                place_of_supply_state_code,taxable_amount,cgst_amount,sgst_amount,
                igst_amount,cess_amount,total_amount,portal_reference,source_row_hash,
                created_by_membership_id
            ) VALUES (
                %s,%s,%s,1,'27DEMOC5678D1Z5',
                'Synthetic Medicines Distributor Private Limited',%s,%s,'invoice',
                '27',5000.00,300.00,300.00,0,0,5600.00,%s,
                extensions.digest(%s,'sha256'),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], portal_line_id, portal_document_id,
                supplier_invoice_number, SOURCE_RETRIEVED_ON,
                f"GSTR2B-DEMO-{os.getenv('GITHUB_RUN_ID', 'local')}",
                f"synthetic-gstr2b-row:{supplier_invoice_number}", IDS["reviewer_membership"],
            ),
        )
    return {
        "supplier_invoice_number": supplier_invoice_number,
        "portal_document_line_id": portal_line_id,
    }


def seed_purchase_return_portal_evidence(connection) -> dict[str, str]:
    """Add one synthetic parsed GSTR-2B supplier credit note to the demo import."""

    portal_document_id = demo_run_uuid("gstr2b-portal-document")
    portal_line_id = demo_run_uuid("gstr2b-credit-note-line")
    credit_note_number = f"DEMO-SUP-CN-{os.getenv('GITHUB_RUN_ID', 'local')}"
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO tax.portal_document_lines (
                org_id,id,portal_document_id,line_number,supplier_gstin,
                counterparty_name,invoice_number,invoice_date,document_type,
                place_of_supply_state_code,taxable_amount,cgst_amount,sgst_amount,
                igst_amount,cess_amount,total_amount,portal_reference,source_row_hash,
                created_by_membership_id
            ) VALUES (
                %s,%s,%s,2,'27DEMOC5678D1Z5',
                'Synthetic Medicines Distributor Private Limited',%s,%s,'credit_note',
                '27',1000.00,60.00,60.00,0,0,1120.00,%s,
                extensions.digest(%s,'sha256'),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], portal_line_id, portal_document_id,
                credit_note_number, SOURCE_RETRIEVED_ON,
                f"GSTR2B-DEMO-CN-{os.getenv('GITHUB_RUN_ID', 'local')}",
                f"synthetic-gstr2b-credit-note:{credit_note_number}",
                IDS["reviewer_membership"],
            ),
        )
    return {
        "supplier_credit_note_number": credit_note_number,
        "supplier_credit_note_portal_line_id": portal_line_id,
    }


def supplier_invoice_payload(
    goods_receipt_id: str,
    goods_receipt_line_id: str,
    portal_evidence: dict[str, str],
) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-supplier-invoice-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "invoice_date": SOURCE_RETRIEVED_ON.isoformat(),
        "received_date": SOURCE_RETRIEVED_ON.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "supplier_tax_registration_id": IDS["supplier_gstin"],
        "supplier_invoice_number": portal_evidence["supplier_invoice_number"],
        "tax_charge_mechanism": "normal",
        "portal_document_line_id": portal_evidence["portal_document_line_id"],
        "goods_receipt_ids": [goods_receipt_id],
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "billed_quantity": "50",
                "free_quantity": "0",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "none",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "0",
                },
                "document_discount_eligible": True,
                "goods_receipt_line_id": goods_receipt_line_id,
                "allocated_base_billed_quantity": "50",
                "allocated_base_free_quantity": "0",
                "product_inventory_cost_treatment": "capitalize",
                "itc_eligibility": "eligible",
                "itc_eligibility_basis": "taxable_resale_not_blocked_under_section_17",
            }
        ],
    }


def reconcile_supplier_advance(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT payment.id,payment.payment_number,payment.status,payment.amount,
                   count(DISTINCT advance.id) AS advance_count,
                   count(DISTINCT item.id) AS prepayment_item_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM finance.payments AS payment
              LEFT JOIN procurement.purchase_order_advance_allocations AS advance
                ON advance.org_id=payment.org_id AND advance.payment_id=payment.id
              LEFT JOIN finance.open_items AS item
                ON item.org_id=payment.org_id
               AND item.id=advance.prepayment_open_item_id
              LEFT JOIN finance.accounting_events AS event
                ON event.org_id=payment.org_id AND event.payment_id=payment.id
             WHERE payment.org_id=%s AND payment.id=%s
             GROUP BY payment.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[4:] != (1, 1, 1):
            raise RuntimeError("executed demo supplier advance did not reconcile")
        return {
            "id": str(row[0]),
            "payment_number": row[1],
            "status": row[2],
            "amount": str(row[3]),
            "advance_count": row[4],
            "prepayment_item_count": row[5],
            "accounting_event_count": row[6],
        }


def reconcile_goods_receipt(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT receipt.id,receipt.receipt_number,receipt.status,
                   line.id AS goods_receipt_line_id,line.batch_id,
                   line.base_accepted_quantity,line.base_free_quantity,
                   line.extended_cost,document.id AS inventory_document_id,
                   balance.on_hand_quantity,balance.inventory_value,
                   balance.moving_weighted_average
              FROM procurement.goods_receipts AS receipt
              JOIN procurement.goods_receipt_lines AS line
                ON line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
              JOIN inventory.inventory_documents AS document
                ON document.org_id=receipt.org_id AND document.goods_receipt_id=receipt.id
              JOIN inventory.stock_balances AS balance
                ON balance.org_id=receipt.org_id
               AND balance.location_id=line.location_id
               AND balance.product_id=line.product_id
               AND balance.batch_id=line.batch_id
             WHERE receipt.org_id=%s AND receipt.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[9] != row[5] + row[6]:
            raise RuntimeError("executed demo goods receipt did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def reconcile_supplier_invoice(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT invoice.id,invoice.supplier_invoice_number,invoice.status,
                   invoice.net_value_total,invoice.cgst_total,invoice.sgst_total,
                   invoice.grand_total,line.id AS supplier_invoice_line_id,
                   allocation.id AS receipt_allocation_id,
                   item.id AS open_item_id,item.original_amount,item.outstanding_amount,
                   count(DISTINCT tax_document.id) AS tax_document_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM procurement.supplier_invoices AS invoice
              JOIN procurement.supplier_invoice_lines AS line
                ON line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
              JOIN procurement.supplier_invoice_receipt_allocations AS allocation
                ON allocation.org_id=invoice.org_id
               AND allocation.supplier_invoice_line_id=line.id
              JOIN finance.accounting_events AS event
                ON event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id
              JOIN finance.open_items AS item
                ON item.org_id=invoice.org_id AND item.accounting_event_id=event.id
              LEFT JOIN tax.documents AS tax_document
                ON tax_document.org_id=invoice.org_id
               AND tax_document.supplier_invoice_id=invoice.id
             WHERE invoice.org_id=%s AND invoice.id=%s
             GROUP BY invoice.id,line.id,allocation.id,item.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[12:] != (1, 1):
            raise RuntimeError("executed demo supplier invoice did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def supplier_payment_payload(open_item_id: str) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-supplier-payment-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": SOURCE_RETRIEVED_ON.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "settlement_account_id": IDS["bank_ledger"],
        "bank_account_id": IDS["bank_account"],
        "payment_method": "bank_transfer",
        "gross_amount": "2000.00",
        "allocations": [{"open_item_id": open_item_id, "amount": "2000.00"}],
        "external_reference": f"DEMO-NEFT-PAY-{os.getenv('GITHUB_RUN_ID', 'local')}",
    }


def reconcile_payment(connection, resource_id: str, expected_direction: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT payment.id,payment.payment_number,payment.direction,payment.status,
                   payment.amount,count(DISTINCT allocation.id) AS allocation_count,
                   coalesce(sum(allocation.amount),0) AS allocated_total,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM finance.payments AS payment
              JOIN finance.allocations AS allocation
                ON allocation.org_id=payment.org_id AND allocation.payment_id=payment.id
              JOIN finance.accounting_events AS event
                ON event.org_id=payment.org_id AND event.payment_id=payment.id
             WHERE payment.org_id=%s AND payment.id=%s
             GROUP BY payment.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != expected_direction
            or row[3] != "posted"
            or row[5] != 1
            or row[4] != row[6]
            or row[7] != 1
        ):
            raise RuntimeError("executed demo payment did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def preflight_sales_order(payload: dict[str, Any], evidence_dir: Path) -> None:
    """Resolve and calculate without persisting, so live failures remain diagnosable."""
    identity = (
        f"aasopharma:{IDS['org']}:{IDS['operator_membership']}:sales.order.prepare:"
        f"{payload['idempotency_key']}"
    )
    order_id = uuid5(NAMESPACE_URL, identity + ":order")
    request_document = {
        key: value for key, value in payload.items() if key != "idempotency_key"
    }
    request_document["lines"] = [
        {
            **line,
            "line_id": str(uuid5(NAMESPACE_URL, identity + f":line:{index}")),
        }
        for index, line in enumerate(payload["lines"], start=1)
    ]
    request_document["charge_lines"] = [
        {
            **line,
            "line_id": str(
                uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
            ),
        }
        for index, line in enumerate(payload.get("charge_lines", ()), start=1)
    ]

    with psycopg2.connect(required("ERP_CALCULATOR_DATABASE_URL")) as calculator:
        with calculator.cursor() as cursor:
            cursor.execute(
                """
                SELECT erp_automation_commands.resolve_sales_order_prepare(
                    %s, %s, %s, %s, %s, %s, %s::jsonb
                )
                """,
                (
                    IDS["org"],
                    IDS["operator_membership"],
                    IDS["operator_auth_user"],
                    IDS["operator_user"],
                    IDS["agent_grant"],
                    CLIENT_ID,
                    json.dumps(request_document, separators=(",", ":"), sort_keys=True),
                ),
            )
            resolution = cursor.fetchone()[0]
        calculator.rollback()

    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.domain.operator_actions.contract import ACTION_POLICIES
    from app.domain.operator_actions.models import ActionContext
    from app.infrastructure.operator_actions.sales_order import calculation_documents
    from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService

    _calculation_input, calculation_output = calculation_documents(
        request_document, resolution, order_id=order_id
    )
    evidence = {
        "order_id": str(order_id),
        "supply_type": resolution["supply_type"],
        "ruleset_version": resolution["ruleset_version"],
        "resolved_line_count": len(resolution["lines"]),
        "totals": calculation_output["totals"],
    }
    (evidence_dir / "canonical-demo-sales-order-preflight.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    engine = create_engine(required("ERP_CALCULATOR_DATABASE_URL"), pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            outer_transaction = connection.begin()
            try:
                service = SqlAlchemyOperatorActionService(
                    calculator_factory=lambda: Session(
                        bind=connection, join_transaction_mode="create_savepoint"
                    ),
                    runtime_principal_configured=True,
                )
                try:
                    prepared = service.prepare(
                        policy=ACTION_POLICIES["sales.order.prepare"],
                        payload={
                            key: value
                            for key, value in payload.items()
                            if key != "idempotency_key"
                        },
                        idempotency_key=payload["idempotency_key"],
                        context=ActionContext(
                            auth_user_id=UUID(IDS["operator_auth_user"]),
                            user_id=UUID(IDS["operator_user"]),
                            organization_id=UUID(IDS["org"]),
                            membership_id=UUID(IDS["operator_membership"]),
                            agent_grant_id=UUID(IDS["agent_grant"]),
                            client_id=CLIENT_ID,
                            operation_key="sales.order.prepare",
                            permission="sales.order.create",
                            branch_ids=(UUID(IDS["branch"]),),
                            organization_scope=True,
                        ),
                    )
                except Exception as exc:
                    database_error = getattr(exc, "orig", exc)
                    raise RuntimeError(
                        "sales-order rollback persistence preflight failed: "
                        f"{type(database_error).__name__}: {database_error}"
                    ) from None
                if prepared.command_request_id is None or not prepared.preview_hash.startswith(
                    "sha256:"
                ):
                    raise RuntimeError("sales-order persistence preflight returned invalid evidence")
            finally:
                outer_transaction.rollback()
    finally:
        engine.dispose()
    print("canonical demo sales-order resolver, Decimal, and rollback persistence preflight passed")


def exercise_sales_order(
    evidence_dir: Path, payload: dict[str, Any]
) -> dict[str, Any]:
    prepared = api_call(
        "POST", "/api/internal/mcp/actions/sales.order.prepare/prepare",
        "sales.order.prepare", "sales.order.create", payload,
    )
    command_id = str(prepared["command_request_id"])
    preview_hash = str(prepared["preview_hash"])
    approved = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/approve",
        "automation.command.approve", "automation.command.approve",
        {
            "preview_hash": preview_hash,
            "approval_intent": "approve",
            "idempotency_key": f"demo-approve-{os.getenv('GITHUB_RUN_ID', 'local')}",
        }, command_id,
    )
    executed = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {
            "preview_hash": preview_hash,
            "idempotency_key": f"demo-execute-{os.getenv('GITHUB_RUN_ID', 'local')}",
        }, command_id,
    )
    evidence = {"payload": payload, "prepared": prepared, "approved": approved, "executed": executed}
    (evidence_dir / "canonical-demo-sales-order.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return evidence


def reconcile(connection, execution: dict[str, Any]) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT order_row.id, order_row.order_number, order_row.status,
                   order_row.subtotal, order_row.discount_total,
                   order_row.gst_taxable_total, order_row.cgst_total,
                   order_row.sgst_total, order_row.igst_total,
                   order_row.cess_total, order_row.rounding_adjustment,
                   order_row.grand_total,
                   (SELECT count(*)
                      FROM sales.order_lines AS line
                     WHERE line.org_id=order_row.org_id
                       AND line.order_id=order_row.id) AS line_count
              FROM sales.orders AS order_row
             WHERE order_row.org_id=%s AND order_row.id=%s
            """,
            (IDS["org"], execution["resource_id"]),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "approved" or row[-1] != 1:
            raise RuntimeError("executed demo sales order did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {column: str(value) if value is not None else None for column, value in zip(columns, row)}
        cursor.execute(
            """
            SELECT count(*) FROM calculation.artifacts
             WHERE org_id=%s AND sales_order_id=%s AND status='consumed'
            """,
            (IDS["org"], execution["resource_id"]),
        )
        result["consumed_calculation_artifacts"] = cursor.fetchone()[0]
        if result["consumed_calculation_artifacts"] != 1:
            raise RuntimeError("demo sales order lacks its consumed calculation authority")
        cursor.execute(
            """
            SELECT id FROM sales.order_lines
             WHERE org_id=%s AND order_id=%s ORDER BY line_number
            """,
            (IDS["org"], execution["resource_id"]),
        )
        result["line_ids"] = [str(row[0]) for row in cursor.fetchall()]
        return result


def sales_dispatch_payload(sales_order_id: str, sales_order_line_id: str, batch_id: str) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-sales-dispatch-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "dispatch_date": SOURCE_RETRIEVED_ON.isoformat(),
        "sales_order_id": sales_order_id,
        "from_location_id": IDS["saleable_location"],
        "lines": [
            {
                "sales_order_line_id": sales_order_line_id,
                "billed_quantity": "12",
                "free_quantity": "2",
                "batch_allocations": [
                    {"batch_id": batch_id, "billed_quantity": "12", "free_quantity": "2"}
                ],
            }
        ],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "18.50",
            "transporter_party_id": IDS["supplier_party"],
            "vehicle_number": "MH01DE2026",
            "vehicle_type": "regular",
            "transport_document_number": f"DEMO-DC-{os.getenv('GITHUB_RUN_ID', 'local')}",
            "transport_document_date": SOURCE_RETRIEVED_ON.isoformat(),
        },
    }


def reconcile_sales_dispatch(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT dispatch.id,dispatch.dispatch_number,dispatch.status,
                   line.id AS dispatch_line_id,line.base_billed_quantity,
                   line.base_free_quantity,document.id AS inventory_document_id,
                   count(DISTINCT ledger.id) AS ledger_count,
                   coalesce(sum(ledger.value_delta),0) AS inventory_value_delta,
                   count(DISTINCT event.id) AS valuation_event_count
              FROM sales.dispatches AS dispatch
              JOIN sales.dispatch_lines AS line
                ON line.org_id=dispatch.org_id AND line.dispatch_id=dispatch.id
              JOIN inventory.inventory_documents AS document
                ON document.org_id=dispatch.org_id AND document.sales_dispatch_id=dispatch.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=document.org_id AND ledger.inventory_document_id=document.id
              JOIN finance.accounting_events AS event
                ON event.org_id=document.org_id
               AND event.inventory_document_id=document.id
               AND event.event_type='inventory_valuation'
             WHERE dispatch.org_id=%s AND dispatch.id=%s
             GROUP BY dispatch.id,line.id,document.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[7] != 1 or row[8] >= 0 or row[9] != 1:
            raise RuntimeError("executed demo sales dispatch did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def sales_invoice_payload(dispatch_line_id: str) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-sales-invoice-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "invoice_date": SOURCE_RETRIEVED_ON.isoformat(),
        "customer_account_id": IDS["customer_account"],
        "tax_charge_mechanism": "normal",
        "place_of_supply_state_code": "27",
        "document_discount": {
            "document_discount_kind": "amount",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "25.00",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "12",
                "free_quantity": "2",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "125.5000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "percent",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "7.5",
                },
                "document_discount_eligible": True,
                "fulfillment_source": "dispatch_allocated",
                "dispatch_allocations": [
                    {
                        "dispatch_line_id": dispatch_line_id,
                        "allocated_base_billed_quantity": "12",
                        "allocated_base_free_quantity": "2",
                    }
                ],
            }
        ],
    }


def reconcile_sales_invoice(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT invoice.id,invoice.invoice_number,invoice.status,
                   invoice.net_value_total,invoice.cgst_total,invoice.sgst_total,
                   invoice.rounding_adjustment,invoice.grand_total,
                   line.id AS invoice_line_id,
                   allocation.id AS invoice_dispatch_allocation_id,
                   item.id AS open_item_id,item.outstanding_amount,
                   count(DISTINCT tax_document.id) AS tax_document_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM sales.invoices AS invoice
              JOIN sales.invoice_lines AS line
                ON line.org_id=invoice.org_id AND line.invoice_id=invoice.id
              JOIN sales.invoice_dispatch_allocations AS allocation
                ON allocation.org_id=invoice.org_id AND allocation.invoice_line_id=line.id
              JOIN finance.accounting_events AS event
                ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id
              JOIN finance.open_items AS item
                ON item.org_id=invoice.org_id AND item.accounting_event_id=event.id
              LEFT JOIN tax.documents AS tax_document
                ON tax_document.org_id=invoice.org_id AND tax_document.sales_invoice_id=invoice.id
             WHERE invoice.org_id=%s AND invoice.id=%s
             GROUP BY invoice.id,line.id,allocation.id,item.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[12:] != (1, 1):
            raise RuntimeError("executed demo sales invoice did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def customer_receipt_payload(open_item_id: str) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-customer-receipt-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": SOURCE_RETRIEVED_ON.isoformat(),
        "customer_account_id": IDS["customer_account"],
        "settlement_account_id": IDS["bank_ledger"],
        "bank_account_id": IDS["bank_account"],
        "payment_method": "upi",
        "amount": "500.00",
        "allocations": [{"open_item_id": open_item_id, "amount": "500.00"}],
        "external_reference": f"DEMO-UPI-RECEIPT-{os.getenv('GITHUB_RUN_ID', 'local')}",
    }


def sales_return_payload(
    invoice_id: str,
    invoice_line_id: str,
    invoice_dispatch_allocation_id: str,
    batch_id: str,
) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-sales-return-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "return_date": SOURCE_RETRIEVED_ON.isoformat(),
        "original_invoice_id": invoice_id,
        "reason_code": "customer_rejection",
        "gst_tax_treatment": "statutory",
        "recipient_itc_reversal_evidence_attachment_id": IDS["recipient_itc_evidence"],
        "recipient_itc_reversal_confirmed_at": datetime.now(timezone.utc).isoformat(),
        "lines": [
            {
                "original_invoice_line_id": invoice_line_id,
                "invoice_dispatch_allocation_id": invoice_dispatch_allocation_id,
                "billed_quantity": "4",
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": batch_id,
                    "billed_quantity": "4",
                    "free_quantity": "0",
                },
                "to_location_id": IDS["quarantine_location"],
                "return_condition": "opened",
            }
        ],
    }


def reconcile_sales_return(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT returned.id,returned.return_number,returned.status,
                   returned.gst_tax_treatment,returned.grand_total,
                   line.id AS return_line_id,line.base_billed_quantity,
                   line.base_free_quantity,document.id AS inventory_document_id,
                   note.id AS adjustment_note_id,
                   (SELECT count(*) FROM tax.documents tax_document
                     WHERE tax_document.org_id=returned.org_id
                       AND tax_document.adjustment_note_id=note.id) AS tax_document_count,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=returned.org_id
                       AND event.adjustment_note_id=note.id) AS accounting_event_count,
                   (SELECT count(*) FROM finance.allocations allocation
                     WHERE allocation.org_id=returned.org_id
                       AND allocation.adjustment_note_id=note.id) AS allocation_count,
                   (SELECT coalesce(sum(ledger.quantity_delta),0)
                      FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=returned.org_id
                       AND ledger.inventory_document_id=document.id) AS stock_quantity_delta
              FROM sales.returns returned
              JOIN sales.return_lines line
                ON line.org_id=returned.org_id AND line.return_id=returned.id
              JOIN inventory.inventory_documents document
                ON document.org_id=returned.org_id AND document.sales_return_id=returned.id
              JOIN finance.adjustment_notes note
                ON note.org_id=returned.org_id AND note.sales_return_id=returned.id
             WHERE returned.org_id=%s AND returned.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[3] != "statutory"
            or row[10:13] != (1, 1, 1)
            or row[13] != row[6] + row[7]
        ):
            raise RuntimeError("executed demo sales return did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def purchase_return_payload(
    supplier_invoice_id: str,
    goods_receipt_line_id: str,
    receipt_allocation_id: str,
    batch_id: str,
    portal_evidence: dict[str, str],
) -> dict[str, Any]:
    return {
        "idempotency_key": f"demo-purchase-return-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "return_date": SOURCE_RETRIEVED_ON.isoformat(),
        "return_source_kind": "invoiced",
        "original_supplier_invoice_id": supplier_invoice_id,
        "supplier_credit_note_portal_line_id": portal_evidence[
            "supplier_credit_note_portal_line_id"
        ],
        "reason_code": "wrong_supply",
        "gst_tax_treatment": "statutory",
        "supplier_destination_address_id": IDS["supplier_address"],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "18.50",
            "transporter_party_id": IDS["supplier_party"],
            "vehicle_number": "MH01PR2026",
            "vehicle_type": "regular",
            "transport_document_number": f"DEMO-PR-DC-{os.getenv('GITHUB_RUN_ID', 'local')}",
            "transport_document_date": SOURCE_RETRIEVED_ON.isoformat(),
        },
        "lines": [
            {
                "goods_receipt_line_id": goods_receipt_line_id,
                "supplier_invoice_receipt_allocation_id": receipt_allocation_id,
                "billed_quantity": "10",
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": batch_id,
                    "billed_quantity": "10",
                    "free_quantity": "0",
                },
                "from_location_id": IDS["saleable_location"],
            }
        ],
    }


def reconcile_purchase_return(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT returned.id,returned.purchase_return_number,returned.status,
                   returned.gst_tax_treatment,returned.grand_total,
                   line.id AS return_line_id,line.base_billed_quantity,
                   line.base_free_quantity,document.id AS inventory_document_id,
                   note.id AS adjustment_note_id,
                   (SELECT count(*) FROM tax.documents tax_document
                     WHERE tax_document.org_id=returned.org_id
                       AND tax_document.adjustment_note_id=note.id) AS tax_document_count,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=returned.org_id
                       AND event.adjustment_note_id=note.id) AS accounting_event_count,
                   (SELECT count(*) FROM finance.allocations allocation
                     WHERE allocation.org_id=returned.org_id
                       AND allocation.adjustment_note_id=note.id) AS allocation_count,
                   (SELECT coalesce(sum(ledger.quantity_delta),0)
                      FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=returned.org_id
                       AND ledger.inventory_document_id=document.id) AS stock_quantity_delta
              FROM procurement.purchase_returns returned
              JOIN procurement.purchase_return_lines line
                ON line.org_id=returned.org_id AND line.purchase_return_id=returned.id
              JOIN inventory.inventory_documents document
                ON document.org_id=returned.org_id
               AND document.purchase_return_id=returned.id
              JOIN finance.adjustment_notes note
                ON note.org_id=returned.org_id AND note.purchase_return_id=returned.id
             WHERE returned.org_id=%s AND returned.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[3] != "statutory"
            or row[10:13] != (1, 1, 1)
            or row[13] != -(row[6] + row[7])
        ):
            raise RuntimeError("executed demo purchase return did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def inventory_adjustment_payload(batch_id: str, counted_base_quantity: str) -> dict[str, Any]:
    counted_at = datetime.now(timezone.utc).isoformat()
    counted_packs = str(
        (Decimal(counted_base_quantity) + Decimal("1")) / Decimal("10")
    )
    return {
        "idempotency_key": f"demo-inventory-adjustment-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "adjustment_date": SOURCE_RETRIEVED_ON.isoformat(),
        "counted_at": counted_at,
        "counted_by_membership_id": IDS["operator_membership"],
        "location_id": IDS["saleable_location"],
        "reason_code": "cycle_count",
        "evidence_attachment_id": IDS["cycle_count_evidence"],
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["count_uom_conversion"],
                "batch_counts": [
                    {"batch_id": batch_id, "counted_quantity": counted_packs}
                ],
            }
        ],
    }


def reconcile_inventory_adjustment(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT document.id,document.document_number,document.status,
                   document.total_abs_base_quantity,document.total_value,
                   line.variance_quantity,line.extended_cost,
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=document.org_id
                       AND ledger.inventory_document_id=document.id
                       AND ledger.entry_kind='count_gain') AS count_gain_entries,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=document.org_id
                       AND event.inventory_document_id=document.id
                       AND event.event_type='inventory_valuation') AS valuation_events
              FROM inventory.inventory_documents document
              JOIN inventory.inventory_document_lines line
                ON line.org_id=document.org_id AND line.inventory_document_id=document.id
             WHERE document.org_id=%s AND document.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[5] != Decimal("1")
            or row[4] != row[6]
            or row[7:] != (1, 1)
        ):
            raise RuntimeError("executed demo inventory adjustment did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def current_saleable_quantity(connection, batch_id: str) -> str:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT on_hand_quantity
              FROM inventory.stock_balances
             WHERE org_id=%s AND branch_id=%s AND location_id=%s
               AND product_id=%s AND batch_id=%s
            """,
            (
                IDS["org"], IDS["branch"], IDS["saleable_location"],
                IDS["product"], batch_id,
            ),
        )
        row = cursor.fetchone()
        if row is None or row[0] <= 0:
            raise RuntimeError("demo saleable batch balance is unavailable")
        return str(row[0])


def main() -> int:
    assert_target()
    evidence_dir = Path(required("CANONICAL_DEMO_EVIDENCE_DIR"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    source = fetch_official_source(evidence_dir)
    adjustment_source = fetch_adjustment_source(evidence_dir)

    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        bootstrap_identity(bootstrap)
        release_exists = demo_tax_release_exists(bootstrap)
        adjustment_release_exists = demo_adjustment_release_exists(bootstrap)
    with psycopg2.connect(required("ERP_REGULATORY_IMPORTER_DATABASE_URL")) as importer:
        dataset_bytes = canonical_dataset_bytes(importer)
        adjustment_bytes = adjustment_dataset_bytes(importer)
        (evidence_dir / "hsn-481910-demo.json").write_bytes(dataset_bytes)
        (evidence_dir / "gst-adjustment-rules-demo.json").write_bytes(adjustment_bytes)
        if not release_exists:
            import_tax_release(importer, source, dataset_bytes)
        if not adjustment_release_exists:
            import_adjustment_release(importer, adjustment_source, adjustment_bytes)
    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        seed_business_master(bootstrap)
        seed_end_to_end_master(bootstrap)
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        verify_fiscal_tax_fact(runtime)
        activate_demo_product(runtime)

    purchase_payload = purchase_order_payload()
    preflight_action("procurement.purchase_order.prepare", purchase_payload)
    purchase_journey = exercise_action(
        evidence_dir,
        "procurement.purchase_order.prepare",
        "procurement.order.manage",
        purchase_payload,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        purchase_reconciliation = reconcile_purchase_order(
            runtime, purchase_journey["executed"]["resource_id"]
        )

    purchase_order_id = purchase_reconciliation["id"]
    advance_payload = supplier_advance_payload(
        purchase_order_id, purchase_reconciliation["line_ids"][0]
    )
    preflight_action("finance.supplier_advance.prepare", advance_payload)
    advance_journey = exercise_action(
        evidence_dir,
        "finance.supplier_advance.prepare",
        "finance.supplier_advance.create",
        advance_payload,
        separate_approver=True,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        advance_reconciliation = reconcile_supplier_advance(
            runtime, advance_journey["executed"]["resource_id"]
        )

    receipt_payload = goods_receipt_payload(
        purchase_order_id, purchase_reconciliation["line_ids"][1]
    )
    preflight_action("procurement.goods_receipt.prepare", receipt_payload)
    receipt_journey = exercise_action(
        evidence_dir,
        "procurement.goods_receipt.prepare",
        "procurement.receipt.post",
        receipt_payload,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        receipt_reconciliation = reconcile_goods_receipt(
            runtime, receipt_journey["executed"]["resource_id"]
        )

    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        portal_evidence = seed_supplier_invoice_portal_evidence(bootstrap)
    supplier_invoice_request = supplier_invoice_payload(
        receipt_reconciliation["id"],
        receipt_reconciliation["goods_receipt_line_id"],
        portal_evidence,
    )
    preflight_action("procurement.supplier_invoice.prepare", supplier_invoice_request)
    supplier_invoice_journey = exercise_action(
        evidence_dir,
        "procurement.supplier_invoice.prepare",
        "procurement.supplier_invoice.create",
        supplier_invoice_request,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        supplier_invoice_reconciliation = reconcile_supplier_invoice(
            runtime, supplier_invoice_journey["executed"]["resource_id"]
        )

    supplier_payment_request = supplier_payment_payload(
        supplier_invoice_reconciliation["open_item_id"]
    )
    preflight_action("finance.supplier_payment.prepare", supplier_payment_request)
    supplier_payment_journey = exercise_action(
        evidence_dir,
        "finance.supplier_payment.prepare",
        "finance.supplier_payment.create",
        supplier_payment_request,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        supplier_payment_reconciliation = reconcile_payment(
            runtime, supplier_payment_journey["executed"]["resource_id"], "disbursement"
        )

    payload = sales_order_payload()
    preflight_sales_order(payload, evidence_dir)
    journey = exercise_sales_order(evidence_dir, payload)
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        reconciliation = reconcile(runtime, journey["executed"])

    dispatch_request = sales_dispatch_payload(
        reconciliation["id"], reconciliation["line_ids"][0], receipt_reconciliation["batch_id"]
    )
    preflight_action("sales.dispatch.prepare", dispatch_request)
    dispatch_journey = exercise_action(
        evidence_dir,
        "sales.dispatch.prepare",
        "sales.dispatch.create",
        dispatch_request,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        dispatch_reconciliation = reconcile_sales_dispatch(
            runtime, dispatch_journey["executed"]["resource_id"]
        )

    invoice_request = sales_invoice_payload(dispatch_reconciliation["dispatch_line_id"])
    preflight_action("sales.invoice.prepare", invoice_request)
    invoice_journey = exercise_action(
        evidence_dir,
        "sales.invoice.prepare",
        "sales.invoice.create",
        invoice_request,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        invoice_reconciliation = reconcile_sales_invoice(
            runtime, invoice_journey["executed"]["resource_id"]
        )

    customer_receipt_request = customer_receipt_payload(
        invoice_reconciliation["open_item_id"]
    )
    preflight_action("finance.customer_receipt.prepare", customer_receipt_request)
    customer_receipt_journey = exercise_action(
        evidence_dir,
        "finance.customer_receipt.prepare",
        "finance.customer_receipt.create",
        customer_receipt_request,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        customer_receipt_reconciliation = reconcile_payment(
            runtime, customer_receipt_journey["executed"]["resource_id"], "receipt"
        )

    sales_return_request = sales_return_payload(
        invoice_reconciliation["id"],
        invoice_reconciliation["invoice_line_id"],
        invoice_reconciliation["invoice_dispatch_allocation_id"],
        receipt_reconciliation["batch_id"],
    )
    preflight_action("sales.return.prepare", sales_return_request)
    sales_return_journey = exercise_action(
        evidence_dir,
        "sales.return.prepare",
        "sales.return.create",
        sales_return_request,
        separate_approver=True,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        sales_return_reconciliation = reconcile_sales_return(
            runtime, sales_return_journey["executed"]["resource_id"]
        )

    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        purchase_return_portal = seed_purchase_return_portal_evidence(bootstrap)
    purchase_return_request = purchase_return_payload(
        supplier_invoice_reconciliation["id"],
        receipt_reconciliation["goods_receipt_line_id"],
        supplier_invoice_reconciliation["receipt_allocation_id"],
        receipt_reconciliation["batch_id"],
        purchase_return_portal,
    )
    preflight_action("procurement.purchase_return.prepare", purchase_return_request)
    purchase_return_journey = exercise_action(
        evidence_dir,
        "procurement.purchase_return.prepare",
        "procurement.purchase_return.create",
        purchase_return_request,
        separate_approver=True,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        purchase_return_reconciliation = reconcile_purchase_return(
            runtime, purchase_return_journey["executed"]["resource_id"]
        )
        saleable_quantity = current_saleable_quantity(
            runtime, receipt_reconciliation["batch_id"]
        )

    adjustment_request = inventory_adjustment_payload(
        receipt_reconciliation["batch_id"], saleable_quantity
    )
    preflight_action("inventory.adjustment.prepare", adjustment_request)
    adjustment_journey = exercise_action(
        evidence_dir,
        "inventory.adjustment.prepare",
        "inventory.adjustment.create",
        adjustment_request,
        separate_approver=True,
    )
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        adjustment_reconciliation = reconcile_inventory_adjustment(
            runtime, adjustment_journey["executed"]["resource_id"]
        )
        unavailable_reconciliation = assert_unavailable_actions(runtime)
    summary = {
        "project_ref": PROJECT_REF,
        "organization_id": IDS["org"],
        "organization_classification": "disposable_synthetic_demo",
        "official_source_uri": SOURCE_URI,
        "official_source_sha256": hashlib.sha256(source).hexdigest(),
        "dataset_sha256": hashlib.sha256(
            (evidence_dir / "hsn-481910-demo.json").read_bytes()
        ).hexdigest(),
        "reference_scope": "demo subset; not a complete production tax dataset",
        "transaction_scope": "canonical day-to-day purchase, sales, inventory, return, and settlement actions",
        "purchase_order_reconciliation": purchase_reconciliation,
        "supplier_advance_reconciliation": advance_reconciliation,
        "goods_receipt_reconciliation": receipt_reconciliation,
        "supplier_invoice_reconciliation": supplier_invoice_reconciliation,
        "supplier_payment_reconciliation": supplier_payment_reconciliation,
        "sales_order_reconciliation": reconciliation,
        "sales_dispatch_reconciliation": dispatch_reconciliation,
        "sales_invoice_reconciliation": invoice_reconciliation,
        "customer_receipt_reconciliation": customer_receipt_reconciliation,
        "sales_return_reconciliation": sales_return_reconciliation,
        "purchase_return_reconciliation": purchase_return_reconciliation,
        "inventory_adjustment_reconciliation": adjustment_reconciliation,
        "unavailable_action_reconciliation": unavailable_reconciliation,
        "challan_evidence": {
            "supplier_challan_number": receipt_payload["supplier_challan_number"],
            "supplier_challan_date": receipt_payload["supplier_challan_date"],
            "dispatch_delivery_challan_number": dispatch_request["logistics"][
                "transport_document_number"
            ],
            "purchase_return_delivery_challan_number": purchase_return_request[
                "logistics"
            ]["transport_document_number"],
        },
    }
    (evidence_dir / "canonical-demo-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"canonical demo provisioning failed: {exc}", file=sys.stderr)
        raise
