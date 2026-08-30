SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_operational_batch(
  organization_id uuid,
  reviewed_dataset_id varchar,
  batch_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  actor_id uuid;
  party_fact automation.historical_migration_facts%ROWTYPE;
  opening_fact automation.historical_migration_facts%ROWTYPE;
  role_name text;
  phone_value text;
  matched_count integer;
  party_identifier uuid;
  account_identifier uuid;
  posting_account_id uuid;
  receivable_account_id uuid;
  payable_account_id uuid;
  equity_account_id uuid;
  generated_code text;
  command_time timestamptz:=transaction_timestamp();
  document_identifier uuid;
  journal_identifier uuid;
  event_identifier uuid;
  open_item_identifier uuid;
  normalized_side text;
  amount_value numeric(20,2);
  document_date_value date;
  due_date_value date;
  document_number_value text;
  parties_promoted integer:=0;
  parties_bound integer:=0;
  openings_promoted integer:=0;
  parties_remaining integer;
  openings_remaining integer;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.organization.manage',NULL::uuid
  );
  IF NULLIF(pg_catalog.btrim(reviewed_dataset_id),'') IS NULL
     OR batch_size NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operational cutover batch is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reviewed historical dataset does not exist';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||reviewed_dataset_id||':operational-cutover',8728067
  ));

  SELECT account.id INTO receivable_account_id
    FROM core.settings setting JOIN finance.accounts account
      ON account.org_id=setting.org_id AND account.id=setting.value_text::uuid
   WHERE setting.org_id=organization_id AND setting.namespace='finance.account_roles'
     AND setting.key='accounts_receivable' AND setting.status='active'
     AND setting.branch_id IS NULL AND account.status='active';
  SELECT account.id INTO payable_account_id
    FROM core.settings setting JOIN finance.accounts account
      ON account.org_id=setting.org_id AND account.id=setting.value_text::uuid
   WHERE setting.org_id=organization_id AND setting.namespace='finance.account_roles'
     AND setting.key='accounts_payable' AND setting.status='active'
     AND setting.branch_id IS NULL AND account.status='active';
  IF receivable_account_id IS NULL OR payable_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='operational cutover requires receivable and payable account roles';
  END IF;

  SELECT account.id INTO equity_account_id FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.code='3000' AND account.status='active';
  IF equity_account_id IS NULL THEN
    equity_account_id:=gen_random_uuid();
    INSERT INTO finance.accounts(
      org_id,id,code,name,account_type,currency_code,allows_party_posting,
      allows_bank_reconciliation,status,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,equity_account_id,'3000','Opening balance equity','equity','INR',
      false,false,'active',actor_id,actor_id
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.settings setting WHERE setting.org_id=organization_id
      AND setting.namespace='finance.account_roles' AND setting.key='opening_balance_equity'
      AND setting.status='active' AND setting.branch_id IS NULL
  ) THEN
    INSERT INTO core.settings(
      org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,gen_random_uuid(),'organization',NULL,'finance.account_roles',
      'opening_balance_equity','text',equity_account_id::text,'active',actor_id,actor_id
    );
  END IF;

  FOR party_fact IN
    SELECT fact.* FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_party_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='party'
     AND (fact.selection_state<>'quarantined'
          OR fact.payload->>'selection_state'='archive-only')
     AND binding.source_fact_id IS NULL
   ORDER BY fact.id LIMIT batch_size
  LOOP
    role_name:=party_fact.payload->>'party_role';
    IF role_name NOT IN ('customer','supplier')
       OR NULLIF(pg_catalog.btrim(party_fact.party_key),'') IS NULL
       OR NULLIF(pg_catalog.btrim(party_fact.party_name),'') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='historical party fact cannot be promoted';
    END IF;
    IF role_name='customer' THEN
      SELECT count(*),(array_agg(account.party_id ORDER BY account.id))[1],
             (array_agg(account.id ORDER BY account.id))[1]
        INTO matched_count,party_identifier,account_identifier
        FROM parties.customer_accounts account JOIN parties.parties party
          ON party.org_id=account.org_id AND party.id=account.party_id
       WHERE account.org_id=organization_id AND account.status<>'closed'
         AND party.status<>'archived'
         AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
             pg_catalog.lower(pg_catalog.btrim(party_fact.party_name));
      posting_account_id:=receivable_account_id;
    ELSE
      SELECT count(*),(array_agg(account.party_id ORDER BY account.id))[1],
             (array_agg(account.id ORDER BY account.id))[1]
        INTO matched_count,party_identifier,account_identifier
        FROM parties.supplier_accounts account JOIN parties.parties party
          ON party.org_id=account.org_id AND party.id=account.party_id
       WHERE account.org_id=organization_id AND account.status<>'closed'
         AND party.status<>'archived'
         AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
             pg_catalog.lower(pg_catalog.btrim(party_fact.party_name));
      posting_account_id:=payable_account_id;
    END IF;
    IF matched_count>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical party matches more than one operational account';
    END IF;
    IF matched_count=0 THEN
      party_identifier:=gen_random_uuid();
      account_identifier:=gen_random_uuid();
      INSERT INTO parties.parties(
        org_id,id,party_kind,legal_name,status,created_by_membership_id,updated_by_membership_id
      ) VALUES (
        organization_id,party_identifier,'organization',party_fact.party_name,'draft',actor_id,actor_id
      );
      phone_value:=NULLIF(pg_catalog.regexp_replace(COALESCE(party_fact.payload->>'primary_phone',''),'[^0-9]','','g'),'');
      IF phone_value ~ '^[0-9]{10}$' THEN
        INSERT INTO parties.contacts(
          org_id,id,party_id,contact_kind,name,phone,is_primary,status,
          created_by_membership_id,updated_by_membership_id
        ) VALUES (
          organization_id,gen_random_uuid(),party_identifier,'business',party_fact.party_name,
          phone_value,true,'active',actor_id,actor_id
        );
      END IF;
      UPDATE parties.parties SET status='active',updated_at=command_time,
        updated_by_membership_id=actor_id,row_version=row_version+1
       WHERE org_id=organization_id AND id=party_identifier;
      generated_code:=erp_master_commands.allocate_code(organization_id,role_name,actor_id);
      IF role_name='customer' THEN
        INSERT INTO parties.customer_accounts(
          org_id,id,party_id,customer_code,credit_limit,credit_days,
          default_receivable_account_id,status,created_by_membership_id,updated_by_membership_id
        ) VALUES (
          organization_id,account_identifier,party_identifier,generated_code,0,0,
          posting_account_id,'active',actor_id,actor_id
        );
      ELSE
        INSERT INTO parties.supplier_accounts(
          org_id,id,party_id,supplier_code,payment_days,default_payable_account_id,
          status,created_by_membership_id,updated_by_membership_id
        ) VALUES (
          organization_id,account_identifier,party_identifier,generated_code,0,
          posting_account_id,'active',actor_id,actor_id
        );
      END IF;
      parties_promoted:=parties_promoted+1;
    ELSE
      parties_bound:=parties_bound+1;
    END IF;
    INSERT INTO automation.historical_party_bindings(
      org_id,dataset_id,source_party_id,party_role,source_fact_id,party_id,account_id,
      created_by_membership_id
    ) VALUES (
      organization_id,reviewed_dataset_id,party_fact.party_key,role_name,party_fact.id,
      party_identifier,account_identifier,actor_id
    );
  END LOOP;

  SELECT count(*) INTO parties_remaining
    FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_party_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='party'
     AND (fact.selection_state<>'quarantined'
          OR fact.payload->>'selection_state'='archive-only')
     AND binding.source_fact_id IS NULL;

  IF parties_remaining=0 THEN
    FOR opening_fact IN
      SELECT fact.* FROM automation.historical_migration_facts fact
      LEFT JOIN finance.opening_balance_documents document
        ON document.org_id=fact.org_id AND document.source_fact_id=fact.id
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='opening_item' AND fact.selection_state<>'quarantined'
       AND document.source_fact_id IS NULL
     ORDER BY fact.event_date,fact.id LIMIT batch_size
    LOOP
      normalized_side:=CASE pg_catalog.lower(pg_catalog.btrim(COALESCE(opening_fact.payload->>'side','')))
        WHEN 'dr' THEN 'receivable' WHEN 'debit' THEN 'receivable'
        WHEN 'cr' THEN 'payable' WHEN 'credit' THEN 'payable' ELSE NULL END;
      amount_value:=pg_catalog.abs(COALESCE(opening_fact.outstanding_amount,0));
      IF normalized_side IS NULL OR amount_value<=0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='historical opening item side or amount is invalid';
      END IF;
      SELECT binding.party_id INTO STRICT party_identifier
        FROM automation.historical_party_bindings binding
       WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
         AND binding.source_party_id=opening_fact.party_key
         AND binding.party_role=opening_fact.payload->>'party_role';
      document_date_value:=COALESCE(NULLIF(opening_fact.payload->>'document_date','')::date,opening_fact.event_date);
      due_date_value:=COALESCE(NULLIF(opening_fact.payload->>'due_date','')::date,document_date_value);
      IF due_date_value<document_date_value THEN due_date_value:=document_date_value; END IF;
      document_number_value:=pg_catalog.left(COALESCE(
        NULLIF(opening_fact.payload->>'source_reference',''),
        'MIG-OPEN-'||pg_catalog.replace(opening_fact.id::text,'-','')
      ),64);
      IF EXISTS (
        SELECT 1 FROM finance.opening_balance_documents existing
         WHERE existing.org_id=organization_id AND existing.document_number=document_number_value
      ) THEN
        document_number_value:=pg_catalog.left(document_number_value,31)||'-'||
          pg_catalog.substring(pg_catalog.md5(opening_fact.id::text),1,16);
      END IF;
      document_identifier:=gen_random_uuid();
      journal_identifier:=gen_random_uuid();
      event_identifier:=gen_random_uuid();
      open_item_identifier:=gen_random_uuid();
      INSERT INTO finance.opening_balance_documents(
        org_id,id,source_fact_id,branch_id,party_id,document_number,document_date,
        due_date,item_side,amount,currency_code,status,posted_at,posted_by_membership_id,
        created_by_membership_id
      ) VALUES (
        organization_id,document_identifier,opening_fact.id,opening_fact.branch_id,
        party_identifier,document_number_value,document_date_value,due_date_value,
        normalized_side,amount_value,'INR','posted',command_time,actor_id,actor_id
      );
      INSERT INTO finance.journal_entries(
        org_id,id,journal_number,posting_date,description,transaction_currency,
        functional_currency,fx_rate,status,created_by_membership_id,updated_by_membership_id
      ) VALUES (
        organization_id,journal_identifier,'MIG-'||opening_fact.id::text,document_date_value,
        'Opening balance '||document_number_value,'INR','INR',1,'draft',actor_id,actor_id
      );
      INSERT INTO finance.journal_lines(
        org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
        transaction_debit,transaction_credit,functional_debit,functional_credit,
        created_by_membership_id
      ) VALUES
      (
        organization_id,gen_random_uuid(),journal_identifier,1,
        CASE normalized_side WHEN 'receivable' THEN receivable_account_id ELSE equity_account_id END,
        opening_fact.branch_id,CASE normalized_side WHEN 'receivable' THEN party_identifier ELSE NULL END,
        'Opening balance '||document_number_value,
        amount_value,0,amount_value,0,actor_id
      ),
      (
        organization_id,gen_random_uuid(),journal_identifier,2,
        CASE normalized_side WHEN 'receivable' THEN equity_account_id ELSE payable_account_id END,
        opening_fact.branch_id,CASE normalized_side WHEN 'payable' THEN party_identifier ELSE NULL END,
        'Opening balance '||document_number_value,
        0,amount_value,0,amount_value,actor_id
      );
      UPDATE finance.journal_entries SET
        transaction_debit_total=amount_value,transaction_credit_total=amount_value,
        functional_debit_total=amount_value,functional_credit_total=amount_value,
        status='posted',posted_at=command_time,posted_by_membership_id=actor_id,
        updated_at=command_time,updated_by_membership_id=actor_id,row_version=row_version+1
       WHERE org_id=organization_id AND id=journal_identifier AND status='draft';
      INSERT INTO finance.accounting_events(
        org_id,id,event_type,opening_balance_document_id,journal_entry_id,
        occurred_at,source_posted_at,created_by_membership_id
      ) VALUES (
        organization_id,event_identifier,'opening_balance',document_identifier,
        journal_identifier,command_time,command_time,actor_id
      );
      INSERT INTO finance.open_items(
        org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,
        due_date,currency_code,principal_amount,functional_principal_amount,status,
        created_by_membership_id
      ) VALUES (
        organization_id,open_item_identifier,event_identifier,party_identifier,
        normalized_side,document_number_value,document_date_value,due_date_value,
        'INR',amount_value,amount_value,'open',actor_id
      );
      openings_promoted:=openings_promoted+1;
    END LOOP;
  END IF;

  SELECT count(*) INTO openings_remaining
    FROM automation.historical_migration_facts fact
    LEFT JOIN finance.opening_balance_documents document
      ON document.org_id=fact.org_id AND document.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='opening_item' AND fact.selection_state<>'quarantined'
     AND document.source_fact_id IS NULL;
  RETURN pg_catalog.jsonb_build_object(
    'parties_promoted',parties_promoted,'parties_bound',parties_bound,
    'parties_remaining',parties_remaining,'openings_promoted',openings_promoted,
    'openings_remaining',openings_remaining,
    'complete',(parties_remaining=0 AND openings_remaining=0)
  );
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_status(
  organization_id uuid,
  reviewed_dataset_id varchar
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
  SELECT pg_catalog.jsonb_build_object(
    'source_parties',count(*) FILTER (
      WHERE fact.source_kind='party'
        AND (fact.selection_state<>'quarantined'
             OR fact.payload->>'selection_state'='archive-only')
    ),
    'bound_parties',(SELECT count(*) FROM automation.historical_party_bindings binding
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id),
    'source_openings',count(*) FILTER (WHERE fact.source_kind='opening_item' AND fact.selection_state<>'quarantined'),
    'posted_openings',(SELECT count(*) FROM finance.opening_balance_documents document
      JOIN automation.historical_migration_facts source ON source.org_id=document.org_id AND source.id=document.source_fact_id
      WHERE document.org_id=organization_id AND source.dataset_id=reviewed_dataset_id),
    'receivable',COALESCE((SELECT sum(document.amount) FROM finance.opening_balance_documents document
      JOIN automation.historical_migration_facts source ON source.org_id=document.org_id AND source.id=document.source_fact_id
      WHERE document.org_id=organization_id AND source.dataset_id=reviewed_dataset_id AND document.item_side='receivable'),0)::text,
    'payable',COALESCE((SELECT sum(document.amount) FROM finance.opening_balance_documents document
      JOIN automation.historical_migration_facts source ON source.org_id=document.org_id AND source.id=document.source_fact_id
      WHERE document.org_id=organization_id AND source.dataset_id=reviewed_dataset_id AND document.item_side='payable'),0)::text
  ) INTO result
  FROM automation.historical_migration_facts fact
  WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id;
  RETURN result;
END
$function$;

ALTER FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  TO erp_runtime;

RESET ROLE;
