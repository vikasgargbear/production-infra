#!/usr/bin/env python3
"""Build the exact, head-bound authority for an organization-scoped purge.

There is deliberately no whole-database reset.  Destructive execution requires
one exact organization UUID and a typed acknowledgement.  At runtime every
deleted relation must prove a mandatory UUID ``org_id`` column and a reviewed
foreign-key path to ``core.organizations(id)``.  Shared rows, users, other
organizations, schemas, roles, sequences, and storage objects are never reset.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Iterable, Mapping, Sequence
from uuid import UUID

try:  # Imported as ``scripts.*`` by pytest and directly by the workflow CLI.
    from scripts.canonical_migration_contract import MigrationContract, load_contract
except ModuleNotFoundError:  # pragma: no cover - exercised by direct CLI execution
    from canonical_migration_contract import MigrationContract, load_contract


CONTRACT_VERSION = "canonical-organization-purge-v2"
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
EXPECTED_CANONICAL_RELATION_COUNT = 120
EXPECTED_EPHEMERAL_RELATION_COUNT = 9
EXPECTED_ALEMBIC_SCHEMA_COUNT = 30
RESET_LOCK_KEY = 8_260_826_2
EXPECTED_ORGANIZATION_RELATION_COUNT = 104
ORGANIZATION_CONFIRMATION_PREFIX = "DELETE-ORGANIZATION:"
TRANSITIVE_ORGANIZATION_RELATIONS = frozenset(
    {
        "tax.input_credit_applications",
        "tax.input_credit_lots",
        "tax.input_credit_reversal_events",
    }
)
MANAGED_ROLES = (
    "erp_app",
    "erp_calculator",
    "erp_migration_owner",
    "erp_regulatory_importer",
    "erp_runtime",
    "erp_tax_provider",
)
LOGIN_ROLES = frozenset(
    {
        "erp_calculator",
        "erp_regulatory_importer",
        "erp_runtime",
        "erp_tax_provider",
    }
)

CANONICAL_SCHEMAS = (
    "automation",
    "calculation",
    "catalog",
    "compliance",
    "core",
    "finance",
    "hr",
    "inventory",
    "parties",
    "procurement",
    "sales",
    "tax",
)

# These rows are inserted deterministically by Alembic.  A data-only reset at
# the current head must retain them because ``alembic upgrade head`` is a no-op.
PRESERVED_SEED_RELATIONS = (
    "catalog.units_of_measure",
    "core.permissions",
    "tax.gst_jurisdiction_releases",
    "tax.gst_jurisdiction_versions",
    "tax.gst_jurisdictions",
)

# Transaction-local guard rows are not business data, but a reset must still
# clear any residue from a previously interrupted command.  No other erp_*
# relation may appear without an explicit contract revision.
EPHEMERAL_SCOPE_RELATIONS = (
    "erp_automation_commands.execution_scopes",
    "erp_automation_commands.write_scopes",
    "erp_compliance_commands.command_scopes",
    "erp_commercial_commands.reversal_scopes",
    "erp_core_commands.command_scopes",
    "erp_finance_commands.command_scopes",
    "erp_regulatory_commands.command_scopes",
    "erp_tax_provider_commands.command_scopes",
    "erp_trade_commands.command_scopes",
)

CREATE_TABLE = re.compile(
    r'(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'
    r'"?(?P<schema>[a-z_][a-z0-9_]*)"?\."?'
    r'(?P<table>[a-z_][a-z0-9_]*)"?\s*\('
)
CREATE_SCHEMA = re.compile(
    r'(?im)^\s*CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?'
    r'"?(?P<schema>[a-z_][a-z0-9_]*)"?(?:\s|;)'
)
QUALIFIED_RELATION = re.compile(r"^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$")
SIMPLE_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class ResetAuthorityError(RuntimeError):
    """Raised when reset scope cannot be proven exact and non-destructive."""


@dataclass(frozen=True)
class CatalogSnapshot:
    alembic_head: str
    alembic_schemas: tuple[str, ...]
    canonical_relations: tuple[str, ...]
    ephemeral_scope_relations: tuple[str, ...]
    relation_oids: tuple[tuple[str, int], ...]
    schema_oids: tuple[tuple[str, int], ...]
    auth_schema_present: bool
    storage_schema_present: bool

    def fingerprint_sha256(self) -> str:
        value = {
            "alembic_head": self.alembic_head,
            "alembic_schemas": list(self.alembic_schemas),
            "canonical_relations": list(self.canonical_relations),
            "ephemeral_scope_relations": list(self.ephemeral_scope_relations),
        }
        return hashlib.sha256(_canonical_json(value)).hexdigest()


@dataclass(frozen=True)
class ResetAuthority:
    alembic_head: str
    alembic_schemas: tuple[str, ...]
    canonical_relations: tuple[str, ...]
    preserved_seed_relations: tuple[str, ...]
    reset_relations: tuple[str, ...]
    ephemeral_scope_relations: tuple[str, ...]

    def manifest(self) -> dict[str, object]:
        return {
            "contract_version": CONTRACT_VERSION,
            "alembic_head": self.alembic_head,
            "alembic_schema_count": len(self.alembic_schemas),
            "alembic_schemas": list(self.alembic_schemas),
            "canonical_relation_count": len(self.canonical_relations),
            "canonical_relations": list(self.canonical_relations),
            "preserved_seed_relation_count": len(self.preserved_seed_relations),
            "preserved_seed_relations": list(self.preserved_seed_relations),
            "reset_relation_count": len(self.reset_relations),
            "reset_relations": list(self.reset_relations),
            "ephemeral_scope_relation_count": len(self.ephemeral_scope_relations),
            "ephemeral_scope_relations": list(self.ephemeral_scope_relations),
            "organization_scope_column": "org_id",
            "expected_organization_relation_count": (
                EXPECTED_ORGANIZATION_RELATION_COUNT
            ),
            "whole_database_reset_available": False,
        }

    def manifest_sha256(self) -> str:
        return hashlib.sha256(_canonical_json(self.manifest())).hexdigest()

    def envelope(self) -> dict[str, object]:
        manifest = self.manifest()
        return {
            "manifest": manifest,
            "manifest_sha256": hashlib.sha256(_canonical_json(manifest)).hexdigest(),
        }

    def validate_observed_catalog(
        self,
        *,
        alembic_head: str,
        alembic_schemas: Sequence[str],
        canonical_relations: Sequence[str],
        ephemeral_scope_relations: Sequence[str],
    ) -> None:
        if alembic_head != self.alembic_head:
            raise ResetAuthorityError(
                "observed Alembic head differs from reset authority: "
                f"expected={self.alembic_head} observed={alembic_head}"
            )
        _require_exact_sequence(
            alembic_schemas,
            self.alembic_schemas,
            "observed Alembic schemas",
        )
        _require_exact_sequence(
            canonical_relations,
            self.canonical_relations,
            "observed canonical relations",
        )
        _require_exact_sequence(
            ephemeral_scope_relations,
            self.ephemeral_scope_relations,
            "observed ephemeral scope relations",
        )


def _canonical_json(value: Mapping[str, object]) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("utf-8")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _quote_relation(value: str) -> str:
    if QUALIFIED_RELATION.fullmatch(value) is None:
        raise ResetAuthorityError(f"invalid qualified relation: {value!r}")
    schema, relation = value.split(".", 1)
    return f'"{schema}"."{relation}"'


def _quote_identifier(value: str) -> str:
    if SIMPLE_IDENTIFIER.fullmatch(value) is None:
        raise ResetAuthorityError(f"invalid database identifier: {value!r}")
    return f'"{value}"'


def _require_unique(values: Sequence[str], label: str) -> None:
    duplicates = sorted({item for item in values if values.count(item) > 1})
    if duplicates:
        raise ResetAuthorityError(f"{label} contain duplicates: {', '.join(duplicates)}")


def _require_exact_sequence(
    observed: Sequence[str], expected: Sequence[str], label: str
) -> None:
    values = tuple(observed)
    _require_unique(values, label)
    if tuple(sorted(values)) != tuple(sorted(expected)):
        missing = sorted(set(expected) - set(values))
        extra = sorted(set(values) - set(expected))
        raise ResetAuthorityError(
            f"{label} differ from reset authority; missing={missing} extra={extra}"
        )


def _created_objects(
    contract: MigrationContract, repository_root: Path
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    relations: list[str] = []
    schemas: list[str] = []
    for relative_path in contract.required_files:
        if not relative_path.endswith(".sql"):
            continue
        sql = (repository_root / relative_path).read_text(encoding="utf-8")
        relations.extend(
            f"{match.group('schema')}.{match.group('table')}"
            for match in CREATE_TABLE.finditer(sql)
        )
        schemas.extend(match.group("schema") for match in CREATE_SCHEMA.finditer(sql))
    _require_unique(relations, "Alembic CREATE TABLE declarations")
    _require_unique(schemas, "Alembic CREATE SCHEMA declarations")
    return tuple(sorted(relations)), tuple(sorted(schemas))


def classify_relations(
    *,
    alembic_head: str,
    created_relations: Iterable[str],
    created_schemas: Iterable[str],
) -> ResetAuthority:
    declared = tuple(created_relations)
    _require_unique(declared, "Alembic-created relations")
    if any(QUALIFIED_RELATION.fullmatch(item) is None for item in declared):
        raise ResetAuthorityError("Alembic relation names must be schema-qualified")
    schemas = tuple(created_schemas)
    _require_unique(schemas, "Alembic-created schemas")
    if len(schemas) != EXPECTED_ALEMBIC_SCHEMA_COUNT:
        raise ResetAuthorityError(
            "Alembic schema count drifted: "
            f"expected={EXPECTED_ALEMBIC_SCHEMA_COUNT} observed={len(schemas)}"
        )
    relation_schemas = {item.split(".", 1)[0] for item in declared}
    missing_relation_schemas = sorted(relation_schemas - set(schemas))
    if missing_relation_schemas:
        raise ResetAuthorityError(
            "relations use undeclared Alembic schemas: "
            + ", ".join(missing_relation_schemas)
        )

    canonical = tuple(
        sorted(item for item in declared if item.split(".", 1)[0] in CANONICAL_SCHEMAS)
    )
    ephemeral = tuple(sorted(set(declared) & set(EPHEMERAL_SCOPE_RELATIONS)))
    classified = set(canonical) | set(ephemeral)
    unclassified = sorted(
        item
        for item in declared
        if item.split(".", 1)[0].startswith("erp_") and item not in classified
    )
    if unclassified:
        raise ResetAuthorityError(
            "Alembic-owned ERP relations lack reset classification: "
            + ", ".join(unclassified)
        )
    if len(canonical) != EXPECTED_CANONICAL_RELATION_COUNT:
        raise ResetAuthorityError(
            "canonical relation count drifted: "
            f"expected={EXPECTED_CANONICAL_RELATION_COUNT} observed={len(canonical)}"
        )
    _require_exact_sequence(
        ephemeral,
        EPHEMERAL_SCOPE_RELATIONS,
        "Alembic ephemeral scope relations",
    )
    missing_seeds = sorted(set(PRESERVED_SEED_RELATIONS) - set(canonical))
    if missing_seeds:
        raise ResetAuthorityError(
            "deterministic seed relations are absent: " + ", ".join(missing_seeds)
        )

    reset_relations = tuple(sorted(set(canonical) - set(PRESERVED_SEED_RELATIONS)))
    if len(reset_relations) != 115:
        raise ResetAuthorityError(
            f"reset relation count drifted: expected=115 observed={len(reset_relations)}"
        )
    if set(reset_relations) & set(PRESERVED_SEED_RELATIONS):
        raise ResetAuthorityError("preserved seed relation entered reset scope")

    return ResetAuthority(
        alembic_head=alembic_head,
        alembic_schemas=tuple(sorted(schemas)),
        canonical_relations=canonical,
        preserved_seed_relations=tuple(sorted(PRESERVED_SEED_RELATIONS)),
        reset_relations=reset_relations,
        ephemeral_scope_relations=tuple(sorted(EPHEMERAL_SCOPE_RELATIONS)),
    )


def load_reset_authority(
    *, repository_root: Path | None = None, contract: MigrationContract | None = None
) -> ResetAuthority:
    migration_contract = contract or load_contract()
    root = repository_root or Path(__file__).resolve().parents[2]
    relations, schemas = _created_objects(migration_contract, root)
    return classify_relations(
        alembic_head=migration_contract.head,
        created_relations=relations,
        created_schemas=schemas,
    )


def _catalog_snapshot(
    cursor: Any, alembic_schemas: Sequence[str]
) -> CatalogSnapshot:
    cursor.execute("SELECT version_num FROM public.alembic_version")
    head_rows = cursor.fetchall()
    if len(head_rows) != 1 or not isinstance(head_rows[0][0], str):
        raise ResetAuthorityError("database must contain exactly one Alembic head")
    head = str(head_rows[0][0])

    cursor.execute(
        """
        SELECT namespace.nspname, relation.relname, relation.oid
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid=relation.relnamespace
         WHERE relation.relkind IN ('r','p')
           AND namespace.nspname=ANY(%s)
         ORDER BY namespace.nspname, relation.relname
        """,
        (list(CANONICAL_SCHEMAS),),
    )
    canonical_rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT namespace.nspname, relation.relname, relation.oid
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid=relation.relnamespace
         WHERE relation.relkind IN ('r','p')
           AND namespace.nspname LIKE 'erp\\_%' ESCAPE '\\'
         ORDER BY namespace.nspname, relation.relname
        """
    )
    ephemeral_rows = cursor.fetchall()

    all_schemas = sorted(alembic_schemas)
    cursor.execute(
        """
        SELECT namespace.nspname, namespace.oid
          FROM pg_catalog.pg_namespace AS namespace
         WHERE namespace.nspname=ANY(%s)
         ORDER BY namespace.nspname
        """,
        (all_schemas,),
    )
    schema_oids = tuple((str(name), int(oid)) for name, oid in cursor.fetchall())
    if tuple(name for name, _ in schema_oids) != tuple(all_schemas):
        raise ResetAuthorityError("canonical reset schema set is incomplete")

    cursor.execute(
        "SELECT pg_catalog.to_regnamespace('auth') IS NOT NULL, "
        "pg_catalog.to_regnamespace('storage') IS NOT NULL"
    )
    presence = cursor.fetchone()
    if presence is None:
        raise ResetAuthorityError("could not verify managed Supabase schemas")

    canonical = tuple(f"{schema}.{name}" for schema, name, _ in canonical_rows)
    ephemeral = tuple(f"{schema}.{name}" for schema, name, _ in ephemeral_rows)
    relation_oids = tuple(
        (f"{schema}.{name}", int(oid))
        for schema, name, oid in (*canonical_rows, *ephemeral_rows)
    )
    return CatalogSnapshot(
        alembic_head=head,
        alembic_schemas=tuple(name for name, _ in schema_oids),
        canonical_relations=canonical,
        ephemeral_scope_relations=ephemeral,
        relation_oids=tuple(sorted(relation_oids)),
        schema_oids=schema_oids,
        auth_schema_present=bool(presence[0]),
        storage_schema_present=bool(presence[1]),
    )


