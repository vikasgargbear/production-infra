#!/usr/bin/env python3
"""Build the exact, head-bound authority for disposable canonical data resets.

The ordinary staging reset preserves the Alembic-owned database topology and
the deterministic reference rows that Alembic will not replay at an already
current head.  It emits the exact relation classification and non-cascading
TRUNCATE SQL.  Its explicit execution mode validates the complete live Alembic
catalog, performs one transaction, and emits credential-free verification facts.
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

try:  # Imported as ``scripts.*`` by pytest and directly by the workflow CLI.
    from scripts.canonical_migration_contract import MigrationContract, load_contract
except ModuleNotFoundError:  # pragma: no cover - exercised by direct CLI execution
    from canonical_migration_contract import MigrationContract, load_contract


CONTRACT_VERSION = "canonical-data-reset-v1"
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
EXPECTED_CANONICAL_RELATION_COUNT = 119
EXPECTED_EPHEMERAL_RELATION_COUNT = 7
EXPECTED_ALEMBIC_SCHEMA_COUNT = 30
EVIDENCE_STORAGE_BUCKET = "canonical-evidence-private-v1"
RESET_LOCK_KEY = 8_260_826_2
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
    "erp_core_commands.command_scopes",
    "erp_finance_commands.command_scopes",
    "erp_regulatory_commands.command_scopes",
    "erp_tax_provider_commands.command_scopes",
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

    @property
    def truncate_relations(self) -> tuple[str, ...]:
        return tuple(sorted((*self.reset_relations, *self.ephemeral_scope_relations)))

    @property
    def truncate_sql(self) -> str:
        targets = ", ".join(_quote_relation(item) for item in self.truncate_relations)
        statement = f"TRUNCATE TABLE {targets} RESTART IDENTITY;"
        if re.search(r"\bCASCADE\b", statement, re.IGNORECASE):
            raise ResetAuthorityError("canonical data reset must never use CASCADE")
        return statement

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
            "truncate_relation_count": len(self.truncate_relations),
            "truncate_relations": list(self.truncate_relations),
            "truncate_sql": self.truncate_sql,
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
    if len(reset_relations) != 114:
        raise ResetAuthorityError(
            f"reset relation count drifted: expected=114 observed={len(reset_relations)}"
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
                SELECT EXISTS (
                    SELECT 1
                      FROM pg_catalog.pg_auth_members AS membership
                      JOIN pg_catalog.pg_roles AS granted
                        ON granted.oid=membership.roleid
                      JOIN pg_catalog.pg_roles AS member
                        ON member.oid=membership.member
                     WHERE granted.rolname='erp_migration_owner'
                       AND member.rolname='postgres'
                )
                """
            )
            delegation = cursor.fetchone()
            if delegation is None or delegation != (False,):
                raise ResetAuthorityError(
                    "postgres retains temporary migration-owner delegation"
                )
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
        "postgres_migration_owner_set": False,
        "postgres_migration_owner_usage": False,
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


def _relation_row_counts(
    cursor: Any, relations: Sequence[str]
) -> tuple[tuple[str, int], ...]:
    result: list[tuple[str, int]] = []
    for relation in sorted(relations):
        cursor.execute(f"SELECT count(*) FROM {_quote_relation(relation)}")
        row = cursor.fetchone()
        if row is None:
            raise ResetAuthorityError(f"could not count reset relation {relation}")
        result.append((relation, int(row[0])))
    return tuple(result)


def _evidence_object_count(cursor: Any) -> int:
    cursor.execute(
        "SELECT count(*) FROM storage.objects WHERE bucket_id=%s",
        (EVIDENCE_STORAGE_BUCKET,),
    )
    row = cursor.fetchone()
    if row is None:
        raise ResetAuthorityError("could not count canonical evidence objects")
    return int(row[0])


