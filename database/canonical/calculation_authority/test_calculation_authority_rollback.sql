BEGIN;

DO $calculation_authority_contract$
DECLARE
    calculator record;
    issue_oid oid := pg_catalog.to_regprocedure(
        'erp_calculation_authority.issue_artifact(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid,bytea,bytea,bytea,varchar,varchar,varchar,timestamptz)'
    );
    consume_oid oid := pg_catalog.to_regprocedure(
        'erp_calculation_authority.consume_artifact(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid)'
    );
    issue_source text;
BEGIN
    SELECT rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
      INTO STRICT calculator FROM pg_catalog.pg_roles WHERE rolname='erp_calculator';
    IF NOT calculator.rolcanlogin OR calculator.rolinherit OR calculator.rolsuper
       OR calculator.rolcreaterole OR calculator.rolcreatedb OR calculator.rolbypassrls THEN
        RAISE EXCEPTION 'erp_calculator role attributes are not least privilege';
    END IF;
    IF issue_oid IS NULL OR consume_oid IS NULL THEN
        RAISE EXCEPTION 'calculation issue/consume boundary is missing';
    END IF;
    IF NOT pg_catalog.has_function_privilege('erp_calculator',issue_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('erp_app',issue_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('erp_runtime',issue_oid,'EXECUTE') THEN
        RAISE EXCEPTION 'calculation issuer privilege is not isolated';
    END IF;
    IF pg_catalog.has_function_privilege('erp_calculator',consume_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('erp_app',consume_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('erp_runtime',consume_oid,'EXECUTE') THEN
        RAISE EXCEPTION 'private calculation consumer is exposed';
    END IF;
    IF pg_catalog.has_table_privilege('erp_calculator','calculation.artifacts','SELECT,INSERT,UPDATE,DELETE')
       OR pg_catalog.has_table_privilege('erp_app','calculation.artifacts','INSERT,UPDATE,DELETE')
       OR pg_catalog.has_table_privilege('erp_runtime','calculation.artifacts','INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'calculation artifact direct DML is exposed';
    END IF;
    IF NOT pg_catalog.has_table_privilege('erp_app','calculation.artifacts','SELECT') THEN
        RAISE EXCEPTION 'tenant runtime cannot inspect calculation evidence';
    END IF;
    SELECT pg_catalog.pg_get_functiondef(issue_oid) INTO STRICT issue_source;
    IF pg_catalog.position('session_user' IN issue_source)=0
       OR pg_catalog.position('erp_calculator' IN issue_source)=0
       OR pg_catalog.position('assert_input_schema' IN issue_source)=0
       OR pg_catalog.position('assert_output_schema' IN issue_source)=0 THEN
        RAISE EXCEPTION 'issuer no longer checks authenticated principal and fixed schemas';
    END IF;
END
$calculation_authority_contract$;

ROLLBACK;
