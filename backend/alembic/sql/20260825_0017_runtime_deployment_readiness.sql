GRANT SELECT ON TABLE public.alembic_version TO erp_migration_owner;

SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_security.deployed_canonical_revision()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT revision.version_num::text
    FROM public.alembic_version AS revision
$function$;

REVOKE ALL ON FUNCTION erp_security.deployed_canonical_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_security.deployed_canonical_revision() TO erp_runtime;

RESET ROLE;
