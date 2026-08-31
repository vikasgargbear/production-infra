-- Flush the opening inventory source constraint before attaching its accounting event.
--
-- The reviewed historical cutover defers constraints so it can build each complete
-- product/batch/opening unit atomically.  Once an inventory document is posted, its
-- source-immutability constraint must be evaluated before the accounting event is
-- attached; otherwise the deferred trigger observes that later event and mistakes
-- the original approved-to-posted transition for a mutation of an accounted source.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
  target regprocedure :=
    'erp_automation_commands.promote_historical_product_inventory_batch(uuid,character varying,uuid,integer)'::regprocedure;
  definition text;
  needle text := $needle$    PERFORM erp_trade_commands.post_locked_document(
      organization_id,document_identifier,actor_id
    );$needle$;
  batch_needle text := $needle$       AND batch.status='quarantined';
    DELETE FROM erp_trade_commands.command_scopes scope$needle$;
  journal_needle text := $needle$      0,derived_value,0,derived_value,actor_id);
    UPDATE finance.journal_entries SET status='posted'$needle$;
  final_needle text := $needle$     AND binding.source_fact_id IS NULL;
  RETURN pg_catalog.jsonb_build_object($needle$;
  replacement text;
  batch_replacement text;
  journal_replacement text;
  final_replacement text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  replacement := needle || E'\n    SET CONSTRAINTS ALL IMMEDIATE;\n    SET CONSTRAINTS ALL DEFERRED;';
  batch_replacement := E'       AND batch.status=''quarantined'';\n'
    || E'    SET CONSTRAINTS ALL IMMEDIATE;\n'
    || E'    SET CONSTRAINTS ALL DEFERRED;\n'
    || E'    DELETE FROM erp_trade_commands.command_scopes scope';
  journal_replacement := E'      0,derived_value,0,derived_value,actor_id);\n'
    || E'    SET CONSTRAINTS ALL IMMEDIATE;\n'
    || E'    SET CONSTRAINTS ALL DEFERRED;\n'
    || E'    UPDATE finance.journal_entries SET status=''posted''';
  final_replacement := E'     AND binding.source_fact_id IS NULL;\n'
    || E'  SET CONSTRAINTS ALL IMMEDIATE;\n'
    || E'  RETURN pg_catalog.jsonb_build_object(';

  IF pg_catalog.strpos(definition,replacement)>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical opening accounting constraint fix is already installed';
  END IF;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,needle,'')))
       <> pg_catalog.length(needle) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical opening cutover definition does not match the reviewed source';
  END IF;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,batch_needle,'')))
       <> pg_catalog.length(batch_needle) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical batch release definition does not match the reviewed source';
  END IF;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,journal_needle,'')))
       <> pg_catalog.length(journal_needle) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical opening journal definition does not match the reviewed source';
  END IF;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,final_needle,'')))
       <> pg_catalog.length(final_needle) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical cutover return definition does not match the reviewed source';
  END IF;

  definition := pg_catalog.replace(definition,needle,replacement);
  definition := pg_catalog.replace(definition,batch_needle,batch_replacement);
  definition := pg_catalog.replace(definition,journal_needle,journal_replacement);
  definition := pg_catalog.replace(definition,final_needle,final_replacement);
  EXECUTE definition;
END
$migration$;

DO $verify$
DECLARE definition text; owner_name text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.promote_historical_product_inventory_batch(uuid,character varying,uuid,integer)'::regprocedure
  ) INTO definition;
  IF pg_catalog.strpos(
    definition,
    'SET CONSTRAINTS ALL IMMEDIATE;'
  )=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical opening accounting constraint fix was not installed';
  END IF;
  IF (
    pg_catalog.length(definition)
      - pg_catalog.length(pg_catalog.replace(definition,'SET CONSTRAINTS ALL IMMEDIATE;',''))
    ) <> 4*pg_catalog.length('SET CONSTRAINTS ALL IMMEDIATE;') THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical cutover constraint flush count is invalid';
  END IF;
  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
    INTO owner_name
    FROM pg_catalog.pg_proc procedure
   WHERE procedure.oid=
     'erp_automation_commands.promote_historical_product_inventory_batch(uuid,character varying,uuid,integer)'::regprocedure;
  IF owner_name IS DISTINCT FROM 'erp_migration_owner' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical opening cutover function owner changed unexpectedly';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'erp_runtime',
       'erp_automation_commands.promote_historical_product_inventory_batch(uuid,character varying,uuid,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='runtime historical cutover execution changed unexpectedly';
  END IF;
  IF pg_catalog.has_function_privilege(
       'erp_app',
       'erp_automation_commands.promote_historical_product_inventory_batch(uuid,character varying,uuid,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='application role unexpectedly gained historical cutover execution';
  END IF;
END
$verify$;

RESET ROLE;
