\set ON_ERROR_STOP on

-- Alembic-head fixture: this contract is introduced by revision 20260824_0002
-- and must not be evaluated against the immutable 20260820_0001 baseline.

BEGIN;

DO $installed_contract$
DECLARE definition text;
BEGIN
    definition:=pg_catalog.pg_get_functiondef(
      'erp_automation_commands.resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure
    );
    IF pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v1')=0
       OR pg_catalog.strpos(definition,'expiry_groups AS (')=0
       OR pg_catalog.strpos(definition,'GROUP BY eligible_lot.product_id,eligible_lot.expires_on')=0
       OR pg_catalog.strpos(definition,'ORDER BY expiry_group.expires_on')=0
       OR pg_catalog.strpos(definition,'ORDER BY batch_row.expires_on,stock.batch_id')>0 THEN
        RAISE EXCEPTION 'installed sales-invoice FEFO definition is not expiry-tier equivalent';
    END IF;
END
$installed_contract$;

CREATE TEMP TABLE fefo_eligible (
    product_id integer NOT NULL,
    batch_id text NOT NULL,
    expires_on date NOT NULL,
    on_hand_quantity numeric NOT NULL
);
CREATE TEMP TABLE fefo_requested (
    product_id integer NOT NULL,
    batch_id text NOT NULL,
    requested_base numeric NOT NULL
);

CREATE FUNCTION pg_temp.fefo_bad_count()
RETURNS integer
LANGUAGE sql
AS $function$
  WITH totals AS (
    SELECT product_id,sum(requested_base) requested_base
      FROM pg_temp.fefo_requested GROUP BY product_id
  ), expiry_groups AS (
    SELECT eligible.product_id,eligible.expires_on,
           sum(eligible.on_hand_quantity) expiry_available,
           coalesce(sum(requested.requested_base),0) expiry_requested
      FROM pg_temp.fefo_eligible eligible
      LEFT JOIN pg_temp.fefo_requested requested
        ON requested.product_id=eligible.product_id
       AND requested.batch_id=eligible.batch_id
     GROUP BY eligible.product_id,eligible.expires_on
  ), ranked AS (
    SELECT expiry_group.*,
           coalesce(sum(expiry_available) OVER (
             PARTITION BY product_id ORDER BY expires_on
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_available
      FROM expiry_groups expiry_group
  )
  SELECT count(*)::integer FROM ranked JOIN totals USING(product_id)
   WHERE ranked.expiry_requested IS DISTINCT FROM
         greatest(least(totals.requested_base-ranked.prior_available,
                        ranked.expiry_available),0)
$function$;

INSERT INTO fefo_eligible VALUES
  (1,'earliest-a','2026-09-01',5),
  (1,'earliest-b','2026-09-01',5),
  (1,'later','2026-10-01',10);
INSERT INTO fefo_requested VALUES (1,'earliest-b',1);
DO $same_expiry$
BEGIN
  IF pg_temp.fefo_bad_count()<>0 THEN
    RAISE EXCEPTION 'any lot in the earliest equal-expiry tier must be eligible';
  END IF;
END
$same_expiry$;

TRUNCATE fefo_requested;
INSERT INTO fefo_requested VALUES (1,'later',1);
DO $later_rejected$
BEGIN
  IF pg_temp.fefo_bad_count()=0 THEN
    RAISE EXCEPTION 'a later-expiry lot must be rejected while earliest-tier stock remains';
  END IF;
END
$later_rejected$;

TRUNCATE fefo_requested;
INSERT INTO fefo_requested VALUES
  (1,'earliest-a',5),(1,'earliest-b',5),(1,'later',2);
DO $tier_crossing$
BEGIN
  IF pg_temp.fefo_bad_count()<>0 THEN
    RAISE EXCEPTION 'later expiry must be eligible after the complete earliest tier is allocated';
  END IF;
END
$tier_crossing$;

TRUNCATE fefo_requested;
INSERT INTO fefo_requested VALUES
  (1,'earliest-a',4),(1,'earliest-b',5),(1,'later',3);
DO $incomplete_tier$
BEGIN
  IF pg_temp.fefo_bad_count()=0 THEN
    RAISE EXCEPTION 'later expiry must remain blocked when any earliest-tier stock is skipped';
  END IF;
END
$incomplete_tier$;

ROLLBACK;