def execute_reset(
    connection: Any,
    *,
    authority: ResetAuthority,
    project_ref: str,
    expected_evidence_object_count: int = 0,
) -> dict[str, object]:
    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise ResetAuthorityError("data reset is restricted to canonical staging")
    if expected_evidence_object_count != 0:
        raise ResetAuthorityError("canonical data reset requires an empty evidence bucket")

    with connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_catalog.pg_advisory_xact_lock(%s)", (RESET_LOCK_KEY,))
            before_catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=before_catalog.alembic_head,
                alembic_schemas=before_catalog.alembic_schemas,
                canonical_relations=before_catalog.canonical_relations,
                ephemeral_scope_relations=before_catalog.ephemeral_scope_relations,
            )
            if not before_catalog.auth_schema_present or not before_catalog.storage_schema_present:
                raise ResetAuthorityError("managed Supabase schemas must exist before reset")
            before_objects = _evidence_object_count(cursor)
            if before_objects != expected_evidence_object_count:
                raise ResetAuthorityError(
                    "canonical evidence bucket is not empty: "
                    f"expected={expected_evidence_object_count} observed={before_objects}"
                )
            before_roles = _role_snapshot(cursor)
            before_role_passwords = _role_password_presence(cursor)
            before_seed_digest = _seed_digest(
                cursor, authority.preserved_seed_relations
            )
            before_counts = _relation_row_counts(cursor, authority.truncate_relations)

            cursor.execute("SET LOCAL ROLE erp_migration_owner")
            cursor.execute(authority.truncate_sql)
            cursor.execute("RESET ROLE")

            after_catalog = _catalog_snapshot(cursor, authority.alembic_schemas)
            authority.validate_observed_catalog(
                alembic_head=after_catalog.alembic_head,
                alembic_schemas=after_catalog.alembic_schemas,
                canonical_relations=after_catalog.canonical_relations,
                ephemeral_scope_relations=after_catalog.ephemeral_scope_relations,
            )
            after_objects = _evidence_object_count(cursor)
            after_roles = _role_snapshot(cursor)
            after_role_passwords = _role_password_presence(cursor)
            after_seed_digest = _seed_digest(cursor, authority.preserved_seed_relations)
            after_counts = _relation_row_counts(cursor, authority.truncate_relations)

            if before_catalog.relation_oids != after_catalog.relation_oids:
                raise ResetAuthorityError("canonical relation identities changed during reset")
            if before_catalog.schema_oids != after_catalog.schema_oids:
                raise ResetAuthorityError("canonical schema identities changed during reset")
            if before_catalog.fingerprint_sha256() != after_catalog.fingerprint_sha256():
                raise ResetAuthorityError("canonical catalog fingerprint changed during reset")
            if before_roles != after_roles:
                raise ResetAuthorityError(
                    "canonical role catalog changed during reset"
                )
            if before_role_passwords != after_role_passwords:
                raise ResetAuthorityError(
                    "canonical role credential posture changed during reset"
                )
            if before_seed_digest != after_seed_digest:
                raise ResetAuthorityError("deterministic seed rows changed during reset")
            if after_objects != 0:
                raise ResetAuthorityError("canonical evidence objects changed during reset")
            nonempty = [name for name, count in after_counts if count != 0]
            if nonempty:
                raise ResetAuthorityError(
                    "canonical reset left disposable rows in: " + ", ".join(nonempty)
                )

    return {
        "contract_version": CONTRACT_VERSION,
        "project_ref": project_ref,
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
        "reset_relation_count": len(authority.reset_relations),
        "truncate_relation_count": len(authority.truncate_relations),
        "disposable_row_count_before_reset": sum(count for _, count in before_counts),
        "disposable_row_count_after_reset": 0,
        "evidence_storage_object_count_after_reset": after_objects,
        "auth_schema_preserved": True,
        "storage_schema_preserved": True,
        "schema_oids_preserved": True,
        "relation_oids_preserved": True,
        "isolated_role_posture_preserved": True,
        "isolated_role_catalog_preserved": True,
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
    output.add_argument("--print-truncate-sql", action="store_true")
    output.add_argument("--output", type=Path)
    output.add_argument("--execute-reset", action="store_true")
    output.add_argument("--verify-role-cleanup", action="store_true")
    parser.add_argument(
        "--validate-observed",
        type=Path,
        help="validate an exact observed catalog JSON before emitting authority",
    )
    parser.add_argument("--project-ref")
    parser.add_argument("--database-url-env", default="PSYCOPG_DATABASE_URL")
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--expected-evidence-object-count", type=int, default=0)
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

    if args.execute_reset or args.verify_role_cleanup:
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
            if args.execute_reset:
                receipt = execute_reset(
                    connection,
                    authority=authority,
                    project_ref=args.project_ref,
                    expected_evidence_object_count=args.expected_evidence_object_count,
                )
            else:
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
        if args.execute_reset:
            print(
                "canonical data reset complete: "
                f"head={receipt['alembic_head']} "
                f"relations={receipt['truncate_relation_count']}"
            )
        else:
            print("canonical post-reset role cleanup verified")
    elif args.print_sha256:
        print(authority.manifest_sha256())
    elif args.print_truncate_sql:
        print(authority.truncate_sql)
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