def _role_snapshot(cursor: Any) -> tuple[tuple[object, ...], ...]:
    cursor.execute(
        """
        SELECT role.rolname, role.oid, role.rolcanlogin, role.rolsuper,
               role.rolinherit, role.rolcreaterole, role.rolcreatedb,
               role.rolreplication, role.rolbypassrls, role.rolconnlimit,
               role.rolvaliduntil
          FROM pg_catalog.pg_roles AS role
         WHERE role.rolname=ANY(%s)
         ORDER BY role.rolname
        """,
        (list(MANAGED_ROLES),),
    )
    roles = tuple(tuple(row) for row in cursor.fetchall())
    if tuple(str(row[0]) for row in roles) != MANAGED_ROLES:
        raise ResetAuthorityError("canonical managed role set is incomplete")
    for row in roles:
        (
            role_name, _, can_login, superuser, _, create_role, create_db,
            replication, bypass_rls, *_,
        ) = row
        expected_login = role_name in LOGIN_ROLES
        if (
            bool(can_login) is not expected_login
            or bool(superuser)
            or bool(create_role)
            or bool(create_db)
            or bool(replication)
            or bool(bypass_rls) is not (role_name == "erp_migration_owner")
        ):
            raise ResetAuthorityError(f"unsafe canonical role posture: {role_name}")

    cursor.execute(
        """
        SELECT granted.rolname, member.rolname, membership.admin_option,
               to_jsonb(membership)->>'inherit_option',
               to_jsonb(membership)->>'set_option'
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS granted ON granted.oid=membership.roleid
          JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
         WHERE granted.rolname=ANY(%s) OR member.rolname=ANY(%s)
         ORDER BY granted.rolname, member.rolname
        """,
        (list(MANAGED_ROLES), list(MANAGED_ROLES)),
    )
    memberships = tuple(tuple(row) for row in cursor.fetchall())
    return (*roles, ("__memberships__", memberships))


