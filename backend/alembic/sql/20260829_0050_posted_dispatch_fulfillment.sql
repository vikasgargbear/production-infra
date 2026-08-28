-- Count only posted sales dispatches as commercial fulfillment.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    old_ceiling constant text := $old_ceiling$         WHERE line.org_id=organization_id AND line.order_line_id=order_line.id
           AND parent.id<>dispatch_id AND parent.status<>'cancelled';$old_ceiling$;
    new_ceiling constant text := $new_ceiling$         WHERE line.org_id=organization_id AND line.order_line_id=order_line.id
           /* posted_dispatch_fulfillment_ceiling_v1 */
           AND parent.id<>dispatch_id AND parent.status='posted';$new_ceiling$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_automation_commands.resolve_sales_dispatch_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure
    ) INTO STRICT definition;

    IF pg_catalog.strpos(definition,'posted_dispatch_fulfillment_ceiling_v1')>0
       AND pg_catalog.strpos(definition,old_ceiling)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.strpos(definition,old_ceiling)=0
       OR pg_catalog.length(definition)-pg_catalog.length(
            pg_catalog.replace(definition,old_ceiling,'')
          )<>pg_catalog.length(old_ceiling) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-dispatch resolver differs from the reviewed posted-fulfillment precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_ceiling,new_ceiling);
    IF pg_catalog.strpos(definition,'posted_dispatch_fulfillment_ceiling_v1')=0
       OR pg_catalog.strpos(definition,'parent.status<>''cancelled''')>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-dispatch resolver migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

DO $migration$
DECLARE
    definition text;
    old_guard constant text := $old_guard$     WHERE line.org_id=NEW.org_id AND line.order_line_id=NEW.order_line_id AND parent.status<>'cancelled';$old_guard$;
    new_guard constant text := $new_guard$     WHERE line.org_id=NEW.org_id AND line.order_line_id=NEW.order_line_id
       /* posted_dispatch_or_current_draft_ceiling_v1 */
       AND (parent.status='posted' OR parent.id=NEW.dispatch_id);$new_guard$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_trade_invariants.guard_dispatch_line()'::regprocedure
    ) INTO STRICT definition;

    IF pg_catalog.strpos(definition,'posted_dispatch_or_current_draft_ceiling_v1')>0
       AND pg_catalog.strpos(definition,old_guard)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.strpos(definition,old_guard)=0
       OR pg_catalog.length(definition)-pg_catalog.length(
            pg_catalog.replace(definition,old_guard,'')
          )<>pg_catalog.length(old_guard) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='dispatch-line guard differs from the reviewed posted-fulfillment precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_guard,new_guard);
    IF pg_catalog.strpos(definition,'posted_dispatch_or_current_draft_ceiling_v1')=0
       OR pg_catalog.strpos(definition,'parent.status<>''cancelled''')>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='dispatch-line guard migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

RESET ROLE;
