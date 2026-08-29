-- Keep exact-head readiness callable while the public write fence is closed.
-- erp_runtime deliberately loses erp_app membership at that boundary, so the
-- schema privilege must be direct even though function EXECUTE already is.
SET LOCAL ROLE erp_migration_owner;

REVOKE ALL ON FUNCTION erp_security.deployed_canonical_revision()
  FROM PUBLIC, erp_app, erp_runtime;
GRANT USAGE ON SCHEMA erp_security TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_security.deployed_canonical_revision()
  TO erp_runtime;

RESET ROLE;
