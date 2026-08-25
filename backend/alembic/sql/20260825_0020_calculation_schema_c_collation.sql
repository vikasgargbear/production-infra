-- Make calculation-artifact JSON object-key validation independent of the
-- database's default locale. Alembic owns this transaction.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    input_definition text;
    output_definition text;
    input_sha256 text;
    output_sha256 text;
    old_order constant text := 'pg_catalog.array_agg(key ORDER BY key)';
    new_order constant text := 'pg_catalog.array_agg(key ORDER BY key COLLATE "C")';
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
      'erp_calculation_authority.assert_input_schema(jsonb)'::regprocedure
    ) INTO STRICT input_definition;
    SELECT pg_catalog.pg_get_functiondef(
      'erp_calculation_authority.assert_output_schema(jsonb)'::regprocedure
    ) INTO STRICT output_definition;
    input_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(input_definition,'UTF8'),'sha256'),'hex');
    output_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(output_definition,'UTF8'),'sha256'),'hex');

    IF input_sha256='6174e366b33e1cf092085fc9cb2e551d6a1f02015d1364c870dfe17df555be33'
       AND output_sha256='1966f2ab105df85c714210b64d1a951d82cd549f12487b38f78bcbd720632607'
       AND pg_catalog.strpos(input_definition,old_order)=0
       AND pg_catalog.strpos(output_definition,old_order)=0 THEN
        RETURN;
    END IF;
    IF input_sha256<>'db834c04e671195c7e0a2ecf5592cbdd3c84b403a7f01cefe8977f6a16f80d03'
       OR output_sha256<>'e34e27df9a33aac447026a10925e4396d72cafaf6b7da81deda3be49232ab18a'
       OR (pg_catalog.length(input_definition)-pg_catalog.length(
             pg_catalog.replace(input_definition,old_order,'')))
            / pg_catalog.length(old_order)<>12
       OR (pg_catalog.length(output_definition)-pg_catalog.length(
             pg_catalog.replace(output_definition,old_order,'')))
            / pg_catalog.length(old_order)<>3 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='calculation schema validators differ from the reviewed collation migration precondition';
    END IF;

    EXECUTE pg_catalog.replace(input_definition,old_order,new_order);
    EXECUTE pg_catalog.replace(output_definition,old_order,new_order);

    SELECT pg_catalog.pg_get_functiondef(
      'erp_calculation_authority.assert_input_schema(jsonb)'::regprocedure
    ) INTO STRICT input_definition;
    SELECT pg_catalog.pg_get_functiondef(
      'erp_calculation_authority.assert_output_schema(jsonb)'::regprocedure
    ) INTO STRICT output_definition;
    input_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(input_definition,'UTF8'),'sha256'),'hex');
    output_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(output_definition,'UTF8'),'sha256'),'hex');
    IF input_sha256<>'6174e366b33e1cf092085fc9cb2e551d6a1f02015d1364c870dfe17df555be33'
       OR output_sha256<>'1966f2ab105df85c714210b64d1a951d82cd549f12487b38f78bcbd720632607' THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='calculation schema collation migration did not produce the reviewed definitions';
    END IF;
END
$migration$;

RESET ROLE;