def _role_password_presence(cursor: Any) -> tuple[tuple[str, bool], ...]:
    """Read password-presence booleans from the privileged unmasked catalog."""

    cursor.execute(
        """
        SELECT role.rolname, role.rolpassword IS NOT NULL
          FROM pg_catalog.pg_authid AS role
         WHERE role.rolname=ANY(%s)
         ORDER BY role.rolname
        """,
        (list(MANAGED_ROLES),),
    )
    presence = tuple((str(name), bool(has_password)) for name, has_password in cursor.fetchall())
    if tuple(name for name, _ in presence) != MANAGED_ROLES:
        raise ResetAuthorityError("canonical managed role credential set is incomplete")
    return presence


def verify_post_cleanup_role_state(connection: Any, *, project_ref: str) -> dict[str, object]:
    """Attest role posture after temporary migration delegation is revoked."""

    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise ResetAuthorityError("role cleanup verification is restricted to canonical staging")
    with connection:
        with connection.cursor() as cursor:
            roles = _role_snapshot(cursor)
            role_rows = roles[:-1]
            password_presence = _role_password_presence(cursor)
            cursor.execute(
                """
                WITH RECURSIVE identity AS (
                    SELECT oid, rolinherit, rolsuper
                      FROM pg_catalog.pg_roles
                     WHERE rolname=current_user
                ), set_path(roleid) AS (
                    SELECT oid FROM identity
                    UNION
                    SELECT membership.roleid
                      FROM set_path AS prior
                      JOIN pg_catalog.pg_auth_members AS membership
                        ON membership.member=prior.roleid
                     WHERE CASE
                             WHEN current_setting('server_version_num')::integer >= 160000
                             THEN COALESCE(
                               (to_jsonb(membership)->>'set_option')::boolean,
                               false
                             )
                             ELSE true
                           END
                ), usage_path(roleid) AS (
                    SELECT oid FROM identity
                    UNION
                    SELECT membership.roleid
                      FROM usage_path AS prior
                      JOIN pg_catalog.pg_auth_members AS membership
                        ON membership.member=prior.roleid
                      JOIN pg_catalog.pg_roles AS member_role
                        ON member_role.oid=membership.member
                     WHERE CASE
                             WHEN current_setting('server_version_num')::integer >= 160000
                             THEN COALESCE(
                               (to_jsonb(membership)->>'inherit_option')::boolean,
                               false
                             )
                             ELSE member_role.rolinherit
                           END
                ), direct_membership AS (
                    SELECT COALESCE(bool_or(
                             CASE
                               WHEN membership.member IS NULL THEN false
                               WHEN current_setting('server_version_num')::integer >= 160000
                               THEN COALESCE(
                                 (to_jsonb(membership)->>'set_option')::boolean,
                                 false
                               )
                               ELSE true
                             END
                           ),false) AS set_option,
                           COALESCE(bool_or(
                             CASE
                               WHEN membership.member IS NULL THEN false
                               WHEN current_setting('server_version_num')::integer >= 160000
                               THEN COALESCE(
                                 (to_jsonb(membership)->>'inherit_option')::boolean,
                                 false
                               )
                               ELSE identity.rolinherit
                             END
                           ),false) AS inherit_option
                      FROM identity
                 LEFT JOIN pg_catalog.pg_auth_members AS membership
                        ON membership.roleid=(
                             SELECT oid FROM pg_catalog.pg_roles
                              WHERE rolname='erp_migration_owner'
                           )
                       AND membership.member=identity.oid
                )
                SELECT EXISTS (
                         SELECT 1 FROM set_path
                          WHERE roleid='erp_migration_owner'::regrole::oid
                       ) AS delegated_set_path,
                       EXISTS (
                         SELECT 1 FROM usage_path
                          WHERE roleid='erp_migration_owner'::regrole::oid
                       ) AS delegated_usage_path,
                       direct_membership.set_option,
                       direct_membership.inherit_option,
                       identity.rolsuper AS verification_principal_superuser
                  FROM direct_membership CROSS JOIN identity
                """
            )
            delegation = cursor.fetchone()
            if (
                delegation is None
                or len(delegation) != 5
                or delegation[:4] != (False, False, False, False)
                or not isinstance(delegation[4], bool)
            ):
                raise ResetAuthorityError(
                    "postgres retains temporary migration-owner delegation"
                )
            verification_principal_superuser = delegation[4]
            login_password_present_count = sum(
                present for role, present in password_presence if role in LOGIN_ROLES
            )
            nonlogin_password_present_count = sum(
                present for role, present in password_presence if role not in LOGIN_ROLES
            )
            if login_password_present_count != len(LOGIN_ROLES):
                raise ResetAuthorityError(
                    "canonical login-role password presence is incomplete"
                )
            if nonlogin_password_present_count:
                raise ResetAuthorityError(
                    "canonical NOLOGIN roles retain stored passwords"
                )

    serializable_roles = json.loads(json.dumps(roles, default=str))
    role_catalog_sha256 = hashlib.sha256(
        _canonical_json(
            {
                "roles": serializable_roles,
                "password_presence": [list(item) for item in password_presence],
            }
        )
    ).hexdigest()
    return {
        "contract_version": CONTRACT_VERSION,
        "project_ref": project_ref,
        "managed_role_count": len(role_rows),
        "login_role_count": len(LOGIN_ROLES),
        "login_role_password_present_count": login_password_present_count,
        "nonlogin_role_password_present_count": nonlogin_password_present_count,
        "migration_owner_authority_semantics": "explicit_pg_auth_members_paths",
        "postgres_migration_owner_set": False,
        "postgres_migration_owner_usage": False,
        "verification_principal_superuser": verification_principal_superuser,
        "role_catalog_sha256": role_catalog_sha256,
        "verified_at": _utc_now(),
    }


