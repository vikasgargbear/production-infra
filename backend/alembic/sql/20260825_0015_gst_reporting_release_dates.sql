SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_dates_ck;

ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_dates_ck CHECK (
    (dataset_kind = 'gst_reporting_rules' OR publication_date <= effective_from)
    AND (effective_to IS NULL OR effective_to >= effective_from)
    AND reviewed_at <= created_at
  );

RESET ROLE;
