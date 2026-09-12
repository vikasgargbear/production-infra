"""Real prepare/approve/execute price enrichment, always rolled back in local PG15."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text

spec = importlib.util.spec_from_file_location('cutover', Path(__file__).with_name('check_historical_product_inventory_cutover_runtime_role.py'))
cutover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutover)
f = cutover.fixture


def main():
    engine = create_engine(os.environ['DATABASE_URL'])
    with engine.connect() as c:
        tx = c.begin()
        try:
            f._seed(c)
            cutover._seed_cutover_authority(c)
            grant = uuid4()
            params = {'org': f.ORG_A, 'member': f.MEMBER_A, 'role': f.ROLE_A, 'branch': cutover.BRANCH, 'grant': grant}
            c.exec_driver_sql('SET LOCAL ROLE erp_migration_owner')
            for table in ('automation.agent_grants','automation.agent_grant_capabilities'):
                c.exec_driver_sql(f'ALTER TABLE {table} DISABLE TRIGGER USER')
            c.execute(text("""
              INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
              SELECT :org,:role,code,:member FROM unnest(ARRAY['automation.command.execute','automation.command.approve','automation.command.view']) code;
              INSERT INTO automation.agent_grants(org_id,id,subject_membership_id,client_id,client_display_name,branch_id,
                authorization_mode,consent_version,consent_text_hash,consented_by_membership_id,consented_at,granted_by_membership_id,
                granted_at,expires_at,status,created_by_membership_id,updated_by_membership_id)
              VALUES(:org,:grant,:member,'rate-test','Rate Test',:branch,'self_consent','v1',decode(repeat('81',32),'hex'),
                :member,transaction_timestamp(),:member,transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:member,:member);
              INSERT INTO automation.agent_grant_capabilities(org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,created_by_membership_id)
              SELECT :org,:grant,code,'write','consequential_write','actor_confirmation',:member
              FROM unnest(ARRAY['inventory.batch_sale_rate.prepare','automation.command.approve','automation.command.execute']) code;
            """), params)
            for table in ('automation.agent_grants','automation.agent_grant_capabilities'):
                c.exec_driver_sql(f'ALTER TABLE {table} ENABLE TRIGGER USER')
            c.exec_driver_sql('RESET ROLE')
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            c.execute(text("SELECT erp_security.activate_context(:auth,:org),set_config('app.request_id',gen_random_uuid()::text,true)"),
                      {'org': f.ORG_A,'auth': f.AUTH_A})
            facts = []
            def fact(kind, key, payload, event='2026-08-20'):
                return cutover._fact(str(uuid4()),kind,key,product_code='RATE',product_name='CODEX-E2E Rate Product',
                   quantity='1',inventory_value='10',event_date=event,payload=payload,batch_number='RATE-B1')
            facts.append(fact('product','rate-product',{'source_product_code':'RATE','source_company':'CODEX-E2E Manufacturer',
                'product_kind':'medicine','base_uom_code':'PCS','hsn_code':'30049099','gst_rate':'12.000000',
                'hsn_gst_candidate_unique':True,'batch_reconciliation_status':'exact'}))
            facts.append(fact('batch','rate-batch',{'mrp':'120.00','unit_cost':'10.00','base_uom_code':'PCS',
                'mrp_uom_code':'PCS','mrp_uom_multiplier':'1.000000'}, '2028-08-01'))
            facts.append(fact('sales_invoice','rate-invoice',{}))
            facts.append(fact('sales_invoice_line','rate-line',{'source_invoice_id':'rate-invoice','quoted_unit_rate':'29.00',
               'billed_quantity':'1','gross_amount':'29.00','line_discount':'0.00','tax_rate':'5.00','tax_amount':'1.45','line_total':'30.45'}))
            c.execute(text('SELECT erp_automation_commands.import_historical_migration_facts(:org,CAST(:facts AS jsonb))'),
                      {'org':f.ORG_A,'facts':json.dumps(facts)})
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
            c.exec_driver_sql('SET LOCAL ROLE erp_migration_owner')
            c.execute(text('SELECT erp_automation_commands.install_historical_tax_snapshot(:org,:dataset)'),{'org':f.ORG_A,'dataset':cutover.DATASET})
            c.exec_driver_sql('RESET ROLE')
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            c.execute(text('SELECT erp_automation_commands.promote_historical_product_inventory_batch(:org,:dataset,:location,100)'),
                {'org':f.ORG_A,'dataset':cutover.DATASET,'location':cutover.LOCATION})
            c.exec_driver_sql('SET CONSTRAINTS ALL IMMEDIATE')
            ctx = c.execute(text('SELECT erp_automation_reads.batch_sale_rate_context(:org,:branch,100,0)'),params).scalar_one()
            row = ctx['rows'][0]
            def unchanged_counts():
                c.exec_driver_sql('RESET SESSION AUTHORIZATION')
                counts = c.execute(text('SELECT (SELECT count(*) FROM finance.journal_entries WHERE org_id=:org), '
                    '(SELECT count(*) FROM finance.journal_lines WHERE org_id=:org), '
                    '(SELECT count(*) FROM automation.historical_migration_facts WHERE org_id=:org)'), params).one()
                c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
                return counts
            immutable_counts = unchanged_counts()
            line = {'batch_id':row['batch_id'],'batch_row_version':row['batch_row_version'],'expected_rate_version':0,
               'sale_rate':'29.00','uom_code':'PCS','price_basis':'tax_exclusive','effective_from':'2026-09-13','source_kind':'migration_source',
               'source_evidence':{'reason':'Source-backed reviewed selling rate','source_batch_fact_id':row['source_batch_fact_id'],
                 'source_batch_row_sha256':row['source_batch_row_sha256'],'source_file_sha256':'11'*32,'source_record_key':'source-row-1',
                 'source_sales_line_fact_id':facts[3]['id'],'source_sales_line_record_key':'rate-line',
                 'source_sales_line_row_sha256':facts[3]['row_sha256']}}
            prepare = 'SELECT erp_automation_commands.persist_batch_sale_rate_prepare(:org,:grant,:command,:key,:request,transaction_timestamp()+interval \'15 minutes\')'
            def prepared(item, key=None):
                args={**params,'command':uuid4(),'key':key or hashlib.sha256(str(uuid4()).encode()).digest(),
                      'request':json.dumps({'branch_id':str(cutover.BRANCH),'lines':[item]}).encode()}
                return c.execute(text(prepare),args).scalar_one(),args
            for change in ({'sale_rate':'-1'},{'sale_rate':'1.00001'},{'sale_rate':'30.00'},{'uom_code':'BOX'},
                           {'expected_rate_version':1},{'effective_from':'infinity'},{'price_basis':'tax_inclusive'},
                           {'source_evidence':{**line['source_evidence'],'source_batch_row_sha256':'22'*32}}):
                args={**params,'command':uuid4(),'key':hashlib.sha256(str(uuid4()).encode()).digest(),
                      'request':json.dumps({'branch_id':str(cutover.BRANCH),'lines':[{**line,**change}]}).encode()}
                cutover._expect_denied(c,prepare,args)
            command,args=prepared(line)
            assert command['preview']['resolved_references'] == [line]
            assert c.execute(text(prepare),args).scalar_one()['command_request_id']==command['command_request_id']
            cutover._expect_denied(c,prepare,{**args,'request':json.dumps({'branch_id':str(cutover.BRANCH),'lines':[{**line,'sale_rate':'28.00'}]}).encode()})
            execute='SELECT erp_automation_commands.execute_batch_sale_rate(:org,CAST(:command AS uuid))'
            action={**params,'command':command['command_request_id']}
            c.execute(text("SELECT set_config('app.command_request_id',:command,true)"),action)
            cutover._expect_denied(c,execute,action)
            c.execute(text('SELECT erp_automation_commands.approve_operator_command(:org,CAST(:command AS uuid),:approval,:hash,:key,transaction_timestamp()+interval \'10 minutes\')'),
               {**action,'approval':uuid4(),'hash':bytes.fromhex(command['preview_hash']),'key':hashlib.sha256(b'approve-rate').digest()})
            response=c.execute(text(execute),action).scalar_one()
            assert c.execute(text(execute),action).scalar_one()==response
            rates=c.execute(text('SELECT erp_automation_reads.batch_sale_rate_review(:org,CAST(:command AS uuid))'),action).scalar_one()
            assert len(rates)==1 and rates[0]['sale_rate']=='29.0000'
            suggested=c.execute(text("SELECT * FROM erp_automation_reads.migrated_batch_sale_rate(:org,CAST(:batch AS uuid),:branch,DATE '2026-09-13')"),
                {**params,'batch':row['batch_id']}).one()
            assert suggested[0]=='29.0000' and suggested[1]=='reviewed_batch_price'
            assert c.execute(text('SELECT sum(on_hand_quantity),sum(inventory_value) FROM inventory.stock_balances WHERE org_id=:org'),params).one()==(1,10)
            cutover._expect_denied(c,'SELECT * FROM inventory.batch_sale_rate_evidence',{})
            cutover._expect_denied(c,execute,{**action,'org':f.ORG_B})
            cutover._expect_denied(c,prepare,{**args,'command':uuid4(),'key':hashlib.sha256(b'stale-rate').digest()})
            manual = {**line, 'expected_rate_version': 1, 'sale_rate': '31.25',
                      'source_kind': 'operator_review', 'source_evidence': {'reason': 'Reviewed new selling price'}}
            manual_command, _ = prepared(manual)
            manual_action = {**params, 'command': manual_command['command_request_id']}
            c.execute(text("SELECT set_config('app.command_request_id',:command,true)"), manual_action)
            c.execute(text('SELECT erp_automation_commands.approve_operator_command(:org,CAST(:command AS uuid),:approval,:hash,:key,transaction_timestamp()+interval \'10 minutes\')'),
                {**manual_action, 'approval': uuid4(), 'hash': bytes.fromhex(manual_command['preview_hash']),
                 'key': hashlib.sha256(b'approve-manual-rate').digest()})
            c.execute(text(execute), manual_action)
            updated = c.execute(text("SELECT * FROM erp_automation_reads.migrated_batch_sale_rate(:org,CAST(:batch AS uuid),:branch,DATE '2026-09-13')"),
                {**params, 'batch': row['batch_id']}).one()
            assert updated[0] == '31.2500' and updated[1] == 'reviewed_batch_price'
            assert c.execute(text('SELECT sum(on_hand_quantity),sum(inventory_value) FROM inventory.stock_balances WHERE org_id=:org'),params).one() == (1, 10)
            for limit, offset in ((None, 0), (101, 0), (1, -1)):
                cutover._expect_denied(c, 'SELECT erp_automation_reads.batch_sale_rate_context(:org,:branch,:limit,:offset)',
                                      {**params, 'limit': limit, 'offset': offset})
            assert unchanged_counts() == immutable_counts
            print('batch sale-rate runtime lifecycle passed: strict source mapping, prepare/approval/replay, RLS, unchanged stock')
        finally:
            tx.rollback()
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
    engine.dispose()


if __name__=='__main__':
    main()
