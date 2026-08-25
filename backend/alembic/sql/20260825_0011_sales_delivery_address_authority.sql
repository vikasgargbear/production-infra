-- Hash-bound incremental migration: explicit sales delivery-address authority.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    old_order_declarations constant text := $old$    customer_account_id uuid := NULLIF(request_document->>'customer_account_id','')::uuid;
    customer_party_id uuid;$old$;
    new_order_declarations constant text := $new$    customer_account_id uuid := NULLIF(request_document->>'customer_account_id','')::uuid;
    delivery_address_id uuid := NULLIF(request_document->>'delivery_address_id','')::uuid;
    delivery_address_row_version bigint := NULLIF(request_document->>'delivery_address_row_version','')::bigint;
    customer_party_id uuid;$new$;
    old_order_guard constant text := $old$       OR branch_id IS NULL OR customer_account_id IS NULL OR order_date IS NULL
       OR zero_rated_payment_mode NOT IN ('not_applicable','without_payment','with_igst')$old$;
    new_order_guard constant text := $new$       OR branch_id IS NULL OR customer_account_id IS NULL OR order_date IS NULL
       OR delivery_address_id IS NULL OR delivery_address_row_version IS NULL
       OR delivery_address_row_version<1 OR request_document?'place_of_supply_state_code'
       OR request_document?'shipping_address_id'
       OR zero_rated_payment_mode NOT IN ('not_applicable','without_payment','with_igst')$new$;
    old_order_shipping constant text := $old$    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=customer_party_id
       AND address_kind='shipping' AND is_primary AND status='active'
       AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date);
    IF address_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer has ambiguous effective primary shipping addresses';
    ELSIF address_count=1 THEN
        SELECT * INTO STRICT shipping_address FROM parties.addresses
         WHERE org_id=organization_id AND party_id=customer_party_id
           AND address_kind='shipping' AND is_primary AND status='active'
           AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date) FOR SHARE;
    ELSE
        shipping_address:=billing_address;
    END IF;$old$;
    new_order_shipping constant text := $new$    SELECT * INTO STRICT shipping_address FROM parties.addresses
     WHERE org_id=organization_id AND id=delivery_address_id
       AND party_id=customer_party_id
       AND address_kind IN ('registered','billing','shipping') AND status='active'
       AND row_version=delivery_address_row_version
       AND valid_from<=order_date AND (valid_until IS NULL OR valid_until>=order_date)
     FOR SHARE;
    IF shipping_address.country_code<>'IN' OR shipping_address.state_code!~'^[0-9]{2}$'
       OR shipping_address.postal_code!~'^[0-9]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='selected delivery address lacks exact supported India address facts';
    END IF;$new$;
    old_invoice_declarations constant text := $old$    customer_account_id uuid:=NULLIF(request_document->>'customer_account_id','')::uuid;
    from_location_id uuid:=NULLIF(request_document->>'from_location_id','')::uuid;
    invoice_date date:=NULLIF(request_document->>'invoice_date','')::date;
    place_of_supply text:=request_document->>'place_of_supply_state_code';$old$;
    new_invoice_declarations constant text := $new$    customer_account_id uuid:=NULLIF(request_document->>'customer_account_id','')::uuid;
    delivery_address_id uuid:=NULLIF(request_document->>'delivery_address_id','')::uuid;
    delivery_address_row_version bigint:=NULLIF(request_document->>'delivery_address_row_version','')::bigint;
    from_location_id uuid:=NULLIF(request_document->>'from_location_id','')::uuid;
    invoice_date date:=NULLIF(request_document->>'invoice_date','')::date;
    place_of_supply text;$new$;
    old_invoice_guard constant text := $old$       OR branch_id IS NULL OR customer_account_id IS NULL OR invoice_date IS NULL
       OR place_of_supply!~'^[0-9]{2}$'
       OR request_document->>'tax_charge_mechanism'<>'normal'$old$;
    new_invoice_guard constant text := $new$       OR branch_id IS NULL OR customer_account_id IS NULL OR invoice_date IS NULL
       OR delivery_address_id IS NULL OR delivery_address_row_version IS NULL
       OR delivery_address_row_version<1 OR request_document?'place_of_supply_state_code'
       OR request_document?'shipping_address_id'
       OR request_document->>'tax_charge_mechanism'<>'normal'$new$;
    old_invoice_shipping constant text := $old$    SELECT count(*) INTO address_count FROM parties.addresses
     WHERE org_id=organization_id AND party_id=customer.party_id AND address_kind='shipping'
       AND is_primary AND status='active' AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date);
    IF address_count>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='customer shipping address is ambiguous';
    ELSIF address_count=1 THEN
      SELECT * INTO STRICT shipping FROM parties.addresses WHERE org_id=organization_id AND party_id=customer.party_id
       AND address_kind='shipping' AND is_primary AND status='active' AND valid_from<=invoice_date
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    ELSE shipping:=billing; END IF;
    IF billing.country_code<>'IN' OR shipping.country_code<>'IN' THEN$old$;
    new_invoice_shipping constant text := $new$    SELECT * INTO STRICT shipping FROM parties.addresses
     WHERE org_id=organization_id AND id=delivery_address_id
       AND party_id=customer.party_id
       AND address_kind IN ('registered','billing','shipping') AND status='active'
       AND row_version=delivery_address_row_version
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date)
     FOR SHARE;
    place_of_supply:=shipping.state_code;
    IF billing.country_code<>'IN' OR shipping.country_code<>'IN' THEN$new$;
    old_invoice_dispatch constant text := $old$           AND id=dispatch_line.dispatch_id AND status='posted' AND branch_id=branch_id
           AND customer_account_id=customer.id FOR SHARE;$old$;
    new_invoice_dispatch constant text := $new$           AND id=dispatch_line.dispatch_id AND status='posted' AND branch_id=branch_id
           AND customer_account_id=customer.id AND shipping_address_id=shipping.id FOR SHARE;$new$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
      'erp_automation_commands.resolve_sales_order_prepare(uuid,uuid,uuid,uuid,uuid,character varying,jsonb)'::regprocedure
    ) INTO STRICT definition;
    IF pg_catalog.strpos(definition,'delivery_address_row_version bigint')=0 THEN
      IF pg_catalog.strpos(definition,old_order_declarations)=0
         OR pg_catalog.strpos(definition,old_order_guard)=0
         OR pg_catalog.strpos(definition,old_order_shipping)=0 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='sales-order address resolver differs from reviewed migration precondition';
      END IF;
      definition:=pg_catalog.replace(definition,old_order_declarations,new_order_declarations);
      definition:=pg_catalog.replace(definition,old_order_guard,new_order_guard);
      definition:=pg_catalog.replace(definition,old_order_shipping,new_order_shipping);
      EXECUTE definition;
    END IF;

    SELECT pg_catalog.pg_get_functiondef(
      'erp_automation_commands.resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure
    ) INTO STRICT definition;
    IF pg_catalog.strpos(definition,'delivery_address_row_version bigint')=0 THEN
      IF pg_catalog.strpos(definition,old_invoice_declarations)=0
         OR pg_catalog.strpos(definition,old_invoice_guard)=0
         OR pg_catalog.strpos(definition,old_invoice_shipping)=0
         OR pg_catalog.strpos(definition,old_invoice_dispatch)=0 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='sales-invoice address resolver differs from reviewed migration precondition';
      END IF;
      definition:=pg_catalog.replace(definition,old_invoice_declarations,new_invoice_declarations);
      definition:=pg_catalog.replace(definition,old_invoice_guard,new_invoice_guard);
      definition:=pg_catalog.replace(definition,old_invoice_shipping,new_invoice_shipping);
      definition:=pg_catalog.replace(definition,old_invoice_dispatch,new_invoice_dispatch);
      EXECUTE definition;
    END IF;
END
$migration$;

RESET ROLE;
