SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION "erp_core_commands"."current_organization_business_date"()
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
    organization_id uuid := NULLIF(
        pg_catalog.current_setting('app.org_id', true), ''
    )::uuid;
    business_date date;
BEGIN
    IF organization_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'canonical organization business-date context is missing';
    END IF;

    SELECT (
        pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone
    )::date
      INTO STRICT business_date
      FROM core.organizations organization
     WHERE organization.id = organization_id
       AND organization.status = 'active';

    RETURN business_date;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'canonical organization business-date authority is unavailable';
END
$function$;

ALTER FUNCTION "erp_core_commands"."current_organization_business_date"()
    OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION "erp_core_commands"."current_organization_business_date"()
    FROM PUBLIC, erp_app, erp_runtime, erp_calculator;
GRANT EXECUTE ON FUNCTION "erp_core_commands"."current_organization_business_date"()
    TO erp_runtime, erp_calculator;

DO $migration$
DECLARE
    signature text;
    definition text;
    old_fragment constant text := 'IF payment_date>CURRENT_DATE THEN';
    new_fragment constant text :=
        'IF payment_date>"erp_core_commands"."current_organization_business_date"() THEN';
BEGIN
    FOREACH signature IN ARRAY ARRAY[
        'erp_automation_commands.resolve_customer_receipt_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)',
        'erp_automation_commands.resolve_supplier_advance_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)',
        'erp_automation_commands.resolve_supplier_payment_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'
    ]
    LOOP
        SELECT pg_catalog.pg_get_functiondef(signature::pg_catalog.regprocedure)
          INTO STRICT definition;

        IF pg_catalog.length(definition)
             - pg_catalog.length(pg_catalog.replace(definition, old_fragment, ''))
             = pg_catalog.length(old_fragment) THEN
            EXECUTE pg_catalog.replace(definition, old_fragment, new_fragment);
        ELSIF pg_catalog.length(definition)
               - pg_catalog.length(pg_catalog.replace(definition, new_fragment, ''))
               <> pg_catalog.length(new_fragment) THEN
            RAISE EXCEPTION USING
                ERRCODE = '55000',
                MESSAGE = 'finance business-date migration source definition drifted';
        END IF;
    END LOOP;
END
$migration$;

RESET ROLE;
