-- Bind the requested permission argument, never the identically named table column.
SET LOCAL ROLE erp_migration_owner;
CREATE OR REPLACE FUNCTION "erp_security"."has_permission"(permission_code text, target_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND EXISTS (
            SELECT 1
              FROM core.access_grants AS grant_row
              JOIN core.roles AS role_row
                ON role_row.org_id = grant_row.org_id
               AND role_row.id = grant_row.role_id
              JOIN core.role_permissions AS role_permission
                ON role_permission.org_id = role_row.org_id
               AND role_permission.role_id = role_row.id
              JOIN core.permissions AS permission_row
                ON permission_row.code = role_permission.permission_code
             WHERE grant_row.org_id = erp_security.current_org_id()
               AND grant_row.membership_id = erp_security.current_membership_id()
               AND grant_row.status = 'active'
               AND role_row.status = 'active'
               AND permission_row.status = 'active'
               AND role_permission.permission_code = $1
               AND grant_row.valid_from_at <= pg_catalog.transaction_timestamp()
               AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.transaction_timestamp())
               AND (
                    (target_branch_id IS NULL AND grant_row.scope_kind = 'organization')
                    OR (
                        target_branch_id IS NOT NULL
                        AND (
                            grant_row.scope_kind = 'organization'
                            OR (grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id)
                        )
                    )
               )
       );
$function$;

RESET ROLE;
