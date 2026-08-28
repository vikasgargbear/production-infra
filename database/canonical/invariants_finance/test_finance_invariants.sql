\set ON_ERROR_STOP on

DO $fixture$
DECLARE bad_count integer;
BEGIN
    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_invariants'
       AND (procedure.prosecdef
            OR procedure.proconfig IS NULL
            OR NOT ('search_path=""' = ANY(procedure.proconfig)));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'finance invariant functions must be invoker functions with empty search_path';
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_invariants'
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'finance invariant functions expose an execute grant';
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_trigger AS trigger
      JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=trigger.tgfoid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_invariants'
       AND (NOT trigger.tgenabled::text='O' OR trigger.tgconstraint=0);
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'finance invariant bindings must be enabled constraint triggers';
    END IF;
END
$fixture$;