def _seed_digest(cursor: Any, relations: Sequence[str]) -> str:
    digest = hashlib.sha256()
    for relation in sorted(relations):
        digest.update(len(relation).to_bytes(4, "big"))
        digest.update(relation.encode("ascii"))
        cursor.execute(
            f"SELECT pg_catalog.to_jsonb(seed_row)::text "
            f"FROM {_quote_relation(relation)} AS seed_row "
            'ORDER BY pg_catalog.to_jsonb(seed_row)::text COLLATE "C"'
        )
        for (serialized,) in cursor.fetchall():
            encoded = str(serialized).encode("utf-8")
            digest.update(len(encoded).to_bytes(8, "big"))
            digest.update(encoded)
    return digest.hexdigest()


def _normalize_organization_id(value: str) -> str:
    try:
        parsed = UUID(value)
    except (AttributeError, TypeError, ValueError) as error:
        raise ResetAuthorityError("organization id must be a canonical UUID") from error
    normalized = str(parsed)
    if value != normalized or parsed.int == 0:
        raise ResetAuthorityError("organization id must be a canonical non-zero UUID")
    return normalized


def organization_confirmation(organization_id: str) -> str:
    normalized = _normalize_organization_id(organization_id)
    return f"{ORGANIZATION_CONFIRMATION_PREFIX}{normalized}"


