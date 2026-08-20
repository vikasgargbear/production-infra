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
CLIENT_ID = "aasopharma-canonical-staging-demo-v2"

IDS = {
    "org": "d3000000-0000-7000-8000-000000000001",
    "auth_user": "d3000000-0000-7000-8000-000000000002",
    "user": "d3000000-0000-7000-8000-000000000003",
    "membership": "d3000000-0000-7000-8000-000000000004",
    "branch": "d3000000-0000-7000-8000-000000000005",
    "role": "d3000000-0000-7000-8000-000000000006",
    "access_grant": "d3000000-0000-7000-8000-000000000007",
    "safety_setting": "d3000000-0000-7000-8000-000000000008",
    "agent_grant": "d3000000-0000-7000-8000-000000000021",
    "approver_auth_user": "d3000000-0000-7000-8000-000000000022",
    "approver_user": "d3000000-0000-7000-8000-000000000023",
    "approver_membership": "d3000000-0000-7000-8000-000000000024",
    "approver_access_grant": "d3000000-0000-7000-8000-000000000025",
    "approver_agent_grant": "d3000000-0000-7000-8000-000000000026",
    "customer_party": "d3000000-0000-7000-8000-000000000010",
    "customer_account": "d3000000-0000-7000-8000-000000000011",
    "customer_address": "d3000000-0000-7000-8000-000000000012",
    "manufacturer_party": "d3000000-0000-7000-8000-000000000013",
    "receivable_account": "d3000000-0000-7000-8000-000000000014",
    "product": "d3000000-0000-7000-8000-000000000015",
    "uom_conversion": "d3000000-0000-7000-8000-000000000016",
    "sales_order_sequence": "d3000000-0000-7000-8000-000000000017",
    "customer_gstin": "d3000000-0000-7000-8000-000000000018",
    "request": "d3000000-0000-7000-8000-000000000019",
    "tax_release": "d3100000-0000-7000-8000-000000000001",
    "tax_version": "d3100000-0000-7000-8000-000000000002",
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


def bootstrap_identity(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO auth.users (id) VALUES (%s), (%s) ON CONFLICT (id) DO NOTHING",
            (IDS["auth_user"], IDS["approver_auth_user"]),
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
            (IDS["org"], IDS["membership"], IDS["membership"]),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Business Operator', 'active')
            ON CONFLICT (id) DO NOTHING
            """,
            (IDS["user"], IDS["auth_user"]),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Independent Approver', 'active')
            ON CONFLICT (id) DO NOTHING
            """,
            (IDS["approver_user"], IDS["approver_auth_user"]),
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
                IDS["org"], IDS["membership"], IDS["user"],
                IDS["membership"], IDS["membership"],
            ),
        )
        cursor.execute(
            "SELECT set_config('app.membership_id', %s, true)",
            (IDS["membership"],),
        )
        cursor.execute(
            "SELECT set_config('app.user_id', %s, true)", (IDS["user"],)
        )
        cursor.execute(
            "SELECT set_config('app.auth_user_id', %s, true)", (IDS["auth_user"],)
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
                IDS["org"], IDS["approver_membership"], IDS["approver_user"],
                IDS["membership"], IDS["membership"],
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
            (IDS["org"], IDS["branch"], IDS["membership"], IDS["membership"]),
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
            (IDS["org"], IDS["role"], IDS["membership"], IDS["membership"]),
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
                (IDS["org"], IDS["role"], permission, IDS["membership"])
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
                IDS["org"], IDS["access_grant"], IDS["membership"],
                IDS["role"], IDS["membership"],
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
                IDS["org"], IDS["approver_access_grant"],
                IDS["approver_membership"], IDS["role"], IDS["membership"],
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
            (IDS["org"], IDS["safety_setting"], IDS["membership"], IDS["membership"]),
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
                extensions.digest('canonical staging demo consent; INR 2000 maximum','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["agent_grant"], IDS["membership"], CLIENT_ID,
                IDS["membership"], IDS["membership"], IDS["membership"], IDS["membership"],
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
                'admin_approved', 'demo-v2',
                extensions.digest('canonical staging independent approval consent','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["approver_agent_grant"],
                IDS["approver_membership"], CLIENT_ID,
                IDS["approver_membership"], IDS["membership"],
                IDS["membership"], IDS["membership"],
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
                (IDS["org"], IDS["agent_grant"], *capability, IDS["membership"])
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
                %s, %s, 'automation.command.approve', 'write',
                'consequential_write', 'actor_confirmation', NULL, NULL,
                false, 'active', %s
            ) ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
            """,
            (IDS["org"], IDS["approver_agent_grant"], IDS["membership"]),
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
                IDS["user"],
                IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["tax_release"],):
            raise RuntimeError("regulatory importer returned an unexpected release")


def seed_business_master(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["membership"]),
            ("app.user_id", IDS["user"]),
            ("app.auth_user_id", IDS["auth_user"]),
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
            (IDS["org"], IDS["receivable_account"], IDS["membership"], IDS["membership"]),
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
                (IDS["org"], party_id, name, pan, IDS["membership"], IDS["membership"])
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
                (IDS["membership"], IDS["org"], party_id)
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
                SOURCE_RETRIEVED_ON, IDS["membership"], IDS["membership"],
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
                SOURCE_RETRIEVED_ON, IDS["membership"], IDS["membership"],
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
                IDS["receivable_account"], IDS["membership"], IDS["membership"],
            ),
        )
        cursor.execute("SELECT count(*) FROM catalog.units_of_measure WHERE code='EA' AND status='active'")
        if cursor.fetchone() != (1,):
            raise RuntimeError("canonical EA unit of measure is unavailable")
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
                IDS["membership"], IDS["membership"],
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
                SOURCE_RETRIEVED_ON, IDS["membership"],
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
            (IDS["org"], IDS["sales_order_sequence"], IDS["branch"], IDS["membership"], IDS["membership"]),
        )


def seed_end_to_end_master(connection) -> None:
    """Add the synthetic supplier, tax, inventory, banking, and ledger facts."""

    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["membership"]),
            ("app.user_id", IDS["user"]),
            ("app.auth_user_id", IDS["auth_user"]),
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
                    SOURCE_RETRIEVED_ON, date(2034, 8, 20), IDS["membership"],
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
                'Synthetic Medicines Distributor','DEMOB1234C','resident','company',
                'verified',%s,transaction_timestamp(),'draft',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_party"], IDS["tax_profile_evidence"],
                IDS["membership"], IDS["membership"],
            ),
        )
        cursor.execute(
            """
            UPDATE parties.parties
               SET status='active',row_version=row_version+1,
                   updated_by_membership_id=%s
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            (IDS["membership"], IDS["org"], IDS["supplier_party"]),
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
                SOURCE_RETRIEVED_ON, IDS["membership"], IDS["membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.tax_registrations (
                org_id,id,party_id,registration_type,registration_number,
                registered_legal_name,state_code,taxpayer_type,valid_from,
                verified_at,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'GSTIN','27DEMOB1234C1Z5',
                'Synthetic Medicines Distributor Private Limited','27','regular',%s,
                transaction_timestamp(),'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_gstin"], IDS["supplier_party"],
                SOURCE_RETRIEVED_ON, IDS["membership"], IDS["membership"],
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
                (IDS["org"], *row, IDS["membership"], IDS["membership"])
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
                IDS["payable_account"], IDS["membership"], IDS["membership"],
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
                IDS["membership"], IDS["membership"],
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
                    role, account_id, IDS["membership"], IDS["membership"],
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
                IDS["membership"], IDS["membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.registration_branches (
                org_id,registration_id,branch_id,place_of_business_kind,
                effective_from,status,created_by_membership_id
            ) VALUES (%s,%s,%s,'principal',%s,'active',%s)
            ON CONFLICT (org_id,registration_id,branch_id) DO NOTHING
            """,
            (
                IDS["org"], IDS["org_gst_registration"], IDS["branch"],
                SOURCE_RETRIEVED_ON, IDS["membership"],
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
                (IDS["org"], IDS["saleable_location"], IDS["branch"], "SALE-DEMO", "Demo saleable stock", "saleable", True, IDS["membership"], IDS["membership"]),
                (IDS["org"], IDS["quarantine_location"], IDS["branch"], "QUAR-DEMO", "Demo returned quarantine", "quarantine", False, IDS["membership"], IDS["membership"]),
            ],
        )
        cursor.execute(
            """
            INSERT INTO tax.organization_fiscal_tax_facts (
                org_id,id,fiscal_year_start_year,effective_from,effective_to,
                organization_person_type,prior_fiscal_year_turnover,
                gst_tds_notified_deductor,einvoice_exemption_code,
                evidence_attachment_id,verified_at,verified_by_membership_id,status,
                created_by_membership_id
            ) VALUES (
                %s,%s,2026,DATE '2026-04-01',DATE '2027-03-31','company',50000000,
                false,'NONE',%s,transaction_timestamp(),%s,'active',%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["fiscal_tax_fact"], IDS["fiscal_fact_evidence"],
                IDS["membership"], IDS["membership"],
            ),
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
                    IDS["membership"], IDS["membership"],
                )
                for document_type, prefix in sorted(sequence_types.items())
            ],
        )


