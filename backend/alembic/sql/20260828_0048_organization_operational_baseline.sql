SET LOCAL ROLE erp_migration_owner;

-- A self-service organization must be usable immediately.  Identity, access,
-- accounting controls, stock locations and document numbering are one atomic
-- onboarding transaction; no request may observe a half-provisioned tenant.
CREATE FUNCTION erp_core_commands.provision_organization_operational_baseline(
  organization_id uuid,
  actor_membership_id uuid,
  main_branch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  fiscal_start date;
  configured_accounts integer;
  configured_roles integer;
BEGIN
  PERFORM 1
    FROM core.memberships membership
    JOIN core.branches branch
      ON branch.org_id=membership.org_id AND branch.id=main_branch_id
   WHERE membership.org_id=organization_id
     AND membership.id=actor_membership_id
     AND membership.status='active'
     AND membership.joined_at IS NOT NULL
     AND membership.revoked_at IS NULL
     AND branch.status='active'
   FOR SHARE OF membership,branch;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='operational baseline requires an active owner and branch';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':operational-baseline',8728048
  ));

  SELECT count(*) INTO configured_accounts
    FROM finance.accounts account
   WHERE account.org_id=organization_id;
  IF configured_accounts>0 THEN
    -- Existing organizations retain their reviewed chart and settings.  This
    -- bootstrap is intentionally only for a genuinely empty first tenant.
    RETURN;
  END IF;

  INSERT INTO finance.accounts(
    org_id,id,code,name,account_type,currency_code,
    allows_party_posting,allows_bank_reconciliation,status,
    created_by_membership_id,updated_by_membership_id
  )
  SELECT organization_id,pg_catalog.gen_random_uuid(),configuration.code,
         configuration.name,configuration.account_type,'INR',
         configuration.allows_party,false,'active',
         actor_membership_id,actor_membership_id
    FROM (VALUES
      ('1010','Cash on hand','asset'::text,false),
      ('1020','Cheques in hand','asset',false),
      ('1100','Trade receivables','asset',true),
      ('1200','Inventory asset','asset',false),
      ('1401','Input CGST','asset',false),
      ('1402','Input SGST','asset',false),
      ('1403','Input IGST','asset',false),
      ('1404','Input cess','asset',false),
      ('2100','Trade payables','liability',true),
      ('2201','Output CGST','liability',false),
      ('2202','Output SGST','liability',false),
      ('2203','Output IGST','liability',false),
      ('2204','Output cess','liability',false),
      ('2300','Goods received not invoiced','liability',false),
      ('2500','Member reimbursement payable','liability',false),
      ('4100','Sales revenue','income',false),
      ('4200','Inventory count gain','income',false),
      ('4900','Rounding gain','income',false),
      ('5100','Cost of goods sold','expense',false),
      ('5200','Purchase return inventory variance','expense',false),
      ('5201','Inventory count loss','expense',false),
      ('5300','Purchase price variance','expense',false),
      ('5400','Inventory destruction and ITC reversal','expense',false),
      ('5500','Member expense','expense',false),
      ('5900','Rounding loss','expense',false)
    ) AS configuration(code,name,account_type,allows_party);

  INSERT INTO core.settings(
    org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,
    status,created_by_membership_id,updated_by_membership_id
  )
  SELECT organization_id,pg_catalog.gen_random_uuid(),'organization',NULL,
         'finance.account_roles',configuration.role_key,'text',account.id::text,
         'active',actor_membership_id,actor_membership_id
    FROM (VALUES
      ('accounts_receivable','1100'),
      ('accounts_payable','2100'),
      ('sales_revenue','4100'),
      ('input_cgst','1401'),
      ('input_sgst','1402'),
      ('input_igst','1403'),
      ('input_cess','1404'),
      ('output_cgst','2201'),
      ('output_sgst','2202'),
      ('output_igst','2203'),
      ('output_cess','2204'),
      ('goods_received_not_invoiced','2300'),
      ('purchase_return_inventory_variance','5200'),
      ('inventory_asset','1200'),
      ('inventory_count_gain','4200'),
      ('inventory_count_loss','5201'),
      ('cost_of_goods_sold','5100'),
      ('rounding_gain','4900'),
      ('rounding_loss','5900'),
      ('purchase_price_variance','5300'),
      ('inventory_destruction_loss','5400'),
      ('inventory_itc_reversal_expense','5400'),
      ('member_reimbursement_liability','2500'),
      ('cash_on_hand','1010'),
      ('cheques_in_hand','1020')
    ) AS configuration(role_key,account_code)
    JOIN finance.accounts account
      ON account.org_id=organization_id AND account.code=configuration.account_code;

  INSERT INTO inventory.locations(
    org_id,id,branch_id,code,name,location_type,status,allows_sale,
    allows_negative_stock,created_by_membership_id,updated_by_membership_id
  )
  SELECT organization_id,pg_catalog.gen_random_uuid(),main_branch_id,
         configuration.code,configuration.name,configuration.location_type,
         'active',configuration.allows_sale,false,
         actor_membership_id,actor_membership_id
    FROM (VALUES
      ('SALE','Saleable stock','saleable'::text,true),
      ('QUAR','Quarantine','quarantine',false),
      ('RET','Returns','returns',false),
      ('DMG','Damaged stock','damaged',false),
      ('TRANSIT','Stock in transit','transit',false)
    ) AS configuration(code,name,location_type,allows_sale);

  fiscal_start:=pg_catalog.make_date(
    CASE WHEN extract(month FROM current_date)>=4
         THEN extract(year FROM current_date)::integer
         ELSE extract(year FROM current_date)::integer-1 END,
    4,1
  );
  INSERT INTO core.document_sequences(
    org_id,id,branch_id,document_type,fiscal_year_start,prefix,suffix,
    padding,next_value,status,created_by_membership_id,updated_by_membership_id
  )
  SELECT organization_id,pg_catalog.gen_random_uuid(),main_branch_id,
         configuration.document_type,fiscal_start,configuration.prefix,'',
         6,1,'active',actor_membership_id,actor_membership_id
    FROM (VALUES
      ('sales_order','SO-'),('sales_dispatch','SD-'),('sales_invoice','SI-'),
      ('sales_return','SR-'),('purchase_order','PO-'),('goods_receipt','GRN-'),
      ('purchase_return','PR-'),('supplier_payment','SP-'),
      ('customer_receipt','CR-'),('journal_entry','JE-'),
      ('stock_count','SC-'),('stock_transfer','ST-'),('destruction','DST-')
    ) AS configuration(document_type,prefix);

  SELECT count(*) INTO configured_accounts
    FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.status='active';
  SELECT count(*) INTO configured_roles
    FROM core.settings setting
   WHERE setting.org_id=organization_id AND setting.status='active'
     AND setting.namespace='finance.account_roles';
  IF configured_accounts<>25 OR configured_roles<>25 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='organization operational baseline did not reconcile exactly';
  END IF;