def _organization_relations(
    cursor: Any, authority: ResetAuthority
) -> tuple[str, ...]:
    """Prove and return the complete tenant-keyed canonical relation set."""

    cursor.execute(
        """
        SELECT namespace.nspname || '.' || relation.relname AS qualified_name,
               pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),
               attribute.attnotnull,
               EXISTS (
                 SELECT 1
                   FROM pg_catalog.pg_constraint AS foreign_key
                  WHERE foreign_key.contype='f'
                    AND foreign_key.conrelid=relation.oid
                    AND foreign_key.confrelid='core.organizations'::regclass
                    AND foreign_key.conkey=ARRAY[attribute.attnum]::smallint[]
                    AND foreign_key.confkey=ARRAY[(
                      SELECT organization_id.attnum
                        FROM pg_catalog.pg_attribute AS organization_id
                       WHERE organization_id.attrelid='core.organizations'::regclass
                         AND organization_id.attname='id'
                         AND organization_id.attnum>0
                         AND NOT organization_id.attisdropped
                    )]::smallint[]
               ) AS direct_organization_foreign_key,
               EXISTS (
                 SELECT 1
                   FROM pg_catalog.pg_constraint AS foreign_key
                   JOIN pg_catalog.pg_class AS target_relation
                     ON target_relation.oid=foreign_key.confrelid
                   JOIN pg_catalog.pg_namespace AS target_namespace
                     ON target_namespace.oid=target_relation.relnamespace
                  WHERE foreign_key.contype='f'
                    AND foreign_key.conrelid=relation.oid
                    AND target_namespace.nspname=ANY(%s)
                    AND EXISTS (
                      SELECT 1
                        FROM pg_catalog.generate_subscripts(
                               foreign_key.conkey,1
                             ) AS position
                        JOIN pg_catalog.pg_attribute AS target_attribute
                          ON target_attribute.attrelid=foreign_key.confrelid
                         AND target_attribute.attnum=foreign_key.confkey[position]
                       WHERE foreign_key.conkey[position]=attribute.attnum
                         AND target_attribute.attname='org_id'
                    )
               ) AS tenant_organization_foreign_key
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid=relation.relnamespace
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid=relation.oid
           AND attribute.attname='org_id'
           AND attribute.attnum>0
           AND NOT attribute.attisdropped
         WHERE relation.relkind IN ('r','p')
           AND namespace.nspname=ANY(%s)
         ORDER BY qualified_name
        """,
        (list(CANONICAL_SCHEMAS), list(CANONICAL_SCHEMAS)),
    )
    rows = tuple(tuple(row) for row in cursor.fetchall())
    relations = tuple(str(row[0]) for row in rows)
    if len(relations) != EXPECTED_ORGANIZATION_RELATION_COUNT:
        raise ResetAuthorityError(
            "tenant relation count drifted: "
            f"expected={EXPECTED_ORGANIZATION_RELATION_COUNT} observed={len(relations)}"
        )
    if len(set(relations)) != len(relations):
        raise ResetAuthorityError("tenant relation catalog contains duplicates")
    if not set(relations).issubset(authority.canonical_relations):
        raise ResetAuthorityError("tenant relation exists outside canonical authority")
    invalid = [
        str(name)
        for name, data_type, not_null, direct_foreign_key, tenant_foreign_key in rows
        if data_type != "uuid"
        or not bool(not_null)
        or not (
            bool(direct_foreign_key)
            or (
                str(name) in TRANSITIVE_ORGANIZATION_RELATIONS
                and bool(tenant_foreign_key)
            )
        )
    ]
    if invalid:
        raise ResetAuthorityError(
            "tenant relations lack a mandatory direct organization UUID boundary: "
            + ", ".join(invalid)
        )
    forbidden = {"core.organizations", "core.users"} & set(relations)
    if forbidden:
        raise ResetAuthorityError(
            "global identity relations entered organization scope: "
            + ", ".join(sorted(forbidden))
        )
    return relations


