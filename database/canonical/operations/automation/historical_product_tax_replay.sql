-- Repair only immutable-bound, review-required products imported before scoped
-- tax snapshots existed. Do not recreate products, batches or opening entries.
  FOR product_fact IN
    SELECT fact.* FROM automation.historical_migration_facts fact
    JOIN automation.historical_product_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
      AND binding.dataset_id=fact.dataset_id
    JOIN catalog.products product
      ON product.org_id=binding.org_id AND product.id=binding.product_id
    WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
      AND fact.source_kind='product' AND fact.selection_state='reviewed'
      AND product.status='active' AND product.setup_review_required
      AND NOT EXISTS (SELECT 1 FROM tax.tax_code_versions version
        WHERE version.org_id=organization_id AND version.product_id=product.id)
    ORDER BY fact.id LIMIT batch_size
  LOOP
    SELECT binding.product_id INTO STRICT product_identifier
      FROM automation.historical_product_bindings binding
      JOIN catalog.products product ON product.org_id=binding.org_id
        AND product.id=binding.product_id
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
        AND binding.source_fact_id=product_fact.id
        AND binding.hsn_code=product_fact.payload->>'hsn_code'
        AND binding.gst_rate=(product_fact.payload->>'gst_rate')::numeric
        AND product.hsn_code=binding.hsn_code
        AND product.status='active' AND product.setup_review_required
      FOR SHARE OF product;
    PERFORM erp_automation_commands.install_source_product_tax(
      organization_id,reviewed_dataset_id,product_fact.id,product_identifier);
    replayed:=replayed+1;
  END LOOP;
