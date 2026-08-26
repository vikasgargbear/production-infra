-- Track only the GST input-credit-bearing portion of fungible batch stock.
-- A batch may contain uninvoiced, ineligible, free, opening, or count-gain
-- quantities alongside quantities backed by an eligible supplier invoice.
-- Ordinary stock issues must remain postable while their eligible subset is
-- consumed deterministically for later destruction/return reconciliation.

SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_compliance_commands.consume_input_credit_lots(
  organization_id uuid, batch_id uuid, consumed_quantity numeric,
  application_kind text, stock_ledger_entry_id uuid, actor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE lot tax.input_credit_lots%ROWTYPE;
  remaining_quantity numeric(20,6):=consumed_quantity;
  applied_total numeric(20,6):=0;
  applied_quantity numeric(20,6); applied_cgst numeric(20,2); applied_sgst numeric(20,2);
  applied_igst numeric(20,2); applied_cess numeric(20,2);
BEGIN
  IF organization_id IS NULL OR batch_id IS NULL OR actor_id IS NULL
     OR consumed_quantity<=0 OR consumed_quantity<>round(consumed_quantity,6)
     OR application_kind NOT IN ('sale_consumption','purchase_return_consumption','opening_consumption') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='input-credit consumption input is invalid';
  END IF;
  FOR lot IN SELECT * FROM tax.input_credit_lots source
    WHERE source.org_id=organization_id AND source.batch_id=batch_id
      AND source.lineage_status='exact' AND source.remaining_base_quantity>0
    ORDER BY source.acquired_on,source.supplier_invoice_id,source.supplier_invoice_line_id,source.id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_quantity=0;
    applied_quantity:=least(remaining_quantity,lot.remaining_base_quantity);
    applied_cgst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cgst_amount
      ELSE round(lot.remaining_cgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_sgst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_sgst_amount
      ELSE round(lot.remaining_sgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_igst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_igst_amount
      ELSE round(lot.remaining_igst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_cess:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cess_amount
      ELSE round(lot.remaining_cess_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    INSERT INTO tax.input_credit_applications(
      org_id,input_credit_lot_id,stock_ledger_entry_id,application_kind,
      applied_base_quantity,applied_cgst_amount,applied_sgst_amount,
      applied_igst_amount,applied_cess_amount,source_lot_row_version,status,posted_at,
      created_by_membership_id)
    VALUES(organization_id,lot.id,stock_ledger_entry_id,application_kind,
      applied_quantity,applied_cgst,applied_sgst,applied_igst,applied_cess,
      lot.row_version,'posted',transaction_timestamp(),actor_id);
    UPDATE tax.input_credit_lots SET
      remaining_base_quantity=remaining_base_quantity-applied_quantity,
      remaining_cgst_amount=remaining_cgst_amount-applied_cgst,
      remaining_sgst_amount=remaining_sgst_amount-applied_sgst,
      remaining_igst_amount=remaining_igst_amount-applied_igst,
      remaining_cess_amount=remaining_cess_amount-applied_cess,
      updated_at=transaction_timestamp(),updated_by_membership_id=actor_id,
      row_version=row_version+1
     WHERE org_id=organization_id AND id=lot.id AND row_version=lot.row_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='input-credit lot changed during deterministic consumption';
    END IF;
    remaining_quantity:=remaining_quantity-applied_quantity;
    applied_total:=applied_total+applied_quantity;
  END LOOP;
  RETURN applied_total;
END
$function$;
ALTER FUNCTION erp_compliance_commands.consume_input_credit_lots(uuid,uuid,numeric,text,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.consume_input_credit_lots(uuid,uuid,numeric,text,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE OR REPLACE FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(
  organization_id uuid,batch_id uuid,restored_quantity numeric,
  stock_ledger_entry_id uuid,actor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE consumed tax.input_credit_applications%ROWTYPE; lot tax.input_credit_lots%ROWTYPE;
  remaining_quantity numeric(20,6):=restored_quantity; available_quantity numeric(20,6);
  restored_total numeric(20,6):=0;
  applied_quantity numeric(20,6); restored_cgst numeric(20,2); restored_sgst numeric(20,2);
  restored_igst numeric(20,2); restored_cess numeric(20,2); prior record;
BEGIN
  IF organization_id IS NULL OR batch_id IS NULL OR stock_ledger_entry_id IS NULL OR actor_id IS NULL
     OR restored_quantity<=0 OR restored_quantity<>round(restored_quantity,6) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-return credit-lot restoration input is invalid';
  END IF;
  FOR consumed IN SELECT application.* FROM tax.input_credit_applications application
    JOIN tax.input_credit_lots source ON source.org_id=application.org_id
      AND source.id=application.input_credit_lot_id
   WHERE application.org_id=organization_id AND source.batch_id=batch_id
     AND application.application_kind='sale_consumption'
     AND application.application_direction='consume' AND application.status='posted'
   ORDER BY application.posted_at DESC,application.id DESC FOR UPDATE OF application
  LOOP
    EXIT WHEN remaining_quantity=0;
    SELECT COALESCE(sum(restoration.applied_base_quantity),0) quantity,
           COALESCE(sum(restoration.applied_cgst_amount),0) cgst,
           COALESCE(sum(restoration.applied_sgst_amount),0) sgst,
           COALESCE(sum(restoration.applied_igst_amount),0) igst,
           COALESCE(sum(restoration.applied_cess_amount),0) cess
      INTO prior FROM tax.input_credit_applications restoration
     WHERE restoration.org_id=organization_id
       AND restoration.reverses_application_id=consumed.id
       AND restoration.application_kind='sales_return_restoration'
       AND restoration.status='posted';
    available_quantity:=consumed.applied_base_quantity-prior.quantity;
    CONTINUE WHEN available_quantity<=0;
    applied_quantity:=least(remaining_quantity,available_quantity);
    restored_cgst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_cgst_amount-prior.cgst
      ELSE round((consumed.applied_cgst_amount-prior.cgst)*applied_quantity/available_quantity,2) END;
    restored_sgst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_sgst_amount-prior.sgst
      ELSE round((consumed.applied_sgst_amount-prior.sgst)*applied_quantity/available_quantity,2) END;
    restored_igst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_igst_amount-prior.igst
      ELSE round((consumed.applied_igst_amount-prior.igst)*applied_quantity/available_quantity,2) END;
    restored_cess:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_cess_amount-prior.cess
      ELSE round((consumed.applied_cess_amount-prior.cess)*applied_quantity/available_quantity,2) END;
    SELECT * INTO STRICT lot FROM tax.input_credit_lots source
     WHERE source.org_id=organization_id AND source.id=consumed.input_credit_lot_id FOR UPDATE;
    IF lot.remaining_base_quantity+applied_quantity>lot.acquired_base_quantity
       OR lot.remaining_cgst_amount+restored_cgst>lot.eligible_cgst_amount
       OR lot.remaining_sgst_amount+restored_sgst>lot.eligible_sgst_amount
       OR lot.remaining_igst_amount+restored_igst>lot.eligible_igst_amount
       OR lot.remaining_cess_amount+restored_cess>lot.eligible_cess_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return would over-restore its exact input-credit source lot';
    END IF;
    INSERT INTO tax.input_credit_applications(
      org_id,input_credit_lot_id,stock_ledger_entry_id,reverses_application_id,
      application_kind,application_direction,applied_base_quantity,applied_cgst_amount,
      applied_sgst_amount,applied_igst_amount,applied_cess_amount,source_lot_row_version,
      status,posted_at,created_by_membership_id)
    VALUES(organization_id,lot.id,stock_ledger_entry_id,consumed.id,
      'sales_return_restoration','restore',applied_quantity,restored_cgst,restored_sgst,
      restored_igst,restored_cess,lot.row_version,'posted',transaction_timestamp(),actor_id);
    UPDATE tax.input_credit_lots SET remaining_base_quantity=remaining_base_quantity+applied_quantity,
      remaining_cgst_amount=remaining_cgst_amount+restored_cgst,
      remaining_sgst_amount=remaining_sgst_amount+restored_sgst,
      remaining_igst_amount=remaining_igst_amount+restored_igst,
      remaining_cess_amount=remaining_cess_amount+restored_cess,
      updated_at=transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=lot.id AND row_version=lot.row_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='input-credit lot changed during deterministic restoration';
    END IF;
    remaining_quantity:=remaining_quantity-applied_quantity;
    restored_total:=restored_total+applied_quantity;
  END LOOP;
  RETURN restored_total;
END
$function$;
ALTER FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(uuid,uuid,numeric,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(uuid,uuid,numeric,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

RESET ROLE;
