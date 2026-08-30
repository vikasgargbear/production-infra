SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_unmatched(
  organization_id uuid,
  reviewed_dataset_id varchar,
  sample_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM erp_core_commands.assert_context(organization_id,NULL,NULL::uuid);
  IF NULLIF(pg_catalog.btrim(reviewed_dataset_id),'') IS NULL
     OR sample_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='historical cutover diagnostic request is invalid';
  END IF;

  WITH unmatched AS (
    SELECT opening.*
      FROM automation.historical_migration_facts opening
     WHERE opening.org_id=organization_id
       AND opening.dataset_id=reviewed_dataset_id
       AND opening.source_kind='opening_item'
       AND opening.selection_state<>'quarantined'
       AND NOT EXISTS (
         SELECT 1
           FROM automation.historical_migration_facts party
          WHERE party.org_id=opening.org_id
            AND party.dataset_id=opening.dataset_id
            AND party.source_kind='party'
            AND (
              opening.party_key=party.party_key
              OR opening.party_key=party.payload->>'source_party_id'
              OR opening.payload->>'source_party_id'=party.party_key
              OR opening.payload->>'source_party_id'=party.payload->>'source_party_id'
            )
       )
  ), unmatched_sample AS (
    SELECT pg_catalog.jsonb_build_object(
      'opening_id',opening.id::text,
      'record_key',opening.record_key,
      'party_key',opening.party_key,
      'payload_source_party_id',opening.payload->>'source_party_id',
      'payload_party_role',opening.payload->>'party_role',
      'payload_side',opening.payload->>'side',
      'payload_keys',(
        SELECT pg_catalog.jsonb_agg(key ORDER BY key)
          FROM pg_catalog.jsonb_object_keys(opening.payload) key
      )
    ) AS item
      FROM unmatched opening
     ORDER BY opening.id
     LIMIT sample_limit
  ), party_sample AS (
    SELECT pg_catalog.jsonb_build_object(
      'party_id',party.id::text,
      'record_key',party.record_key,
      'party_key',party.party_key,
      'payload_source_party_id',party.payload->>'source_party_id',
      'payload_party_role',party.payload->>'party_role',
      'selection_state',party.selection_state,
      'payload_keys',(
        SELECT pg_catalog.jsonb_agg(key ORDER BY key)
          FROM pg_catalog.jsonb_object_keys(party.payload) key
      )
    ) AS item
      FROM automation.historical_migration_facts party
     WHERE party.org_id=organization_id
       AND party.dataset_id=reviewed_dataset_id
       AND party.source_kind='party'
     ORDER BY party.id
     LIMIT sample_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'unmatched_openings',(SELECT count(*) FROM unmatched),
    'unmatched_top_level_keys',(SELECT count(DISTINCT party_key) FROM unmatched),
    'unmatched_payload_source_ids',(
      SELECT count(DISTINCT payload->>'source_party_id') FROM unmatched
    ),
    'unmatched_sample',COALESCE(
      (SELECT pg_catalog.jsonb_agg(item) FROM unmatched_sample),'[]'::jsonb
    ),
    'party_sample',COALESCE(
      (SELECT pg_catalog.jsonb_agg(item) FROM party_sample),'[]'::jsonb
    )
  ) INTO result;
  RETURN result;
END
$function$;

ALTER FUNCTION erp_automation_reads.historical_operational_cutover_unmatched(uuid,varchar,integer)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_operational_cutover_unmatched(uuid,varchar,integer)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_operational_cutover_unmatched(uuid,varchar,integer)
  TO erp_runtime;

RESET ROLE;
