SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_authority_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_authority_ck CHECK (
    (dataset_kind='ingredient_classification' AND source_authority='cdsco') OR
    (dataset_kind='hsn_sac_tax' AND source_authority IN ('gst_portal','gst_council','cbic','gstn')) OR
    (dataset_kind='withholding_rules' AND source_authority IN ('income_tax_department','cbic')) OR
    (dataset_kind='controlled_movement_rules' AND source_authority IN ('cdsco','revenue_department')) OR
    (dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules')
      AND source_authority IN ('gst_portal','gst_council','cbic','gstn'))
  );

ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_kind_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_kind_ck CHECK (
    dataset_kind IN (
      'ingredient_classification','hsn_sac_tax','withholding_rules',
      'controlled_movement_rules','einvoice_rules','gst_adjustment_rules',
      'gst_reporting_rules'
    )
  );

CREATE TABLE tax.gstr1_reporting_rule_versions (
  id uuid NOT NULL,
  release_id uuid NOT NULL,
  rule_code varchar(64) NOT NULL,
  rule_version varchar(32) NOT NULL,
  b2cl_threshold_amount numeric(20,2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT gstr1_reporting_rule_versions_pkey PRIMARY KEY (id),
  CONSTRAINT gstr1_reporting_rule_versions_release_fk
    FOREIGN KEY (release_id) REFERENCES core.reference_data_releases(id) ON DELETE RESTRICT,
  CONSTRAINT gstr1_reporting_rule_versions_identity_uq
    UNIQUE (release_id, rule_code, rule_version),
  CONSTRAINT gstr1_reporting_rule_versions_effective_uq
    UNIQUE (effective_from, rule_code),
  CONSTRAINT gstr1_reporting_rule_versions_no_overlap_excl
    EXCLUDE USING gist (
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (status='active'),
  CONSTRAINT gstr1_reporting_rule_versions_dates_ck
    CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT gstr1_reporting_rule_versions_threshold_ck
    CHECK (b2cl_threshold_amount>0),
  CONSTRAINT gstr1_reporting_rule_versions_status_ck
    CHECK (status IN ('active','retired')),
  CONSTRAINT gstr1_reporting_rule_versions_text_ck
    CHECK (btrim(rule_code)<>'' AND btrim(rule_version)<>'')
);

CREATE INDEX gstr1_reporting_rule_versions_effective_idx
  ON tax.gstr1_reporting_rule_versions(effective_from, effective_to, id)
  WHERE status='active';

GRANT SELECT ON TABLE tax.gstr1_reporting_rule_versions TO erp_app;

COMMENT ON TABLE tax.gstr1_reporting_rule_versions IS
  'Reviewed, source-attested, date-effective GSTR-1 classification rules. No application default is permitted.';
