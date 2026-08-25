"""Canonical ERP user and membership lookup."""

from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session


class MembershipContextDenied(Exception):
    """The canonical database rejected an inactive or missing tenant membership."""


class UserRepository:
    """
    Repository pattern for user data access
    Separates data access from business logic
    """
    
    @staticmethod
    def find_by_auth_user_id(
        auth_user_id: UUID,
        organization_id: UUID,
        db: Session,
    ) -> Optional[Dict[str, Any]]:
        """Resolve one active canonical membership from an admin-assigned tenant."""
        try:
            db.execute(
                text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
                {"auth_user_id": auth_user_id, "org_id": organization_id},
            )
        except DBAPIError as exc:
            original = exc.orig
            primary_message = getattr(getattr(original, "diag", None), "message_primary", None)
            if (
                getattr(original, "pgcode", None) == "42501"
                and primary_message
                == "invalid or inactive ERP authenticated organization membership"
            ):
                db.rollback()
                raise MembershipContextDenied from exc
            raise
        result = db.execute(text("""
            WITH active_grants AS (
                SELECT grant_row.org_id, grant_row.membership_id,
                       grant_row.role_id, grant_row.scope_kind,
                       grant_row.branch_id, role_row.code AS role_code,
                       role_row.name AS role_name
                  FROM core.access_grants AS grant_row
                  JOIN core.roles AS role_row
                    ON role_row.org_id=grant_row.org_id
                   AND role_row.id=grant_row.role_id
                   AND role_row.status='active'
                 WHERE grant_row.org_id=:org_id
                   AND grant_row.status='active'
                   AND grant_row.valid_from_at<=transaction_timestamp()
                   AND (grant_row.expires_at IS NULL
                        OR grant_row.expires_at>transaction_timestamp())
            ), grant_summary AS (
                SELECT grant_row.org_id, grant_row.membership_id,
                       (array_agg(grant_row.role_id ORDER BY grant_row.role_id))[1]
                           AS role_id,
                       (array_agg(grant_row.role_name ORDER BY grant_row.role_id))[1]
                           AS role_name,
                       coalesce(
                           array_agg(DISTINCT grant_row.branch_id)
                               FILTER (WHERE grant_row.branch_id IS NOT NULL),
                           ARRAY[]::uuid[]
                       ) AS branch_ids,
                       bool_or(
                           grant_row.scope_kind='organization'
                           AND grant_row.branch_id IS NULL
                       ) AS organization_scope,
                       bool_or(
                           grant_row.role_code IN ('owner','admin','super_admin')
                       ) AS is_admin
                  FROM active_grants AS grant_row
                 GROUP BY grant_row.org_id, grant_row.membership_id
            ), permission_summary AS (
                SELECT grant_row.org_id, grant_row.membership_id,
                       jsonb_object_agg(permission.permission_code, true)
                           AS permissions
                  FROM active_grants AS grant_row
                  JOIN core.role_permissions AS permission
                    ON permission.org_id=grant_row.org_id
                   AND permission.role_id=grant_row.role_id
                 GROUP BY grant_row.org_id, grant_row.membership_id
            )
            SELECT
                user_row.id AS user_id, user_row.auth_user_id,
                user_row.display_name AS username,
                user_row.display_name AS full_name,
                membership.org_id, user_row.status='active' AS is_active,
                grant_summary.role_id, grant_summary.branch_ids,
                grant_summary.is_admin,
                organization.legal_name AS org_name,
                organization.status='active' AS org_active,
                grant_summary.role_name,
                coalesce(permission_summary.permissions, '{}'::jsonb) AS permissions,
                CASE
                    WHEN grant_summary.organization_scope THEN 'organization'
                    WHEN cardinality(grant_summary.branch_ids)>1 THEN 'region'
                    ELSE 'branch'
                END AS data_access_level
            FROM core.users AS user_row
            JOIN core.memberships AS membership
              ON membership.user_id=user_row.id
             AND membership.org_id=:org_id
             AND membership.status='active'
             AND membership.joined_at IS NOT NULL
             AND membership.revoked_at IS NULL
            JOIN core.organizations AS organization
              ON organization.id=membership.org_id
            JOIN grant_summary
              ON grant_summary.org_id=membership.org_id
             AND grant_summary.membership_id=membership.id
            LEFT JOIN permission_summary
              ON permission_summary.org_id=membership.org_id
             AND permission_summary.membership_id=membership.id
            WHERE user_row.auth_user_id=:auth_user_id
              AND user_row.status='active'
            LIMIT 2
        """), {"auth_user_id": auth_user_id, "org_id": organization_id})
        rows = result.fetchall()
        if not rows:
            return None
        if len(rows) != 1:
            raise RuntimeError("Supabase identity maps to multiple ERP memberships")

        row = rows[0]
        return {
            "user_id": row[0],
            "auth_user_id": row[1],
            "username": row[2],
            "full_name": row[3],
            "org_id": row[4],
            "is_active": row[5],
            "role_id": row[6],
            "branch_ids": row[7] or [],
            "is_admin": row[8],
            "org_name": row[9],
            "org_active": row[10],
            "role_name": row[11],
            "permissions": row[12] or {},
            "data_access_level": row[13] or "branch",
        }