def _organization_row_counts(
    cursor: Any, relations: Sequence[str], organization_id: str, *, target: bool
) -> tuple[tuple[str, int], ...]:
    comparison = "=" if target else "<>"
    result: list[tuple[str, int]] = []
    for relation in sorted(relations):
        cursor.execute(
            f"SELECT count(*) FROM {_quote_relation(relation)} "
            f"WHERE org_id {comparison} %s::uuid",
            (organization_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise ResetAuthorityError(
                f"could not count organization-scoped relation {relation}"
            )
        result.append((relation, int(row[0])))
    return tuple(result)


def _require_purge_preconditions(cursor: Any, organization_id: str) -> str:
    cursor.execute(
        "SELECT status FROM core.organizations WHERE id=%s::uuid FOR UPDATE",
        (organization_id,),
    )
    row = cursor.fetchone()
    if row is None:
        raise ResetAuthorityError("target organization does not exist")
    status = str(row[0])
    cursor.execute(
        "SELECT count(*) FROM core.data_retention_cases WHERE org_id=%s::uuid",
        (organization_id,),
    )
    retention = cursor.fetchone()
    if retention is None or int(retention[0]) != 0:
        raise ResetAuthorityError(
            "organization purge is forbidden while retention cases exist"
        )
    cursor.execute(
        "SELECT count(*) FROM core.attachments WHERE org_id=%s::uuid",
        (organization_id,),
    )
    attachments = cursor.fetchone()
    if attachments is None or int(attachments[0]) != 0:
        raise ResetAuthorityError(
            "organization purge is forbidden while evidence attachments exist"
        )
    return status


def _require_purge_executor(
    cursor: Any, organization_relations: Sequence[str]
) -> dict[str, object]:
    """Attest either a local superuser or the exact Supabase owner delegation."""

    cursor.execute(
        """
        SELECT session_user,
               current_user,
               session_role.rolsuper,
               session_role.rolcreaterole,
               session_role.rolbypassrls
          FROM pg_catalog.pg_roles AS session_role
         WHERE session_role.rolname=session_user
        """
    )
    row = cursor.fetchone()
    if not isinstance(row, tuple) or len(row) != 5:
        raise ResetAuthorityError("organization purge executor posture is unavailable")
    session_user, current_user, superuser, createrole, bypassrls = row
    delegated_owner = (
        session_user == "postgres"
        and current_user == "erp_migration_owner"
        and superuser is False
        and createrole is True
        and bypassrls is True
    )
    if superuser is not True and not delegated_owner:
        raise ResetAuthorityError(
            "organization purge requires the reviewed database administrator"
        )
    if delegated_owner:
        for relation in (*organization_relations, "core.organizations"):
            cursor.execute(
                """
                SELECT pg_catalog.pg_get_userbyid(relation.relowner)=current_user
                  FROM pg_catalog.pg_class AS relation
                 WHERE relation.oid=%s::regclass
                """,
                (relation,),
            )
            if cursor.fetchone() != (True,):
                raise ResetAuthorityError(
                    "organization purge owner does not own every target relation"
                )
    return {
        "session_user": str(session_user),
        "current_user": str(current_user),
        "superuser": bool(superuser),
        "delegated_owner": delegated_owner,
    }


def _strongly_connected_components(
    graph: Mapping[str, set[str]],
) -> tuple[tuple[str, ...], ...]:
    index = 0
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    stack: list[str] = []
    stacked: set[str] = set()
    components: list[tuple[str, ...]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        stacked.add(node)
        for target in sorted(graph[node]):
            if target not in indices:
                visit(target)
                lowlinks[node] = min(lowlinks[node], lowlinks[target])
            elif target in stacked:
                lowlinks[node] = min(lowlinks[node], indices[target])
        if lowlinks[node] != indices[node]:
            return
        component: list[str] = []
        while True:
            member = stack.pop()
            stacked.remove(member)
            component.append(member)
            if member == node:
                break
        components.append(tuple(sorted(component)))

    for relation in sorted(graph):
        if relation not in indices:
            visit(relation)
    return tuple(components)


def _organization_delete_order(
    cursor: Any, relations: Sequence[str]
) -> tuple[str, ...]:
    """Order tenant deletes while requiring every dependency cycle to defer."""

    cursor.execute(
        """
        SELECT child_namespace.nspname || '.' || child.relname AS child_relation,
               parent_namespace.nspname || '.' || parent.relname AS parent_relation,
               constraint_row.conname,
               constraint_row.condeferrable
          FROM pg_catalog.pg_constraint AS constraint_row
          JOIN pg_catalog.pg_class AS child
            ON child.oid=constraint_row.conrelid
          JOIN pg_catalog.pg_namespace AS child_namespace
            ON child_namespace.oid=child.relnamespace
          JOIN pg_catalog.pg_class AS parent
            ON parent.oid=constraint_row.confrelid
          JOIN pg_catalog.pg_namespace AS parent_namespace
            ON parent_namespace.oid=parent.relnamespace
         WHERE constraint_row.contype='f'
           AND child_namespace.nspname || '.' || child.relname=ANY(%s)
           AND parent_namespace.nspname || '.' || parent.relname=ANY(%s)
         ORDER BY child_relation,parent_relation,constraint_row.conname
        """,
        (list(relations), list(relations)),
    )
    relation_set = set(relations)
    graph = {relation: set() for relation in relations}
    edge_deferrable: dict[tuple[str, str], bool] = {}
    for child, parent, _constraint, deferrable in cursor.fetchall():
        child_name = str(child)
        parent_name = str(parent)
        if child_name not in relation_set or parent_name not in relation_set:
            raise ResetAuthorityError("organization foreign-key scope drifted")
        if child_name == parent_name:
            continue
        graph[child_name].add(parent_name)
        edge = (child_name, parent_name)
        edge_deferrable[edge] = edge_deferrable.get(edge, True) and bool(deferrable)

    components = _strongly_connected_components(graph)
    component_by_relation = {
        relation: index
        for index, component in enumerate(components)
        for relation in component
    }
    unsafe_cycle_edges: list[str] = []
    for child, parents in graph.items():
        for parent in parents:
            if (
                component_by_relation[child] == component_by_relation[parent]
                and not edge_deferrable[(child, parent)]
            ):
                unsafe_cycle_edges.append(f"{child}->{parent}")
    if unsafe_cycle_edges:
        raise ResetAuthorityError(
            "organization foreign-key cycle is not fully deferrable: "
            + ", ".join(sorted(unsafe_cycle_edges))
        )

    component_edges = {index: set() for index in range(len(components))}
    incoming = {index: 0 for index in range(len(components))}
    for child, parents in graph.items():
        child_component = component_by_relation[child]
        for parent in parents:
            parent_component = component_by_relation[parent]
            if child_component == parent_component:
                continue
            if parent_component not in component_edges[child_component]:
                component_edges[child_component].add(parent_component)
                incoming[parent_component] += 1
    ready = sorted(
        (index for index, count in incoming.items() if count == 0),
        key=lambda value: components[value],
    )
    ordered: list[str] = []
    while ready:
        component_index = ready.pop(0)
        ordered.extend(components[component_index])
        for target in sorted(
            component_edges[component_index], key=lambda value: components[value]
        ):
            incoming[target] -= 1
            if incoming[target] == 0:
                ready.append(target)
                ready.sort(key=lambda value: components[value])
    if len(ordered) != len(relations):
        raise ResetAuthorityError("organization delete order is incomplete")
    return tuple(ordered)


def _delete_trigger_snapshot(
    cursor: Any, relations: Sequence[str]
) -> tuple[tuple[str, str, str], ...]:
    cursor.execute(
        """
        SELECT namespace.nspname || '.' || relation.relname,
               trigger_row.tgname,
               trigger_row.tgenabled
          FROM pg_catalog.pg_trigger AS trigger_row
          JOIN pg_catalog.pg_class AS relation
            ON relation.oid=trigger_row.tgrelid
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid=relation.relnamespace
         WHERE NOT trigger_row.tgisinternal
           AND (trigger_row.tgtype & 8)=8
           AND namespace.nspname || '.' || relation.relname=ANY(%s)
         ORDER BY 1,2
        """,
        (list(relations),),
    )
    snapshot = tuple((str(row[0]), str(row[1]), str(row[2])) for row in cursor.fetchall())
    if any(state not in {"O", "D", "R", "A"} for _, _, state in snapshot):
        raise ResetAuthorityError("organization delete trigger posture is invalid")
    return snapshot


def _set_delete_triggers(
    cursor: Any,
    snapshot: Sequence[tuple[str, str, str]],
    *,
    enabled: bool,
) -> None:
    restoration = {"O": "ENABLE", "R": "ENABLE REPLICA", "A": "ENABLE ALWAYS"}
    for relation, trigger_name, prior_state in snapshot:
        if prior_state == "D":
            continue
        action = restoration[prior_state] if enabled else "DISABLE"
        cursor.execute(
            f"ALTER TABLE {_quote_relation(relation)} {action} TRIGGER "
            f"{_quote_identifier(trigger_name)}"
        )


def verify_reset_boundary(
    connection: Any, *, authority: ResetAuthority, project_ref: str
) -> dict[str, object]:
    """Read-only proof that the deployed head/topology matches reset authority."""

    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise ResetAuthorityError(
            "reset boundary verification is restricted to canonical staging"
        )
    with connection:
        with connection.cursor() as cursor:
            catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=catalog.alembic_head,
                alembic_schemas=catalog.alembic_schemas,
                canonical_relations=catalog.canonical_relations,
                ephemeral_scope_relations=catalog.ephemeral_scope_relations,
            )
            if not catalog.auth_schema_present or not catalog.storage_schema_present:
                raise ResetAuthorityError(
                    "managed Supabase schemas must exist before reset"
                )
    return {
        "alembic_head": catalog.alembic_head,
        "canonical_relation_count": len(catalog.canonical_relations),
        "ephemeral_scope_relation_count": len(catalog.ephemeral_scope_relations),
        "catalog_fingerprint_sha256": catalog.fingerprint_sha256(),
        "auth_schema_present": catalog.auth_schema_present,
        "storage_schema_present": catalog.storage_schema_present,
    }


def plan_organization_purge(
    connection: Any,
    *,
    authority: ResetAuthority,
    project_ref: str,
    organization_id: str,
) -> dict[str, object]:
    """Return a read-only, exact purge plan for external signing."""

    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise ResetAuthorityError("organization purge planning is restricted to canonical staging")
    normalized_id = _normalize_organization_id(organization_id)
    with connection:
        with connection.cursor() as cursor:
            before_catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=before_catalog.alembic_head,
                alembic_schemas=before_catalog.alembic_schemas,
                canonical_relations=before_catalog.canonical_relations,
                ephemeral_scope_relations=before_catalog.ephemeral_scope_relations,
            )
            status = _require_purge_preconditions(cursor, normalized_id)
            organization_relations = _organization_relations(cursor, authority)
            target_counts = _organization_row_counts(
                cursor, organization_relations, normalized_id, target=True
            )
    return {
        "contract_version": CONTRACT_VERSION,
        "project_ref": project_ref,
        "organization_id": normalized_id,
        "organization_status": status,
        "alembic_head": authority.alembic_head,
        "authority_manifest_sha256": authority.manifest_sha256(),
        "catalog_fingerprint_sha256": before_catalog.fingerprint_sha256(),
        "organization_relation_count": len(organization_relations),
        "organization_row_count": sum(count for _, count in target_counts),
        "confirmation_required": organization_confirmation(normalized_id),
        "global_reset_available": False,
        "truncate_used": False,
    }


def execute_organization_purge(
    connection: Any,
    *,
    authority: ResetAuthority,
    project_ref: str,
    organization_id: str,
    confirmation: str,
    authorized_plan_sha256: str,
) -> dict[str, object]:
    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise ResetAuthorityError("organization purge is restricted to canonical staging")
    normalized_id = _normalize_organization_id(organization_id)
    if confirmation != organization_confirmation(normalized_id):
        raise ResetAuthorityError(
            "organization purge confirmation must exactly name the target UUID"
        )
    if SHA256_PATTERN.fullmatch(authorized_plan_sha256) is None:
        raise ResetAuthorityError("a verified signed purge plan is required")

    # First commit the tenant-local write fence.  Every ordinary ERP write
    # requires an active organization, so new work for this organization stops
    # without interrupting any other tenant.  A failed later purge remains safe
    # and visibly suspended for manual review.
    with connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_catalog.pg_advisory_xact_lock(%s)", (RESET_LOCK_KEY,)
            )
            status = _require_purge_preconditions(cursor, normalized_id)
            if status not in {"provisioning", "active", "suspended"}:
                raise ResetAuthorityError(
                    f"organization status cannot enter purge: {status}"
                )
            if status != "suspended":
                cursor.execute(
                    """
                    SELECT pg_catalog.set_config('app.org_id',id::text,true),
                           pg_catalog.set_config(
                             'app.membership_id',created_by_membership_id::text,true
                           ),
                           pg_catalog.set_config(
                             'app.request_id',extensions.gen_random_uuid()::text,true
                           )
                      FROM core.organizations
                     WHERE id=%s::uuid
                    """,
                    (normalized_id,),
                )
                if cursor.fetchone() is None:
                    raise ResetAuthorityError(
                        "organization suspension context could not be established"
                    )
                cursor.execute(
                    """
                    UPDATE core.organizations
                       SET status='suspended',
                           updated_at=pg_catalog.transaction_timestamp(),
                           row_version=row_version+1
                     WHERE id=%s::uuid
                    """,
                    (normalized_id,),
                )
                if cursor.rowcount != 1:
                    raise ResetAuthorityError(
                        "organization suspension did not affect exactly one row"
                    )

    with connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_catalog.pg_advisory_xact_lock(%s)", (RESET_LOCK_KEY,)
            )
            before_catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=before_catalog.alembic_head,
                alembic_schemas=before_catalog.alembic_schemas,
                canonical_relations=before_catalog.canonical_relations,
                ephemeral_scope_relations=before_catalog.ephemeral_scope_relations,
            )
            if not before_catalog.auth_schema_present or not before_catalog.storage_schema_present:
                raise ResetAuthorityError("managed Supabase schemas must exist before purge")
            if _require_purge_preconditions(cursor, normalized_id) != "suspended":
                raise ResetAuthorityError(
                    "organization must be suspended before destructive execution"
                )
            organization_relations = _organization_relations(cursor, authority)
            executor = _require_purge_executor(cursor, organization_relations)
            delete_order = _organization_delete_order(cursor, organization_relations)
            delete_triggers = _delete_trigger_snapshot(
                cursor, (*organization_relations, "core.organizations")
            )
            before_roles = _role_snapshot(cursor)
            before_role_passwords = _role_password_presence(cursor)
            before_seed_digest = _seed_digest(
                cursor, authority.preserved_seed_relations
            )
            before_target_counts = _organization_row_counts(
                cursor, organization_relations, normalized_id, target=True
            )
            before_other_counts = _organization_row_counts(
                cursor, organization_relations, normalized_id, target=False
            )

            # Keep PostgreSQL's referential-integrity triggers active. Cyclic
            # dependencies are accepted only when every edge in the cycle is
            # explicitly deferrable. Owner-managed DELETE guard triggers are
            # disabled and restored inside this same transaction. Every DELETE
            # remains parameterized by the exact UUID.
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            _set_delete_triggers(cursor, delete_triggers, enabled=False)
            for relation in delete_order:
                cursor.execute(
                    f"DELETE FROM {_quote_relation(relation)} WHERE org_id=%s::uuid",
                    (normalized_id,),
                )
            cursor.execute(
                "DELETE FROM core.organizations WHERE id=%s::uuid",
                (normalized_id,),
            )
            if cursor.rowcount != 1:
                raise ResetAuthorityError(
                    "organization purge did not delete exactly one boundary row"
                )
            _set_delete_triggers(cursor, delete_triggers, enabled=True)

            after_catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=after_catalog.alembic_head,
                alembic_schemas=after_catalog.alembic_schemas,
                canonical_relations=after_catalog.canonical_relations,
                ephemeral_scope_relations=after_catalog.ephemeral_scope_relations,
            )
            after_roles = _role_snapshot(cursor)
            after_role_passwords = _role_password_presence(cursor)
            after_seed_digest = _seed_digest(cursor, authority.preserved_seed_relations)
            after_target_counts = _organization_row_counts(
                cursor, organization_relations, normalized_id, target=True
            )
            after_other_counts = _organization_row_counts(
                cursor, organization_relations, normalized_id, target=False
            )
            cursor.execute(
                "SELECT count(*) FROM core.organizations WHERE id=%s::uuid",
                (normalized_id,),
            )
            organization_after = cursor.fetchone()

            if before_catalog.relation_oids != after_catalog.relation_oids:
                raise ResetAuthorityError("canonical relation identities changed during purge")
            if before_catalog.schema_oids != after_catalog.schema_oids:
                raise ResetAuthorityError("canonical schema identities changed during purge")
            if before_catalog.fingerprint_sha256() != after_catalog.fingerprint_sha256():
                raise ResetAuthorityError("canonical catalog fingerprint changed during purge")
            if before_roles != after_roles:
                raise ResetAuthorityError(
                    "canonical role catalog changed during purge"
                )
            if before_role_passwords != after_role_passwords:
                raise ResetAuthorityError(
                    "canonical role credential posture changed during purge"
                )
            if before_seed_digest != after_seed_digest:
                raise ResetAuthorityError("deterministic seed rows changed during purge")
            if before_other_counts != after_other_counts:
                raise ResetAuthorityError("non-target organization row counts changed")
            nonempty = [name for name, count in after_target_counts if count != 0]
            if nonempty:
                raise ResetAuthorityError(
                    "organization purge left target rows in: " + ", ".join(nonempty)
                )
            if organization_after != (0,):
                raise ResetAuthorityError("organization boundary row survived purge")

    return {
        "contract_version": CONTRACT_VERSION,
        "project_ref": project_ref,
        "organization_id": normalized_id,
        "authorized_plan_sha256": authorized_plan_sha256,
        "alembic_head": authority.alembic_head,
        "authority_manifest_sha256": authority.manifest_sha256(),
        "catalog_fingerprint_sha256": after_catalog.fingerprint_sha256(),
        "alembic_schema_count": len(authority.alembic_schemas),
        "canonical_relation_count": len(authority.canonical_relations),
        "ephemeral_scope_relation_count": len(authority.ephemeral_scope_relations),
        "catalog_relation_count": len(authority.canonical_relations)
        + len(authority.ephemeral_scope_relations),
        "preserved_seed_relation_count": len(authority.preserved_seed_relations),
        "preserved_seed_digest_sha256": after_seed_digest,
        "organization_relation_count": len(organization_relations),
        "delete_order_relation_count": len(delete_order),
        "temporarily_disabled_delete_trigger_count": sum(
            state != "D" for _, _, state in delete_triggers
        ),
        "organization_row_count_before_purge": sum(
            count for _, count in before_target_counts
        ),
        "organization_row_count_after_purge": 0,
        "other_organization_row_count_preserved": sum(
            count for _, count in after_other_counts
        ),
        "organization_boundary_deleted": True,
        "global_reset_available": False,
        "truncate_used": False,
        "session_replication_role_used": False,
        "storage_objects_modified": False,
        "auth_schema_preserved": True,
        "storage_schema_preserved": True,
        "schema_oids_preserved": True,
        "relation_oids_preserved": True,
        "isolated_role_posture_preserved": True,
        "isolated_role_catalog_preserved": True,
        "executor": executor,
        "completed_at": _utc_now(),
    }


