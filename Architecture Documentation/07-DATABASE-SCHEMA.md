# Database Schema Documentation

> **Auto-generated from live database** - Single source of truth for all table and column names.

## Schemas

- [analytics](#analytics)
- [compliance](#compliance)
- [financial](#financial)
- [gst](#gst)
- [inventory](#inventory)
- [master](#master)
- [parties](#parties)
- [procurement](#procurement)
- [sales](#sales)
- [system_config](#system_config)

---

## analytics

Tables: 13

### analytics.alert_definitions

| Column | Type | Nullable |
|--------|------|----------|
| alert_id | integer | ✗ |
| org_id | uuid | ✗ |
| alert_code | text | ✗ |
| alert_name | text | ✗ |
| alert_category | text | ✗ |
| trigger_type | text | ✗ |
| check_query | text | ✗ |
| check_frequency_minutes | integer | ✓ |
| conditions | jsonb | ✗ |
| severity | text | ✗ |
| notification_channels | ARRAY | ✓ |
| recipients | jsonb | ✓ |
| message_template | text | ✓ |
| cooldown_minutes | integer | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### analytics.alert_history

| Column | Type | Nullable |
|--------|------|----------|
| history_id | integer | ✗ |
| alert_id | integer | ✗ |
| triggered_at | timestamp with time zone | ✓ |
| trigger_value | text | ✓ |
| trigger_details | jsonb | ✓ |
| severity | text | ✗ |
| message | text | ✗ |
| notifications_sent | jsonb | ✓ |
| acknowledged | boolean | ✓ |
| acknowledged_by | integer | ✓ |
| acknowledged_at | timestamp with time zone | ✓ |
| acknowledgment_notes | text | ✓ |
| resolved | boolean | ✓ |
| resolved_by | integer | ✓ |
| resolved_at | timestamp with time zone | ✓ |
| resolution_notes | text | ✓ |
| alert_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### analytics.dashboard_cache

| Column | Type | Nullable |
|--------|------|----------|
| cache_id | integer | ✗ |
| org_id | uuid | ✓ |
| metric_type | character varying | ✓ |
| metric_name | character varying | ✓ |
| metric_value | numeric | ✓ |
| metric_date | date | ✓ |
| last_updated | timestamp without time zone | ✓ |
| created_at | timestamp without time zone | ✓ |

### analytics.dashboard_widgets

| Column | Type | Nullable |
|--------|------|----------|
| widget_id | integer | ✗ |
| dashboard_id | integer | ✗ |
| widget_type | text | ✗ |
| widget_title | text | ✗ |
| data_query | text | ✗ |
| refresh_interval_seconds | integer | ✓ |
| chart_type | text | ✓ |
| chart_config | jsonb | ✓ |
| position_x | integer | ✗ |
| position_y | integer | ✗ |
| width | integer | ✗ |
| height | integer | ✗ |
| is_interactive | boolean | ✓ |
| drill_down_enabled | boolean | ✓ |
| drill_down_dashboard_id | integer | ✓ |
| thresholds | jsonb | ✓ |
| display_order | integer | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### analytics.dashboards

| Column | Type | Nullable |
|--------|------|----------|
| dashboard_id | integer | ✗ |
| org_id | uuid | ✗ |
| dashboard_code | text | ✗ |
| dashboard_name | text | ✗ |
| dashboard_category | text | ✗ |
| description | text | ✓ |
| layout_type | text | ✓ |
| layout_config | jsonb | ✓ |
| auto_refresh | boolean | ✓ |
| refresh_interval_seconds | integer | ✓ |
| is_public | boolean | ✓ |
| allowed_roles | ARRAY | ✓ |
| default_filters | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### analytics.data_quality_metrics

| Column | Type | Nullable |
|--------|------|----------|
| metric_id | integer | ✗ |
| org_id | uuid | ✗ |
| check_date | date | ✗ |
| table_schema | text | ✗ |
| table_name | text | ✗ |
| total_records | integer | ✗ |
| null_count | integer | ✓ |
| duplicate_count | integer | ✓ |
| field_checks | jsonb | ✓ |
| completeness_score | numeric | ✓ |
| validity_score | numeric | ✓ |
| consistency_score | numeric | ✓ |
| overall_quality_score | numeric | ✓ |
| critical_issues | integer | ✓ |
| major_issues | integer | ✓ |
| minor_issues | integer | ✓ |
| check_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| checked_by | integer | ✓ |

### analytics.kpi_definitions

| Column | Type | Nullable |
|--------|------|----------|
| kpi_id | integer | ✗ |
| org_id | uuid | ✗ |
| kpi_code | text | ✗ |
| kpi_name | text | ✗ |
| kpi_category | text | ✗ |
| calculation_query | text | ✗ |
| aggregation_type | text | ✗ |
| unit_of_measure | text | ✓ |
| display_format | text | ✓ |
| decimal_places | integer | ✓ |
| target_type | text | ✓ |
| target_value | numeric | ✓ |
| target_query | text | ✓ |
| calculation_frequency | text | ✗ |
| track_trend | boolean | ✓ |
| trend_period_days | integer | ✓ |
| alert_enabled | boolean | ✓ |
| alert_threshold_type | text | ✓ |
| alert_threshold_value | numeric | ✓ |
| alert_recipients | ARRAY | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### analytics.kpi_values

| Column | Type | Nullable |
|--------|------|----------|
| value_id | integer | ✗ |
| kpi_id | integer | ✗ |
| calculation_date | date | ✗ |
| period_type | text | ✗ |
| actual_value | numeric | ✗ |
| target_value | numeric | ✓ |
| previous_value | numeric | ✓ |
| variance_amount | numeric | ✓ |
| variance_percentage | numeric | ✓ |
| achievement_percentage | numeric | ✓ |
| trend_direction | text | ✓ |
| trend_percentage | numeric | ✓ |
| status | text | ✓ |
| calculation_time | timestamp with time zone | ✓ |
| calculation_duration_ms | integer | ✓ |
| data_quality_score | numeric | ✓ |
| created_at | timestamp with time zone | ✓ |

### analytics.product_consumption_stats

| Column | Type | Nullable |
|--------|------|----------|
| stat_id | integer | ✗ |
| org_id | integer | ✗ |
| product_id | integer | ✓ |
| branch_id | integer | ✓ |
| calculation_date | date | ✗ |
| daily_consumption | numeric | ✓ |
| weekly_consumption | numeric | ✓ |
| monthly_consumption | numeric | ✓ |
| trend_direction | text | ✓ |
| created_at | timestamp without time zone | ✓ |

### analytics.report_execution_history

| Column | Type | Nullable |
|--------|------|----------|
| execution_id | integer | ✗ |
| org_id | uuid | ✗ |
| template_id | integer | ✗ |
| schedule_id | integer | ✓ |
| execution_date | timestamp with time zone | ✓ |
| executed_by | integer | ✓ |
| execution_type | text | ✗ |
| parameters_used | jsonb | ✓ |
| start_time | timestamp with time zone | ✓ |
| end_time | timestamp with time zone | ✓ |
| execution_time_ms | integer | ✓ |
| rows_processed | integer | ✓ |
| output_format | text | ✓ |
| file_size_bytes | integer | ✓ |
| file_path | text | ✓ |
| execution_status | text | ✓ |
| error_message | text | ✓ |
| emailed_to | ARRAY | ✓ |
| email_sent_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |

### analytics.report_schedules

| Column | Type | Nullable |
|--------|------|----------|
| schedule_id | integer | ✗ |
| org_id | uuid | ✗ |
| template_id | integer | ✗ |
| schedule_name | text | ✗ |
| frequency | text | ✗ |
| run_time | time without time zone | ✓ |
| run_day_of_week | integer | ✓ |
| run_day_of_month | integer | ✓ |
| report_parameters | jsonb | ✓ |
| email_recipients | ARRAY | ✓ |
| cc_recipients | ARRAY | ✓ |
| output_format | text | ✗ |
| next_run_date | timestamp with time zone | ✓ |
| last_run_date | timestamp with time zone | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### analytics.report_templates

| Column | Type | Nullable |
|--------|------|----------|
| template_id | integer | ✗ |
| org_id | uuid | ✗ |
| template_code | text | ✗ |
| template_name | text | ✗ |
| report_category | text | ✗ |
| report_type | text | ✗ |
| query_template | text | ✗ |
| parameters | jsonb | ✓ |
| output_formats | ARRAY | ✓ |
| default_format | text | ✓ |
| layout_config | jsonb | ✓ |
| schedulable | boolean | ✓ |
| required_roles | ARRAY | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### analytics.user_activity_analytics

| Column | Type | Nullable |
|--------|------|----------|
| analytics_id | integer | ✗ |
| org_id | uuid | ✗ |
| user_id | integer | ✗ |
| activity_date | date | ✗ |
| login_count | integer | ✓ |
| first_login_time | time without time zone | ✓ |
| last_login_time | time without time zone | ✓ |
| total_session_duration_minutes | integer | ✓ |
| features_used | ARRAY | ✓ |
| most_used_feature | text | ✓ |
| transactions_created | integer | ✓ |
| transactions_value | numeric | ✓ |
| module_activity | jsonb | ✓ |
| average_page_load_time_ms | integer | ✓ |
| slow_queries_count | integer | ✓ |
| errors_encountered | integer | ✓ |
| devices_used | jsonb | ✓ |
| locations | jsonb | ✓ |
| created_at | timestamp with time zone | ✓ |

---

## compliance

Tables: 28

### compliance.compliance_alerts

| Column | Type | Nullable |
|--------|------|----------|
| alert_id | integer | ✗ |
| org_id | uuid | ✗ |
| alert_type | text | ✗ |
| alert_date | date | ✗ |
| reference_type | text | ✗ |
| reference_id | integer | ✗ |
| alert_message | text | ✗ |
| priority | text | ✓ |
| is_active | boolean | ✓ |
| is_resolved | boolean | ✓ |
| resolved_date | date | ✓ |
| resolved_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.compliance_audits

| Column | Type | Nullable |
|--------|------|----------|
| audit_id | integer | ✗ |
| org_id | uuid | ✗ |
| audit_type | text | ✗ |
| audit_date | date | ✗ |
| auditor_name | text | ✗ |
| auditor_organization | text | ✓ |
| areas_audited | jsonb | ✗ |
| audit_findings | jsonb | ✓ |
| overall_status | text | ✗ |
| next_audit_date | date | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.compliance_documents

| Column | Type | Nullable |
|--------|------|----------|
| document_id | integer | ✗ |
| org_id | uuid | ✗ |
| document_type | text | ✗ |
| document_name | text | ✗ |
| file_data | text | ✓ |
| file_url | text | ✓ |
| expiry_date | date | ✓ |
| reminder_days | integer | ✓ |
| tags | jsonb | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.compliance_violations

| Column | Type | Nullable |
|--------|------|----------|
| violation_id | integer | ✗ |
| org_id | uuid | ✗ |
| violation_date | date | ✗ |
| violation_type | text | ✗ |
| violation_category | text | ✗ |
| severity | text | ✗ |
| violation_description | text | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| notice_received | boolean | ✓ |
| notice_date | date | ✓ |
| notice_number | text | ✓ |
| response_required | boolean | ✓ |
| response_due_date | date | ✓ |
| response_submitted | boolean | ✓ |
| response_date | date | ✓ |
| penalty_imposed | boolean | ✓ |
| penalty_type | text | ✓ |
| penalty_amount | numeric | ✓ |
| penalty_duration_days | integer | ✓ |
| corrective_action_plan | text | ✓ |
| cap_submitted_date | date | ✓ |
| cap_approved | boolean | ✓ |
| violation_status | text | ✓ |
| resolved_date | date | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.corrective_action_plans

| Column | Type | Nullable |
|--------|------|----------|
| cap_id | integer | ✗ |
| inspection_id | integer | ✗ |
| cap_number | text | ✗ |
| submission_date | date | ✗ |
| total_observations | integer | ✗ |
| critical_observations | integer | ✓ |
| major_observations | integer | ✓ |
| minor_observations | integer | ✓ |
| action_items | jsonb | ✓ |
| cap_status | text | ✓ |
| completion_percentage | numeric | ✓ |
| approved_by | text | ✓ |
| approved_date | date | ✓ |
| verified_by | text | ✓ |
| verified_date | date | ✓ |
| verification_notes | text | ✓ |
| due_date | date | ✗ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.corrective_actions

| Column | Type | Nullable |
|--------|------|----------|
| action_id | integer | ✗ |
| org_id | uuid | ✗ |
| audit_id | integer | ✓ |
| visit_id | integer | ✓ |
| area | text | ✗ |
| issue_description | text | ✗ |
| corrective_action | text | ✗ |
| priority | text | ✗ |
| due_date | date | ✗ |
| status | text | ✗ |
| completed_date | date | ✓ |
| completed_by | integer | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.destruction_approvals

| Column | Type | Nullable |
|--------|------|----------|
| approval_id | integer | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| approval_authority | text | ✓ |
| approval_number | text | ✓ |
| approval_date | date | ✓ |
| approval_status | text | ✓ |
| created_at | timestamp without time zone | ✓ |

### compliance.drug_licenses

| Column | Type | Nullable |
|--------|------|----------|
| license_id | integer | ✗ |
| org_id | uuid | ✗ |
| license_type | text | ✗ |
| license_number | text | ✗ |
| license_category | jsonb | ✓ |
| issuing_authority | text | ✗ |
| issue_date | date | ✗ |
| expiry_date | date | ✗ |
| premises_address | text | ✗ |
| pharmacist_name | text | ✗ |
| pharmacist_registration | text | ✗ |
| pharmacist_qualification | text | ✓ |
| storage_capacity | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.environmental_breaches

| Column | Type | Nullable |
|--------|------|----------|
| breach_id | integer | ✗ |
| env_compliance_id | integer | ✗ |
| breach_date | date | ✗ |
| parameter_name | text | ✗ |
| measured_value | numeric | ✗ |
| prescribed_limit | numeric | ✗ |
| deviation_percentage | numeric | ✗ |
| breach_level | text | ✗ |
| authority_notified | boolean | ✓ |
| notification_date | date | ✓ |
| notification_reference | text | ✓ |
| penalty_imposed | boolean | ✓ |
| penalty_amount | numeric | ✓ |
| penalty_paid | boolean | ✓ |
| penalty_payment_date | date | ✓ |
| corrective_measures | text | ✓ |
| implementation_timeline | text | ✓ |
| measures_completed | boolean | ✓ |
| completion_verified_date | date | ✓ |
| breach_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| reported_by | integer | ✗ |

### compliance.environmental_compliance

| Column | Type | Nullable |
|--------|------|----------|
| env_compliance_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✓ |
| monitoring_date | date | ✗ |
| compliance_type | text | ✗ |
| parameter_name | text | ✗ |
| parameter_unit | text | ✗ |
| measured_value | numeric | ✗ |
| prescribed_limit | numeric | ✗ |
| within_limits | boolean | ✓ |
| deviation_percentage | numeric | ✓ |
| sampling_point | text | ✓ |
| testing_method | text | ✓ |
| tested_by | text | ✓ |
| external_lab | boolean | ✓ |
| lab_name | text | ✓ |
| compliance_status | text | ✓ |
| corrective_action_required | boolean | ✓ |
| corrective_action_taken | text | ✓ |
| action_completion_date | date | ✓ |
| reported_to_authority | boolean | ✓ |
| report_date | date | ✓ |
| report_reference | text | ✓ |
| test_report_path | text | ✓ |
| status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.expired_destructions

| Column | Type | Nullable |
|--------|------|----------|
| destruction_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_id | integer | ✓ |
| batch_number | text | ✗ |
| quantity_destroyed | numeric | ✗ |
| expiry_date | date | ✗ |
| destruction_date | date | ✗ |
| destruction_method | text | ✗ |
| witness_names | ARRAY | ✗ |
| destruction_certificate | text | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.inspection_schedule

| Column | Type | Nullable |
|--------|------|----------|
| schedule_id | integer | ✗ |
| org_id | integer | ✗ |
| inspection_type | text | ✓ |
| regulatory_body | text | ✓ |
| scheduled_date | date | ✓ |
| notification_sent | boolean | ✓ |
| created_at | timestamp without time zone | ✓ |

### compliance.inspector_visits

| Column | Type | Nullable |
|--------|------|----------|
| visit_id | integer | ✗ |
| org_id | uuid | ✗ |
| visit_date | date | ✗ |
| inspector_name | text | ✗ |
| inspector_id | text | ✓ |
| inspector_designation | text | ✓ |
| visit_type | text | ✗ |
| areas_inspected | jsonb | ✓ |
| violations_found | jsonb | ✓ |
| recommendations | jsonb | ✓ |
| follow_up_required | boolean | ✓ |
| next_visit_date | date | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.license_renewal_history

| Column | Type | Nullable |
|--------|------|----------|
| renewal_id | integer | ✗ |
| license_id | integer | ✗ |
| renewal_date | date | ✗ |
| old_expiry_date | date | ✗ |
| new_expiry_date | date | ✗ |
| application_number | text | ✓ |
| application_date | date | ✓ |
| renewal_fee_paid | numeric | ✓ |
| late_fee_paid | numeric | ✓ |
| payment_reference | text | ✓ |
| processed_by | text | ✓ |
| processing_time_days | integer | ✓ |
| renewal_documents | jsonb | ✓ |
| renewal_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.license_types

| Column | Type | Nullable |
|--------|------|----------|
| license_type_id | integer | ✗ |
| license_code | text | ✗ |
| license_name | text | ✗ |
| license_category | text | ✗ |
| issuing_authority | text | ✗ |
| authority_level | text | ✗ |
| validity_years | integer | ✓ |
| renewal_before_expiry_days | integer | ✓ |
| eligibility_criteria | jsonb | ✓ |
| required_documents | jsonb | ✓ |
| application_fee | numeric | ✓ |
| renewal_fee | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.narcotic_discrepancies

| Column | Type | Nullable |
|--------|------|----------|
| discrepancy_id | integer | ✗ |
| register_id | integer | ✗ |
| identified_date | date | ✗ |
| expected_balance | numeric | ✗ |
| actual_balance | numeric | ✗ |
| discrepancy_quantity | numeric | ✗ |
| discrepancy_type | text | ✗ |
| investigation_status | text | ✓ |
| investigation_findings | text | ✓ |
| root_cause | text | ✓ |
| reported_to_authority | boolean | ✓ |
| authority_report_date | date | ✓ |
| authority_report_number | text | ✓ |
| resolution_status | text | ✓ |
| resolution_date | date | ✓ |
| resolution_notes | text | ✓ |
| reported_date | date | ✗ |
| reported_by | integer | ✗ |
| created_at | timestamp with time zone | ✓ |

### compliance.narcotic_register

| Column | Type | Nullable |
|--------|------|----------|
| register_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| transaction_date | date | ✗ |
| transaction_type | text | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| receipt_quantity | numeric | ✓ |
| issue_quantity | numeric | ✓ |
| balance_quantity | numeric | ✗ |
| party_type | text | ✓ |
| party_name | text | ✓ |
| party_license_number | text | ✓ |
| prescription_number | text | ✓ |
| prescriber_name | text | ✓ |
| prescriber_registration | text | ✓ |
| patient_name | text | ✓ |
| patient_id_proof | text | ✓ |
| permit_number | text | ✓ |
| permit_date | date | ✓ |
| verified_by | integer | ✗ |
| witness_by | integer | ✓ |
| reference_type | text | ✓ |
| reference_number | text | ✓ |
| remarks | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.org_compliance_status

| Column | Type | Nullable |
|--------|------|----------|
| status_id | integer | ✗ |
| org_id | uuid | ✗ |
| overall_compliance_score | numeric | ✓ |
| compliance_grade | text | ✓ |
| risk_level | text | ✓ |
| total_licenses | integer | ✓ |
| active_licenses | integer | ✓ |
| expired_licenses | integer | ✓ |
| expiring_soon | integer | ✓ |
| last_inspection_date | date | ✓ |
| inspections_this_year | integer | ✓ |
| critical_observations_pending | integer | ✓ |
| qc_tests_this_month | integer | ✓ |
| qc_failure_rate | numeric | ✓ |
| open_deviations | integer | ✓ |
| environmental_breaches_ytd | integer | ✓ |
| pending_corrective_actions | integer | ✓ |
| open_violations | integer | ✓ |
| violations_this_year | integer | ✓ |
| last_calculated_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.org_licenses

| Column | Type | Nullable |
|--------|------|----------|
| license_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✓ |
| license_type_id | integer | ✗ |
| license_number | text | ✗ |
| license_name | text | ✗ |
| issue_date | date | ✗ |
| valid_from | date | ✗ |
| valid_until | date | ✗ |
| license_status | text | ✓ |
| expiry_status | text | ✓ |
| renewal_status | text | ✓ |
| renewal_application_date | date | ✓ |
| renewal_application_number | text | ✓ |
| next_renewal_date | date | ✓ |
| license_document_path | text | ✓ |
| supporting_documents | jsonb | ✓ |
| last_inspection_date | date | ✓ |
| next_inspection_due | date | ✓ |
| compliance_score | numeric | ✓ |
| suspended | boolean | ✓ |
| suspension_date | date | ✓ |
| suspension_reason | text | ✓ |
| suspension_lifted_date | date | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.pharmacist_registrations

| Column | Type | Nullable |
|--------|------|----------|
| registration_id | integer | ✗ |
| org_id | uuid | ✗ |
| pharmacist_name | text | ✗ |
| registration_number | text | ✗ |
| qualification | text | ✗ |
| registration_state | text | ✗ |
| registration_date | date | ✗ |
| expiry_date | date | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.product_recalls

| Column | Type | Nullable |
|--------|------|----------|
| recall_id | integer | ✗ |
| org_id | uuid | ✗ |
| recall_number | text | ✗ |
| recall_date | date | ✗ |
| recall_type | text | ✗ |
| recall_classification | text | ✗ |
| product_id | integer | ✗ |
| affected_batches | ARRAY | ✓ |
| batch_numbers | ARRAY | ✓ |
| reason_category | text | ✗ |
| reason_description | text | ✗ |
| health_hazard_assessment | text | ✓ |
| distribution_pattern | text | ✗ |
| states_affected | ARRAY | ✓ |
| countries_affected | ARRAY | ✓ |
| quantity_distributed | numeric | ✓ |
| quantity_recovered | numeric | ✓ |
| customers_notified | integer | ✓ |
| notification_method | ARRAY | ✓ |
| notification_date | date | ✓ |
| fda_notified | boolean | ✓ |
| fda_notification_date | date | ✓ |
| regulatory_references | ARRAY | ✓ |
| recall_status | text | ✓ |
| effectiveness_checks_required | integer | ✓ |
| effectiveness_checks_completed | integer | ✓ |
| estimated_cost | numeric | ✓ |
| actual_cost | numeric | ✓ |
| insurance_claim_filed | boolean | ✓ |
| completion_date | date | ✓ |
| final_report_submitted | boolean | ✓ |
| lessons_learned | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.quality_control_tests

| Column | Type | Nullable |
|--------|------|----------|
| qc_test_id | integer | ✗ |
| org_id | uuid | ✗ |
| test_number | text | ✗ |
| test_date | date | ✗ |
| test_type | text | ✗ |
| reference_type | text | ✗ |
| reference_id | integer | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| sample_quantity | numeric | ✓ |
| sample_unit | text | ✓ |
| sampling_method | text | ✓ |
| sampled_by | integer | ✓ |
| test_parameters | jsonb | ✓ |
| test_status | text | ✓ |
| tested_by | text | ✓ |
| testing_lab | text | ✓ |
| external_lab_name | text | ✓ |
| completed_date | date | ✓ |
| test_report_number | text | ✓ |
| test_report_path | text | ✓ |
| is_retest | boolean | ✓ |
| original_test_id | integer | ✓ |
| retest_reason | text | ✓ |
| approved_by | integer | ✓ |
| approved_date | date | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.quality_deviations

| Column | Type | Nullable |
|--------|------|----------|
| deviation_id | integer | ✗ |
| org_id | uuid | ✗ |
| deviation_number | text | ✗ |
| deviation_date | date | ✗ |
| deviation_type | text | ✗ |
| deviation_category | text | ✗ |
| severity | text | ✗ |
| deviation_description | text | ✗ |
| root_cause | text | ✓ |
| impact_assessment | text | ✓ |
| batches_affected | ARRAY | ✓ |
| products_affected | ARRAY | ✓ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| investigation_required | boolean | ✓ |
| investigation_status | text | ✓ |
| investigation_completed_date | date | ✓ |
| investigation_findings | text | ✓ |
| capa_required | boolean | ✓ |
| capa_number | text | ✓ |
| capa_status | text | ✓ |
| reported_by | integer | ✗ |
| qa_reviewed_by | integer | ✓ |
| qa_reviewed_date | date | ✓ |
| deviation_status | text | ✓ |
| closed_date | date | ✓ |
| closed_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### compliance.regulatory_authorities

| Column | Type | Nullable |
|--------|------|----------|
| authority_id | integer | ✗ |
| authority_code | text | ✗ |
| authority_name | text | ✗ |
| authority_type | text | ✗ |
| jurisdiction_level | text | ✗ |
| state | text | ✓ |
| district | text | ✓ |
| contact_info | jsonb | ✓ |
| routine_inspection_frequency_days | integer | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.regulatory_inspections

| Column | Type | Nullable |
|--------|------|----------|
| inspection_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✓ |
| inspection_date | date | ✗ |
| inspection_type | text | ✗ |
| authority_id | integer | ✗ |
| license_id | integer | ✓ |
| inspectors | jsonb | ✓ |
| inspection_scope | text | ✗ |
| areas_inspected | ARRAY | ✓ |
| total_observations | integer | ✓ |
| critical_observations | integer | ✓ |
| major_observations | integer | ✓ |
| minor_observations | integer | ✓ |
| inspection_findings | jsonb | ✓ |
| overall_result | text | ✓ |
| follow_up_required | boolean | ✓ |
| follow_up_date | date | ✓ |
| follow_up_completed | boolean | ✓ |
| inspection_report_date | date | ✓ |
| inspection_report_path | text | ✓ |
| inspection_status | text | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### compliance.required_licenses

| Column | Type | Nullable |
|--------|------|----------|
| requirement_id | integer | ✗ |
| license_type | text | ✗ |
| license_category | text | ✓ |
| regulatory_body | text | ✓ |
| applicable_to | ARRAY | ✓ |
| is_mandatory | boolean | ✓ |
| created_at | timestamp without time zone | ✓ |

### compliance.temperature_logs

| Column | Type | Nullable |
|--------|------|----------|
| log_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| location_id | integer | ✗ |
| device_id | text | ✗ |
| device_type | text | ✗ |
| temperature | numeric | ✗ |
| humidity | numeric | ✓ |
| recorded_at | timestamp with time zone | ✗ |
| within_range | boolean | ✗ |
| min_allowed | numeric | ✗ |
| max_allowed | numeric | ✗ |
| is_excursion | boolean | ✓ |
| excursion_duration_minutes | integer | ✓ |
| excursion_severity | text | ✓ |
| action_required | boolean | ✓ |
| action_taken | text | ✓ |
| action_by | integer | ✓ |
| action_timestamp | timestamp with time zone | ✓ |
| affected_products | ARRAY | ✓ |
| affected_batches | ARRAY | ✓ |
| created_at | timestamp with time zone | ✓ |

### compliance.temperature_zones

| Column | Type | Nullable |
|--------|------|----------|
| zone_id | integer | ✗ |
| org_id | uuid | ✗ |
| zone_name | text | ✗ |
| zone_type | text | ✗ |
| min_temperature | numeric | ✓ |
| max_temperature | numeric | ✓ |
| last_reading | timestamp with time zone | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

---

## financial

Tables: 16

### financial.bank_reconciliation_items

| Column | Type | Nullable |
|--------|------|----------|
| item_id | integer | ✗ |
| reconciliation_id | integer | ✗ |
| transaction_type | text | ✗ |
| transaction_id | integer | ✓ |
| transaction_date | date | ✗ |
| transaction_amount | numeric | ✗ |
| is_reconciled | boolean | ✓ |
| reconciled_amount | numeric | ✓ |
| statement_reference | text | ✓ |
| statement_date | date | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### financial.bank_reconciliations

| Column | Type | Nullable |
|--------|------|----------|
| reconciliation_id | integer | ✗ |
| org_id | uuid | ✗ |
| bank_account_id | integer | ✗ |
| reconciliation_date | date | ✗ |
| from_date | date | ✗ |
| to_date | date | ✗ |
| statement_balance | numeric | ✗ |
| statement_date | date | ✗ |
| book_balance | numeric | ✗ |
| uncleared_deposits | numeric | ✓ |
| uncleared_payments | numeric | ✓ |
| adjusted_book_balance | numeric | ✓ |
| difference | numeric | ✓ |
| reconciliation_status | text | ✓ |
| completed_by | integer | ✓ |
| completed_at | timestamp with time zone | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### financial.cash_flow_forecast

| Column | Type | Nullable |
|--------|------|----------|
| forecast_id | integer | ✗ |
| org_id | uuid | ✗ |
| forecast_date | date | ✗ |
| forecast_type | text | ✗ |
| opening_balance | numeric | ✗ |
| customer_collections | numeric | ✓ |
| other_income | numeric | ✓ |
| total_inflows | numeric | ✓ |
| supplier_payments | numeric | ✓ |
| salary_payments | numeric | ✓ |
| other_expenses | numeric | ✓ |
| total_outflows | numeric | ✓ |
| projected_closing_balance | numeric | ✓ |
| minimum_required_balance | numeric | ✓ |
| surplus_deficit | numeric | ✓ |
| actual_inflows | numeric | ✓ |
| actual_outflows | numeric | ✓ |
| actual_closing_balance | numeric | ✓ |
| variance | numeric | ✓ |
| forecast_status | text | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### financial.chart_of_accounts

| Column | Type | Nullable |
|--------|------|----------|
| account_id | integer | ✗ |
| org_id | uuid | ✗ |
| parent_account_id | integer | ✓ |
| account_code | text | ✗ |
| account_name | text | ✗ |
| account_type | text | ✗ |
| account_subtype | text | ✓ |
| is_group | boolean | ✓ |
| is_active | boolean | ✓ |
| is_system_account | boolean | ✓ |
| normal_balance | text | ✗ |
| current_balance | numeric | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### financial.customer_outstanding

| Column | Type | Nullable |
|--------|------|----------|
| outstanding_id | integer | ✗ |
| org_id | uuid | ✗ |
| customer_id | integer | ✗ |
| document_type | text | ✗ |
| document_id | integer | ✗ |
| document_number | text | ✗ |
| document_date | date | ✗ |
| original_amount | numeric | ✗ |
| outstanding_amount | numeric | ✗ |
| paid_amount | numeric | ✓ |
| due_date | date | ✓ |
| days_overdue | integer | ✓ |
| aging_bucket | text | ✓ |
| status | text | ✓ |
| promised_date | date | ✓ |
| follow_up_date | date | ✓ |
| collection_notes | text | ✓ |
| write_off_amount | numeric | ✓ |
| write_off_date | date | ✓ |
| write_off_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### financial.expense_categories

| Column | Type | Nullable |
|--------|------|----------|
| category_id | integer | ✗ |
| org_id | uuid | ✗ |
| parent_category_id | integer | ✓ |
| category_code | text | ✗ |
| category_name | text | ✗ |
| expense_account_id | integer | ✓ |
| monthly_budget | numeric | ✓ |
| quarterly_budget | numeric | ✓ |
| annual_budget | numeric | ✓ |
| requires_approval | boolean | ✓ |
| approval_limit | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

### financial.expense_claim_items

| Column | Type | Nullable |
|--------|------|----------|
| claim_item_id | integer | ✗ |
| claim_id | integer | ✗ |
| expense_date | date | ✗ |
| category_id | integer | ✗ |
| expense_description | text | ✗ |
| claimed_amount | numeric | ✗ |
| approved_amount | numeric | ✓ |
| bill_number | text | ✓ |
| bill_date | date | ✓ |
| vendor_name | text | ✓ |
| attachment_path | text | ✓ |
| item_status | text | ✓ |
| rejection_reason | text | ✓ |
| notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### financial.expense_claims

| Column | Type | Nullable |
|--------|------|----------|
| claim_id | integer | ✗ |
| org_id | uuid | ✗ |
| claim_number | text | ✗ |
| claim_date | date | ✗ |
| employee_id | integer | ✗ |
| department | text | ✓ |
| expense_from_date | date | ✓ |
| expense_to_date | date | ✓ |
| total_amount | numeric | ✗ |
| approved_amount | numeric | ✓ |
| advance_amount | numeric | ✓ |
| payable_amount | numeric | ✓ |
| claim_status | text | ✓ |
| submitted_date | date | ✓ |
| current_approver_id | integer | ✓ |
| approval_history | jsonb | ✓ |
| payment_status | text | ✓ |
| payment_id | integer | ✓ |
| paid_date | date | ✓ |
| purpose | text | ✓ |
| notes | text | ✓ |
| rejection_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### financial.journal_entries

| Column | Type | Nullable |
|--------|------|----------|
| journal_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| journal_number | text | ✗ |
| journal_date | date | ✗ |
| journal_type | text | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| reference_number | text | ✓ |
| entry_status | text | ✓ |
| posted_by | integer | ✓ |
| posted_at | timestamp with time zone | ✓ |
| is_reversal | boolean | ✓ |
| reversal_of_journal_id | integer | ✓ |
| narration | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### financial.journal_entry_lines

| Column | Type | Nullable |
|--------|------|----------|
| line_id | integer | ✗ |
| journal_id | integer | ✗ |
| account_code | text | ✗ |
| account_name | text | ✗ |
| debit_amount | numeric | ✓ |
| credit_amount | numeric | ✓ |
| party_type | text | ✓ |
| party_id | integer | ✓ |
| cost_center_id | integer | ✓ |
| line_narration | text | ✓ |
| display_order | integer | ✓ |

### financial.payment_allocations

| Column | Type | Nullable |
|--------|------|----------|
| allocation_id | integer | ✗ |
| payment_id | integer | ✗ |
| reference_type | text | ✗ |
| reference_id | integer | ✗ |
| reference_number | text | ✗ |
| allocated_amount | numeric | ✗ |
| discount_amount | numeric | ✓ |
| write_off_amount | numeric | ✓ |
| allocation_status | text | ✓ |
| reversed_by | integer | ✓ |
| reversed_at | timestamp with time zone | ✓ |
| reversal_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### financial.payment_methods

| Column | Type | Nullable |
|--------|------|----------|
| payment_method_id | integer | ✗ |
| org_id | uuid | ✗ |
| method_code | text | ✗ |
| method_name | text | ✗ |
| method_type | text | ✗ |
| requires_reference | boolean | ✓ |
| requires_approval | boolean | ✓ |
| default_bank_account_id | integer | ✓ |
| processing_days | integer | ✓ |
| transaction_charge_percent | numeric | ✓ |
| transaction_charge_fixed | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

### financial.payments

| Column | Type | Nullable |
|--------|------|----------|
| payment_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| payment_number | text | ✗ |
| payment_date | date | ✗ |
| payment_type | text | ✗ |
| party_type | text | ✗ |
| party_id | integer | ✓ |
| party_name | text | ✗ |
| payment_amount | numeric | ✗ |
| payment_method_id | integer | ✗ |
| reference_number | text | ✓ |
| reference_date | date | ✓ |
| bank_account_id | integer | ✓ |
| deposited_at_bank | text | ✓ |
| payment_status | text | ✓ |
| clearance_date | date | ✓ |
| requires_approval | boolean | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| allocation_status | text | ✓ |
| allocated_amount | numeric | ✓ |
| unallocated_amount | numeric | ✓ |
| narration | text | ✓ |
| internal_notes | text | ✓ |
| is_pdc | boolean | ✓ |
| pdc_status | text | ✓ |
| is_cancelled | boolean | ✓ |
| cancellation_reason | text | ✓ |
| cancelled_by | integer | ✓ |
| cancelled_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |
| reconciliation_id | integer | ✓ |

### financial.pdc_management

| Column | Type | Nullable |
|--------|------|----------|
| pdc_id | integer | ✗ |
| org_id | uuid | ✗ |
| payment_id | integer | ✓ |
| cheque_number | text | ✗ |
| cheque_date | date | ✗ |
| bank_name | text | ✗ |
| party_type | text | ✗ |
| party_id | integer | ✗ |
| party_name | text | ✗ |
| cheque_amount | numeric | ✗ |
| pdc_type | text | ✗ |
| pdc_status | text | ✓ |
| deposit_date | date | ✓ |
| clearance_date | date | ✓ |
| bounce_count | integer | ✓ |
| bounce_charges | numeric | ✓ |
| bounce_reason | text | ✓ |
| cheque_location | text | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### financial.supplier_outstanding

| Column | Type | Nullable |
|--------|------|----------|
| outstanding_id | integer | ✗ |
| org_id | uuid | ✗ |
| supplier_id | integer | ✗ |
| document_type | text | ✗ |
| document_id | integer | ✗ |
| document_number | text | ✗ |
| document_date | date | ✗ |
| original_amount | numeric | ✗ |
| outstanding_amount | numeric | ✗ |
| paid_amount | numeric | ✓ |
| due_date | date | ✓ |
| days_until_due | integer | ✓ |
| status | text | ✓ |
| planned_payment_date | date | ✓ |
| payment_priority | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### financial.unmatched_transactions

| Column | Type | Nullable |
|--------|------|----------|
| transaction_id | integer | ✗ |
| reconciliation_id | integer | ✓ |
| transaction_date | date | ✗ |
| description | text | ✓ |
| amount | numeric | ✗ |
| transaction_type | text | ✓ |
| created_at | timestamp with time zone | ✓ |

---

## gst

Tables: 15

### gst.advance_receipts

| Column | Type | Nullable |
|--------|------|----------|
| advance_id | integer | ✗ |
| org_id | integer | ✗ |
| branch_id | integer | ✓ |
| customer_id | integer | ✓ |
| receipt_date | date | ✓ |
| advance_amount | numeric | ✓ |
| place_of_supply | text | ✓ |
| gst_rate | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| adjustment_status | text | ✓ |
| created_at | timestamp without time zone | ✓ |

### gst.compliance_calendar

| Column | Type | Nullable |
|--------|------|----------|
| calendar_id | integer | ✗ |
| org_id | uuid | ✗ |
| compliance_type | text | ✗ |
| period | text | ✗ |
| due_date | date | ✗ |
| extended_due_date | date | ✓ |
| compliance_status | text | ✓ |
| completed_date | date | ✓ |
| reminder_days | ARRAY | ✓ |
| reminders_sent | integer | ✓ |
| last_reminder_date | date | ✓ |
| assigned_to | integer | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### gst.eway_bills

| Column | Type | Nullable |
|--------|------|----------|
| eway_bill_id | integer | ✗ |
| org_id | uuid | ✗ |
| eway_bill_number | text | ✓ |
| eway_bill_date | date | ✗ |
| document_type | text | ✗ |
| document_id | integer | ✗ |
| document_number | text | ✗ |
| supply_type | text | ✗ |
| sub_supply_type | text | ✗ |
| from_gstin | text | ✗ |
| from_address | text | ✗ |
| from_place | text | ✗ |
| from_pincode | text | ✗ |
| from_state_code | text | ✗ |
| to_gstin | text | ✓ |
| to_address | text | ✗ |
| to_place | text | ✗ |
| to_pincode | text | ✗ |
| to_state_code | text | ✗ |
| total_value | numeric | ✗ |
| taxable_value | numeric | ✗ |
| cgst_value | numeric | ✓ |
| sgst_value | numeric | ✓ |
| igst_value | numeric | ✓ |
| cess_value | numeric | ✓ |
| transport_mode | text | ✗ |
| transport_distance | integer | ✓ |
| transporter_name | text | ✓ |
| transporter_id | text | ✓ |
| transport_doc_number | text | ✓ |
| transport_doc_date | date | ✓ |
| vehicle_number | text | ✓ |
| vehicle_type | text | ✓ |
| valid_from | timestamp with time zone | ✗ |
| valid_until | timestamp with time zone | ✗ |
| eway_bill_status | text | ✓ |
| cancellation_reason | text | ✓ |
| cancelled_date | timestamp with time zone | ✓ |
| extended | boolean | ✓ |
| extension_reason | text | ✓ |
| extended_validity | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### gst.gst_audit_trail

| Column | Type | Nullable |
|--------|------|----------|
| audit_id | integer | ✗ |
| org_id | uuid | ✗ |
| activity_date | timestamp with time zone | ✓ |
| activity_type | text | ✗ |
| return_type | text | ✓ |
| return_period | text | ✓ |
| reference_number | text | ✓ |
| activity_description | text | ✗ |
| old_values | jsonb | ✓ |
| new_values | jsonb | ✓ |
| performed_by | integer | ✗ |
| ip_address | inet | ✓ |
| user_agent | text | ✓ |
| activity_status | text | ✓ |
| error_message | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### gst.gst_credit_ledger

| Column | Type | Nullable |
|--------|------|----------|
| ledger_id | integer | ✗ |
| org_id | uuid | ✗ |
| transaction_date | date | ✗ |
| transaction_type | text | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| reference_number | text | ✓ |
| description | text | ✗ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| igst_balance | numeric | ✓ |
| cgst_balance | numeric | ✓ |
| sgst_balance | numeric | ✓ |
| cess_balance | numeric | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### gst.gst_liability

| Column | Type | Nullable |
|--------|------|----------|
| liability_id | integer | ✗ |
| org_id | uuid | ✗ |
| tax_period | text | ✗ |
| due_date | date | ✗ |
| igst_liability | numeric | ✓ |
| cgst_liability | numeric | ✓ |
| sgst_liability | numeric | ✓ |
| cess_liability | numeric | ✓ |
| igst_itc_available | numeric | ✓ |
| cgst_itc_available | numeric | ✓ |
| sgst_itc_available | numeric | ✓ |
| cess_itc_available | numeric | ✓ |
| igst_itc_utilized | numeric | ✓ |
| cgst_itc_utilized | numeric | ✓ |
| sgst_itc_utilized | numeric | ✓ |
| cess_itc_utilized | numeric | ✓ |
| igst_cash_required | numeric | ✓ |
| cgst_cash_required | numeric | ✓ |
| sgst_cash_required | numeric | ✓ |
| cess_cash_required | numeric | ✓ |
| interest_amount | numeric | ✓ |
| late_fee | numeric | ✓ |
| total_liability | numeric | ✓ |
| balance_payable | numeric | ✓ |
| payment_status | text | ✓ |
| paid_amount | numeric | ✓ |
| payment_date | date | ✓ |
| payment_reference | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### gst.gst_rates

| Column | Type | Nullable |
|--------|------|----------|
| rate_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_id | integer | ✓ |
| product_category_id | integer | ✓ |
| igst_rate | numeric | ✗ |
| cgst_rate | numeric | ✗ |
| sgst_rate | numeric | ✗ |
| cess_rate | numeric | ✓ |
| effective_from | date | ✗ |
| effective_until | date | ✓ |
| notification_number | text | ✓ |
| notification_date | date | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### gst.gst_reconciliation

| Column | Type | Nullable |
|--------|------|----------|
| reconciliation_id | integer | ✗ |
| org_id | uuid | ✗ |
| reconciliation_type | text | ✗ |
| period | text | ✗ |
| books_data | jsonb | ✗ |
| gst_return_data | jsonb | ✗ |
| invoice_count_variance | integer | ✓ |
| taxable_value_variance | numeric | ✓ |
| tax_variance | numeric | ✓ |
| matched_items | jsonb | ✓ |
| unmatched_in_books | jsonb | ✓ |
| unmatched_in_return | jsonb | ✓ |
| reconciliation_status | text | ✓ |
| actions_taken | jsonb | ✓ |
| reviewed_by | integer | ✓ |
| reviewed_at | timestamp with time zone | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### gst.gstr1_data

| Column | Type | Nullable |
|--------|------|----------|
| gstr1_id | integer | ✗ |
| org_id | uuid | ✗ |
| return_period | text | ✗ |
| financial_year | text | ✗ |
| b2b_supplies | jsonb | ✓ |
| b2b_invoice_count | integer | ✓ |
| b2b_taxable_value | numeric | ✓ |
| b2b_tax_amount | numeric | ✓ |
| b2cl_supplies | jsonb | ✓ |
| b2cl_invoice_count | integer | ✓ |
| b2cl_taxable_value | numeric | ✓ |
| b2cl_tax_amount | numeric | ✓ |
| b2cs_taxable_value | numeric | ✓ |
| b2cs_tax_amount | numeric | ✓ |
| cdn_documents | jsonb | ✓ |
| cdn_count | integer | ✓ |
| cdn_taxable_value | numeric | ✓ |
| cdn_tax_amount | numeric | ✓ |
| exp_supplies | jsonb | ✓ |
| exp_invoice_count | integer | ✓ |
| exp_taxable_value | numeric | ✓ |
| nil_rated_supplies | jsonb | ✓ |
| hsn_summary | jsonb | ✓ |
| doc_summary | jsonb | ✓ |
| total_taxable_value | numeric | ✓ |
| total_tax_amount | numeric | ✓ |
| filing_status | text | ✓ |
| filed_date | date | ✓ |
| arn_number | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### gst.gstr2a_data

| Column | Type | Nullable |
|--------|------|----------|
| gstr2a_id | integer | ✗ |
| org_id | uuid | ✗ |
| return_period | text | ✗ |
| downloaded_date | date | ✗ |
| download_status | text | ✓ |
| b2b_invoices | jsonb | ✓ |
| b2b_count | integer | ✓ |
| b2b_taxable_value | numeric | ✓ |
| b2b_tax_amount | numeric | ✓ |
| cdn_documents | jsonb | ✓ |
| cdn_count | integer | ✓ |
| isd_credits | jsonb | ✓ |
| reconciliation_status | text | ✓ |
| matched_invoices | integer | ✓ |
| unmatched_invoices | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### gst.gstr2b_data

| Column | Type | Nullable |
|--------|------|----------|
| gstr2b_id | integer | ✗ |
| org_id | uuid | ✗ |
| return_period | text | ✗ |
| generation_date | date | ✗ |
| total_itc_available | numeric | ✓ |
| igst_itc | numeric | ✓ |
| cgst_itc | numeric | ✓ |
| sgst_itc | numeric | ✓ |
| cess_itc | numeric | ✓ |
| itc_unavailable | numeric | ✓ |
| import_goods_itc | numeric | ✓ |
| isd_itc | numeric | ✓ |
| ineligible_itc | numeric | ✓ |
| itc_reversal | numeric | ✓ |
| net_itc | numeric | ✓ |
| download_status | text | ✓ |
| downloaded_date | date | ✓ |
| created_at | timestamp with time zone | ✓ |

### gst.gstr3b_data

| Column | Type | Nullable |
|--------|------|----------|
| gstr3b_id | integer | ✗ |
| org_id | uuid | ✗ |
| return_period | text | ✗ |
| outward_taxable_supplies | numeric | ✓ |
| outward_zero_rated | numeric | ✓ |
| outward_nil_rated | numeric | ✓ |
| inward_nil_rated | numeric | ✓ |
| total_output_igst | numeric | ✓ |
| total_output_cgst | numeric | ✓ |
| total_output_sgst | numeric | ✓ |
| total_output_cess | numeric | ✓ |
| import_goods_igst | numeric | ✓ |
| import_service_igst | numeric | ✓ |
| inward_supplies_igst | numeric | ✓ |
| inward_supplies_cgst | numeric | ✓ |
| inward_supplies_sgst | numeric | ✓ |
| itc_reversal_igst | numeric | ✓ |
| itc_reversal_cgst | numeric | ✓ |
| itc_reversal_sgst | numeric | ✓ |
| inter_state_supplies | numeric | ✓ |
| intra_state_supplies | numeric | ✓ |
| tax_payable_igst | numeric | ✓ |
| tax_payable_cgst | numeric | ✓ |
| tax_payable_sgst | numeric | ✓ |
| tax_payable_cess | numeric | ✓ |
| tax_paid_cash_igst | numeric | ✓ |
| tax_paid_cash_cgst | numeric | ✓ |
| tax_paid_cash_sgst | numeric | ✓ |
| tax_paid_cash_cess | numeric | ✓ |
| interest_payable | numeric | ✓ |
| late_fee | numeric | ✓ |
| filing_status | text | ✓ |
| filed_date | date | ✓ |
| arn_number | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### gst.hsn_sac_codes

| Column | Type | Nullable |
|--------|------|----------|
| hsn_sac_id | integer | ✗ |
| code | text | ✗ |
| code_type | text | ✗ |
| description | text | ✗ |
| igst_rate | numeric | ✗ |
| cgst_rate | numeric | ✗ |
| sgst_rate | numeric | ✗ |
| cess_rate | numeric | ✓ |
| effective_from | date | ✗ |
| effective_until | date | ✓ |
| chapter_code | text | ✓ |
| chapter_name | text | ✓ |
| section_name | text | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### gst.purchase_reconciliation

| Column | Type | Nullable |
|--------|------|----------|
| reconciliation_id | integer | ✗ |
| org_id | integer | ✗ |
| supplier_gstin | text | ✓ |
| invoice_number | text | ✓ |
| invoice_date | date | ✓ |
| invoice_value | numeric | ✓ |
| match_status | text | ✓ |
| mismatch_reason | text | ✓ |
| created_at | timestamp without time zone | ✓ |

### gst.return_filing_status

| Column | Type | Nullable |
|--------|------|----------|
| filing_id | integer | ✗ |
| org_id | integer | ✗ |
| return_type | text | ✗ |
| return_period | text | ✗ |
| due_date | date | ✗ |
| filing_date | date | ✓ |
| filing_status | text | ✓ |
| acknowledgment_number | text | ✓ |
| created_at | timestamp without time zone | ✓ |

---

## inventory

Tables: 16

### inventory.batches

| Column | Type | Nullable |
|--------|------|----------|
| batch_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_id | integer | ✗ |
| batch_number | text | ✗ |
| alternate_batch_number | text | ✓ |
| manufacturing_date | date | ✓ |
| expiry_date | date | ✗ |
| retesting_date | date | ✓ |
| initial_quantity | numeric | ✗ |
| quantity_available | numeric | ✗ |
| quantity_reserved | numeric | ✓ |
| quantity_quarantine | numeric | ✓ |
| location_count | integer | ✓ |
| primary_location_id | integer | ✓ |
| cost_per_unit | numeric | ✓ |
| mrp_per_unit | numeric | ✗ |
| sale_price_per_unit | numeric | ✓ |
| qc_status | text | ✓ |
| qc_date | date | ✓ |
| qc_certificate_number | text | ✓ |
| qc_performed_by | integer | ✓ |
| source_type | text | ✗ |
| source_reference_id | integer | ✓ |
| supplier_id | integer | ✓ |
| weighted_average_cost | numeric | ✓ |
| last_cost_update | timestamp with time zone | ✓ |
| cost_calculation_method | text | ✓ |
| batch_status | text | ✓ |
| expiry_status | text | ✓ |
| recall_status | text | ✓ |
| recall_date | date | ✓ |
| recall_reason | text | ✓ |
| serial_numbers | ARRAY | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| last_movement_date | timestamp with time zone | ✓ |
| pack_size | integer | ✗ |
| pack_type | text | ✗ |
| pack_uom | text | ✗ |
| base_uom | text | ✗ |
| units_per_pack | integer | ✗ |
| packages_per_box | integer | ✓ |
| tablets_per_strip | integer | ✓ |
| storage_condition | text | ✓ |
| storage_location | text | ✓ |
| quality_status | text | ✓ |
| quality_notes | text | ✓ |
| quantity_allocated | numeric | ✓ |
| category_name | text | ✓ |
| category_id | integer | ✓ |
| product_type | text | ✓ |
| quantity_returned | numeric | ✓ |

### inventory.competitor_pricing

| Column | Type | Nullable |
|--------|------|----------|
| competitor_price_id | integer | ✗ |
| org_id | integer | ✗ |
| product_id | integer | ✓ |
| competitor_name | text | ✗ |
| competitor_price | numeric | ✗ |
| competitor_mrp | numeric | ✓ |
| data_source | text | ✓ |
| price_comparison | jsonb | ✓ |
| is_active | boolean | ✓ |
| last_updated | timestamp without time zone | ✓ |
| created_at | timestamp without time zone | ✓ |

### inventory.inventory_movements

| Column | Type | Nullable |
|--------|------|----------|
| movement_id | integer | ✗ |
| org_id | uuid | ✗ |
| movement_type | text | ✗ |
| movement_date | timestamp without time zone | ✓ |
| movement_direction | text | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| quantity | numeric | ✗ |
| pack_type | text | ✓ |
| base_quantity | numeric | ✓ |
| location_id | integer | ✗ |
| from_location_id | integer | ✓ |
| to_location_id | integer | ✓ |
| unit_cost | numeric | ✓ |
| total_cost | numeric | ✓ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| reference_number | text | ✓ |
| transfer_type | text | ✓ |
| transfer_pair_id | integer | ✓ |
| reason | text | ✓ |
| notes | text | ✓ |
| pack_display_data | jsonb | ✓ |
| cost_details | jsonb | ✓ |
| created_by | integer | ✗ |
| created_at | timestamp without time zone | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp without time zone | ✓ |

### inventory.location_wise_stock

| Column | Type | Nullable |
|--------|------|----------|
| stock_id | integer | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✗ |
| location_id | integer | ✗ |
| org_id | uuid | ✗ |
| quantity_available | numeric | ✗ |
| quantity_reserved | numeric | ✓ |
| quantity_quarantine | numeric | ✓ |
| stock_in_date | date | ✗ |
| unit_cost | numeric | ✓ |
| bin_number | text | ✓ |
| pallet_number | text | ✓ |
| stock_status | text | ✓ |
| last_movement_date | timestamp with time zone | ✓ |
| last_counted_date | date | ✓ |
| created_at | timestamp with time zone | ✓ |
| last_updated | timestamp with time zone | ✓ |

### inventory.price_alerts

| Column | Type | Nullable |
|--------|------|----------|
| alert_id | integer | ✗ |
| org_id | integer | ✗ |
| product_id | integer | ✓ |
| batch_id | integer | ✓ |
| alert_type | text | ✗ |
| alert_severity | text | ✓ |
| current_price | numeric | ✓ |
| average_price | numeric | ✓ |
| competitor_price | numeric | ✓ |
| price_change_percent | numeric | ✓ |
| margin_impact_percent | numeric | ✓ |
| price_volatility | numeric | ✓ |
| price_difference_percent | numeric | ✓ |
| alert_message | text | ✗ |
| price_data | jsonb | ✓ |
| price_variance_data | jsonb | ✓ |
| competitor_data | jsonb | ✓ |
| acknowledged | boolean | ✓ |
| acknowledged_by | integer | ✓ |
| acknowledged_at | timestamp without time zone | ✓ |
| created_at | timestamp without time zone | ✓ |

### inventory.price_change_log

| Column | Type | Nullable |
|--------|------|----------|
| log_id | integer | ✗ |
| org_id | integer | ✗ |
| product_id | integer | ✓ |
| batch_id | integer | ✓ |
| change_type | text | ✗ |
| old_value | numeric | ✓ |
| new_value | numeric | ✓ |
| change_reason | text | ✓ |
| changed_by | integer | ✓ |
| requires_approval | boolean | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp without time zone | ✓ |
| created_at | timestamp without time zone | ✓ |

### inventory.price_history

| Column | Type | Nullable |
|--------|------|----------|
| history_id | integer | ✗ |
| org_id | integer | ✗ |
| product_id | integer | ✓ |
| batch_id | integer | ✓ |
| price_type | text | ✗ |
| old_price | numeric | ✓ |
| new_price | numeric | ✓ |
| change_percent | numeric | ✓ |
| change_reason | text | ✓ |
| changed_by | integer | ✓ |
| changed_at | timestamp without time zone | ✓ |
| source_reference | text | ✓ |

### inventory.product_categories

| Column | Type | Nullable |
|--------|------|----------|
| category_id | integer | ✗ |
| org_id | uuid | ✗ |
| parent_category_id | integer | ✓ |
| category_code | text | ✗ |
| category_name | text | ✗ |
| category_level | integer | ✗ |
| category_path | text | ✓ |
| category_type | text | ✓ |
| requires_prescription | boolean | ✓ |
| requires_license | boolean | ✓ |
| display_order | integer | ✓ |
| icon_name | text | ✓ |
| color_code | text | ✓ |
| default_hsn_code | text | ✓ |
| default_gst_rate | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### inventory.product_types

| Column | Type | Nullable |
|--------|------|----------|
| type_id | integer | ✗ |
| type_code | text | ✗ |
| type_name | text | ✗ |
| default_base_uom | text | ✗ |
| is_liquid | boolean | ✓ |
| is_injectable | boolean | ✓ |
| requires_cold_storage | boolean | ✓ |
| is_active | boolean | ✓ |

### inventory.products

| Column | Type | Nullable |
|--------|------|----------|
| product_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_code | text | ✗ |
| product_name | text | ✗ |
| generic_name | text | ✓ |
| brand | text | ✓ |
| manufacturer | text | ✓ |
| category_id | integer | ✓ |
| product_type | text | ✗ |
| product_class | text | ✓ |
| composition | jsonb | ✓ |
| strength | text | ✓ |
| hsn_code | text | ✓ |
| drug_schedule | text | ✓ |
| requires_prescription | boolean | ✓ |
| is_narcotic | boolean | ✓ |
| is_controlled_substance | boolean | ✓ |
| barcode | text | ✓ |
| manufacturer_code | text | ✓ |
| gst_percent | numeric | ✓ |
| cess_percentage | numeric | ✓ |
| maintain_batch | boolean | ✓ |
| maintain_expiry | boolean | ✓ |
| allow_negative_stock | boolean | ✓ |
| min_stock_quantity | numeric | ✓ |
| reorder_level | numeric | ✓ |
| reorder_quantity | numeric | ✓ |
| max_stock_quantity | numeric | ✓ |
| critical_stock_level | numeric | ✓ |
| product_status | text | ✓ |
| launch_date | date | ✓ |
| discontinuation_date | date | ✓ |
| search_keywords | ARRAY | ✓ |
| tags | ARRAY | ✓ |
| product_images | jsonb | ✓ |
| documents | jsonb | ✓ |
| is_active | boolean | ✓ |
| is_saleable | boolean | ✓ |
| is_purchasable | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| type_id | integer | ✓ |
| quantity_returned | numeric | ✓ |

### inventory.reorder_suggestions

| Column | Type | Nullable |
|--------|------|----------|
| suggestion_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_id | integer | ✗ |
| current_stock | numeric | ✗ |
| reserved_stock | numeric | ✓ |
| available_stock | numeric | ✓ |
| reorder_level | numeric | ✓ |
| min_stock_level | numeric | ✓ |
| suggested_quantity | numeric | ✗ |
| average_daily_consumption | numeric | ✓ |
| lead_time_days | integer | ✓ |
| safety_stock_days | integer | ✓ |
| preferred_supplier_id | integer | ✓ |
| last_purchase_price | numeric | ✓ |
| last_purchase_date | date | ✓ |
| urgency | text | ✗ |
| suggested_order_date | date | ✓ |
| suggestion_status | text | ✓ |
| action_taken | text | ✓ |
| action_taken_by | integer | ✓ |
| action_taken_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### inventory.stock_reservations

| Column | Type | Nullable |
|--------|------|----------|
| reservation_id | integer | ✗ |
| org_id | uuid | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| location_id | integer | ✗ |
| reserved_quantity | numeric | ✗ |
| fulfilled_quantity | numeric | ✓ |
| reference_type | text | ✗ |
| reference_id | integer | ✗ |
| reservation_date | timestamp with time zone | ✓ |
| expires_at | timestamp with time zone | ✓ |
| priority | integer | ✓ |
| reservation_status | text | ✓ |
| reserved_by | integer | ✗ |
| created_at | timestamp with time zone | ✓ |

### inventory.stock_transfer_items

| Column | Type | Nullable |
|--------|------|----------|
| transfer_item_id | integer | ✗ |
| transfer_id | integer | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| requested_quantity | numeric | ✗ |
| approved_quantity | numeric | ✓ |
| dispatched_quantity | numeric | ✓ |
| received_quantity | numeric | ✓ |
| pack_type | text | ✗ |
| pack_size | integer | ✓ |
| shortage_quantity | numeric | ✓ |
| damage_quantity | numeric | ✓ |
| discrepancy_reason | text | ✓ |
| item_status | text | ✓ |
| dispatch_notes | text | ✓ |
| receipt_notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### inventory.stock_transfers

| Column | Type | Nullable |
|--------|------|----------|
| transfer_id | integer | ✗ |
| org_id | uuid | ✗ |
| transfer_number | text | ✗ |
| transfer_date | date | ✗ |
| transfer_type | text | ✗ |
| from_branch_id | integer | ✓ |
| to_branch_id | integer | ✓ |
| from_location_id | integer | ✗ |
| to_location_id | integer | ✗ |
| transfer_reason | text | ✗ |
| priority | text | ✓ |
| expected_dispatch_date | date | ✓ |
| expected_delivery_date | date | ✓ |
| actual_dispatch_date | date | ✓ |
| actual_delivery_date | date | ✓ |
| transport_mode | text | ✓ |
| transporter_name | text | ✓ |
| vehicle_number | text | ✓ |
| lr_number | text | ✓ |
| lr_date | date | ✓ |
| transfer_status | text | ✓ |
| requested_by | integer | ✗ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| received_by | integer | ✓ |
| received_at | timestamp with time zone | ✓ |
| documents | jsonb | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### inventory.storage_locations

| Column | Type | Nullable |
|--------|------|----------|
| location_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| parent_location_id | integer | ✓ |
| location_code | text | ✗ |
| location_name | text | ✗ |
| location_type | text | ✗ |
| location_path | text | ✓ |
| storage_capacity | jsonb | ✓ |
| dimensions | jsonb | ✓ |
| temperature_controlled | boolean | ✓ |
| temperature_range | jsonb | ✓ |
| humidity_controlled | boolean | ✓ |
| humidity_range | jsonb | ✓ |
| restricted_access | boolean | ✓ |
| allowed_product_categories | ARRAY | ✓ |
| storage_class | text | ✓ |
| is_active | boolean | ✓ |
| is_full | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### inventory.units_of_measure

| Column | Type | Nullable |
|--------|------|----------|
| uom_id | integer | ✗ |
| org_id | uuid | ✗ |
| uom_code | text | ✗ |
| uom_name | text | ✗ |
| uom_type | text | ✗ |
| base_uom_code | text | ✓ |
| conversion_factor | numeric | ✓ |
| symbol | text | ✓ |
| decimal_places | integer | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

---

## master

Tables: 13

### master.addresses

| Column | Type | Nullable |
|--------|------|----------|
| address_id | integer | ✗ |
| org_id | uuid | ✗ |
| entity_type | text | ✗ |
| entity_id | integer | ✗ |
| address_type | text | ✗ |
| address_line1 | text | ✗ |
| address_line2 | text | ✓ |
| landmark | text | ✓ |
| city | text | ✗ |
| state_code | text | ✗ |
| state_name | text | ✗ |
| country | text | ✓ |
| pincode | text | ✗ |
| latitude | numeric | ✓ |
| longitude | numeric | ✓ |
| google_plus_code | text | ✓ |
| contact_person | text | ✓ |
| contact_number | text | ✓ |
| contact_email | text | ✓ |
| delivery_instructions | text | ✓ |
| is_default | boolean | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.currencies

| Column | Type | Nullable |
|--------|------|----------|
| currency_id | integer | ✗ |
| currency_code | text | ✗ |
| currency_name | text | ✗ |
| currency_symbol | text | ✗ |
| decimal_places | integer | ✓ |
| decimal_separator | text | ✓ |
| thousand_separator | text | ✓ |
| symbol_position | text | ✓ |
| format_pattern | text | ✓ |
| is_base_currency | boolean | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |

### master.departments

| Column | Type | Nullable |
|--------|------|----------|
| department_id | integer | ✗ |
| org_id | uuid | ✗ |
| department_code | text | ✗ |
| department_name | text | ✗ |
| department_type | text | ✓ |
| parent_department_id | integer | ✓ |
| department_head_id | integer | ✓ |
| cost_center_code | text | ✓ |
| budget_allocated | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.doctors

| Column | Type | Nullable |
|--------|------|----------|
| doctor_id | integer | ✗ |
| org_id | uuid | ✗ |
| doctor_code | text | ✗ |
| doctor_name | text | ✗ |
| qualification | text | ✓ |
| specialization | text | ✓ |
| registration_number | text | ✓ |
| clinic_name | text | ✓ |
| clinic_address | jsonb | ✓ |
| phone_numbers | ARRAY | ✓ |
| email | text | ✓ |
| years_of_practice | integer | ✓ |
| associated_hospitals | ARRAY | ✓ |
| commission_rate | numeric | ✓ |
| credit_limit | numeric | ✓ |
| payment_terms_days | integer | ✓ |
| preferred_brands | ARRAY | ✓ |
| prescription_pattern | jsonb | ✓ |
| is_active | boolean | ✓ |
| blacklisted | boolean | ✓ |
| blacklist_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.employees

| Column | Type | Nullable |
|--------|------|----------|
| employee_id | integer | ✗ |
| org_id | uuid | ✗ |
| user_id | integer | ✓ |
| employee_code | text | ✗ |
| first_name | text | ✗ |
| last_name | text | ✓ |
| full_name | text | ✓ |
| date_of_birth | date | ✓ |
| gender | text | ✓ |
| marital_status | text | ✓ |
| blood_group | text | ✓ |
| personal_email | text | ✓ |
| personal_mobile | text | ✗ |
| emergency_contact | jsonb | ✓ |
| permanent_address | jsonb | ✓ |
| current_address | jsonb | ✓ |
| designation | text | ✗ |
| department_id | integer | ✓ |
| branch_id | integer | ✓ |
| joining_date | date | ✗ |
| probation_end_date | date | ✓ |
| confirmation_date | date | ✓ |
| pan_number | text | ✓ |
| aadhar_number | text | ✓ |
| driving_license | text | ✓ |
| passport_number | text | ✓ |
| bank_account_details | jsonb | ✓ |
| employment_status | text | ✓ |
| resignation_date | date | ✓ |
| last_working_date | date | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.exchange_rates

| Column | Type | Nullable |
|--------|------|----------|
| rate_id | integer | ✗ |
| org_id | uuid | ✗ |
| from_currency_code | text | ✗ |
| to_currency_code | text | ✗ |
| exchange_rate | numeric | ✗ |
| inverse_rate | numeric | ✓ |
| effective_from | date | ✗ |
| effective_until | date | ✓ |
| rate_source | text | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### master.number_series

| Column | Type | Nullable |
|--------|------|----------|
| series_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✓ |
| document_type | text | ✗ |
| series_code | text | ✗ |
| series_description | text | ✓ |
| prefix | text | ✓ |
| suffix | text | ✓ |
| separator | text | ✓ |
| current_number | integer | ✗ |
| start_number | integer | ✗ |
| increment_by | integer | ✗ |
| reset_frequency | text | ✓ |
| last_reset_date | date | ✓ |
| preview_format | text | ✓ |
| is_default | boolean | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.org_bank_accounts

| Column | Type | Nullable |
|--------|------|----------|
| bank_account_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✓ |
| account_name | text | ✗ |
| account_number | text | ✗ |
| account_type | text | ✗ |
| bank_name | text | ✗ |
| branch_name | text | ✗ |
| ifsc_code | text | ✗ |
| swift_code | text | ✓ |
| bank_address | jsonb | ✓ |
| bank_contact_number | text | ✓ |
| relationship_manager | text | ✓ |
| currency_code | text | ✓ |
| overdraft_limit | numeric | ✓ |
| is_default_account | boolean | ✓ |
| is_payment_account | boolean | ✓ |
| is_receipt_account | boolean | ✓ |
| last_reconciled_date | date | ✓ |
| last_statement_date | date | ✓ |
| current_balance | numeric | ✓ |
| is_active | boolean | ✓ |
| account_opened_date | date | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.org_branches

| Column | Type | Nullable |
|--------|------|----------|
| branch_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_code | text | ✗ |
| branch_name | text | ✗ |
| branch_type | text | ✗ |
| address | jsonb | ✗ |
| google_maps_link | text | ✓ |
| latitude | numeric | ✓ |
| longitude | numeric | ✓ |
| branch_phone | text | ✓ |
| branch_email | text | ✓ |
| branch_manager_id | integer | ✓ |
| branch_gst_number | text | ✓ |
| drug_license_number | text | ✓ |
| drug_license_validity | date | ✓ |
| is_billing_location | boolean | ✓ |
| is_shipping_location | boolean | ✓ |
| is_default_location | boolean | ✓ |
| storage_capacity | jsonb | ✓ |
| working_hours | jsonb | ✓ |
| holidays | jsonb | ✓ |
| is_active | boolean | ✓ |
| operational_since | date | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.org_users

| Column | Type | Nullable |
|--------|------|----------|
| user_id | integer | ✗ |
| org_id | uuid | ✗ |
| auth_user_id | uuid | ✓ |
| username | text | ✗ |
| email | text | ✗ |
| mobile_number | text | ✗ |
| employee_code | text | ✓ |
| first_name | text | ✗ |
| last_name | text | ✓ |
| full_name | text | ✓ |
| role_id | integer | ✓ |
| is_admin | boolean | ✓ |
| permissions | jsonb | ✓ |
| branch_ids | ARRAY | ✓ |
| department_id | integer | ✓ |
| reporting_to_id | integer | ✓ |
| last_login | timestamp with time zone | ✓ |
| login_count | integer | ✓ |
| failed_login_attempts | integer | ✓ |
| locked_until | timestamp with time zone | ✓ |
| ui_preferences | jsonb | ✓ |
| notification_preferences | jsonb | ✓ |
| is_active | boolean | ✓ |
| is_online | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| password_hash | text | ✓ |

### master.organizations

| Column | Type | Nullable |
|--------|------|----------|
| org_id | uuid | ✗ |
| org_code | text | ✗ |
| org_name | text | ✗ |
| legal_name | text | ✗ |
| business_type | text | ✗ |
| establishment_date | date | ✓ |
| gst_number | text | ✓ |
| pan_number | text | ✓ |
| drug_license_number | text | ✓ |
| drug_license_validity | date | ✓ |
| fssai_number | text | ✓ |
| registered_address | jsonb | ✗ |
| correspondence_address | jsonb | ✓ |
| contact_numbers | jsonb | ✓ |
| email_addresses | jsonb | ✓ |
| website | text | ✓ |
| financial_year_start | integer | ✓ |
| currency_code | text | ✓ |
| date_format | text | ✓ |
| time_zone | text | ✓ |
| subscription_plan | text | ✓ |
| subscription_status | text | ✓ |
| subscription_valid_until | date | ✓ |
| user_limit | integer | ✓ |
| branch_limit | integer | ✓ |
| business_settings | jsonb | ✓ |
| feature_flags | jsonb | ✓ |
| is_active | boolean | ✓ |
| is_verified | boolean | ✓ |
| verified_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | uuid | ✓ |

### master.roles

| Column | Type | Nullable |
|--------|------|----------|
| role_id | integer | ✗ |
| org_id | uuid | ✗ |
| role_code | text | ✗ |
| role_name | text | ✗ |
| role_description | text | ✓ |
| parent_role_id | integer | ✓ |
| role_level | integer | ✗ |
| permissions | jsonb | ✗ |
| allowed_modules | ARRAY | ✓ |
| restricted_features | ARRAY | ✓ |
| data_access_level | text | ✓ |
| is_system_role | boolean | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### master.system_settings

| Column | Type | Nullable |
|--------|------|----------|
| setting_id | integer | ✗ |
| org_id | uuid | ✗ |
| setting_category | text | ✗ |
| setting_key | text | ✗ |
| setting_value | text | ✗ |
| setting_type | text | ✗ |
| description | text | ✓ |
| is_active | boolean | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

---

## parties

Tables: 8

### parties.customer_contacts

| Column | Type | Nullable |
|--------|------|----------|
| contact_id | integer | ✗ |
| customer_id | integer | ✗ |
| contact_name | text | ✗ |
| designation | text | ✓ |
| department | text | ✓ |
| mobile_number | text | ✓ |
| phone_number | text | ✓ |
| email | text | ✓ |
| is_primary_contact | boolean | ✓ |
| contact_for | ARRAY | ✓ |
| preferred_contact_time | text | ✓ |
| preferred_language | text | ✓ |
| date_of_birth | date | ✓ |
| anniversary_date | date | ✓ |
| notes | text | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### parties.customer_group_members

| Column | Type | Nullable |
|--------|------|----------|
| member_id | integer | ✗ |
| group_id | integer | ✗ |
| customer_id | integer | ✗ |
| joined_date | date | ✗ |
| expiry_date | date | ✓ |
| override_discount | numeric | ✓ |
| override_credit_limit | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### parties.customer_groups

| Column | Type | Nullable |
|--------|------|----------|
| group_id | integer | ✗ |
| org_id | uuid | ✗ |
| group_code | text | ✗ |
| group_name | text | ✗ |
| group_type | text | ✗ |
| parent_group_id | integer | ✓ |
| discount_percentage | numeric | ✓ |
| price_list_id | integer | ✓ |
| payment_terms_days | integer | ✓ |
| credit_limit_multiplier | numeric | ✓ |
| eligibility_criteria | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### parties.customers

| Column | Type | Nullable |
|--------|------|----------|
| customer_id | integer | ✗ |
| org_id | uuid | ✗ |
| customer_code | text | ✗ |
| customer_name | text | ✗ |
| customer_type | text | ✗ |
| primary_phone | text | ✗ |
| primary_email | text | ✓ |
| secondary_phone | text | ✓ |
| whatsapp_number | text | ✓ |
| contact_person_name | text | ✓ |
| contact_person_phone | text | ✓ |
| contact_person_email | text | ✓ |
| gst_number | text | ✓ |
| pan_number | text | ✓ |
| drug_license_number | text | ✓ |
| drug_license_validity | date | ✓ |
| fssai_number | text | ✓ |
| establishment_year | integer | ✓ |
| business_type | text | ✓ |
| credit_limit | numeric | ✓ |
| current_outstanding | numeric | ✓ |
| credit_days | integer | ✓ |
| credit_rating | text | ✓ |
| payment_terms | text | ✓ |
| security_deposit | numeric | ✓ |
| overdue_interest_rate | numeric | ✓ |
| customer_category | text | ✓ |
| customer_grade | text | ✓ |
| territory_id | integer | ✓ |
| route_id | integer | ✓ |
| area_code | text | ✓ |
| assigned_salesperson_id | integer | ✓ |
| price_list_id | integer | ✓ |
| discount_group_id | integer | ✓ |
| kyc_status | text | ✓ |
| kyc_verified_date | date | ✓ |
| kyc_documents | jsonb | ✓ |
| preferred_payment_mode | text | ✓ |
| preferred_delivery_time | text | ✓ |
| prefer_sms | boolean | ✓ |
| prefer_email | boolean | ✓ |
| prefer_whatsapp | boolean | ✓ |
| first_transaction_date | date | ✓ |
| last_transaction_date | date | ✓ |
| total_business_amount | numeric | ✓ |
| total_transactions | integer | ✓ |
| average_order_value | numeric | ✓ |
| is_active | boolean | ✓ |
| blacklisted | boolean | ✓ |
| blacklist_reason | text | ✓ |
| blacklist_date | date | ✓ |
| loyalty_points | numeric | ✓ |
| loyalty_tier | text | ✓ |
| internal_notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### parties.routes

| Column | Type | Nullable |
|--------|------|----------|
| route_id | integer | ✗ |
| org_id | uuid | ✗ |
| territory_id | integer | ✓ |
| route_code | text | ✗ |
| route_name | text | ✗ |
| route_type | text | ✗ |
| visit_days | ARRAY | ✓ |
| visit_frequency | text | ✓ |
| assigned_to_id | integer | ✓ |
| vehicle_required | boolean | ✓ |
| total_distance_km | numeric | ✓ |
| average_time_hours | numeric | ✓ |
| customer_count | integer | ✓ |
| customer_sequence | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### parties.supplier_contacts

| Column | Type | Nullable |
|--------|------|----------|
| contact_id | integer | ✗ |
| supplier_id | integer | ✗ |
| contact_name | text | ✗ |
| designation | text | ✓ |
| department | text | ✓ |
| mobile_number | text | ✓ |
| phone_number | text | ✓ |
| email | text | ✓ |
| is_primary_contact | boolean | ✓ |
| contact_for | ARRAY | ✓ |
| can_negotiate_prices | boolean | ✓ |
| can_approve_returns | boolean | ✓ |
| max_discount_authority | numeric | ✓ |
| notes | text | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### parties.suppliers

| Column | Type | Nullable |
|--------|------|----------|
| supplier_id | integer | ✗ |
| org_id | uuid | ✗ |
| supplier_code | text | ✗ |
| supplier_name | text | ✗ |
| supplier_type | text | ✗ |
| primary_phone | text | ✗ |
| primary_email | text | ✓ |
| secondary_phone | text | ✓ |
| contact_person_name | text | ✓ |
| contact_person_phone | text | ✓ |
| gst_number | text | ✓ |
| pan_number | text | ✓ |
| drug_license_number | text | ✓ |
| drug_license_validity | date | ✓ |
| establishment_year | integer | ✓ |
| payment_days | integer | ✓ |
| preferred_payment_mode | text | ✓ |
| early_payment_discount | numeric | ✓ |
| late_payment_penalty | numeric | ✓ |
| supplier_category | text | ✓ |
| supplier_grade | text | ✓ |
| product_categories | ARRAY | ✓ |
| brand_authorizations | ARRAY | ✓ |
| compliance_rating | text | ✓ |
| quality_rating | numeric | ✓ |
| delivery_rating | numeric | ✓ |
| vendor_documents | jsonb | ✓ |
| bank_name | text | ✓ |
| account_number | text | ✓ |
| ifsc_code | text | ✓ |
| account_type | text | ✓ |
| account_holder_name | text | ✓ |
| credit_limit_given | numeric | ✓ |
| current_outstanding | numeric | ✓ |
| first_purchase_date | date | ✓ |
| last_purchase_date | date | ✓ |
| total_purchase_amount | numeric | ✓ |
| total_purchases | integer | ✓ |
| average_order_value | numeric | ✓ |
| return_rate_percentage | numeric | ✓ |
| quality_issue_count | integer | ✓ |
| is_active | boolean | ✓ |
| is_approved | boolean | ✓ |
| approved_date | date | ✓ |
| approved_by | integer | ✓ |
| blacklisted | boolean | ✓ |
| blacklist_reason | text | ✓ |
| blacklist_date | date | ✓ |
| internal_notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| website | text | ✓ |

### parties.territories

| Column | Type | Nullable |
|--------|------|----------|
| territory_id | integer | ✗ |
| org_id | uuid | ✗ |
| territory_code | text | ✗ |
| territory_name | text | ✗ |
| territory_type | text | ✗ |
| parent_territory_id | integer | ✓ |
| territory_path | text | ✓ |
| geographic_data | jsonb | ✓ |
| territory_manager_id | integer | ✓ |
| sales_team_ids | ARRAY | ✓ |
| monthly_target | numeric | ✓ |
| quarterly_target | numeric | ✓ |
| annual_target | numeric | ✓ |
| current_month_achievement | numeric | ✓ |
| current_quarter_achievement | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

---

## procurement

Tables: 14

### procurement.branch_budgets

| Column | Type | Nullable |
|--------|------|----------|
| budget_id | integer | ✗ |
| org_id | integer | ✗ |
| branch_id | integer | ✗ |
| budget_month | integer | ✗ |
| budget_year | integer | ✗ |
| budget_amount | numeric | ✗ |
| is_active | boolean | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp without time zone | ✓ |

### procurement.goods_receipt_notes

| Column | Type | Nullable |
|--------|------|----------|
| grn_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| grn_number | text | ✗ |
| grn_date | date | ✗ |
| grn_type | text | ✓ |
| purchase_order_id | integer | ✓ |
| supplier_id | integer | ✓ |
| supplier_invoice_number | text | ✓ |
| supplier_invoice_date | date | ✓ |
| supplier_challan_number | text | ✓ |
| supplier_challan_date | date | ✓ |
| received_by | integer | ✗ |
| received_at | timestamp with time zone | ✓ |
| storage_location_id | integer | ✓ |
| transport_mode | text | ✓ |
| vehicle_number | text | ✓ |
| lr_number | text | ✓ |
| lr_date | date | ✓ |
| qc_required | boolean | ✓ |
| qc_status | text | ✓ |
| qc_completed_by | integer | ✓ |
| qc_completed_at | timestamp with time zone | ✓ |
| qc_notes | text | ✓ |
| supplier_amount | numeric | ✓ |
| calculated_amount | numeric | ✓ |
| variance_amount | numeric | ✓ |
| grn_status | text | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| stock_updated | boolean | ✓ |
| stock_updated_at | timestamp with time zone | ✓ |
| notes | text | ✓ |
| rejection_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### procurement.grn_items

| Column | Type | Nullable |
|--------|------|----------|
| grn_item_id | integer | ✗ |
| grn_id | integer | ✗ |
| po_item_id | integer | ✓ |
| product_id | integer | ✗ |
| batch_number | text | ✗ |
| manufacturing_date | date | ✓ |
| expiry_date | date | ✗ |
| ordered_quantity | numeric | ✓ |
| received_quantity | numeric | ✗ |
| accepted_quantity | numeric | ✓ |
| rejected_quantity | numeric | ✓ |
| free_quantity | numeric | ✓ |
| uom | text | ✗ |
| pack_type | text | ✗ |
| pack_size | integer | ✓ |
| unit_price | numeric | ✓ |
| mrp | numeric | ✗ |
| ptr | numeric | ✓ |
| pts | numeric | ✓ |
| ptr_margin_percent | numeric | ✓ |
| pts_margin_percent | numeric | ✓ |
| qc_status | text | ✓ |
| qc_notes | text | ✓ |
| rejection_reason | text | ✓ |
| storage_location_id | integer | ✓ |
| item_status | text | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| quantity_returned | numeric | ✓ |

### procurement.purchase_order_items

| Column | Type | Nullable |
|--------|------|----------|
| po_item_id | integer | ✗ |
| purchase_order_id | integer | ✗ |
| product_id | integer | ✗ |
| product_name | text | ✗ |
| manufacturer | text | ✓ |
| hsn_code | text | ✓ |
| ordered_quantity | numeric | ✗ |
| uom | text | ✗ |
| pack_type | text | ✗ |
| pack_size | integer | ✓ |
| base_quantity | numeric | ✓ |
| free_quantity | numeric | ✓ |
| scheme_details | text | ✓ |
| unit_price | numeric | ✗ |
| mrp | numeric | ✓ |
| discount_percent | numeric | ✓ |
| discount_amount | numeric | ✓ |
| taxable_amount | numeric | ✓ |
| tax_percent | numeric | ✓ |
| tax_amount | numeric | ✓ |
| line_total | numeric | ✗ |
| received_quantity | numeric | ✓ |
| pending_quantity | numeric | ✓ |
| cancelled_quantity | numeric | ✓ |
| bonus_quantity | numeric | ✓ |
| item_status | text | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| batch_number | character varying | ✓ |
| expiry_date | date | ✓ |
| selling_price | numeric | ✓ |

### procurement.purchase_orders

| Column | Type | Nullable |
|--------|------|----------|
| purchase_order_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| po_number | text | ✗ |
| po_date | date | ✗ |
| po_type | text | ✓ |
| supplier_id | integer | ✗ |
| supplier_name | text | ✗ |
| supplier_reference | text | ✓ |
| expected_delivery_date | date | ✓ |
| delivery_location_id | integer | ✓ |
| delivery_terms | text | ✓ |
| payment_terms | text | ✓ |
| payment_days | integer | ✓ |
| due_date | date | ✓ |
| subtotal_amount | numeric | ✓ |
| discount_amount | numeric | ✓ |
| taxable_amount | numeric | ✓ |
| tax_amount | numeric | ✓ |
| other_charges | numeric | ✓ |
| round_off_amount | numeric | ✓ |
| total_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| po_status | text | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| items_count | integer | ✓ |
| items_received | integer | ✓ |
| receipt_status | text | ✓ |
| sent_to_supplier | boolean | ✓ |
| sent_date | timestamp with time zone | ✓ |
| acknowledged_by_supplier | boolean | ✓ |
| acknowledged_date | timestamp with time zone | ✓ |
| notes | text | ✓ |
| internal_notes | text | ✓ |
| terms_and_conditions | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### procurement.purchase_requisition_items

| Column | Type | Nullable |
|--------|------|----------|
| requisition_item_id | integer | ✗ |
| requisition_id | integer | ✗ |
| product_id | integer | ✗ |
| requested_quantity | numeric | ✗ |
| uom | text | ✗ |
| current_stock | numeric | ✓ |
| reorder_level | numeric | ✓ |
| suggested_supplier_id | integer | ✓ |
| last_purchase_price | numeric | ✓ |
| approved_quantity | numeric | ✓ |
| item_status | text | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### procurement.purchase_requisitions

| Column | Type | Nullable |
|--------|------|----------|
| requisition_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| requisition_number | text | ✗ |
| requisition_date | date | ✗ |
| required_by_date | date | ✓ |
| requested_by | integer | ✗ |
| department | text | ✓ |
| requisition_type | text | ✓ |
| priority | text | ✓ |
| approval_status | text | ✓ |
| current_approver_id | integer | ✓ |
| approval_history | jsonb | ✓ |
| requisition_status | text | ✓ |
| converted_to_po | boolean | ✓ |
| po_ids | ARRAY | ✓ |
| purpose | text | ✓ |
| notes | text | ✓ |
| rejection_reason | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### procurement.purchase_return_items

| Column | Type | Nullable |
|--------|------|----------|
| return_item_id | integer | ✗ |
| return_id | integer | ✗ |
| grn_item_id | integer | ✓ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✗ |
| return_quantity | numeric | ✗ |
| uom | text | ✗ |
| unit_price | numeric | ✓ |
| return_value | numeric | ✓ |
| tax_amount | numeric | ✓ |
| item_return_reason | text | ✓ |
| item_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| disposition | text | ✓ |
| damaged_quantity | numeric | ✓ |
| saleable_quantity | numeric | ✓ |
| supplier_invoice_item_id | integer | ✓ |

### procurement.purchase_returns

| Column | Type | Nullable |
|--------|------|----------|
| return_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| return_number | text | ✗ |
| return_date | date | ✗ |
| return_type | text | ✗ |
| grn_id | integer | ✓ |
| supplier_invoice_id | integer | ✓ |
| supplier_id | integer | ✗ |
| return_reason | text | ✗ |
| detailed_reason | text | ✓ |
| approval_required | boolean | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| return_amount | numeric | ✓ |
| tax_amount | numeric | ✓ |
| total_amount | numeric | ✓ |
| debit_note_number | text | ✓ |
| debit_note_date | date | ✓ |
| debit_note_status | text | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| supplier_acknowledged | boolean | ✓ |
| supplier_acknowledgment_date | date | ✓ |
| supplier_credit_note_number | text | ✓ |
| dispatch_date | date | ✓ |
| transport_details | jsonb | ✓ |
| adjustment_type | text | ✓ |
| adjusted_amount | numeric | ✓ |
| pending_amount | numeric | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### procurement.supplier_invoice_items

| Column | Type | Nullable |
|--------|------|----------|
| invoice_item_id | integer | ✗ |
| supplier_invoice_id | integer | ✗ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| quantity | numeric | ✗ |
| free_quantity | numeric | ✓ |
| unit_price | numeric | ✗ |
| discount_percent | numeric | ✓ |
| discount_amount | numeric | ✓ |
| taxable_amount | numeric | ✗ |
| cgst_percent | numeric | ✓ |
| sgst_percent | numeric | ✓ |
| igst_percent | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| total_amount | numeric | ✗ |
| hsn_code | text | ✓ |
| unit | text | ✓ |
| pack_type | text | ✓ |
| pack_size | integer | ✓ |
| quantity_returned | numeric | ✓ |
| grn_item_id | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### procurement.supplier_invoices

| Column | Type | Nullable |
|--------|------|----------|
| supplier_invoice_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| supplier_invoice_number | text | ✗ |
| invoice_date | date | ✗ |
| supplier_id | integer | ✗ |
| purchase_order_ids | ARRAY | ✓ |
| grn_ids | ARRAY | ✓ |
| subtotal_amount | numeric | ✗ |
| discount_amount | numeric | ✓ |
| taxable_amount | numeric | ✗ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| tax_amount | numeric | ✗ |
| freight_charges | numeric | ✓ |
| insurance_charges | numeric | ✓ |
| other_charges | numeric | ✓ |
| round_off_amount | numeric | ✓ |
| invoice_total | numeric | ✗ |
| tds_applicable | boolean | ✓ |
| tds_percent | numeric | ✓ |
| tds_amount | numeric | ✓ |
| payment_terms | text | ✓ |
| due_date | date | ✓ |
| payment_status | text | ✓ |
| paid_amount | numeric | ✓ |
| gstr2a_matched | boolean | ✓ |
| gstr2a_match_date | date | ✓ |
| itc_eligible | boolean | ✓ |
| matching_status | text | ✓ |
| invoice_status | text | ✓ |
| verified_by | integer | ✓ |
| verified_at | timestamp with time zone | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| notes | text | ✓ |
| rejection_reason | text | ✓ |
| invoice_document_path | text | ✓ |
| supporting_documents | jsonb | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### procurement.supplier_quotation_items

| Column | Type | Nullable |
|--------|------|----------|
| quotation_item_id | integer | ✗ |
| quotation_id | integer | ✗ |
| product_id | integer | ✗ |
| quantity | numeric | ✗ |
| uom | text | ✗ |
| unit_price | numeric | ✗ |
| discount_percent | numeric | ✓ |
| free_quantity | numeric | ✓ |
| tax_percent | numeric | ✓ |
| line_total | numeric | ✓ |
| is_best_price | boolean | ✓ |
| price_variance_percent | numeric | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### procurement.supplier_quotations

| Column | Type | Nullable |
|--------|------|----------|
| quotation_id | integer | ✗ |
| org_id | uuid | ✗ |
| quotation_number | text | ✗ |
| quotation_date | date | ✗ |
| supplier_id | integer | ✗ |
| requisition_id | integer | ✓ |
| rfq_number | text | ✓ |
| valid_until | date | ✓ |
| payment_terms | text | ✓ |
| delivery_terms | text | ✓ |
| other_terms | text | ✓ |
| total_amount | numeric | ✓ |
| quotation_status | text | ✓ |
| is_best_price | boolean | ✓ |
| price_rank | integer | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### procurement.vendor_performance

| Column | Type | Nullable |
|--------|------|----------|
| performance_id | integer | ✗ |
| org_id | uuid | ✗ |
| supplier_id | integer | ✗ |
| evaluation_period | text | ✗ |
| period_start | date | ✗ |
| period_end | date | ✗ |
| total_orders | integer | ✓ |
| on_time_deliveries | integer | ✓ |
| late_deliveries | integer | ✓ |
| on_time_delivery_percent | numeric | ✓ |
| total_items_received | integer | ✓ |
| items_rejected | integer | ✓ |
| rejection_rate_percent | numeric | ✓ |
| quality_issues_count | integer | ✓ |
| total_purchase_value | numeric | ✓ |
| invoice_accuracy_percent | numeric | ✓ |
| payment_term_adherence | numeric | ✓ |
| return_count | integer | ✓ |
| return_value | numeric | ✓ |
| return_rate_percent | numeric | ✓ |
| delivery_rating | numeric | ✓ |
| quality_rating | numeric | ✓ |
| price_rating | numeric | ✓ |
| service_rating | numeric | ✓ |
| overall_rating | numeric | ✓ |
| evaluation_status | text | ✓ |
| reviewed_by | integer | ✓ |
| reviewed_at | timestamp with time zone | ✓ |
| review_notes | text | ✓ |
| improvement_areas | ARRAY | ✓ |
| action_required | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

---

## sales

Tables: 27

### sales.credit_note_applications

| Column | Type | Nullable |
|--------|------|----------|
| application_id | integer | ✗ |
| credit_note_id | integer | ✗ |
| invoice_id | integer | ✗ |
| applied_amount | numeric | ✗ |
| application_date | date | ✗ |
| created_by | integer | ✗ |
| created_at | timestamp with time zone | ✓ |

### sales.credit_notes

| Column | Type | Nullable |
|--------|------|----------|
| credit_note_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| credit_note_number | text | ✗ |
| credit_note_date | date | ✗ |
| customer_id | integer | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| reference_number | text | ✓ |
| credit_amount | numeric | ✗ |
| tax_amount | numeric | ✓ |
| total_amount | numeric | ✗ |
| reason_code | text | ✗ |
| reason | text | ✗ |
| notes | text | ✓ |
| is_gst_applicable | boolean | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| status | text | ✓ |
| approved_by | integer | ✓ |
| approved_date | timestamp with time zone | ✓ |
| applied_amount | numeric | ✓ |
| remaining_amount | numeric | ✓ |
| items_detail | jsonb | ✓ |
| created_by | integer | ✗ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.customer_visits

| Column | Type | Nullable |
|--------|------|----------|
| visit_id | integer | ✗ |
| org_id | uuid | ✗ |
| visit_date | date | ✗ |
| visit_time | time without time zone | ✓ |
| customer_id | integer | ✗ |
| visited_by | integer | ✗ |
| route_id | integer | ✓ |
| visit_purpose | text | ✗ |
| visit_outcome | text | ✓ |
| order_id | integer | ✓ |
| collection_amount | numeric | ✓ |
| check_in_time | timestamp with time zone | ✓ |
| check_out_time | timestamp with time zone | ✓ |
| visit_location | jsonb | ✓ |
| visit_notes | text | ✓ |
| follow_up_required | boolean | ✓ |
| follow_up_date | date | ✓ |
| follow_up_notes | text | ✓ |
| visit_photos | jsonb | ✓ |
| visit_status | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.debit_notes

| Column | Type | Nullable |
|--------|------|----------|
| debit_note_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| debit_note_number | text | ✗ |
| debit_note_date | date | ✗ |
| customer_id | integer | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| reference_number | text | ✓ |
| debit_amount | numeric | ✗ |
| tax_amount | numeric | ✓ |
| total_amount | numeric | ✗ |
| reason_code | text | ✗ |
| reason | text | ✗ |
| notes | text | ✓ |
| is_gst_applicable | boolean | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| status | text | ✓ |
| approved_by | integer | ✓ |
| approved_date | timestamp with time zone | ✓ |
| paid_amount | numeric | ✓ |
| payment_status | text | ✓ |
| items_detail | jsonb | ✓ |
| created_by | integer | ✗ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.delivery_challan_items

| Column | Type | Nullable |
|--------|------|----------|
| challan_item_id | integer | ✗ |
| challan_id | integer | ✗ |
| order_item_id | integer | ✓ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| ordered_quantity | numeric | ✓ |
| dispatched_quantity | numeric | ✗ |
| delivered_quantity | numeric | ✓ |
| returned_quantity | numeric | ✓ |
| damaged_quantity | numeric | ✓ |
| uom | text | ✗ |
| pack_type | text | ✗ |
| item_status | text | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| unit_price | numeric | ✓ |

### sales.delivery_challans

| Column | Type | Nullable |
|--------|------|----------|
| challan_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| challan_number | text | ✗ |
| challan_date | date | ✗ |
| challan_type | text | ✓ |
| order_id | integer | ✓ |
| invoice_id | integer | ✓ |
| customer_id | integer | ✗ |
| delivery_address_id | integer | ✓ |
| dispatch_date | date | ✓ |
| dispatch_time | time without time zone | ✓ |
| dispatch_address_id | integer | ✓ |
| transport_mode | text | ✓ |
| transporter_name | text | ✓ |
| vehicle_number | text | ✓ |
| lr_number | text | ✓ |
| lr_date | date | ✓ |
| freight_charges | numeric | ✓ |
| eway_bill_required | boolean | ✓ |
| eway_bill_number | text | ✓ |
| eway_bill_date | date | ✓ |
| eway_bill_validity_days | integer | ✓ |
| eway_bill_data | jsonb | ✓ |
| total_quantity | numeric | ✓ |
| total_amount | numeric | ✓ |
| challan_status | text | ✓ |
| delivery_status | text | ✓ |
| delivered_date | date | ✓ |
| delivered_time | time without time zone | ✓ |
| received_by | text | ✓ |
| delivery_notes | text | ✓ |
| pod_document | text | ✓ |
| is_returnable | boolean | ✓ |
| return_by_date | date | ✓ |
| return_status | text | ✓ |
| notes | text | ✓ |
| internal_notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |
| taxable_amount | numeric | ✓ |
| gst_amount | numeric | ✓ |

### sales.delivery_tracking

| Column | Type | Nullable |
|--------|------|----------|
| tracking_id | integer | ✗ |
| challan_id | integer | ✗ |
| status | text | ✗ |
| location | text | ✓ |
| timestamp | timestamp with time zone | ✗ |
| gps_latitude | numeric | ✓ |
| gps_longitude | numeric | ✓ |
| notes | text | ✓ |
| updated_by | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### sales.eway_bills

| Column | Type | Nullable |
|--------|------|----------|
| eway_bill_id | integer | ✗ |
| challan_id | integer | ✓ |
| eway_bill_number | text | ✗ |
| supply_type | text | ✗ |
| sub_type | text | ✗ |
| document_type | text | ✗ |
| document_number | text | ✗ |
| document_date | date | ✗ |
| from_gstin | text | ✓ |
| to_gstin | text | ✓ |
| transport_mode | text | ✗ |
| transport_distance | integer | ✓ |
| transporter_name | text | ✓ |
| transporter_id | text | ✓ |
| vehicle_number | text | ✓ |
| valid_until | timestamp with time zone | ✗ |
| status | text | ✗ |
| generated_date | timestamp with time zone | ✓ |

### sales.invoice_items

| Column | Type | Nullable |
|--------|------|----------|
| invoice_item_id | integer | ✗ |
| invoice_id | integer | ✗ |
| order_item_id | integer | ✓ |
| product_id | integer | ✗ |
| product_name | text | ✗ |
| product_description | text | ✓ |
| hsn_code | text | ✓ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| manufacturing_date | date | ✓ |
| expiry_date | date | ✓ |
| quantity | numeric | ✗ |
| uom | text | ✗ |
| pack_type | text | ✗ |
| pack_size | integer | ✓ |
| base_quantity | numeric | ✓ |
| mrp | numeric | ✓ |
| unit_price | numeric | ✗ |
| discount_percent | numeric | ✓ |
| discount_amount | numeric | ✓ |
| taxable_amount | numeric | ✓ |
| igst_rate | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cgst_rate | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_rate | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_rate | numeric | ✓ |
| cess_amount | numeric | ✓ |
| total_tax_amount | numeric | ✓ |
| line_total | numeric | ✗ |
| is_free_item | boolean | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| free_quantity | numeric | ✓ |
| item_id | integer | ✗ |
| quantity_returned | numeric | ✓ |

### sales.invoices

| Column | Type | Nullable |
|--------|------|----------|
| invoice_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| invoice_number | text | ✗ |
| invoice_date | date | ✗ |
| invoice_type | text | ✓ |
| order_id | integer | ✓ |
| challan_ids | ARRAY | ✓ |
| customer_id | integer | ✗ |
| customer_name | text | ✗ |
| billing_address_id | integer | ✓ |
| shipping_address_id | integer | ✓ |
| place_of_supply | text | ✓ |
| reverse_charge | boolean | ✓ |
| subtotal_amount | numeric | ✓ |
| discount_amount | numeric | ✓ |
| scheme_discount | numeric | ✓ |
| taxable_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| total_tax_amount | numeric | ✓ |
| freight_charges | numeric | ✓ |
| insurance_charges | numeric | ✓ |
| other_charges | numeric | ✓ |
| round_off_amount | numeric | ✓ |
| final_amount | numeric | ✓ |
| amount_in_words | text | ✓ |
| payment_terms | text | ✓ |
| due_date | date | ✓ |
| payment_status | text | ✓ |
| paid_amount | numeric | ✓ |
| einvoice_required | boolean | ✓ |
| irn | text | ✓ |
| irn_generated_date | timestamp with time zone | ✓ |
| qr_code | text | ✓ |
| ack_number | text | ✓ |
| ack_date | timestamp with time zone | ✓ |
| invoice_status | text | ✓ |
| cancellation_reason | text | ✓ |
| cancelled_date | date | ✓ |
| notes | text | ✓ |
| internal_notes | text | ✓ |
| terms_and_conditions | text | ✓ |
| bank_account_id | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| posted_by | integer | ✓ |
| posted_at | timestamp with time zone | ✓ |
| items_count | integer | ✓ |
| total_quantity | numeric | ✓ |
| loyalty_points_used | integer | ✓ |
| loyalty_discount | numeric | ✓ |
| credit_amount | numeric | ✓ |
| allocated_amount | numeric | ✓ |
| unallocated_amount | numeric | ✓ |

### sales.loyalty_programs

| Column | Type | Nullable |
|--------|------|----------|
| program_id | integer | ✗ |
| org_id | uuid | ✗ |
| program_name | text | ✗ |
| description | text | ✓ |
| points_per_rupee | numeric | ✓ |
| redemption_ratio | numeric | ✓ |
| min_purchase_amount | numeric | ✓ |
| min_redemption_points | integer | ✓ |
| max_redemption_percentage | numeric | ✓ |
| points_validity_days | integer | ✓ |
| tier_based | boolean | ✓ |
| is_active | boolean | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.loyalty_tiers

| Column | Type | Nullable |
|--------|------|----------|
| tier_id | integer | ✗ |
| program_id | integer | ✓ |
| tier_name | text | ✗ |
| min_points_required | integer | ✗ |
| points_multiplier | numeric | ✓ |
| additional_benefits | text | ✓ |

### sales.loyalty_transactions

| Column | Type | Nullable |
|--------|------|----------|
| transaction_id | integer | ✗ |
| program_id | integer | ✓ |
| customer_id | integer | ✓ |
| transaction_type | text | ✗ |
| points | integer | ✗ |
| reference_type | text | ✓ |
| reference_id | integer | ✓ |
| remarks | text | ✓ |
| expiry_date | date | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### sales.order_items

| Column | Type | Nullable |
|--------|------|----------|
| order_item_id | integer | ✗ |
| order_id | integer | ✗ |
| product_id | integer | ✗ |
| product_name | text | ✓ |
| hsn_code | text | ✓ |
| quantity | numeric | ✗ |
| uom | text | ✓ |
| pack_type | text | ✓ |
| pack_size | integer | ✓ |
| base_quantity | numeric | ✓ |
| unit_price | numeric | ✗ |
| mrp | numeric | ✓ |
| discount_percent | numeric | ✓ |
| discount_amount | numeric | ✓ |
| scheme_discount_percent | numeric | ✓ |
| scheme_discount_amount | numeric | ✓ |
| free_quantity | numeric | ✓ |
| scheme_code | text | ✓ |
| taxable_amount | numeric | ✓ |
| tax_percent | numeric | ✓ |
| tax_amount | numeric | ✓ |
| igst_percent | numeric | ✓ |
| cgst_percent | numeric | ✓ |
| sgst_percent | numeric | ✓ |
| cess_percent | numeric | ✓ |
| line_total | numeric | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| batch_expiry | date | ✓ |
| ordered_quantity | numeric | ✓ |
| delivered_quantity | numeric | ✓ |
| pending_quantity | numeric | ✓ |
| cancelled_quantity | numeric | ✓ |
| item_status | text | ✓ |
| item_notes | text | ✓ |
| display_order | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| cgst_rate | numeric | ✓ |
| sgst_rate | numeric | ✓ |
| igst_rate | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cess_rate | numeric | ✓ |
| cess_amount | numeric | ✓ |
| delivery_status | text | ✓ |
| notes | text | ✓ |
| product_code | text | ✓ |

### sales.orders

| Column | Type | Nullable |
|--------|------|----------|
| order_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| order_number | text | ✗ |
| order_date | date | ✗ |
| order_type | text | ✗ |
| customer_id | integer | ✗ |
| customer_po_number | text | ✓ |
| customer_po_date | date | ✓ |
| delivery_date | date | ✓ |
| delivery_priority | text | ✓ |
| delivery_address_id | integer | ✓ |
| delivery_instructions | text | ✓ |
| salesperson_id | integer | ✓ |
| territory_id | integer | ✓ |
| route_id | integer | ✓ |
| price_list_id | integer | ✓ |
| currency_code | text | ✓ |
| subtotal_amount | numeric | ✓ |
| discount_amount | numeric | ✓ |
| scheme_discount | numeric | ✓ |
| taxable_amount | numeric | ✓ |
| tax_amount | numeric | ✓ |
| round_off_amount | numeric | ✓ |
| final_amount | numeric | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| cess_amount | numeric | ✓ |
| order_status | text | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| payment_terms | text | ✓ |
| payment_status | text | ✓ |
| fulfillment_status | text | ✓ |
| items_count | integer | ✓ |
| items_delivered | integer | ✓ |
| notes | text | ✓ |
| internal_notes | text | ✓ |
| tags | ARRAY | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |
| updated_by | integer | ✓ |
| paid_amount | numeric | ✓ |
| confirmed_at | timestamp with time zone | ✓ |
| delivered_at | timestamp with time zone | ✓ |
| customer_name | text | ✓ |
| customer_phone | text | ✓ |
| balance_amount | numeric | ✓ |
| payment_mode | text | ✓ |
| eway_bill_number | text | ✓ |
| pod_recorded | boolean | ✓ |
| last_tracking_update | timestamp with time zone | ✓ |
| expected_delivery_date | date | ✓ |
| delivery_area | text | ✓ |

### sales.price_list_items

| Column | Type | Nullable |
|--------|------|----------|
| price_list_item_id | integer | ✗ |
| price_list_id | integer | ✗ |
| product_id | integer | ✗ |
| base_unit_price | numeric | ✓ |
| pack_unit_price | numeric | ✓ |
| box_unit_price | numeric | ✓ |
| case_unit_price | numeric | ✓ |
| mrp | numeric | ✓ |
| ptr_margin_percent | numeric | ✓ |
| pts_margin_percent | numeric | ✓ |
| min_order_quantity | numeric | ✓ |
| min_order_pack_type | text | ✓ |
| max_discount_percent | numeric | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.price_lists

| Column | Type | Nullable |
|--------|------|----------|
| price_list_id | integer | ✗ |
| org_id | uuid | ✗ |
| price_list_name | text | ✗ |
| price_list_type | text | ✗ |
| currency_code | text | ✓ |
| effective_from | date | ✗ |
| effective_until | date | ✓ |
| applicable_branches | ARRAY | ✓ |
| applicable_territories | ARRAY | ✓ |
| applicable_customer_groups | ARRAY | ✓ |
| parent_price_list_id | integer | ✓ |
| adjustment_type | text | ✓ |
| adjustment_value | numeric | ✓ |
| requires_approval | boolean | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_date | date | ✓ |
| is_active | boolean | ✓ |
| is_default | boolean | ✓ |
| description | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### sales.promotional_schemes

| Column | Type | Nullable |
|--------|------|----------|
| scheme_id | integer | ✗ |
| org_id | uuid | ✗ |
| scheme_code | text | ✗ |
| scheme_name | text | ✗ |
| scheme_type | text | ✗ |
| description | text | ✓ |
| start_date | date | ✗ |
| end_date | date | ✗ |
| is_active | boolean | ✓ |
| discount_percentage | numeric | ✓ |
| discount_amount | numeric | ✓ |
| buy_quantity | integer | ✓ |
| get_quantity | integer | ✓ |
| min_bill_value | numeric | ✓ |
| max_discount_amount | numeric | ✓ |
| max_uses_per_customer | integer | ✓ |
| can_combine | boolean | ✓ |
| priority | integer | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### sales.proof_of_delivery

| Column | Type | Nullable |
|--------|------|----------|
| pod_id | integer | ✗ |
| challan_id | integer | ✗ |
| customer_id | integer | ✓ |
| delivered_date | date | ✗ |
| delivered_time | time without time zone | ✓ |
| received_by_name | text | ✗ |
| received_by_designation | text | ✓ |
| received_by_phone | text | ✓ |
| delivery_location | text | ✓ |
| delivery_notes | text | ✓ |
| signature_image | text | ✓ |
| delivery_photo | text | ✓ |
| gps_latitude | numeric | ✓ |
| gps_longitude | numeric | ✓ |
| delivery_rating | integer | ✓ |
| created_date | timestamp with time zone | ✓ |

### sales.sales_return_items

| Column | Type | Nullable |
|--------|------|----------|
| return_item_id | integer | ✗ |
| return_id | integer | ✗ |
| invoice_item_id | integer | ✓ |
| product_id | integer | ✗ |
| batch_id | integer | ✓ |
| batch_number | text | ✓ |
| return_quantity | numeric | ✗ |
| uom | text | ✗ |
| damaged_quantity | numeric | ✓ |
| saleable_quantity | numeric | ✓ |
| unit_price | numeric | ✓ |
| return_value | numeric | ✓ |
| tax_amount | numeric | ✓ |
| item_return_reason | text | ✓ |
| disposition | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### sales.sales_returns

| Column | Type | Nullable |
|--------|------|----------|
| return_id | integer | ✗ |
| org_id | uuid | ✗ |
| branch_id | integer | ✗ |
| return_number | text | ✗ |
| return_date | date | ✗ |
| return_type | text | ✗ |
| invoice_id | integer | ✓ |
| challan_id | integer | ✓ |
| customer_id | integer | ✗ |
| return_reason | text | ✗ |
| return_category | text | ✓ |
| approval_required | boolean | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_at | timestamp with time zone | ✓ |
| return_amount | numeric | ✓ |
| tax_amount | numeric | ✓ |
| total_amount | numeric | ✓ |
| credit_note_number | text | ✓ |
| credit_note_date | date | ✓ |
| credit_note_status | text | ✓ |
| igst_amount | numeric | ✓ |
| cgst_amount | numeric | ✓ |
| sgst_amount | numeric | ✓ |
| adjustment_type | text | ✓ |
| adjusted_amount | numeric | ✓ |
| pending_amount | numeric | ✓ |
| goods_received_date | date | ✓ |
| goods_received_by | integer | ✓ |
| quality_check_status | text | ✓ |
| notes | text | ✓ |
| internal_notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### sales.sales_schemes

| Column | Type | Nullable |
|--------|------|----------|
| scheme_id | integer | ✗ |
| org_id | uuid | ✗ |
| scheme_code | text | ✗ |
| scheme_name | text | ✗ |
| scheme_type | text | ✗ |
| start_date | date | ✗ |
| end_date | date | ✗ |
| applicable_branches | ARRAY | ✓ |
| applicable_territories | ARRAY | ✓ |
| applicable_customers | ARRAY | ✓ |
| applicable_customer_types | ARRAY | ✓ |
| scheme_rules | jsonb | ✗ |
| applicable_products | ARRAY | ✓ |
| applicable_categories | ARRAY | ✓ |
| scheme_budget | numeric | ✓ |
| utilized_budget | numeric | ✓ |
| max_benefit_per_order | numeric | ✓ |
| approval_status | text | ✓ |
| approved_by | integer | ✓ |
| approved_date | date | ✓ |
| is_active | boolean | ✓ |
| can_combine | boolean | ✓ |
| total_orders | integer | ✓ |
| total_discount_given | numeric | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### sales.sales_targets

| Column | Type | Nullable |
|--------|------|----------|
| target_id | integer | ✗ |
| org_id | uuid | ✗ |
| target_year | integer | ✗ |
| target_month | integer | ✓ |
| target_quarter | integer | ✓ |
| period_type | text | ✗ |
| target_type | text | ✗ |
| target_entity_id | integer | ✗ |
| revenue_target | numeric | ✓ |
| quantity_target | numeric | ✓ |
| new_customer_target | integer | ✓ |
| visit_target | integer | ✓ |
| revenue_achieved | numeric | ✓ |
| quantity_achieved | numeric | ✓ |
| new_customers_achieved | integer | ✓ |
| visits_achieved | integer | ✓ |
| revenue_achievement_percent | numeric | ✓ |
| overall_achievement_percent | numeric | ✓ |
| incentive_percentage | numeric | ✓ |
| calculated_incentive | numeric | ✓ |
| status | text | ✓ |
| notes | text | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### sales.scheme_customers

| Column | Type | Nullable |
|--------|------|----------|
| scheme_id | integer | ✗ |
| customer_id | integer | ✗ |

### sales.scheme_products

| Column | Type | Nullable |
|--------|------|----------|
| scheme_id | integer | ✗ |
| product_id | integer | ✗ |

### sales.scheme_usage

| Column | Type | Nullable |
|--------|------|----------|
| usage_id | integer | ✗ |
| scheme_id | integer | ✓ |
| invoice_id | integer | ✓ |
| customer_id | integer | ✓ |
| usage_date | date | ✗ |
| discount_given | numeric | ✓ |
| free_items_data | jsonb | ✓ |
| created_at | timestamp with time zone | ✓ |

### sales.scheme_volume_slabs

| Column | Type | Nullable |
|--------|------|----------|
| slab_id | integer | ✗ |
| scheme_id | integer | ✓ |
| min_quantity | numeric | ✗ |
| max_quantity | numeric | ✓ |
| discount_percentage | numeric | ✓ |
| discount_amount | numeric | ✓ |

---

## system_config

Tables: 22

### system_config.api_logs

| Column | Type | Nullable |
|--------|------|----------|
| log_id | integer | ✗ |
| request_id | uuid | ✓ |
| user_id | integer | ✓ |
| endpoint | text | ✓ |
| method | text | ✓ |
| status | text | ✓ |
| started_at | timestamp without time zone | ✓ |
| completed_at | timestamp without time zone | ✓ |
| response_code | integer | ✓ |
| error_message | text | ✓ |
| created_at | timestamp without time zone | ✓ |

### system_config.api_usage_log

| Column | Type | Nullable |
|--------|------|----------|
| log_id | bigint | ✗ |
| org_id | uuid | ✓ |
| endpoint | text | ✗ |
| method | text | ✗ |
| user_id | integer | ✓ |
| ip_address | inet | ✓ |
| user_agent | text | ✓ |
| request_timestamp | timestamp with time zone | ✓ |
| response_time_ms | integer | ✓ |
| status_code | integer | ✓ |
| request_size_bytes | integer | ✓ |
| response_size_bytes | integer | ✓ |
| error_occurred | boolean | ✓ |
| error_message | text | ✓ |
| rate_limit_remaining | integer | ✓ |
| created_at | timestamp with time zone | ✗ |

### system_config.api_usage_log_2024_01

| Column | Type | Nullable |
|--------|------|----------|
| log_id | bigint | ✗ |
| org_id | uuid | ✓ |
| endpoint | text | ✗ |
| method | text | ✗ |
| user_id | integer | ✓ |
| ip_address | inet | ✓ |
| user_agent | text | ✓ |
| request_timestamp | timestamp with time zone | ✓ |
| response_time_ms | integer | ✓ |
| status_code | integer | ✓ |
| request_size_bytes | integer | ✓ |
| response_size_bytes | integer | ✓ |
| error_occurred | boolean | ✓ |
| error_message | text | ✓ |
| rate_limit_remaining | integer | ✓ |
| created_at | timestamp with time zone | ✗ |

### system_config.api_usage_log_2024_02

| Column | Type | Nullable |
|--------|------|----------|
| log_id | bigint | ✗ |
| org_id | uuid | ✓ |
| endpoint | text | ✗ |
| method | text | ✗ |
| user_id | integer | ✓ |
| ip_address | inet | ✓ |
| user_agent | text | ✓ |
| request_timestamp | timestamp with time zone | ✓ |
| response_time_ms | integer | ✓ |
| status_code | integer | ✓ |
| request_size_bytes | integer | ✓ |
| response_size_bytes | integer | ✓ |
| error_occurred | boolean | ✓ |
| error_message | text | ✓ |
| rate_limit_remaining | integer | ✓ |
| created_at | timestamp with time zone | ✗ |

### system_config.audit_logs

| Column | Type | Nullable |
|--------|------|----------|
| audit_id | bigint | ✗ |
| org_id | uuid | ✗ |
| activity_timestamp | timestamp with time zone | ✓ |
| activity_type | text | ✗ |
| entity_type | text | ✗ |
| entity_id | text | ✓ |
| entity_name | text | ✓ |
| action_performed | text | ✗ |
| old_values | jsonb | ✓ |
| new_values | jsonb | ✓ |
| changed_fields | ARRAY | ✓ |
| user_id | integer | ✗ |
| user_name | text | ✗ |
| session_id | text | ✓ |
| ip_address | inet | ✓ |
| user_agent | text | ✓ |
| request_method | text | ✓ |
| request_url | text | ✓ |
| module_name | text | ✓ |
| function_name | text | ✓ |
| result_status | text | ✓ |
| error_message | text | ✓ |
| execution_time_ms | integer | ✓ |
| previous_audit_hash | text | ✓ |
| current_audit_hash | text | ✓ |

### system_config.backup_history

| Column | Type | Nullable |
|--------|------|----------|
| backup_id | integer | ✗ |
| backup_name | text | ✗ |
| backup_type | text | ✗ |
| backup_path | text | ✓ |
| backup_size | bigint | ✓ |
| backup_status | text | ✓ |
| metadata | jsonb | ✓ |
| created_by | integer | ✓ |
| created_at | timestamp without time zone | ✓ |
| completed_at | timestamp without time zone | ✓ |
| last_verified | timestamp without time zone | ✓ |
| is_valid | boolean | ✓ |

### system_config.configuration_history

| Column | Type | Nullable |
|--------|------|----------|
| history_id | integer | ✗ |
| org_id | integer | ✗ |
| setting_key | text | ✗ |
| old_value | jsonb | ✓ |
| new_value | jsonb | ✓ |
| changed_by | integer | ✓ |
| changed_at | timestamp without time zone | ✓ |
| change_reason | text | ✓ |

### system_config.email_templates

| Column | Type | Nullable |
|--------|------|----------|
| template_id | integer | ✗ |
| org_id | uuid | ✗ |
| template_code | text | ✗ |
| template_name | text | ✗ |
| template_category | text | ✗ |
| subject_template | text | ✗ |
| body_template_html | text | ✗ |
| body_template_text | text | ✓ |
| available_variables | jsonb | ✓ |
| from_name | text | ✓ |
| from_email | text | ✓ |
| reply_to_email | text | ✓ |
| default_attachments | jsonb | ✓ |
| language | text | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### system_config.error_logs

| Column | Type | Nullable |
|--------|------|----------|
| error_id | bigint | ✗ |
| org_id | uuid | ✓ |
| error_timestamp | timestamp with time zone | ✓ |
| error_level | text | ✗ |
| error_code | text | ✓ |
| error_message | text | ✗ |
| module_name | text | ✓ |
| function_name | text | ✓ |
| line_number | integer | ✓ |
| stack_trace | text | ✓ |
| user_id | integer | ✓ |
| session_id | text | ✓ |
| request_id | text | ✓ |
| request_url | text | ✓ |
| request_method | text | ✓ |
| request_params | jsonb | ✓ |
| environment | text | ✓ |
| server_name | text | ✓ |
| error_data | jsonb | ✓ |
| is_resolved | boolean | ✓ |
| resolved_by | integer | ✓ |
| resolved_at | timestamp with time zone | ✓ |
| resolution_notes | text | ✓ |

### system_config.feature_flags

| Column | Type | Nullable |
|--------|------|----------|
| flag_id | integer | ✗ |
| org_id | uuid | ✓ |
| flag_key | text | ✗ |
| flag_name | text | ✗ |
| description | text | ✓ |
| flag_type | text | ✗ |
| default_value | text | ✗ |
| targeting_rules | jsonb | ✓ |
| rollout_percentage | integer | ✓ |
| rollout_strategy | text | ✓ |
| variants | jsonb | ✓ |
| is_active | boolean | ✓ |
| expires_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### system_config.integration_logs

| Column | Type | Nullable |
|--------|------|----------|
| log_id | bigint | ✗ |
| integration_id | integer | ✗ |
| request_timestamp | timestamp with time zone | ✓ |
| endpoint_name | text | ✓ |
| request_method | text | ✓ |
| request_url | text | ✓ |
| request_headers | jsonb | ✓ |
| request_body | jsonb | ✓ |
| response_timestamp | timestamp with time zone | ✓ |
| response_status_code | integer | ✓ |
| response_headers | jsonb | ✓ |
| response_body | jsonb | ✓ |
| response_time_ms | integer | ✓ |
| status | text | ✗ |
| error_message | text | ✓ |
| reference_type | text | ✓ |
| reference_id | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### system_config.job_execution_history

| Column | Type | Nullable |
|--------|------|----------|
| execution_id | integer | ✗ |
| job_id | integer | ✗ |
| start_time | timestamp with time zone | ✗ |
| end_time | timestamp with time zone | ✓ |
| duration_seconds | integer | ✓ |
| execution_status | text | ✗ |
| records_processed | integer | ✓ |
| records_succeeded | integer | ✓ |
| records_failed | integer | ✓ |
| output_log | text | ✓ |
| error_log | text | ✓ |
| cpu_usage_percent | numeric | ✓ |
| memory_usage_mb | integer | ✓ |
| created_at | timestamp with time zone | ✓ |

### system_config.scheduled_jobs

| Column | Type | Nullable |
|--------|------|----------|
| job_id | integer | ✗ |
| org_id | uuid | ✓ |
| job_name | text | ✗ |
| job_type | text | ✗ |
| job_category | text | ✗ |
| schedule_type | text | ✗ |
| cron_expression | text | ✓ |
| next_run_time | timestamp with time zone | ✓ |
| job_function | text | ✗ |
| job_parameters | jsonb | ✓ |
| max_retries | integer | ✓ |
| retry_interval_minutes | integer | ✓ |
| timeout_minutes | integer | ✓ |
| priority | integer | ✓ |
| job_status | text | ✓ |
| last_run_time | timestamp with time zone | ✓ |
| last_run_status | text | ✓ |
| last_run_duration_seconds | integer | ✓ |
| last_error_message | text | ✓ |
| total_runs | integer | ✓ |
| successful_runs | integer | ✓ |
| failed_runs | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### system_config.scheduled_notifications

| Column | Type | Nullable |
|--------|------|----------|
| scheduled_notification_id | integer | ✗ |
| org_id | uuid | ✗ |
| scheduled_for | timestamp with time zone | ✗ |
| notification_type | text | ✗ |
| notification_category | text | ✗ |
| title | text | ✗ |
| message | text | ✗ |
| priority | text | ✓ |
| target_users | ARRAY | ✓ |
| target_roles | ARRAY | ✓ |
| notification_data | jsonb | ✓ |
| status | text | ✓ |
| sent_at | timestamp with time zone | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### system_config.setting_definitions

| Column | Type | Nullable |
|--------|------|----------|
| setting_key | text | ✗ |
| setting_category | text | ✗ |
| setting_type | text | ✗ |
| default_value | jsonb | ✓ |
| description | text | ✓ |
| is_required | boolean | ✓ |
| is_encrypted | boolean | ✓ |
| validation_rules | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp without time zone | ✓ |

### system_config.system_health_metrics

| Column | Type | Nullable |
|--------|------|----------|
| metric_id | integer | ✗ |
| metric_timestamp | timestamp with time zone | ✓ |
| cpu_usage_percent | numeric | ✓ |
| memory_usage_percent | numeric | ✓ |
| disk_usage_percent | numeric | ✓ |
| active_connections | integer | ✓ |
| total_connections | integer | ✓ |
| slow_queries_count | integer | ✓ |
| deadlock_count | integer | ✓ |
| active_users | integer | ✓ |
| requests_per_minute | integer | ✓ |
| average_response_time_ms | integer | ✓ |
| error_rate_percent | numeric | ✓ |
| pending_jobs | integer | ✓ |
| failed_jobs | integer | ✓ |
| cache_hit_rate_percent | numeric | ✓ |
| cache_size_mb | integer | ✓ |
| overall_health_status | text | ✓ |
| alerts_triggered | integer | ✓ |

### system_config.system_integrations

| Column | Type | Nullable |
|--------|------|----------|
| integration_id | integer | ✗ |
| org_id | uuid | ✗ |
| integration_name | text | ✗ |
| integration_type | text | ✗ |
| provider_name | text | ✓ |
| base_url | text | ✓ |
| auth_type | text | ✓ |
| auth_config | jsonb | ✓ |
| connection_config | jsonb | ✓ |
| endpoints | jsonb | ✓ |
| is_active | boolean | ✓ |
| last_test_date | timestamp with time zone | ✓ |
| last_test_status | text | ✓ |
| health_check_url | text | ✓ |
| health_check_interval_minutes | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

### system_config.system_notifications

| Column | Type | Nullable |
|--------|------|----------|
| notification_id | integer | ✗ |
| org_id | uuid | ✗ |
| notification_type | text | ✗ |
| notification_category | text | ✗ |
| title | text | ✗ |
| message | text | ✗ |
| priority | text | ✓ |
| requires_acknowledgment | boolean | ✓ |
| target_audience | text | ✗ |
| target_users | ARRAY | ✓ |
| target_roles | ARRAY | ✓ |
| target_branches | ARRAY | ✓ |
| notification_data | jsonb | ✓ |
| action_url | text | ✓ |
| valid_from | timestamp with time zone | ✓ |
| valid_until | timestamp with time zone | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| created_by | integer | ✓ |

### system_config.system_settings

| Column | Type | Nullable |
|--------|------|----------|
| setting_id | integer | ✗ |
| org_id | uuid | ✓ |
| setting_category | text | ✗ |
| setting_key | text | ✗ |
| setting_name | text | ✗ |
| setting_value | text | ✓ |
| setting_type | text | ✗ |
| default_value | text | ✓ |
| validation_rules | jsonb | ✓ |
| description | text | ✓ |
| help_text | text | ✓ |
| setting_scope | text | ✗ |
| branch_id | integer | ✓ |
| user_id | integer | ✓ |
| ui_component | text | ✓ |
| display_order | integer | ✓ |
| group_name | text | ✓ |
| is_sensitive | boolean | ✓ |
| requires_restart | boolean | ✓ |
| is_active | boolean | ✓ |
| is_editable | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| updated_by | integer | ✓ |

### system_config.user_notifications

| Column | Type | Nullable |
|--------|------|----------|
| user_notification_id | integer | ✗ |
| notification_id | integer | ✗ |
| user_id | integer | ✗ |
| is_read | boolean | ✓ |
| read_at | timestamp with time zone | ✓ |
| is_acknowledged | boolean | ✓ |
| acknowledged_at | timestamp with time zone | ✓ |
| is_dismissed | boolean | ✓ |
| dismissed_at | timestamp with time zone | ✓ |
| delivered_at | timestamp with time zone | ✓ |
| delivery_channel | text | ✓ |
| created_at | timestamp with time zone | ✓ |

### system_config.workflow_definitions

| Column | Type | Nullable |
|--------|------|----------|
| workflow_id | integer | ✗ |
| org_id | uuid | ✗ |
| workflow_code | text | ✗ |
| workflow_name | text | ✗ |
| workflow_type | text | ✗ |
| steps | jsonb | ✗ |
| conditions | jsonb | ✓ |
| escalation_rules | jsonb | ✓ |
| is_active | boolean | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |

### system_config.workflow_instances

| Column | Type | Nullable |
|--------|------|----------|
| instance_id | integer | ✗ |
| workflow_id | integer | ✗ |
| org_id | uuid | ✗ |
| instance_code | text | ✗ |
| reference_type | text | ✗ |
| reference_id | integer | ✗ |
| current_step | integer | ✗ |
| instance_status | text | ✗ |
| approval_history | jsonb | ✓ |
| initiated_at | timestamp with time zone | ✓ |
| completed_at | timestamp with time zone | ✓ |
| sla_deadline | timestamp with time zone | ✓ |
| is_escalated | boolean | ✓ |
| escalation_level | integer | ✓ |
| created_at | timestamp with time zone | ✓ |
| updated_at | timestamp with time zone | ✓ |
| created_by | integer | ✗ |

