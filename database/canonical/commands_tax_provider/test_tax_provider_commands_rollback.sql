\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
BEGIN
  IF pg_catalog.to_regrole('erp_tax_provider') IS NULL THEN
    RAISE EXCEPTION 'isolated provider role is absent';
  END IF;
  IF pg_catalog.to_regprocedure('erp_tax_provider_commands.begin_einvoice(uuid,uuid,uuid,text,character varying,character varying,text)') IS NULL
     OR pg_catalog.to_regprocedure('erp_tax_provider_commands.read_request(uuid,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('erp_tax_provider_commands.complete_einvoice(uuid,uuid,character varying,character varying,bytea,text,character varying,bytea,bytea,character varying,character varying,timestamp with time zone,bytea,bytea)') IS NULL
     OR pg_catalog.to_regprocedure('erp_tax_provider_commands.begin_eway_bill(uuid,uuid,uuid,uuid,text,character varying,character varying,text)') IS NULL
     OR pg_catalog.to_regprocedure('erp_tax_provider_commands.complete_eway_bill(uuid,uuid,character varying,character varying,bytea,text,character varying,bytea,bytea,character varying,text,character varying,character varying,timestamp with time zone,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'provider command surface is incomplete';
  END IF;
  IF pg_catalog.has_function_privilege('erp_app','erp_tax_provider_commands.complete_einvoice(uuid,uuid,character varying,character varying,bytea,text,character varying,bytea,bytea,character varying,character varying,timestamp with time zone,bytea,bytea)','EXECUTE')
     OR pg_catalog.has_function_privilege('erp_tax_provider','erp_tax_provider_commands.begin_einvoice(uuid,uuid,uuid,text,character varying,character varying,text)','EXECUTE') THEN
    RAISE EXCEPTION 'provider/application function privileges cross the trust boundary';
  END IF;
  IF NOT pg_catalog.has_function_privilege('erp_tax_provider','erp_tax_provider_commands.read_request(uuid,uuid,text)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('erp_tax_provider','erp_tax_provider_commands.complete_einvoice(uuid,uuid,character varying,character varying,bytea,text,character varying,bytea,bytea,character varying,character varying,timestamp with time zone,bytea,bytea)','EXECUTE') THEN
    RAISE EXCEPTION 'provider cannot complete evidence';
  END IF;
  IF pg_catalog.has_table_privilege('erp_tax_provider','tax.einvoices','INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('erp_tax_provider','tax.eway_bills','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'provider received direct authority-table DML';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
       WHERE tgname IN ('tax_einvoices_provider_guard','tax_eway_bills_provider_guard')
         AND NOT tgisinternal)<>2 THEN
    RAISE EXCEPTION 'provider authority mutation guards are absent';
  END IF;
END
$fixture$;

ROLLBACK;