def activate_demo_product(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["auth_user"], IDS["org"]))
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


def token(operation: str, permission: str, *, command_id: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    claims: dict[str, Any] = {
        "operator_delegated": True,
        "token_profile": "canonical_operator_delegation_v1",
        "operator_operation": operation,
        "operator_permission": permission,
        "operator_organization_scope": True,
        "mcp_client_id": CLIENT_ID,
        "branch_ids": [IDS["branch"]],
        "auth_user_id": IDS["auth_user"],
        "user_id": IDS["user"],
        "org_id": IDS["org"],
        "membership_id": IDS["membership"],
        "agent_grant_id": IDS["agent_grant"],
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "sub": IDS["auth_user"],
        "iss": "aasopharma-api",
        "aud": "aasopharma-api",
        "token_use": "access",
    }
    if command_id:
        claims["operator_command_request_id"] = command_id
    return jwt.encode(claims, required("JWT_SECRET_KEY"), algorithm="HS256")


def api_call(method: str, path: str, operation: str, permission: str, payload=None, command_id=None):
    response = requests.request(
        method,
        required("CANONICAL_DEMO_API_URL").rstrip("/") + path,
        timeout=90,
        headers={
            "Authorization": f"Bearer {required('MCP_INTERNAL_SERVICE_TOKEN')}",
            "X-MCP-Delegated-Authorization": f"Bearer {token(operation, permission, command_id=command_id)}",
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


def preflight_sales_order(payload: dict[str, Any], evidence_dir: Path) -> None:
    """Resolve and calculate without persisting, so live failures remain diagnosable."""
    identity = (
        f"aasopharma:{IDS['org']}:{IDS['membership']}:sales.order.prepare:"
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
                    IDS["membership"],
                    IDS["auth_user"],
                    IDS["user"],
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
                            auth_user_id=UUID(IDS["auth_user"]),
                            user_id=UUID(IDS["user"]),
                            organization_id=UUID(IDS["org"]),
                            membership_id=UUID(IDS["membership"]),
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
            (IDS["auth_user"], IDS["org"]),
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
        return result


def main() -> int:
    assert_target()
    evidence_dir = Path(required("CANONICAL_DEMO_EVIDENCE_DIR"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    source = fetch_official_source(evidence_dir)

    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        bootstrap_identity(bootstrap)
        release_exists = demo_tax_release_exists(bootstrap)
    with psycopg2.connect(required("ERP_REGULATORY_IMPORTER_DATABASE_URL")) as importer:
        dataset_bytes = canonical_dataset_bytes(importer)
        (evidence_dir / "hsn-481910-demo.json").write_bytes(dataset_bytes)
        if not release_exists:
            import_tax_release(importer, source, dataset_bytes)
    with psycopg2.connect(required("PSYCOPG_DATABASE_URL")) as bootstrap:
        seed_business_master(bootstrap)
        seed_end_to_end_master(bootstrap)
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        activate_demo_product(runtime)

    payload = sales_order_payload()
    preflight_sales_order(payload, evidence_dir)
    journey = exercise_sales_order(evidence_dir, payload)
    with psycopg2.connect(required("ERP_RUNTIME_DATABASE_URL")) as runtime:
        reconciliation = reconcile(runtime, journey["executed"])
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
        "transaction_scope": "sales.order prepare/approve/execute",
        "reconciliation": reconciliation,
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