def _load_observed(path: Path) -> tuple[str, list[str], list[str], list[str]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ResetAuthorityError("observed catalog must be a JSON object")
    head = value.get("alembic_head")
    schemas = value.get("alembic_schemas")
    canonical = value.get("canonical_relations")
    ephemeral = value.get("ephemeral_scope_relations")
    if (
        not isinstance(head, str)
        or not isinstance(schemas, list)
        or not all(isinstance(item, str) for item in schemas)
        or not isinstance(canonical, list)
        or not all(isinstance(item, str) for item in canonical)
        or not isinstance(ephemeral, list)
        or not all(isinstance(item, str) for item in ephemeral)
    ):
        raise ResetAuthorityError("observed catalog has an invalid shape")
    return head, schemas, canonical, ephemeral


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--print-sha256", action="store_true")
    output.add_argument("--output", type=Path)
    output.add_argument("--verify-role-cleanup", action="store_true")
    parser.add_argument(
        "--validate-observed",
        type=Path,
        help="validate an exact observed catalog JSON before emitting authority",
    )
    parser.add_argument("--project-ref")
    parser.add_argument("--database-url-env", default="PSYCOPG_DATABASE_URL")
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()

    authority = load_reset_authority()
    if args.validate_observed is not None:
        head, schemas, canonical, ephemeral = _load_observed(args.validate_observed)
        authority.validate_observed_catalog(
            alembic_head=head,
            alembic_schemas=schemas,
            canonical_relations=canonical,
            ephemeral_scope_relations=ephemeral,
        )

    if args.verify_role_cleanup:
        if not args.project_ref or args.receipt is None:
            parser.error("database execution requires --project-ref and --receipt")
        database_url = os.environ.get(args.database_url_env, "")
        if not database_url:
            parser.error(f"database URL environment is empty: {args.database_url_env}")
        if database_url.startswith("postgresql+psycopg2://"):
            database_url = "postgresql://" + database_url.split("://", 1)[1]
        import psycopg2

        connection = psycopg2.connect(database_url, connect_timeout=15)
        try:
            receipt = verify_post_cleanup_role_state(
                connection,
                project_ref=args.project_ref,
            )
        finally:
            connection.close()
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print("canonical post-reset role cleanup verified")
    elif args.print_sha256:
        print(authority.manifest_sha256())
    else:
        rendered = json.dumps(authority.envelope(), indent=2, sort_keys=True) + "\n"
        if args.output is not None:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
        else:
            print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