END
$function$;
ALTER FUNCTION erp_core_commands.provision_organization_operational_baseline(uuid,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.provision_organization_operational_baseline(uuid,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE FUNCTION erp_core_commands.onboard_first_active_branch_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid;
BEGIN
  IF NEW.status<>'active' THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM finance.accounts account WHERE account.org_id=NEW.org_id) THEN
    RETURN NEW;
  END IF;
  actor_id:=erp_security.current_membership_id();
  IF actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='first active branch requires an authenticated onboarding owner';
  END IF;
  PERFORM erp_core_commands.provision_organization_operational_baseline(
    NEW.org_id,actor_id,NEW.id
  );
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_core_commands.onboard_first_active_branch_baseline()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.onboard_first_active_branch_baseline()
  FROM PUBLIC,erp_app,erp_runtime;

CREATE TRIGGER zz_branches_operational_baseline_trg
  AFTER INSERT OR UPDATE OF status ON core.branches
  FOR EACH ROW EXECUTE FUNCTION erp_core_commands.onboard_first_active_branch_baseline();

-- Repair only empty organizations created by the authenticated onboarding
-- release.  Existing ledgers, settings and business data are never replaced.
DO $backfill$
DECLARE candidate record;
BEGIN
  FOR candidate IN
    SELECT organization.id AS org_id,membership.id AS membership_id,
           branch.id AS branch_id,canonical_user.auth_user_id
      FROM core.organizations organization
      JOIN LATERAL (
        SELECT active_membership.id,active_membership.user_id
          FROM core.memberships active_membership
         WHERE active_membership.org_id=organization.id
           AND active_membership.status='active'
         ORDER BY active_membership.joined_at,active_membership.id LIMIT 1
      ) membership ON true
      JOIN core.users canonical_user ON canonical_user.id=membership.user_id
      JOIN LATERAL (
        SELECT active_branch.id FROM core.branches active_branch
         WHERE active_branch.org_id=organization.id AND active_branch.status='active'
         ORDER BY (active_branch.code='MAIN') DESC,active_branch.code,active_branch.id LIMIT 1
      ) branch ON true
     WHERE organization.status='active'
       AND NOT EXISTS(SELECT 1 FROM finance.accounts account WHERE account.org_id=organization.id)
     ORDER BY organization.id
  LOOP
    PERFORM pg_catalog.set_config('app.org_id',candidate.org_id::text,true);
    PERFORM pg_catalog.set_config('app.membership_id',candidate.membership_id::text,true);
    PERFORM pg_catalog.set_config('app.auth_user_id',coalesce(candidate.auth_user_id::text,''),true);
    PERFORM pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true);
    PERFORM erp_core_commands.provision_organization_operational_baseline(
      candidate.org_id,candidate.membership_id,candidate.branch_id
    );
  END LOOP;
  PERFORM pg_catalog.set_config('app.org_id','',true);
  PERFORM pg_catalog.set_config('app.membership_id','',true);
  PERFORM pg_catalog.set_config('app.auth_user_id','',true);
  PERFORM pg_catalog.set_config('app.request_id','',true);
END
$backfill$;

RESET ROLE;
